import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { getPrismaClient } from "../config/prisma.js";
import { authService } from "../services/auth.service.js";
import { whatsappIntegrationService } from "../services/whatsappIntegration.service.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";

const PLATFORM_ORG_ID = "cmv7xnkn20000t818segbx7xq";
const CUSTOMER_ORG_1 = "org_customer_alpha";
const CUSTOMER_ORG_2 = "org_customer_beta";

describe("Phase 9C — Master Admin Dashboard & Organization Management", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  const mockSessionCookie = (userOverrides: Partial<any> = {}) => {
    const sessionUser = {
      id: "usr_master_admin_1",
      email: "master@grovastra.com",
      firstName: "Platform",
      lastName: "Admin",
      role: "OWNER",
      platformRole: "PLATFORM_MASTER_ADMIN",
      organizationId: PLATFORM_ORG_ID,
      createdAt: new Date(),
      ...userOverrides,
    };

    const sessionOrg = {
      id: sessionUser.organizationId,
      name: "Groviews Platform",
      slug: "groviews-platform",
      isArchived: false,
      deletedAt: null,
    };

    vi.spyOn(authService, "validateSession").mockResolvedValue({
      id: "sess_master_1",
      userId: sessionUser.id,
      organizationId: sessionUser.organizationId,
      organization: sessionOrg,
      user: sessionUser,
      expiresAt: new Date(Date.now() + 60000),
      tokenHash: "token_hash",
      createdAt: new Date(),
      userAgent: null,
      ipAddress: null,
    } as any);

    return "grovastra_session=valid_master_admin_session";
  };

  describe("1. Master Admin Overview (/api/v1/admin/platform/overview)", () => {
    it("returns real aggregated counts and safe platform status to authenticated Master Admin", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.organization, "count")
        .mockResolvedValueOnce(5) // total
        .mockResolvedValueOnce(4) // active
        .mockResolvedValueOnce(1); // archived

      vi.spyOn(prisma.user, "count")
        .mockResolvedValueOnce(12) // total
        .mockResolvedValueOnce(1) // master admin
        .mockResolvedValueOnce(2) // delegated admin
        .mockResolvedValueOnce(9); // regular

      vi.spyOn(prisma.metaAccount, "count").mockResolvedValueOnce(3);

      vi.spyOn(whatsappIntegrationService, "getPlatformConnectionStatus").mockResolvedValueOnce({
        connected: true,
        status: "CONNECTED",
        source: "DATABASE",
        mode: "SHARED_PLATFORM",
        canManageCredentials: true,
        isSharedPlatform: true,
        wabaId: "waba_12345",
        phoneNumberId: "phone_12345",
        displayPhoneNumber: "+1 555-0199",
        verifiedName: "Grovastra Platform",
        tokenExpiresAt: "2027-01-01T00:00:00.000Z",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-10-15T12:00:00.000Z",
        lastError: null,
      });

      const res = await request(app)
        .get("/api/v1/admin/platform/overview")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platformStatus).toBe("OPERATIONAL");
      expect(res.body.data.organizations).toEqual({
        total: 5,
        active: 4,
        archived: 1,
      });
      expect(res.body.data.users).toEqual({
        total: 12,
        masterAdmins: 1,
        delegatedAdmins: 2,
        regularUsers: 9,
      });
      expect(res.body.data.whatsapp.connected).toBe(true);
      expect(res.body.data.whatsapp.displayPhoneNumber).toBe("+1 555-0199");
      expect(res.body.data.whatsapp.organizationsWithConnectedAccount).toBe(3);
    });

    it("rejects ordinary customer OWNER (platformRole NONE) with HTTP 403", async () => {
      const cookie = mockSessionCookie({
        platformRole: "NONE",
        organizationId: CUSTOMER_ORG_1,
      });

      const res = await request(app)
        .get("/api/v1/admin/platform/overview")
        .set("Cookie", cookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects DELEGATED_ADMIN without master admin privileges with HTTP 403", async () => {
      const cookie = mockSessionCookie({
        platformRole: "DELEGATED_ADMIN",
        organizationId: CUSTOMER_ORG_1,
      });

      const res = await request(app)
        .get("/api/v1/admin/platform/overview")
        .set("Cookie", cookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("2. Customer Organization Directory (/api/v1/admin/platform/organizations)", () => {
    it("returns paginated organization list with search and status support", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.organization, "count").mockResolvedValueOnce(2);
      vi.spyOn(prisma.organization, "findMany").mockResolvedValueOnce([
        {
          id: CUSTOMER_ORG_1,
          name: "Alpha Logistics",
          slug: "alpha-logistics",
          isArchived: false,
          deletedAt: null,
          createdAt: new Date("2026-01-01"),
          updatedAt: new Date("2026-01-02"),
          _count: { users: 3 },
          metaAccount: { id: "meta_1", status: "CONNECTED" },
        },
        {
          id: CUSTOMER_ORG_2,
          name: "Beta Retail",
          slug: "beta-retail",
          isArchived: true,
          deletedAt: new Date("2026-02-01"),
          createdAt: new Date("2026-01-10"),
          updatedAt: new Date("2026-02-01"),
          _count: { users: 1 },
          metaAccount: null,
        },
      ] as any);

      const res = await request(app)
        .get("/api/v1/admin/platform/organizations?search=alpha&status=all&page=1&limit=10")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizations).toHaveLength(2);
      expect(res.body.data.organizations[0]).toMatchObject({
        id: CUSTOMER_ORG_1,
        name: "Alpha Logistics",
        status: "ACTIVE",
        userCount: 3,
        hasMetaAccount: true,
      });
      expect(res.body.data.organizations[1]).toMatchObject({
        id: CUSTOMER_ORG_2,
        name: "Beta Retail",
        status: "ARCHIVED",
        userCount: 1,
        hasMetaAccount: false,
      });
      expect(res.body.data.pagination).toEqual({
        total: 2,
        page: 1,
        limit: 10,
        totalPages: 1,
      });
    });

    it("denies access to organizations list for non-master admin", async () => {
      const cookie = mockSessionCookie({ platformRole: "NONE" });

      const res = await request(app)
        .get("/api/v1/admin/platform/organizations")
        .set("Cookie", cookie);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("3. Organization Details View (/api/v1/admin/platform/organizations/:id)", () => {
    it("returns detailed organization view with users, tenant roles, and resource counts", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: CUSTOMER_ORG_1,
        name: "Alpha Logistics",
        slug: "alpha-logistics",
        isArchived: false,
        deletedAt: null,
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date("2026-01-02"),
        users: [
          {
            id: "usr_owner_1",
            email: "owner@alpha.com",
            firstName: "Alice",
            lastName: "Owner",
            role: "OWNER",
            platformRole: "NONE",
            createdAt: new Date("2026-01-01"),
            updatedAt: new Date("2026-01-01"),
          },
          {
            id: "usr_admin_1",
            email: "admin@alpha.com",
            firstName: "Bob",
            lastName: "Admin",
            role: "ADMIN",
            platformRole: "NONE",
            createdAt: new Date("2026-01-02"),
            updatedAt: new Date("2026-01-02"),
          },
        ],
        metaAccount: {
          status: "CONNECTED",
          wabaId: "waba_alpha_999",
          phoneNumberId: "phone_alpha_999",
          verifiedName: "Alpha Logistics Official",
          displayPhoneNumber: "+1 555-0100",
          lastSyncedAt: new Date("2026-10-15"),
          lastError: null,
          tokenExpiresAt: new Date("2027-01-01"),
        },
        _count: {
          campaigns: 14,
          contacts: 2450,
          contactLists: 5,
          users: 2,
        },
      } as any);

      const res = await request(app)
        .get(`/api/v1/admin/platform/organizations/${CUSTOMER_ORG_1}`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe(CUSTOMER_ORG_1);
      expect(res.body.data.users).toHaveLength(2);
      expect(res.body.data.users[0].role).toBe("OWNER");
      expect(res.body.data.users[1].role).toBe("ADMIN");
      expect(res.body.data.counts).toEqual({
        campaigns: 14,
        contacts: 2450,
        contactLists: 5,
        users: 2,
      });
      expect(res.body.data.metaAccount.verifiedName).toBe("Alpha Logistics Official");
    });

    it("returns 404 when organization is not found", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce(null);

      const res = await request(app)
        .get("/api/v1/admin/platform/organizations/org_non_existent")
        .set("Cookie", cookie);

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("ORGANIZATION_NOT_FOUND");
    });
  });

  describe("4. Organization Lifecycle Management (Archive & Reactivate)", () => {
    it("archives a customer organization and invalidates all active sessions", async () => {
      const cookie = mockSessionCookie({ organizationId: PLATFORM_ORG_ID });
      const prisma = getPrismaClient();

      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: CUSTOMER_ORG_1,
        name: "Alpha Logistics",
        slug: "alpha-logistics",
        isArchived: false,
        deletedAt: null,
      } as any);

      vi.spyOn(prisma.organization, "update").mockResolvedValueOnce({
        id: CUSTOMER_ORG_1,
        name: "Alpha Logistics",
        slug: "alpha-logistics",
        isArchived: true,
        deletedAt: new Date(),
        createdAt: new Date("2026-01-01"),
        updatedAt: new Date(),
        _count: { users: 2 },
        metaAccount: null,
      } as any);

      const deleteSessionsSpy = vi
        .spyOn(prisma.session, "deleteMany")
        .mockResolvedValueOnce({ count: 4 });

      const res = await request(app)
        .post(`/api/v1/admin/platform/organizations/${CUSTOMER_ORG_1}/archive`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("ARCHIVED");
      expect(deleteSessionsSpy).toHaveBeenCalledWith({
        where: { organizationId: CUSTOMER_ORG_1 },
      });
    });

    it("prevents archive of the root platform organization", async () => {
      const cookie = mockSessionCookie({ organizationId: PLATFORM_ORG_ID });

      const res = await request(app)
        .post(`/api/v1/admin/platform/organizations/${PLATFORM_ORG_ID}/archive`)
        .set("Cookie", cookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("PLATFORM_ORGANIZATION_IMMUTABLE");
    });

    it("prevents self-archive of the operator's own active organization", async () => {
      const OPERATOR_ORG = "org_operator_custom";
      const cookie = mockSessionCookie({ organizationId: OPERATOR_ORG });

      const res = await request(app)
        .post(`/api/v1/admin/platform/organizations/${OPERATOR_ORG}/archive`)
        .set("Cookie", cookie);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("SELF_ORGANIZATION_ARCHIVE_DENIED");
    });

    it("reactivates an archived customer organization", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: CUSTOMER_ORG_2,
        name: "Beta Retail",
        slug: "beta-retail",
        isArchived: true,
        deletedAt: new Date("2026-02-01"),
      } as any);

      vi.spyOn(prisma.organization, "update").mockResolvedValueOnce({
        id: CUSTOMER_ORG_2,
        name: "Beta Retail",
        slug: "beta-retail",
        isArchived: false,
        deletedAt: null,
        createdAt: new Date("2026-01-10"),
        updatedAt: new Date(),
        _count: { users: 1 },
        metaAccount: null,
      } as any);

      const res = await request(app)
        .post(`/api/v1/admin/platform/organizations/${CUSTOMER_ORG_2}/reactivate`)
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("ACTIVE");
    });
  });

  describe("5. Shared WhatsApp Platform Management (/api/v1/admin/platform/whatsapp/status)", () => {
    it("allows authenticated Master Admin session to access WhatsApp status without platform secret", async () => {
      const cookie = mockSessionCookie();

      vi.spyOn(whatsappIntegrationService, "getPlatformConnectionStatus").mockResolvedValueOnce({
        connected: true,
        status: "CONNECTED",
        source: "DATABASE",
        mode: "SHARED_PLATFORM",
        canManageCredentials: true,
        isSharedPlatform: true,
        wabaId: "1075305975271164",
        phoneNumberId: "105741875883651",
        displayPhoneNumber: "+1 555-0199",
        verifiedName: "Grovastra Platform",
        tokenExpiresAt: "2027-01-01T00:00:00.000Z",
        verifiedAt: "2026-01-01T00:00:00.000Z",
        lastSyncedAt: "2026-10-15T12:00:00.000Z",
        lastError: null,
      });

      const res = await request(app)
        .get("/api/v1/admin/platform/whatsapp/status")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isSharedPlatform).toBe(true);
      expect(res.body.data.displayPhoneNumber).toBe("+1 555-0199");
      // Zero secrets or tokens in output
      expect(res.body.data.accessToken).toBeUndefined();
    });
  });

  describe("6. Platform Templates (/api/v1/admin/platform/templates)", () => {
    it("returns template list and sync summary for the shared platform WABA", async () => {
      const cookie = mockSessionCookie();

      vi.spyOn(whatsappTemplateService, "fetchWabaTemplates").mockResolvedValueOnce({
        templates: [
          {
            id: "tpl_1",
            name: "hello_world",
            language: "en_US",
            category: "UTILITY",
            status: "APPROVED",
            isSendable: true,
            parameterFormat: "POSITIONAL",
            body: "Hello World",
            buttons: [],
            variables: [],
            rawComponents: [],
          },
        ],
        summary: {
          totalOnMeta: 1,
          approvedCount: 1,
          pendingCount: 0,
          rejectedCount: 0,
          wabaIdMasked: "***1164",
          syncedAt: "2026-10-15T12:00:00.000Z",
          requestedTemplatesFound: {
            hello_world: true,
            jaspers_market_plain_text_v1: false,
            jaspers_market_order_confirmation_v1: false,
          },
        },
      });

      const res = await request(app)
        .get("/api/v1/admin/platform/templates?force=true")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.templates).toHaveLength(1);
      expect(res.body.data.summary.approvedCount).toBe(1);
    });
  });
});
