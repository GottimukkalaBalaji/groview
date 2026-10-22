import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { platformAuthService, stripInjectedPlatformHeaders } from "../services/platformAuth.service.js";
import { Request } from "express";
import { authService } from "../services/auth.service.js";

const TEST_SECRET = "test_platform_admin_secret_super_secure_key_123456";
const CUSTOMER_ORG_1 = "org_customer_alpha";
const CUSTOMER_ORG_2 = "org_customer_beta";

describe("Phase 9B — Database-Backed Platform Roles & Master Admin Authentication", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Header Stripping & Privilege Escalation Protection", () => {
    it("strips client-supplied platform headers to prevent privilege escalation", () => {
      const mockReq = {
        headers: {
          "x-is-platform-admin": "true",
          "x-platform-role": "PLATFORM_MASTER_ADMIN",
          "x-assigned-orgs": "all",
          "authorization": "Bearer customer_token",
        },
      } as unknown as Request;

      stripInjectedPlatformHeaders(mockReq);

      expect(mockReq.headers["x-is-platform-admin"]).toBeUndefined();
      expect(mockReq.headers["x-platform-role"]).toBeUndefined();
      expect(mockReq.headers["x-assigned-orgs"]).toBeUndefined();
      expect(mockReq.headers["authorization"]).toBe("Bearer customer_token");
    });
  });

  describe("2. Default PlatformRole & Signup Protection", () => {
    it("ensures newly created and existing users default to platformRole NONE", () => {
      const sanitized = authService.sanitizeUser({
        id: "usr_1",
        organizationId: CUSTOMER_ORG_1,
        email: "regular@customer.com",
        firstName: "Regular",
        lastName: "Customer",
        role: "OWNER",
        createdAt: new Date(),
      });

      expect(sanitized.platformRole).toBe("NONE");
    });

    it("public signup cannot grant a platform role even if injected in request payload", async () => {
      const signupSpy = vi.spyOn(authService, "signup").mockResolvedValueOnce({
        user: {
          id: "usr_new_123",
          organizationId: "org_new_123",
          email: "new_customer@example.com",
          firstName: "Hacker",
          lastName: "Attempt",
          role: "OWNER",
          platformRole: "NONE", // Verified default
          createdAt: new Date(),
        },
        organization: {
          id: "org_new_123",
          name: "Exploit Org",
          slug: "exploit-org-4321",
        },
        token: "raw_test_session_token_xyz",
        expiresAt: new Date(Date.now() + 86400000),
      });

      const res = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: "new_customer@example.com",
          password: "StrongPassword123!",
          firstName: "Hacker",
          lastName: "Attempt",
          organizationName: "Exploit Org",
          platformRole: "PLATFORM_MASTER_ADMIN", // Malicious payload field
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.user.platformRole).toBe("NONE");
      // Verified that signup input did NOT pass platformRole to authService
      expect(signupSpy).toHaveBeenCalledWith(
        expect.not.objectContaining({ platformRole: "PLATFORM_MASTER_ADMIN" }),
        expect.anything()
      );
    });
  });

  describe("3. Database-Backed Role Boundary Enforcement", () => {
    it("ensures customer OWNER, ADMIN, and MEMBER with platformRole NONE are denied platform access", () => {
      for (const orgRole of ["OWNER", "ADMIN", "MEMBER"]) {
        const customerReq = {
          headers: {},
          context: {
            organizationId: CUSTOMER_ORG_1,
            organizationName: "Alpha Customer Inc",
            organizationSlug: "alpha-customer",
            userId: `usr_${orgRole.toLowerCase()}`,
            user: {
              id: `usr_${orgRole.toLowerCase()}`,
              organizationId: CUSTOMER_ORG_1,
              email: `${orgRole.toLowerCase()}@alpha.com`,
              firstName: "Test",
              lastName: "User",
              role: orgRole,
              platformRole: "NONE",
              createdAt: new Date(),
            },
            sessionId: "sess_x",
            isDevScaffold: false,
          },
        } as unknown as Request;

        const principal = platformAuthService.getPlatformPrincipal(customerReq);
        expect(principal.isPlatformAdmin).toBe(false);
        expect(principal.platformRole).toBe("NONE");

        const caps = platformAuthService.getCapabilities(customerReq);
        expect(caps.isPlatformAdmin).toBe(false);
        expect(caps.canManagePlatformWhatsApp).toBe(false);
        expect(caps.canManageAllOrganizations).toBe(false);
        expect(caps.canAssignBusinesses).toBe(false);

        const next = vi.fn();
        expect(() => {
          platformAuthService.requireMasterAdmin(customerReq, {} as any, next);
        }).toThrowError(/Platform Master Administrator authorization required/i);
        expect(next).not.toHaveBeenCalled();
      }
    });

    it("ensures DELEGATED_ADMIN is denied global platform admin in Phase 9B", () => {
      const delegatedReq = {
        headers: {},
        context: {
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_delegated_1",
          user: {
            id: "usr_delegated_1",
            organizationId: CUSTOMER_ORG_1,
            email: "delegated@agency.com",
            firstName: "Dan",
            lastName: "Delegated",
            role: "ADMIN",
            platformRole: "DELEGATED_ADMIN",
            createdAt: new Date(),
          },
          sessionId: "sess_del",
          isDevScaffold: false,
        },
      } as unknown as Request;

      const principal = platformAuthService.getPlatformPrincipal(delegatedReq);
      expect(principal.isPlatformAdmin).toBe(false);
      expect(principal.platformRole).toBe("DELEGATED_ADMIN");

      const caps = platformAuthService.getCapabilities(delegatedReq);
      expect(caps.isPlatformAdmin).toBe(false);
      expect(caps.canManageAllOrganizations).toBe(false);

      const next = vi.fn();
      expect(() => {
        platformAuthService.requireMasterAdmin(delegatedReq, {} as any, next);
      }).toThrowError(/Platform Master Administrator authorization required/i);
      expect(next).not.toHaveBeenCalled();
    });

    it("grants full Master Admin capabilities to authenticated session with PLATFORM_MASTER_ADMIN", () => {
      const masterReq = {
        headers: {},
        context: {
          organizationId: "cmv7xnkn20000t818segbx7xq",
          userId: "usr_master_1",
          user: {
            id: "usr_master_1",
            organizationId: "cmv7xnkn20000t818segbx7xq",
            email: "operator@grovastra.com",
            firstName: "Master",
            lastName: "Operator",
            role: "OWNER",
            platformRole: "PLATFORM_MASTER_ADMIN",
            createdAt: new Date(),
          },
          sessionId: "sess_master",
          isDevScaffold: false,
        },
      } as unknown as Request;

      const principal = platformAuthService.getPlatformPrincipal(masterReq);
      expect(principal.isPlatformAdmin).toBe(true);
      expect(principal.platformRole).toBe("PLATFORM_MASTER_ADMIN");
      expect(principal.assignedOrganizationIds).toEqual([]); // Global unrestricted

      const caps = platformAuthService.getCapabilities(masterReq);
      expect(caps.isPlatformAdmin).toBe(true);
      expect(caps.canManagePlatformWhatsApp).toBe(true);
      expect(caps.canManageAllOrganizations).toBe(true);
      expect(caps.canAssignBusinesses).toBe(true);

      const next = vi.fn();
      expect(() => {
        platformAuthService.requireMasterAdmin(masterReq, {} as any, next);
      }).not.toThrow();
      expect(next).toHaveBeenCalled();
    });
  });

  describe("4. Cross-Tenant Isolation Enforcement", () => {
    it("allows customer to access their own organization but rejects cross-tenant access with 403", () => {
      const customerReq = {
        headers: {},
        context: {
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_owner_1",
          user: { id: "usr_owner_1", role: "OWNER", platformRole: "NONE" },
        },
      } as unknown as Request;

      // Accessing own tenant: passes
      expect(() => {
        platformAuthService.assertOrganizationAccess(customerReq, CUSTOMER_ORG_1);
      }).not.toThrow();

      // Accessing foreign tenant: throws ForbiddenError
      expect(() => {
        platformAuthService.assertOrganizationAccess(customerReq, CUSTOMER_ORG_2);
      }).toThrowError(/Cross-tenant access forbidden/i);
    });

    it("allows Master Admin unrestricted access across all organizations", () => {
      const masterReq = {
        isPlatformAdmin: true,
        headers: {},
      } as unknown as Request;

      expect(() => {
        platformAuthService.assertOrganizationAccess(masterReq, CUSTOMER_ORG_1);
      }).not.toThrow();

      expect(() => {
        platformAuthService.assertOrganizationAccess(masterReq, CUSTOMER_ORG_2);
      }).not.toThrow();
    });
  });

  describe("5. Protected Master Admin Endpoints (/api/v1/admin/platform/overview)", () => {
    it("rejects unauthenticated callers with HTTP 403 Forbidden", async () => {
      const res = await request(app).get("/api/v1/admin/platform/overview");
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects caller with invalid platform secret with HTTP 403 Forbidden", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/overview")
        .set("x-platform-admin-secret", "wrong_secret");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("allows authorized Master Admin to access platform overview via verified secret", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/overview")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platformStatus).toBe("OPERATIONAL");
      expect(res.body.data.organizations).toBeDefined();
    });

    it("allows authorized Master Admin to access platform overview via authenticated session cookie", async () => {
      vi.spyOn(authService, "validateSession").mockResolvedValue({
        id: "sess_master_overview",
        userId: "usr_master_overview",
        organizationId: "org_groviews",
        organization: {
          id: "org_groviews",
          name: "Groviews",
          slug: "groviews-123",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "usr_master_overview",
          organizationId: "org_groviews",
          email: "balaji@gmail.com",
          firstName: "Balaji",
          lastName: null,
          role: "OWNER",
          platformRole: "PLATFORM_MASTER_ADMIN",
          createdAt: new Date(),
        },
        expiresAt: new Date(Date.now() + 60000),
        tokenHash: "token_hash",
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      } as any);

      const res = await request(app)
        .get("/api/v1/admin/platform/overview")
        .set("Cookie", ["grovastra_session=mock_master_token"]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.platformStatus).toBe("OPERATIONAL");
    });

    it("rejects ordinary customer session (platformRole NONE) from overview with 403 Forbidden", async () => {
      vi.spyOn(authService, "validateSession").mockResolvedValue({
        id: "sess_customer",
        userId: "usr_customer",
        organizationId: "org_customer",
        organization: {
          id: "org_customer",
          name: "Customer Org",
          slug: "cust-123",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "usr_customer",
          organizationId: "org_customer",
          email: "cust@gmail.com",
          firstName: "Customer",
          lastName: null,
          role: "OWNER",
          platformRole: "NONE",
          createdAt: new Date(),
        },
        expiresAt: new Date(Date.now() + 60000),
        tokenHash: "token_hash",
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      } as any);

      const res = await request(app)
        .get("/api/v1/admin/platform/overview")
        .set("Cookie", ["grovastra_session=mock_customer_token"]);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });
  });

  describe("6. Platform Capabilities Endpoint (/api/v1/admin/platform/capabilities)", () => {
    it("returns isPlatformAdmin: true for authenticated Master Admin session", async () => {
      vi.spyOn(authService, "validateSession").mockResolvedValue({
        id: "sess_master",
        userId: "usr_master",
        organizationId: "org_groviews",
        organization: {
          id: "org_groviews",
          name: "Groviews",
          slug: "groviews-123",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "usr_master",
          organizationId: "org_groviews",
          email: "balaji@gmail.com",
          firstName: "Balaji",
          lastName: null,
          role: "OWNER",
          platformRole: "PLATFORM_MASTER_ADMIN",
          createdAt: new Date(),
        },
        expiresAt: new Date(Date.now() + 60000),
        tokenHash: "hash",
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      } as any);

      const res = await request(app)
        .get("/api/v1/admin/platform/capabilities")
        .set("Cookie", ["grovastra_session=mock_master_token"]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isPlatformAdmin).toBe(true);
      expect(res.body.data.platformRole).toBe("PLATFORM_MASTER_ADMIN");
      expect(res.body.data.canManagePlatformWhatsApp).toBe(true);
      expect(res.body.data.canManageAllOrganizations).toBe(true);
      expect(res.body.data.canAssignBusinesses).toBe(true);
    });

    it("returns isPlatformAdmin: false for ordinary customer session", async () => {
      vi.spyOn(authService, "validateSession").mockResolvedValue({
        id: "sess_customer",
        userId: "usr_customer",
        organizationId: "org_cust",
        organization: {
          id: "org_cust",
          name: "Cust",
          slug: "cust-1",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "usr_customer",
          organizationId: "org_cust",
          email: "cust@gmail.com",
          firstName: "Cust",
          lastName: null,
          role: "OWNER",
          platformRole: "NONE",
          createdAt: new Date(),
        },
        expiresAt: new Date(Date.now() + 60000),
        tokenHash: "hash",
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      } as any);

      const res = await request(app)
        .get("/api/v1/admin/platform/capabilities")
        .set("Cookie", ["grovastra_session=mock_customer_token"]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isPlatformAdmin).toBe(false);
      expect(res.body.data.platformRole).toBe("NONE");
      expect(res.body.data.canManagePlatformWhatsApp).toBe(false);
      expect(res.body.data.canManageAllOrganizations).toBe(false);
    });

    it("returns isPlatformAdmin: false for DELEGATED_ADMIN in Phase 9B", async () => {
      vi.spyOn(authService, "validateSession").mockResolvedValue({
        id: "sess_delegated",
        userId: "usr_delegated",
        organizationId: "org_del",
        organization: {
          id: "org_del",
          name: "Del",
          slug: "del-1",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "usr_delegated",
          organizationId: "org_del",
          email: "delegated@agency.com",
          firstName: "Delegated",
          lastName: null,
          role: "OWNER",
          platformRole: "DELEGATED_ADMIN",
          createdAt: new Date(),
        },
        expiresAt: new Date(Date.now() + 60000),
        tokenHash: "hash",
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      } as any);

      const res = await request(app)
        .get("/api/v1/admin/platform/capabilities")
        .set("Cookie", ["grovastra_session=mock_delegated_token"]);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isPlatformAdmin).toBe(false);
      expect(res.body.data.platformRole).toBe("DELEGATED_ADMIN");
      expect(res.body.data.canManagePlatformWhatsApp).toBe(false);
      expect(res.body.data.canManageAllOrganizations).toBe(false);
    });

    it("returns isPlatformAdmin: false for unauthenticated caller", async () => {
      const res = await request(app).get("/api/v1/admin/platform/capabilities");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.isPlatformAdmin).toBe(false);
      expect(res.body.data.platformRole).toBe("NONE");
    });
  });

  describe("7. Platform WhatsApp Route Protection", () => {
    it("rejects unauthorized access to /api/v1/admin/platform/whatsapp/status with HTTP 403", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/whatsapp/status");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });

    it("rejects invalid secret attempt with HTTP 403", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/whatsapp/status")
        .set("x-platform-admin-secret", "completely_wrong_secret");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });
});
