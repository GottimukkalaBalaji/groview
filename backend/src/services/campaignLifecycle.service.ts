import { CampaignStatus, MessageDeliveryStatus } from "@prisma/client";
import { getPrismaClient } from "../config/prisma.js";
import { logger } from "../utils/logger.js";

/**
 * Service managing atomic, concurrency-safe transitions of Campaign lifecycle state
 * as messages are claimed, dispatched, or completed by workers.
 */
export class CampaignLifecycleService {
  /**
   * Concurrency-safe atomic transition from QUEUED to SENDING when a worker genuinely claims
   * the first message for dispatch. Sets startedAt to the actual dispatch execution time.
   */
  public static async markCampaignSendingIfClaimed(campaignId: string): Promise<boolean> {
    const prisma = getPrismaClient();

    try {
      const result = await prisma.campaign.updateMany({
        where: {
          id: campaignId,
          status: CampaignStatus.QUEUED,
        },
        data: {
          status: CampaignStatus.SENDING,
          startedAt: new Date(),
        },
      });

      if (result.count > 0) {
        logger.info(
          `[CampaignLifecycle] Campaign ${campaignId} transitioned from QUEUED to SENDING upon worker lease claim`
        );
        return true;
      }
      return false;
    } catch (err: unknown) {
      logger.error(
        `[CampaignLifecycle] Failed to transition campaign ${campaignId} to SENDING: ${(err as Error)?.message}`
      );
      return false;
    }
  }

  /**
   * Evaluates the lifecycle state of a campaign after worker message attempts.
   * If all messages for the campaign have reached a non-active state (terminal or submitted-unconfirmed),
   * transitions the campaign from QUEUED/SENDING to COMPLETED or FAILED and records completedAt.
   *
   * Mixed outcome rules:
   * - If ALL messages reached FAILED: CampaignStatus.FAILED
   * - If at least ONE message reached ACCEPTED, SENT, DELIVERED, READ, or SUBMITTED_UNCONFIRMED: CampaignStatus.COMPLETED
   *   (COMPLETED signifies dispatch execution completed for all recipients; it does not claim 100% delivered).
   * - SUBMITTED_UNCONFIRMED messages are awaiting webhook reconciliation and are non-active for worker dispatch.
   */
  public static async evaluateCampaignLifecycle(
    campaignId: string
  ): Promise<CampaignStatus | null> {
    const prisma = getPrismaClient();

    try {
      // 1. Check for remaining non-terminal active messages (QUEUED or SENDING)
      const activeCount = await prisma.whatsAppMessage.count({
        where: {
          campaignId,
          status: {
            in: [MessageDeliveryStatus.QUEUED, MessageDeliveryStatus.SENDING],
          },
        },
      });

      if (activeCount > 0) {
        return null;
      }

      // 2. Count total persisted messages for this campaign
      const totalCount = await prisma.whatsAppMessage.count({
        where: { campaignId },
      });

      if (totalCount === 0) {
        return null;
      }

      // 3. Count messages with terminal status FAILED
      const failedCount = await prisma.whatsAppMessage.count({
        where: {
          campaignId,
          status: MessageDeliveryStatus.FAILED,
        },
      });

      // Mixed outcome rule: FAILED only if all failed; COMPLETED if at least one was accepted/unconfirmed/delivered
      const finalStatus =
        failedCount === totalCount ? CampaignStatus.FAILED : CampaignStatus.COMPLETED;

      // 4. Concurrency-safe atomic transition (only updates if still QUEUED or SENDING)
      const result = await prisma.campaign.updateMany({
        where: {
          id: campaignId,
          status: {
            in: [CampaignStatus.QUEUED, CampaignStatus.SENDING],
          },
        },
        data: {
          status: finalStatus,
          completedAt: new Date(),
        },
      });

      if (result.count > 0) {
        logger.info(
          `[CampaignLifecycle] Campaign ${campaignId} finalized to ${finalStatus} (${totalCount - failedCount}/${totalCount} non-failed messages)`
        );
      }

      return finalStatus;
    } catch (err: unknown) {
      logger.error(
        `[CampaignLifecycle] Error evaluating campaign lifecycle for ${campaignId}: ${(err as Error)?.message}`
      );
      return null;
    }
  }
}
