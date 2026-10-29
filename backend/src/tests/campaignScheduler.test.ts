import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { CampaignStatus } from "@prisma/client";
import {
  DEFAULT_BUSINESS_TIMEZONE,
  isValidFutureSchedule,
  parseScheduleToUTC,
  formatInBusinessTimezone,
} from "../utils/timezone.js";
import {
  campaignSchedulerService,
  PRE_ENQUEUE_LEAD_MS,
} from "../services/campaignScheduler.service.js";
import { campaignService, CampaignApprovalStatus } from "../services/campaign.service.js";
import * as automaticWorkerService from "../services/automaticWorker.service.js";
import { ALLOWED_TEST_TEMPLATE_NAMES, setAllowedTestTemplates } from "../constants/templateAllowlist.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { processDispatchMessage } from "../workers/dispatch.worker.js";
import { WhatsAppSendService } from "../services/whatsappSend.service.js";
import { MetaConfigResolver } from "../services/metaConfigResolver.js";
import { WebhookService } from "../services/webhook.service.js";
import * as whatsappQueueModule from "../queue/whatsapp.queue.js";
import { inspectAndRecoverDispatchJob, enqueueWhatsAppDispatchJob } from "../queue/whatsapp.queue.js";
import * as redisModule from "../config/redis.js";

// In-memory mock store for isolated test execution
interface MockCampaign {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  approvalStatus?: CampaignApprovalStatus;
  approvedAt?: Date | null;
  approvedBy?: string | null;
  approvalNotes?: string | null;
  rejectedAt?: Date | null;
  rejectedBy?: string | null;
  rejectionReason?: string | null;
  dispatchRun?: number;
  templateId: string;
  templateName: string;
  templateLanguage: string;
  templateCategory: string;
  variablesMapping: Record<string, unknown>;
  audienceType: "MOCK" | "CONTACT_LIST" | "SEGMENT";
  audienceId: string | null;
  audienceName: string;
  totalRecipients: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdBy: string | null;
  createdAt: Date;
  updatedAt: Date;
}

let mockCampaignsStore: MockCampaign[] = [];
let mockMessagesStore: Array<{
  id: string;
  organizationId: string;
  campaignId: string | null;
  status: any;
  recipientPhone: string;
  templateName: string;
  templateLanguage: string;
  parameters: any;
  clientRequestId?: string;
  dispatchRun?: number;
  wamid?: string | null;
  attemptCount?: number;
  leaseExpiresAt?: Date | null;
  createdAt: Date;
  updatedAt: Date;
}> = [];
let updateManyOverride: (() => { count: number }) | null = null;
let queryRawOverride: (() => any) | null = null;
let findFirstCampaignOverride: ((where: any) => any) | null = null;

// Mock Prisma client to keep tests purely isolated, non-destructive, and deterministic
vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => ({
      organization: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === "org_default") {
            return { id: "org_default", name: "Default Organization", slug: "default-organization" };
          }
          return null;
        }),
      },
      campaign: {
        findMany: vi.fn().mockImplementation(async ({ where, orderBy }) => {
          let filtered = mockCampaignsStore.slice();

          if (where?.organizationId) {
            filtered = filtered.filter((c) => c.organizationId === where.organizationId);
          }

          if (where?.status) {
            if (typeof where.status === "string" && where.status !== "ALL") {
              filtered = filtered.filter((c) => c.status === where.status);
            } else if (where.status.in) {
              filtered = filtered.filter((c) => where.status.in.includes(c.status));
            }
          }

          if (where?.approvalStatus) {
            if (typeof where.approvalStatus === "string") {
              filtered = filtered.filter((c) => c.approvalStatus === where.approvalStatus);
            } else if (where.approvalStatus.in) {
              filtered = filtered.filter((c) => where.approvalStatus.in.includes(c.approvalStatus));
            }
          }

          if (where?.scheduledAt?.lte) {
            const lteTime = new Date(where.scheduledAt.lte).getTime();
            filtered = filtered.filter((c) => c.scheduledAt && c.scheduledAt.getTime() <= lteTime);
          }

          if (where?.scheduledAt?.lt) {
            const ltTime = new Date(where.scheduledAt.lt).getTime();
            filtered = filtered.filter((c) => c.scheduledAt && c.scheduledAt.getTime() < ltTime);
          }

          if (orderBy?.scheduledAt === "asc") {
            filtered.sort(
              (a, b) => (a.scheduledAt?.getTime() ?? 0) - (b.scheduledAt?.getTime() ?? 0)
            );
          }

          return filtered;
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          let filtered = mockCampaignsStore.slice();
          if (where?.organizationId) {
            filtered = filtered.filter((c) => c.organizationId === where.organizationId);
          }
          if (where?.status) {
            filtered = filtered.filter((c) => c.status === where.status);
          }
          if (where?.scheduledAt?.lt) {
            const ltTime = new Date(where.scheduledAt.lt).getTime();
            filtered = filtered.filter((c) => c.scheduledAt && c.scheduledAt.getTime() < ltTime);
          }
          return filtered.length;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          if (findFirstCampaignOverride) {
            const override = findFirstCampaignOverride(where);
            if (override !== undefined) return override;
          }
          if (where?.id) {
            return (
              mockCampaignsStore.find(
                (c) =>
                  c.id === where.id &&
                  (!where.organizationId || c.organizationId === where.organizationId)
              ) || null
            );
          }
          if (where?.name && where?.templateId) {
            return (
              mockCampaignsStore.find(
                (c) =>
                  c.organizationId === where.organizationId &&
                  c.name === where.name &&
                  c.templateId === where.templateId &&
                  (!where.status || c.status === where.status)
              ) || null
            );
          }
          return null;
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const newRecord: MockCampaign = {
            id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            organizationId: data.organizationId,
            name: data.name,
            description: data.description || null,
            status: data.status || CampaignStatus.DRAFT,
            approvalStatus:
              data.approvalStatus ||
              (data.scheduledAt ? CampaignApprovalStatus.PENDING : CampaignApprovalStatus.NOT_REQUIRED),
            dispatchRun: data.dispatchRun || 1,
            templateId: data.templateId,
            templateName: data.templateName,
            templateLanguage: data.templateLanguage || "en_US",
            templateCategory: data.templateCategory || "MARKETING",
            variablesMapping: data.variablesMapping || {},
            audienceType: data.audienceType || "CONTACT_LIST",
            audienceId: data.audienceId || null,
            audienceName: data.audienceName || "Audience List",
            totalRecipients: data.totalRecipients || 10,
            scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
            startedAt: null,
            completedAt: null,
            createdBy: data.createdBy || "system_user",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockCampaignsStore.push(newRecord);
          return newRecord;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const index = mockCampaignsStore.findIndex((c) => c.id === where.id);
          if (index === -1) throw new Error("Record to update not found");

          const updated = {
            ...mockCampaignsStore[index],
            ...data,
            updatedAt: new Date(),
          };
          mockCampaignsStore[index] = updated;
          return updated;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          if (updateManyOverride) {
            return updateManyOverride();
          }
          let count = 0;
          for (let i = 0; i < mockCampaignsStore.length; i++) {
            const c = mockCampaignsStore[i];
            const matchId = !where.id || c.id === where.id;
            let matchStatus = true;
            if (where.status) {
              matchStatus =
                typeof where.status === "string"
                  ? c.status === where.status
                  : where.status.in?.includes(c.status);
            }
            let matchApproval = true;
            if (where.approvalStatus) {
              matchApproval =
                typeof where.approvalStatus === "string"
                  ? c.approvalStatus === where.approvalStatus
                  : where.approvalStatus.in?.includes(c.approvalStatus);
            }

            if (matchId && matchStatus && matchApproval) {
              mockCampaignsStore[i] = {
                ...c,
                ...data,
                updatedAt: new Date(),
              };
              count++;
            }
          }
          return { count };
        }),
      },
      contactList: {
        findFirst: vi.fn().mockImplementation(async () => ({
          id: "list_vip",
          name: "VIP Retail Customers",
        })),
      },
      contactListMember: {
        count: vi.fn().mockImplementation(async () => 100),
        findMany: vi.fn().mockImplementation(async () => [
          {
            contactId: "cnt_vip_001",
            contact: {
              id: "cnt_vip_001",
              phoneNumber: "+919876543210",
              consentStatus: "OPTED_IN",
              isSuppressed: false,
              firstName: "Vip",
              lastName: "Customer",
              attributes: {},
            },
          },
        ]),
      },
      whatsAppMessage: {
        create: vi.fn().mockImplementation(async ({ data }) => {
          const msg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            status: "QUEUED",
            attemptCount: 0,
            wamid: null,
            leaseExpiresAt: null,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockMessagesStore.push(msg);
          return msg;
        }),
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          let filtered = mockMessagesStore.slice();
          if (where?.campaignId) {
            filtered = filtered.filter((m) => m.campaignId === where.campaignId);
          }
          if (where?.organizationId) {
            filtered = filtered.filter((m) => m.organizationId === where.organizationId);
          }
          if (where?.status) {
            if (typeof where.status === "string") {
              filtered = filtered.filter((m) => m.status === where.status);
            } else if (where.status.in) {
              filtered = filtered.filter((m) => where.status.in.includes(m.status));
            }
          }
          return filtered;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            mockMessagesStore.find(
              (m) =>
                (!where.campaignId || m.campaignId === where.campaignId) &&
                (!where.contactId || m.contactId === where.contactId)
            ) || null
          );
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          return mockMessagesStore.find((m) => m.id === where.id) || { id: where.id, status: "SENDING" };
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const idx = mockMessagesStore.findIndex((m) => m.id === where.id);
          if (idx !== -1) {
            mockMessagesStore[idx] = { ...mockMessagesStore[idx], ...data, updatedAt: new Date() };
            return mockMessagesStore[idx];
          }
          return { id: where.id, ...data };
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          for (let i = 0; i < mockMessagesStore.length; i++) {
            const m = mockMessagesStore[i];
            const matchCamp = !where?.campaignId || m.campaignId === where.campaignId;
            const matchOrg = !where?.organizationId || m.organizationId === where.organizationId;
            let matchStatus = true;
            if (where?.status) {
              matchStatus =
                typeof where.status === "string"
                  ? m.status === where.status
                  : where.status.in?.includes(m.status);
            }
            if (matchCamp && matchOrg && matchStatus) {
              mockMessagesStore[i] = { ...m, ...data, updatedAt: new Date() };
              count++;
            }
          }
          return { count };
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          let filtered = mockMessagesStore.slice();
          if (where?.campaignId) {
            filtered = filtered.filter((m) => m.campaignId === where.campaignId);
          }
          if (where?.organizationId) {
            filtered = filtered.filter((m) => m.organizationId === where.organizationId);
          }
          if (where?.status) {
            if (typeof where.status === "string") {
              filtered = filtered.filter((m) => m.status === where.status);
            } else if (where.status.in) {
              filtered = filtered.filter((m) => where.status.in.includes(m.status));
            }
          }
          return filtered.length;
        }),
      },
      $queryRaw: vi.fn().mockImplementation(async () => {
        if (queryRawOverride) {
          return queryRawOverride();
        }
        return [];
      }),
    }),
  };
});

describe("Phase 10: Campaign Scheduling & Durable Recovery Engine", () => {
  beforeEach(() => {
    setAllowedTestTemplates([
      ...ALLOWED_TEST_TEMPLATE_NAMES,
      "festive_mega_savings",
      "jaspers_market_order_confirmation_v1",
      "jaspers_market_plain_text_v1",
    ]);

    // Reset store before each test
    mockCampaignsStore = [
      {
        id: "cmp_draft_01",
        organizationId: "org_default",
        name: "Diwali Mega Sale Draft",
        description: "Draft ready for scheduling",
        status: CampaignStatus.DRAFT,
        approvalStatus: CampaignApprovalStatus.NOT_REQUIRED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "Valued Customer", "2": "ORD-123", "3": "TRK-987" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP Retail Customers",
        totalRecipients: 100,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date("2026-10-15T10:00:00Z"),
        updatedAt: new Date("2026-10-15T10:00:00Z"),
      },
      {
        id: "cmp_scheduled_01",
        organizationId: "org_default",
        name: "Diwali Scheduled Campaign",
        description: "Scheduled for future",
        status: CampaignStatus.SCHEDULED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        approvedAt: new Date("2026-10-16T10:00:00Z"),
        approvedBy: "usr_admin",
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "Customer", "2": "ORD-456", "3": "TRK-000" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP Retail Customers",
        totalRecipients: 100,
        scheduledAt: new Date(Date.now() + 86400000), // Future (tomorrow)
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date("2026-10-16T10:00:00Z"),
        updatedAt: new Date("2026-10-16T10:00:00Z"),
      },
    ];

    // Mock template service getTemplateByName to return approved sendable template
    vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
      id: "tpl-101",
      name: "jaspers_market_order_confirmation_v1",
      language: "en_US",
      category: "UTILITY",
      status: "APPROVED",
      isSendable: true,
      lastUpdated: new Date().toISOString(),
      body: "Hi {{1}}, order {{2}} confirmed. Track: {{3}}",
      variables: [
        { key: "1", label: "Name", sampleValue: "Balaji" },
        { key: "2", label: "Order", sampleValue: "ORD-123" },
        { key: "3", label: "Tracking", sampleValue: "TRK-987" },
      ],
      footer: "Reply STOP to unsubscribe",
      buttons: [],
    });
    updateManyOverride = null;
    queryRawOverride = null;
    findFirstCampaignOverride = null;
    mockMessagesStore = [];
  });

  afterEach(() => {
    setAllowedTestTemplates(null);
    updateManyOverride = null;
    queryRawOverride = null;
    findFirstCampaignOverride = null;
    mockMessagesStore = [];
    vi.restoreAllMocks();
  });

  // --------------------------------------------------------------------------
  // 1. Timezone & Parsing Utility Tests
  // --------------------------------------------------------------------------
  describe("1. Timezone Utilities (Asia/Kolkata Business Default)", () => {
    it("enforces Asia/Kolkata as business timezone", () => {
      expect(DEFAULT_BUSINESS_TIMEZONE).toBe("Asia/Kolkata");
    });

    it("parses date (YYYY-MM-DD) and time (HH:mm) into UTC Date with +05:30 offset", () => {
      // 10:00 AM IST on 2026-11-01 -> 04:30 AM UTC
      const parsedUtc = parseScheduleToUTC("2026-11-01", "10:00");
      expect(parsedUtc.toISOString()).toBe("2026-11-01T04:30:00.000Z");
    });

    it("throws clear error on malformed date or time strings", () => {
      expect(() => parseScheduleToUTC("2026/11/01", "10:00")).toThrow(
        "Invalid date or time format"
      );
      expect(() => parseScheduleToUTC("2026-11-01", "25:00")).toThrow(
        "Failed to parse date string into valid UTC timestamp"
      );
    });

    it("formats UTC dates into human-readable IST strings with AM/PM and timezone marker", () => {
      const formatted = formatInBusinessTimezone("2026-11-01T04:30:00.000Z");
      expect(formatted).toContain("10:00");
      expect(formatted).toContain("IST");
    });

    it("validates future schedule timestamps with minimum lead time", () => {
      const future = new Date(Date.now() + 3600000); // 1 hr in future
      const past = new Date(Date.now() - 3600000); // 1 hr in past
      expect(isValidFutureSchedule(future)).toBe(true);
      expect(isValidFutureSchedule(past)).toBe(false);
      expect(isValidFutureSchedule("invalid-date")).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Schedule Campaign Endpoint (POST /:id/schedule)
  // --------------------------------------------------------------------------
  describe("2. Schedule Campaign API (POST /api/v1/campaigns/:id/schedule)", () => {
    it("successfully schedules a DRAFT campaign for a future timestamp", async () => {
      const futureIso = new Date(Date.now() + 86400000).toISOString(); // Tomorrow
      const res = await request(app)
        .post("/api/v1/campaigns/cmp_draft_01/schedule")
        .send({ scheduledAt: futureIso });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.approvalStatus).toBe("PENDING");
      expect(new Date(res.body.data.scheduledAt).toISOString()).toBe(futureIso);

      // Verify in store
      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_draft_01");
      expect(campaign?.status).toBe(CampaignStatus.DRAFT);
      expect(campaign?.approvalStatus).toBe(CampaignApprovalStatus.PENDING);
      expect(campaign?.scheduledAt?.toISOString()).toBe(futureIso);
    });

    it("allows rescheduling an already SCHEDULED campaign to a new future time", async () => {
      const newFutureIso = new Date(Date.now() + 172800000).toISOString(); // 2 days in future
      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/schedule")
        .send({ scheduledAt: newFutureIso });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.approvalStatus).toBe("PENDING");
      expect(new Date(res.body.data.scheduledAt).toISOString()).toBe(newFutureIso);
    });

    it("rejects scheduling with past timestamp with HTTP 422 validation error", async () => {
      const pastIso = new Date(Date.now() - 3600000).toISOString();
      const res = await request(app)
        .post("/api/v1/campaigns/cmp_draft_01/schedule")
        .send({ scheduledAt: pastIso });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Validation failed");
    });

    it("rejects scheduling with invalid timestamp format with HTTP 422", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns/cmp_draft_01/schedule")
        .send({ scheduledAt: "not-a-valid-date" });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("rejects scheduling when campaign status is already QUEUED, SENDING, or COMPLETED with HTTP 400", async () => {
      // Modify store item to COMPLETED
      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_scheduled_01")!;
      campaign.status = CampaignStatus.COMPLETED;

      const futureIso = new Date(Date.now() + 86400000).toISOString();
      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/schedule")
        .send({ scheduledAt: futureIso });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Only DRAFT or SCHEDULED campaigns can be scheduled");
    });
  });

  // --------------------------------------------------------------------------
  // 3. Cancel Campaign Endpoint (POST /:id/cancel)
  // --------------------------------------------------------------------------
  describe("3. Cancel Campaign API (POST /api/v1/campaigns/:id/cancel)", () => {
    it("successfully cancels a SCHEDULED campaign before dispatch starts", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/cancel")
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("CANCELLED");
      expect(res.body.data.completedAt).toBeDefined();

      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_scheduled_01");
      expect(campaign?.status).toBe(CampaignStatus.CANCELLED);
    });

    it("successfully cancels a DRAFT campaign", async () => {
      const res = await request(app)
        .post("/api/v1/campaigns/cmp_draft_01/cancel")
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("CANCELLED");
    });

    it("is idempotent when cancelling an already CANCELLED campaign", async () => {
      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_scheduled_01")!;
      campaign.status = CampaignStatus.CANCELLED;

      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/cancel")
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("CANCELLED");
    });

    it("rejects cancelling a campaign when dispatch has already started (SENDING, COMPLETED) with HTTP 400", async () => {
      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_scheduled_01")!;
      campaign.status = CampaignStatus.SENDING;

      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/cancel")
        .send();

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Dispatch has already started or completed");
    });

    it("rejects cancelling an immediate QUEUED campaign whose scheduledAt is null or past", async () => {
      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_scheduled_01")!;
      campaign.status = CampaignStatus.QUEUED;
      campaign.scheduledAt = null;

      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/cancel")
        .send();

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Dispatch has already started or completed");
    });

    it("allows cancelling a pre-enqueued scheduled campaign (QUEUED with future scheduledAt) and marks status CANCELLED", async () => {
      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_scheduled_01")!;
      campaign.status = CampaignStatus.QUEUED;
      campaign.scheduledAt = new Date(Date.now() + 60000); // 1 minute in future

      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/cancel")
        .send();

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("CANCELLED");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Creation with Scheduled Timestamp (POST /api/v1/campaigns)
  // --------------------------------------------------------------------------
  describe("4. Campaign Creation with Direct Scheduling", () => {
    it("sets initial status to SCHEDULED when valid scheduledAt is provided during creation", async () => {
      const futureIso = new Date(Date.now() + 86400000).toISOString();
      const payload = {
        name: "Directly Scheduled Campaign",
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "Balaji", "2": "ORD-1", "3": "TRK-1" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP Retail Customers",
        scheduledAt: futureIso,
      };

      const res = await request(app).post("/api/v1/campaigns").send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.approvalStatus).toBe("PENDING");
      expect(new Date(res.body.data.scheduledAt).toISOString()).toBe(futureIso);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Scheduler Reconciliation Loop & Safe Late-Send Policy
  // --------------------------------------------------------------------------
  describe("5. Reconciliation Loop & Safe Late-Send Policy", () => {
    it("Worker Dormant Safety: does NOT dispatch due campaigns when automatic worker is disabled", async () => {
      // Setup a due campaign
      const dueCampaign: MockCampaign = {
        id: "cmp_due_01",
        organizationId: "org_default",
        name: "Due Campaign 1",
        description: null,
        status: CampaignStatus.SCHEDULED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: new Date(Date.now() - 60000), // Due 1 minute ago
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(dueCampaign);

      // Ensure worker is reported as dormant/disabled
      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: false,
        enabled: false,
        redisConfigured: true,
      });

      const launchSpy = vi.spyOn(campaignService, "launchCampaign");

      const result = await campaignSchedulerService.reconcileScheduledCampaigns();

      expect(result.dueFound).toBeGreaterThanOrEqual(1);
      expect(result.pendingWaitingWorker).toBeGreaterThanOrEqual(1);
      expect(result.dispatched).toBe(0);
      expect(launchSpy).not.toHaveBeenCalled();

      // Campaign must safely remain in SCHEDULED status
      const preserved = mockCampaignsStore.find((c) => c.id === "cmp_due_01");
      expect(preserved?.status).toBe(CampaignStatus.SCHEDULED);
    });

    it("Worker Active Dispatch: claims due campaign via atomic CAS and launches campaign", async () => {
      const dueCampaign: MockCampaign = {
        id: "cmp_due_active",
        organizationId: "org_default",
        name: "Due Campaign Active",
        description: null,
        status: CampaignStatus.SCHEDULED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: new Date(Date.now() - 120000), // Due 2 minutes ago
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(dueCampaign);

      // Simulate worker enabled and running
      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: true,
        enabled: true,
        redisConfigured: true,
      });

      const launchSpy = vi.spyOn(campaignService, "launchCampaign").mockResolvedValue({
        campaignId: "cmp_due_active",
        campaignName: "Due Campaign Active",
        status: "QUEUED",
        totalAudienceCount: 50,
        eligibleCount: 50,
        queuedCount: 50,
        alreadyPreparedCount: 0,
        enqueueSuccessCount: 50,
        enqueueFailureCount: 0,
        excludedCount: { consentRequired: 0, suppressed: 0, invalidPhone: 0, missingVariables: 0 },
        sampleExclusions: [],
      });

      const result = await campaignSchedulerService.reconcileScheduledCampaigns();

      expect(result.dispatched).toBe(1);
      expect(launchSpy).toHaveBeenCalledWith("org_default", "cmp_due_active");

      // Verify status transitioned from SCHEDULED to QUEUED
      const claimed = mockCampaignsStore.find((c) => c.id === "cmp_due_active");
      expect(claimed?.status).toBe(CampaignStatus.QUEUED);
    });

    it("Safe Late-Send Policy: expires stale campaign older than MAX_SCHEDULE_LATENESS_HOURS (default 24h) to FAILED", async () => {
      const staleCampaign: MockCampaign = {
        id: "cmp_stale_48h",
        organizationId: "org_default",
        name: "Stale Overdue Campaign",
        description: null,
        status: CampaignStatus.SCHEDULED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: new Date(Date.now() - 48 * 60 * 60 * 1000), // 48 hours ago
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(staleCampaign);

      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: true,
        enabled: true,
        redisConfigured: true,
      });

      const launchSpy = vi.spyOn(campaignService, "launchCampaign");

      const result = await campaignSchedulerService.reconcileScheduledCampaigns();

      expect(result.expired).toBe(1);
      expect(launchSpy).not.toHaveBeenCalled();

      // Campaign must be marked as FAILED with original scheduledAt preserved
      const expiredCampaign = mockCampaignsStore.find((c) => c.id === "cmp_stale_48h");
      expect(expiredCampaign?.status).toBe(CampaignStatus.FAILED);
      expect(expiredCampaign?.completedAt).toBeDefined();
      expect(expiredCampaign?.scheduledAt).toEqual(staleCampaign.scheduledAt);
    });

    it("Concurrency CAS Protection: skips campaign without double-dispatch if another instance claimed it", async () => {
      const dueCampaign: MockCampaign = {
        id: "cmp_conflict_race",
        organizationId: "org_default",
        name: "Conflict Race Campaign",
        description: null,
        status: CampaignStatus.SCHEDULED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: new Date(Date.now() - 60000),
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(dueCampaign);

      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: true,
        enabled: true,
        redisConfigured: true,
      });

      // Simulate a concurrent node claiming the campaign first: updateMany returns count: 0
      updateManyOverride = () => ({ count: 0 });

      const launchSpy = vi.spyOn(campaignService, "launchCampaign");

      const result = await campaignSchedulerService.reconcileScheduledCampaigns();

      expect(result.skippedConflict).toBe(1);
      expect(result.dispatched).toBe(0);
      expect(launchSpy).not.toHaveBeenCalled();
    });
  });

  // --------------------------------------------------------------------------
  // 6. Stranded Queue Recovery & Startup Reconciliation
  // --------------------------------------------------------------------------
  describe("6. Stranded Queue Recovery & Startup Reconciliation", () => {
    it("reconciles stranded QUEUED messages on startup without duplicate sending", async () => {
      const strandedCampaign: MockCampaign = {
        id: "cmp_stranded_01",
        organizationId: "org_default",
        name: "Stranded Queued Campaign",
        description: null,
        status: CampaignStatus.QUEUED,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(strandedCampaign);

      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: false,
        enabled: false,
        redisConfigured: true,
      });

      const recoverSpy = vi.spyOn(campaignService, "recoverCampaignQueue").mockResolvedValue({
        campaignId: "cmp_stranded_01",
        campaignName: "Stranded Queued Campaign",
        status: "QUEUED",
        totalPersistedMessages: 50,
        alreadyProcessedCount: 20, // 20 messages had WAMIDs or terminal state -> skipped!
        strandedUnenqueuedCount: 30,
        enqueuedSuccessCount: 30,
        enqueuedFailureCount: 0,
        requeuedCount: 30,
        skippedExistingWamidCount: 20,
      });

      const queueResult = await campaignSchedulerService.reconcileStrandedQueuedWork();

      expect(queueResult.activeCampaignsChecked).toBe(1);
      expect(queueResult.totalMessagesRecovered).toBe(30);
      expect(recoverSpy).toHaveBeenCalledWith("org_default", "cmp_stranded_01");
    });

    it("onStartup executes both scheduled and stranded queue reconciliations", async () => {
      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: false,
        enabled: false,
        redisConfigured: true,
      });

      const reconcileSchedSpy = vi.spyOn(campaignSchedulerService, "reconcileScheduledCampaigns");
      const reconcileQueueSpy = vi.spyOn(campaignSchedulerService, "reconcileStrandedQueuedWork");

      const startupResult = await campaignSchedulerService.onStartup();

      expect(reconcileSchedSpy).toHaveBeenCalled();
      expect(reconcileQueueSpy).toHaveBeenCalled();
      expect(startupResult.scheduled).toBeDefined();
      expect(startupResult.queue).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 7. Operational Status Endpoint (GET /scheduler/status)
  // --------------------------------------------------------------------------
  describe("7. Operational Status Endpoint (GET /api/v1/campaigns/scheduler/status)", () => {
    it("returns operational telemetry including worker state, timezone, and lateness policy", async () => {
      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: false,
        enabled: false,
        redisConfigured: true,
      });

      const res = await request(app).get("/api/v1/campaigns/scheduler/status");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.businessTimezone).toBe("Asia/Kolkata");
      expect(res.body.data.workerRunning).toBe(false);
      expect(res.body.data.automaticDispatchEnabled).toBe(false);
      expect(res.body.data.maxLatenessHours).toBe(24);
      expect(res.body.data.dueScheduledCount).toBeDefined();
      expect(res.body.data.timestamp).toBeDefined();
    });
  });

  // --------------------------------------------------------------------------
  // 8. Phase 1: Safe Redis/BullMQ Pre-Enqueue & Delayed Dispatch
  // --------------------------------------------------------------------------
  describe("8. Phase 1: Safe Redis/BullMQ Pre-Enqueue & Delayed Dispatch", () => {
    it("1. Pre-enqueue timing: campaign becomes eligible at approximately scheduledAt - 2 minutes", async () => {
      const now = new Date("2026-10-27T10:00:00.000Z");

      // Campaign A: 90 seconds in future (within 2-minute pre-enqueue window)
      const eligibleCampaign: MockCampaign = {
        id: "cmp_pre_enqueue_90s",
        organizationId: "org_default",
        name: "Eligible Pre-Enqueue Campaign",
        description: null,
        status: CampaignStatus.SCHEDULED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: new Date(now.getTime() + 90000), // 1.5 minutes ahead (<= 2 min horizon)
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      // Campaign B: 10 minutes in future (outside 2-minute pre-enqueue window)
      const farFutureCampaign: MockCampaign = {
        id: "cmp_far_future_10m",
        organizationId: "org_default",
        name: "Far Future Campaign",
        description: null,
        status: CampaignStatus.SCHEDULED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: new Date(now.getTime() + 600000), // 10 minutes ahead
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockCampaignsStore.push(eligibleCampaign, farFutureCampaign);

      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: true,
        enabled: true,
        redisConfigured: true,
      });

      const launchSpy = vi.spyOn(campaignService, "launchCampaign").mockResolvedValue({
        campaignId: "cmp_pre_enqueue_90s",
        campaignName: "Eligible Pre-Enqueue Campaign",
        status: "QUEUED",
        totalAudienceCount: 50,
        eligibleCount: 50,
        queuedCount: 50,
        alreadyPreparedCount: 0,
        enqueueSuccessCount: 50,
        enqueueFailureCount: 0,
        excludedCount: { consentRequired: 0, suppressed: 0, invalidPhone: 0, missingVariables: 0 },
        sampleExclusions: [],
      });

      const result = await campaignSchedulerService.reconcileScheduledCampaigns(now);
      expect(result.dispatched).toBe(1);

      // Verify Campaign A (90s) was pre-enqueued and launched
      expect(launchSpy).toHaveBeenCalledWith("org_default", "cmp_pre_enqueue_90s");
      const updatedA = mockCampaignsStore.find((c) => c.id === "cmp_pre_enqueue_90s");
      expect(updatedA?.status).toBe(CampaignStatus.QUEUED);

      // Verify Campaign B (10m) was NOT touched and remains SCHEDULED
      expect(launchSpy).not.toHaveBeenCalledWith("org_default", "cmp_far_future_10m");
      const updatedB = mockCampaignsStore.find((c) => c.id === "cmp_far_future_10m");
      expect(updatedB?.status).toBe(CampaignStatus.SCHEDULED);
    });

    it("2. BullMQ delay calculation: calculates remaining time dynamically from actual scheduledAt", async () => {
      expect(PRE_ENQUEUE_LEAD_MS).toBe(120000); // Exactly 2 minutes

      const mockQueue = {
        getJob: vi.fn().mockResolvedValue(null),
        add: vi.fn().mockImplementation(async (name, data, opts) => ({
          id: opts.jobId,
          data,
          opts,
        })),
      };

      whatsappQueueModule.setWhatsAppDispatchQueueForTest(mockQueue as any);
      vi.spyOn(redisModule, "isRedisConfigured").mockReturnValue(true);

      const targetTime = Date.now() + 85000; // 85 seconds ahead
      const delayMs = Math.max(0, targetTime - Date.now());

      const res = await enqueueWhatsAppDispatchJob(
        {
          messageId: "msg_delay_test_1",
          organizationId: "org_default",
          recipientPhone: "+919876543210",
          templateName: "jaspers_market_order_confirmation_v1",
          templateLanguage: "en_US",
          parameters: {},
          campaignId: "cmp_delay_test",
          scheduledAt: new Date(targetTime).toISOString(),
        },
        { delay: delayMs }
      );

      expect(res.alreadyExisted).toBe(false);
      expect(mockQueue.add).toHaveBeenCalledWith(
        "dispatch",
        expect.objectContaining({
          messageId: "msg_delay_test_1",
          scheduledAt: expect.any(String),
        }),
        expect.objectContaining({
          jobId: "msg_msg_delay_test_1",
          delay: expect.any(Number),
        })
      );

      const passedDelay = mockQueue.add.mock.calls[0][2].delay;
      expect(passedDelay).toBeGreaterThanOrEqual(80000);
      expect(passedDelay).toBeLessThanOrEqual(86000);

      whatsappQueueModule.setWhatsAppDispatchQueueForTest(null);
    });

    // ------------------------------------------------------------------------
    // F-01 & F-04: Processor Token & Timing Guard Tests
    // ------------------------------------------------------------------------
    it("3. Worker scheduled-time guard: passes actual BullMQ processor token to moveToDelayed (not job.token)", async () => {
      const scheduledFuture = new Date(Date.now() + 60000); // 1 minute in future

      const futureCampaign: MockCampaign = {
        id: "cmp_worker_guard",
        organizationId: "org_default",
        name: "Future Scheduled Campaign",
        description: null,
        status: CampaignStatus.QUEUED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: scheduledFuture,
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(futureCampaign);

      const executeSendSpy = vi.spyOn(WhatsAppSendService, "executeMetaSend");
      // Realistic BullMQ Job mock: job does NOT have a token property!
      const mockJob = {
        id: "job_early_test",
        moveToDelayed: vi.fn().mockResolvedValue(undefined),
      };

      // Verify mockJob has no synthetic token property
      expect((mockJob as any).token).toBeUndefined();

      // Pass the real BullMQ processor token as part of ProcessDispatchMessageInput
      const processorToken = "bullmq_proc_token_uuid_456";
      let delayedErrorThrown = false;
      try {
        const result = await processDispatchMessage({
          messageId: "msg_early_1",
          organizationId: "org_default",
          campaignId: "cmp_worker_guard",
          job: mockJob as any,
          token: processorToken,
        });
        if (result.skipped && result.reason === "DEFERRED_UNTIL_SCHEDULED_TIME") {
          delayedErrorThrown = true;
        }
      } catch (err: any) {
        if (err.name === "DelayedError") {
          delayedErrorThrown = true;
        }
      }

      // Meta send API was strictly NEVER called before scheduled time
      expect(executeSendSpy).not.toHaveBeenCalled();

      // Job moveToDelayed was invoked with the exact scheduled timestamp and actual processor token
      expect(mockJob.moveToDelayed).toHaveBeenCalledWith(
        scheduledFuture.getTime(),
        processorToken
      );
      expect(delayedErrorThrown).toBe(true);
    });

    it("3b. BullMQ processor callback signature (job, token) forwards processor token to dispatch worker", async () => {
      const scheduledFuture = new Date(Date.now() + 90000);

      const futureCampaign: MockCampaign = {
        id: "cmp_bullmq_sig_test",
        organizationId: "org_default",
        name: "BullMQ Signature Campaign",
        description: null,
        status: CampaignStatus.QUEUED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 10,
        scheduledAt: scheduledFuture,
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(futureCampaign);

      const mockBullMQJob = {
        id: "bullmq_job_789",
        data: {
          messageId: "msg_bullmq_sig_1",
          organizationId: "org_default",
          campaignId: "cmp_bullmq_sig_test",
        },
        moveToDelayed: vi.fn().mockResolvedValue(undefined),
      };

      // BullMQ calls worker processor with (job, token)
      const workerProcessor = async (job: any, token?: string) => {
        return processDispatchMessage({
          messageId: job.data.messageId,
          organizationId: job.data.organizationId,
          campaignId: job.data.campaignId,
          job,
          token,
        });
      };

      const processorToken = "bullmq_lock_token_xyz_999";
      let errorThrown = false;
      try {
        await workerProcessor(mockBullMQJob, processorToken);
      } catch (err: any) {
        if (err.name === "DelayedError") {
          errorThrown = true;
        }
      }

      expect(mockBullMQJob.moveToDelayed).toHaveBeenCalledWith(
        scheduledFuture.getTime(),
        processorToken
      );
      expect(errorThrown).toBe(true);
    });

    it("3c. Worker short-wait branch (~1.5s away): awaits exact scheduled second using fake timers without re-delaying to BullMQ", async () => {
      vi.useFakeTimers();
      try {
        const baseNow = Date.now();
        const scheduledTime = new Date(baseNow + 1500); // 1.5 seconds in future (<= 3000ms short wait window)

        const shortWaitCampaign: MockCampaign = {
          id: "cmp_short_wait",
          organizationId: "org_default",
          name: "Short Wait Campaign",
          description: null,
          status: CampaignStatus.QUEUED,
          approvalStatus: CampaignApprovalStatus.APPROVED,
          dispatchRun: 1,
          templateId: "tpl-101",
          templateName: "jaspers_market_order_confirmation_v1",
          templateLanguage: "en_US",
          templateCategory: "UTILITY",
          variablesMapping: {},
          audienceType: "CONTACT_LIST",
          audienceId: "list_vip",
          audienceName: "VIP List",
          totalRecipients: 1,
          scheduledAt: scheduledTime,
          startedAt: null,
          completedAt: null,
          createdBy: "usr_admin",
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockCampaignsStore.push(shortWaitCampaign);

        const msgRecord = {
          id: "msg_short_wait_1",
          organizationId: "org_default",
          campaignId: "cmp_short_wait",
          status: "QUEUED",
          recipientPhone: "+919876543210",
          templateName: "jaspers_market_order_confirmation_v1",
          templateLanguage: "en_US",
          parameters: {},
          attemptCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        };
        mockMessagesStore.push(msgRecord);

        // Mock $queryRaw claiming this message to SENDING
        queryRawOverride = () => {
          msgRecord.status = "SENDING";
          return [
            {
              id: msgRecord.id,
              status: "SENDING",
              wamid: null,
              recipientPhone: msgRecord.recipientPhone,
              templateName: msgRecord.templateName,
              templateLanguage: msgRecord.templateLanguage,
              parameters: msgRecord.parameters,
              attemptCount: 1,
            },
          ];
        };

        vi.spyOn(WhatsAppSendService, "validatePreflight").mockResolvedValue({ valid: true });
        vi.spyOn(MetaConfigResolver, "resolveOutboundConfig").mockResolvedValue({
          source: "PLATFORM_ENV_FALLBACK",
          accessToken: "test_token",
          phoneNumberId: "phone_123",
          graphApiVersion: "v26.0",
          wabaId: "waba_123",
          organizationId: "org_default",
          status: "CONNECTED" as any,
        });

        vi.spyOn(WebhookService, "reconcileLateWamid").mockImplementation(async (msgId, wamid) => {
          const m = mockMessagesStore.find((x) => x.id === msgId);
          if (m) {
            m.status = "SENT";
            m.wamid = wamid;
          }
          return { success: true, finalStatus: "SENT" as any, reconciledEventsCount: 0 };
        });

        const executeSendSpy = vi.spyOn(WhatsAppSendService, "executeMetaSend").mockResolvedValue({
          outcome: "SUCCESS",
          wamid: "wamid.short_wait_success",
          recipientPhone: "+919876543210",
        });

        const mockJob = {
          id: "job_short_wait",
          moveToDelayed: vi.fn(),
        };

        // Start dispatch promise
        const dispatchPromise = processDispatchMessage({
          messageId: "msg_short_wait_1",
          organizationId: "org_default",
          campaignId: "cmp_short_wait",
          job: mockJob as any,
          token: "short_wait_token",
        });

        // Before advancing fake timer: Meta send has NOT been called yet
        expect(executeSendSpy).not.toHaveBeenCalled();
        expect(mockJob.moveToDelayed).not.toHaveBeenCalled();

        // Advance fake timer by 1500ms to arrive exactly at scheduledAt
        await vi.advanceTimersByTimeAsync(1500);

        const result = await dispatchPromise;
        expect(result.success).toBe(true);
        expect(executeSendSpy).toHaveBeenCalledTimes(1);
        // Handled in-memory via short setTimeout, NOT pushed back to BullMQ delayed queue
        expect(mockJob.moveToDelayed).not.toHaveBeenCalled();
      } finally {
        vi.useRealTimers();
        queryRawOverride = null;
      }
    });

    it("4. Scheduler overlap and restart recovery: does not duplicate jobs or re-claim running campaigns", async () => {
      const now = new Date();
      const campaign: MockCampaign = {
        id: "cmp_overlap_test",
        organizationId: "org_default",
        name: "Overlap Campaign",
        description: null,
        status: CampaignStatus.SCHEDULED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: new Date(now.getTime() + 60000), // 1 min in future
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(campaign);

      vi.spyOn(automaticWorkerService, "getWorkerStatus").mockReturnValue({
        isRunning: true,
        enabled: true,
        redisConfigured: true,
      });

      // Simulate concurrent CAS race: another process updated status first
      updateManyOverride = () => ({ count: 0 });
      const launchSpy = vi.spyOn(campaignService, "launchCampaign");

      const result = await campaignSchedulerService.reconcileScheduledCampaigns(now);
      expect(result.skippedConflict).toBe(1);
      expect(result.dispatched).toBe(0);
      expect(launchSpy).not.toHaveBeenCalled();

      updateManyOverride = null;

      // Test restart recovery preserves existing delayed BullMQ job
      const mockExistingJob = {
        id: "msg_rec_1",
        getState: vi.fn().mockResolvedValue("delayed"),
      };
      const mockQueue = {
        getJob: vi.fn().mockResolvedValue(mockExistingJob),
      };

      const recovery = await inspectAndRecoverDispatchJob({
        jobData: {
          messageId: "rec_1",
          organizationId: "org_default",
          recipientPhone: "+919876543210",
          templateName: "jaspers_market_order_confirmation_v1",
          templateLanguage: "en_US",
          parameters: {},
          campaignId: "cmp_overlap_test",
          scheduledAt: new Date(Date.now() + 60000).toISOString(),
        },
        dbMessage: {
          id: "rec_1",
          status: "QUEUED" as any,
        },
        queueOverride: mockQueue,
      });

      expect(recovery.status).toBe("already_waiting");
    });

    // ------------------------------------------------------------------------
    // F-02: Campaign Cancellation Race & Pre-Send Final Gate Tests
    // ------------------------------------------------------------------------
    it("5a. Cancellation of pre-enqueued QUEUED future campaign succeeds, marks messages FAILED, and removes queue jobs", async () => {
      const scheduledFuture = new Date(Date.now() + 60000);
      const preEnqueuedCampaign: MockCampaign = {
        id: "cmp_cancel_guard",
        organizationId: "org_default",
        name: "Pre-enqueued Cancel Test",
        description: null,
        status: CampaignStatus.QUEUED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 2,
        scheduledAt: scheduledFuture,
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(preEnqueuedCampaign);

      mockMessagesStore.push(
        {
          id: "msg_cancel_1",
          organizationId: "org_default",
          campaignId: "cmp_cancel_guard",
          status: "QUEUED",
          recipientPhone: "+919876543210",
          templateName: "jaspers_market_order_confirmation_v1",
          templateLanguage: "en_US",
          parameters: {},
          attemptCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "msg_cancel_2",
          organizationId: "org_default",
          campaignId: "cmp_cancel_guard",
          status: "QUEUED",
          recipientPhone: "+919876543211",
          templateName: "jaspers_market_order_confirmation_v1",
          templateLanguage: "en_US",
          parameters: {},
          attemptCount: 0,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      // Cancel the pre-enqueued campaign
      await campaignService.cancelCampaign("org_default", "cmp_cancel_guard");
      const cancelled = mockCampaignsStore.find((c) => c.id === "cmp_cancel_guard");
      expect(cancelled?.status).toBe(CampaignStatus.CANCELLED);

      // Verify messages transitioned to FAILED with CAMPAIGN_CANCELLED
      const msgs = mockMessagesStore.filter((m) => m.campaignId === "cmp_cancel_guard");
      expect(msgs).toHaveLength(2);
      expect(msgs[0].status).toBe("FAILED");
      expect(msgs[1].status).toBe("FAILED");

      // Worker executes for a job from the cancelled campaign: Step 0 skips
      const executeSendSpy = vi.spyOn(WhatsAppSendService, "executeMetaSend");
      const result = await processDispatchMessage({
        messageId: "msg_cancel_1",
        organizationId: "org_default",
        campaignId: "cmp_cancel_guard",
      });

      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("CAMPAIGN_CANCELLED");
      expect(executeSendSpy).not.toHaveBeenCalled();
    });

    it("5b. Cancellation race: rejecting cancellation when campaign has already transitioned to SENDING", async () => {
      const campaign: MockCampaign = {
        id: "cmp_race_sending",
        organizationId: "org_default",
        name: "Race Sending Campaign",
        description: null,
        status: CampaignStatus.SENDING, // Already in SENDING!
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 50,
        scheduledAt: new Date(Date.now() - 10000),
        startedAt: new Date(),
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(campaign);

      // Attempting to cancel throws BadRequestError (dispatch already started)
      await expect(
        campaignService.cancelCampaign("org_default", "cmp_race_sending")
      ).rejects.toThrow(/Cannot cancel campaign with status 'SENDING'/);

      expect(campaign.status).toBe(CampaignStatus.SENDING);
    });

    it("5c. Pre-Send Final Gate: worker aborts external send if campaign cancelled right before Meta call", async () => {
      const scheduledPast = new Date(Date.now() - 10000); // Already due
      const campaign: MockCampaign = {
        id: "cmp_gate_test",
        organizationId: "org_default",
        name: "Pre-Send Gate Campaign",
        description: null,
        status: CampaignStatus.QUEUED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 1,
        scheduledAt: scheduledPast,
        startedAt: new Date(),
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(campaign);

      const msg = {
        id: "msg_gate_1",
        organizationId: "org_default",
        campaignId: "cmp_gate_test",
        status: "QUEUED",
        recipientPhone: "+919876543210",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        parameters: {},
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockMessagesStore.push(msg);

      // Mock $queryRaw claiming row into SENDING
      queryRawOverride = () => [
        {
          id: msg.id,
          status: "SENDING",
          wamid: null,
          recipientPhone: msg.recipientPhone,
          templateName: msg.templateName,
          templateLanguage: msg.templateLanguage,
          parameters: msg.parameters,
          attemptCount: 1,
        },
      ];

      // Simulate concurrent cancellation:
      // Call 1 (Step 0) returns QUEUED with APPROVED so worker proceeds to claim.
      // Call 2 (Step 3b Pre-Send Final Gate) returns CANCELLED.
      let findCallCount = 0;
      findFirstCampaignOverride = (where: any) => {
        if (where?.id === "cmp_gate_test") {
          findCallCount++;
          if (findCallCount === 1) {
            return {
              id: "cmp_gate_test",
              organizationId: "org_default",
              status: CampaignStatus.QUEUED,
              scheduledAt: scheduledPast,
              approvalStatus: CampaignApprovalStatus.APPROVED,
              dispatchRun: 1,
            };
          }
          return {
            id: "cmp_gate_test",
            organizationId: "org_default",
            status: CampaignStatus.CANCELLED,
            scheduledAt: scheduledPast,
            approvalStatus: CampaignApprovalStatus.APPROVED,
            dispatchRun: 1,
          };
        }
        return undefined;
      };

      vi.spyOn(WhatsAppSendService, "validatePreflight").mockResolvedValue({ valid: true });
      vi.spyOn(MetaConfigResolver, "resolveOutboundConfig").mockResolvedValue({
        source: "PLATFORM_ENV_FALLBACK",
        accessToken: "test_token",
        phoneNumberId: "phone_123",
        graphApiVersion: "v26.0",
        wabaId: "waba_123",
        organizationId: "org_default",
        status: "CONNECTED" as any,
      });

      const executeSendSpy = vi.spyOn(WhatsAppSendService, "executeMetaSend");

      const result = await processDispatchMessage({
        messageId: "msg_gate_1",
        organizationId: "org_default",
        campaignId: "cmp_gate_test",
      });

      // Pre-send final gate aborted external dispatch
      expect(result.skipped).toBe(true);
      expect(result.reason).toBe("CAMPAIGN_CANCELLED");
      expect(executeSendSpy).not.toHaveBeenCalled();

      // Message row was updated to FAILED with CAMPAIGN_CANCELLED
      const updatedMsg = mockMessagesStore.find((m) => m.id === "msg_gate_1");
      expect(updatedMsg?.status).toBe("FAILED");
      expect(updatedMsg?.errorCode).toBe("CAMPAIGN_CANCELLED");

      queryRawOverride = null;
      findFirstCampaignOverride = null;
    });

    it("5d. In-flight external Meta send honesty: completed network request returns WAMID and is reconciled safely", async () => {
      const scheduledPast = new Date(Date.now() - 5000);
      const campaign: MockCampaign = {
        id: "cmp_inflight_test",
        organizationId: "org_default",
        name: "In Flight Campaign",
        description: null,
        status: CampaignStatus.QUEUED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 1,
        scheduledAt: scheduledPast,
        startedAt: new Date(),
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(campaign);

      const msg = {
        id: "msg_inflight_1",
        organizationId: "org_default",
        campaignId: "cmp_inflight_test",
        status: "QUEUED",
        recipientPhone: "+919876543210",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        parameters: {},
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockMessagesStore.push(msg);

      queryRawOverride = () => {
        msg.status = "SENDING";
        return [
          {
            id: msg.id,
            status: "SENDING",
            wamid: null,
            recipientPhone: msg.recipientPhone,
            templateName: msg.templateName,
            templateLanguage: msg.templateLanguage,
            parameters: msg.parameters,
            attemptCount: 1,
          },
        ];
      };

      vi.spyOn(WhatsAppSendService, "validatePreflight").mockResolvedValue({ valid: true });
      vi.spyOn(MetaConfigResolver, "resolveOutboundConfig").mockResolvedValue({
        source: "PLATFORM_ENV_FALLBACK",
        accessToken: "test_token",
        phoneNumberId: "phone_123",
        graphApiVersion: "v26.0",
        wabaId: "waba_123",
        organizationId: "org_default",
        status: "CONNECTED" as any,
      });

      vi.spyOn(WebhookService, "reconcileLateWamid").mockImplementation(async (msgId, wamid) => {
        const m = mockMessagesStore.find((x) => x.id === msgId);
        if (m) {
          m.status = "SENT";
          m.wamid = wamid;
        }
        return { success: true, finalStatus: "SENT" as any, reconciledEventsCount: 0 };
      });

      // Meta send was already on the wire and returns successfully with a WAMID
      const executeSendSpy = vi.spyOn(WhatsAppSendService, "executeMetaSend").mockResolvedValue({
        outcome: "SUCCESS",
        wamid: "wamid.inflight_network_ack_123",
        recipientPhone: "+919876543210",
      });

      const result = await processDispatchMessage({
        messageId: "msg_inflight_1",
        organizationId: "org_default",
        campaignId: "cmp_inflight_test",
      });

      expect(result.success).toBe(true);
      expect(result.wamid).toBe("wamid.inflight_network_ack_123");
      expect(executeSendSpy).toHaveBeenCalledTimes(1);

      // Verify message is updated with WAMID and status SENT
      const updatedMsg = mockMessagesStore.find((m) => m.id === "msg_inflight_1");
      expect(updatedMsg?.status).toBe("SENT");
      expect(updatedMsg?.wamid).toBe("wamid.inflight_network_ack_123");

      queryRawOverride = null;
    });

    // ------------------------------------------------------------------------
    // F-03: Crash Window Recovery for QUEUED Campaign with 0 Message Records
    // ------------------------------------------------------------------------
    it("6a. Crash window recovery: QUEUED campaign with zero message records safely launches and creates messages", async () => {
      const scheduledFuture = new Date(Date.now() + 60000);
      const crashedCampaign: MockCampaign = {
        id: "cmp_crashed_queued",
        organizationId: "org_default",
        name: "Crashed Mid-Launch Campaign",
        description: "Status transitioned to QUEUED by scheduler but crashed before messages created",
        status: CampaignStatus.QUEUED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "Valued Customer", "2": "ORD-123", "3": "TRK-987" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP Retail Customers",
        totalRecipients: 1,
        scheduledAt: scheduledFuture,
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(crashedCampaign);

      // Verify 0 messages exist currently for this campaign
      const initialMsgs = mockMessagesStore.filter((m) => m.campaignId === "cmp_crashed_queued");
      expect(initialMsgs).toHaveLength(0);

      const mockQueue = {
        getJob: vi.fn().mockResolvedValue(null),
        add: vi.fn().mockImplementation(async (name, data, opts) => ({
          id: opts.jobId,
          data,
          opts,
        })),
      };
      whatsappQueueModule.setWhatsAppDispatchQueueForTest(mockQueue as any);
      vi.spyOn(redisModule, "isRedisConfigured").mockReturnValue(true);

      // Recover the crashed campaign
      const recoveryResult = await campaignService.recoverCampaignQueue(
        "org_default",
        "cmp_crashed_queued"
      );

      expect(recoveryResult.campaignId).toBe("cmp_crashed_queued");
      expect(recoveryResult.enqueuedSuccessCount).toBe(1);

      // Verify messages were created in the store
      const recoveredMsgs = mockMessagesStore.filter((m) => m.campaignId === "cmp_crashed_queued");
      expect(recoveredMsgs).toHaveLength(1);
      expect(recoveredMsgs[0].status).toBe("QUEUED");
      expect(recoveredMsgs[0].recipientPhone).toBe("+919876543210");

      whatsappQueueModule.setWhatsAppDispatchQueueForTest(null);
    });

    it("6b. Crash window recovery idempotency: subsequent recovery call does not duplicate messages or jobs", async () => {
      const scheduledFuture = new Date(Date.now() + 60000);
      const recoveredCampaign: MockCampaign = {
        id: "cmp_recovered_queued",
        organizationId: "org_default",
        name: "Already Recovered Campaign",
        description: "Already had messages created",
        status: CampaignStatus.QUEUED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "Valued Customer", "2": "ORD-123", "3": "TRK-987" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP Retail Customers",
        totalRecipients: 1,
        scheduledAt: scheduledFuture,
        startedAt: new Date(),
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(recoveredCampaign);

      const msg = {
        id: "msg_already_rec_1",
        organizationId: "org_default",
        campaignId: "cmp_recovered_queued",
        contactId: "cnt_vip_001",
        status: "QUEUED",
        recipientPhone: "+919876543210",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        parameters: {},
        dispatchRun: 1,
        attemptCount: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockMessagesStore.push(msg);

      // Setup mock queue with getJob returning already waiting job
      const mockQueue = {
        getJob: vi.fn().mockResolvedValue({
          id: "msg_msg_already_rec_1",
          getState: vi.fn().mockResolvedValue("delayed"),
        }),
        add: vi.fn(),
      };
      whatsappQueueModule.setWhatsAppDispatchQueueForTest(mockQueue as any);
      vi.spyOn(redisModule, "isRedisConfigured").mockReturnValue(true);

      const msgCountBefore = mockMessagesStore.filter((m) => m.campaignId === "cmp_recovered_queued").length;
      expect(msgCountBefore).toBe(1);

      // Run second recovery on the already-recovered campaign
      const secondRecovery = await campaignService.recoverCampaignQueue(
        "org_default",
        "cmp_recovered_queued"
      );

      // Total messages in store remains exactly 1 (no duplicate creation)
      const msgCountAfter = mockMessagesStore.filter((m) => m.campaignId === "cmp_recovered_queued").length;
      expect(msgCountAfter).toBe(1);
      expect(secondRecovery.alreadyEnqueuedCount).toBe(1);
      expect(secondRecovery.requeuedCount).toBe(0);
      expect(mockQueue.add).not.toHaveBeenCalled();

      whatsappQueueModule.setWhatsAppDispatchQueueForTest(null);
    });

    it("6c. Crash window recovery handles failed launch by marking campaign FAILED", async () => {
      const invalidCampaign: MockCampaign = {
        id: "cmp_invalid_queued",
        organizationId: "org_default",
        name: "Invalid Template Crashed Campaign",
        description: null,
        status: CampaignStatus.QUEUED,
        approvalStatus: CampaignApprovalStatus.APPROVED,
        dispatchRun: 1,
        templateId: "tpl-invalid",
        templateName: "unapproved_template_xyz", // Not in allowlist
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP List",
        totalRecipients: 1,
        scheduledAt: new Date(Date.now() + 60000),
        startedAt: null,
        completedAt: null,
        createdBy: "usr_admin",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockCampaignsStore.push(invalidCampaign);
      vi.spyOn(redisModule, "isRedisConfigured").mockReturnValue(true);

      // Recovery should throw BadRequestError because template is not in allowlist
      await expect(
        campaignService.recoverCampaignQueue("org_default", "cmp_invalid_queued")
      ).rejects.toThrow(/not in the testing allowlist/);

      // Campaign should be transitioned to FAILED
      const campaignInStore = mockCampaignsStore.find((c) => c.id === "cmp_invalid_queued");
      expect(campaignInStore?.status).toBe(CampaignStatus.FAILED);
    });

    // ------------------------------------------------------------------------
    // Immediate Dispatch Unaffected
    // ------------------------------------------------------------------------
    it("7. Existing immediate campaigns remain unaffected", async () => {
      const mockQueue = {
        getJob: vi.fn().mockResolvedValue(null),
        add: vi.fn().mockImplementation(async (name, data, opts) => ({
          id: opts.jobId,
          data,
          opts,
        })),
      };

      whatsappQueueModule.setWhatsAppDispatchQueueForTest(mockQueue as any);
      vi.spyOn(redisModule, "isRedisConfigured").mockReturnValue(true);

      // Enqueue immediate job (scheduledAt is null, delay is not set)
      const res = await enqueueWhatsAppDispatchJob({
        messageId: "msg_immediate_test",
        organizationId: "org_default",
        recipientPhone: "+919876543210",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        parameters: {},
        campaignId: "cmp_immediate",
        scheduledAt: null,
      });

      expect(res.alreadyExisted).toBe(false);
      // No delay option passed to queue.add
      expect(mockQueue.add).toHaveBeenCalledWith(
        "dispatch",
        expect.any(Object),
        { jobId: "msg_msg_immediate_test" }
      );

      whatsappQueueModule.setWhatsAppDispatchQueueForTest(null);
    });
  });
});
