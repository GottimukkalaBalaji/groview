import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { CampaignStatus, CampaignApprovalStatus } from "@prisma/client";
import { platformAuthService } from "../services/platformAuth.service.js";
import { authService } from "../services/auth.service.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { setAllowedTestTemplates } from "../constants/templateAllowlist.js";

const TEST_SECRET = "test_platform_admin_secret_super_secure_key_123456";
const ORG_ALPHA = "org_customer_alpha";
const ORG_BETA = "org_customer_beta";
const ORG_GAMMA = "org_customer_gamma";

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
  organization?: {
    id: string;
    name: string;
    slug: string;
  };
}

let mockCampaignsStore: MockCampaign[] = [];

// Mock BullMQ queue removal helper
const mockRemoveJob = vi.fn().mockResolvedValue(true);
vi.mock("../queue/whatsapp.queue.js", () => ({
  removeWhatsAppDispatchJob: (orgId: string, messageId: string) => mockRemoveJob(orgId, messageId),
  enqueueWhatsAppDispatchJob: vi.fn().mockResolvedValue({ id: "job_mock" }),
  inspectAndRecoverDispatchJob: vi.fn().mockResolvedValue({ recovered: false }),
}));

// Mock Prisma client with multi-tenant approval query support
vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => ({
      organization: {
        findUnique: vi.fn().mockImplementation(async ({ where }) => {
          if (where.id === ORG_ALPHA) {
            return { id: ORG_ALPHA, name: "Customer Alpha Ltd", slug: "customer-alpha", isArchived: false, deletedAt: null };
          }
          if (where.id === ORG_BETA) {
            return { id: ORG_BETA, name: "Customer Beta Inc", slug: "customer-beta", isArchived: false, deletedAt: null };
          }
          if (where.id === ORG_GAMMA) {
            return { id: ORG_GAMMA, name: "Customer Gamma LLC", slug: "customer-gamma", isArchived: false, deletedAt: null };
          }
          return null;
        }),
      },
      session: {
        findUnique: vi.fn().mockResolvedValue(null),
      },
      campaign: {
        findMany: vi.fn().mockImplementation(async ({ where, skip = 0, take = 50, orderBy }) => {
          let filtered = mockCampaignsStore.slice();

          if (where?.organizationId) {
            if (typeof where.organizationId === "string") {
              filtered = filtered.filter((c) => c.organizationId === where.organizationId);
            } else if (where.organizationId.in) {
              filtered = filtered.filter((c) => where.organizationId.in.includes(c.organizationId));
            }
          }

          if (where?.approvalStatus) {
            if (typeof where.approvalStatus === "string") {
              filtered = filtered.filter((c) => c.approvalStatus === where.approvalStatus);
            } else if (where.approvalStatus.in) {
              filtered = filtered.filter((c) => where.approvalStatus.in.includes(c.approvalStatus));
            }
          }

          if (where?.OR && Array.isArray(where.OR)) {
            filtered = filtered.filter((c) => {
              return where.OR.some((clause: any) => {
                if (clause.name?.contains) {
                  return c.name.toLowerCase().includes(clause.name.contains.toLowerCase());
                }
                if (clause.templateName?.contains) {
                  return c.templateName.toLowerCase().includes(clause.templateName.contains.toLowerCase());
                }
                return false;
              });
            });
          }

          // Sort
          if (orderBy) {
            const key = Object.keys(orderBy)[0];
            const direction = orderBy[key];
            filtered.sort((a: any, b: any) => {
              const valA = a[key];
              const valB = b[key];
              if (valA < valB) return direction === "asc" ? -1 : 1;
              if (valA > valB) return direction === "asc" ? 1 : -1;
              return 0;
            });
          }

          const sliced = filtered.slice(skip, skip + take);

          return sliced.map((c) => ({
            ...c,
            organization: {
              id: c.organizationId,
              name: c.organizationId === ORG_ALPHA ? "Customer Alpha Ltd" : c.organizationId === ORG_BETA ? "Customer Beta Inc" : "Customer Gamma LLC",
              slug: c.organizationId === ORG_ALPHA ? "customer-alpha" : c.organizationId === ORG_BETA ? "customer-beta" : "customer-gamma",
            },
          }));
        }),
        findFirst: vi.fn().mockImplementation(async ({ where }) => {
          const found = mockCampaignsStore.find((c) => {
            if (where.id && c.id !== where.id) return false;
            if (where.organizationId && c.organizationId !== where.organizationId) return false;
            if (where.approvalStatus && c.approvalStatus !== where.approvalStatus) return false;
            return true;
          });
          if (!found) return null;
          return {
            ...found,
            organization: {
              id: found.organizationId,
              name: found.organizationId === ORG_ALPHA ? "Customer Alpha Ltd" : "Customer Beta Inc",
              slug: found.organizationId === ORG_ALPHA ? "customer-alpha" : "customer-beta",
            },
          };
        }),
        count: vi.fn().mockImplementation(async ({ where }) => {
          let filtered = mockCampaignsStore.slice();
          if (where?.organizationId) {
            if (typeof where.organizationId === "string") {
              filtered = filtered.filter((c) => c.organizationId === where.organizationId);
            } else if (where.organizationId.in) {
              filtered = filtered.filter((c) => where.organizationId.in.includes(c.organizationId));
            }
          }
          if (where?.approvalStatus) {
            if (typeof where.approvalStatus === "string") {
              filtered = filtered.filter((c) => c.approvalStatus === where.approvalStatus);
            } else if (where.approvalStatus.in) {
              filtered = filtered.filter((c) => where.approvalStatus.in.includes(c.approvalStatus));
            }
          }
          if (where?.OR && Array.isArray(where.OR)) {
            filtered = filtered.filter((c) => {
              return where.OR.some((clause: any) => {
                if (clause.name?.contains) {
                  return c.name.toLowerCase().includes(clause.name.contains.toLowerCase());
                }
                if (clause.templateName?.contains) {
                  return c.templateName.toLowerCase().includes(clause.templateName.contains.toLowerCase());
                }
                return false;
              });
            });
          }
          return filtered.length;
        }),
        update: vi.fn().mockImplementation(async ({ where, data }) => {
          const idx = mockCampaignsStore.findIndex((c) => c.id === where.id);
          if (idx === -1) throw new Error("Campaign not found");
          const existing = mockCampaignsStore[idx];
          const updated = {
            ...existing,
            ...data,
            scheduledAt: data.scheduledAt !== undefined ? (data.scheduledAt ? new Date(data.scheduledAt) : null) : existing.scheduledAt,
            dispatchRun: typeof data.dispatchRun === "object" && data.dispatchRun?.increment ? existing.dispatchRun + data.dispatchRun.increment : data.dispatchRun ?? existing.dispatchRun,
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
        findMany: vi.fn().mockResolvedValue([]),
        updateMany: vi.fn().mockResolvedValue({ count: 0 }),
      },
    }),
  };
});

describe("Stage 2: Multi-Tenant Platform Campaign Approvals API Integration Tests", () => {
  beforeEach(() => {
    mockCampaignsStore = [];
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

    // Mock validateSession to recognize mock_delegated_token
    vi.spyOn(authService, "validateSession").mockImplementation(async (token: string) => {
      if (token === "mock_delegated_token_alpha") {
        return {
          id: "sess_del_alpha",
          userId: "usr_delegated_alpha",
          organizationId: "org_agency_internal",
          user: {
            id: "usr_delegated_alpha",
            email: "del_alpha@agency.com",
            firstName: "Alice",
            lastName: "Admin",
            role: "ADMIN",
            platformRole: "DELEGATED_ADMIN",
            createdAt: new Date(),
            organizationId: "org_agency_internal",
          },
          organization: {
            id: "org_agency_internal",
            name: "Partner Agency",
            slug: "partner-agency",
            isArchived: false,
            deletedAt: null,
          },
          token: "mock_delegated_token_alpha",
          expiresAt: new Date(Date.now() + 86400000),
        } as any;
      }
      if (token === "mock_delegated_token_beta") {
        return {
          id: "sess_del_beta",
          userId: "usr_delegated_beta",
          organizationId: "org_agency_internal",
          user: {
            id: "usr_delegated_beta",
            email: "del_beta@agency.com",
            firstName: "Bob",
            lastName: "Admin",
            role: "ADMIN",
            platformRole: "DELEGATED_ADMIN",
            createdAt: new Date(),
            organizationId: "org_agency_internal",
          },
          organization: {
            id: "org_agency_internal",
            name: "Partner Agency",
            slug: "partner-agency",
            isArchived: false,
            deletedAt: null,
          },
          token: "mock_delegated_token_beta",
          expiresAt: new Date(Date.now() + 86400000),
        } as any;
      }
      return null;
    });

    // Populate test campaigns across multiple customer organizations
    const futureSchedule = new Date(Date.now() + 86400000); // 24h in future (> 5 min)

    // Alpha Campaigns
    mockCampaignsStore.push({
      id: "cmp_alpha_pending_1",
      organizationId: ORG_ALPHA,
      name: "Alpha Holiday Flash Sale",
      description: "Scheduled holiday blast",
      status: CampaignStatus.DRAFT,
      approvalStatus: CampaignApprovalStatus.PENDING,
      approvedAt: null,
      approvedBy: null,
      approvalNotes: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      dispatchRun: 1,
      templateId: "tpl_1",
      templateName: "hello_world",
      templateLanguage: "en_US",
      templateCategory: "MARKETING",
      variablesMapping: {},
      audienceType: "CONTACT_LIST",
      audienceId: "aud_alpha_1",
      audienceName: "Alpha VIPs",
      totalRecipients: 100,
      scheduledAt: futureSchedule,
      startedAt: null,
      completedAt: null,
      createdBy: "user_alpha_owner",
      createdAt: new Date("2026-10-25T10:00:00Z"),
      updatedAt: new Date("2026-10-25T10:00:00Z"),
    });

    mockCampaignsStore.push({
      id: "cmp_alpha_approved_1",
      organizationId: ORG_ALPHA,
      name: "Alpha Early Bird Deals",
      description: "Approved promo",
      status: CampaignStatus.SCHEDULED,
      approvalStatus: CampaignApprovalStatus.APPROVED,
      approvedAt: new Date("2026-10-24T12:00:00Z"),
      approvedBy: "super_admin_user",
      approvalNotes: "All checks passed",
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      dispatchRun: 1,
      templateId: "tpl_1",
      templateName: "hello_world",
      templateLanguage: "en_US",
      templateCategory: "MARKETING",
      variablesMapping: {},
      audienceType: "CONTACT_LIST",
      audienceId: "aud_alpha_2",
      audienceName: "Alpha All Customers",
      totalRecipients: 50,
      scheduledAt: futureSchedule,
      startedAt: null,
      completedAt: null,
      createdBy: "user_alpha_owner",
      createdAt: new Date("2026-10-24T10:00:00Z"),
      updatedAt: new Date("2026-10-24T12:00:00Z"),
    });

    // An unscheduled draft not requiring approval (for 400 test)
    mockCampaignsStore.push({
      id: "cmp_alpha_not_required_1",
      organizationId: ORG_ALPHA,
      name: "Alpha Instant Send Now Draft",
      description: "Immediate blast not requiring approval",
      status: CampaignStatus.DRAFT,
      approvalStatus: CampaignApprovalStatus.NOT_REQUIRED,
      approvedAt: null,
      approvedBy: null,
      approvalNotes: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      dispatchRun: 1,
      templateId: "tpl_1",
      templateName: "hello_world",
      templateLanguage: "en_US",
      templateCategory: "MARKETING",
      variablesMapping: {},
      audienceType: "CONTACT_LIST",
      audienceId: "aud_alpha_3",
      audienceName: "Alpha Instant",
      totalRecipients: 10,
      scheduledAt: null,
      startedAt: null,
      completedAt: null,
      createdBy: "user_alpha_owner",
      createdAt: new Date("2026-10-25T11:00:00Z"),
      updatedAt: new Date("2026-10-25T11:00:00Z"),
    });

    // Beta Campaigns
    mockCampaignsStore.push({
      id: "cmp_beta_pending_1",
      organizationId: ORG_BETA,
      name: "Beta Mega Weekend Blast",
      description: "Scheduled beta blast",
      status: CampaignStatus.DRAFT,
      approvalStatus: CampaignApprovalStatus.PENDING,
      approvedAt: null,
      approvedBy: null,
      approvalNotes: null,
      rejectedAt: null,
      rejectedBy: null,
      rejectionReason: null,
      dispatchRun: 1,
      templateId: "tpl_1",
      templateName: "hello_world",
      templateLanguage: "en_US",
      templateCategory: "MARKETING",
      variablesMapping: {},
      audienceType: "CONTACT_LIST",
      audienceId: "aud_beta_1",
      audienceName: "Beta Wholesale Buyers",
      totalRecipients: 200,
      scheduledAt: futureSchedule,
      startedAt: null,
      completedAt: null,
      createdBy: "user_beta_admin",
      createdAt: new Date("2026-10-26T14:00:00Z"),
      updatedAt: new Date("2026-10-26T14:00:00Z"),
    });

    mockCampaignsStore.push({
      id: "cmp_beta_rejected_1",
      organizationId: ORG_BETA,
      name: "Beta Midnight Clearance",
      description: "Off hours blast",
      status: CampaignStatus.DRAFT,
      approvalStatus: CampaignApprovalStatus.REJECTED,
      approvedAt: null,
      approvedBy: null,
      approvalNotes: null,
      rejectedAt: new Date("2026-10-26T16:00:00Z"),
      rejectedBy: "delegated_admin_beta",
      rejectionReason: "Timing is outside business operating hours",
      dispatchRun: 1,
      templateId: "tpl_1",
      templateName: "hello_world",
      templateLanguage: "en_US",
      templateCategory: "MARKETING",
      variablesMapping: {},
      audienceType: "CONTACT_LIST",
      audienceId: "aud_beta_2",
      audienceName: "Beta Leads",
      totalRecipients: 30,
      scheduledAt: futureSchedule,
      startedAt: null,
      completedAt: null,
      createdBy: "user_beta_admin",
      createdAt: new Date("2026-10-26T15:00:00Z"),
      updatedAt: new Date("2026-10-26T16:00:00Z"),
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Suite 1: Query & Listing Authorization
  // ============================================================================
  describe("1. GET /api/v1/admin/platform/campaign-approvals Authorization", () => {
    it("allows Super Admin (PLATFORM_MASTER_ADMIN) to query platform-wide approvals across all organizations", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.items).toBeDefined();

      // Default status is PENDING: should include pending campaigns from BOTH Alpha and Beta
      const items = res.body.data.items;
      expect(items.length).toBe(2);
      const orgIds = items.map((i: any) => i.organizationId);
      expect(orgIds).toContain(ORG_ALPHA);
      expect(orgIds).toContain(ORG_BETA);

      // Verify status counts breakdown (excludes NOT_REQUIRED)
      expect(res.body.data.counts).toEqual({
        pending: 2,
        approved: 1,
        rejected: 1,
        total: 4,
      });

      // Verify organization metadata is populated
      expect(items[0].organization).toBeDefined();
      expect(items[0].organization.name).toBeDefined();
    });

    it("allows Super Admin to filter platform-wide queue by specific organizationId", async () => {
      const res = await request(app)
        .get(`/api/v1/admin/platform/campaign-approvals?organizationId=${ORG_ALPHA}`)
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].organizationId).toBe(ORG_ALPHA);
      expect(res.body.data.counts.pending).toBe(1);
      expect(res.body.data.counts.approved).toBe(1);
      expect(res.body.data.counts.rejected).toBe(0);
      expect(res.body.data.counts.total).toBe(2);
    });

    it("restricts Delegated Admin to assigned organizations only and excludes unassigned organizations", async () => {
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([ORG_ALPHA]);

      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals")
        .set("authorization", "Bearer mock_delegated_token_alpha");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const items = res.body.data.items;
      expect(items.length).toBe(1);
      expect(items[0].id).toBe("cmp_alpha_pending_1");
      expect(items[0].organizationId).toBe(ORG_ALPHA);

      // Unassigned Beta campaign MUST be strictly excluded
      const hasBeta = items.some((i: any) => i.organizationId === ORG_BETA);
      expect(hasBeta).toBe(false);

      // Counts must reflect ONLY assigned organization
      expect(res.body.data.counts.pending).toBe(1);
      expect(res.body.data.counts.approved).toBe(1);
      expect(res.body.data.counts.rejected).toBe(0);
      expect(res.body.data.counts.total).toBe(2);
    });

    it("denies Delegated Admin with HTTP 403 when explicitly querying an unassigned organization", async () => {
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([ORG_ALPHA]);

      const res = await request(app)
        .get(`/api/v1/admin/platform/campaign-approvals?organizationId=${ORG_BETA}`)
        .set("authorization", "Bearer mock_delegated_token_alpha");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.message).toMatch(/not assigned to manage this customer organization/i);
    });

    it("returns empty result with zero counts when Delegated Admin has zero active assignments", async () => {
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([]);

      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals")
        .set("authorization", "Bearer mock_delegated_token_alpha");

      expect(res.status).toBe(200);
      expect(res.body.data.items).toEqual([]);
      expect(res.body.data.counts).toEqual({ pending: 0, approved: 0, rejected: 0, total: 0 });
    });

    it("denies Customer roles (OWNER, ADMIN, MEMBER) with HTTP 403 Forbidden", async () => {
      // In isolated test runner without platform secret, default context is customer role (platformRole: NONE)
      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals")
        .set("x-test-org-id", ORG_ALPHA);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.message).toMatch(/Platform administrator authorization required/i);
    });

    it("denies unauthenticated requests with HTTP 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals")
        .set("x-test-enforce-auth", "true");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  // ============================================================================
  // Suite 2: Filtering, Search & Pagination
  // ============================================================================
  describe("2. Status Filtering, Search & Pagination", () => {
    it("filters correctly by status=APPROVED", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals?status=APPROVED")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe("cmp_alpha_approved_1");
      expect(res.body.data.items[0].approvalStatus).toBe("APPROVED");
    });

    it("filters correctly by status=REJECTED and includes rejection reason", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals?status=REJECTED")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].id).toBe("cmp_beta_rejected_1");
      expect(res.body.data.items[0].approvalStatus).toBe("REJECTED");
      expect(res.body.data.items[0].rejectionReason).toBe("Timing is outside business operating hours");
    });

    it("filters correctly by status=ALL to return all approval-lifecycle campaigns", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals?status=ALL")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(4);
    });

    it("searches campaigns by name matching query", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals?status=ALL&search=Mega")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(1);
      expect(res.body.data.items[0].name).toContain("Beta Mega Weekend Blast");
    });

    it("paginates properly with limit and page offsets", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals?status=ALL&page=1&limit=2")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.data.items.length).toBe(2);
      expect(res.body.data.pagination).toEqual({
        page: 1,
        limit: 2,
        total: 4,
        totalPages: 2,
        hasNextPage: true,
        hasPrevPage: false,
      });

      const resPage2 = await request(app)
        .get("/api/v1/admin/platform/campaign-approvals?status=ALL&page=2&limit=2")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(resPage2.status).toBe(200);
      expect(resPage2.body.data.items.length).toBe(2);
      expect(resPage2.body.data.pagination.hasNextPage).toBe(false);
      expect(resPage2.body.data.pagination.hasPrevPage).toBe(true);
    });
  });

  // ============================================================================
  // Suite 3: Platform Campaign Approval Actions
  // ============================================================================
  describe("3. POST /api/v1/admin/platform/campaign-approvals/:id/approve", () => {
    it("allows Super Admin to approve a pending campaign across organizations", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_alpha_pending_1/approve")
        .set("x-platform-admin-secret", TEST_SECRET)
        .send({ notes: "Super admin approved" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.approvalStatus).toBe("APPROVED");
      expect(res.body.data.status).toBe("SCHEDULED");
      expect(res.body.data.approvedBy).toBe("platform_master_admin");
      expect(res.body.data.approvalNotes).toBe("Super admin approved");
    });

    it("allows Delegated Admin to approve pending campaign belonging to an assigned organization", async () => {
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([ORG_BETA]);

      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_beta_pending_1/approve")
        .set("authorization", "Bearer mock_delegated_token_beta")
        .send({ notes: "Delegated admin verified schedule" });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.approvalStatus).toBe("APPROVED");
      expect(res.body.data.status).toBe("SCHEDULED");
      expect(res.body.data.approvedBy).toBe("usr_delegated_beta");
    });

    it("denies Delegated Admin attempting cross-organization approval of an unassigned company's campaign", async () => {
      // Delegated admin is assigned ONLY to Beta, attempting to approve Alpha's campaign
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([ORG_BETA]);

      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_alpha_pending_1/approve")
        .set("authorization", "Bearer mock_delegated_token_beta")
        .send({ notes: "Cross-org attack" });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.message).toMatch(/not assigned to manage this customer organization/i);
    });

    it("denies Customer attempting to approve campaigns with HTTP 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_alpha_pending_1/approve")
        .set("x-test-org-id", ORG_ALPHA)
        .send({ notes: "Self-approval attempt" });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns HTTP 404 when campaign ID does not exist", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_non_existent/approve")
        .set("x-platform-admin-secret", TEST_SECRET)
        .send({ notes: "Valid notes" });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("returns HTTP 400 when attempting to approve a campaign that is not in PENDING state", async () => {
      // cmp_alpha_not_required_1 has approvalStatus: NOT_REQUIRED
      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_alpha_not_required_1/approve")
        .set("x-platform-admin-secret", TEST_SECRET)
        .send({ notes: "Non-pending approval attempt" });

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Only PENDING campaigns can be approved/i);
    });
  });

  // ============================================================================
  // Suite 4: Platform Campaign Rejection Actions
  // ============================================================================
  describe("4. POST /api/v1/admin/platform/campaign-approvals/:id/reject", () => {
    it("allows Delegated Admin to reject pending campaign in assigned organization with required reason", async () => {
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([ORG_ALPHA]);

      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_alpha_pending_1/reject")
        .set("authorization", "Bearer mock_delegated_token_alpha")
        .send({ reason: "The targeted audience segment is outdated. Please refresh." });

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.approvalStatus).toBe("REJECTED");
      expect(res.body.data.status).toBe("DRAFT");
      expect(res.body.data.rejectedBy).toBe("usr_delegated_alpha");
      expect(res.body.data.rejectionReason).toBe("The targeted audience segment is outdated. Please refresh.");
    });

    it("denies Delegated Admin attempting cross-organization rejection of an unassigned company's campaign", async () => {
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([ORG_ALPHA]);

      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_beta_pending_1/reject")
        .set("authorization", "Bearer mock_delegated_token_alpha")
        .send({ reason: "Unauthorized rejection attempt" });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("returns HTTP 422 validation error when rejection reason is omitted or too short", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/campaign-approvals/cmp_alpha_pending_1/reject")
        .set("x-platform-admin-secret", TEST_SECRET)
        .send({ reason: "no" }); // min 3 chars required

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details[0].field).toBe("reason");
    });
  });
});
