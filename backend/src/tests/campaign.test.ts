import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { CampaignService } from "../services/campaign.service.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { ALLOWED_TEST_TEMPLATE_NAMES, setAllowedTestTemplates } from "../constants/templateAllowlist.js";

// In-memory mock store for safe, isolated automated testing
interface MockCampaign {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: "DRAFT" | "SCHEDULED" | "QUEUED" | "SENDING" | "COMPLETED" | "FAILED" | "CANCELLED";
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
        create: vi.fn().mockImplementation(async ({ data }) => data),
      },
      campaign: {
        findMany: vi.fn().mockImplementation(async ({ where, skip = 0, take = 10 }) => {
          let filtered = mockCampaignsStore.filter(
            (c) => c.organizationId === where.organizationId
          );

          if (where.status && where.status !== "ALL") {
            filtered = filtered.filter((c) => c.status === where.status);
          }

          if (where.OR) {
            filtered = filtered.filter((c) => {
              return where.OR.some((condition: { name?: { contains: string }; templateName?: { contains: string } }) => {
                if (condition.name) {
                  return c.name.toLowerCase().includes(condition.name.contains.toLowerCase());
                }
                if (condition.templateName) {
                  return c.templateName.toLowerCase().includes(condition.templateName.contains.toLowerCase());
                }
                return false;
              });
            });
          }

          return filtered.slice(skip, skip + take);
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          let filtered = mockCampaignsStore.filter(
            (c) => c.organizationId === where.organizationId
          );

          if (where.status && where.status !== "ALL") {
            filtered = filtered.filter((c) => c.status === where.status);
          }

          if (where.OR) {
            filtered = filtered.filter((c) => {
              return where.OR.some((condition: { name?: { contains: string }; templateName?: { contains: string } }) => {
                if (condition.name) {
                  return c.name.toLowerCase().includes(condition.name.contains.toLowerCase());
                }
                if (condition.templateName) {
                  return c.templateName.toLowerCase().includes(condition.templateName.contains.toLowerCase());
                }
                return false;
              });
            });
          }

          return filtered.length;
        }),
        groupBy: vi.fn().mockImplementation(async () => {
          const counts: Record<string, number> = {};
          for (const c of mockCampaignsStore) {
            counts[c.status] = (counts[c.status] || 0) + 1;
          }
          return Object.entries(counts).map(([status, count]) => ({
            status,
            _count: { _all: count },
          }));
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          if (where.createdAt?.gte) {
            // Duplicate submission check
            const gteTime = new Date(where.createdAt.gte).getTime();
            return (
              mockCampaignsStore.find(
                (c) =>
                  c.organizationId === where.organizationId &&
                  c.name === where.name &&
                  c.templateId === where.templateId &&
                  c.status === "DRAFT" &&
                  c.createdAt.getTime() >= gteTime
              ) || null
            );
          }

          return (
            mockCampaignsStore.find(
              (c) =>
                (!where.id || c.id === where.id) &&
                (!where.organizationId || c.organizationId === where.organizationId)
            ) || null
          );
        }),
        create: vi.fn().mockImplementation(async ({ data }) => {
          const newRecord: MockCampaign = {
            id: `cmp_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            organizationId: data.organizationId,
            name: data.name,
            description: data.description || null,
            status: data.status || "DRAFT",
            templateId: data.templateId,
            templateName: data.templateName,
            templateLanguage: data.templateLanguage || "en_US",
            templateCategory: data.templateCategory || "MARKETING",
            variablesMapping: data.variablesMapping || {},
            audienceType: data.audienceType || "MOCK",
            audienceId: data.audienceId || null,
            audienceName: data.audienceName || "All Audience",
            totalRecipients: data.totalRecipients || 0,
            scheduledAt: data.scheduledAt || null,
            startedAt: data.startedAt || null,
            completedAt: data.completedAt || null,
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

          const updated: MockCampaign = {
            ...mockCampaignsStore[index],
            ...data,
            updatedAt: new Date(),
          };
          mockCampaignsStore[index] = updated;
          return updated;
        }),
        delete: vi.fn().mockImplementation(async ({ where }) => {
          const index = mockCampaignsStore.findIndex((c) => c.id === where.id);
          if (index === -1) throw new Error("Record to delete not found");
          const deleted = mockCampaignsStore[index];
          mockCampaignsStore.splice(index, 1);
          return deleted;
        }),
      },
    }),
  };
});

describe("Campaign API & Service Layer (/api/v1/campaigns)", () => {
  beforeEach(() => {
    setAllowedTestTemplates([
      ...ALLOWED_TEST_TEMPLATE_NAMES,
      "festive_mega_savings",
      "template_one",
      "order_dispatched_alert",
      "unapproved_promo",
      "tpl_one",
      "rapid_template",
      "idempotent_template",
      "sep_template",
    ]);
    // Reset test store, mocks, and idempotency cache before each test
    vi.restoreAllMocks();
    CampaignService.clearIdempotencyStore();
    mockCampaignsStore = [
      {
        id: "cmp_seeded_001",
        organizationId: "org_default",
        name: "Diwali Flash Sale",
        description: "Promotional discount broadcast",
        status: "DRAFT",
        templateId: "tpl-festive-sale",
        templateName: "festive_mega_savings",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: { "1": "Valued Customer", "2": "30" },
        audienceType: "MOCK",
        audienceId: null,
        audienceName: "Demo VIP Segment",
        totalRecipients: 1250,
        scheduledAt: null,
        startedAt: null,
        completedAt: null,
        createdBy: "system_user",
        createdAt: new Date("2026-10-10T10:00:00Z"),
        updatedAt: new Date("2026-10-10T10:00:00Z"),
      },
      {
        id: "cmp_seeded_002",
        organizationId: "org_default",
        name: "Order Confirmation Utility",
        description: "Transactional notification",
        status: "COMPLETED",
        templateId: "tpl-order-shipped",
        templateName: "order_dispatched_alert",
        templateLanguage: "en_US",
        templateCategory: "UTILITY",
        variablesMapping: {},
        audienceType: "CONTACT_LIST",
        audienceId: "aud_002",
        audienceName: "Recent Purchasers",
        totalRecipients: 450,
        scheduledAt: null,
        startedAt: new Date("2026-10-11T12:00:00Z"),
        completedAt: new Date("2026-10-11T12:05:00Z"),
        createdBy: "system_user",
        createdAt: new Date("2026-10-11T11:00:00Z"),
        updatedAt: new Date("2026-10-11T12:05:00Z"),
      },
    ];
  });

  afterEach(() => {
    setAllowedTestTemplates(null);
  });

  // --------------------------------------------------------------------------
  // 1. Create Draft & Retrieval
  // --------------------------------------------------------------------------
  describe("POST /api/v1/campaigns (Create Draft)", () => {
    it("should reject campaign creation if template is not in the testing allowlist with HTTP 400", async () => {
      setAllowedTestTemplates(null); // revert to standard 3 templates
      const payload = {
        name: "Disallowed Template Campaign",
        templateId: "tpl-unauthorized",
        templateName: "unauthorized_template_name",
      };

      const res = await request(app).post("/api/v1/campaigns").send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("is not in the testing allowlist");

      // Re-apply test allowlist
      setAllowedTestTemplates([
        ...ALLOWED_TEST_TEMPLATE_NAMES,
        "festive_mega_savings",
        "template_one",
        "order_dispatched_alert",
        "unapproved_promo",
        "tpl_one",
        "rapid_template",
        "idempotent_template",
        "sep_template",
      ]);
    });
    it("should create a draft campaign with default status DRAFT and 201 status code", async () => {
      const payload = {
        name: "New Festive Broadcast",
        description: "Special seasonal discounts",
        templateId: "tpl-festive-sale",
        templateName: "festive_mega_savings",
        templateLanguage: "en_US",
        templateCategory: "MARKETING",
        variablesMapping: { "1": "Rohan", "2": "25" },
        audienceType: "MOCK",
        audienceName: "Sample High Value Customers",
        totalRecipients: 500,
      };

      const res = await request(app).post("/api/v1/campaigns").send(payload);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        name: "New Festive Broadcast",
        status: "DRAFT",
        templateId: "tpl-festive-sale",
        templateName: "festive_mega_savings",
        audienceType: "MOCK",
        totalRecipients: 500,
        organizationId: "org_default",
      });
      expect(res.body.data.id).toBeDefined();
    });

    it("should reject campaign creation if selected template is in REJECTED/PENDING status on Meta with HTTP 400", async () => {
      vi.spyOn(whatsappTemplateService, "getTemplateByName").mockResolvedValue({
        id: "tpl_rejected_123",
        name: "unapproved_promo",
        language: "en_US",
        category: "MARKETING",
        status: "REJECTED",
        isSendable: false,
        parameter_format: "POSITIONAL",
        components: [],
      });

      const payload = {
        name: "Illegal Template Campaign",
        templateId: "tpl_rejected_123",
        templateName: "unapproved_promo",
      };

      const res = await request(app).post("/api/v1/campaigns").send(payload);

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("Only APPROVED templates can be used for campaign drafts");
    });

    it("should reject campaign names shorter than 3 characters with HTTP 422", async () => {
      const res = await request(app).post("/api/v1/campaigns").send({
        name: "AB",
        templateId: "tpl-1",
        templateName: "template_one",
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            field: "name",
            message: "Campaign name must be at least 3 characters",
          }),
        ])
      );
    });

    it("should reject campaign names longer than 100 characters with HTTP 422", async () => {
      const longName = "A".repeat(101);
      const res = await request(app).post("/api/v1/campaigns").send({
        name: longName,
        templateId: "tpl-1",
        templateName: "template_one",
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
    });

    it("should reject descriptions longer than 500 characters with HTTP 422", async () => {
      const longDesc = "D".repeat(501);
      const res = await request(app).post("/api/v1/campaigns").send({
        name: "Valid Campaign Name",
        description: longDesc,
        templateId: "tpl-1",
        templateName: "template_one",
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should reject negative totalRecipients with HTTP 422", async () => {
      const res = await request(app).post("/api/v1/campaigns").send({
        name: "Valid Campaign",
        templateId: "tpl-1",
        templateName: "template_one",
        totalRecipients: -5,
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("should reject past scheduledAt dates with HTTP 422", async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      const res = await request(app).post("/api/v1/campaigns").send({
        name: "Scheduled Campaign",
        templateId: "tpl-1",
        templateName: "template_one",
        scheduledAt: pastDate,
      });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 2. Listing, Search, Status Filtering & Pagination
  // --------------------------------------------------------------------------
  describe("GET /api/v1/campaigns (List & Filter)", () => {
    it("should list campaigns with pagination and status metrics", async () => {
      const res = await request(app).get("/api/v1/campaigns");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(Array.isArray(res.body.data.items)).toBe(true);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.pagination).toMatchObject({
        page: 1,
        limit: 10,
        total: 2,
        totalPages: 1,
      });
      expect(res.body.data.metrics).toMatchObject({
        total: 2,
        draft: 1,
        completed: 1,
      });
    });

    it("should filter campaigns by status DRAFT", async () => {
      const res = await request(app).get("/api/v1/campaigns?status=DRAFT");

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].status).toBe("DRAFT");
      expect(res.body.data.items[0].id).toBe("cmp_seeded_001");
    });

    it("should filter campaigns by search query", async () => {
      const res = await request(app).get("/api/v1/campaigns?search=Diwali");

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].name).toBe("Diwali Flash Sale");
    });

    it("should reject invalid status filter with HTTP 422", async () => {
      const res = await request(app).get("/api/v1/campaigns?status=INVALID_STATUS");

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 3. Single Campaign Details & 404 Responses
  // --------------------------------------------------------------------------
  describe("GET /api/v1/campaigns/:id", () => {
    it("should fetch single campaign details by ID", async () => {
      const res = await request(app).get("/api/v1/campaigns/cmp_seeded_001");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe("cmp_seeded_001");
      expect(res.body.data.name).toBe("Diwali Flash Sale");
    });

    it("should return HTTP 404 for non-existent campaign ID", async () => {
      const res = await request(app).get("/api/v1/campaigns/non_existent_id");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });

  // --------------------------------------------------------------------------
  // 4. Update Draft & Safeguards on Non-Draft Updates
  // --------------------------------------------------------------------------
  describe("PUT /api/v1/campaigns/:id (Update Draft)", () => {
    it("should reject updating campaign with a non-allowlisted template with HTTP 400", async () => {
      setAllowedTestTemplates(null);
      const res = await request(app)
        .put("/api/v1/campaigns/cmp_seeded_001")
        .send({
          templateName: "unauthorized_update_template",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("is not in the testing allowlist");

      setAllowedTestTemplates([
        ...ALLOWED_TEST_TEMPLATE_NAMES,
        "festive_mega_savings",
        "template_one",
        "order_dispatched_alert",
        "unapproved_promo",
        "tpl_one",
        "rapid_template",
        "idempotent_template",
        "sep_template",
      ]);
    });

    it("should update draft campaign attributes successfully", async () => {
      const res = await request(app)
        .put("/api/v1/campaigns/cmp_seeded_001")
        .send({
          name: "Diwali Mega Sale 2026",
          description: "Updated festive description",
          totalRecipients: 2000,
        });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Diwali Mega Sale 2026");
      expect(res.body.data.totalRecipients).toBe(2000);
    });

    it("should reject updating a non-draft (COMPLETED) campaign with HTTP 400", async () => {
      const res = await request(app)
        .put("/api/v1/campaigns/cmp_seeded_002")
        .send({
          name: "Attempting to change completed campaign",
        });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("BAD_REQUEST");
      expect(res.body.error.message).toContain("Only DRAFT campaigns can be edited");
    });

    it("should return HTTP 404 when updating non-existent campaign", async () => {
      const res = await request(app)
        .put("/api/v1/campaigns/missing_id")
        .send({
          name: "Valid Name",
        });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 5. Duplicate Campaign
  // --------------------------------------------------------------------------
  describe("POST /api/v1/campaigns/:id/duplicate", () => {
    it("should duplicate an existing campaign into an independent draft with '(Copy)' suffix", async () => {
      const res = await request(app).post("/api/v1/campaigns/cmp_seeded_001/duplicate");

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Diwali Flash Sale (Copy)");
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.id).not.toBe("cmp_seeded_001");
      expect(res.body.data.templateId).toBe("tpl-festive-sale");
    });

    it("should duplicate even completed campaigns into a new DRAFT record", async () => {
      const res = await request(app).post("/api/v1/campaigns/cmp_seeded_002/duplicate");

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.name).toBe("Order Confirmation Utility (Copy)");
      expect(res.body.data.status).toBe("DRAFT");
    });

    it("should return HTTP 404 when duplicating non-existent campaign", async () => {
      const res = await request(app).post("/api/v1/campaigns/missing_id/duplicate");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 6. Delete Draft & Safeguards on Non-Draft Deletion
  // --------------------------------------------------------------------------
  describe("DELETE /api/v1/campaigns/:id (Delete Draft)", () => {
    it("should delete a DRAFT campaign successfully", async () => {
      const res = await request(app).delete("/api/v1/campaigns/cmp_seeded_001");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data).toMatchObject({
        id: "cmp_seeded_001",
        deleted: true,
      });

      // Verify removal
      const checkRes = await request(app).get("/api/v1/campaigns/cmp_seeded_001");
      expect(checkRes.status).toBe(404);
    });

    it("should reject deleting a non-draft (COMPLETED) campaign with HTTP 400", async () => {
      const res = await request(app).delete("/api/v1/campaigns/cmp_seeded_002");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("BAD_REQUEST");
      expect(res.body.error.message).toContain("Only DRAFT campaigns can be removed");
    });

    it("should return HTTP 404 when deleting non-existent campaign", async () => {
      const res = await request(app).delete("/api/v1/campaigns/missing_id");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
    });
  });

  // --------------------------------------------------------------------------
  // 7. Tenant Isolation & Security
  // --------------------------------------------------------------------------
  describe("Tenant Isolation & Security Boundaries", () => {
    it("should prevent untrusted client from overriding organizationId in request body", async () => {
      const maliciousPayload = {
        name: "Cross Tenant Attack",
        templateId: "tpl-1",
        templateName: "tpl_one",
        organizationId: "hacked_tenant_456",
      };

      const res = await request(app).post("/api/v1/campaigns").send(maliciousPayload);

      expect(res.status).toBe(201);
      expect(res.body.data.organizationId).toBe("org_default");
      expect(res.body.data.organizationId).not.toBe("hacked_tenant_456");
    });
  });

  // --------------------------------------------------------------------------
  // 8. Duplicate Submission Protection & Idempotency
  // --------------------------------------------------------------------------
  describe("Duplicate Submission Protection & Idempotency", () => {
    it("should return existing draft if an identical campaign is submitted within 5 seconds without clientRequestId", async () => {
      const payload = {
        name: "Rapid Click Campaign",
        templateId: "tpl-rapid",
        templateName: "rapid_template",
      };

      const firstRes = await request(app).post("/api/v1/campaigns").send(payload);
      expect(firstRes.status).toBe(201);
      const firstId = firstRes.body.data.id;

      // Second immediate click
      const secondRes = await request(app).post("/api/v1/campaigns").send(payload);
      expect(secondRes.status).toBe(201);
      expect(secondRes.body.data.id).toBe(firstId);
    });

    it("should return identical campaign when retrying with the same clientRequestId", async () => {
      const payload = {
        name: "Idempotent Campaign",
        templateId: "tpl-idempotent",
        templateName: "idempotent_template",
        clientRequestId: "req-unique-uuid-1234",
      };

      const firstRes = await request(app).post("/api/v1/campaigns").send(payload);
      expect(firstRes.status).toBe(201);
      const firstId = firstRes.body.data.id;

      // Retry of the same request
      const retryRes = await request(app).post("/api/v1/campaigns").send(payload);
      expect(retryRes.status).toBe(201);
      expect(retryRes.body.data.id).toBe(firstId);
    });

    it("should allow creating separate campaigns with the same name if clientRequestId is different", async () => {
      const payload1 = {
        name: "Separate Campaign Same Name",
        templateId: "tpl-sep",
        templateName: "sep_template",
        clientRequestId: "req-diff-1",
      };
      const payload2 = {
        name: "Separate Campaign Same Name",
        templateId: "tpl-sep",
        templateName: "sep_template",
        clientRequestId: "req-diff-2",
      };

      const res1 = await request(app).post("/api/v1/campaigns").send(payload1);
      expect(res1.status).toBe(201);

      const res2 = await request(app).post("/api/v1/campaigns").send(payload2);
      expect(res2.status).toBe(201);
      expect(res2.body.data.id).not.toBe(res1.body.data.id);
    });
  });
});
