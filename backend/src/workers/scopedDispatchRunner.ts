import { processDispatchMessage, DispatchJobResult } from "./dispatch.worker.js";
import { getPrismaClient } from "../config/prisma.js";
import { getWhatsAppDispatchQueue, closeWhatsAppDispatchQueue } from "../queue/whatsapp.queue.js";
import { logger } from "../utils/logger.js";
import { MessageDeliveryStatus, ConsentStatus } from "@prisma/client";

/**
 * Strict immutable allowlist of authorized message IDs.
 * Under live test safety rules, ONLY these exact two messages are permitted.
 * Any other ID causes an immediate hard fail-closed abort.
 */
export const SCOPED_ALLOWED_MESSAGE_IDS = Object.freeze([
  "cmvaxvma10005t86wymevr2li",
  "cmvaxvna00007t86w594ddrst",
] as const);

export interface ScopedDispatchReportItem {
  messageId: string;
  recipientPhoneMasked?: string;
  contactName?: string;
  success: boolean;
  outcome?: string;
  wamid?: string;
  finalStatus?: string;
  error?: string;
}

export interface ScopedDispatchReport {
  totalTargeted: number;
  totalProcessed: number;
  successful: number;
  failed: number;
  results: ScopedDispatchReportItem[];
}

/**
 * Executes a narrowly scoped, one-shot dispatch for the authorized messages only.
 * Reuses the production dispatch pipeline (atomic claim, preflight, Meta send, reconciliation).
 * Does NOT instantiate a shared BullMQ worker, leaving all synthetic jobs untouched.
 */
export async function runScopedDispatch(
  targetMessageIds: readonly string[] = SCOPED_ALLOWED_MESSAGE_IDS
): Promise<ScopedDispatchReport> {
  const allowedSet = new Set<string>(SCOPED_ALLOWED_MESSAGE_IDS);

  logger.info(
    `[ScopedDispatchRunner] Starting scoped dispatch for ${targetMessageIds.length} target message(s)...`
  );

  // 1. Strict Fail-Closed Allowlist Guard
  for (const id of targetMessageIds) {
    if (!allowedSet.has(id)) {
      throw new Error(
        `[SECURITY_VIOLATION] Message ID '${id}' is NOT in the authorized allowlist. Aborting entire scoped dispatch.`
      );
    }
  }

  const prisma = getPrismaClient();
  const report: ScopedDispatchReport = {
    totalTargeted: targetMessageIds.length,
    totalProcessed: 0,
    successful: 0,
    failed: 0,
    results: [],
  };

  try {
    for (const messageId of targetMessageIds) {
      logger.info(`[ScopedDispatchRunner] Evaluating target message: ${messageId}`);

      // 2. Comprehensive Pre-flight Verification immediately before dispatch
      const msg = await prisma.whatsAppMessage.findUnique({
        where: { id: messageId },
        include: {
          campaign: {
            include: {
              organization: true,
            },
          },
          contact: true,
        },
      });

      if (!msg) {
        logger.error(`[ScopedDispatchRunner] Message ${messageId} does not exist in database.`);
        report.failed++;
        report.results.push({ messageId, success: false, error: "MESSAGE_NOT_FOUND" });
        continue;
      }

      const maskedPhone = msg.recipientPhone
        ? `${msg.recipientPhone.slice(0, 5)}...${msg.recipientPhone.slice(-2)}`
        : "unknown";
      const contactName = `${msg.contact?.firstName || ""} ${msg.contact?.lastName || ""}`.trim();

      // Verify database status is strictly QUEUED
      if (msg.status !== MessageDeliveryStatus.QUEUED) {
        logger.error(
          `[ScopedDispatchRunner] Message ${messageId} is in status '${msg.status}', expected 'QUEUED'. Failing closed.`
        );
        report.failed++;
        report.results.push({
          messageId,
          recipientPhoneMasked: maskedPhone,
          contactName,
          success: false,
          error: `INVALID_DB_STATUS_${msg.status}`,
        });
        continue;
      }

      // Verify zero prior attempts and no existing WAMID
      if (msg.attemptCount > 0 || msg.wamid !== null || msg.leaseExpiresAt !== null) {
        logger.error(
          `[ScopedDispatchRunner] Message ${messageId} has prior attempts (${msg.attemptCount}), active lease, or existing WAMID. Failing closed.`
        );
        report.failed++;
        report.results.push({
          messageId,
          recipientPhoneMasked: maskedPhone,
          contactName,
          success: false,
          error: "AMBIGUOUS_EXISTING_DISPATCH_STATE",
        });
        continue;
      }

      // Verify contact consent is strictly OPTED_IN and not suppressed
      if (!msg.contact || msg.contact.consentStatus !== ConsentStatus.OPTED_IN || msg.contact.isSuppressed) {
        logger.error(
          `[ScopedDispatchRunner] Contact for message ${messageId} has consent '${msg.contact?.consentStatus}' or isSuppressed=${msg.contact?.isSuppressed}. Failing closed.`
        );
        report.failed++;
        report.results.push({
          messageId,
          recipientPhoneMasked: maskedPhone,
          contactName,
          success: false,
          error: "CONSENT_OR_SUPPRESSION_VIOLATION",
        });
        continue;
      }

      // 3. Execute via the shared production dispatch pipeline
      logger.info(
        `[ScopedDispatchRunner] Dispatching message ${messageId} to ${maskedPhone} (${contactName}) via production pipeline...`
      );

      const dispatchResult: DispatchJobResult = await processDispatchMessage({
        messageId: msg.id,
        organizationId: msg.organizationId,
        campaignId: msg.campaignId,
        contactId: msg.contactId,
        jobId: `scoped_${msg.id}`,
        workerId: `scoped_runner_${process.pid}`,
      });

      report.totalProcessed++;

      if (dispatchResult.success) {
        report.successful++;
        report.results.push({
          messageId,
          recipientPhoneMasked: maskedPhone,
          contactName,
          success: true,
          wamid: dispatchResult.wamid,
          finalStatus: dispatchResult.finalStatus,
        });
        // Safely remove the target message's waiting BullMQ job after successful dispatch
        try {
          const queue = getWhatsAppDispatchQueue();
          const targetJob = await queue.getJob(`msg_${msg.id}`);
          if (targetJob) {
            await targetJob.remove();
            logger.info(`[ScopedDispatchRunner] Removed BullMQ waiting job msg_${msg.id}`);
          }
        } catch (queueCleanupErr: unknown) {
          logger.warn(
            `[ScopedDispatchRunner] Non-critical: could not remove BullMQ job msg_${msg.id}: ${(queueCleanupErr as Error)?.message}`
          );
        }
      } else {
        report.failed++;
        report.results.push({
          messageId,
          recipientPhoneMasked: maskedPhone,
          contactName,
          success: false,
          outcome: dispatchResult.ambiguous ? "AMBIGUOUS_TIMEOUT" : "FAILED",
          error: dispatchResult.reason || dispatchResult.errorCode || "DISPATCH_FAILED",
        });
      }
    }
  } finally {
    // 4. Safe, guaranteed resource cleanup on both success and error
    try {
      await closeWhatsAppDispatchQueue();
      await prisma.$disconnect();
      logger.info("[ScopedDispatchRunner] Resource cleanup (Redis and Prisma disconnect) completed successfully.");
    } catch (cleanupErr: unknown) {
      logger.warn(`[ScopedDispatchRunner] Error during resource cleanup: ${(cleanupErr as Error)?.message}`);
    }
  }

  logger.info(
    `[ScopedDispatchRunner] Scoped dispatch run complete. Processed: ${report.totalProcessed}, Success: ${report.successful}, Failed: ${report.failed}`
  );

  return report;
}

// Standalone execution entrypoint when executed directly via CLI
if (
  process.argv[1]?.endsWith("scopedDispatchRunner.ts") ||
  process.argv[1]?.endsWith("scopedDispatchRunner.js")
) {
  logger.info("Scoped dispatch runner CLI invoked.");

  runScopedDispatch()
    .then((report) => {
      console.info("\n=== SCOPED DISPATCH REPORT ===");
      console.info(JSON.stringify(report, null, 2));
      process.exit(report.failed > 0 ? 1 : 0);
    })
    .catch((err) => {
      console.error("\n[FATAL] Scoped dispatch runner error:", err);
      process.exit(1);
    });
}
