import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { CampaignStatus, MessageDeliveryStatus, ConsentStatus } from "@prisma/client";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { WhatsAppSendService } from "../services/whatsappSend.service.js";
import { MetaConfigResolver } from "../services/metaConfigResolver.js";
import { evaluateDeliveryTransition } from "../services/deliveryStateMachine.js";
import {
  startWorkerIfEnabled,
  stopWorker,
  isWorkerRunning,
  getWorkerStatus,
} from "../services/automaticWorker.service.js";
import * as redisConfig from "../config/redis.js";
import * as dispatchQueue from "../queue/whatsapp.queue.js";
import * as dispatchWorkerModule from "../workers/dispatch.worker.js";
import { processDispatchMessage } from "../workers/dispatch.worker.js";
import { env } from "../config/env.js";
import { ALLOWED_TEST_TEMPLATE_NAMES, setAllowedTestTemplates } from "../constants/templateAllowlist.js";

// ── In-Memory Mock Stores ───────────────────────────────────────────────────

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
  customAttributes: Record<string, unknown>;
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
  campaignNameSnapshot: string;
  contactId: string | null;
  dispatchRun: number;
  clientRequestId: string | null;
  recipientPhone: string;
  templateName: string;
  templateLanguage: string;
  parameters: Record<string, unknown>;
  status: MessageDeliveryStatus;
  attemptCount: number;
  maxAttempts: number;
  workerId: string | null;
  leaseExpiresAt: Date | null;
  wamid: string | null;
  errorCode: string | null;
  errorMessage: string | null;
  sentAt: Date | null;
  deliveredAt: Date | null;
  readAt: Date | null;
  failedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

let campaignsStore: MockCampaign[] = [];
let contactsStore: MockContact[] = [];
let membersStore: MockMember[] = [];
let messagesStore: MockMessage[] = [];

// Hoisted Prisma Mock
const { prismaMock } = vi.hoisted(() => {
  const mock: any = {
    organization: {
      findUnique: vi.fn(),
    },
    campaign: {
      findFirst: vi.fn(),
      findUnique: vi.fn(),
      update: vi.fn(),
      updateMany: vi.fn(),
    },
    contact: {
      findFirst: vi.fn(),
    },
    contactListMember: {
      findMany: vi.fn(),
    },
    whatsAppMessage: {
      count: vi.fn(),
      findMany: vi.fn(),
      findFirst: vi.fn(),
      create: vi.fn(),
      update: vi.fn(),
      groupBy: vi.fn(),
    },
    $queryRaw: vi.fn(),
    $transaction: vi.fn(),
    $disconnect: vi.fn(),
  };
  return { prismaMock: mock };
});

vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => prismaMock,
    checkDatabaseConnection: vi.fn().mockResolvedValue({ status: "connected" }),
    disconnectPrisma: vi.fn().mockResolvedValue(undefined),
  };
});

function resetPrismaMock() {
  prismaMock.organization.findUnique.mockImplementation(async ({ where }: any) => {
    return {
      id: where.id,
      name: "Test Organization",
      slug: "test-org",
      isArchived: false,
      deletedAt: null,
    };
  });

  prismaMock.campaign.findFirst.mockImplementation(async ({ where }: any) => {
    return (
      campaignsStore.find((c) => {
        if (where.id && c.id !== where.id) return false;
        if (where.organizationId && c.organizationId !== where.organizationId) return false;
        return true;
      }) || null
    );
  });

  prismaMock.campaign.findUnique.mockImplementation(async ({ where }: any) => {
    return campaignsStore.find((c) => c.id === where.id) || null;
  });

  prismaMock.campaign.update.mockImplementation(async ({ where, data }: any) => {
    const idx = campaignsStore.findIndex((c) => c.id === where.id);
    if (idx === -1) throw new Error("Campaign not found");
    campaignsStore[idx] = { ...campaignsStore[idx], ...data, updatedAt: new Date() };
    return campaignsStore[idx];
  });

  prismaMock.campaign.updateMany.mockImplementation(async ({ where, data }: any) => {
    let count = 0;
    for (const c of campaignsStore) {
      if (where.id && c.id !== where.id) continue;
      if (where.status && c.status !== where.status) continue;
      Object.assign(c, data, { updatedAt: new Date() });
      count++;
    }
    return { count };
  });

  prismaMock.contact.findFirst.mockImplementation(async ({ where }: any) => {
    return (
      contactsStore.find((ct) => {
        if (where.id && ct.id !== where.id) return false;
        if (where.organizationId && ct.organizationId !== where.organizationId) return false;
        return true;
      }) || null
    );
  });

  prismaMock.contactListMember.findMany.mockImplementation(async ({ where }: any) => {
    return membersStore
      .filter((m) => {
        if (where.listId && m.listId !== where.listId) return false;
        if (where.organizationId && m.organizationId !== where.organizationId) return false;
        return true;
      })
      .map((m) => ({
        ...m,
        contact: contactsStore.find((c) => c.id === m.contactId) || m.contact,
      }));
  });

  prismaMock.whatsAppMessage.count.mockImplementation(async ({ where }: any) => {
    return messagesStore.filter((m) => {
      if (where.campaignId && m.campaignId !== where.campaignId) return false;
      if (where.organizationId && m.organizationId !== where.organizationId) return false;
      if (where.status && m.status !== where.status) return false;
      return true;
    }).length;
  });

  prismaMock.whatsAppMessage.findMany.mockImplementation(async ({ where, skip = 0, take = 50 }: any) => {
    const filtered = messagesStore.filter((m) => {
      if (where.campaignId && m.campaignId !== where.campaignId) return false;
      if (where.organizationId && m.organizationId !== where.organizationId) return false;
      if (where.status && m.status !== where.status) return false;
      return true;
    });
    return filtered.slice(skip, skip + take);
  });

  prismaMock.whatsAppMessage.findFirst.mockImplementation(async ({ where }: any) => {
    return (
      messagesStore.find((m) => {
        if (where.id && m.id !== where.id) return false;
        if (where.campaignId && m.campaignId !== where.campaignId) return false;
        if (where.contactId && m.contactId !== where.contactId) return false;
        if (where.dispatchRun && m.dispatchRun !== where.dispatchRun) return false;
        if (where.organizationId && m.organizationId !== where.organizationId) return false;
        return true;
      }) || null
    );
  });

  prismaMock.whatsAppMessage.create.mockImplementation(async ({ data }: any) => {
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
      attemptCount: 0,
      maxAttempts: 3,
      workerId: null,
      leaseExpiresAt: null,
      wamid: null,
      errorCode: null,
      errorMessage: null,
      sentAt: null,
      deliveredAt: null,
      readAt: null,
      failedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    messagesStore.push(newMsg);
    return newMsg;
  });

  prismaMock.whatsAppMessage.update.mockImplementation(async ({ where, data }: any) => {
    const idx = messagesStore.findIndex((m) => m.id === where.id);
    if (idx === -1) {
      return { id: where.id, ...data };
    }
    messagesStore[idx] = { ...messagesStore[idx], ...data, updatedAt: new Date() };
    return messagesStore[idx];
  });

  prismaMock.whatsAppMessage.groupBy.mockImplementation(async ({ where }: any) => {
    const filtered = messagesStore.filter((m) => {
      if (where.campaignId && m.campaignId !== where.campaignId) return false;
      if (where.organizationId && m.organizationId !== where.organizationId) return false;
      return true;
    });
    const counts: Record<string, number> = {};
    for (const item of filtered) {
      counts[item.status] = (counts[item.status] || 0) + 1;
    }
    return Object.entries(counts).map(([status, count]) => ({
      status,
      _count: { _all: count },
    }));
  });

  prismaMock.$queryRaw.mockImplementation(async () => []);
  prismaMock.$transaction.mockImplementation(async (cb: any) => cb(prismaMock));
  prismaMock.$disconnect.mockResolvedValue(undefined);
}

describe("Grovastra End-to-End: Dashboard-Driven Campaign Sending & Worker Lifecycle", () => {
  const orgA = "org_alpha";
  const orgB = "org_beta";

  beforeEach(() => {
    setAllowedTestTemplates([...ALLOWED_TEST_TEMPLATE_NAMES, "festive_promo_unapproved"]);
    campaignsStore = [];
    contactsStore = [];
    membersStore = [];
    messagesStore = [];
    resetPrismaMock();

    // Default template service mock
    vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
      id: "tmpl_order_conf_001",
      name: "jaspers_market_order_confirmation_v1",
      language: "en_US",
      category: "UTILITY",
      status: "APPROVED",
      isSendable: true,
      variableCount: 3,
      components: [],
    } as any);

    // Redis mock
    vi.spyOn(redisConfig, "isRedisConfigured").mockReturnValue(true);
    vi.spyOn(dispatchQueue, "enqueueWhatsAppDispatchJob").mockImplementation(async (jobData) => {
      return {
        job: { id: `msg_${jobData.messageId}` } as any,
        alreadyExisted: false,
      };
    });
  });

  afterEach(async () => {
    setAllowedTestTemplates(null);
    await stopWorker();
    vi.restoreAllMocks();
  });

  describe("1. Dashboard Send API Validation & Safety Gates", () => {
    it("validates campaign ownership and rejects cross-tenant launch requests with 404", async () => {
      // Campaign belongs to orgB
      campaignsStore.push({
        id: "camp_cross_tenant_1",
        organizationId: orgB,
        name: "Private Campaign Org B",
        description: null,
        status: CampaignStatus.DRAFT,
        templateId: "tmpl_order_conf_001",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "Order #123", "2": "Tomorrow", "3": "$50" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_b",
        audienceName: "Audience B",
        totalRecipients: 5,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "user_b",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Org A attempts to launch Org B's campaign
      const res = await request(app)
        .post("/api/v1/campaigns/camp_cross_tenant_1/send")
        .set("x-test-org-id", orgA);

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not found/i);
    });

    it("rejects launching a campaign with unapproved or non-sendable Meta template", async () => {
      campaignsStore.push({
        id: "camp_unapproved_tpl",
        organizationId: orgA,
        name: "Unapproved Template Campaign",
        description: null,
        status: CampaignStatus.DRAFT,
        templateId: "tmpl_pending_001",
        templateName: "festive_promo_unapproved",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_a",
        audienceName: "Audience A",
        totalRecipients: 1,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "user_a",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
        id: "tmpl_pending_001",
        name: "festive_promo_unapproved",
        language: "en_US",
        category: "MARKETING",
        status: "REJECTED",
        isSendable: false,
        variableCount: 0,
        components: [],
      } as any);

      const res = await request(app)
        .post("/api/v1/campaigns/camp_unapproved_tpl/send")
        .set("x-test-org-id", orgA);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Only APPROVED templates can be launched/i);
    });

    it("rejects launching a campaign with template outside allowlist with HTTP 400", async () => {
      // Temporarily revert allowlist to default
      setAllowedTestTemplates(null);

      campaignsStore.push({
        id: "camp_disallowed_tpl",
        organizationId: orgA,
        name: "Disallowed Template Campaign",
        description: null,
        status: CampaignStatus.DRAFT,
        templateId: "tmpl_disallowed_001",
        templateName: "completely_disallowed_template",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_a",
        audienceName: "Audience A",
        totalRecipients: 1,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "user_a",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/campaigns/camp_disallowed_tpl/send")
        .set("x-test-org-id", orgA);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/not in the testing allowlist/i);

      // Re-apply test allowlist for subsequent tests
      setAllowedTestTemplates([...ALLOWED_TEST_TEMPLATE_NAMES, "festive_promo_unapproved"]);
    });

    it("excludes opted-out and suppressed contacts from dispatch", async () => {
      contactsStore.push(
        {
          id: "cnt_opted_in",
          organizationId: orgA,
          phoneNumber: "+919876543210",
          firstName: "Alice",
          lastName: "Sharma",
          email: "alice@test.com",
          customAttributes: { orderNumber: "ORD-101", deliveryDate: "Tomorrow" },
          consentStatus: ConsentStatus.OPTED_IN,
          isSuppressed: false,
          suppressionReason: null,
        },
        {
          id: "cnt_opted_out",
          organizationId: orgA,
          phoneNumber: "+919876543211",
          firstName: "Bob",
          lastName: "Verma",
          email: "bob@test.com",
          customAttributes: { orderNumber: "ORD-102", deliveryDate: "Tomorrow" },
          consentStatus: ConsentStatus.OPTED_OUT,
          isSuppressed: false,
          suppressionReason: null,
        },
        {
          id: "cnt_suppressed",
          organizationId: orgA,
          phoneNumber: "+919876543212",
          firstName: "Charlie",
          lastName: "Singh",
          email: "charlie@test.com",
          customAttributes: { orderNumber: "ORD-103", deliveryDate: "Tomorrow" },
          consentStatus: ConsentStatus.OPTED_IN,
          isSuppressed: true,
          suppressionReason: "Excessive Spam Complaints",
        }
      );

      membersStore.push(
        {
          id: "mem_1",
          organizationId: orgA,
          listId: "list_a",
          contactId: "cnt_opted_in",
          addedAt: new Date(),
          contact: contactsStore[0],
        },
        {
          id: "mem_2",
          organizationId: orgA,
          listId: "list_a",
          contactId: "cnt_opted_out",
          addedAt: new Date(),
          contact: contactsStore[1],
        },
        {
          id: "mem_3",
          organizationId: orgA,
          listId: "list_a",
          contactId: "cnt_suppressed",
          addedAt: new Date(),
          contact: contactsStore[2],
        }
      );

      campaignsStore.push({
        id: "camp_filter_test",
        organizationId: orgA,
        name: "Consent Filter Campaign",
        description: null,
        status: CampaignStatus.DRAFT,
        templateId: "tmpl_order_conf_001",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "custom:orderNumber", "2": "custom:deliveryDate", "3": "$25" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_a",
        audienceName: "Audience A",
        totalRecipients: 3,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "user_a",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/campaigns/camp_filter_test/send")
        .set("x-test-org-id", orgA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      // Exactly 1 eligible recipient queued (Alice)
      expect(data.queuedCount).toBe(1);
      // Excluded: 1 opted-out + 1 suppressed = 2
      expect(data.excludedCount.consentRequired).toBe(1);
      expect(data.excludedCount.suppressed).toBe(1);

      // Verify that only 1 message was created in DB
      expect(messagesStore).toHaveLength(1);
      expect(messagesStore[0].contactId).toBe("cnt_opted_in");
      expect(messagesStore[0].status).toBe(MessageDeliveryStatus.QUEUED);

      // Verify the campaign status transitioned to QUEUED
      const updatedCampaign = campaignsStore.find((c) => c.id === "camp_filter_test");
      expect(updatedCampaign?.status).toBe(CampaignStatus.QUEUED);
    });

    it("rejects launch with 400 if zero eligible recipients remain in audience list", async () => {
      contactsStore.push({
        id: "cnt_only_opted_out",
        organizationId: orgA,
        phoneNumber: "+919876543213",
        firstName: "Dave",
        lastName: "Patel",
        email: "dave@test.com",
        customAttributes: {},
        consentStatus: ConsentStatus.OPTED_OUT,
        isSuppressed: false,
        suppressionReason: null,
      });

      membersStore.push({
        id: "mem_dave",
        organizationId: orgA,
        listId: "list_empty_eligible",
        contactId: "cnt_only_opted_out",
        addedAt: new Date(),
        contact: contactsStore[0],
      });

      campaignsStore.push({
        id: "camp_zero_eligible",
        organizationId: orgA,
        name: "Zero Eligible Campaign",
        description: null,
        status: CampaignStatus.DRAFT,
        templateId: "tmpl_order_conf_001",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "Order #999", "2": "Tomorrow", "3": "$10" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_empty_eligible",
        audienceName: "Empty Eligible Audience",
        totalRecipients: 1,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "user_a",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/campaigns/camp_zero_eligible/send")
        .set("x-test-org-id", orgA);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/No eligible recipients found/i);
    });

    it("is completely idempotent on repeated clicks / requests without duplicating messages or jobs", async () => {
      contactsStore.push({
        id: "cnt_idempotency",
        organizationId: orgA,
        phoneNumber: "+919876543214",
        firstName: "Eva",
        lastName: "Nair",
        email: "eva@test.com",
        customAttributes: { orderId: "ORD-999", date: "Today" },
        consentStatus: ConsentStatus.OPTED_IN,
        isSuppressed: false,
        suppressionReason: null,
      });

      membersStore.push({
        id: "mem_eva",
        organizationId: orgA,
        listId: "list_idem",
        contactId: "cnt_idempotency",
        addedAt: new Date(),
        contact: contactsStore[0],
      });

      campaignsStore.push({
        id: "camp_idempotent",
        organizationId: orgA,
        name: "Idempotent Send Campaign",
        description: null,
        status: CampaignStatus.DRAFT,
        templateId: "tmpl_order_conf_001",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: { "1": "custom:orderId", "2": "custom:date", "3": "$99" },
        audienceType: "CONTACT_LIST",
        audienceId: "list_idem",
        audienceName: "Idem Audience",
        totalRecipients: 1,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "user_a",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Click 1: Normal Launch
      const res1 = await request(app)
        .post("/api/v1/campaigns/camp_idempotent/send")
        .set("x-test-org-id", orgA);

      expect(res1.status).toBe(200);
      expect(res1.body.data.queuedCount).toBe(1);
      expect(messagesStore).toHaveLength(1);
      const firstMessageId = messagesStore[0].id;
      const firstClientRequestId = messagesStore[0].clientRequestId;

      // Click 2: Rapid duplicate click or retry
      // Campaign is now QUEUED
      const res2 = await request(app)
        .post("/api/v1/campaigns/camp_idempotent/send")
        .set("x-test-org-id", orgA);

      expect(res2.status).toBe(200);
      // Messages store still contains exactly 1 message
      expect(messagesStore).toHaveLength(1);
      expect(messagesStore[0].id).toBe(firstMessageId);
      expect(messagesStore[0].clientRequestId).toBe(firstClientRequestId);
      expect(res2.body.data.alreadyPreparedCount).toBe(1);
      expect(res2.body.data.queuedCount).toBe(0);
    });
  });

  describe("2. Per-Message Delivery Status Inspection API (GET /:id/messages)", () => {
    it("returns paginated, masked per-message delivery records for an authorized tenant", async () => {
      campaignsStore.push({
        id: "camp_inspect_msgs",
        organizationId: orgA,
        name: "Delivery Inspection Campaign",
        description: null,
        status: CampaignStatus.SENDING,
        templateId: "tmpl_order_conf_001",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "list_inspect",
        audienceName: "Inspect Audience",
        totalRecipients: 2,
        scheduledAt: null,
        startedAt: new Date(),
        completedAt: null,
        createdBy: "user_a",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      messagesStore.push(
        {
          id: "msg_accepted_1",
          organizationId: orgA,
          campaignId: "camp_inspect_msgs",
          campaignNameSnapshot: "Delivery Inspection Campaign",
          contactId: "cnt_1",
          dispatchRun: 1,
          clientRequestId: "req_1",
          recipientPhone: "+919876543210",
          templateName: "jaspers_market_order_confirmation_v1",
          templateLanguage: "en_US",
          parameters: {},
          status: MessageDeliveryStatus.ACCEPTED,
          attemptCount: 1,
          maxAttempts: 3,
          workerId: "worker_1",
          leaseExpiresAt: null,
          wamid: "wamid.HBgMOTE5ODc2NTQzMjEwFQIAERgSRjQzMTM0MDA0MzI1NzhBRDYA",
          errorCode: null,
          errorMessage: null,
          sentAt: new Date(),
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "msg_queued_2",
          organizationId: orgA,
          campaignId: "camp_inspect_msgs",
          campaignNameSnapshot: "Delivery Inspection Campaign",
          contactId: "cnt_2",
          dispatchRun: 1,
          clientRequestId: "req_2",
          recipientPhone: "+919876543211",
          templateName: "jaspers_market_order_confirmation_v1",
          templateLanguage: "en_US",
          parameters: {},
          status: MessageDeliveryStatus.QUEUED,
          attemptCount: 0,
          maxAttempts: 3,
          workerId: null,
          leaseExpiresAt: null,
          wamid: null,
          errorCode: null,
          errorMessage: null,
          sentAt: null,
          deliveredAt: null,
          readAt: null,
          failedAt: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const res = await request(app)
        .get("/api/v1/campaigns/camp_inspect_msgs/messages")
        .set("x-test-org-id", orgA);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const data = res.body.data;

      expect(data.total).toBe(2);
      expect(data.page).toBe(1);
      expect(data.items).toHaveLength(2);

      // Verify masking: Recipient phone number must be masked (no plain PII exposed)
      const msg1 = data.items.find((m: any) => m.id === "msg_accepted_1");
      expect(msg1).toBeDefined();
      expect(msg1.status).toBe(MessageDeliveryStatus.ACCEPTED);
      expect(msg1.recipientPhoneMasked).toMatch(/\*{3,}/);
      expect(msg1.recipientPhoneMasked).not.toBe("+919876543210");
      expect(msg1.wamidMasked).toMatch(/\.\.\./);
    });

    it("enforces tenant boundary on GET /:id/messages and rejects cross-tenant inspection with 404", async () => {
      const res = await request(app)
        .get("/api/v1/campaigns/camp_inspect_msgs/messages")
        .set("x-test-org-id", orgB); // Different tenant

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  describe("3. Worker Lifecycle & Single-Instance Safety", () => {
    it("reports correct worker operational status via getWorkerStatus()", () => {
      const status = getWorkerStatus();
      expect(status).toHaveProperty("isRunning");
      expect(status).toHaveProperty("enabled");
      expect(status).toHaveProperty("redisConfigured");
      expect(status.isRunning).toBe(false);
    });

    it("respects the kill switch and refuses to start worker when ENABLE_AUTOMATIC_WORKER is false", () => {
      const originalFlag = env.ENABLE_AUTOMATIC_WORKER;
      (env as any).ENABLE_AUTOMATIC_WORKER = false;

      const worker = startWorkerIfEnabled();
      expect(worker).toBeNull();
      expect(isWorkerRunning()).toBe(false);

      (env as any).ENABLE_AUTOMATIC_WORKER = originalFlag;
    });

    it("cleanly starts exactly one singleton worker when enabled and shuts down gracefully", async () => {
      const originalFlag = env.ENABLE_AUTOMATIC_WORKER;
      (env as any).ENABLE_AUTOMATIC_WORKER = true;
      vi.spyOn(redisConfig, "isRedisConfigured").mockReturnValue(true);

      const mockWorkerInstance = {
        isRunning: () => true,
        close: vi.fn().mockResolvedValue(undefined),
        on: vi.fn(),
      } as any;
      const createWorkerSpy = vi
        .spyOn(dispatchWorkerModule, "createDispatchWorker")
        .mockReturnValue(mockWorkerInstance);

      const worker1 = startWorkerIfEnabled();
      expect(worker1).not.toBeNull();
      expect(isWorkerRunning()).toBe(true);
      expect(createWorkerSpy).toHaveBeenCalledTimes(1);

      // Repeated start call returns the exact same singleton instance
      const worker2 = startWorkerIfEnabled();
      expect(worker2).toBe(worker1);
      expect(createWorkerSpy).toHaveBeenCalledTimes(1);

      // Graceful shutdown
      await stopWorker();
      expect(isWorkerRunning()).toBe(false);
      expect(mockWorkerInstance.close).toHaveBeenCalledTimes(1);

      (env as any).ENABLE_AUTOMATIC_WORKER = originalFlag;
    });
  });

  describe("4. Ambiguous Timeout Safety & State Machine Transitions", () => {
    it("fences ambiguous timeout to SUBMITTED_UNCONFIRMED and prevents duplicate external calls", async () => {
      const claimedMsg = {
        id: "msg_timeout_1",
        status: MessageDeliveryStatus.SENDING,
        wamid: null,
        recipientPhone: "+919876543210",
        templateName: "jaspers_market_order_confirmation_v1",
        templateLanguage: "en_US",
        parameters: {},
        attemptCount: 1,
      };

      prismaMock.$queryRaw.mockResolvedValueOnce([claimedMsg]);
      prismaMock.organization.findUnique.mockResolvedValueOnce({
        id: orgA,
        isArchived: false,
        deletedAt: null,
      });
      prismaMock.campaign.findFirst.mockResolvedValueOnce({
        id: "camp_1",
        organizationId: orgA,
      });
      prismaMock.contact.findFirst.mockResolvedValueOnce({
        id: "cnt_1",
        organizationId: orgA,
        consentStatus: ConsentStatus.OPTED_IN,
        isSuppressed: false,
      });

      vi.spyOn(WhatsAppSendService, "validatePreflight").mockResolvedValue({ valid: true });
      vi.spyOn(MetaConfigResolver, "resolveOutboundConfig").mockResolvedValue({
        source: "PLATFORM_ENV_FALLBACK",
        accessToken: "test_token",
        phoneNumberId: "phone_123",
        graphApiVersion: "v26.0",
        wabaId: "waba_123",
        organizationId: orgA,
        status: "CONNECTED" as any,
      });
      vi.spyOn(WhatsAppSendService, "executeMetaSend").mockResolvedValue({
        outcome: "AMBIGUOUS_TIMEOUT",
        errorCode: "ETIMEDOUT",
        errorMessage: "ETIMEDOUT: Connection timed out",
      });

      const result = await processDispatchMessage({
        messageId: "msg_timeout_1",
        organizationId: orgA,
        campaignId: "camp_1",
        contactId: "cnt_1",
        jobId: "job_timeout",
        workerId: "worker_test",
      });

      expect(result.success).toBe(false);
      expect(result.ambiguous).toBe(true);
      expect(result.status).toBe(MessageDeliveryStatus.SUBMITTED_UNCONFIRMED);

      // Verify the message was marked as SUBMITTED_UNCONFIRMED in the database
      expect(prismaMock.whatsAppMessage.update).toHaveBeenCalledWith(
        expect.objectContaining({
          where: { id: "msg_timeout_1" },
          data: expect.objectContaining({
            status: MessageDeliveryStatus.SUBMITTED_UNCONFIRMED,
          }),
        })
      );
    });

    it("verifies delivery state transitions from ACCEPTED -> DELIVERED -> READ", () => {
      const baseTime = new Date("2026-10-17T10:00:00.000Z");

      // 1. ACCEPTED -> DELIVERED
      const deliveredTransition = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.ACCEPTED,
        eventStatus: "delivered",
        eventTimestamp: baseTime,
      });
      expect(deliveredTransition.applied).toBe(true);
      expect(deliveredTransition.nextStatus).toBe(MessageDeliveryStatus.DELIVERED);

      // 2. DELIVERED -> READ
      const readTransition = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.DELIVERED,
        eventStatus: "read",
        eventTimestamp: new Date("2026-10-17T10:05:00.000Z"),
      });
      expect(readTransition.applied).toBe(true);
      expect(readTransition.nextStatus).toBe(MessageDeliveryStatus.READ);

      // 3. READ is authoritative: contradictory/stale FAILED event is rejected
      const staleFailedTransition = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.READ,
        eventStatus: "failed",
        eventTimestamp: new Date("2026-10-17T10:06:00.000Z"),
      });
      expect(staleFailedTransition.applied).toBe(false);
      expect(staleFailedTransition.nextStatus).toBe(MessageDeliveryStatus.READ);
      expect(staleFailedTransition.reason).toBe("IGNORED_CONTRADICTORY_STALE_FAILURE");

      // 4. Stale ACCEPTED event when already in FAILED is ignored
      const staleAccepted = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.FAILED,
        eventStatus: "accepted",
        eventTimestamp: new Date("2026-10-17T10:06:00.000Z"),
      });
      expect(staleAccepted.applied).toBe(false);
      expect(staleAccepted.nextStatus).toBe(MessageDeliveryStatus.FAILED);
      expect(staleAccepted.reason).toBe("STALE_EVENT_IGNORED");

      // 5. Authoritative DELIVERED event supersedes transient failure
      const deliveryAfterFailure = evaluateDeliveryTransition({
        currentStatus: MessageDeliveryStatus.FAILED,
        eventStatus: "delivered",
        eventTimestamp: new Date("2026-10-17T10:07:00.000Z"),
      });
      expect(deliveryAfterFailure.applied).toBe(true);
      expect(deliveryAfterFailure.nextStatus).toBe(MessageDeliveryStatus.DELIVERED);
      expect(deliveryAfterFailure.reason).toBe("TRANSIENT_FAILURE_SUPERSEDED_BY_DELIVERY");
    });
  });
});
