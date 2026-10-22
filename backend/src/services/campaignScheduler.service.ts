import { CampaignStatus, MessageDeliveryStatus } from "@prisma/client";
import { getPrismaClient } from "../config/prisma.js";
import { env } from "../config/env.js";
import { logger } from "../utils/logger.js";
import { isWorkerRunning, getWorkerStatus } from "./automaticWorker.service.js";
import { campaignService } from "./campaign.service.js";
import { DEFAULT_BUSINESS_TIMEZONE } from "../utils/timezone.js";

export interface SchedulerReconciliationResult {
  dueFound: number;
  dispatched: number;
  expired: number;
  skippedConflict: number;
  pendingWaitingWorker: number;
  errors: Array<{ campaignId: string; error: string }>;
}

export interface QueueReconciliationResult {
  activeCampaignsChecked: number;
  totalMessagesRecovered: number;
  errors: Array<{ campaignId: string; error: string }>;
}

export interface SchedulerStatusResponse {
  schedulerActive: boolean;
  automaticDispatchEnabled: boolean;
  workerRunning: boolean;
  redisConfigured: boolean;
  dueScheduledCount: number;
  overdueMissedCount: number;
  businessTimezone: string;
  maxLatenessHours: number;
  timestamp: string;
}

export class CampaignSchedulerService {
  private timerInstance: NodeJS.Timeout | null = null;
  private isReconciling = false;

  /**
   * Evaluates due scheduled campaigns and safely dispatches them if the worker is active.
   *
   * Safety Guarantees:
   * 1. Concurrency-safe atomic compare-and-swap (CAS) prevents duplicate dispatch across overlapping ticks or instances.
   * 2. If automatic dispatch worker is dormant/disabled, campaigns stay safely in SCHEDULED status.
   * 3. Configurable maximum lateness expiry: campaigns that missed their schedule by more than MAX_SCHEDULE_LATENESS_HOURS
   *    are marked as FAILED with an explicit expiry explanation to prevent stale broadcast spam.
   * 4. Full dispatch pipeline re-validation (consent, suppression, template approval, parameter resolution, phone normalization).
   */
  public async reconcileScheduledCampaigns(
    now: Date = new Date()
  ): Promise<SchedulerReconciliationResult> {
    const prisma = getPrismaClient();
    const result: SchedulerReconciliationResult = {
      dueFound: 0,
      dispatched: 0,
      expired: 0,
      skippedConflict: 0,
      pendingWaitingWorker: 0,
      errors: [],
    };

    try {
      // 1. Query all due or overdue scheduled campaigns
      const dueCampaigns = await prisma.campaign.findMany({
        where: {
          status: CampaignStatus.SCHEDULED,
          scheduledAt: {
            lte: now,
          },
        },
        orderBy: {
          scheduledAt: "asc",
        },
      });

      result.dueFound = dueCampaigns.length;

      if (dueCampaigns.length === 0) {
        return result;
      }

      const workerStatus = getWorkerStatus();
      const maxLatenessMs = (env.MAX_SCHEDULE_LATENESS_HOURS || 24) * 60 * 60 * 1000;

      // 2. Worker Safeguard: If automatic worker is disabled or offline, do not dispatch
      if (!workerStatus.enabled || !workerStatus.isRunning) {
        logger.info(
          `[CampaignScheduler] Found ${dueCampaigns.length} due scheduled campaign(s), but automatic worker is disabled (enabled=${workerStatus.enabled}, running=${workerStatus.isRunning}). Work remains safely pending in SCHEDULED status.`
        );
        result.pendingWaitingWorker = dueCampaigns.length;
        return result;
      }

      // 3. Process each due campaign with atomic CAS locking
      for (const campaign of dueCampaigns) {
        const scheduledTime = campaign.scheduledAt?.getTime() ?? now.getTime();
        const latenessMs = now.getTime() - scheduledTime;

        // 3a. Maximum Lateness / Expiry Policy Enforcement
        if (latenessMs > maxLatenessMs) {
          logger.warn(
            `[CampaignScheduler] Campaign ${campaign.id} (${campaign.name}) scheduledAt ${campaign.scheduledAt?.toISOString()} exceeded maximum lateness of ${env.MAX_SCHEDULE_LATENESS_HOURS} hours (${Math.round(latenessMs / (1000 * 60 * 60))}h elapsed). Expiring campaign to prevent stale dispatch.`
          );

          await prisma.campaign.updateMany({
            where: {
              id: campaign.id,
              status: CampaignStatus.SCHEDULED,
            },
            data: {
              status: CampaignStatus.FAILED,
              completedAt: now,
            },
          });

          result.expired++;
          continue;
        }

        // 3b. Atomic compare-and-swap claim (CAS): transition from SCHEDULED to QUEUED
        const claimed = await prisma.campaign.updateMany({
          where: {
            id: campaign.id,
            status: CampaignStatus.SCHEDULED,
          },
          data: {
            status: CampaignStatus.QUEUED,
          },
        });

        if (claimed.count === 0) {
          // Another concurrent tick or instance claimed this campaign
          result.skippedConflict++;
          continue;
        }

        // 3c. Execute launch through the full safety pipeline
        try {
          logger.info(
            `[CampaignScheduler] Dispatching due scheduled campaign ${campaign.id} (${campaign.name}) scheduled for ${campaign.scheduledAt?.toISOString()}`
          );

          await campaignService.launchCampaign(campaign.organizationId, campaign.id);
          result.dispatched++;
        } catch (dispatchErr: unknown) {
          const errMsg = dispatchErr instanceof Error ? dispatchErr.message : String(dispatchErr);
          logger.error(
            `[CampaignScheduler] Failed to dispatch scheduled campaign ${campaign.id}: ${errMsg}`
          );

          result.errors.push({ campaignId: campaign.id, error: errMsg });

          // Revert or mark FAILED so campaign does not stay stuck in QUEUED with 0 messages
          await prisma.campaign.updateMany({
            where: { id: campaign.id, status: CampaignStatus.QUEUED },
            data: {
              status: CampaignStatus.FAILED,
              completedAt: now,
            },
          });
        }
      }

      return result;
    } catch (err: unknown) {
      const errMsg = err instanceof Error ? err.message : String(err);
      logger.error(`[CampaignScheduler] Error during scheduled campaign reconciliation: ${errMsg}`);
      return result;
    }
  }

  /**
   * Recovers un-enqueued or interrupted QUEUED messages for active campaigns.
   * Survives server crashes and restarts by scanning QUEUED and SENDING campaigns.
   */
  public async reconcileStrandedQueuedWork(): Promise<QueueReconciliationResult> {
    const prisma = getPrismaClient();
    const result: QueueReconciliationResult = {
      activeCampaignsChecked: 0,
      totalMessagesRecovered: 0,
      errors: [],
    };

    const workerStatus = getWorkerStatus();
    if (!workerStatus.redisConfigured) {
      return result;
    }

    try {
      const activeCampaigns = await prisma.campaign.findMany({
        where: {
          status: {
            in: [CampaignStatus.QUEUED, CampaignStatus.SENDING],
          },
        },
        select: {
          id: true,
          organizationId: true,
          name: true,
        },
      });

      result.activeCampaignsChecked = activeCampaigns.length;

      for (const campaign of activeCampaigns) {
        try {
          const recoverySummary = await campaignService.recoverCampaignQueue(
            campaign.organizationId,
            campaign.id
          );
          result.totalMessagesRecovered +=
            recoverySummary.requeuedCount ?? recoverySummary.enqueuedSuccessCount;
        } catch (recErr: unknown) {
          const errMsg = recErr instanceof Error ? recErr.message : String(recErr);
          result.errors.push({ campaignId: campaign.id, error: errMsg });
        }
      }

      return result;
    } catch (err: unknown) {
      logger.error(`[CampaignScheduler] Error during stranded queue recovery: ${(err as Error)?.message}`);
      return result;
    }
  }

  /**
   * Startup inspection routine executed when the backend boots or reboots.
   */
  public async onStartup(): Promise<{
    scheduled: SchedulerReconciliationResult;
    queue: QueueReconciliationResult;
  }> {
    logger.info("[CampaignScheduler] Executing startup recovery inspection...");
    const scheduled = await this.reconcileScheduledCampaigns();
    const queue = await this.reconcileStrandedQueuedWork();

    logger.info(
      `[CampaignScheduler] Startup inspection completed: ` +
        `${scheduled.dueFound} due campaign(s) found (${scheduled.dispatched} dispatched, ${scheduled.pendingWaitingWorker} waiting for worker), ` +
        `${queue.totalMessagesRecovered} stranded queued message(s) recovered.`
    );

    return { scheduled, queue };
  }

  /**
   * Starts periodic background reconciliation ticker.
   */
  public startSchedulerLoop(intervalMs = 30000): void {
    if (this.timerInstance) {
      logger.warn("[CampaignScheduler] Scheduler loop is already active.");
      return;
    }

    logger.info(
      `[CampaignScheduler] Starting background scheduler loop (interval: ${intervalMs}ms, timezone: ${DEFAULT_BUSINESS_TIMEZONE})`
    );

    // Initial run immediately on startup
    this.onStartup().catch((err) => {
      logger.error("[CampaignScheduler] Error in startup inspection:", err);
    });

    // Periodic loop with overlapping tick protection
    this.timerInstance = setInterval(async () => {
      if (this.isReconciling) {
        logger.debug("[CampaignScheduler] Previous reconciliation tick still running. Skipping tick.");
        return;
      }

      this.isReconciling = true;
      try {
        await this.reconcileScheduledCampaigns();
        await this.reconcileStrandedQueuedWork();
      } catch (err) {
        logger.error("[CampaignScheduler] Error in periodic scheduler tick:", err);
      } finally {
        this.isReconciling = false;
      }
    }, intervalMs);

    // Unref so timer does not prevent graceful process termination
    this.timerInstance.unref();
  }

  /**
   * Stops periodic background reconciliation ticker during graceful shutdown.
   */
  public stopSchedulerLoop(): void {
    if (this.timerInstance) {
      clearInterval(this.timerInstance);
      this.timerInstance = null;
      logger.info("[CampaignScheduler] Background scheduler loop stopped.");
    }
  }

  /**
   * Checks whether the background scheduler loop is currently running.
   */
  public isSchedulerRunning(): boolean {
    return this.timerInstance !== null;
  }

  /**
   * Returns current operational status and count metrics for admin diagnostics and dashboard.
   */
  public async getSchedulerStatus(): Promise<SchedulerStatusResponse> {
    const prisma = getPrismaClient();
    const workerStatus = getWorkerStatus();
    const now = new Date();

    const [dueScheduledCount, overdueMissedCount] = await Promise.all([
      prisma.campaign.count({
        where: {
          status: CampaignStatus.SCHEDULED,
        },
      }),
      prisma.campaign.count({
        where: {
          status: CampaignStatus.SCHEDULED,
          scheduledAt: {
            lt: now,
          },
        },
      }),
    ]);

    return {
      schedulerActive: this.isSchedulerRunning(),
      automaticDispatchEnabled: workerStatus.enabled,
      workerRunning: workerStatus.isRunning,
      redisConfigured: workerStatus.redisConfigured,
      dueScheduledCount,
      overdueMissedCount,
      businessTimezone: DEFAULT_BUSINESS_TIMEZONE,
      maxLatenessHours: env.MAX_SCHEDULE_LATENESS_HOURS || 24,
      timestamp: now.toISOString(),
    };
  }
}

export const campaignSchedulerService = new CampaignSchedulerService();
