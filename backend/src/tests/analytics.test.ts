import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignStatus, MessageDeliveryStatus } from "@prisma/client";
import {
  analyticsService,
  maskPhoneNumber,
  sanitizeErrorMessage,
} from "../services/analytics.service.js";

interface MockCampaign {
  id: string;
  organizationId: string;
  name: string;
  status: CampaignStatus;
  templateName: string;
  totalRecipients: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockMessage {
  id: string;
  organizationId: string;
  campaignId: string | null;
  campaignNameSnapshot: string | null;
  recipientPhone: string;
  templateName: string;
  templateLanguage: string;
  status: MessageDeliveryStatus;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  queuedAt: Date;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

let testCampaigns: MockCampaign[] = [];
let testMessages: MockMessage[] = [];

vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => ({
      campaign: {
        findMany: vi.fn().mockImplementation(async ({ where, take, skip, orderBy }) => {
          let list = testCampaigns.filter((c) => {
            if (where.organizationId && c.organizationId !== where.organizationId) return false;
            if (where.id && c.id !== where.id) return false;
            if (where.scheduledAt && where.scheduledAt.not === null && !c.scheduledAt) return false;
            if (where.createdAt?.gte && c.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && c.createdAt > where.createdAt.lte) return false;
            return true;
          });
          if (skip) list = list.slice(skip);
          if (take) list = list.slice(0, take);
          return list;
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          return testCampaigns.filter((c) => {
            if (where.organizationId && c.organizationId !== where.organizationId) return false;
            if (where.id && c.id !== where.id) return false;
            if (where.createdAt?.gte && c.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && c.createdAt > where.createdAt.lte) return false;
            return true;
          }).length;
        }),
        groupBy: vi.fn().mockImplementation(async ({ where, by }) => {
          const matching = testCampaigns.filter((c) => {
            if (where.organizationId && c.organizationId !== where.organizationId) return false;
            if (where.id && c.id !== where.id) return false;
            if (where.createdAt?.gte && c.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && c.createdAt > where.createdAt.lte) return false;
            return true;
          });
          const map = new Map<string, number>();
          for (const item of matching) {
            const key = (item as any)[by[0]];
            map.set(key, (map.get(key) || 0) + 1);
          }
          return Array.from(map.entries()).map(([k, count]) => ({
            [by[0]]: k,
            _count: { _all: count },
          }));
        }),
        aggregate: vi.fn().mockImplementation(async ({ where }) => {
          const matching = testCampaigns.filter((c) => {
            if (where.organizationId && c.organizationId !== where.organizationId) return false;
            if (where.id && c.id !== where.id) return false;
            if (where.createdAt?.gte && c.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && c.createdAt > where.createdAt.lte) return false;
            return true;
          });
          const totalRecipients = matching.reduce((sum, c) => sum + (c.totalRecipients || 0), 0);
          return { _sum: { totalRecipients } };
        }),
      },
      whatsAppMessage: {
        findMany: vi.fn().mockImplementation(async ({ where, take, skip, orderBy }) => {
          let list = testMessages.filter((m) => {
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.status && m.status !== where.status) return false;
            if (where.createdAt?.gte && m.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && m.createdAt > where.createdAt.lte) return false;
            if (where.templateName?.contains) {
              if (!m.templateName.toLowerCase().includes(where.templateName.contains.toLowerCase()))
                return false;
            }
            if (where.OR) {
              const matched = where.OR.some((clause: any) => {
                if (clause.recipientPhone?.contains) {
                  return m.recipientPhone
                    .toLowerCase()
                    .includes(clause.recipientPhone.contains.toLowerCase());
                }
                if (clause.campaignNameSnapshot?.contains) {
                  return (m.campaignNameSnapshot || "")
                    .toLowerCase()
                    .includes(clause.campaignNameSnapshot.contains.toLowerCase());
                }
                if (clause.templateName?.contains) {
                  return m.templateName
                    .toLowerCase()
                    .includes(clause.templateName.contains.toLowerCase());
                }
                return false;
              });
              if (!matched) return false;
            }
            return true;
          });
          if (skip) list = list.slice(skip);
          if (take) list = list.slice(0, take);
          return list.map((m) => ({
            ...m,
            campaign: m.campaignId
              ? {
                  id: m.campaignId,
                  name:
                    testCampaigns.find((c) => c.id === m.campaignId)?.name ||
                    m.campaignNameSnapshot ||
                    "Campaign",
                }
              : null,
          }));
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          return testMessages.filter((m) => {
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.status && m.status !== where.status) return false;
            if (where.createdAt?.gte && m.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && m.createdAt > where.createdAt.lte) return false;
            if (where.templateName?.contains) {
              if (!m.templateName.toLowerCase().includes(where.templateName.contains.toLowerCase()))
                return false;
            }
            if (where.OR) {
              const matched = where.OR.some((clause: any) => {
                if (clause.recipientPhone?.contains) {
                  return m.recipientPhone
                    .toLowerCase()
                    .includes(clause.recipientPhone.contains.toLowerCase());
                }
                return false;
              });
              if (!matched) return false;
            }
            return true;
          }).length;
        }),
        groupBy: vi.fn().mockImplementation(async ({ where, by }) => {
          const matching = testMessages.filter((m) => {
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.status && m.status !== where.status) return false;
            if (where.createdAt?.gte && m.createdAt < where.createdAt.gte) return false;
            if (where.createdAt?.lte && m.createdAt > where.createdAt.lte) return false;
            if (where.campaign) {
              const matchedCamp = testCampaigns.find(
                (c) => c.id === m.campaignId && c.organizationId === where.organizationId
              );
              if (!matchedCamp) return false;
              if (where.campaign.status && matchedCamp.status !== where.campaign.status)
                return false;
            }
            return true;
          });

          if (by.includes("campaignId") && by.length === 1) {
            const uniqueCampaigns = Array.from(new Set(matching.map((m) => m.campaignId)));
            return uniqueCampaigns.map((cid) => ({ campaignId: cid }));
          }

          if (by.includes("errorCode") && by.includes("errorMessage")) {
            const map = new Map<string, { code: string | null; msg: string | null; count: number }>();
            for (const m of matching) {
              const key = `${m.errorCode || ""}:${m.errorMessage || ""}`;
              const entry = map.get(key) || {
                code: m.errorCode,
                msg: m.errorMessage,
                count: 0,
              };
              entry.count++;
              map.set(key, entry);
            }
            return Array.from(map.values()).map((v) => ({
              errorCode: v.code,
              errorMessage: v.msg,
              _count: { _all: v.count, status: v.count },
            }));
          }

          const map = new Map<string, number>();
          for (const item of matching) {
            const key = (item as any)[by[0]];
            map.set(key, (map.get(key) || 0) + 1);
          }
          return Array.from(map.entries()).map(([k, count]) => ({
            [by[0]]: k,
            _count: { _all: count },
          }));
        }),
      },
    }),
  };
});

describe("Analytics Service & Endpoints", () => {
  const ORG_A = "org_alpha";
  const ORG_B = "org_beta";

  beforeEach(() => {
    testCampaigns = [];
    testMessages = [];
  });

  describe("Sanitization & Privacy Masking", () => {
    it("masks phone numbers safely", () => {
      expect(maskPhoneNumber("+919876543210")).toBe("+9198••••••10");
      expect(maskPhoneNumber("+14155552671")).toBe("+1415•••••71");
      expect(maskPhoneNumber("1234")).toBe("••••");
      expect(maskPhoneNumber(null)).toBe("••••••••••");
    });

    it("redacts sensitive tokens, redis urls, and passwords from error messages", () => {
      const sensitive =
        "Meta API failure with token EAABwz47x123... and Bearer secret123 on redis://user:pass@upstash.io:6379";
      const sanitized = sanitizeErrorMessage(sensitive);
      expect(sanitized).not.toContain("EAABwz47x123");
      expect(sanitized).not.toContain("secret123");
      expect(sanitized).not.toContain("redis://user:pass@upstash.io:6379");
      expect(sanitized).toContain("[REDACTED_TOKEN]");
      expect(sanitized).toContain("Bearer [REDACTED]");
      expect(sanitized).toContain("[REDACTED_REDIS_URL]");
    });
  });

  describe("Tenant Isolation", () => {
    it("strictly isolates campaigns and delivery metrics between tenants", async () => {
      const now = new Date();
      // Setup Org A campaign and message
      testCampaigns.push({
        id: "camp_a_1",
        organizationId: ORG_A,
        name: "Org A Campaign",
        status: CampaignStatus.COMPLETED,
        templateName: "offer_a",
        totalRecipients: 50,
        scheduledAt: null,
        startedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      testMessages.push({
        id: "msg_a_1",
        organizationId: ORG_A,
        campaignId: "camp_a_1",
        campaignNameSnapshot: "Org A Campaign",
        recipientPhone: "+919876543210",
        templateName: "offer_a",
        templateLanguage: "en_US",
        status: MessageDeliveryStatus.READ,
        attemptCount: 1,
        errorCode: null,
        errorMessage: null,
        queuedAt: now,
        sentAt: now,
        deliveredAt: now,
        readAt: now,
        failedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Setup Org B campaign and message
      testCampaigns.push({
        id: "camp_b_1",
        organizationId: ORG_B,
        name: "Org B Campaign",
        status: CampaignStatus.COMPLETED,
        templateName: "offer_b",
        totalRecipients: 100,
        scheduledAt: null,
        startedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      // Org A overview
      const overviewA = await analyticsService.getOverview(ORG_A, { timeRange: "30d" });
      expect(overviewA.summary.totalCampaigns).toBe(1);
      expect(overviewA.summary.totalIntendedRecipients).toBe(50);
      expect(overviewA.summary.readMessages).toBe(1);

      // Org B overview
      const overviewB = await analyticsService.getOverview(ORG_B, { timeRange: "30d" });
      expect(overviewB.summary.totalCampaigns).toBe(1);
      expect(overviewB.summary.totalIntendedRecipients).toBe(100);
      expect(overviewB.summary.readMessages).toBe(0);

      // Message report for Org B must not contain Org A messages
      const reportB = await analyticsService.getDeliveryReport(ORG_B, { page: 1, limit: 10 });
      expect(reportB.total).toBe(0);
      expect(reportB.items).toHaveLength(0);
    });
  });

  describe("Empty Datasets and Safe Denominators", () => {
    it("handles zero campaigns and zero messages cleanly without division by zero", async () => {
      const overview = await analyticsService.getOverview(ORG_A, { timeRange: "30d" });

      expect(overview.summary.totalCampaigns).toBe(0);
      expect(overview.summary.draftCampaigns).toBe(0);
      expect(overview.summary.scheduledCampaigns).toBe(0);
      expect(overview.summary.queuedCampaigns).toBe(0);
      expect(overview.summary.sendingCampaigns).toBe(0);
      expect(overview.summary.completedCampaigns).toBe(0);
      expect(overview.summary.completedWithIssuesCampaigns).toBe(0);
      expect(overview.summary.failedCampaigns).toBe(0);
      expect(overview.summary.cancelledCampaigns).toBe(0);
      expect(overview.summary.totalIntendedRecipients).toBe(0);
      expect(overview.summary.queuedMessages).toBe(0);
      expect(overview.summary.acceptedMessages).toBe(0);
      expect(overview.summary.sentMessages).toBe(0);
      expect(overview.summary.deliveredMessages).toBe(0);
      expect(overview.summary.readMessages).toBe(0);
      expect(overview.summary.failedMessages).toBe(0);
      expect(overview.summary.deliveryConfirmationPendingMessages).toBe(0);

      // Safe rates
      expect(overview.rates.deliveryRate.rate).toBe(0);
      expect(overview.rates.deliveryRate.denominator).toBe(0);
      expect(overview.rates.readRate.rate).toBe(0);
      expect(overview.rates.readRate.denominator).toBe(0);
      expect(overview.rates.failureRate.rate).toBe(0);
      expect(overview.rates.failureRate.denominator).toBe(0);

      // Clean array shapes
      expect(Array.isArray(overview.trends.campaignVolumeOverTime)).toBe(true);
      expect(Array.isArray(overview.trends.messageVolumeOverTime)).toBe(true);
      expect(Array.isArray(overview.trends.failureReasonsDistribution)).toBe(true);
      expect(overview.trends.failureReasonsDistribution).toHaveLength(0);

      // Paginated report empty state
      const report = await analyticsService.getDeliveryReport(ORG_A, { page: 1, limit: 20 });
      expect(report.total).toBe(0);
      expect(report.totalPages).toBe(0);
      expect(report.items).toHaveLength(0);
    });
  });

  describe("Summary Metrics & Completed with Issues Distinction", () => {
    it("accurately categorizes clean completed vs completed with issues", async () => {
      const now = new Date();

      // Campaign 1: Fully completed cleanly
      testCampaigns.push({
        id: "camp_clean",
        organizationId: ORG_A,
        name: "Clean Campaign",
        status: CampaignStatus.COMPLETED,
        templateName: "welcome_template",
        totalRecipients: 2,
        scheduledAt: null,
        startedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      testMessages.push(
        {
          id: "msg_1",
          organizationId: ORG_A,
          campaignId: "camp_clean",
          campaignNameSnapshot: "Clean Campaign",
          recipientPhone: "+919876543201",
          templateName: "welcome_template",
          templateLanguage: "en_US",
          status: MessageDeliveryStatus.READ,
          attemptCount: 1,
          errorCode: null,
          errorMessage: null,
          queuedAt: now,
          sentAt: now,
          deliveredAt: now,
          readAt: now,
          failedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "msg_2",
          organizationId: ORG_A,
          campaignId: "camp_clean",
          campaignNameSnapshot: "Clean Campaign",
          recipientPhone: "+919876543202",
          templateName: "welcome_template",
          templateLanguage: "en_US",
          status: MessageDeliveryStatus.DELIVERED,
          attemptCount: 1,
          errorCode: null,
          errorMessage: null,
          queuedAt: now,
          sentAt: now,
          deliveredAt: now,
          readAt: null,
          failedAt: null,
          createdAt: now,
          updatedAt: now,
        }
      );

      // Campaign 2: Completed but had 1 failed message
      testCampaigns.push({
        id: "camp_issues",
        organizationId: ORG_A,
        name: "Issues Campaign",
        status: CampaignStatus.COMPLETED,
        templateName: "discount_template",
        totalRecipients: 2,
        scheduledAt: null,
        startedAt: now,
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      testMessages.push(
        {
          id: "msg_3",
          organizationId: ORG_A,
          campaignId: "camp_issues",
          campaignNameSnapshot: "Issues Campaign",
          recipientPhone: "+919876543203",
          templateName: "discount_template",
          templateLanguage: "en_US",
          status: MessageDeliveryStatus.DELIVERED,
          attemptCount: 1,
          errorCode: null,
          errorMessage: null,
          queuedAt: now,
          sentAt: now,
          deliveredAt: now,
          readAt: null,
          failedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "msg_4",
          organizationId: ORG_A,
          campaignId: "camp_issues",
          campaignNameSnapshot: "Issues Campaign",
          recipientPhone: "+919876543204",
          templateName: "discount_template",
          templateLanguage: "en_US",
          status: MessageDeliveryStatus.FAILED,
          attemptCount: 3,
          errorCode: "131026",
          errorMessage: "Receiver phone number not registered on WhatsApp",
          queuedAt: now,
          sentAt: now,
          deliveredAt: null,
          readAt: null,
          failedAt: now,
          createdAt: now,
          updatedAt: now,
        }
      );

      // Additional campaigns in other lifecycle stages
      testCampaigns.push(
        {
          id: "camp_draft",
          organizationId: ORG_A,
          name: "Draft Campaign",
          status: CampaignStatus.DRAFT,
          templateName: "draft_tmpl",
          totalRecipients: 10,
          scheduledAt: null,
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "camp_sched",
          organizationId: ORG_A,
          name: "Scheduled Campaign",
          status: CampaignStatus.SCHEDULED,
          templateName: "sched_tmpl",
          totalRecipients: 25,
          scheduledAt: new Date(now.getTime() + 3600000), // +1 hour
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "camp_cancel",
          organizationId: ORG_A,
          name: "Cancelled Campaign",
          status: CampaignStatus.CANCELLED,
          templateName: "cancel_tmpl",
          totalRecipients: 5,
          scheduledAt: new Date(now.getTime() - 10000),
          startedAt: null,
          completedAt: null,
          createdAt: now,
          updatedAt: now,
        }
      );

      const overview = await analyticsService.getOverview(ORG_A, { timeRange: "30d" });

      expect(overview.summary.totalCampaigns).toBe(5);
      expect(overview.summary.completedCampaigns).toBe(1);
      expect(overview.summary.completedWithIssuesCampaigns).toBe(1);
      expect(overview.summary.draftCampaigns).toBe(1);
      expect(overview.summary.scheduledCampaigns).toBe(1);
      expect(overview.summary.cancelledCampaigns).toBe(1);

      // Total completed campaigns = 1 clean + 1 issues = 2
      expect(
        overview.summary.completedCampaigns + overview.summary.completedWithIssuesCampaigns
      ).toBe(2);

      // Message status checks
      expect(overview.summary.readMessages).toBe(1);
      expect(overview.summary.deliveredMessages).toBe(2);
      expect(overview.summary.failedMessages).toBe(1);
      expect(overview.summary.totalMessages).toBe(4);

      // Rates calculations
      // eligibleDispatched = delivered (2) + read (1) + failed (1) = 4
      // confirmedDelivered = delivered (2) + read (1) = 3
      // Delivery rate = (3 / 4) * 100 = 75.0%
      expect(overview.rates.deliveryRate.rate).toBe(75.0);
      expect(overview.rates.deliveryRate.numerator).toBe(3);
      expect(overview.rates.deliveryRate.denominator).toBe(4);

      // Read rate = read (1) / (delivered + read) (3) = 33.3%
      expect(overview.rates.readRate.rate).toBe(33.3);
      expect(overview.rates.readRate.numerator).toBe(1);
      expect(overview.rates.readRate.denominator).toBe(3);

      // Failure rate = failed (1) / attempted (4) = 25.0%
      expect(overview.rates.failureRate.rate).toBe(25.0);

      // Failure reason distribution
      expect(overview.trends.failureReasonsDistribution).toHaveLength(1);
      expect(overview.trends.failureReasonsDistribution[0].code).toBe("131026");
      expect(overview.trends.failureReasonsDistribution[0].count).toBe(1);
    });
  });

  describe("Scheduling & Restart Recovery Honest Reporting", () => {
    it("reports upcoming, overdue, and late schedules while stating restart recovery is unavailable", async () => {
      const now = new Date();

      // Upcoming
      testCampaigns.push({
        id: "camp_up",
        organizationId: ORG_A,
        name: "Future Scheduled",
        status: CampaignStatus.SCHEDULED,
        templateName: "festive",
        totalRecipients: 100,
        scheduledAt: new Date(now.getTime() + 86400000), // +24 hours
        startedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Overdue (waiting for dispatch)
      testCampaigns.push({
        id: "camp_overdue",
        organizationId: ORG_A,
        name: "Overdue Scheduled",
        status: CampaignStatus.SCHEDULED,
        templateName: "festive",
        totalRecipients: 50,
        scheduledAt: new Date(now.getTime() - 600000), // -10 minutes
        startedAt: null,
        completedAt: null,
        createdAt: now,
        updatedAt: now,
      });

      // Dispatched late (>2 min difference)
      testCampaigns.push({
        id: "camp_late",
        organizationId: ORG_A,
        name: "Late Dispatched",
        status: CampaignStatus.COMPLETED,
        templateName: "festive",
        totalRecipients: 80,
        scheduledAt: new Date(now.getTime() - 3600000), // scheduled 1 hour ago
        startedAt: new Date(now.getTime() - 3600000 + 300000), // started 5 minutes later (> 120s)
        completedAt: now,
        createdAt: now,
        updatedAt: now,
      });

      const overview = await analyticsService.getOverview(ORG_A, { timeRange: "30d" });

      expect(overview.scheduling.upcomingCount).toBe(1);
      expect(overview.scheduling.upcomingCampaigns[0].id).toBe("camp_up");

      expect(overview.scheduling.overdueCount).toBe(1);
      expect(overview.scheduling.overdueCampaigns[0].id).toBe("camp_overdue");

      expect(overview.scheduling.dispatchedLateCount).toBe(1);
      expect(overview.scheduling.dispatchedLateCampaigns[0].id).toBe("camp_late");

      // Restart recovery honest disclosure
      expect(overview.scheduling.restartRecovery.isAvailable).toBe(false);
      expect(overview.scheduling.restartRecovery.historicalCount).toBeNull();
      expect(overview.scheduling.restartRecovery.status).toBe("UNAVAILABLE");
      expect(overview.scheduling.restartRecovery.reason).toContain("not persisted as database event records");
      expect(overview.scheduling.restartRecovery.additiveDesignProposal).toContain("system_recovery_logs");
    });
  });

  describe("Recipient-Level Paginated Delivery Report", () => {
    it("supports search, status filtering, and pagination with masked phones", async () => {
      const now = new Date();
      testMessages.push(
        {
          id: "msg_p1",
          organizationId: ORG_A,
          campaignId: "c1",
          campaignNameSnapshot: "Diwali Offer",
          recipientPhone: "+919876543210",
          templateName: "diwali_greeting",
          templateLanguage: "hi_IN",
          status: MessageDeliveryStatus.READ,
          attemptCount: 1,
          errorCode: null,
          errorMessage: null,
          queuedAt: now,
          sentAt: now,
          deliveredAt: now,
          readAt: now,
          failedAt: null,
          createdAt: now,
          updatedAt: now,
        },
        {
          id: "msg_p2",
          organizationId: ORG_A,
          campaignId: "c1",
          campaignNameSnapshot: "Diwali Offer",
          recipientPhone: "+919123456789",
          templateName: "diwali_greeting",
          templateLanguage: "hi_IN",
          status: MessageDeliveryStatus.FAILED,
          attemptCount: 2,
          errorCode: "131047",
          errorMessage: "Spam rate limit encountered",
          queuedAt: now,
          sentAt: now,
          deliveredAt: null,
          readAt: null,
          failedAt: now,
          createdAt: now,
          updatedAt: now,
        }
      );

      // Search by phone partial
      const phoneSearch = await analyticsService.getDeliveryReport(ORG_A, {
        search: "98765",
        page: 1,
        limit: 10,
      });
      expect(phoneSearch.total).toBe(1);
      expect(phoneSearch.items[0].recipientPhoneMasked).toBe("+9198••••••10");
      expect(phoneSearch.items[0].status).toBe(MessageDeliveryStatus.READ);

      // Filter by status = FAILED
      const failedFilter = await analyticsService.getDeliveryReport(ORG_A, {
        status: "FAILED",
        page: 1,
        limit: 10,
      });
      expect(failedFilter.total).toBe(1);
      expect(failedFilter.items[0].status).toBe(MessageDeliveryStatus.FAILED);
      expect(failedFilter.items[0].errorCode).toBe("131047");
      expect(failedFilter.items[0].errorMessage).toBe("Spam rate limit encountered");
    });
  });
});
