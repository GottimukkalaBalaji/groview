import { describe, it, expect, beforeEach, vi } from "vitest";
import { CampaignStatus, MessageDeliveryStatus } from "@prisma/client";
import { campaignService } from "../services/campaign.service.js";
import { CampaignLifecycleService } from "../services/campaignLifecycle.service.js";

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

// Mock Prisma client to keep tests purely isolated, deterministic, and fast
vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => ({
      organization: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === "org_test_completion") {
            return { id: "org_test_completion", name: "Test Org", slug: "test-org" };
          }
          return null;
        }),
      },
      campaign: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            testCampaigns.find(
              (c) =>
                c.id === where.id &&
                (!where.organizationId || c.organizationId === where.organizationId)
            ) || null
          );
        }),
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          return testCampaigns.filter(
            (c) => !where.organizationId || c.organizationId === where.organizationId
          );
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          return testCampaigns.filter(
            (c) => !where.organizationId || c.organizationId === where.organizationId
          ).length;
        }),
        groupBy: vi.fn().mockImplementation(async ({ where }) => {
          const filtered = testCampaigns.filter(
            (c) => !where.organizationId || c.organizationId === where.organizationId
          );
          const map = new Map<string, number>();
          for (const item of filtered) {
            map.set(item.status, (map.get(item.status) || 0) + 1);
          }
          return Array.from(map.entries()).map(([status, count]) => ({
            status,
            _count: { _all: count },
          }));
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          testCampaigns.forEach((c, idx) => {
            const matchesId = !where.id || c.id === where.id;
            let matchesStatus = true;
            if (where.status) {
              if (where.status.in) {
                matchesStatus = where.status.in.includes(c.status);
              } else {
                matchesStatus = c.status === where.status;
              }
            }
            if (matchesId && matchesStatus) {
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
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.status) {
              if (where.status.in && !where.status.in.includes(m.status)) return false;
              if (typeof where.status === "string" && m.status !== where.status) return false;
            }
            return true;
          }).length;
        }),
        groupBy: vi.fn().mockImplementation(async ({ where, by }) => {
          const matching = testMessages.filter((m) => {
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.campaignId) {
              if (where.campaignId.in && !where.campaignId.in.includes(m.campaignId)) return false;
              if (typeof where.campaignId === "string" && m.campaignId !== where.campaignId)
                return false;
            }
            return true;
          });

          const hasCampaignId = by && by.includes("campaignId");
          const counts = new Map<string, { campaignId?: string; status: string; count: number }>();

          for (const m of matching) {
            const key = hasCampaignId ? `${m.campaignId}:${m.status}` : m.status;
            let entry = counts.get(key);
            if (!entry) {
              entry = {
                ...(hasCampaignId ? { campaignId: m.campaignId || undefined } : {}),
                status: m.status,
                count: 0,
              };
              counts.set(key, entry);
            }
            entry.count++;
          }

          return Array.from(counts.values()).map((e) => ({
            ...(hasCampaignId ? { campaignId: e.campaignId } : {}),
            status: e.status,
            _count: { _all: e.count },
          }));
        }),
      },
    }),
  };
});

describe("Campaign Completion & Delivery Status Aggregation Rules", () => {
  const orgId = "org_test_completion";

  beforeEach(() => {
    testCampaigns = [];
    testMessages = [];
    vi.restoreAllMocks();
  });

  const createBaseCampaign = (id: string, name: string, status: CampaignStatus, totalRecipients: number): MockCampaign => ({
    id,
    organizationId: orgId,
    name,
    status,
    templateId: "tpl_1",
    templateName: "promo",
    templateLanguage: "en_US",
    templateCategory: "MARKETING",
    variablesMapping: {},
    audienceType: "CONTACT_LIST",
    audienceName: "Audience",
    totalRecipients,
    scheduledAt: null,
    startedAt: new Date(),
    completedAt: null,
    createdBy: "system_user",
    createdAt: new Date(),
    updatedAt: new Date(),
  });

  describe("1. All-Success Campaign Scenario", () => {
    it("aggregates only confirmed DELIVERED and READ as successful delivery", async () => {
      const campaignId = "cmp_all_success";
      testCampaigns.push(createBaseCampaign(campaignId, "All Success", CampaignStatus.COMPLETED, 3));

      testMessages.push(
        { id: "m1", organizationId: orgId, campaignId, status: MessageDeliveryStatus.DELIVERED, wamid: "w1", recipientPhone: "+919876543210", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: new Date(), readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m2", organizationId: orgId, campaignId, status: MessageDeliveryStatus.DELIVERED, wamid: "w2", recipientPhone: "+919876543211", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: new Date(), readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m3", organizationId: orgId, campaignId, status: MessageDeliveryStatus.READ, wamid: "w3", recipientPhone: "+919876543212", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: new Date(), readAt: new Date(), failedAt: null, errorCode: null, errorMessage: null }
      );

      const res = (await campaignService.getCampaignById(orgId, campaignId)) as any;

      expect(res.deliveredCount).toBe(2);
      expect(res.readCount).toBe(1);
      expect(res.failedCount).toBe(0);
      expect(res.sentCount).toBe(0);
      expect(res.deliveredCount + res.readCount).toBe(3);
    });
  });

  describe("2. Mixed Success & Failure (Completed with Issues) Scenario", () => {
    it("isolates invalid test recipient as failed without marking valid recipient as failed", async () => {
      const campaignId = "cmp_mixed_outcome";
      testCampaigns.push(createBaseCampaign(campaignId, "Mixed Campaign", CampaignStatus.SENDING, 2));

      // Recipient 1: Valid phone -> successfully DELIVERED
      testMessages.push({
        id: "m_valid",
        organizationId: orgId,
        campaignId,
        status: MessageDeliveryStatus.DELIVERED,
        wamid: "w_val",
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

      // Recipient 2: Deliberately invalid phone -> FAILED with explicit reason
      testMessages.push({
        id: "m_invalid",
        organizationId: orgId,
        campaignId,
        status: MessageDeliveryStatus.FAILED,
        wamid: null,
        recipientPhone: "+910000000000",
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
        errorMessage: "Invalid recipient phone number: not registered on WhatsApp",
      });

      // Evaluate lifecycle: dispatch is complete, at least one succeeded -> transitions to COMPLETED
      const finalStatus = await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
      expect(finalStatus).toBe(CampaignStatus.COMPLETED);

      const res = (await campaignService.getCampaignById(orgId, campaignId)) as any;
      expect(res.deliveredCount).toBe(1);
      expect(res.failedCount).toBe(1);
      expect(res.sentCount).toBe(0);

      // Verify individual message records in mock store
      const validMsg = testMessages.find((m) => m.id === "m_valid");
      const invalidMsg = testMessages.find((m) => m.id === "m_invalid");

      expect(validMsg?.status).toBe(MessageDeliveryStatus.DELIVERED);
      expect(invalidMsg?.status).toBe(MessageDeliveryStatus.FAILED);
      expect(invalidMsg?.errorMessage).toContain("not registered on WhatsApp");
    });
  });

  describe("3. All-Failed Campaign Scenario", () => {
    it("transitions campaign to FAILED when all messages fail", async () => {
      const campaignId = "cmp_all_failed";
      testCampaigns.push(createBaseCampaign(campaignId, "All Failed Campaign", CampaignStatus.SENDING, 2));

      testMessages.push(
        { id: "m_fail_1", organizationId: orgId, campaignId, status: MessageDeliveryStatus.FAILED, wamid: null, recipientPhone: "+910000000001", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: new Date(), errorCode: "131026", errorMessage: "Failed 1" },
        { id: "m_fail_2", organizationId: orgId, campaignId, status: MessageDeliveryStatus.FAILED, wamid: null, recipientPhone: "+910000000002", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: new Date(), errorCode: "131026", errorMessage: "Failed 2" }
      );

      const finalStatus = await CampaignLifecycleService.evaluateCampaignLifecycle(campaignId);
      expect(finalStatus).toBe(CampaignStatus.FAILED);

      const res = (await campaignService.getCampaignById(orgId, campaignId)) as any;
      expect(res.status).toBe(CampaignStatus.FAILED);
      expect(res.failedCount).toBe(2);
      expect(res.deliveredCount).toBe(0);
      expect(res.readCount).toBe(0);
      expect(res.sentCount).toBe(0);
    });
  });

  describe("4. Pending Delivery Confirmation Scenario", () => {
    it("strictly counts ACCEPTED and SENT in sentCount and NOT in deliveredCount", async () => {
      const campaignId = "cmp_pending_confirmation";
      testCampaigns.push(createBaseCampaign(campaignId, "In Flight Campaign", CampaignStatus.COMPLETED, 3));

      testMessages.push(
        { id: "m_acc", organizationId: orgId, campaignId, status: MessageDeliveryStatus.ACCEPTED, wamid: "w_acc", recipientPhone: "+919876543210", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: null, readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m_sent", organizationId: orgId, campaignId, status: MessageDeliveryStatus.SENT, wamid: "w_sent", recipientPhone: "+919876543211", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: null, readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m_unconf", organizationId: orgId, campaignId, status: MessageDeliveryStatus.SUBMITTED_UNCONFIRMED, wamid: null, recipientPhone: "+919876543212", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: null, errorCode: null, errorMessage: null }
      );

      const res = (await campaignService.getCampaignById(orgId, campaignId)) as any;

      // ACCEPTED and SENT are aggregated into sentCount (in-transit)
      expect(res.sentCount).toBe(2);
      // Confirmed delivery remains 0 until webhooks arrive
      expect(res.deliveredCount).toBe(0);
      expect(res.readCount).toBe(0);
      expect(res.failedCount).toBe(0);
    });
  });

  describe("5. listCampaigns Delivery Metrics Enrichment", () => {
    it("enriches items in listCampaigns with sentCount, deliveredCount, readCount, and failedCount", async () => {
      testCampaigns.push(createBaseCampaign("cmp_list_1", "Campaign 1", CampaignStatus.COMPLETED, 2));

      testMessages.push(
        { id: "m_l1", organizationId: orgId, campaignId: "cmp_list_1", status: MessageDeliveryStatus.DELIVERED, wamid: "w_l1", recipientPhone: "+919876543210", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: new Date(), deliveredAt: new Date(), readAt: null, failedAt: null, errorCode: null, errorMessage: null },
        { id: "m_l2", organizationId: orgId, campaignId: "cmp_list_1", status: MessageDeliveryStatus.FAILED, wamid: null, recipientPhone: "+919876543211", templateName: "promo", templateLanguage: "en_US", parameters: {}, attemptCount: 1, leaseExpiresAt: null, sentAt: null, deliveredAt: null, readAt: null, failedAt: new Date(), errorCode: "131026", errorMessage: "Failed" }
      );

      const listResult = (await campaignService.listCampaigns(orgId, { page: 1, limit: 10 })) as any;

      expect(listResult.items.length).toBe(1);
      const item = listResult.items[0];
      expect(item.id).toBe("cmp_list_1");
      expect(item.deliveredCount).toBe(1);
      expect(item.failedCount).toBe(1);
      expect(item.sentCount).toBe(0);
      expect(item.readCount).toBe(0);
    });
  });
});
