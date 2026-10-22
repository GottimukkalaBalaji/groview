import crypto from "crypto";
import { MessageDeliveryStatus, Prisma } from "@prisma/client";
import { getPrismaClient } from "../config/prisma.js";
import { logger } from "../utils/logger.js";
import { whatsappTemplateService } from "./whatsappTemplate.service.js";
import { MetaConfigResolver } from "./metaConfigResolver.js";
import {
  evaluateDeliveryTransition,
  DeliveryTransitionInput,
} from "./deliveryStateMachine.js";
import { CampaignLifecycleService } from "./campaignLifecycle.service.js";

// Dedicated namespace for WAMID transaction-scoped advisory locks
export const WAMID_LOCK_NAMESPACE = 42;
// Dedicated namespace for Template ID transaction-scoped advisory locks
export const TEMPLATE_LOCK_NAMESPACE = 43;

// Resilient transaction timeouts to handle network latency with remote database
export const WEBHOOK_TRANSACTION_OPTIONS = { timeout: 25000, maxWait: 15000 };

export interface MetaWebhookStatus {
  id: string; // The WAMID
  status: "accepted" | "sent" | "delivered" | "read" | "failed";
  timestamp: string; // Unix seconds
  recipient_id: string;
  conversation?: {
    id: string;
    origin?: {
      type: string;
    };
    expiration_timestamp?: string;
  };
  pricing?: {
    billable: boolean;
    pricing_model: string;
    category: string;
  };
  errors?: Array<{
    code: number;
    title: string;
    message?: string;
    error_data?: {
      details: string;
    };
  }>;
}

export interface MetaWebhookValue {
  messaging_product: string;
  metadata: {
    display_phone_number: string;
    phone_number_id: string;
  };
  statuses?: MetaWebhookStatus[];
  contacts?: Array<{
    input: string;
    wa_id: string;
  }>;
  messages?: unknown[];
}

export interface MetaTemplateStatusChangeValue {
  event: string;
  message_template_id: number | string;
  message_template_name?: string;
  message_template_language?: string;
  reason?: string;
  message_template_category?: string;
}

export interface MetaWebhookChange {
  value: MetaWebhookValue | MetaTemplateStatusChangeValue;
  field: string;
}

export interface MetaWebhookEntry {
  id: string; // WABA ID
  time?: number;
  changes: MetaWebhookChange[];
}

export interface MetaWebhookPayload {
  object: string;
  entry: MetaWebhookEntry[];
}

/**
 * Validates Meta X-Hub-Signature-256 header using timing-safe comparison.
 */
export function verifyMetaSignature(
  rawBody: Buffer | undefined,
  signatureHeader: string | undefined,
  appSecret: string
): boolean {
  if (!rawBody || !signatureHeader || !appSecret) {
    return false;
  }

  const parts = signatureHeader.split("=");
  if (parts.length !== 2 || parts[0] !== "sha256") {
    return false;
  }

  const providedHash = parts[1];
  const expectedHash = crypto
    .createHmac("sha256", appSecret)
    .update(rawBody)
    .digest("hex");

  try {
    const providedBuffer = Buffer.from(providedHash, "hex");
    const expectedBuffer = Buffer.from(expectedHash, "hex");

    if (providedBuffer.length !== expectedBuffer.length) {
      return false;
    }

    return crypto.timingSafeEqual(providedBuffer, expectedBuffer);
  } catch {
    return false;
  }
}

/**
 * Computes deterministic deduplication hash for an incoming webhook status event.
 */
export function computeWebhookDedupHash(
  wamid: string,
  status: string,
  timestampSeconds: number | string,
  errorCode?: string | number | null
): string {
  const normalizedCode = errorCode ? String(errorCode) : "";
  return crypto
    .createHash("sha256")
    .update(`${wamid}:${status}:${timestampSeconds}:${normalizedCode}`)
    .digest("hex");
}

/**
 * Computes deterministic deduplication hash for an incoming template status update event.
 * If entry.time is absent, buckets by 24-hour epoch day to prevent accidentally collapsing
 * distinct legitimate status transitions across future days.
 */
export function computeTemplateWebhookDedupHash(
  wabaId: string,
  templateId: string,
  event: string,
  reason?: string | null,
  timeSeconds?: number | string | null
): string {
  const normalizedTime =
    timeSeconds !== null && timeSeconds !== undefined && String(timeSeconds).trim() !== ""
      ? String(timeSeconds).trim()
      : "absent";
  const normalizedReason = reason ? String(reason).trim() : "";
  return crypto
    .createHash("sha256")
    .update(`template:${wabaId}:${templateId}:${event}:${normalizedReason}:${normalizedTime}`)
    .digest("hex");
}

/**
 * Losslessly parses a Meta webhook raw body buffer/string into a strongly-typed payload.
 * Quotes bare 64-bit integer template IDs before V8 JSON.parse can round them into 64-bit floats
 * exceeding Number.MAX_SAFE_INTEGER (9007199254740991).
 * Safely handles whitespace, multiple changes, and leaves unrelated keys, pre-quoted strings,
 * and non-target numbers completely untouched.
 */
export function parseLosslessMetaWebhookPayload(rawBody: Buffer | string): MetaWebhookPayload {
  const str = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");
  const losslessStr = str.replace(
    /(^|[,\{\s])"message_template_id"\s*:\s*([0-9]+)(?=[\s,\}])/g,
    '$1"message_template_id": "$2"'
  );
  return JSON.parse(losslessStr) as MetaWebhookPayload;
}

/**
 * Extracts raw template ID as a string directly from the unparsed raw HTTP request buffer/string
 * BEFORE JSON.parse can cause 64-bit float precision loss on numbers exceeding Number.MAX_SAFE_INTEGER.
 * Uses object-level regex bounding to prevent cross-matching across multiple template items.
 */
export function extractRawTemplateId(
  rawBody: Buffer | string | undefined,
  templateName?: string
): string | null {
  if (!rawBody) return null;
  const str = typeof rawBody === "string" ? rawBody : rawBody.toString("utf8");

  if (templateName) {
    const escapedName = templateName.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    // Match specifically within the enclosing JSON object {...} that contains the template name
    const objectRegex = new RegExp(`\\{[^{}]*"message_template_name"\\s*:\\s*"${escapedName}"[^{}]*\\}`, "g");
    const blocks = str.match(objectRegex);
    if (blocks && blocks.length > 0) {
      for (const block of blocks) {
        const idMatch = block.match(/"message_template_id"\s*:\s*"?([0-9]+)"?/);
        if (idMatch) return idMatch[1];
      }
    }
  }

  const match = str.match(/"message_template_id"\s*:\s*"?([0-9]+)"?/);
  return match ? match[1] : null;
}

export class WebhookService {
  /**
   * Ingests a verified Meta webhook payload.
   * Uses transaction-scoped advisory locks to eliminate race conditions with late-WAMID reconciliation.
   */
  public static async ingestWebhookPayload(
    payload: MetaWebhookPayload,
    rawBody?: Buffer | string
  ): Promise<{
    processedCount: number;
    unmatchedCount: number;
    duplicateCount: number;
  }> {
    const prisma = getPrismaClient();
    let processedCount = 0;
    let unmatchedCount = 0;
    let duplicateCount = 0;

    for (const entry of payload.entry) {
      const wabaId = entry.id;
      for (const change of entry.changes) {
        // Dedicated handler for message_template_status_update
        if (change.field === "message_template_status_update") {
          const templateVal = change.value as MetaTemplateStatusChangeValue;
          if (!templateVal || !templateVal.message_template_id || !templateVal.event) {
            continue;
          }

          // Extract exact string ID from raw body before any numeric precision rounding
          const rawTemplateId = extractRawTemplateId(rawBody, templateVal.message_template_name);
          const templateIdStr = rawTemplateId || String(templateVal.message_template_id).trim();
          const event = String(templateVal.event).toUpperCase().trim();
          const reason = templateVal.reason || null;
          const timeSeconds =
            entry.time !== undefined && entry.time !== null ? entry.time : null;
          const eventTimestamp = timeSeconds ? new Date(timeSeconds * 1000) : new Date();

          // 1. Resolve WABA ID to configured trusted organization via MetaConfigResolver
          // Checks database meta_accounts first, then backward-compatible .env fallback for Groviews
          const resolvedWaba = await MetaConfigResolver.getOrganizationForWaba(wabaId);
          const isTrustedWaba = Boolean(resolvedWaba);

          // 2. Resolve organization ownership strictly without arbitrary findFirst fallback
          // Verify that the resolved organization exists, is active, non-archived, and not soft-deleted
          let organizationId: string | null = null;
          if (resolvedWaba?.organizationId) {
            const explicitOrg = await prisma.organization.findUnique({
              where: { id: resolvedWaba.organizationId },
              select: { id: true, isArchived: true, deletedAt: true },
            });
            if (explicitOrg && !explicitOrg.isArchived && !explicitOrg.deletedAt) {
              organizationId = explicitOrg.id;
            }
          }

          const dedupHash = computeTemplateWebhookDedupHash(
            wabaId,
            templateIdStr,
            event,
            reason,
            timeSeconds
          );

          // Deduplication retry replay window for untimestamped events (24 hours)
          const UNTIMESTAMPED_RETRY_WINDOW_MS = 24 * 60 * 60 * 1000;

          // If mapping is ambiguous or absent (untrusted WABA or unconfigured organization),
          // persist safely as unmatched audit event and do NOT mutate any tenant's cache
          if (!isTrustedWaba || !organizationId) {
            const unmatchedReason = !isTrustedWaba
              ? "UNTRUSTED_OR_UNMAPPED_WABA"
              : "ORGANIZATION_MAPPING_ABSENT_OR_AMBIGUOUS";

            logger.warn(
              `WABA ownership mapping is absent or ambiguous (${unmatchedReason}); persisting as unmapped audit event without cache mutation`,
              { wabaId, templateId: templateIdStr }
            );

            await prisma.$transaction(async (tx) => {
              await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TEMPLATE_LOCK_NAMESPACE}::integer, hashtext(${templateIdStr}))`;

              const existingEvent = await tx.webhookEvent.findUnique({
                where: { dedupHash },
              });

              if (existingEvent) {
                // If entry.time was provided, the hash stably identifies this specific event timestamp.
                // Immediate duplicate suppression applies.
                if (timeSeconds !== null && timeSeconds !== undefined) {
                  duplicateCount++;
                  return;
                }

                // If entry.time is absent:
                // 1. Within 24 hours: treat as duplicate retry (avoids uncontrolled duplicate inserts).
                // 2. Beyond 24 hours: update existing audit record timestamp and payload (avoids indefinite false deduplication).
                const ageMs = Date.now() - existingEvent.eventTimestamp.getTime();
                if (ageMs <= UNTIMESTAMPED_RETRY_WINDOW_MS) {
                  duplicateCount++;
                  return;
                }

                await tx.webhookEvent.update({
                  where: { id: existingEvent.id },
                  data: {
                    eventTimestamp,
                    rawPayload: {
                      event,
                      message_template_id: templateIdStr,
                      message_template_name: templateVal.message_template_name || null,
                      message_template_language: templateVal.message_template_language || null,
                      reason,
                      category: templateVal.message_template_category || null,
                      unmatchedReason,
                    },
                    processed: false,
                    processingError: unmatchedReason,
                  },
                });

                unmatchedCount++;
                return;
              }

              const retainedUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
              await tx.webhookEvent.create({
                data: {
                  organizationId: null,
                  wabaId,
                  eventType: "template_status_update",
                  status: event,
                  eventTimestamp,
                  dedupHash,
                  rawPayload: {
                    event,
                    message_template_id: templateIdStr,
                    message_template_name: templateVal.message_template_name || null,
                    message_template_language: templateVal.message_template_language || null,
                    reason,
                    category: templateVal.message_template_category || null,
                    unmatchedReason,
                  },
                  processed: false,
                  processingError: unmatchedReason,
                  retainedUntil,
                },
              });

              unmatchedCount++;
            }, WEBHOOK_TRANSACTION_OPTIONS);

            // STRICT REQUIREMENT: Do NOT mutate any tenant's template cache or status!
            continue;
          }

          // 3. When organization ownership is proven: Advisory lock, transaction, and persistence
          let shouldUpdateCache = false;

          await prisma.$transaction(async (tx) => {
            // Transaction-scoped advisory lock on template ID namespace 43
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${TEMPLATE_LOCK_NAMESPACE}::integer, hashtext(${templateIdStr}))`;

            const existingEvent = await tx.webhookEvent.findUnique({
              where: { dedupHash },
            });

            const sanitizedPayload: Prisma.InputJsonValue = {
              event,
              message_template_id: templateIdStr,
              message_template_name: templateVal.message_template_name || null,
              message_template_language: templateVal.message_template_language || null,
              reason,
              category: templateVal.message_template_category || null,
            };

            if (existingEvent) {
              // If entry.time was provided, the hash stably identifies this specific event timestamp.
              if (timeSeconds !== null && timeSeconds !== undefined) {
                duplicateCount++;
                return;
              }

              // If entry.time is absent:
              // 1. Within 24 hours: treat as duplicate retry (avoids uncontrolled duplicate inserts).
              // 2. Beyond 24 hours: update existing audit record timestamp and payload (avoids indefinite false deduplication).
              const ageMs = Date.now() - existingEvent.eventTimestamp.getTime();
              if (ageMs <= UNTIMESTAMPED_RETRY_WINDOW_MS) {
                duplicateCount++;
                return;
              }

              await tx.webhookEvent.update({
                where: { id: existingEvent.id },
                data: {
                  eventTimestamp,
                  rawPayload: sanitizedPayload,
                  processed: true,
                  processingError: null,
                },
              });

              processedCount++;
              shouldUpdateCache = true;
              return;
            }

            const retainedUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
            await tx.webhookEvent.create({
              data: {
                organizationId,
                wabaId,
                eventType: "template_status_update",
                status: event,
                eventTimestamp,
                dedupHash,
                rawPayload: sanitizedPayload,
                processed: true,
                retainedUntil,
              },
            });

            processedCount++;
            shouldUpdateCache = true;
          }, WEBHOOK_TRANSACTION_OPTIONS);

          // 4. Update in-memory cache and invalidate TTL when a new or refreshed status event applies
          if (shouldUpdateCache && organizationId) {
            whatsappTemplateService.applyTemplateStatusUpdate(templateIdStr, event, organizationId);
          }
          continue;
        }

        if (change.field !== "messages") {
          continue;
        }

        const value = change.value as MetaWebhookValue;
        const phoneNumberId = value.metadata?.phone_number_id;
        const statuses = value.statuses || [];

        for (const statusItem of statuses) {
          const wamid = statusItem.id;
          const status = statusItem.status;
          const timestampSeconds = parseInt(statusItem.timestamp, 10);
          const eventTimestamp = new Date(timestampSeconds * 1000);
          const firstError = statusItem.errors && statusItem.errors.length > 0 ? statusItem.errors[0] : null;
          const errorCode = firstError ? String(firstError.code) : null;
          const errorMessage = firstError
            ? `${firstError.title}${firstError.message ? ": " + firstError.message : ""}`
            : null;

          const dedupHash = computeWebhookDedupHash(wamid, status, timestampSeconds, errorCode);
          let reconciledCampaignId: string | null = null;

          // Execute processing within a transaction utilizing the advisory lock protocol
          await prisma.$transaction(async (tx) => {
            // 1. Acquire transaction-scoped advisory lock on WAMID
            await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAMID_LOCK_NAMESPACE}::integer, hashtext(${wamid}))`;

            // 2. Check deduplication
            const existingEvent = await tx.webhookEvent.findUnique({
              where: { dedupHash },
            });

            if (existingEvent) {
              duplicateCount++;
              return;
            }

            // 3. Look up WhatsAppMessage by WAMID with row lock
            const messageRows = await tx.$queryRaw<
              Array<{
                id: string;
                organizationId: string;
                campaignId: string | null;
                status: MessageDeliveryStatus;
                recipientPhone: string;
                sentAt: Date | null;
                deliveredAt: Date | null;
                readAt: Date | null;
                failedAt: Date | null;
                errorCode: string | null;
                errorMessage: string | null;
              }>
            >`SELECT id, "organizationId", "campaignId", status, "recipientPhone", "sentAt", "deliveredAt", "readAt", "failedAt", "errorCode", "errorMessage"
              FROM whatsapp_messages
              WHERE wamid = ${wamid}
              FOR UPDATE`;

            const message = messageRows.length > 0 ? messageRows[0] : null;

            // Retain audit payload for 90 days
            const retainedUntil = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);

            if (!message) {
              // Message not linked yet: persist as unprocessed unmatched event
              await tx.webhookEvent.create({
                data: {
                  wabaId,
                  phoneNumberId,
                  eventType: "status_update",
                  wamid,
                  status,
                  eventTimestamp,
                  dedupHash,
                  rawPayload: statusItem as unknown as Prisma.InputJsonValue,
                  processed: false,
                  retainedUntil,
                },
              });
              unmatchedCount++;
              return;
            }

            // Message found: verify recipient security cross-check
            if (
              statusItem.recipient_id &&
              !message.recipientPhone.endsWith(statusItem.recipient_id.replace(/\D/g, ""))
            ) {
              logger.warn("Webhook recipient_id does not match message recipientPhone", {
                wamid,
                messageId: message.id,
                webhookRecipient: statusItem.recipient_id,
                recordPhone: message.recipientPhone,
              });
            }

            // 4. Evaluate delivery state machine transition
            const transitionInput: DeliveryTransitionInput = {
              currentStatus: message.status,
              eventStatus: status,
              eventTimestamp,
              existingTimestamps: {
                sentAt: message.sentAt,
                deliveredAt: message.deliveredAt,
                readAt: message.readAt,
                failedAt: message.failedAt,
              },
              errorCode,
              errorMessage,
            };

            const transition = evaluateDeliveryTransition(transitionInput);

            // 5. Update message if transition applies or timestamps backfilled
            if (transition.applied) {
              if (message.campaignId) {
                reconciledCampaignId = message.campaignId;
              }
              const updateData: Prisma.WhatsAppMessageUpdateInput = {};
              if (transition.nextStatus !== message.status) {
                updateData.status = transition.nextStatus;
              }
              if (transition.sentAt && !message.sentAt) {
                updateData.sentAt = transition.sentAt;
              }
              if (transition.deliveredAt && !message.deliveredAt) {
                updateData.deliveredAt = transition.deliveredAt;
              }
              if (transition.readAt && !message.readAt) {
                updateData.readAt = transition.readAt;
              }
              if (transition.failedAt && !message.failedAt) {
                updateData.failedAt = transition.failedAt;
              }
              if (transition.errorCode !== undefined) {
                updateData.errorCode = transition.errorCode;
              }
              if (transition.errorMessage !== undefined) {
                updateData.errorMessage = transition.errorMessage;
              }
              if (transition.isTerminalFailure !== undefined) {
                updateData.isTerminalFailure = transition.isTerminalFailure;
              }

              if (Object.keys(updateData).length > 0) {
                await tx.whatsAppMessage.update({
                  where: { id: message.id },
                  data: updateData,
                });
              }
            }

            // 6. Record webhook event as processed
            await tx.webhookEvent.create({
              data: {
                organizationId: message.organizationId,
                messageId: message.id,
                wabaId,
                phoneNumberId,
                eventType: "status_update",
                wamid,
                status,
                eventTimestamp,
                dedupHash,
                rawPayload: statusItem as unknown as Prisma.InputJsonValue,
                processed: true,
                processingError: transition.applied ? null : transition.reason,
                retainedUntil,
              },
            });

            processedCount++;
          }, WEBHOOK_TRANSACTION_OPTIONS);

          // Trigger campaign lifecycle re-evaluation after transaction commits successfully
          if (reconciledCampaignId) {
            try {
              await CampaignLifecycleService.evaluateCampaignLifecycle(reconciledCampaignId);
            } catch (lifecycleErr) {
              logger.warn(
                `[WebhookService] Failed to evaluate campaign lifecycle for ${reconciledCampaignId}: ${(lifecycleErr as Error)?.message}`
              );
            }
          }
        }
      }
    }

    return { processedCount, unmatchedCount, duplicateCount };
  }

  /**
   * Reconciles a message with its WAMID and applies any unlinked webhook events.
   * Uses identical advisory lock ordering to prevent phantom inserts or deadlocks.
   */
  public static async reconcileLateWamid(
    messageId: string,
    wamid: string
  ): Promise<{
    success: boolean;
    finalStatus: MessageDeliveryStatus;
    reconciledEventsCount: number;
  }> {
    const prisma = getPrismaClient();

    const result = await prisma.$transaction(async (tx) => {
      // 1. Acquire transaction-scoped advisory lock on WAMID (SAME HIERARCHICAL ORDER)
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(${WAMID_LOCK_NAMESPACE}::integer, hashtext(${wamid}))`;

      // 2. Lock the message row
      const messageRows = await tx.$queryRaw<
        Array<{
          id: string;
          organizationId: string;
          campaignId: string | null;
          status: MessageDeliveryStatus;
          wamid: string | null;
          sentAt: Date | null;
          deliveredAt: Date | null;
          readAt: Date | null;
          failedAt: Date | null;
          errorCode: string | null;
          errorMessage: string | null;
        }>
      >`SELECT id, "organizationId", "campaignId", status, wamid, "sentAt", "deliveredAt", "readAt", "failedAt", "errorCode", "errorMessage"
        FROM whatsapp_messages
        WHERE id = ${messageId}
        FOR UPDATE`;

      if (messageRows.length === 0) {
        throw new Error(`Message ${messageId} not found during late WAMID reconciliation.`);
      }

      const message = messageRows[0];

      // 3. Collision check: Does another message already own this WAMID?
      const existingOwner = await tx.whatsAppMessage.findFirst({
        where: { wamid, NOT: { id: messageId } },
      });

      if (existingOwner) {
        logger.error("Unique WAMID collision detected during reconciliation", {
          wamid,
          targetMessageId: messageId,
          existingOwnerId: existingOwner.id,
        });

        await tx.whatsAppMessage.update({
          where: { id: messageId },
          data: {
            status: MessageDeliveryStatus.FAILED,
            errorCode: "WAMID_COLLISION",
            errorMessage: `WAMID collision: already assigned to message ${existingOwner.id}`,
            isTerminalFailure: true,
            failedAt: new Date(),
          },
        });

        return {
          success: false,
          finalStatus: MessageDeliveryStatus.FAILED,
          reconciledEventsCount: 0,
          campaignId: message.campaignId,
        };
      }

      // Link WAMID to message if not already set
      if (!message.wamid) {
        await tx.whatsAppMessage.update({
          where: { id: messageId },
          data: {
            wamid,
            status:
              message.status === MessageDeliveryStatus.QUEUED ||
              message.status === MessageDeliveryStatus.SENDING ||
              message.status === MessageDeliveryStatus.SUBMITTED_UNCONFIRMED
                ? MessageDeliveryStatus.ACCEPTED
                : message.status,
          },
        });
      }

      // 4. Fetch all pending unlinked webhook events for this WAMID in strict chronological order
      const pendingEvents = await tx.$queryRaw<
        Array<{
          id: string;
          status: string;
          eventTimestamp: Date;
          rawPayload: unknown;
        }>
      >`SELECT id, status, "eventTimestamp", "rawPayload"
        FROM webhook_events
        WHERE wamid = ${wamid} AND processed = false
        ORDER BY "eventTimestamp" ASC,
          CASE status
            WHEN 'accepted' THEN 1
            WHEN 'sent' THEN 2
            WHEN 'failed' THEN 3
            WHEN 'delivered' THEN 4
            WHEN 'read' THEN 5
            ELSE 0
          END ASC,
          "createdAt" ASC
        FOR UPDATE`;

      let currentStatus: MessageDeliveryStatus =
        message.status === MessageDeliveryStatus.QUEUED ||
        message.status === MessageDeliveryStatus.SENDING ||
        message.status === MessageDeliveryStatus.SUBMITTED_UNCONFIRMED
          ? MessageDeliveryStatus.ACCEPTED
          : message.status;

      let sentAt = message.sentAt;
      let deliveredAt = message.deliveredAt;
      let readAt = message.readAt;
      let failedAt = message.failedAt;
      let errorCode = message.errorCode;
      let errorMessage = message.errorMessage;
      let isTerminalFailure = false;

      // 5. Sequentially evaluate each unlinked event against delivery state machine
      for (const event of pendingEvents) {
        const transition = evaluateDeliveryTransition({
          currentStatus,
          eventStatus: event.status as "accepted" | "sent" | "delivered" | "read" | "failed",
          eventTimestamp: event.eventTimestamp,
          existingTimestamps: { sentAt, deliveredAt, readAt, failedAt },
        });

        if (transition.applied) {
          currentStatus = transition.nextStatus;
          if (transition.sentAt && !sentAt) sentAt = transition.sentAt;
          if (transition.deliveredAt && !deliveredAt) deliveredAt = transition.deliveredAt;
          if (transition.readAt && !readAt) readAt = transition.readAt;
          if (transition.failedAt && !failedAt) failedAt = transition.failedAt;
          if (transition.errorCode !== undefined) errorCode = transition.errorCode;
          if (transition.errorMessage !== undefined) errorMessage = transition.errorMessage;
          if (transition.isTerminalFailure !== undefined) {
            isTerminalFailure = transition.isTerminalFailure;
          }
        }

        // Mark individual event processed with link to message
        await tx.webhookEvent.update({
          where: { id: event.id },
          data: {
            processed: true,
            messageId,
            organizationId: message.organizationId,
            processingError: transition.applied ? null : transition.reason,
          },
        });
      }

      // 6. Apply final calculated state to WhatsAppMessage
      await tx.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: currentStatus,
          sentAt,
          deliveredAt,
          readAt,
          failedAt,
          errorCode,
          errorMessage,
          isTerminalFailure,
        },
      });

      return {
        success: true,
        finalStatus: currentStatus,
        reconciledEventsCount: pendingEvents.length,
        campaignId: message.campaignId,
      };
    }, WEBHOOK_TRANSACTION_OPTIONS);

    if (result.success && result.campaignId) {
      try {
        await CampaignLifecycleService.evaluateCampaignLifecycle(result.campaignId);
      } catch (err: unknown) {
        logger.warn(
          `[WebhookService] Failed to evaluate campaign lifecycle after late WAMID reconciliation for campaign ${result.campaignId}: ${(err as Error)?.message}`
        );
      }
    }

    return {
      success: result.success,
      finalStatus: result.finalStatus,
      reconciledEventsCount: result.reconciledEventsCount,
    };
  }

  /**
   * Durable recovery sweeper for orphaned unmatched webhook events.
   */
  public static async reconcileOrphanedWebhooks(): Promise<number> {
    const prisma = getPrismaClient();

    const staleWamids = await prisma.$queryRaw<Array<{ wamid: string }>>`
      SELECT DISTINCT we.wamid
      FROM webhook_events we
      INNER JOIN whatsapp_messages wm ON wm.wamid = we.wamid
      WHERE we.processed = false
        AND we.wamid IS NOT NULL
        AND we."createdAt" < NOW() - INTERVAL '30 seconds'
      LIMIT 100
    `;

    let reconciledCount = 0;
    for (const { wamid } of staleWamids) {
      const message = await prisma.whatsAppMessage.findUnique({
        where: { wamid },
      });
      if (message) {
        await WebhookService.reconcileLateWamid(message.id, wamid);
        reconciledCount++;
      }
    }

    return reconciledCount;
  }
}
