import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { setAllowedTestTemplates, ALLOWED_TEST_TEMPLATE_NAMES } from "../constants/templateAllowlist.js";
import { app } from "../app.js";
import { CampaignStatus, MessageDeliveryStatus, ConsentStatus } from "@prisma/client";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import * as dispatchQueue from "../queue/whatsapp.queue.js";
import * as redisConfig from "../config/redis.js";
import { AppError } from "../utils/errors.js";

// ── In-Memory Test Stores ───────────────────────────────────────────────────

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

interface MockContact {
  id: string;
  organizationId: string;
  phoneNumber: string;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  attributes: Record<string, unknown> | null;
  consentStatus: ConsentStatus;
  isSuppressed: boolean;
  suppressionReason: string | null;
}

interface MockMember {
  id: string;
  organizationId: string;
  listId: string;
  contactId: string;
  addedAt: Date;
  contact: MockContact;
}

interface MockMessage {
  id: string;
  organizationId: string;
  campaignId: string | null;
  campaignNameSnapshot: string | null;
  contactId: string | null;
  dispatchRun: number;
  clientRequestId: string;
  recipientPhone: string;
  templateName: string;
  templateLanguage: string;
  parameters: Record<string, unknown>;
  status: MessageDeliveryStatus;
  createdAt: Date;
}

let campaignsStore: MockCampaign[] = [];
let contactsStore: MockContact[] = [];
let membersStore: MockMember[] = [];
let messagesStore: MockMessage[] = [];
let simulateP2002Race = false;

// ── Mock Prisma Client ──────────────────────────────────────────────────────

vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => ({
      organization: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === "org_default" || where.id === "org_alpha" || where.id === "org_beta") {
            return {
              id: where.id,
              name: `Org ${where.id}`,
              slug: where.id,
              isArchived: false,
              deletedAt: null,
            };
          }
          return null;
        }),
      },
      campaign: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            campaignsStore.find(
              (c) => c.id === where.id && c.organizationId === where.organizationId
            ) || null
          );
        }),
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          return campaignsStore.find((c) => c.id === where.id) || null;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const idx = campaignsStore.findIndex((c) => c.id === where.id);
          if (idx === -1) throw new Error("Campaign not found");
          campaignsStore[idx] = {
            ...campaignsStore[idx],
            ...data,
            updatedAt: new Date(),
          };
          return campaignsStore[idx];
        }),
        updateMany: vi.fn().mockImplementation(async ({ where, data }) => {
          let count = 0;
          campaignsStore.forEach((c, idx) => {
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
              campaignsStore[idx] = { ...c, ...data, updatedAt: new Date() };
              count++;
            }
          });
          return { count };
        }),
      },
      contact: {
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            contactsStore.find(
              (c) =>
                c.id === where.id &&
                (!where.organizationId || c.organizationId === where.organizationId)
            ) || null
          );
        }),
      },
      contactListMember: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          return membersStore.filter(
            (m) =>
              m.organizationId === where.organizationId && m.listId === where.listId
          );
        }),
      },
      whatsAppMessage: {
        findMany: vi.fn().mockImplementation(async ({ where }) => {
          return messagesStore.filter((m) => {
            if (where.organizationId && m.organizationId !== where.organizationId) return false;
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.dispatchRun !== undefined && m.dispatchRun !== where.dispatchRun) return false;
            if (where.status && m.status !== where.status) return false;
            return true;
          });
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          return (
            messagesStore.find(
              (m) =>
                m.campaignId === where.campaignId &&
                m.contactId === where.contactId &&
                m.dispatchRun === where.dispatchRun
            ) || null
          );
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          return messagesStore.filter((m) => {
            if (where.campaignId && m.campaignId !== where.campaignId) return false;
            if (where.status) {
              if (where.status.in && !where.status.in.includes(m.status)) return false;
              if (where.status.not && m.status === where.status.not) return false;
              if (typeof where.status === "string" && m.status !== where.status) return false;
            }
            return true;
          }).length;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const idx = messagesStore.findIndex((m) => m.id === where.id);
          if (idx === -1) throw new Error("Message not found");
          messagesStore[idx] = { ...messagesStore[idx], ...data, updatedAt: new Date() };
          return messagesStore[idx];
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          if (simulateP2002Race) {
            simulateP2002Race = false;
            const err = new Error("Unique constraint failed on the fields: (`campaignId`,`contactId`,`dispatchRun`)") as any;
            err.code = "P2002";
            throw err;
          }

          // Check unique constraints: (campaignId, contactId, dispatchRun)
          const duplicate = messagesStore.find(
            (m) =>
              m.campaignId === data.campaignId &&
              m.contactId === data.contactId &&
              m.dispatchRun === data.dispatchRun
          );
          if (duplicate) {
            const err = new Error("Unique constraint failed") as any;
            err.code = "P2002";
            throw err;
          }

          const newMsg: MockMessage = {
            id: `msg_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            organizationId: data.organizationId,
            campaignId: data.campaignId,
            campaignNameSnapshot: data.campaignNameSnapshot,
            contactId: data.contactId,
            dispatchRun: data.dispatchRun,
            clientRequestId: data.clientRequestId,
            recipientPhone: data.recipientPhone,
            templateName: data.templateName,
            templateLanguage: data.templateLanguage,
            parameters: data.parameters,
            status: data.status,
            createdAt: new Date(),
          };
          messagesStore.push(newMsg);
          return newMsg;
        }),
      },
    }),
  };
});

describe("Phase 10 — Step 1: Backend Campaign Dispatch Orchestrator Tests", () => {
  const orgId = "org_default";

  beforeEach(() => {
    campaignsStore = [];
    contactsStore = [];
    membersStore = [];
    messagesStore = [];
    simulateP2002Race = false;
    vi.restoreAllMocks();
    setAllowedTestTemplates([...ALLOWED_TEST_TEMPLATE_NAMES, "diwali_promo"]);
  });

  afterEach(() => {
    setAllowedTestTemplates(null);
    vi.restoreAllMocks();
  });

  beforeEach(() => {
    // Default mock: template service returns an APPROVED, sendable template
    vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
      id: "tpl_12345",
      name: "diwali_promo",
      language: "en_US",
      status: "APPROVED",
      category: "MARKETING",
      parameter_format: "POSITIONAL",
      components: [
        {
          type: "BODY",
          text: "Hello {{1}}, enjoy {{2}} discount on your order!",
        },
      ],
      isSendable: true,
      variableCount: 2,
    });

    // Default mock: Redis queue enqueue succeeds
    vi.spyOn(redisConfig, "isRedisConfigured").mockReturnValue(true);
    vi.spyOn(dispatchQueue, "enqueueWhatsAppDispatchJob").mockImplementation(async (jobData) => {
      return {
        job: {
          id: `job_${jobData.messageId}`,
          name: "dispatch",
          data: jobData,
        } as any,
        alreadyExisted: false,
      };
    });
    vi.spyOn(dispatchQueue, "inspectAndRecoverDispatchJob").mockImplementation(async ({ jobData, dbMessage }) => {
      if (dbMessage.status !== MessageDeliveryStatus.QUEUED) {
        return { status: "ineligible_status", jobId: `msg_${jobData.messageId}` };
      }
      if (
        dbMessage.wamid ||
        (dbMessage.attemptCount !== undefined && dbMessage.attemptCount > 0) ||
        dbMessage.leaseExpiresAt
      ) {
        return { status: "ambiguous", jobId: `msg_${jobData.messageId}` };
      }
      const res = await dispatchQueue.enqueueWhatsAppDispatchJob(jobData);
      if (res.alreadyExisted) {
        return { status: "already_waiting", jobId: `msg_${jobData.messageId}`, job: res.job };
      }
      return { status: "newly_enqueued", jobId: `msg_${jobData.messageId}`, job: res.job };
    });
    vi.spyOn(dispatchQueue, "getWhatsAppDispatchJob").mockResolvedValue(undefined);
  });

  // ── Helper to seed a standard test campaign ───────────────────────────────
  function seedCampaign(overrides: Partial<MockCampaign> = {}): MockCampaign {
    const campaign: MockCampaign = {
      id: "cmp_test_001",
      organizationId: orgId,
      name: "Diwali Big Sale",
      description: "Festive promotion campaign",
      status: CampaignStatus.DRAFT,
      templateId: "tpl_12345",
      templateName: "diwali_promo",
      templateLanguage: "en_US",
      templateCategory: "MARKETING",
      variablesMapping: {
        "1": "{{firstName}}",
        "2": "25% OFF",
      },
      audienceType: "CONTACT_LIST",
      audienceId: "list_retail_customers",
      audienceName: "Retail Customers",
      totalRecipients: 0,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      createdBy: "usr_manager",
      createdAt: new Date(),
      updatedAt: new Date(),
      ...overrides,
    };
    campaignsStore.push(campaign);
    return campaign;
  }

  // ── Helper to seed contacts & list members ────────────────────────────────
  function seedMember(contactOverrides: Partial<MockContact> = {}): MockMember {
    const contact: MockContact = {
      id: `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      organizationId: orgId,
      phoneNumber: "+919876543210",
      firstName: "Rahul",
      lastName: "Sharma",
      email: "rahul@example.com",
      attributes: { tier: "VIP", city: "Mumbai" },
      consentStatus: ConsentStatus.OPTED_IN,
      isSuppressed: false,
      suppressionReason: null,
      ...contactOverrides,
    };
    contactsStore.push(contact);

    const member: MockMember = {
      id: `mem_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      organizationId: orgId,
      listId: "list_retail_customers",
      contactId: contact.id,
      addedAt: new Date(),
      contact,
    };
    membersStore.push(member);
    return member;
  }

  // ── 1. Tenant Isolation Tests ──────────────────────────────────────────────

  describe("Tenant Isolation & Security", () => {
    it("returns 404 when attempting to launch a campaign owned by a different organization", async () => {
      seedCampaign({ id: "cmp_other_org", organizationId: "org_alpha" });

      // Request from default org context (org_default)
      const res = await request(app).post("/api/v1/campaigns/cmp_other_org/send");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error?.message).toContain("not found");
    });

    it("does not load or process contacts belonging to a different tenant", async () => {
      seedCampaign({ id: "cmp_test_001" });

      // Member with different org ID
      const rogueContact: MockContact = {
        id: "cnt_rogue_999",
        organizationId: "org_alpha",
        phoneNumber: "+919999999999",
        firstName: "Rogue",
        lastName: "User",
        email: null,
        attributes: null,
        consentStatus: ConsentStatus.OPTED_IN,
        isSuppressed: false,
        suppressionReason: null,
      };
      membersStore.push({
        id: "mem_rogue_999",
        organizationId: "org_alpha", // Isolated from org_default
        listId: "list_retail_customers",
        contactId: rogueContact.id,
        addedAt: new Date(),
        contact: rogueContact,
      });

      // Also add 1 valid member for org_default
      seedMember({ firstName: "ValidUser", phoneNumber: "+919876543210" });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleCount).toBe(1);
      expect(res.body.data.totalAudienceCount).toBe(1); // Rogue org member excluded by query filter
    });
  });

  // ── 2. Source Status & Lifecycle Validation ─────────────────────────────────

  describe("Campaign Source Status & Configuration Validation", () => {
    it("successfully launches a campaign in DRAFT status", async () => {
      seedCampaign({ status: CampaignStatus.DRAFT });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(CampaignStatus.QUEUED);
    });

    it("successfully launches a campaign in SCHEDULED status", async () => {
      seedCampaign({ status: CampaignStatus.SCHEDULED });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.status).toBe(CampaignStatus.QUEUED);
    });

    it("rejects launch with HTTP 400 when campaign is already COMPLETED", async () => {
      seedCampaign({ status: CampaignStatus.COMPLETED });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Cannot launch campaign with status 'COMPLETED'");
    });

    it("rejects launch with HTTP 400 when campaign is CANCELLED", async () => {
      seedCampaign({ status: CampaignStatus.CANCELLED });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Cannot launch campaign with status 'CANCELLED'");
    });

    it("rejects launch with HTTP 400 when campaign has audienceType MOCK (simulated)", async () => {
      seedCampaign({ audienceType: "MOCK", audienceId: null });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("simulated demo audience");
    });

    it("rejects launch with HTTP 400 when contact list is empty", async () => {
      seedCampaign();
      // No members added to list_retail_customers

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Target contact list has no members");
    });
  });

  // ── 3. Meta Template Validation ─────────────────────────────────────────────

  describe("Meta Template Approval & Sendability Checks", () => {
    it("rejects launch when template does not exist on Meta or in cache", async () => {
      seedCampaign();
      seedMember();

      vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue(null);

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("not found or inaccessible");
    });

    it("rejects launch when template status is REJECTED on Meta", async () => {
      seedCampaign();
      seedMember();

      vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
        id: "tpl_rej",
        name: "diwali_promo",
        language: "en_US",
        status: "REJECTED",
        category: "MARKETING",
        parameter_format: "POSITIONAL",
        components: [],
        isSendable: false,
      });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Only APPROVED templates can be launched");
    });

    it("rejects launch when template status is PAUSED on Meta", async () => {
      seedCampaign();
      seedMember();

      vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
        id: "tpl_paused",
        name: "diwali_promo",
        language: "en_US",
        status: "PAUSED",
        category: "MARKETING",
        parameter_format: "POSITIONAL",
        components: [],
        isSendable: false,
      });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Only APPROVED templates can be launched");
    });

    it("propagates HTTP 401 META_AUTH_EXPIRED when Meta access token is expired or invalid during launch", async () => {
      seedCampaign();
      seedMember();

      vi.spyOn(whatsappTemplateService, "getTemplateByName").mockRejectedValue(
        new AppError(
          "Meta WhatsApp access token has expired or is invalid. Please refresh META_WHATSAPP_ACCESS_TOKEN in backend/.env or your WhatsApp connection in Settings.",
          401,
          "META_AUTH_EXPIRED"
        )
      );

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(401);
      expect(res.body.error?.code).toBe("META_AUTH_EXPIRED");
      expect(res.body.error?.message).toContain("access token has expired or is invalid");
    });
  });

  // ── 4. Recipient Eligibility & Exclusion Safeguards ─────────────────────────

  describe("Audience Eligibility & Consent Filtering", () => {
    it("excludes contacts whose consentStatus is not OPTED_IN (e.g., PENDING or OPTED_OUT)", async () => {
      seedCampaign();
      seedMember({ firstName: "ValidUser", consentStatus: ConsentStatus.OPTED_IN });
      seedMember({ firstName: "PendingUser", consentStatus: ConsentStatus.PENDING });
      seedMember({ firstName: "OptedOutUser", consentStatus: ConsentStatus.OPTED_OUT });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleCount).toBe(1);
      expect(res.body.data.queuedCount).toBe(1);
      expect(res.body.data.excludedCount.consentRequired).toBe(2);
      expect(res.body.data.sampleExclusions.some((s: any) => s.reason.includes("Consent status"))).toBe(true);
    });

    it("excludes contacts marked as suppressed (isSuppressed = true)", async () => {
      seedCampaign();
      seedMember({ firstName: "ValidUser", isSuppressed: false });
      seedMember({
        firstName: "SuppressedUser",
        isSuppressed: true,
        suppressionReason: "Customer unsubscribed via STOP keyword",
      });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleCount).toBe(1);
      expect(res.body.data.excludedCount.suppressed).toBe(1);
      expect(res.body.data.sampleExclusions.some((s: any) => s.reason.includes("Suppressed"))).toBe(true);
    });

    it("excludes contacts with invalid or non-E.164 phone numbers", async () => {
      seedCampaign();
      seedMember({ firstName: "ValidUser", phoneNumber: "+919876543210" });
      seedMember({ firstName: "InvalidPhone1", phoneNumber: "invalid_string" });
      seedMember({ firstName: "InvalidPhone2", phoneNumber: "123" }); // Too short

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleCount).toBe(1);
      expect(res.body.data.excludedCount.invalidPhone).toBe(2);
      expect(res.body.data.sampleExclusions.some((s: any) => s.reason.includes("Invalid phone number"))).toBe(true);
    });

    it("rejects launch with HTTP 400 when all contacts are excluded, leaving zero eligible recipients", async () => {
      seedCampaign();
      // Add only non-opted-in contacts
      seedMember({ consentStatus: ConsentStatus.PENDING });
      seedMember({ consentStatus: ConsentStatus.OPTED_OUT });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("No eligible recipients found in audience list");
      expect(Array.isArray(res.body.error?.details)).toBe(true);
      expect(res.body.error?.details.some((d: any) => d.field === "consent" && d.message.includes("2 contact(s) excluded"))).toBe(true);
      // Campaign status must remain DRAFT (unmutated)
      expect(campaignsStore[0].status).toBe(CampaignStatus.DRAFT);
    });
  });

  // ── 5. Template Parameter Resolution & Missing Variables ────────────────────

  describe("Template Parameter Resolution & Auditable Exclusions", () => {
    it("correctly resolves {{contact.firstName}}, static strings, and custom attributes per contact", async () => {
      seedCampaign({
        variablesMapping: {
          "1": "{{contact.firstName}}",
          "2": "₹500 OFF",
        },
      });
      seedMember({ firstName: "Priya", phoneNumber: "+919812345678" });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleCount).toBe(1);
      expect(messagesStore.length).toBe(1);
      expect(messagesStore[0].parameters).toEqual({
        "1": "Priya",
        "2": "₹500 OFF",
      });
      expect(messagesStore[0].recipientPhone).toBe("+919812345678");
    });

    it("correctly resolves {{firstName}}, static strings, and custom attributes per contact", async () => {
      seedCampaign({
        variablesMapping: {
          "1": "{{firstName}}",
          "2": "₹500 OFF",
        },
      });
      seedMember({ firstName: "Priya", phoneNumber: "+919812345678" });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleCount).toBe(1);
      expect(messagesStore.length).toBe(1);
      expect(messagesStore[0].parameters).toEqual({
        "1": "Priya",
        "2": "₹500 OFF",
      });
      expect(messagesStore[0].recipientPhone).toBe("+919812345678");
    });

    it("excludes a contact when a required template variable cannot be resolved", async () => {
      seedCampaign({
        variablesMapping: {
          "1": "{{firstName}}", // Required by template
          "2": "25% OFF",
        },
      });
      // Contact 1 has a firstName
      seedMember({ firstName: "Aarav" });
      // Contact 2 has NO firstName (null/empty)
      seedMember({ firstName: null, phoneNumber: "+919876543219" });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleCount).toBe(1);
      expect(res.body.data.excludedCount.missingVariables).toBe(1);
      expect(res.body.data.sampleExclusions.some((s: any) => s.reason.includes("firstName"))).toBe(true);
      expect(messagesStore.length).toBe(1);
      expect(messagesStore[0].parameters).toEqual({
        "1": "Aarav",
        "2": "25% OFF",
      });
    });

    it("resolves custom attribute variables like {{attributes.loyaltyPoints}}", async () => {
      seedCampaign({
        variablesMapping: {
          "1": "{{firstName}}",
          "2": "{{attributes.loyaltyTier}}",
        },
      });
      seedMember({
        firstName: "Vikram",
        attributes: { loyaltyTier: "Platinum 500" },
      });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleCount).toBe(1);
      expect(messagesStore[0].parameters).toEqual({
        "1": "Vikram",
        "2": "Platinum 500",
      });
    });
  });

  // ── 6. Idempotency, Deduplication & Repeated Launch Requests ─────────────────

  describe("Idempotency & Deduplication", () => {
    it("repeated launch requests do not duplicate WhatsAppMessage records and report alreadyPreparedCount", async () => {
      seedCampaign();
      seedMember({ firstName: "Amit", phoneNumber: "+919876543211" });

      // First launch
      const firstRes = await request(app).post("/api/v1/campaigns/cmp_test_001/send");
      expect(firstRes.status).toBe(200);
      expect(firstRes.body.data.queuedCount).toBe(1);
      expect(firstRes.body.data.alreadyPreparedCount).toBe(0);
      expect(messagesStore.length).toBe(1);

      // Second launch attempt (same campaign)
      const secondRes = await request(app).post("/api/v1/campaigns/cmp_test_001/send");
      expect(secondRes.status).toBe(200);
      expect(secondRes.body.data.queuedCount).toBe(0);
      expect(secondRes.body.data.alreadyPreparedCount).toBe(1);
      expect(messagesStore.length).toBe(1); // No new message created
    });

    it("generates deterministic clientRequestId for each message record", async () => {
      seedCampaign();
      const member = seedMember({ firstName: "TestUser" });

      await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(messagesStore.length).toBe(1);
      const expectedRequestId = `camp_cmp_test_001_cnt_${member.contact.id}_r1`.slice(0, 64);
      expect(messagesStore[0].clientRequestId).toBe(expectedRequestId);
    });
  });

  // ── 7. Race Condition & Concurrent P2002 Safety ──────────────────────────────

  describe("Concurrent Launch & P2002 Unique Constraint Handling", () => {
    it("recovers gracefully if a concurrent request creates the message row first (P2002 race)", async () => {
      seedCampaign();
      const member = seedMember({ firstName: "ConcurrentRaceUser" });

      // Pre-seed the message row as if another worker/request created it simultaneously
      messagesStore.push({
        id: "msg_existing_race_row",
        organizationId: orgId,
        campaignId: "cmp_test_001",
        campaignNameSnapshot: "Diwali Big Sale",
        contactId: member.contact.id,
        dispatchRun: 1,
        clientRequestId: `camp_cmp_test_001_cnt_${member.contact.id}_r1`,
        recipientPhone: "+919876543210",
        templateName: "diwali_promo",
        templateLanguage: "en_US",
        parameters: { "1": "ConcurrentRaceUser", "2": "25% OFF" },
        status: MessageDeliveryStatus.QUEUED,
        createdAt: new Date(),
      });

      // Trigger simulateP2002Race on the create call
      simulateP2002Race = true;

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.alreadyPreparedCount).toBe(1);
      expect(res.body.data.queuedCount).toBe(0);
    });
  });

  // ── 8. Queue Failure Resilience & Database State Preservation ───────────────

  describe("Queue Failure Recovery & Database State Safety", () => {
    it("preserves message records in database when Redis queue enqueue throws an error", async () => {
      seedCampaign();
      seedMember({ firstName: "ResilientUser" });

      // Simulate Upstash Redis connection error
      vi.spyOn(dispatchQueue, "enqueueWhatsAppDispatchJob").mockRejectedValue(
        new Error("Connection refused: Upstash Redis unreachable")
      );

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      // Orchestrator must not crash
      expect(res.status).toBe(200);
      expect(res.body.data.queuedCount).toBe(1);
      expect(res.body.data.enqueueFailureCount).toBe(1);
      expect(res.body.data.enqueueSuccessCount).toBe(0);

      // Database message record MUST remain safely created in QUEUED status
      expect(messagesStore.length).toBe(1);
      expect(messagesStore[0].status).toBe(MessageDeliveryStatus.QUEUED);
      // Campaign status must still be QUEUED
      expect(campaignsStore[0].status).toBe(CampaignStatus.QUEUED);
    });

    it("prepares messages in QUEUED status when Redis is unconfigured without crashing", async () => {
      seedCampaign();
      seedMember({ firstName: "OfflineUser" });

      // Simulate Redis not configured
      vi.spyOn(redisConfig, "isRedisConfigured").mockReturnValue(false);

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.data.queuedCount).toBe(1);
      expect(res.body.data.enqueueSuccessCount).toBe(0);
      expect(res.body.data.enqueueFailureCount).toBe(0);
      expect(messagesStore.length).toBe(1);
      expect(messagesStore[0].status).toBe(MessageDeliveryStatus.QUEUED);
    });
  });

  // ── 9. Endpoint Routing & Alias Verification ────────────────────────────────

  describe("Endpoint Verification (/send and /launch alias)", () => {
    it("supports POST /api/v1/campaigns/:id/send and returns structured summary", async () => {
      seedCampaign();
      seedMember({ firstName: "Sunil" });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.message).toContain("prepared and queued");
      expect(res.body.data).toMatchObject({
        campaignId: "cmp_test_001",
        campaignName: "Diwali Big Sale",
        status: CampaignStatus.QUEUED,
        totalAudienceCount: 1,
        eligibleCount: 1,
        queuedCount: 1,
      });
      // Verify no sensitive tokens or secrets are exposed in response
      expect(JSON.stringify(res.body)).not.toContain("mock_meta_access_token");
      expect(JSON.stringify(res.body)).not.toContain("EAAG");
    });

    it("supports POST /api/v1/campaigns/:id/launch alias with identical response semantics", async () => {
      seedCampaign({ id: "cmp_launch_alias" });
      seedMember({ firstName: "Kavita" });

      const res = await request(app).post("/api/v1/campaigns/cmp_launch_alias/launch");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.campaignId).toBe("cmp_launch_alias");
      expect(res.body.data.status).toBe(CampaignStatus.QUEUED);
    });
  });

  // ── 10. Fix 1: Idempotent Queue Recovery & Retry Endpoint ─────────────────

  describe("Fix 1: Idempotent Queue Recovery & Retry Endpoint", () => {
    it("allows POST /api/v1/campaigns/:id/retry-queue when campaign is in QUEUED status", async () => {
      const camp = seedCampaign({ id: "cmp_retry_001", status: CampaignStatus.QUEUED });
      const m1 = seedMember({ firstName: "Rohan" });

      // Seed a persisted message that failed enqueue previously
      messagesStore.push({
        id: "msg_stranded_001",
        organizationId: orgId,
        campaignId: camp.id,
        campaignNameSnapshot: camp.name,
        contactId: m1.contact.id,
        dispatchRun: 1,
        clientRequestId: `camp_${camp.id}_cnt_${m1.contact.id}_r1`,
        recipientPhone: "+919876543210",
        templateName: "diwali_promo",
        templateLanguage: "en_US",
        parameters: { "1": "Rohan", "2": "25% OFF" },
        status: MessageDeliveryStatus.QUEUED,
        createdAt: new Date(),
      });

      const res = await request(app).post("/api/v1/campaigns/cmp_retry_001/retry-queue");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        campaignId: "cmp_retry_001",
        totalPersistedMessages: 1,
        eligibleQueuedCount: 1,
        enqueuedSuccessCount: 1,
        alreadyEnqueuedCount: 0,
        enqueueFailureCount: 0,
      });
    });

    it("handles partial enqueue recovery and correctly reports already-enqueued vs newly-enqueued jobs", async () => {
      const camp = seedCampaign({ id: "cmp_partial_001", status: CampaignStatus.QUEUED });
      const m1 = seedMember({ firstName: "User1" });
      const m2 = seedMember({ firstName: "User2" });

      // m1 was previously enqueued; m2 was stranded
      messagesStore.push(
        {
          id: "msg_partial_1",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m1.contact.id,
          dispatchRun: 1,
          clientRequestId: `camp_${camp.id}_cnt_${m1.contact.id}_r1`,
          recipientPhone: "+919876543211",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "User1", "2": "25% OFF" },
          status: MessageDeliveryStatus.QUEUED,
          createdAt: new Date(),
        },
        {
          id: "msg_partial_2",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m2.contact.id,
          dispatchRun: 1,
          clientRequestId: `camp_${camp.id}_cnt_${m2.contact.id}_r1`,
          recipientPhone: "+919876543212",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "User2", "2": "25% OFF" },
          status: MessageDeliveryStatus.QUEUED,
          createdAt: new Date(),
        }
      );

      // Simulate m1 already existing in BullMQ queue, m2 newly enqueued
      vi.spyOn(dispatchQueue, "enqueueWhatsAppDispatchJob").mockImplementation(async (jobData) => {
        if (jobData.messageId === "msg_partial_1") {
          return { job: { id: `job_${jobData.messageId}` } as any, alreadyExisted: true };
        }
        return { job: { id: `job_${jobData.messageId}` } as any, alreadyExisted: false };
      });

      const res = await request(app).post("/api/v1/campaigns/cmp_partial_001/retry-queue");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleQueuedCount).toBe(2);
      expect(res.body.data.alreadyEnqueuedCount).toBe(1);
      expect(res.body.data.enqueuedSuccessCount).toBe(1);
      expect(res.body.data.enqueueFailureCount).toBe(0);
    });

    it("returns HTTP 503 and preserves message records when Redis is unavailable during queue recovery", async () => {
      seedCampaign({ id: "cmp_redis_down", status: CampaignStatus.QUEUED });
      const m1 = seedMember({ firstName: "StrandedUser" });
      messagesStore.push({
        id: "msg_stranded_down",
        organizationId: orgId,
        campaignId: "cmp_redis_down",
        campaignNameSnapshot: "Diwali Big Sale",
        contactId: m1.contact.id,
        dispatchRun: 1,
        clientRequestId: `req_down`,
        recipientPhone: "+919876543210",
        templateName: "diwali_promo",
        templateLanguage: "en_US",
        parameters: { "1": "StrandedUser", "2": "25% OFF" },
        status: MessageDeliveryStatus.QUEUED,
        createdAt: new Date(),
      });

      vi.spyOn(redisConfig, "isRedisConfigured").mockReturnValue(false);

      const res = await request(app).post("/api/v1/campaigns/cmp_redis_down/retry-queue");

      expect(res.status).toBe(503);
      expect(res.body.error?.message).toContain("Redis dispatch queue is not configured");
      expect(messagesStore[0].status).toBe(MessageDeliveryStatus.QUEUED);
    });

    it("strictly never resets or re-enqueues messages in non-QUEUED states (SENDING, SENT, FAILED, SUBMITTED_UNCONFIRMED)", async () => {
      const camp = seedCampaign({ id: "cmp_mixed_states", status: CampaignStatus.QUEUED });
      const m1 = seedMember({ firstName: "SentUser" });
      const m2 = seedMember({ firstName: "FailedUser" });
      const m3 = seedMember({ firstName: "UnconfirmedUser" });

      messagesStore.push(
        {
          id: "msg_sent",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m1.contact.id,
          dispatchRun: 1,
          clientRequestId: `req_sent`,
          recipientPhone: "+919876543211",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "SentUser", "2": "25% OFF" },
          status: MessageDeliveryStatus.SENT,
          createdAt: new Date(),
        },
        {
          id: "msg_failed",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m2.contact.id,
          dispatchRun: 1,
          clientRequestId: `req_failed`,
          recipientPhone: "+919876543212",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "FailedUser", "2": "25% OFF" },
          status: MessageDeliveryStatus.FAILED,
          createdAt: new Date(),
        },
        {
          id: "msg_unconfirmed",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m3.contact.id,
          dispatchRun: 1,
          clientRequestId: `req_unconfirmed`,
          recipientPhone: "+919876543213",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "UnconfirmedUser", "2": "25% OFF" },
          status: MessageDeliveryStatus.SUBMITTED_UNCONFIRMED,
          createdAt: new Date(),
        }
      );

      const enqueueSpy = vi.spyOn(dispatchQueue, "enqueueWhatsAppDispatchJob");

      const res = await request(app).post("/api/v1/campaigns/cmp_mixed_states/retry-queue");

      expect(res.status).toBe(200);
      expect(res.body.data.eligibleQueuedCount).toBe(0);
      expect(res.body.data.terminalCount).toBe(2); // SENT + FAILED
      expect(res.body.data.inFlightCount).toBe(1); // SUBMITTED_UNCONFIRMED
      expect(enqueueSpy).not.toHaveBeenCalled();
    });

    it("rejects queue recovery with HTTP 400 when campaign is in DRAFT or COMPLETED status", async () => {
      seedCampaign({ id: "cmp_draft_recovery", status: CampaignStatus.DRAFT });
      const res = await request(app).post("/api/v1/campaigns/cmp_draft_recovery/retry-queue");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Recovery is only applicable for campaigns in QUEUED or SENDING status");
    });
  });

  // ── 11. Fix 2: Strict Template Parameter Validation ───────────────────────

  describe("Fix 2: Strict Template Parameter Validation Before Message Creation", () => {
    it("rejects launch with HTTP 400 when parameter count does not match Meta template", async () => {
      seedCampaign({
        variablesMapping: {
          "1": "{{firstName}}", // Only 1 variable provided, but template expects 2
        },
      });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Missing required template parameter for position {{2}}");
      // Zero message records should be created
      expect(messagesStore.length).toBe(0);
    });

    it("rejects launch with HTTP 400 when positional parameter positions are non-contiguous", async () => {
      seedCampaign({
        variablesMapping: {
          "1": "{{firstName}}",
          "3": "25% OFF", // Non-contiguous: positions 1 and 3 for a 2-variable template
        },
      });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Missing required template parameter for position {{2}}");
      expect(messagesStore.length).toBe(0);
    });

    it("rejects launch with HTTP 400 when unexpected extra parameters are provided", async () => {
      seedCampaign({
        variablesMapping: {
          "1": "{{firstName}}",
          "2": "25% OFF",
          "3": "extra_val", // Extra parameter for 2-variable template
        },
      });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Unexpected extra or unrecognized parameter mapping '3'");
      expect(messagesStore.length).toBe(0);
    });

    it("rejects launch with HTTP 400 when dynamic placeholder token is malformed", async () => {
      seedCampaign({
        variablesMapping: {
          "1": "{{firstName", // Malformed syntax: unclosed brace
          "2": "25% OFF",
        },
      });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("Malformed dynamic variable placeholder '{{firstName'");
      expect(messagesStore.length).toBe(0);
    });

    it("rejects launch with HTTP 400 when zero-variable template receives parameter mappings", async () => {
      seedCampaign({
        templateName: "hello_world",
        variablesMapping: {
          "1": "unexpected_val",
        },
      });
      seedMember();

      vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
        id: "tpl_hello",
        name: "hello_world",
        language: "en_US",
        status: "APPROVED",
        category: "UTILITY",
        parameter_format: "POSITIONAL",
        components: [{ type: "BODY", text: "Hello World" }],
        isSendable: true,
        variableCount: 0,
      });

      const res = await request(app).post("/api/v1/campaigns/cmp_test_001/send");

      expect(res.status).toBe(400);
      expect(res.body.error?.message).toContain("does not accept any parameters");
      expect(messagesStore.length).toBe(0);
    });
  });

  // ── 12. Fix 3: Campaign Lifecycle State Machine & Concurrency ──────────────

  describe("Fix 3: Campaign Lifecycle State Machine Transitions", () => {
    it("sets startedAt only when worker claims first message, leaving it null upon launch preparation", async () => {
      seedCampaign({ id: "cmp_started_check" });
      seedMember();

      const res = await request(app).post("/api/v1/campaigns/cmp_started_check/send");

      expect(res.status).toBe(200);
      // startedAt must remain null upon launch preparation
      const launchedCamp = campaignsStore.find((c) => c.id === "cmp_started_check");
      expect(launchedCamp?.status).toBe(CampaignStatus.QUEUED);
      expect(launchedCamp?.startedAt).toBeNull();
    });

    it("transitions campaign from QUEUED to SENDING with startedAt timestamp upon worker lease claim", async () => {
      const camp = seedCampaign({ id: "cmp_claim_check", status: CampaignStatus.QUEUED, startedAt: null });

      const { CampaignLifecycleService } = await import("../services/campaignLifecycle.service.js");
      const transitioned = await CampaignLifecycleService.markCampaignSendingIfClaimed(camp.id);

      expect(transitioned).toBe(true);
      expect(campaignsStore[0].status).toBe(CampaignStatus.SENDING);
      expect(campaignsStore[0].startedAt).toBeInstanceOf(Date);
    });

    it("transitions campaign to COMPLETED when all messages reach terminal/delivered states", async () => {
      const camp = seedCampaign({ id: "cmp_lifecycle_complete", status: CampaignStatus.SENDING });
      const m1 = seedMember({ firstName: "DeliveredUser1" });
      const m2 = seedMember({ firstName: "DeliveredUser2" });

      messagesStore.push(
        {
          id: "msg_term_1",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m1.contact.id,
          dispatchRun: 1,
          clientRequestId: `r_term_1`,
          recipientPhone: "+919876543201",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "DeliveredUser1", "2": "25% OFF" },
          status: MessageDeliveryStatus.SENT,
          createdAt: new Date(),
        },
        {
          id: "msg_term_2",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m2.contact.id,
          dispatchRun: 1,
          clientRequestId: `r_term_2`,
          recipientPhone: "+919876543202",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "DeliveredUser2", "2": "25% OFF" },
          status: MessageDeliveryStatus.DELIVERED,
          createdAt: new Date(),
        }
      );

      const { CampaignLifecycleService } = await import("../services/campaignLifecycle.service.js");
      const finalStatus = await CampaignLifecycleService.evaluateCampaignLifecycle(camp.id);

      expect(finalStatus).toBe(CampaignStatus.COMPLETED);
      expect(campaignsStore[0].status).toBe(CampaignStatus.COMPLETED);
      expect(campaignsStore[0].completedAt).toBeInstanceOf(Date);
    });

    it("transitions campaign to COMPLETED on mixed outcome (1 sent, 1 failed)", async () => {
      const camp = seedCampaign({ id: "cmp_lifecycle_mixed", status: CampaignStatus.SENDING });
      const m1 = seedMember({ firstName: "SentUser" });
      const m2 = seedMember({ firstName: "FailedUser" });

      messagesStore.push(
        {
          id: "msg_mixed_sent",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m1.contact.id,
          dispatchRun: 1,
          clientRequestId: `r_mix_1`,
          recipientPhone: "+919876543201",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "SentUser", "2": "25% OFF" },
          status: MessageDeliveryStatus.SENT,
          createdAt: new Date(),
        },
        {
          id: "msg_mixed_failed",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m2.contact.id,
          dispatchRun: 1,
          clientRequestId: `r_mix_2`,
          recipientPhone: "+919876543202",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "FailedUser", "2": "25% OFF" },
          status: MessageDeliveryStatus.FAILED,
          createdAt: new Date(),
        }
      );

      const { CampaignLifecycleService } = await import("../services/campaignLifecycle.service.js");
      const finalStatus = await CampaignLifecycleService.evaluateCampaignLifecycle(camp.id);

      expect(finalStatus).toBe(CampaignStatus.COMPLETED);
      expect(campaignsStore[0].status).toBe(CampaignStatus.COMPLETED);
    });

    it("transitions campaign to FAILED when 100% of messages fail", async () => {
      const camp = seedCampaign({ id: "cmp_lifecycle_all_failed", status: CampaignStatus.SENDING });
      const m1 = seedMember({ firstName: "Failed1" });
      const m2 = seedMember({ firstName: "Failed2" });

      messagesStore.push(
        {
          id: "msg_fail_1",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m1.contact.id,
          dispatchRun: 1,
          clientRequestId: `r_fail_1`,
          recipientPhone: "+919876543201",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "Failed1", "2": "25% OFF" },
          status: MessageDeliveryStatus.FAILED,
          createdAt: new Date(),
        },
        {
          id: "msg_fail_2",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m2.contact.id,
          dispatchRun: 1,
          clientRequestId: `r_fail_2`,
          recipientPhone: "+919876543202",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "Failed2", "2": "25% OFF" },
          status: MessageDeliveryStatus.FAILED,
          createdAt: new Date(),
        }
      );

      const { CampaignLifecycleService } = await import("../services/campaignLifecycle.service.js");
      const finalStatus = await CampaignLifecycleService.evaluateCampaignLifecycle(camp.id);

      expect(finalStatus).toBe(CampaignStatus.FAILED);
      expect(campaignsStore[0].status).toBe(CampaignStatus.FAILED);
    });

    it("does not finalize campaign while messages remain active in QUEUED or SENDING status", async () => {
      const camp = seedCampaign({ id: "cmp_active_remain", status: CampaignStatus.SENDING });
      const m1 = seedMember({ firstName: "DoneUser" });
      const m2 = seedMember({ firstName: "ActiveUser" });

      messagesStore.push(
        {
          id: "msg_done",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m1.contact.id,
          dispatchRun: 1,
          clientRequestId: `r_done`,
          recipientPhone: "+919876543201",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "DoneUser", "2": "25% OFF" },
          status: MessageDeliveryStatus.SENT,
          createdAt: new Date(),
        },
        {
          id: "msg_in_flight",
          organizationId: orgId,
          campaignId: camp.id,
          campaignNameSnapshot: camp.name,
          contactId: m2.contact.id,
          dispatchRun: 1,
          clientRequestId: `r_flight`,
          recipientPhone: "+919876543202",
          templateName: "diwali_promo",
          templateLanguage: "en_US",
          parameters: { "1": "ActiveUser", "2": "25% OFF" },
          status: MessageDeliveryStatus.SENDING,
          createdAt: new Date(),
        }
      );

      const { CampaignLifecycleService } = await import("../services/campaignLifecycle.service.js");
      const result = await CampaignLifecycleService.evaluateCampaignLifecycle(camp.id);

      expect(result).toBeNull();
      expect(campaignsStore[0].status).toBe(CampaignStatus.SENDING);
      expect(campaignsStore[0].completedAt).toBeNull();
    });
  });

  // ── 13. Just-In-Time Worker Preflight Safeguards ───────────────────────────

  describe("Just-In-Time Worker Preflight Safeguards", () => {
    it("rejects worker dispatch if consent is revoked between launch and execution", async () => {
      const { WhatsAppSendService } = await import("../services/whatsappSend.service.js");

      // Contact was OPTED_IN at launch, but later switched to OPTED_OUT
      const member = seedMember({ firstName: "RevokedConsentUser", consentStatus: ConsentStatus.OPTED_OUT });

      const preflight = await WhatsAppSendService.validatePreflight({
        organizationId: orgId,
        recipientPhone: "+919876543210",
        contactId: member.contact.id,
      });

      expect(preflight.valid).toBe(false);
      expect(preflight.errorCode).toBe("CONSENT_REQUIRED");
      expect(preflight.rejectReason).toContain("OPTED_OUT");
    });

    it("rejects worker dispatch if contact is suppressed between launch and execution", async () => {
      const { WhatsAppSendService } = await import("../services/whatsappSend.service.js");

      const member = seedMember({
        firstName: "LateSuppressedUser",
        isSuppressed: true,
        suppressionReason: "Customer unsubscribed via web portal",
      });

      const preflight = await WhatsAppSendService.validatePreflight({
        organizationId: orgId,
        recipientPhone: "+919876543210",
        contactId: member.contact.id,
      });

      expect(preflight.valid).toBe(false);
      expect(preflight.errorCode).toBe("RECIPIENT_SUPPRESSED");
      expect(preflight.rejectReason).toContain("Customer unsubscribed via web portal");
    });
  });
});
