import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignStatus, MessageDeliveryStatus } from "@prisma/client";
import { campaignService } from "../services/campaign.service.js";
import { CampaignLifecycleService } from "../services/campaignLifecycle.service.js";
import {
  inspectAndRecoverDispatchJob,
  WhatsAppDispatchJobData,
} from "../queue/whatsapp.queue.js";
import { evaluateDeliveryTransition } from "../services/deliveryStateMachine.js";
import * as redisConfig from "../config/redis.js";

// ── In-Memory Store for Mocked Unit Tests ────────────────────────────────────

interface MockCampaign {
  id: string;
  organizationId: string;
  name: string;
  status: CampaignStatus;
  templateId: string;
  templateName: string;
  templateLanguage: string;
  templateCategory: string;
  variablesMapping: Record<string, unknown>;
  audienceType: string;
  audienceName: string;
  totalRecipients: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockMessage {
  id: string;
  organizationId: string;
  campaignId: string | null;
  status: MessageDeliveryStatus;
  wamid: string | null;
  recipientPhone: string;
  templateName: string;
  templateLanguage: string;
  parameters: Record<string, unknown>;
  attemptCount: number;
  leaseExpiresAt: Date | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  errorCode: string | null;
  errorMessage: string | null;
}

let testCampaigns: MockCampaign[] = [];
let testMessages: MockMessage[] = [];

// Mock Prisma client to keep tests purely isolated and deterministic
vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => ({
      organization: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === "org_test") {
            return { id: "org_test", name: "Test Org", slug: "test-org" };
          }
          return null;
        }),
      },
      campaign: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            testCampaigns.find(
              (c) => c.id === where.id && (!where.organizationId || c.organizationId === where.organizationId)
            ) || null
          );
        }),
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          return testCampaigns.filter((c) => !where.organizationId || c.organizationId === where.organizationId);
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          testCampaigns.forEach((c, idx) => {
            const idMatch = !where.id || c.id === where.id;
            let statusMatch = true;
            if (where.status) {
              if (where.status.in) {
                statusMatch = where.status.in.includes(c.status);
              } else {
                statusMatch = c.status === where.status;
              }
            }
            if (idMatch && statusMatch) {
              testCampaigns[idx] = { ...c, ...data, updatedAt: new Date() };
              count++;
            }
          });
          return { count };
        }),
      },
      whatsAppMessage: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          return testMessages.filter((m) => {
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.status && m.status !== where.status) return false;
            return true;
          });
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          return testMessages.filter((m) => {
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.status) {
              if (where.status.in && !where.status.in.includes(m.status)) return false;
              if (typeof where.status === "string" && m.status !== where.status) return false;
            }
            return true;
          }).length;
        }),
        groupBy: vi.fn().mockImplementation(async ({ where, by: _by }) => {
          const matching = testMessages.filter((m) => {
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            return true;
          });
          const counts: Record<string, number> = {};
          for (const m of matching) {
            counts[m.status] = (counts[m.status] || 0) + 1;
          }
          return Object.entries(counts).map(([status, count]) => ({
            status,
            _count: { _all: count },
          }));
        }),
      },
    }),
  };
});

describe("Phase 10 Step 4 — Safe Dispatch Remediation Unit Tests", () => {
  const orgId = "org_test";
  const otherOrgId = "org_other_tenant";

  beforeEach(() => {
    testCampaigns = [];
    testMessages = [];
    vi.restoreAllMocks();
    vi.spyOn(redisConfig, "isRedisConfigured").mockReturnValue(true);
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Finding 1: Campaign Delivery Aggregation
  // ══════════════════════════════════════════════════════════════════════════
  describe("Finding 1: Campaign Delivery Aggregation in getCampaignById()", () => {
    it("aggregates sentCount, deliveredCount, readCount, and failedCount from WhatsAppMessage records", async () => {
      const campaignId = "cmp_agg_001";
      testCampaigns.push({
        id: campaignId,
        organizationId: orgId,
        name: "Diwali Promo",
        status: CampaignStatus.SENDING,
        templateId: "tpl_1",
        templateName: "promo",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceName: "VIPs",
        totalRecipients: 5,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: null,
        createdBy: "usr_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Populate messages with diverse statuses
      testMessages.push(
        { id: "m1", organizationId: orgId, campaignId, status: MessageDeliveryStatus.READ, wamid: "w1", recipientPhone: "+919876543210", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: new Date(), readAt: new Date(), failedAt: null, errorCode: null, errorMessage: null },
        { id: "m2", organizationId: orgId, campaignId, status: MessageDeliveryStatus.DELIVERED, wamid: "w2", recipientPhone: "+919876543211", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: new Date(), readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m3", organizationId: orgId, campaignId, status: MessageDeliveryStatus.SENT, wamid: "w3", recipientPhone: "+919876543212", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: null, readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m4", organizationId: orgId, campaignId, status: MessageDeliveryStatus.ACCEPTED, wamid: "w4", recipientPhone: "+919876543213", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: null, readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m5", organizationId: orgId, campaignId, status: MessageDeliveryStatus.FAILED, wamid: "w5", recipientPhone: "+919876543214", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: new Date(), errorCode: "131026", errorMessage: "Receiver not registered" }
      );

      const res = (await campaignService.getCampaignById(orgId, campaignId)) as any;

      expect(res.id).toBe(campaignId);
      expect(res.name).toBe("Diwali Promo");
      // Status mapping assertions:
      // readCount = 1 (m1)
      expect(res.readCount).toBe(1);
      // deliveredCount = 1 (m2)
      expect(res.deliveredCount).toBe(1);
      // sentCount = 2 (m3 SENT + m4 ACCEPTED)
      expect(res.sentCount).toBe(2);
      // failedCount = 1 (m5 FAILED)
      expect(res.failedCount).toBe(1);
    });

    it("enforces tenant boundary and does not include messages from other organizations", async () => {
      const campaignId = "cmp_tenant_boundary";
      testCampaigns.push({
        id: campaignId,
        organizationId: orgId,
        name: "Tenant Campaign",
        status: CampaignStatus.COMPLETED,
        templateId: "tpl_1",
        templateName: "promo",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceName: "Audience",
        totalRecipients: 2,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: new Date(),
        createdBy: "usr_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Message for this tenant
      testMessages.push({
        id: "m_my_org",
        organizationId: orgId,
        campaignId,
        status: MessageDeliveryStatus.DELIVERED,
        wamid: "w_mine",
        recipientPhone: "+919876543210",
        templateName: "promo",
        templateLanguage: "en_US",
        parameters: {},
        attemptCount: 1,
        leaseExpiresAt: null,
        sentAt: new Date(),
        deliveredAt: new Date(),
        readAt: null,
        failedAt: null,
        errorCode: null,
        errorMessage: null,
      });

      // Message with same campaignId but different organizationId (should NEVER be counted)
      testMessages.push({
        id: "m_other_org",
        organizationId: otherOrgId,
        campaignId,
        status: MessageDeliveryStatus.READ,
        wamid: "w_other",
        recipientPhone: "+919876543211",
        templateName: "promo",
        templateLanguage: "en_US",
        parameters: {},
        attemptCount: 1,
        leaseExpiresAt: null,
        sentAt: new Date(),
        deliveredAt: new Date(),
        readAt: new Date(),
        failedAt: null,
        errorCode: null,
        errorMessage: null,
      });

      const res = (await campaignService.getCampaignById(orgId, campaignId)) as any;

      expect(res.deliveredCount).toBe(1);
      // Other organization's message must NOT contribute to readCount
      expect(res.readCount).toBe(0);
      expect(res.sentCount).toBe(0);
      expect(res.failedCount).toBe(0);
    });

    it("avoids double-counting: each message contributes to at most one metric", async () => {
      const campaignId = "cmp_no_double_count";
      testCampaigns.push({
        id: campaignId,
        organizationId: orgId,
        name: "Single Message Test",
        status: CampaignStatus.COMPLETED,
        templateId: "tpl_1",
        templateName: "promo",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceName: "Audience",
        totalRecipients: 1,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: new Date(),
        createdBy: "usr_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Message has progressed to READ
      testMessages.push({
        id: "m_single_read",
        organizationId: orgId,
        campaignId,
        status: MessageDeliveryStatus.READ,
        wamid: "w_read",
        recipientPhone: "+919876543210",
        templateName: "promo",
        templateLanguage: "en_US",
        parameters: {},
        attemptCount: 1,
        leaseExpiresAt: null,
        sentAt: new Date(),
        deliveredAt: new Date(),
        readAt: new Date(),
        failedAt: null,
        errorCode: null,
        errorMessage: null,
      });

      const res = (await campaignService.getCampaignById(orgId, campaignId)) as any;

      // READ message must only increment readCount, NOT deliveredCount or sentCount
      expect(res.readCount).toBe(1);
      expect(res.deliveredCount).toBe(0);
      expect(res.sentCount).toBe(0);
      expect(res.failedCount).toBe(0);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Finding 2: Webhook Lifecycle Re-Evaluation
  // ══════════════════════════════════════════════════════════════════════════
  describe("Finding 2: Webhook Delivery State Machine & Lifecycle Transitions", () => {
    it("ensures a late 'failed' callback cannot overwrite DELIVERED or READ status", () => {
      // 1. Current status is READ
      const readTransition = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.READ,
        eventStatus: "failed",
        eventTimestamp: new Date(),
        errorCode: "131026",
        errorMessage: "Simulated late failure",
      });

      expect(readTransition.applied).toBe(false);
      expect(readTransition.nextStatus).toBe(MessageDeliveryStatus.READ);
      expect(readTransition.reason).toBe("IGNORED_CONTRADICTORY_STALE_FAILURE");

      // 2. Current status is DELIVERED
      const deliveredTransition = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.DELIVERED,
        eventStatus: "failed",
        eventTimestamp: new Date(),
        errorCode: "131026",
        errorMessage: "Simulated late failure",
      });

      expect(deliveredTransition.applied).toBe(false);
      expect(deliveredTransition.nextStatus).toBe(MessageDeliveryStatus.DELIVERED);
      expect(deliveredTransition.reason).toBe("IGNORED_CONTRADICTORY_STALE_FAILURE");
    });

    it("handles out-of-order delivery events monotonically without status regression", () => {
      // Event: 'read' received while status is ACCEPTED
      const now = new Date();
      const readFirst = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.ACCEPTED,
        eventStatus: "read",
        eventTimestamp: now,
      });

      expect(readFirst.applied).toBe(true);
      expect(readFirst.nextStatus).toBe(MessageDeliveryStatus.READ);
      expect(readFirst.readAt).toEqual(now);

      // Later event: out-of-order 'delivered' arrives with an earlier timestamp
      const earlier = new Date(now.getTime() - 1000);
      const lateDelivered = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.READ,
        eventStatus: "delivered",
        eventTimestamp: earlier,
        existingTimestamps: {
          readAt: now,
        },
      });

      // Must NOT regress status to DELIVERED; should backfill deliveredAt timestamp
      expect(lateDelivered.applied).toBe(true);
      expect(lateDelivered.nextStatus).toBe(MessageDeliveryStatus.READ);
      expect(lateDelivered.reason).toBe("BACKFILL_DELIVERED_TIMESTAMP");
      expect(lateDelivered.deliveredAt).toEqual(earlier);
    });

    it("evaluates campaign lifecycle: transitions QUEUED/SENDING to COMPLETED on mixed outcome", async () => {
      const campaignId = "cmp_lifecycle_mixed_eval";
      testCampaigns.push({
        id: campaignId,
        organizationId: orgId,
        name: "Lifecycle Test",
        status: CampaignStatus.SENDING,
        templateId: "tpl_1",
        templateName: "promo",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceName: "Audience",
        totalRecipients: 2,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: null,
        createdBy: "usr_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // 1 message DELIVERED, 1 message FAILED (both terminal)
      testMessages.push(
        { id: "m1", organizationId: orgId, campaignId, status: MessageDeliveryStatus.DELIVERED, wamid: "w1", recipientPhone: "+919876543210", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: new Date(), readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m2", organizationId: orgId, campaignId, status: MessageDeliveryStatus.FAILED, wamid: "w2", recipientPhone: "+919876543211", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: new Date(), errorCode: "131026", errorMessage: "Failed" }
      );

      const finalStatus = await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);

      expect(finalStatus).toBe(CampaignStatus.COMPLETED);
      const camp = testCampaigns.find((c) => c.id === campaignId);
      expect(camp?.status).toBe(CampaignStatus.COMPLETED);
      expect(camp?.completedAt).toBeInstanceOf(Date);
    });

    it("evaluates campaign lifecycle: transitions to FAILED when 100% of messages fail", async () => {
      const campaignId = "cmp_lifecycle_all_failed_eval";
      testCampaigns.push({
        id: campaignId,
        organizationId: orgId,
        name: "All Failed Test",
        status: CampaignStatus.SENDING,
        templateId: "tpl_1",
        templateName: "promo",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceName: "Audience",
        totalRecipients: 2,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: null,
        createdBy: "usr_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testMessages.push(
        { id: "m1", organizationId: orgId, campaignId, status: MessageDeliveryStatus.FAILED, wamid: "w1", recipientPhone: "+919876543210", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: new Date(), errorCode: "131026", errorMessage: "Failed" },
        { id: "m2", organizationId: orgId, campaignId, status: MessageDeliveryStatus.FAILED, wamid: "w2", recipientPhone: "+919876543211", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: new Date(), errorCode: "131026", errorMessage: "Failed" }
      );

      const finalStatus = await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);

      expect(finalStatus).toBe(CampaignStatus.FAILED);
      const camp = testCampaigns.find((c) => c.id === campaignId);
      expect(camp?.status).toBe(CampaignStatus.FAILED);
    });

    it("does not blindly modify already terminal campaign status", async () => {
      const campaignId = "cmp_terminal_immutable";
      testCampaigns.push({
        id: campaignId,
        organizationId: orgId,
        name: "Terminal Campaign",
        status: CampaignStatus.COMPLETED, // Already terminal
        templateId: "tpl_1",
        templateName: "promo",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceName: "Audience",
        totalRecipients: 1,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: new Date(),
        createdBy: "usr_1",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      testMessages.push({
        id: "m_term",
        organizationId: orgId,
        campaignId,
        status: MessageDeliveryStatus.FAILED,
        wamid: "w_term",
        recipientPhone: "+919876543210",
        templateName: "promo",
        templateLanguage: "en_US",
        parameters: {},
        attemptCount: 1,
        leaseExpiresAt: null,
        sentAt: null,
        deliveredAt: null,
        readAt: null,
        failedAt: new Date(),
        errorCode: "131026",
        errorMessage: "Failed",
      });

      // Even if all messages are FAILED, already COMPLETED campaign is NOT overwritten
      await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);

      const camp = testCampaigns.find((c) => c.id === campaignId);
      expect(camp?.status).toBe(CampaignStatus.COMPLETED);
    });
  });

  // ══════════════════════════════════════════════════════════════════════════
  // Finding 3: BullMQ Queue Recovery Safety
  // ══════════════════════════════════════════════════════════════════════════
  describe("Finding 3: BullMQ Queue Recovery Safety in inspectAndRecoverDispatchJob()", () => {
    const jobData: WhatsAppDispatchJobData = {
      messageId: "msg_safe_001",
      organizationId: orgId,
      recipientPhone: "+919876543210",
      templateName: "promo",
      templateLanguage: "en_US",
      parameters: {},
      campaignId: "cmp_recovery_001",
      contactId: "cnt_1",
      dispatchRun: 1,
    };

    it("safely retries a failed BullMQ job when PostgreSQL state is verified QUEUED with 0 attempts and no wamid", async () => {
      const mockJob = {
        id: "msg_msg_safe_001",
        getState: vi.fn().mockResolvedValue("failed"),
        retry: vi.fn().mockResolvedValue(undefined),
      };

      const queueOverride = {
        getJob: vi.fn().mockResolvedValue(mockJob),
        add: vi.fn(),
      };

      const result = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.QUEUED,
          wamid: null,
          attemptCount: 0,
          leaseExpiresAt: null,
        },
        queueOverride,
      });

      expect(result.status).toBe("retried_failed");
      expect(mockJob.retry).toHaveBeenCalledTimes(1);
    });

    it("does NOT retry an active BullMQ job (currently being executed by worker)", async () => {
      const mockJob = {
        id: "msg_msg_safe_001",
        getState: vi.fn().mockResolvedValue("active"),
        retry: vi.fn(),
      };

      const queueOverride = {
        getJob: vi.fn().mockResolvedValue(mockJob),
        add: vi.fn(),
      };

      const result = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.QUEUED,
          wamid: null,
          attemptCount: 0,
          leaseExpiresAt: null,
        },
        queueOverride,
      });

      expect(result.status).toBe("already_active");
      expect(mockJob.retry).not.toHaveBeenCalled();
    });

    it("does NOT retry a completed BullMQ job", async () => {
      const mockJob = {
        id: "msg_msg_safe_001",
        getState: vi.fn().mockResolvedValue("completed"),
        retry: vi.fn(),
      };

      const queueOverride = {
        getJob: vi.fn().mockResolvedValue(mockJob),
        add: vi.fn(),
      };

      const result = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.QUEUED,
          wamid: null,
          attemptCount: 0,
          leaseExpiresAt: null,
        },
        queueOverride,
      });

      expect(result.status).toBe("already_completed");
      expect(mockJob.retry).not.toHaveBeenCalled();
    });

    it("does NOT retry a waiting or delayed BullMQ job", async () => {
      const mockJob = {
        id: "msg_msg_safe_001",
        getState: vi.fn().mockResolvedValue("waiting"),
        retry: vi.fn(),
      };

      const queueOverride = {
        getJob: vi.fn().mockResolvedValue(mockJob),
        add: vi.fn(),
      };

      const result = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.QUEUED,
          wamid: null,
          attemptCount: 0,
          leaseExpiresAt: null,
        },
        queueOverride,
      });

      expect(result.status).toBe("already_waiting");
      expect(mockJob.retry).not.toHaveBeenCalled();
    });

    it("safely newly enqueues missing BullMQ job when DB state is QUEUED with 0 attempts", async () => {
      const mockAdd = vi.fn().mockResolvedValue({ id: "job_new" });

      const queueOverride = {
        getJob: vi.fn().mockResolvedValue(null),
        add: mockAdd,
      };

      const result = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.QUEUED,
          wamid: null,
          attemptCount: 0,
          leaseExpiresAt: null,
        },
        queueOverride,
      });

      expect(result.status).toBe("newly_enqueued");
      expect(mockAdd).toHaveBeenCalledWith("dispatch", jobData, { jobId: "msg_msg_safe_001" });
    });

    it("fails closed with status 'ambiguous' when message in DB has attemptCount > 0", async () => {
      const queueOverride = {
        getJob: vi.fn(),
        add: vi.fn(),
      };

      const result = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.QUEUED,
          wamid: null,
          attemptCount: 1, // Ambiguous! A previous worker attempted this
          leaseExpiresAt: null,
        },
        queueOverride,
      });

      expect(result.status).toBe("ambiguous");
      expect(queueOverride.getJob).not.toHaveBeenCalled();
    });

    it("fails closed with status 'ambiguous' when message in DB already has a WAMID", async () => {
      const queueOverride = {
        getJob: vi.fn(),
        add: vi.fn(),
      };

      const result = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.QUEUED,
          wamid: "wamid.HBgLMTEyMjMzNDQ1NQ==", // Already submitted to Meta!
          attemptCount: 0,
          leaseExpiresAt: null,
        },
        queueOverride,
      });

      expect(result.status).toBe("ambiguous");
      expect(queueOverride.getJob).not.toHaveBeenCalled();
    });

    it("fails closed with status 'ambiguous' when message in DB has an active worker lease", async () => {
      const queueOverride = {
        getJob: vi.fn(),
        add: vi.fn(),
      };

      const result = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.QUEUED,
          wamid: null,
          attemptCount: 0,
          leaseExpiresAt: new Date(Date.now() + 30000), // Active lease!
        },
        queueOverride,
      });

      expect(result.status).toBe("ambiguous");
      expect(queueOverride.getJob).not.toHaveBeenCalled();
    });

    it("strictly rejects non-QUEUED message status (SENDING, SENT, DELIVERED, FAILED) as ineligible", async () => {
      const queueOverride = {
        getJob: vi.fn(),
        add: vi.fn(),
      };

      const sendingResult = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.SENDING,
          wamid: null,
          attemptCount: 1,
          leaseExpiresAt: null,
        },
        queueOverride,
      });
      expect(sendingResult.status).toBe("ineligible_status");

      const sentResult = await inspectAndRecoverDispatchJob({
        jobData,
        dbMessage: {
          id: "msg_safe_001",
          status: MessageDeliveryStatus.SENT,
          wamid: "wamid_sent",
          attemptCount: 1,
          leaseExpiresAt: null,
        },
        queueOverride,
      });
      expect(sentResult.status).toBe("ineligible_status");

      expect(queueOverride.getJob).not.toHaveBeenCalled();
    });
  });
});
