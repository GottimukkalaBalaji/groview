import { Prisma, CampaignStatus, MessageDeliveryStatus } from "@prisma/client";
import { getPrismaClient } from "../config/prisma.js";
import {
  QueryAnalyticsOverviewInput,
  QueryDeliveryReportInput,
} from "../validators/analytics.validator.js";

export function sanitizeErrorMessage(msg: string | null | undefined): string | null {
  if (!msg) return null;
  return msg
    .replace(/EAAB[a-zA-Z0-9_-]+/g, "[REDACTED_TOKEN]")
    .replace(/Bearer\s+[a-zA-Z0-9._-]+/gi, "Bearer [REDACTED]")
    .replace(/(redis|rediss):\/\/[^\s]+/gi, "[REDACTED_REDIS_URL]")
    .replace(/(https?:\/\/[^\s]*:[^\s]*@)[^\s]+/gi, "[REDACTED_CREDENTIALS]")
    .replace(/password=[^\s&]+/gi, "password=[REDACTED]")
    .replace(/client_secret=[^\s&]+/gi, "client_secret=[REDACTED]")
    .replace(/access_token=[^\s&]+/gi, "access_token=[REDACTED]");
}

export function maskPhoneNumber(phone: string | null | undefined): string {
  if (!phone) return "••••••••••";
  const trimmed = phone.trim();
  if (trimmed.length <= 5) return "••••";
  const prefix = trimmed.slice(0, Math.min(5, trimmed.length - 3));
  const suffix = trimmed.slice(-2);
  const middleLen = Math.max(3, trimmed.length - prefix.length - suffix.length);
  return `${prefix}${"•".repeat(middleLen)}${suffix}`;
}

function formatDateKey(date: Date): string {
  return date.toISOString().slice(0, 10);
}

function generateDateBuckets(startDate: Date, endDate: Date): string[] {
  const keys: string[] = [];
  const current = new Date(startDate);
  current.setUTCHours(0, 0, 0, 0);
  const end = new Date(endDate);
  end.setUTCHours(23, 59, 59, 999);

  while (current <= end) {
    keys.push(formatDateKey(current));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  return keys;
}

export class AnalyticsService {
  /**
   * Aggregates organization-scoped campaign and message performance metrics.
   */
  public async getOverview(
    organizationId: string,
    query: QueryAnalyticsOverviewInput
  ) {
    const prisma = getPrismaClient();

    // 1. Resolve date range boundary
    const now = new Date();
    let startDate: Date;
    let endDate = query.endDate ? new Date(query.endDate) : now;

    if (query.startDate) {
      startDate = new Date(query.startDate);
    } else {
      const timeRange = query.timeRange || "30d";
      switch (timeRange) {
        case "7d":
          startDate = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
          break;
        case "90d":
          startDate = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
          break;
        case "all":
          startDate = new Date(now.getTime() - 365 * 24 * 60 * 60 * 1000);
          break;
        case "30d":
        default:
          startDate = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
          break;
      }
    }

    // 2. Build tenant-isolated WHERE conditions
    const campaignWhere: Prisma.CampaignWhereInput = {
      organizationId,
      ...(query.campaignId ? { id: query.campaignId } : {}),
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    const messageWhere: Prisma.WhatsAppMessageWhereInput = {
      organizationId,
      ...(query.campaignId ? { campaignId: query.campaignId } : {}),
      createdAt: {
        gte: startDate,
        lte: endDate,
      },
    };

    // 3. Parallelized aggregation queries
    const [
      campaignStatusGroups,
      campaignRecipientAgg,
      totalCampaignsCount,
      completedWithFailedMessages,
      messageStatusGroups,
      totalMessagesCount,
      campaignsForTrends,
      messagesForTrends,
      failedMessagesForReasons,
      scheduledCampaigns,
    ] = await Promise.all([
      // Campaign status counts
      prisma.campaign.groupBy({
        by: ["status"],
        where: campaignWhere,
        _count: { _all: true },
      }),
      // Intended recipients aggregate
      prisma.campaign.aggregate({
        where: campaignWhere,
        _sum: { totalRecipients: true },
      }),
      // Total campaigns in date range
      prisma.campaign.count({ where: campaignWhere }),
      // Campaigns in COMPLETED status that had at least one FAILED message
      prisma.whatsAppMessage.groupBy({
        by: ["campaignId"],
        where: {
          organizationId,
          status: MessageDeliveryStatus.FAILED,
          campaign: campaignWhere,
        },
      }),
      // Message delivery status breakdown
      prisma.whatsAppMessage.groupBy({
        by: ["status"],
        where: messageWhere,
        _count: { _all: true },
      }),
      // Total messages count
      prisma.whatsAppMessage.count({ where: messageWhere }),
      // Sample recent campaigns for daily volume trend
      prisma.campaign.findMany({
        where: campaignWhere,
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
        take: 5000,
      }),
      // Sample recent messages for daily volume trend
      prisma.whatsAppMessage.findMany({
        where: messageWhere,
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
        take: 10000,
      }),
      // Failed messages for error code distribution
      prisma.whatsAppMessage.groupBy({
        by: ["errorCode", "errorMessage"],
        where: {
          ...messageWhere,
          status: MessageDeliveryStatus.FAILED,
        },
        _count: { _all: true },
        take: 10,
        orderBy: {
          _count: {
            status: "desc",
          },
        },
      }),
      // Scheduled campaigns analytics (within tenant)
      prisma.campaign.findMany({
        where: {
          organizationId,
          scheduledAt: { not: null },
          ...(query.campaignId ? { id: query.campaignId } : {}),
        },
        orderBy: { scheduledAt: "asc" },
        take: 50,
        select: {
          id: true,
          name: true,
          status: true,
          scheduledAt: true,
          startedAt: true,
          completedAt: true,
          totalRecipients: true,
        },
      }),
    ]);

    // 4. Map campaign summary metrics
    const campaignStatusMap = new Map<CampaignStatus, number>();
    for (const group of campaignStatusGroups) {
      campaignStatusMap.set(group.status, group._count._all);
    }

    const draftCampaigns = campaignStatusMap.get(CampaignStatus.DRAFT) || 0;
    const scheduledCampaignsCount = campaignStatusMap.get(CampaignStatus.SCHEDULED) || 0;
    const queuedCampaigns = campaignStatusMap.get(CampaignStatus.QUEUED) || 0;
    const sendingCampaigns = campaignStatusMap.get(CampaignStatus.SENDING) || 0;
    const failedCampaigns = campaignStatusMap.get(CampaignStatus.FAILED) || 0;
    const cancelledCampaigns = campaignStatusMap.get(CampaignStatus.CANCELLED) || 0;
    const rawCompletedCampaigns = campaignStatusMap.get(CampaignStatus.COMPLETED) || 0;

    // Separate clean completed campaigns from completed with issues
    const completedWithIssuesCampaigns = completedWithFailedMessages.filter(
      (g) => g.campaignId !== null
    ).length;
    const completedCampaigns = Math.max(0, rawCompletedCampaigns - completedWithIssuesCampaigns);

    // 5. Map message delivery metrics
    const messageStatusMap = new Map<MessageDeliveryStatus, number>();
    for (const group of messageStatusGroups) {
      messageStatusMap.set(group.status, group._count._all);
    }

    const queuedMessages = messageStatusMap.get(MessageDeliveryStatus.QUEUED) || 0;
    const sendingMessages = messageStatusMap.get(MessageDeliveryStatus.SENDING) || 0;
    const submittedUnconfirmedMessages =
      messageStatusMap.get(MessageDeliveryStatus.SUBMITTED_UNCONFIRMED) || 0;
    const acceptedMessages = messageStatusMap.get(MessageDeliveryStatus.ACCEPTED) || 0;
    const sentMessages = messageStatusMap.get(MessageDeliveryStatus.SENT) || 0;
    const deliveredMessages = messageStatusMap.get(MessageDeliveryStatus.DELIVERED) || 0;
    const readMessages = messageStatusMap.get(MessageDeliveryStatus.READ) || 0;
    const failedMessages = messageStatusMap.get(MessageDeliveryStatus.FAILED) || 0;

    // Delivery confirmation pending is messages submitted/dispatched that have not reached confirmed terminal DELIVERED/READ or FAILED
    const deliveryConfirmationPendingMessages =
      queuedMessages +
      sendingMessages +
      submittedUnconfirmedMessages +
      acceptedMessages +
      sentMessages;

    const totalIntendedRecipients = campaignRecipientAgg._sum.totalRecipients || 0;

    // 6. Compute Performance Rates with Documented Denominators
    const confirmedDelivered = deliveredMessages + readMessages;
    const eligibleDispatched =
      deliveredMessages +
      readMessages +
      failedMessages +
      sentMessages +
      acceptedMessages +
      submittedUnconfirmedMessages;

    const deliveryRate =
      eligibleDispatched > 0
        ? Number(((confirmedDelivered / eligibleDispatched) * 100).toFixed(1))
        : 0;

    const readRate =
      confirmedDelivered > 0
        ? Number(((readMessages / confirmedDelivered) * 100).toFixed(1))
        : 0;

    const attemptedMessages = eligibleDispatched;
    const failureRate =
      attemptedMessages > 0
        ? Number(((failedMessages / attemptedMessages) * 100).toFixed(1))
        : 0;

    // 7. Compute Daily Trends
    const dateKeys = generateDateBuckets(startDate, endDate);

    const campaignDailyMap = new Map<
      string,
      { total: number; completed: number; failed: number; scheduled: number }
    >();
    for (const k of dateKeys) {
      campaignDailyMap.set(k, { total: 0, completed: 0, failed: 0, scheduled: 0 });
    }

    for (const c of campaignsForTrends) {
      const key = formatDateKey(c.createdAt);
      const entry = campaignDailyMap.get(key);
      if (entry) {
        entry.total += 1;
        if (c.status === CampaignStatus.COMPLETED) entry.completed += 1;
        if (c.status === CampaignStatus.FAILED) entry.failed += 1;
        if (c.status === CampaignStatus.SCHEDULED) entry.scheduled += 1;
      }
    }

    const campaignVolumeOverTime = dateKeys.map((date) => ({
      date,
      ...(campaignDailyMap.get(date) || { total: 0, completed: 0, failed: 0, scheduled: 0 }),
    }));

    const messageDailyMap = new Map<
      string,
      { sent: number; delivered: number; read: number; failed: number; queued: number }
    >();
    for (const k of dateKeys) {
      messageDailyMap.set(k, { sent: 0, delivered: 0, read: 0, failed: 0, queued: 0 });
    }

    for (const m of messagesForTrends) {
      const key = formatDateKey(m.createdAt);
      const entry = messageDailyMap.get(key);
      if (entry) {
        switch (m.status) {
          case MessageDeliveryStatus.READ:
            entry.read += 1;
            entry.delivered += 1; // Read implies delivered
            break;
          case MessageDeliveryStatus.DELIVERED:
            entry.delivered += 1;
            break;
          case MessageDeliveryStatus.SENT:
          case MessageDeliveryStatus.ACCEPTED:
            entry.sent += 1;
            break;
          case MessageDeliveryStatus.FAILED:
            entry.failed += 1;
            break;
          case MessageDeliveryStatus.QUEUED:
          case MessageDeliveryStatus.SENDING:
            entry.queued += 1;
            break;
        }
      }
    }

    const messageVolumeOverTime = dateKeys.map((date) => ({
      date,
      ...(messageDailyMap.get(date) || {
        sent: 0,
        delivered: 0,
        read: 0,
        failed: 0,
        queued: 0,
      }),
    }));

    const ratesOverTime = messageVolumeOverTime.map((d) => {
      const dayDelivered = d.delivered + d.read;
      const dayDispatched = dayDelivered + d.sent + d.failed;
      const dayDelivRate =
        dayDispatched > 0 ? Number(((dayDelivered / dayDispatched) * 100).toFixed(1)) : 0;
      const dayReadRate =
        dayDelivered > 0 ? Number(((d.read / dayDelivered) * 100).toFixed(1)) : 0;
      const dayFailRate =
        dayDispatched > 0 ? Number(((d.failed / dayDispatched) * 100).toFixed(1)) : 0;
      return {
        date: d.date,
        deliveryRate: dayDelivRate,
        readRate: dayReadRate,
        failureRate: dayFailRate,
      };
    });

    // 8. Campaign Status Distribution
    const totalStatusSum = totalCampaignsCount || 1;
    const campaignStatusDistribution = [
      {
        status: "COMPLETED",
        label: "Completed",
        count: completedCampaigns,
        percentage: Number(((completedCampaigns / totalStatusSum) * 100).toFixed(1)),
      },
      {
        status: "COMPLETED_WITH_ISSUES",
        label: "Completed with issues",
        count: completedWithIssuesCampaigns,
        percentage: Number(((completedWithIssuesCampaigns / totalStatusSum) * 100).toFixed(1)),
      },
      {
        status: "SCHEDULED",
        label: "Scheduled",
        count: scheduledCampaignsCount,
        percentage: Number(((scheduledCampaignsCount / totalStatusSum) * 100).toFixed(1)),
      },
      {
        status: "SENDING",
        label: "Sending",
        count: sendingCampaigns,
        percentage: Number(((sendingCampaigns / totalStatusSum) * 100).toFixed(1)),
      },
      {
        status: "QUEUED",
        label: "Queued",
        count: queuedCampaigns,
        percentage: Number(((queuedCampaigns / totalStatusSum) * 100).toFixed(1)),
      },
      {
        status: "DRAFT",
        label: "Draft",
        count: draftCampaigns,
        percentage: Number(((draftCampaigns / totalStatusSum) * 100).toFixed(1)),
      },
      {
        status: "FAILED",
        label: "Failed",
        count: failedCampaigns,
        percentage: Number(((failedCampaigns / totalStatusSum) * 100).toFixed(1)),
      },
      {
        status: "CANCELLED",
        label: "Cancelled",
        count: cancelledCampaigns,
        percentage: Number(((cancelledCampaigns / totalStatusSum) * 100).toFixed(1)),
      },
    ].filter((item) => item.count > 0 || totalCampaignsCount === 0);

    // 9. Failure Reasons Distribution
    const totalFailures = failedMessages || 1;
    const failureReasonsDistribution = failedMessagesForReasons.map((g) => {
      const count = g._count._all;
      const sanitized = sanitizeErrorMessage(g.errorMessage) || "Unknown delivery failure";
      return {
        code: g.errorCode || "GENERIC_FAILURE",
        reason: sanitized,
        count,
        percentage: Number(((count / totalFailures) * 100).toFixed(1)),
      };
    });

    // 10. Scheduling & Restart-Recovery Analytics
    const currentTime = now.getTime();
    const upcomingList: Array<{
      id: string;
      name: string;
      scheduledAt: string;
      totalRecipients: number;
    }> = [];
    const overdueList: Array<{
      id: string;
      name: string;
      scheduledAt: string;
      delayMinutes: number;
    }> = [];
    const dispatchedLateList: Array<{
      id: string;
      name: string;
      scheduledAt: string;
      startedAt: string;
      latencySeconds: number;
    }> = [];
    const comparisons: Array<{
      id: string;
      name: string;
      scheduledAt: string;
      startedAt: string | null;
      status: string;
      latencySeconds: number | null;
    }> = [];

    let cancelledExpiredCount = 0;

    for (const sc of scheduledCampaigns) {
      if (!sc.scheduledAt) continue;
      const schedTime = new Date(sc.scheduledAt).getTime();
      const schedIso = sc.scheduledAt.toISOString();
      const startedIso = sc.startedAt ? sc.startedAt.toISOString() : null;
      const latencySeconds = sc.startedAt
        ? Math.round((sc.startedAt.getTime() - schedTime) / 1000)
        : null;

      comparisons.push({
        id: sc.id,
        name: sc.name,
        scheduledAt: schedIso,
        startedAt: startedIso,
        status: sc.status,
        latencySeconds,
      });

      if (sc.status === CampaignStatus.SCHEDULED) {
        if (schedTime > currentTime) {
          upcomingList.push({
            id: sc.id,
            name: sc.name,
            scheduledAt: schedIso,
            totalRecipients: sc.totalRecipients,
          });
        } else {
          overdueList.push({
            id: sc.id,
            name: sc.name,
            scheduledAt: schedIso,
            delayMinutes: Math.round((currentTime - schedTime) / 60000),
          });
        }
      }

      if (sc.startedAt && latencySeconds !== null && latencySeconds > 120) {
        dispatchedLateList.push({
          id: sc.id,
          name: sc.name,
          scheduledAt: schedIso,
          startedAt: sc.startedAt.toISOString(),
          latencySeconds,
        });
      }

      if (sc.status === CampaignStatus.CANCELLED) {
        cancelledExpiredCount += 1;
      }
    }

    return {
      dateRange: {
        startDate: startDate.toISOString(),
        endDate: endDate.toISOString(),
        timeRange: query.timeRange || "30d",
      },
      summary: {
        totalCampaigns: totalCampaignsCount,
        draftCampaigns,
        scheduledCampaigns: scheduledCampaignsCount,
        queuedCampaigns,
        sendingCampaigns,
        completedCampaigns,
        completedWithIssuesCampaigns,
        failedCampaigns,
        cancelledCampaigns,
        totalIntendedRecipients,
        queuedMessages,
        acceptedMessages,
        sentMessages,
        deliveredMessages,
        readMessages,
        failedMessages,
        deliveryConfirmationPendingMessages,
        totalMessages: totalMessagesCount,
      },
      rates: {
        deliveryRate: {
          rate: deliveryRate,
          numerator: confirmedDelivered,
          denominator: eligibleDispatched,
          definition: "Percentage of dispatched messages confirmed delivered or read by WhatsApp recipients",
          formula: "(Delivered + Read) / Dispatched Messages",
        },
        readRate: {
          rate: readRate,
          numerator: readMessages,
          denominator: confirmedDelivered,
          definition: "Percentage of confirmed delivered messages opened and read by recipients",
          formula: "Read / (Delivered + Read)",
        },
        failureRate: {
          rate: failureRate,
          numerator: failedMessages,
          denominator: attemptedMessages,
          definition: "Percentage of attempted messages that encountered terminal delivery failure",
          formula: "Failed / Attempted Messages",
        },
      },
      trends: {
        campaignVolumeOverTime,
        messageVolumeOverTime,
        ratesOverTime,
        campaignStatusDistribution,
        failureReasonsDistribution,
      },
      scheduling: {
        upcomingCount: upcomingList.length,
        overdueCount: overdueList.length,
        dispatchedLateCount: dispatchedLateList.length,
        cancelledExpiredCount,
        upcomingCampaigns: upcomingList.slice(0, 10),
        overdueCampaigns: overdueList.slice(0, 10),
        dispatchedLateCampaigns: dispatchedLateList.slice(0, 10),
        comparisons: comparisons.slice(0, 15),
        restartRecovery: {
          isAvailable: false,
          historicalCount: null,
          status: "UNAVAILABLE",
          reason:
            "Process restart and in-flight job reconciliation events are currently logged as ephemeral operational events in application stdout and are not persisted as database event records.",
          additiveDesignProposal:
            "To record persistent restart-recovery history without altering core dispatch tables, introduce an additive `system_recovery_logs` table: `(id, organizationId?, eventType: ['PROCESS_RESTART', 'IN_FLIGHT_JOB_RECOVERED', 'STALE_LEASE_RECLAIMED'], entityType: 'CAMPAIGN' | 'MESSAGE', entityId, recoveredAt, metadata Json)`. During scheduler initialization or worker boot in `campaignScheduler.service.ts`, append audit records to this table.",
        },
      },
    };
  }

  /**
   * Retrieves a tenant-isolated, searchable, paginated recipient-level delivery report.
   * Masks recipient phone numbers and sanitizes failure messages.
   */
  public async getDeliveryReport(
    organizationId: string,
    query: QueryDeliveryReportInput
  ) {
    const prisma = getPrismaClient();

    const page = Math.max(1, query.page ?? 1);
    const limit = Math.min(100, Math.max(1, query.limit ?? 20));
    const skip = (page - 1) * limit;

    const where: Prisma.WhatsAppMessageWhereInput = {
      organizationId,
    };

    if (query.campaignId) {
      where.campaignId = query.campaignId;
    }

    if (query.status && query.status !== "ALL") {
      where.status = query.status as MessageDeliveryStatus;
    }

    if (query.templateName && query.templateName.trim() !== "") {
      where.templateName = {
        contains: query.templateName.trim(),
        mode: "insensitive",
      };
    }

    if (query.startDate || query.endDate) {
      where.createdAt = {
        ...(query.startDate ? { gte: new Date(query.startDate) } : {}),
        ...(query.endDate ? { lte: new Date(query.endDate) } : {}),
      };
    }

    if (query.search && query.search.trim() !== "") {
      const s = query.search.trim();
      where.OR = [
        { recipientPhone: { contains: s, mode: "insensitive" } },
        { campaignNameSnapshot: { contains: s, mode: "insensitive" } },
        { templateName: { contains: s, mode: "insensitive" } },
      ];
    }

    const sortBy = query.sortBy || "createdAt";
    const sortOrder = query.sortOrder || "desc";

    const [total, messages] = await Promise.all([
      prisma.whatsAppMessage.count({ where }),
      prisma.whatsAppMessage.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
        select: {
          id: true,
          campaignId: true,
          campaignNameSnapshot: true,
          recipientPhone: true,
          templateName: true,
          templateLanguage: true,
          status: true,
          attemptCount: true,
          errorCode: true,
          errorMessage: true,
          queuedAt: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          failedAt: true,
          createdAt: true,
          campaign: {
            select: {
              id: true,
              name: true,
            },
          },
        },
      }),
    ]);

    const items = messages.map((m) => {
      const campaignName =
        m.campaign?.name || m.campaignNameSnapshot || "Unnamed Campaign";
      const recipientPhoneMasked = maskPhoneNumber(m.recipientPhone);
      const sanitizedError = sanitizeErrorMessage(m.errorMessage);

      return {
        id: m.id,
        campaignId: m.campaignId,
        campaignName,
        recipientPhoneMasked,
        templateName: m.templateName,
        templateLanguage: m.templateLanguage,
        status: m.status,
        attemptCount: m.attemptCount,
        errorCode: m.errorCode || null,
        errorMessage: sanitizedError,
        dispatchedAt: m.sentAt || m.queuedAt || m.createdAt,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
        failedAt: m.failedAt,
        createdAt: m.createdAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit),
    };
  }
}

export const analyticsService = new AnalyticsService();
