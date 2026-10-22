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
  CampaignSchedulerService,
} from "../services/campaignScheduler.service.js";
import { campaignService } from "../services/campaign.service.js";
import * as automaticWorkerService from "../services/automaticWorker.service.js";
import { ALLOWED_TEST_TEMPLATE_NAMES, setAllowedTestTemplates } from "../constants/templateAllowlist.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";

// In-memory mock store for isolated test execution
interface MockCampaign {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
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
let updateManyOverride: (() => { count: number }) | null = null;

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
            const matchStatus = !where.status || c.status === where.status;

            if (matchId && matchStatus) {
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
      },
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
        templateId: "tpl-101",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "Customer", "2": "ORD-456", "3": "TRK-000" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_vip",
        audienceName: "VIP Retail Customers",
        totalRecipients: 100,
        scheduledAt: new Date("2026-10-25T04:30:00.000Z"), // Future
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
  });

  afterEach(() => {
    setAllowedTestTemplates(null);
    updateManyOverride = null;
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
      expect(res.body.data.status).toBe("SCHEDULED");
      expect(new Date(res.body.data.scheduledAt).toISOString()).toBe(futureIso);

      // Verify in store
      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_draft_01");
      expect(campaign?.status).toBe(CampaignStatus.SCHEDULED);
      expect(campaign?.scheduledAt?.toISOString()).toBe(futureIso);
    });

    it("allows rescheduling an already SCHEDULED campaign to a new future time", async () => {
      const newFutureIso = new Date(Date.now() + 172800000).toISOString(); // 2 days in future
      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/schedule")
        .send({ scheduledAt: newFutureIso });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("SCHEDULED");
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

    it("rejects cancelling a campaign when dispatch has already started (QUEUED, SENDING, COMPLETED) with HTTP 400", async () => {
      const campaign = mockCampaignsStore.find((c) => c.id === "cmp_scheduled_01")!;
      campaign.status = CampaignStatus.QUEUED;

      const res = await request(app)
        .post("/api/v1/campaigns/cmp_scheduled_01/cancel")
        .send();

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Dispatch has already started or completed");
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
      expect(res.body.data.status).toBe("SCHEDULED");
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
});
