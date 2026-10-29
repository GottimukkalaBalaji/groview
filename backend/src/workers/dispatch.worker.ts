import crypto from "crypto";
import { Worker, Job, DelayedError } from "bullmq";
import { MessageDeliveryStatus, CampaignStatus } from "@prisma/client";
import { getBullMQRedisOptions, isRedisConfigured } from "../config/redis.js";
import { getPrismaClient } from "../config/prisma.js";
import { logger } from "../utils/logger.js";
import {
  WHATSAPP_DISPATCH_QUEUE_NAME,
  WhatsAppDispatchJobData,
} from "../queue/whatsapp.queue.js";
import { WhatsAppSendService } from "../services/whatsappSend.service.js";
import { WebhookService } from "../services/webhook.service.js";
import { MetaConfigResolver } from "../services/metaConfigResolver.js";
import { CampaignLifecycleService } from "../services/campaignLifecycle.service.js";
import { AppError } from "../utils/errors.js";

export interface ProcessDispatchMessageInput {
  messageId: string;
  organizationId: string;
  campaignId?: string | null;
  contactId?: string | null;
  jobId?: string;
  workerId?: string;
  job?: Job<WhatsAppDispatchJobData>;
  token?: string;
  dispatchRun?: number;
  scheduledAt?: string | Date | null;
}

export interface DispatchJobResult {
  success: boolean;
  skipped?: boolean;
  fenced?: boolean;
  reconciled?: boolean;
  ambiguous?: boolean;
  terminal?: boolean;
  reason?: string;
  errorCode?: string;
  finalStatus?: MessageDeliveryStatus;
  status?: MessageDeliveryStatus;
  wamid?: string;
  reconciledEvents?: number;
}

/**
 * Core atomic dispatch pipeline: Claims message lease, performs preflight validation,
 * resolves tenant Meta credentials, executes Graph API send, and reconciles state.
 * Reused by both shared BullMQ worker and scoped dispatch runners.
 */
export async function processDispatchMessage(
  input: ProcessDispatchMessageInput
): Promise<DispatchJobResult> {
  const { messageId, organizationId, campaignId, contactId, token } = input;
  const workerId =
    input.workerId || `worker_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
  const prisma = getPrismaClient();

  logger.info(`[${workerId}] Processing dispatch message ${messageId} (job: ${input.jobId || "direct"})`);

  // 0. Campaign Scheduled-Time & Cancellation Guard:
  // Strictly prevent early dispatch before scheduledAt and abort cancelled/completed campaigns
  if (campaignId) {
    let campaign: any = null;
    try {
      campaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId },
        select: { id: true, status: true, scheduledAt: true, approvalStatus: true, dispatchRun: true } as any,
      });
    } catch (err) {
      logger.warn(`[${workerId}] Failed to query campaign ${campaignId} for schedule check: ${(err as Error).message}`);
    }

    if (campaign) {
      if (campaign.status === "CANCELLED" || campaign.status === "COMPLETED") {
        logger.warn(
          `[${workerId}] Campaign ${campaignId} is in terminal/cancelled status (${campaign.status}). Skipping dispatch.`
        );
        return { success: false, skipped: true, reason: `CAMPAIGN_${campaign.status}` };
      }

      // Check approval status for scheduled campaigns
      const isApprovalExempt =
        !campaign.scheduledAt &&
        ((campaign as any).approvalStatus === "NOT_REQUIRED" || !(campaign as any).approvalStatus);

      if (!isApprovalExempt && (campaign as any).approvalStatus !== "APPROVED") {
        logger.warn(
          `[${workerId}] Campaign ${campaignId} is not approved for dispatch (${(campaign as any).approvalStatus}). Discarding delayed job.`
        );
        await prisma.whatsAppMessage.updateMany({
          where: { id: messageId, status: MessageDeliveryStatus.QUEUED },
          data: {
            status: MessageDeliveryStatus.FAILED,
            errorCode: "CAMPAIGN_NOT_APPROVED",
            errorMessage: `Dispatch blocked: Campaign approval status is ${(campaign as any).approvalStatus || "PENDING"}`,
            isTerminalFailure: true,
            failedAt: new Date(),
          },
        });
        if (campaignId) {
          await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
        }
        return { success: false, skipped: true, reason: "CAMPAIGN_NOT_APPROVED" };
      }

      // Check revision / dispatchRun integrity:
      if (input.dispatchRun && (campaign as any).dispatchRun && input.dispatchRun !== (campaign as any).dispatchRun) {
        logger.warn(
          `[${workerId}] Stale job revision mismatch: job run ${input.dispatchRun} does not match campaign run ${(campaign as any).dispatchRun}. Discarding stale job.`
        );
        await prisma.whatsAppMessage.updateMany({
          where: { id: messageId, status: MessageDeliveryStatus.QUEUED },
          data: {
            status: MessageDeliveryStatus.FAILED,
            errorCode: "STALE_JOB_REVISION_MISMATCH",
            errorMessage: `Job revision (${input.dispatchRun}) does not match current approved campaign revision (${(campaign as any).dispatchRun})`,
            isTerminalFailure: true,
            failedAt: new Date(),
          },
        });
        if (campaignId) {
          await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
        }
        return { success: false, skipped: true, reason: "STALE_JOB_REVISION_MISMATCH" };
      }

      // Check schedule timestamp integrity:
      if (
        input.scheduledAt &&
        campaign.scheduledAt &&
        new Date(input.scheduledAt).getTime() !== new Date(campaign.scheduledAt).getTime()
      ) {
        logger.warn(
          `[${workerId}] Stale job schedule mismatch: job scheduledAt ${input.scheduledAt} does not match campaign ${campaign.scheduledAt.toISOString()}. Discarding stale job.`
        );
        await prisma.whatsAppMessage.updateMany({
          where: { id: messageId, status: MessageDeliveryStatus.QUEUED },
          data: {
            status: MessageDeliveryStatus.FAILED,
            errorCode: "STALE_JOB_SCHEDULE_MISMATCH",
            errorMessage: "Job scheduled time does not match current approved campaign schedule",
            isTerminalFailure: true,
            failedAt: new Date(),
          },
        });
        if (campaignId) {
          await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
        }
        return { success: false, skipped: true, reason: "STALE_JOB_SCHEDULE_MISMATCH" };
      }

      if (campaign.scheduledAt) {
        const scheduledTime = new Date(campaign.scheduledAt).getTime();
        const now = Date.now();
        const earlyDiff = scheduledTime - now;

        if (earlyDiff > 0) {
          if (earlyDiff <= 3000) {
            logger.info(
              `[${workerId}] Message ${messageId} arrived ${earlyDiff}ms early before scheduledAt. Awaiting exact scheduled second.`
            );
            await new Promise((resolve) => setTimeout(resolve, earlyDiff));
          } else {
            logger.warn(
              `[${workerId}] Message ${messageId} arrived ${earlyDiff}ms early before scheduledAt (${campaign.scheduledAt.toISOString()}). Deferring BullMQ job.`
            );
            if (input.job && typeof input.job.moveToDelayed === "function") {
              try {
                await input.job.moveToDelayed(scheduledTime, token);
                throw new DelayedError();
              } catch (err) {
                if (err instanceof DelayedError) throw err;
                logger.warn(`[${workerId}] Failed to moveToDelayed: ${(err as Error).message}`);
              }
            }
            return {
              success: false,
              skipped: true,
              reason: "DEFERRED_UNTIL_SCHEDULED_TIME",
            };
          }
        }
      }
    }
  }

  // 1. Atomic Lease Claim: Guard against dual-dispatch or expired worker takeover
  // If status was QUEUED -> transition to SENDING and proceed to dispatch
  // If status was SENDING -> worker crashed mid-flight; fence to SUBMITTED_UNCONFIRMED to prevent duplicate external dispatch
  const claimedRows = await prisma.$queryRaw<
    Array<{
      id: string;
      status: MessageDeliveryStatus;
      wamid: string | null;
      recipientPhone: string;
      templateName: string;
      templateLanguage: string;
      parameters: Record<string, unknown>;
      attemptCount: number;
    }>
  >`UPDATE whatsapp_messages
    SET status = CASE 
          WHEN status = 'QUEUED' THEN 'SENDING'::"MessageDeliveryStatus"
          ELSE 'SUBMITTED_UNCONFIRMED'::"MessageDeliveryStatus"
        END,
        "errorCode" = CASE
          WHEN status = 'SENDING' THEN 'CRASH_RECOVERY'
          ELSE "errorCode"
        END,
        "errorMessage" = CASE
          WHEN status = 'SENDING' THEN 'Worker lease expired while in SENDING status; fenced to SUBMITTED_UNCONFIRMED to prevent duplicate external dispatch'
          ELSE "errorMessage"
        END,
        "workerId" = ${workerId},
        "leaseExpiresAt" = NOW() + INTERVAL '45 seconds',
        "attemptCount" = "attemptCount" + 1,
        "lastAttemptAt" = NOW(),
        "updatedAt" = NOW()
    WHERE id = ${messageId}
      AND (
        status = 'QUEUED'
        OR (status = 'SENDING' AND "leaseExpiresAt" < NOW())
      )
    RETURNING id, status, wamid, "recipientPhone", "templateName", "templateLanguage", parameters, "attemptCount"`;

  if (claimedRows.length === 0) {
    logger.warn(
      `[${workerId}] Message ${messageId} could not be claimed (already processing or terminal state). Skipping.`
    );
    return { success: false, skipped: true, reason: "NOT_CLAIMABLE" };
  }

  const claimedMessage = claimedRows[0];

  // 1b. Concurrency-safe transition of Campaign from QUEUED to SENDING on first message claim
  if (campaignId) {
    await CampaignLifecycleService.markCampaignSendingIfClaimed(campaignId);
  }

  // If message was recovered from a stale SENDING state, it was already potentially received by Meta.
  // Do NOT issue a blind second external send!
  if (claimedMessage.status === MessageDeliveryStatus.SUBMITTED_UNCONFIRMED) {
    logger.warn(
      `[${workerId}] Stale SENDING message ${messageId} recovered after lease expiry. Fenced to SUBMITTED_UNCONFIRMED to prevent blind duplicate external dispatch.`
    );

    if (claimedMessage.wamid) {
      const reconciliation = await WebhookService.reconcileLateWamid(
        messageId,
        claimedMessage.wamid
      );
      if (campaignId) {
        await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
      }
      return {
        success: true,
        fenced: true,
        reconciled: true,
        finalStatus: reconciliation.finalStatus,
      };
    }

    if (campaignId) {
      await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
    }
    return {
      success: false,
      fenced: true,
      status: MessageDeliveryStatus.SUBMITTED_UNCONFIRMED,
      reason: "FENCED_AGAINST_DUPLICATE_SEND",
    };
  }

  // 2. Preflight Check: Tenant, Campaign, Consent, Suppression
  const preflight = await WhatsAppSendService.validatePreflight({
    organizationId,
    recipientPhone: claimedMessage.recipientPhone,
    campaignId,
    contactId,
  });

  if (!preflight.valid) {
    logger.warn(
      `[${workerId}] Preflight failed for message ${messageId}: ${preflight.rejectReason}`
    );

    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: MessageDeliveryStatus.FAILED,
        errorCode: preflight.errorCode || "PREFLIGHT_FAILED",
        errorMessage: preflight.rejectReason || "Preflight validation failed",
        isTerminalFailure: true,
        failedAt: new Date(),
      },
    });

    if (campaignId) {
      await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
    }
    return { success: false, reason: preflight.rejectReason };
  }

  // 3. Resolve effective Meta configuration (platform account in SHARED mode, dedicated in DEDICATED mode)
  let metaConfig;
  try {
    metaConfig = await MetaConfigResolver.resolveOutboundConfig(organizationId);
  } catch (metaErr: unknown) {
    const msg = metaErr instanceof Error ? metaErr.message : "Meta configuration unavailable";
    const errCode = (metaErr as AppError)?.code || "META_CONFIG_UNAVAILABLE";
    logger.error(
      `[${workerId}] Meta configuration resolution failed for organization ${organizationId}: ${msg} (${errCode})`
    );

    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: MessageDeliveryStatus.FAILED,
        errorCode: errCode,
        errorMessage: msg,
        isTerminalFailure: true,
        failedAt: new Date(),
      },
    });

    if (campaignId) {
      await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
    }
    return { success: false, terminal: true, reason: msg, errorCode: errCode };
  }

  // 3b. Final Cancellation & Terminal Status Interlock Gate immediately before external Meta send
  if (campaignId) {
    let latestCampaign = null;
    try {
      latestCampaign = await prisma.campaign.findFirst({
        where: { id: campaignId, organizationId },
        select: { status: true },
      });
    } catch (err) {
      logger.warn(`[${workerId}] Failed to verify latest campaign status for ${campaignId}: ${(err as Error).message}`);
    }

    if (
      latestCampaign?.status === CampaignStatus.CANCELLED ||
      latestCampaign?.status === CampaignStatus.COMPLETED ||
      latestCampaign?.status === CampaignStatus.FAILED
    ) {
      logger.warn(
        `[${workerId}] Campaign ${campaignId} transitioned to terminal status (${latestCampaign.status}) before external dispatch for message ${messageId}. Aborting external send.`
      );

      await prisma.whatsAppMessage.update({
        where: { id: messageId },
        data: {
          status: MessageDeliveryStatus.FAILED,
          errorCode: "CAMPAIGN_CANCELLED",
          errorMessage: `Campaign was marked ${latestCampaign.status} before external dispatch`,
          isTerminalFailure: true,
          failedAt: new Date(),
        },
      });

      await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
      return { success: false, skipped: true, reason: `CAMPAIGN_${latestCampaign.status}` };
    }
  }

  // Also verify this specific message row was not terminated concurrently by cancellation
  let currentMsg = null;
  try {
    currentMsg = await prisma.whatsAppMessage.findUnique({
      where: { id: messageId },
      select: { status: true },
    });
  } catch (err) {
    logger.warn(`[${workerId}] Failed to verify message ${messageId} status before send: ${(err as Error).message}`);
  }

  if (currentMsg && currentMsg.status !== MessageDeliveryStatus.SENDING) {
    logger.warn(
      `[${workerId}] Message ${messageId} is in status '${currentMsg.status}' (not SENDING) before Meta dispatch. Aborting external send.`
    );
    return { success: false, skipped: true, reason: `MESSAGE_STATUS_${currentMsg.status}` };
  }

  // 4. Dispatch to Meta Graph API using resolved tenant credentials
  const dispatchResult = await WhatsAppSendService.executeMetaSend({
    recipientPhone: claimedMessage.recipientPhone,
    templateName: claimedMessage.templateName,
    templateLanguage: claimedMessage.templateLanguage,
    parameters: claimedMessage.parameters || {},
    metaConfigOverride: {
      accessToken: metaConfig.accessToken,
      phoneNumberId: metaConfig.phoneNumberId,
      graphApiVersion: metaConfig.graphApiVersion,
    },
  });

  // 5. Handle Outcome
  if (dispatchResult.outcome === "SUCCESS") {
    logger.info(
      `[${workerId}] Meta accepted message ${messageId} with WAMID ${dispatchResult.wamid}`
    );

    // Reconcile WAMID and any pending webhook events transactionally under advisory lock
    const reconciliation = await WebhookService.reconcileLateWamid(
      messageId,
      dispatchResult.wamid
    );

    if (campaignId) {
      await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
    }
    return {
      success: true,
      wamid: dispatchResult.wamid,
      finalStatus: reconciliation.finalStatus,
      reconciledEvents: reconciliation.reconciledEventsCount,
    };
  }

  if (dispatchResult.outcome === "AMBIGUOUS_TIMEOUT") {
    // Crucial safety rule: Never automatically resend ambiguous timeouts!
    logger.warn(
      `[${workerId}] Ambiguous timeout for message ${messageId}: ${dispatchResult.errorMessage}. Transitioning to SUBMITTED_UNCONFIRMED.`
    );

    await prisma.whatsAppMessage.update({
      where: { id: messageId },
      data: {
        status: MessageDeliveryStatus.SUBMITTED_UNCONFIRMED,
        errorCode: dispatchResult.errorCode,
        errorMessage: dispatchResult.errorMessage,
      },
    });

    if (campaignId) {
      await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
    }
    // Complete job safely without throwing so BullMQ does NOT trigger automatic retry
    return {
      success: false,
      ambiguous: true,
      status: MessageDeliveryStatus.SUBMITTED_UNCONFIRMED,
    };
  }

  // Terminal 4xx or Client Error
  logger.error(
    `[${workerId}] Terminal dispatch error for message ${messageId}: ${dispatchResult.errorMessage}`
  );

  await prisma.whatsAppMessage.update({
    where: { id: messageId },
    data: {
      status: MessageDeliveryStatus.FAILED,
      errorCode: dispatchResult.errorCode,
      errorMessage: dispatchResult.errorMessage,
      isTerminalFailure: true,
      failedAt: new Date(),
    },
  });

  if (campaignId) {
    await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
  }
  return {
    success: false,
    terminal: true,
    status: MessageDeliveryStatus.FAILED,
  };
}

export function createDispatchWorker(customWorkerId?: string): Worker<WhatsAppDispatchJobData> {
  if (!isRedisConfigured()) {
    throw new Error("Cannot start dispatch worker: REDIS_URL is not configured.");
  }

  const workerId =
    customWorkerId || `worker_${process.pid}_${crypto.randomBytes(4).toString("hex")}`;
  const redisOptions = getBullMQRedisOptions();
  const redisUrl = process.env.REDIS_URL!;

  const worker = new Worker<WhatsAppDispatchJobData>(
    WHATSAPP_DISPATCH_QUEUE_NAME,
    async (job: Job<WhatsAppDispatchJobData>, token?: string) => {
      return processDispatchMessage({
        messageId: job.data.messageId,
        organizationId: job.data.organizationId,
        campaignId: job.data.campaignId,
        contactId: job.data.contactId,
        jobId: job.id,
        workerId,
        job,
        token,
        dispatchRun: (job.data as any).dispatchRun,
        scheduledAt: (job.data as any).scheduledAt,
      });
    },
    {
      connection: {
        ...redisOptions,
        url: redisUrl,
      },
      concurrency: 1, // Single worker concurrency for sequential safety
      limiter: {
        max: 5,
        duration: 1000, // Conservative 5 msgs/sec rate limit to protect Upstash commands
      },
    }
  );

  worker.on("completed", (job) => {
    logger.info(`[${workerId}] Completed job ${job.id}`);
  });

  worker.on("failed", (job, err) => {
    logger.error(`[${workerId}] Job ${job?.id} failed with error: ${err.message}`);
  });

  worker.on("error", (err) => {
    logger.error(`[${workerId}] BullMQ worker error event: ${err.message}`);
  });

  return worker;
}

// Standalone execution entrypoint
if (process.argv[1]?.endsWith("dispatch.worker.ts") || process.argv[1]?.endsWith("dispatch.worker.js")) {
  logger.info("Starting WhatsApp dispatch worker standalone process...");

  const worker = createDispatchWorker();

  const shutdown = async (signal: string) => {
    logger.info(`Received ${signal}. Shutting down dispatch worker...`);
    await worker.close();
    logger.info("Dispatch worker shut down successfully.");
    process.exit(0);
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}
