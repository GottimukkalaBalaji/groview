import { describe, it, expect, vi, beforeEach } from "vitest";
import { Request, Response, NextFunction } from "express";
import {
  stripInjectedOrgId,
  tenantContextMiddleware,
  optionalTenantContextMiddleware,
} from "../middleware/tenantContext.js";
import { authService } from "../services/auth.service.js";

describe("Tenant Context Middleware & Organization Injection Protection", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("stripInjectedOrgId helper", () => {
    it("deletes organizationId from req.body and req.query when present", () => {
      const mockReq = {
        body: { organizationId: "injected_org_123", name: "Campaign Alpha" },
        query: { organizationId: "injected_org_456", search: "test" },
      } as unknown as Request;

      stripInjectedOrgId(mockReq);

      expect((mockReq.body as any).organizationId).toBeUndefined();
      expect((mockReq.body as any).name).toBe("Campaign Alpha");
      expect((mockReq.query as any).organizationId).toBeUndefined();
      expect((mockReq.query as any).search).toBe("test");
    });
  });

  describe("tenantContextMiddleware (Customer Tenant Protection)", () => {
    it("strictly strips organizationId from req.body to prevent customer tenant impersonation", async () => {
      const mockReq = {
        body: { organizationId: "attacker_org_target", message: "Hello" },
        query: {},
        cookies: {},
        headers: {},
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = vi.fn() as NextFunction;

      // Mock session validation for a valid customer user
      vi.spyOn(authService, "validateSession").mockResolvedValueOnce({
        id: "session_1",
        userId: "user_customer_1",
        organizationId: "legitimate_org_alpha",
        organization: {
          id: "legitimate_org_alpha",
          name: "Alpha Retailers",
          slug: "alpha-retailers",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "user_customer_1",
          email: "user@alpha.com",
          firstName: "Alice",
          lastName: "Smith",
          role: "ADMIN",
          platformRole: "NONE",
        },
      } as any);

      (mockReq.cookies as any)["grovastra_session"] = "valid_session_token";

      await tenantContextMiddleware(mockReq, mockRes, next);

      // Verify organizationId was stripped from body
      expect((mockReq.body as any).organizationId).toBeUndefined();
      expect((mockReq.body as any).message).toBe("Hello");
      // Verify req.context has the legitimate server-side organizationId
      expect(mockReq.context?.organizationId).toBe("legitimate_org_alpha");
      expect(next).toHaveBeenCalledWith();
    });

    it("ignores x-scoped-organization-id header for regular customer users and locks to session organization", async () => {
      const mockReq = {
        body: {},
        query: {},
        cookies: { grovastra_session: "customer_session" },
        headers: { "x-scoped-organization-id": "target_victim_org_999" },
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = vi.fn() as NextFunction;

      vi.spyOn(authService, "validateSession").mockResolvedValueOnce({
        id: "session_cust",
        userId: "user_cust_1",
        organizationId: "own_customer_org_123",
        organization: {
          id: "own_customer_org_123",
          name: "Own Bakery",
          slug: "own-bakery",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "user_cust_1",
          email: "owner@bakery.com",
          firstName: "Bob",
          lastName: "Baker",
          role: "OWNER",
          platformRole: "NONE",
        },
      } as any);

      await tenantContextMiddleware(mockReq, mockRes, next);

      // Customer is strictly constrained to their own session organization
      expect(mockReq.context?.organizationId).toBe("own_customer_org_123");
      expect(mockReq.context?.organizationName).toBe("Own Bakery");
      expect(next).toHaveBeenCalledWith();
    });

    it("allows DELEGATED_ADMIN to access actively assigned organization via x-scoped-organization-id", async () => {
      const mockReq = {
        body: {},
        query: {},
        cookies: { grovastra_session: "delegated_admin_session" },
        headers: { "x-scoped-organization-id": "assigned_customer_org_1" },
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = vi.fn() as NextFunction;

      vi.spyOn(authService, "validateSession").mockResolvedValueOnce({
        id: "session_del",
        userId: "admin_1",
        organizationId: "agency_container_1",
        organization: {
          id: "agency_container_1",
          name: "Admin 1's Agency",
          slug: "admin-1-agency",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "admin_1",
          email: "admin1@gmail.com",
          firstName: "Admin",
          lastName: "One",
          role: "ADMIN",
          platformRole: "DELEGATED_ADMIN",
        },
      } as any);

      const { platformAuthService } = await import("../services/platformAuth.service.js");
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([
        "assigned_customer_org_1",
        "assigned_customer_org_2",
      ]);

      const { getPrismaClient } = await import("../config/prisma.js");
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: "assigned_customer_org_1",
        name: "Grovastra Demo Business",
        slug: "grovastra-demo-business",
        isArchived: false,
        deletedAt: null,
        users: [{ platformRole: "NONE" }],
      } as any);

      await tenantContextMiddleware(mockReq, mockRes, next);

      expect(mockReq.context?.organizationId).toBe("assigned_customer_org_1");
      expect(mockReq.context?.organizationName).toBe("Grovastra Demo Business");
      expect(mockReq.context?.assignedOrganizationIds).toEqual([
        "assigned_customer_org_1",
        "assigned_customer_org_2",
      ]);
      expect(next).toHaveBeenCalledWith();
    });

    it("rejects DELEGATED_ADMIN with HTTP 403 when x-scoped-organization-id is missing", async () => {
      const mockReq = {
        body: {},
        query: {},
        cookies: { grovastra_session: "delegated_admin_session" },
        headers: {}, // No header supplied
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = vi.fn() as NextFunction;

      vi.spyOn(authService, "validateSession").mockResolvedValueOnce({
        id: "session_del",
        userId: "admin_1",
        organizationId: "agency_container_1",
        organization: {
          id: "agency_container_1",
          name: "Admin 1's Agency",
          slug: "admin-1-agency",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "admin_1",
          email: "admin1@gmail.com",
          firstName: "Admin",
          lastName: "One",
          role: "ADMIN",
          platformRole: "DELEGATED_ADMIN",
        },
      } as any);

      const { platformAuthService } = await import("../services/platformAuth.service.js");
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([
        "assigned_customer_org_1",
      ]);

      await tenantContextMiddleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining("No target business selected"),
        })
      );
    });

    it("rejects DELEGATED_ADMIN with HTTP 403 when target organization is unassigned", async () => {
      const mockReq = {
        body: {},
        query: {},
        cookies: { grovastra_session: "delegated_admin_session" },
        headers: { "x-scoped-organization-id": "unassigned_other_org" },
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = vi.fn() as NextFunction;

      vi.spyOn(authService, "validateSession").mockResolvedValueOnce({
        id: "session_del",
        userId: "admin_1",
        organizationId: "agency_container_1",
        organization: {
          id: "agency_container_1",
          name: "Admin 1's Agency",
          slug: "admin-1-agency",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "admin_1",
          email: "admin1@gmail.com",
          firstName: "Admin",
          lastName: "One",
          role: "ADMIN",
          platformRole: "DELEGATED_ADMIN",
        },
      } as any);

      const { platformAuthService } = await import("../services/platformAuth.service.js");
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([
        "assigned_customer_org_1",
      ]);

      await tenantContextMiddleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining("Access denied: Organization is not assigned"),
        })
      );
    });

    it("rejects DELEGATED_ADMIN with HTTP 403 when target organization is archived or deleted", async () => {
      const mockReq = {
        body: {},
        query: {},
        cookies: { grovastra_session: "delegated_admin_session" },
        headers: { "x-scoped-organization-id": "archived_customer_org" },
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = vi.fn() as NextFunction;

      vi.spyOn(authService, "validateSession").mockResolvedValueOnce({
        id: "session_del",
        userId: "admin_1",
        organizationId: "agency_container_1",
        organization: {
          id: "agency_container_1",
          name: "Admin 1's Agency",
          slug: "admin-1-agency",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "admin_1",
          email: "admin1@gmail.com",
          firstName: "Admin",
          lastName: "One",
          role: "ADMIN",
          platformRole: "DELEGATED_ADMIN",
        },
      } as any);

      const { platformAuthService } = await import("../services/platformAuth.service.js");
      // Even if database has lingering record in array, findUnique reveals it is archived
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([
        "archived_customer_org",
      ]);

      const { getPrismaClient } = await import("../config/prisma.js");
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: "archived_customer_org",
        name: "Archived Org",
        slug: "archived-org",
        isArchived: true,
        deletedAt: null,
        users: [],
      } as any);

      await tenantContextMiddleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining("Access denied: Target organization is inactive, archived, or not found"),
        })
      );
    });

    it("rejects DELEGATED_ADMIN with HTTP 403 when target organization is an agency container", async () => {
      const mockReq = {
        body: {},
        query: {},
        cookies: { grovastra_session: "delegated_admin_session" },
        headers: { "x-scoped-organization-id": "other_agency_container" },
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = vi.fn() as NextFunction;

      vi.spyOn(authService, "validateSession").mockResolvedValueOnce({
        id: "session_del",
        userId: "admin_1",
        organizationId: "agency_container_1",
        organization: {
          id: "agency_container_1",
          name: "Admin 1's Agency",
          slug: "admin-1-agency",
          isArchived: false,
          deletedAt: null,
        },
        user: {
          id: "admin_1",
          email: "admin1@gmail.com",
          firstName: "Admin",
          lastName: "One",
          role: "ADMIN",
          platformRole: "DELEGATED_ADMIN",
        },
      } as any);

      const { platformAuthService } = await import("../services/platformAuth.service.js");
      vi.spyOn(platformAuthService, "resolveAssignedOrganizationIds").mockResolvedValueOnce([
        "other_agency_container",
      ]);

      const { getPrismaClient } = await import("../config/prisma.js");
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: "other_agency_container",
        name: "Admin 2's Agency",
        slug: "admin-2-agency",
        isArchived: false,
        deletedAt: null,
        users: [{ platformRole: "DELEGATED_ADMIN" }],
      } as any);

      await tenantContextMiddleware(mockReq, mockRes, next);

      expect(next).toHaveBeenCalledWith(
        expect.objectContaining({
          statusCode: 403,
          message: expect.stringContaining("Internal agency containers cannot be operated as customer businesses"),
        })
      );
    });
  });

  describe("optionalTenantContextMiddleware (Platform Admin Preservation)", () => {
    it("preserves req.body.organizationId so Master Admin can supply target organizationId for business assignments", async () => {
      const mockReq = {
        body: {
          organizationId: "target_customer_org_456",
          userId: "delegated_admin_user_789",
        },
        query: {},
        cookies: {},
        headers: {},
      } as unknown as Request;
      const mockRes = {} as Response;
      const next = vi.fn() as NextFunction;

      // Even when session is extracted or missing, organizationId must NOT be deleted
      await optionalTenantContextMiddleware(mockReq, mockRes, next);

      expect((mockReq.body as any).organizationId).toBe("target_customer_org_456");
      expect((mockReq.body as any).userId).toBe("delegated_admin_user_789");
      expect(next).toHaveBeenCalledWith();
    });
  });
});
