import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { CampaignStatus } from "@prisma/client";
import { campaignService, CampaignApprovalStatus } from "../services/campaign.service.js";
import { platformAuthService } from "../services/platformAuth.service.js";
import { processDispatchMessage } from "../workers/dispatch.worker.js";
import { WhatsAppSendService } from "../services/whatsappSend.service.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { setAllowedTestTemplates } from "../constants/templateAllowlist.js";
import { ForbiddenError, BadRequestError } from "../utils/errors.js";

interface MockCampaign {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  approvalStatus: CampaignApprovalStatus;
  approvedAt: Date | null;
  approvedBy: string | null;
  approvalNotes: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  dispatchRun: number;
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
  status: string;
  recipientPhone: string;
  templateName: string;
  templateLanguage: string;
  parameters: any;
  dispatchRun?: number;
  wamid?: string | null;
  errorCode?: string | null;
  errorMessage?: string | null;
  createdAt: Date;
  updatedAt: Date;
}> = [];

// Mock BullMQ queue removal helper
const mockRemoveJob = vi.fn().mockResolvedValue(true);
vi.mock("../queue/whatsapp.queue.js", () => ({
  removeWhatsAppDispatchJob: (orgId: string, messageId: string) => mockRemoveJob(orgId, messageId),
  enqueueWhatsAppDispatchJob: vi.fn().mockResolvedValue({ id: "job_mock" }),
  inspectAndRecoverDispatchJob: vi.fn().mockResolvedValue({ recovered: false }),
}));

// Mock Prisma client to keep tests purely isolated, non-destructive, and deterministic
vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => ({
      organization: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === "org_default" || where.id === "org_customer_01" || where.id === "org_customer_02") {
            return { id: where.id, name: "Test Organization", slug: where.id };
          }
          return null;
        }),
      },
      campaign: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
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
          return filtered;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            mockCampaignsStore.find((c) => {
              if (where.id && c.id !== where.id) return false;
              if (where.organizationId && c.organizationId !== where.organizationId) return false;
              if (where.approvalStatus) {
                if (typeof where.approvalStatus === "string" && c.approvalStatus !== where.approvalStatus) return false;
                if (where.approvalStatus.in && !where.approvalStatus.in.includes(c.approvalStatus)) return false;
              }
              return true;
            }) || null
          );
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          return mockCampaignsStore.find((c) => c.id === where.id) || null;
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const newCamp: MockCampaign = {
            id: `cmp_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            organizationId: data.organizationId,
            name: data.name,
            description: data.description || null,
            status: data.status || CampaignStatus.DRAFT,
            approvalStatus: data.approvalStatus || CampaignApprovalStatus.NOT_REQUIRED,
            approvedAt: data.approvedAt || null,
            approvedBy: data.approvedBy || null,
            approvalNotes: data.approvalNotes || null,
            rejectedAt: data.rejectedAt || null,
            rejectedBy: data.rejectedBy || null,
            rejectionReason: data.rejectionReason || null,
            dispatchRun: data.dispatchRun || 1,
            templateId: data.templateId,
            templateName: data.templateName,
            templateLanguage: data.templateLanguage || "en_US",
            templateCategory: data.templateCategory || "MARKETING",
            variablesMapping: data.variablesMapping || {},
            audienceType: data.audienceType || "CONTACT_LIST",
            audienceId: data.audienceId || "aud_1",
            audienceName: data.audienceName || "VIP Buyers",
            totalRecipients: data.totalRecipients || 10,
            scheduledAt: data.scheduledAt ? new Date(data.scheduledAt) : null,
            startedAt: data.startedAt ? new Date(data.startedAt) : null,
            completedAt: data.completedAt ? new Date(data.completedAt) : null,
            createdBy: data.createdBy || null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockCampaignsStore.push(newCamp);
          return newCamp;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const idx = mockCampaignsStore.findIndex((c) => c.id === where.id);
          if (idx === -1) throw new Error("Campaign not found");
          const existing = mockCampaignsStore[idx];
          const updated: MockCampaign = {
            ...existing,
            ...data,
            scheduledAt:
              data.scheduledAt === null
                ? null
                : data.scheduledAt !== undefined
                ? new Date(data.scheduledAt)
                : existing.scheduledAt,
            dispatchRun:
              typeof data.dispatchRun === "object" && data.dispatchRun?.increment
                ? existing.dispatchRun + data.dispatchRun.increment
                : data.dispatchRun ?? existing.dispatchRun,
            updatedAt: new Date(),
          };
          mockCampaignsStore[idx] = updated;
          return updated;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          for (let i = 0; i < mockCampaignsStore.length; i++) {
            const c = mockCampaignsStore[i];
            if (where.id && c.id !== where.id) continue;
            if (where.organizationId && c.organizationId !== where.organizationId) continue;
            if (where.status && c.status !== where.status) continue;
            if (where.approvalStatus) {
              if (typeof where.approvalStatus === "string" && c.approvalStatus !== where.approvalStatus) continue;
              if (where.approvalStatus.in && !where.approvalStatus.in.includes(c.approvalStatus)) continue;
            }

            mockCampaignsStore[i] = {
              ...c,
              ...data,
              dispatchRun:
                typeof data.dispatchRun === "object" && data.dispatchRun?.increment
                  ? c.dispatchRun + data.dispatchRun.increment
                  : data.dispatchRun ?? c.dispatchRun,
              updatedAt: new Date(),
            };
            count++;
          }
          return { count };
        }),
      },
      whatsAppMessage: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          return mockMessagesStore.filter((m) => {
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.status && m.status !== where.status) return false;
            return true;
          });
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          return mockMessagesStore.find((m) => m.id === where.id) || null;
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            mockMessagesStore.find((m) => {
              if (where.id && m.id !== where.id) return false;
              if (where.organizationId && m.organizationId !== where.organizationId) return false;
              return true;
            }) || null
          );
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const msg = {
            id: `msg_${Date.now()}_${Math.random().toString(36).substring(7)}`,
            organizationId: data.organizationId,
            campaignId: data.campaignId,
            recipientPhone: data.recipientPhone,
            templateName: data.templateName,
            templateLanguage: data.templateLanguage,
            parameters: data.parameters,
            dispatchRun: data.dispatchRun || 1,
            status: data.status || "QUEUED",
            createdAt: new Date(),
            updatedAt: new Date(),
          };
          mockMessagesStore.push(msg);
          return msg;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const idx = mockMessagesStore.findIndex((m) => m.id === where.id);
          if (idx !== -1) {
            mockMessagesStore[idx] = { ...mockMessagesStore[idx], ...data, updatedAt: new Date() };
            return mockMessagesStore[idx];
          }
          return null;
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          for (let i = 0; i < mockMessagesStore.length; i++) {
            const m = mockMessagesStore[i];
            if (where.id && m.id !== where.id) continue;
            if (where.campaignId && m.campaignId !== where.campaignId) continue;
            if (where.organizationId && m.organizationId !== where.organizationId) continue;
            if (where.status && typeof where.status === "string" && m.status !== where.status) continue;
            if (where.status?.in && !where.status.in.includes(m.status)) continue;

            mockMessagesStore[i] = { ...m, ...data, updatedAt: new Date() };
            count++;
          }
          return { count };
        }),
        count: vi.fn().mockResolvedValue(0),
      },
      contactList: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => ({
          id: where.id || "aud_1",
          organizationId: where.organizationId,
          name: "VIP Buyers",
        })),
      },
      contactListMember: {
        count: vi.fn().mockResolvedValue(1),
        findMany: vi.fn().mockResolvedValue([
          {
            contactId: "cnt_1",
            contact: {
              id: "cnt_1",
              phone: "+15551234567",
              phoneNumber: "+15551234567",
              consentStatus: "OPTED_IN",
              isSuppressed: false,
            },
          },
        ]),
      },
      contact: {
        findMany: vi.fn().mockResolvedValue([
          { id: "cnt_1", phone: "+15551234567", consentState: "OPTED_IN", isSuppressed: false },
        ]),
      },
    }),
  };
});

describe("Phase A1.14: Scheduled Campaign Approval Workflow Comprehensive Tests", () => {
  beforeEach(() => {
    mockCampaignsStore = [];
    mockMessagesStore = [];
    mockRemoveJob.mockClear();
    setAllowedTestTemplates(["hello_world", "festive_promo_2026", "general_announcement"]);
    vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
      id: "tpl_1",
      name: "hello_world",
      status: "APPROVED",
      category: "MARKETING",
      language: "en_US",
      isSendable: true,
    } as any);
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Send Now Approval Exemption", () => {
    it("creates Send Now campaigns as NOT_REQUIRED and launches without approval", async () => {
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Immediate Flash Sale",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: null,
        },
        "user_owner"
      );

      expect(camp.approvalStatus).toBe(CampaignApprovalStatus.NOT_REQUIRED);
      expect(camp.status).toBe(CampaignStatus.DRAFT);

      // Launch immediately
      const summary = await campaignService.launchCampaign("org_customer_01", camp.id);
      expect(summary.status).toBe(CampaignStatus.QUEUED);
    });
  });

  describe("2. Scheduled Campaign Approval & Rejection Lifecycle", () => {
    it("creates scheduled campaign with future schedule as PENDING approval and DRAFT status", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Future Festive Promo",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      expect(camp.approvalStatus).toBe(CampaignApprovalStatus.PENDING);
      expect(camp.status).toBe(CampaignStatus.DRAFT);
    });

    it("prevents scheduling with past or near-future time (< 5 minutes in future)", async () => {
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Unscheduled Draft",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: null,
        },
        "user_owner"
      );

      // Past date: rejected
      const pastDate = new Date(Date.now() - 60000).toISOString();
      await expect(
        campaignService.scheduleCampaign("org_customer_01", camp.id, pastDate)
      ).rejects.toThrow(BadRequestError);

      // +1 minute: rejected
      const plus1m = new Date(Date.now() + 60 * 1000).toISOString();
      await expect(
        campaignService.scheduleCampaign("org_customer_01", camp.id, plus1m)
      ).rejects.toThrow(BadRequestError);

      // +4 minutes: rejected
      const plus4m = new Date(Date.now() + 4 * 60 * 1000).toISOString();
      await expect(
        campaignService.scheduleCampaign("org_customer_01", camp.id, plus4m)
      ).rejects.toThrow(BadRequestError);

      // +4m59s: rejected
      const plus4m59s = new Date(Date.now() + (5 * 60 * 1000 - 1000)).toISOString();
      await expect(
        campaignService.scheduleCampaign("org_customer_01", camp.id, plus4m59s)
      ).rejects.toThrow(BadRequestError);

      // +5 minutes: accepted
      const plus5m = new Date(Date.now() + 5 * 60 * 1000 + 500).toISOString();
      const scheduled = await campaignService.scheduleCampaign("org_customer_01", camp.id, plus5m);
      expect((scheduled as any).scheduledAt).toBeDefined();
    });

    it("rejects approval if scheduled time has passed while pending", async () => {
      const pastDate = new Date(Date.now() - 3600000);
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Expired Pending Campaign",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: new Date(Date.now() + 3600000).toISOString(),
        },
        "user_owner"
      );

      // Force past schedule in store
      camp.scheduledAt = pastDate;

      await expect(
        campaignService.approveCampaign("org_customer_01", camp.id, "reviewer_admin", "Looks good")
      ).rejects.toThrow(BadRequestError);
    });

    it("approves campaign with future schedule, setting APPROVED and SCHEDULED", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Valid Future Campaign",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      const approved = await campaignService.approveCampaign(
        "org_customer_01",
        camp.id,
        "reviewer_admin",
        "Approved for morning broadcast"
      );

      expect(approved.approvalStatus).toBe(CampaignApprovalStatus.APPROVED);
      expect(approved.status).toBe(CampaignStatus.SCHEDULED);
      expect(approved.approvedBy).toBe("reviewer_admin");
      expect(approved.approvalNotes).toBe("Approved for morning broadcast");
    });

    it("rejects campaign with required reason >= 3 chars, setting REJECTED and DRAFT", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Needs Adjustment Campaign",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      // Empty or too short reason
      await expect(
        campaignService.rejectCampaign("org_customer_01", camp.id, "reviewer_admin", "no")
      ).rejects.toThrow(BadRequestError);

      const rejected = await campaignService.rejectCampaign(
        "org_customer_01",
        camp.id,
        "reviewer_admin",
        "Please choose a daytime schedule between 9 AM and 6 PM"
      );

      expect(rejected.approvalStatus).toBe(CampaignApprovalStatus.REJECTED);
      expect(rejected.status).toBe(CampaignStatus.DRAFT);
      expect(rejected.rejectionReason).toContain("daytime schedule");
      expect(rejected.rejectedBy).toBe("reviewer_admin");
    });
  });

  describe("3. In-Place Resubmission & Schedule-Clear Bypass Prevention", () => {
    it("prevents clearing scheduledAt to bypass approval on PENDING or REJECTED campaigns", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Pending Campaign",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      // Attempting to clear schedule to convert to immediate send
      await expect(
        campaignService.updateCampaign("org_customer_01", camp.id, {
          scheduledAt: null,
        })
      ).rejects.toThrow(BadRequestError);
    });

    it("allows customer to edit rejected campaign in-place with future schedule and resets to PENDING", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Rejected Campaign",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      await campaignService.rejectCampaign(
        "org_customer_01",
        camp.id,
        "reviewer_admin",
        "Adjust schedule time"
      );

      const newFutureDate = new Date(Date.now() + 7200000).toISOString();
      const resubmitted = await campaignService.updateCampaign("org_customer_01", camp.id, {
        name: "Adjusted Resubmitted Campaign",
        scheduledAt: newFutureDate,
      });

      expect(resubmitted.approvalStatus).toBe(CampaignApprovalStatus.PENDING);
      expect(resubmitted.status).toBe(CampaignStatus.DRAFT);
      expect(resubmitted.rejectionReason).toBeNull();
      expect(resubmitted.name).toBe("Adjusted Resubmitted Campaign");
    });

    it("invalidates approval to PENDING and bumps dispatchRun on material edits of APPROVED campaigns", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Approved Campaign",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      await campaignService.approveCampaign("org_customer_01", camp.id, "reviewer_admin");

      const newFutureDate = new Date(Date.now() + 10800000).toISOString();
      const updated = await campaignService.updateCampaign("org_customer_01", camp.id, {
        scheduledAt: newFutureDate,
      });

      expect(updated.approvalStatus).toBe(CampaignApprovalStatus.PENDING);
      expect(updated.status).toBe(CampaignStatus.DRAFT);
      expect(updated.dispatchRun).toBeGreaterThan(1);
    });
  });

  describe("4. Authorization Boundaries & Scoping", () => {
    it("denies regular customer user from approving campaigns (403 Forbidden)", () => {
      const mockReq: any = {
        context: {
          userId: "user_cust",
          organizationId: "org_customer_01",
          role: "OWNER",
        },
        headers: {},
      };

      expect(() =>
        platformAuthService.assertCampaignApprovalPrivilege(mockReq, "org_customer_01")
      ).toThrow(ForbiddenError);
    });

    it("denies Delegated Admin for non-assigned customer organization", () => {
      const mockReq: any = {
        context: {
          userId: "admin_del",
          organizationId: "org_agency",
          role: "DELEGATED_ADMIN",
        },
        headers: {
          "x-platform-role": "DELEGATED_ADMIN",
        },
      };

      vi.spyOn(platformAuthService, "getPlatformPrincipal").mockReturnValue({
        userId: "admin_del",
        organizationId: "org_agency",
        platformRole: "DELEGATED_ADMIN",
        isPlatformAdmin: true,
        assignedOrganizationIds: ["org_customer_01"],
      });

      // Permitted for assigned
      expect(() =>
        platformAuthService.assertCampaignApprovalPrivilege(mockReq, "org_customer_01")
      ).not.toThrow();

      // Denied for unassigned org_customer_02
      expect(() =>
        platformAuthService.assertCampaignApprovalPrivilege(mockReq, "org_customer_02")
      ).toThrow(ForbiddenError);
    });

    it("permits Platform Master Admin global review override on any organization", () => {
      const mockReq: any = {
        context: {
          userId: "master_admin",
          organizationId: "org_master",
        },
        headers: {},
      };

      vi.spyOn(platformAuthService, "getPlatformPrincipal").mockReturnValue({
        userId: "master_admin",
        organizationId: "org_master",
        platformRole: "PLATFORM_MASTER_ADMIN",
        isPlatformAdmin: true,
        assignedOrganizationIds: [],
      });

      expect(() =>
        platformAuthService.assertCampaignApprovalPrivilege(mockReq, "org_customer_01")
      ).not.toThrow();
      expect(() =>
        platformAuthService.assertCampaignApprovalPrivilege(mockReq, "org_customer_02")
      ).not.toThrow();
    });
  });

  describe("5. Dispatch Safety & Worker Fencing", () => {
    it("launchCampaign blocks unapproved scheduled campaign (ForbiddenError)", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Pending Launch Attempt",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      await expect(
        campaignService.launchCampaign("org_customer_01", camp.id)
      ).rejects.toThrow(ForbiddenError);
    });

    it("worker blocks delayed job if campaign approvalStatus is not APPROVED and fences message to FAILED", async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Pending In Worker",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate.toISOString(),
        },
        "user_owner"
      );

      const msgId = "msg_worker_pending_01";
      mockMessagesStore.push({
        id: msgId,
        organizationId: "org_customer_01",
        campaignId: camp.id,
        status: "QUEUED",
        recipientPhone: "+15551234567",
        templateName: "hello_world",
        templateLanguage: "en_US",
        parameters: {},
        dispatchRun: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const metaSendSpy = vi.spyOn(WhatsAppSendService, "executeMetaSend");

      // Process job for message
      await processDispatchMessage({
        messageId: msgId,
        organizationId: "org_customer_01",
        campaignId: camp.id,
        recipientPhone: "+15551234567",
        templateName: "hello_world",
        templateLanguage: "en_US",
        parameters: {},
        dispatchRun: 1,
        scheduledAt: futureDate.toISOString(),
      });

      // Send service must NOT be called
      expect(metaSendSpy).not.toHaveBeenCalled();

      // Message must be fenced to FAILED with CAMPAIGN_NOT_APPROVED
      const updatedMsg = mockMessagesStore.find((m) => m.id === msgId);
      expect(updatedMsg?.status).toBe("FAILED");
      expect(updatedMsg?.errorCode).toBe("CAMPAIGN_NOT_APPROVED");
    });

    it("worker blocks stale job with dispatchRun revision mismatch and fences message to FAILED", async () => {
      const futureDate = new Date(Date.now() + 3600000);
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Revision Test Campaign",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate.toISOString(),
        },
        "user_owner"
      );

      // Approve campaign at revision 1
      await campaignService.approveCampaign("org_customer_01", camp.id, "reviewer_admin");

      // Now campaign is materially edited with new schedule, bumping dispatchRun to 2
      const newFutureDate = new Date(Date.now() + 7200000);
      await campaignService.updateCampaign("org_customer_01", camp.id, {
        scheduledAt: newFutureDate.toISOString(),
      });
      // Re-approved at revision 2
      await campaignService.approveCampaign("org_customer_01", camp.id, "reviewer_admin");

      const msgId = "msg_worker_stale_rev_01";
      mockMessagesStore.push({
        id: msgId,
        organizationId: "org_customer_01",
        campaignId: camp.id,
        status: "QUEUED",
        recipientPhone: "+15551234567",
        templateName: "hello_world",
        templateLanguage: "en_US",
        parameters: {},
        dispatchRun: 1, // Stale job has revision 1, but campaign is at 2
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const metaSendSpy = vi.spyOn(WhatsAppSendService, "executeMetaSend");

      await processDispatchMessage({
        messageId: msgId,
        organizationId: "org_customer_01",
        campaignId: camp.id,
        recipientPhone: "+15551234567",
        templateName: "hello_world",
        templateLanguage: "en_US",
        parameters: {},
        dispatchRun: 1, // Old revision
        scheduledAt: newFutureDate.toISOString(),
      });

      expect(metaSendSpy).not.toHaveBeenCalled();

      const updatedMsg = mockMessagesStore.find((m) => m.id === msgId);
      expect(updatedMsg?.status).toBe("FAILED");
      expect(updatedMsg?.errorCode).toBe("STALE_JOB_REVISION_MISMATCH");
    });

    it("worker blocks stale job with schedule mismatch and fences message to FAILED", async () => {
      const initialDate = new Date(Date.now() + 3600000);
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Schedule Mismatch Test",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: initialDate.toISOString(),
        },
        "user_owner"
      );

      await campaignService.approveCampaign("org_customer_01", camp.id, "reviewer_admin");

      const msgId = "msg_worker_stale_sched_01";
      mockMessagesStore.push({
        id: msgId,
        organizationId: "org_customer_01",
        campaignId: camp.id,
        status: "QUEUED",
        recipientPhone: "+15551234567",
        templateName: "hello_world",
        templateLanguage: "en_US",
        parameters: {},
        dispatchRun: 1,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const metaSendSpy = vi.spyOn(WhatsAppSendService, "executeMetaSend");

      // Job arriving with an obsolete schedule
      await processDispatchMessage({
        messageId: msgId,
        organizationId: "org_customer_01",
        campaignId: camp.id,
        recipientPhone: "+15551234567",
        templateName: "hello_world",
        templateLanguage: "en_US",
        parameters: {},
        dispatchRun: 1,
        scheduledAt: new Date(Date.now() - 3600000).toISOString(), // Obsolete schedule
      });

      expect(metaSendSpy).not.toHaveBeenCalled();

      const updatedMsg = mockMessagesStore.find((m) => m.id === msgId);
      expect(updatedMsg?.status).toBe("FAILED");
      expect(updatedMsg?.errorCode).toBe("STALE_JOB_SCHEDULE_MISMATCH");
    });
  });

  describe("6. HTTP Route Integration", () => {
    it("POST /api/v1/campaigns/:id/approve denies customer and succeeds for Master Admin override", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Route Test Campaign",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      // 1. Regular customer token receives 403
      vi.spyOn(platformAuthService, "getPlatformPrincipal").mockReturnValue({
        userId: "cust_user",
        organizationId: "org_customer_01",
        platformRole: "NONE",
        isPlatformAdmin: false,
        assignedOrganizationIds: [],
      });

      const resDenied = await request(app)
        .post(`/api/v1/campaigns/${camp.id}/approve`)
        .set("x-test-org-id", "org_customer_01")
        .send({ notes: "Attempt by customer" });

      expect(resDenied.status).toBe(403);

      // 2. Master Admin override receives 200
      vi.spyOn(platformAuthService, "getPlatformPrincipal").mockReturnValue({
        userId: "master_admin",
        organizationId: "org_master",
        platformRole: "PLATFORM_MASTER_ADMIN",
        isPlatformAdmin: true,
        assignedOrganizationIds: [],
      });

      const resApproved = await request(app)
        .post(`/api/v1/campaigns/${camp.id}/approve`)
        .set("x-test-org-id", "org_customer_01")
        .send({ notes: "Master Admin global approval" });

      expect(resApproved.status).toBe(200);
      expect(resApproved.body.data.approvalStatus).toBe(CampaignApprovalStatus.APPROVED);
      expect(resApproved.body.data.status).toBe(CampaignStatus.SCHEDULED);
    });

    it("POST /api/v1/campaigns/:id/reject validates reason and rejects for Delegated Admin", async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      const camp = await campaignService.createCampaign(
        "org_customer_01",
        {
          name: "Reject Route Test",
          templateId: "tpl_1",
          templateName: "hello_world",
          audienceType: "CONTACT_LIST",
          audienceId: "aud_1",
          audienceName: "VIP Buyers",
          totalRecipients: 10,
          scheduledAt: futureDate,
        },
        "user_owner"
      );

      vi.spyOn(platformAuthService, "getPlatformPrincipal").mockReturnValue({
        userId: "del_admin_01",
        organizationId: "org_agency",
        platformRole: "DELEGATED_ADMIN",
        isPlatformAdmin: true,
        assignedOrganizationIds: ["org_customer_01"],
      });

      // Reason too short (< 3 chars) receives 422 (ValidationError)
      const resBad = await request(app)
        .post(`/api/v1/campaigns/${camp.id}/reject`)
        .set("x-test-org-id", "org_customer_01")
        .send({ reason: "no" });

      expect(resBad.status).toBe(422);

      // Valid reason receives 200
      const resRejected = await request(app)
        .post(`/api/v1/campaigns/${camp.id}/reject`)
        .set("x-test-org-id", "org_customer_01")
        .send({ reason: "Please choose morning time" });

      expect(resRejected.status).toBe(200);
      expect(resRejected.body.data.approvalStatus).toBe(CampaignApprovalStatus.REJECTED);
      expect(resRejected.body.data.status).toBe(CampaignStatus.DRAFT);
    });
  });
});
