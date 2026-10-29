import { Queue, QueueEvents, Job } from "bullmq";
import { MessageDeliveryStatus } from "@prisma/client";
import { getBullMQRedisOptions, isRedisConfigured } from "../config/redis.js";
import { logger } from "../utils/logger.js";

export const WHATSAPP_DISPATCH_QUEUE_NAME = "whatsapp-dispatch";

export interface WhatsAppDispatchJobData {
  messageId: string;
  organizationId: string;
  recipientPhone: string;
  templateName: string;
  templateLanguage: string;
  parameters: Record<string, unknown>;
  campaignId?: string | null;
  contactId?: string | null;
  clientRequestId?: string | null;
  dispatchRun?: number;
  scheduledAt?: string | null;
}

export interface EnqueueDispatchOptions {
  delay?: number;
}

let whatsappQueueInstance: Queue<WhatsAppDispatchJobData> | null = null;
let whatsappQueueEventsInstance: QueueEvents | null = null;

/**
 * Sets the WhatsApp dispatch queue instance for testing purposes.
 */
export function setWhatsAppDispatchQueueForTest(
  queue: Queue<WhatsAppDispatchJobData> | null
): void {
  whatsappQueueInstance = queue;
}

/**
 * Returns or initializes the BullMQ queue for WhatsApp message dispatches.
 */
export function getWhatsAppDispatchQueue(): Queue<WhatsAppDispatchJobData> {
  if (whatsappQueueInstance) {
    return whatsappQueueInstance;
  }

  if (!isRedisConfigured()) {
    throw new Error(
      "Cannot initialize WhatsApp dispatch queue: REDIS_URL is not configured."
    );
  }

  const redisOptions = getBullMQRedisOptions();
  const redisUrl = process.env.REDIS_URL!;

  whatsappQueueInstance = new Queue<WhatsAppDispatchJobData>(
    WHATSAPP_DISPATCH_QUEUE_NAME,
    {
        connection: {
          ...redisOptions,
          url: redisUrl,
        },
        defaultJobOptions: {
          attempts: 3,
          backoff: {
            type: "exponential",
            delay: 2000,
          },
          removeOnComplete: 1000,
          removeOnFail: 5000,
        },
      }
    );

    whatsappQueueInstance.on("error", (err) => {
      logger.error("WhatsApp dispatch queue error", err);
    });

  return whatsappQueueInstance;
}

export interface EnqueueDispatchResult {
  job: Job<WhatsAppDispatchJobData>;
  alreadyExisted: boolean;
}

/**
 * Retrieves an existing dispatch job by messageId from BullMQ queue, if present.
 */
export async function getWhatsAppDispatchJob(
  messageId: string
): Promise<Job<WhatsAppDispatchJobData> | undefined> {
  if (!whatsappQueueInstance && !isRedisConfigured()) {
    return undefined;
  }
  const queue = getWhatsAppDispatchQueue();
  const jobId = `msg_${messageId}`;
  const job = await queue.getJob(jobId);
  return job ?? undefined;
}

/**
 * Enqueues a WhatsApp dispatch job with deterministic jobId to prevent duplicate enqueueing.
 * Checks for existing job in BullMQ to accurately report whether job was newly enqueued or already present.
 */
export async function enqueueWhatsAppDispatchJob(
  jobData: WhatsAppDispatchJobData,
  options?: EnqueueDispatchOptions
): Promise<EnqueueDispatchResult> {
  const queue = getWhatsAppDispatchQueue();

  // Deterministic job ID guarantees BullMQ deduplication if enqueued multiple times
  const jobId = `msg_${jobData.messageId}`;

  const existing = await queue.getJob(jobId);
  if (existing) {
    logger.info(`WhatsApp dispatch job ${jobId} already exists in queue. Skipping duplicate add.`);
    return { job: existing, alreadyExisted: true };
  }

  const job = await queue.add("dispatch", jobData, {
    jobId,
    ...(options?.delay && options.delay > 0 ? { delay: options.delay } : {}),
  });

  logger.info(
    `Enqueued WhatsApp dispatch job ${job.id} for message ${jobData.messageId}${
      options?.delay && options.delay > 0 ? ` (delayed by ${options.delay}ms)` : ""
    }`
  );
  return { job, alreadyExisted: false };
}

/**
 * Removes a pending or delayed WhatsApp dispatch job from BullMQ queue, if present.
 */
export async function removeWhatsAppDispatchJob(messageId: string): Promise<boolean> {
  if (!whatsappQueueInstance && !isRedisConfigured()) {
    return false;
  }
  try {
    const job = await getWhatsAppDispatchJob(messageId);
    if (job) {
      await job.remove();
      logger.info(`Removed BullMQ dispatch job msg_${messageId}`);
      return true;
    }
  } catch (err) {
    logger.warn(`Failed to remove BullMQ dispatch job msg_${messageId}: ${(err as Error)?.message}`);
  }
  return false;
}

export interface SafeRecoverJobParams {
  jobData: WhatsAppDispatchJobData;
  dbMessage: {
    id: string;
    status: MessageDeliveryStatus;
    wamid?: string | null;
    attemptCount?: number;
    leaseExpiresAt?: Date | null;
  };
  queueOverride?: unknown;
}

export type DispatchRecoveryStatus =
  | "newly_enqueued"
  | "already_waiting"
  | "already_active"
  | "already_completed"
  | "retried_failed"
  | "ambiguous"
  | "ineligible_status";

export interface SafeRecoverJobResult {
  status: DispatchRecoveryStatus;
  jobId: string;
  job?: Job<WhatsAppDispatchJobData>;
  reason?: string;
}

/**
 * Inspects existing BullMQ job state and PostgreSQL message state before performing any recovery.
 *
 * Safety guarantees:
 * 1. Only messages whose PostgreSQL state is safely QUEUED are considered for recovery.
 * 2. If the message in DB has attemptCount > 0, an active lease, or a wamid, outcome is ambiguous -> fail closed.
 * 3. Inspects existing BullMQ job state (waiting, active, delayed, completed, failed):
 *    - waiting / delayed: already queued, do not duplicate.
 *    - active: worker is processing, do not touch.
 *    - completed: worker finished, do not retry.
 *    - failed: only retry (job.retry()) if DB state is strictly confirmed as QUEUED with 0 attempts and no external submission.
 *    - missing: add with deterministic jobId.
 */
export async function inspectAndRecoverDispatchJob(
  params: SafeRecoverJobParams
): Promise<SafeRecoverJobResult> {
  const { jobData, dbMessage, queueOverride } = params;
  const jobId = `msg_${jobData.messageId}`;

  // 1. Reconcile with DB state: strictly never recover non-QUEUED messages
  if (dbMessage.status !== MessageDeliveryStatus.QUEUED) {
    return {
      status: "ineligible_status",
      jobId,
      reason: `Message status is '${dbMessage.status}'; only QUEUED messages are eligible for queue recovery.`,
    };
  }

  // 2. Safeguard against ambiguous dispatch states:
  // If wamid exists or attemptCount > 0 or leaseExpiresAt is present, external submission might have occurred
  if (
    dbMessage.wamid ||
    (dbMessage.attemptCount !== undefined && dbMessage.attemptCount > 0) ||
    dbMessage.leaseExpiresAt
  ) {
    logger.warn(
      `[QueueRecovery] Ambiguous dispatch state for message ${dbMessage.id}: status=QUEUED but attemptCount=${dbMessage.attemptCount}, wamid=${dbMessage.wamid}, leaseExpiresAt=${dbMessage.leaseExpiresAt}. Failing closed.`
    );
    return {
      status: "ambiguous",
      jobId,
      reason: "Message has non-zero attempts, active lease, or existing WAMID; manual reconciliation required.",
    };
  }

  const queue = (queueOverride as Queue<WhatsAppDispatchJobData>) || getWhatsAppDispatchQueue();
  const existingJob = await queue.getJob(jobId);

  // 3. If no existing BullMQ job, safely enqueue with deterministic jobId
  if (!existingJob) {
    const delay = jobData.scheduledAt
      ? Math.max(0, new Date(jobData.scheduledAt).getTime() - Date.now())
      : 0;

    const job = await queue.add("dispatch", jobData, {
      jobId,
      ...(delay > 0 ? { delay } : {}),
    });
    logger.info(
      `[QueueRecovery] Enqueued missing BullMQ job ${jobId} for message ${jobData.messageId}${
        delay > 0 ? ` (delayed by ${delay}ms)` : ""
      }`
    );
    return {
      status: "newly_enqueued",
      jobId,
      job,
    };
  }

  // 4. Job already existed in BullMQ: inspect BullMQ job state
  let jobState = "waiting";
  if (typeof existingJob.getState === "function") {
    jobState = await existingJob.getState();
  }

  switch (jobState) {
    case "waiting":
    case "delayed":
      logger.info(`[QueueRecovery] Job ${jobId} is already in state '${jobState}'. No action required.`);
      return {
        status: "already_waiting",
        jobId,
        job: existingJob,
      };

    case "active":
      logger.info(`[QueueRecovery] Job ${jobId} is currently 'active' (worker executing). No action required.`);
      return {
        status: "already_active",
        jobId,
        job: existingJob,
      };

    case "completed":
      logger.info(`[QueueRecovery] Job ${jobId} is already 'completed' in BullMQ. No retry executed.`);
      return {
        status: "already_completed",
        jobId,
        job: existingJob,
      };

    case "failed":
      // Safe to retry ONLY because dbMessage was verified as QUEUED with 0 attempts and no wamid
      logger.info(`[QueueRecovery] Retrying verified failed BullMQ job ${jobId} for message ${jobData.messageId}`);
      if (typeof existingJob.retry === "function") {
        await existingJob.retry();
      }
      return {
        status: "retried_failed",
        jobId,
        job: existingJob,
      };

    default:
      logger.warn(`[QueueRecovery] Job ${jobId} is in unrecognized state '${jobState}'. Failing closed.`);
      return {
        status: "ambiguous",
        jobId,
        job: existingJob,
        reason: `BullMQ job is in unhandled state '${jobState}'; manual reconciliation required.`,
      };
  }
}

/**
 * Closes the WhatsApp dispatch queue during shutdown.
 */
export async function closeWhatsAppDispatchQueue(): Promise<void> {
  if (whatsappQueueInstance) {
    await whatsappQueueInstance.close();
    whatsappQueueInstance = null;
  }
  if (whatsappQueueEventsInstance) {
    await whatsappQueueEventsInstance.close();
    whatsappQueueEventsInstance = null;
  }
}
