import { Worker } from "bullmq";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { isRedisConfigured } from "../config/redis.js";
import { createDispatchWorker } from "../workers/dispatch.worker.js";
import { WhatsAppDispatchJobData } from "../queue/whatsapp.queue.js";

let dispatchWorkerInstance: Worker<WhatsAppDispatchJobData> | null = null;

/**
 * Returns the currently active automatic dispatch worker instance, or null if dormant.
 */
export function getDispatchWorker(): Worker<WhatsAppDispatchJobData> | null {
  return dispatchWorkerInstance;
}

/**
 * Starts the automatic dispatch worker if explicitly enabled by the kill switch
 * (ENABLE_AUTOMATIC_WORKER=true) and Redis is configured.
 * Strictly enforces a single-instance singleton.
 */
export function startWorkerIfEnabled(): Worker<WhatsAppDispatchJobData> | null {
  if (dispatchWorkerInstance) {
    logger.warn("[AutomaticWorkerService] Dispatch worker is already running (single-instance enforced).");
    return dispatchWorkerInstance;
  }

  if (!env.ENABLE_AUTOMATIC_WORKER) {
    logger.info("[AutomaticWorkerService] Automatic WhatsApp dispatch worker is disabled (ENABLE_AUTOMATIC_WORKER=false)");
    return null;
  }

  if (!isRedisConfigured()) {
    logger.warn("[AutomaticWorkerService] ENABLE_AUTOMATIC_WORKER=true but Redis is not configured. Worker not started.");
    return null;
  }

  try {
    dispatchWorkerInstance = createDispatchWorker();
    logger.info("[AutomaticWorkerService] Automatic WhatsApp dispatch worker initialized successfully (concurrency: 1)");
    return dispatchWorkerInstance;
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : String(err);
    logger.error(`[AutomaticWorkerService] Failed to initialize automatic dispatch worker: ${msg}`);
    return null;
  }
}

/**
 * Gracefully shuts down the automatic dispatch worker and nulls its reference.
 */
export async function stopWorker(): Promise<void> {
  if (dispatchWorkerInstance) {
    logger.info("[AutomaticWorkerService] Closing dispatch worker...");
    try {
      await dispatchWorkerInstance.close();
      logger.info("[AutomaticWorkerService] Dispatch worker closed successfully.");
    } catch (err) {
      logger.error("[AutomaticWorkerService] Error closing dispatch worker:", err);
    } finally {
      dispatchWorkerInstance = null;
    }
  }
}

/**
 * Checks whether the automatic dispatch worker is currently active and processing.
 */
export function isWorkerRunning(): boolean {
  return dispatchWorkerInstance !== null;
}

/**
 * Returns complete operational status of the automatic dispatch worker subsystem.
 */
export function getWorkerStatus(): {
  isRunning: boolean;
  enabled: boolean;
  redisConfigured: boolean;
} {
  return {
    isRunning: isWorkerRunning(),
    enabled: env.ENABLE_AUTOMATIC_WORKER,
    redisConfigured: isRedisConfigured(),
  };
}
