import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { platformAuthService } from "../services/platformAuth.service.js";
import { businessAssignmentService } from "../services/businessAssignment.service.js";
import { getPrismaClient } from "../config/prisma.js";
import { Request } from "express";

const TEST_SECRET = "test_platform_admin_secret_super_secure_key_123456";
const CUSTOMER_ORG_1 = "org_customer_alpha";
const CUSTOMER_ORG_2 = "org_customer_beta";
const CUSTOMER_ORG_3 = "org_customer_gamma";

describe("Step 4 — Business Assignment Management & Delegated Admin Scoping", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("1. Master Admin & Customer Role Authorization", () => {
    it("allows PLATFORM_MASTER_ADMIN via valid platform secret to access assignments endpoints", async () => {
      vi.spyOn(businessAssignmentService, "getAssignments").mockResolvedValueOnce({
        assignments: [],
        pagination: { total: 0, page: 1, limit: 10, totalPages: 0 },
        tableDeployed: true,
      });

      const res = await request(app)
        .get("/api/v1/admin/platform/assignments")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.assignments).toEqual([]);
    });

    it("rejects unauthenticated callers with HTTP 403 Forbidden", async () => {
      const res = await request(app).get("/api/v1/admin/platform/assignments");
      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("rejects customer tenant users (OWNER, ADMIN, MEMBER) from platform assignments endpoints with HTTP 403 Forbidden", async () => {
      // In isolated test runner, default test user is OWNER with platformRole: NONE
      const res = await request(app)
        .get("/api/v1/admin/platform/assignments")
        .set("x-test-org-id", CUSTOMER_ORG_1);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Platform Master Administrator authorization required/i);
    });

    it("rejects DELEGATED_ADMIN from managing assignments (create/revoke) with HTTP 403 Forbidden", () => {
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

      const next = vi.fn();
      expect(() => {
        platformAuthService.requireMasterAdmin(delegatedReq, {} as any, next);
      }).toThrowError(/Platform Master Administrator authorization required/i);
      expect(next).not.toHaveBeenCalled();
    });
  });

  describe("2. Delegated Admin Dynamic Scoping & Fail-Closed Enforcement", () => {
    it("fails closed to empty scope ([]) if delegated admin has no database assignments", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.businessAssignment, "findMany").mockResolvedValueOnce([]);

      const resolved = await platformAuthService.resolveAssignedOrganizationIds("usr_delegated_unassigned");
      expect(resolved).toEqual([]);
    });

    it("fails closed to empty scope ([]) if business_assignments table does not exist (P2021)", async () => {
      const prisma = getPrismaClient();
      const p2021Error = new Error("The table public.business_assignments does not exist");
      (p2021Error as any).code = "P2021";
      vi.spyOn(prisma.businessAssignment, "findMany").mockRejectedValueOnce(p2021Error);

      const resolved = await platformAuthService.resolveAssignedOrganizationIds("usr_delegated_1");
      expect(resolved).toEqual([]);
    });

    it("resolves active assigned organizations from database records", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.businessAssignment, "findMany").mockResolvedValueOnce([
        { organizationId: CUSTOMER_ORG_1 },
        { organizationId: CUSTOMER_ORG_2 },
      ] as any);

      const resolved = await platformAuthService.resolveAssignedOrganizationIds("usr_delegated_1");
      expect(resolved).toEqual([CUSTOMER_ORG_1, CUSTOMER_ORG_2]);
    });

    it("assertOrganizationAccess allows delegated admin access to assigned organization", () => {
      const delegatedReq = {
        headers: {},
        context: {
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_delegated_1",
          user: {
            id: "usr_delegated_1",
            role: "ADMIN",
            platformRole: "DELEGATED_ADMIN",
          },
          assignedOrganizationIds: [CUSTOMER_ORG_1, CUSTOMER_ORG_2],
        },
      } as unknown as Request;

      expect(() => {
        platformAuthService.assertOrganizationAccess(delegatedReq, CUSTOMER_ORG_1);
      }).not.toThrow();

      expect(() => {
        platformAuthService.assertOrganizationAccess(delegatedReq, CUSTOMER_ORG_2);
      }).not.toThrow();
    });

    it("assertOrganizationAccess denies delegated admin access to unassigned or revoked organization", () => {
      const delegatedReq = {
        headers: {},
        context: {
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_delegated_1",
          user: {
            id: "usr_delegated_1",
            role: "ADMIN",
            platformRole: "DELEGATED_ADMIN",
          },
          assignedOrganizationIds: [CUSTOMER_ORG_1], // Only ORG_1 assigned
        },
      } as unknown as Request;

      expect(() => {
        platformAuthService.assertOrganizationAccess(delegatedReq, CUSTOMER_ORG_3);
      }).toThrowError(/Organization is not assigned to this delegated administrator/i);
    });

    it("assertOrganizationAccess denies delegated admin access if assignedOrganizationIds is empty", () => {
      const delegatedReq = {
        headers: {},
        context: {
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_delegated_1",
          user: {
            id: "usr_delegated_1",
            role: "ADMIN",
            platformRole: "DELEGATED_ADMIN",
          },
          assignedOrganizationIds: [], // Empty (unassigned or unmigrated)
        },
      } as unknown as Request;

      expect(() => {
        platformAuthService.assertOrganizationAccess(delegatedReq, CUSTOMER_ORG_1);
      }).toThrowError(/Organization is not assigned to this delegated administrator/i);
    });
  });

  describe("3. Business Assignment Service Business Rules & Validation", () => {
    it("rejects assignment if target organization does not exist", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce(null);

      await expect(
        businessAssignmentService.createAssignment({
          organizationId: "org_nonexistent",
          userId: "usr_delegated_1",
        })
      ).rejects.toThrowError(/not found/i);
    });

    it("rejects assignment if target organization is archived", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: CUSTOMER_ORG_1,
        name: "Archived Org",
        isArchived: true,
        deletedAt: new Date(),
      } as any);

      await expect(
        businessAssignmentService.createAssignment({
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_delegated_1",
        })
      ).rejects.toThrowError(/Cannot assign archived or suspended organization/i);
    });

    it("rejects assignment if target user does not exist", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: CUSTOMER_ORG_1,
        name: "Active Org",
        isArchived: false,
        deletedAt: null,
      } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce(null);

      await expect(
        businessAssignmentService.createAssignment({
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_nonexistent",
        })
      ).rejects.toThrowError(/User 'usr_nonexistent' not found/i);
    });

    it("rejects assignment if target user does NOT hold the DELEGATED_ADMIN platform role", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: CUSTOMER_ORG_1,
        name: "Active Org",
        isArchived: false,
        deletedAt: null,
      } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_regular_customer",
        email: "customer@example.com",
        firstName: "Charlie",
        lastName: "Customer",
        platformRole: "NONE", // Regular customer!
      } as any);

      await expect(
        businessAssignmentService.createAssignment({
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_regular_customer",
        })
      ).rejects.toThrowError(/Only users with DELEGATED_ADMIN platform role are eligible/i);
    });

    it("rejects duplicate active assignment on the same organization with ConflictError (409)", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: CUSTOMER_ORG_1,
        name: "Active Org",
        isArchived: false,
        deletedAt: null,
      } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_delegated_2",
        email: "delegated2@agency.com",
        firstName: "Danielle",
        lastName: "Delegated",
        platformRole: "DELEGATED_ADMIN",
      } as any);

      vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback: any) => {
        const txMock = {
          businessAssignment: {
            findFirst: vi.fn().mockResolvedValueOnce({
              id: "asgn_existing_1",
              userId: "usr_delegated_1",
              user: { email: "delegated1@agency.com", firstName: "Dan" },
            }),
          },
        };
        return callback(txMock);
      });

      await expect(
        businessAssignmentService.createAssignment({
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_delegated_2",
        })
      ).rejects.toThrowError(/already has an active delegated administrator assignment/i);
    });

    it("creates assignment successfully and returns populated details", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: CUSTOMER_ORG_1,
        name: "Active Org",
        isArchived: false,
        deletedAt: null,
      } as any);
      vi.spyOn(prisma.user, "findUnique").mockResolvedValueOnce({
        id: "usr_delegated_1",
        email: "delegated@agency.com",
        firstName: "Dan",
        lastName: "Delegated",
        platformRole: "DELEGATED_ADMIN",
      } as any);

      const mockCreated = {
        id: "asgn_new_123",
        organizationId: CUSTOMER_ORG_1,
        userId: "usr_delegated_1",
        assignedById: "usr_master_1",
        status: "ACTIVE",
        assignedAt: new Date(),
        revokedAt: null,
        assignmentReason: "Q4 marketing oversight",
        revocationReason: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: { id: CUSTOMER_ORG_1, name: "Active Org", slug: "active-org", isArchived: false },
        user: { id: "usr_delegated_1", email: "delegated@agency.com", firstName: "Dan", lastName: "Delegated", platformRole: "DELEGATED_ADMIN" },
        assignedBy: { id: "usr_master_1", email: "master@grovastra.com", firstName: "Master", lastName: "Admin" },
      };

      vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback: any) => {
        const txMock = {
          businessAssignment: {
            findFirst: vi.fn().mockResolvedValueOnce(null), // No collision
            create: vi.fn().mockResolvedValueOnce(mockCreated),
          },
        };
        return callback(txMock);
      });

      const result = await businessAssignmentService.createAssignment({
        organizationId: CUSTOMER_ORG_1,
        userId: "usr_delegated_1",
        assignedById: "usr_master_1",
        assignmentReason: "Q4 marketing oversight",
      });

      expect(result.id).toBe("asgn_new_123");
      expect(result.status).toBe("ACTIVE");
      expect(result.organization.name).toBe("Active Org");
      expect(result.user.email).toBe("delegated@agency.com");
    });

    it("revokes an active assignment and sets status to REVOKED with revocationReason", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.businessAssignment, "findUnique").mockResolvedValueOnce({
        id: "asgn_active_1",
        status: "ACTIVE",
        organization: { id: CUSTOMER_ORG_1, name: "Active Org" },
        user: { id: "usr_delegated_1", email: "delegated@agency.com" },
      } as any);

      const mockUpdated = {
        id: "asgn_active_1",
        organizationId: CUSTOMER_ORG_1,
        userId: "usr_delegated_1",
        assignedById: "usr_master_1",
        status: "REVOKED",
        assignedAt: new Date(),
        revokedAt: new Date(),
        assignmentReason: "Q4 marketing",
        revocationReason: "Contract concluded",
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
        organization: { id: CUSTOMER_ORG_1, name: "Active Org", slug: "active-org", isArchived: false },
        user: { id: "usr_delegated_1", email: "delegated@agency.com", firstName: "Dan", lastName: "Delegated", platformRole: "DELEGATED_ADMIN" },
        assignedBy: { id: "usr_master_1", email: "master@grovastra.com", firstName: "Master", lastName: "Admin" },
      };

      vi.spyOn(prisma.businessAssignment, "update").mockResolvedValueOnce(mockUpdated as any);

      const result = await businessAssignmentService.revokeAssignment("asgn_active_1", {
        revokedById: "usr_master_1",
        revocationReason: "Contract concluded",
      });

      expect(result.status).toBe("REVOKED");
      expect(result.revocationReason).toBe("Contract concluded");
    });

    it("rejects revoking an already revoked assignment with BadRequestError (400)", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.businessAssignment, "findUnique").mockResolvedValueOnce({
        id: "asgn_already_revoked",
        status: "REVOKED",
        organization: { id: CUSTOMER_ORG_1, name: "Active Org" },
        user: { id: "usr_delegated_1", email: "delegated@agency.com" },
      } as any);

      await expect(
        businessAssignmentService.revokeAssignment("asgn_already_revoked", {})
      ).rejects.toThrowError(/Business assignment is already revoked/i);
    });
  });

  describe("4. Endpoints: /my-assigned-organizations", () => {
    it("returns all active organizations for PLATFORM_MASTER_ADMIN", async () => {
      vi.spyOn(businessAssignmentService, "getMyAssignedOrganizations").mockResolvedValueOnce([
        { id: CUSTOMER_ORG_1, name: "Org Alpha", slug: "org-alpha" },
        { id: CUSTOMER_ORG_2, name: "Org Beta", slug: "org-beta" },
      ]);

      const res = await request(app)
        .get("/api/v1/admin/platform/assignments/my-assigned-organizations")
        .set("x-platform-admin-secret", TEST_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);
    });

    it("denies regular customer user from /my-assigned-organizations with HTTP 403", async () => {
      const { authService } = await import("../services/auth.service.js");
      vi.spyOn(authService, "validateSession").mockResolvedValueOnce({
        id: "sess_customer",
        userId: "usr_owner_1",
        organizationId: CUSTOMER_ORG_1,
        user: {
          id: "usr_owner_1",
          organizationId: CUSTOMER_ORG_1,
          email: "customer@company.com",
          firstName: "Chris",
          lastName: "Customer",
          role: "OWNER",
          platformRole: "NONE",
          createdAt: new Date(),
        },
        organization: {
          id: CUSTOMER_ORG_1,
          name: "Customer Org",
          slug: "customer-org",
          isArchived: false,
          deletedAt: null,
        },
      } as any);

      const res = await request(app)
        .get("/api/v1/admin/platform/assignments/my-assigned-organizations")
        .set("Authorization", "Bearer valid_customer_session_token");

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Platform administrator authorization required/i);
    });
  });

  describe("5. Phase A1.4: Safe Agency Container Exclusion & Request Validation", () => {
    it("returns structured 422 response with validation details when request body is empty or missing organizationId/userId", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/assignments")
        .set("x-platform-admin-secret", TEST_SECRET)
        .send({});

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.message).toBe("Validation failed");
      expect(Array.isArray(res.body.error.details)).toBe(true);

      const fields = res.body.error.details.map((d: any) => d.field);
      expect(fields).toContain("organizationId");
      expect(fields).toContain("userId");
    });

    it("returns structured 422 response when organizationId is empty string", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/assignments")
        .set("x-platform-admin-secret", TEST_SECRET)
        .send({
          organizationId: "",
          userId: "usr_del_123",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details.some((d: any) => d.field === "organizationId")).toBe(true);
    });

    it("preserves organizationId across Express middleware pipeline and creates assignment when valid payload is submitted", async () => {
      const mockCreatedAssignment = {
        id: "asgn_new_123",
        organizationId: CUSTOMER_ORG_1,
        organization: { id: CUSTOMER_ORG_1, name: "Customer Alpha", slug: "customer-alpha", isArchived: false },
        userId: "usr_del_123",
        user: { id: "usr_del_123", email: "del@agency.com", firstName: "Del", lastName: "Admin", platformRole: "DELEGATED_ADMIN" },
        assignedById: null,
        assignedBy: null,
        status: "ACTIVE" as const,
        assignedAt: new Date(),
        revokedAt: null,
        assignmentReason: "New account management",
        revocationReason: null,
        metadata: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const createSpy = vi
        .spyOn(businessAssignmentService, "createAssignment")
        .mockResolvedValueOnce(mockCreatedAssignment);

      const res = await request(app)
        .post("/api/v1/admin/platform/assignments")
        .set("x-platform-admin-secret", TEST_SECRET)
        .send({
          organizationId: CUSTOMER_ORG_1,
          userId: "usr_del_123",
          assignmentReason: "New account management",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe("asgn_new_123");
      expect(res.body.data.organizationId).toBe(CUSTOMER_ORG_1);
      expect(createSpy).toHaveBeenCalledWith({
        organizationId: CUSTOMER_ORG_1,
        userId: "usr_del_123",
        assignmentReason: "New account management",
        assignedById: null,
      });
    });

    it("returns structured 422 response on revoke assignment with invalid body payload", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/assignments/asgn_1/revoke")
        .set("x-platform-admin-secret", TEST_SECRET)
        .send({
          revocationReason: "x".repeat(501),
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(res.body.error.details[0].field).toBe("revocationReason");
    });

    it("rejects assigning an internal agency container directly hosting DELEGATED_ADMIN with BadRequestError (400)", async () => {
      const prisma = getPrismaClient();

      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: "org_agency_container_1",
        name: "Partner Agency (Agency Container)",
        isArchived: false,
        deletedAt: null,
        users: [{ platformRole: "DELEGATED_ADMIN" }],
      } as any);

      await expect(
        businessAssignmentService.createAssignment({
          organizationId: "org_agency_container_1",
          userId: "usr_delegated_1",
        })
      ).rejects.toThrowError(/Cannot assign internal agency container organization/i);
    });

    it("ensures platformAdminService.getOrganizations enforces relation-based exclusion of DELEGATED_ADMIN containers", async () => {
      const { platformAdminService } = await import("../services/platformAdmin.service.js");
      const prisma = getPrismaClient();

      let capturedWhere: any = null;
      vi.spyOn(prisma.organization, "findMany").mockImplementation(async (args: any) => {
        capturedWhere = args?.where;
        return [
          {
            id: CUSTOMER_ORG_1,
            name: "Customer Alpha",
            slug: "customer-alpha",
            isArchived: false,
            deletedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
            _count: { users: 3 },
            metaAccount: null,
          },
        ] as any;
      });

      vi.spyOn(prisma.organization, "count").mockResolvedValue(1);

      const result = await platformAdminService.getOrganizations({
        status: "active",
        search: "alpha",
        page: 1,
        limit: 10,
      });

      expect(result.organizations.length).toBe(1);
      expect(result.organizations[0].name).toBe("Customer Alpha");

      // Verify that relation filter users: { none: { platformRole: "DELEGATED_ADMIN" } } was included
      expect(capturedWhere).toBeDefined();
      expect(capturedWhere.users).toEqual({
        none: {
          platformRole: "DELEGATED_ADMIN",
        },
      });
      expect(capturedWhere.isArchived).toBe(false);
      expect(capturedWhere.deletedAt).toBeNull();
      expect(capturedWhere.OR).toEqual([
        { name: { contains: "alpha", mode: "insensitive" } },
        { slug: { contains: "alpha", mode: "insensitive" } },
        { id: { contains: "alpha", mode: "insensitive" } },
      ]);
    });

    it("preserves archived organization filtering while maintaining agency container exclusion", async () => {
      const { platformAdminService } = await import("../services/platformAdmin.service.js");
      const prisma = getPrismaClient();

      let capturedWhere: any = null;
      vi.spyOn(prisma.organization, "findMany").mockImplementation(async (args: any) => {
        capturedWhere = args?.where;
        return [] as any;
      });
      vi.spyOn(prisma.organization, "count").mockResolvedValue(0);

      await platformAdminService.getOrganizations({
        status: "archived",
        search: "old",
      });

      expect(capturedWhere.users).toEqual({
        none: {
          platformRole: "DELEGATED_ADMIN",
        },
      });
      // Verify archived condition combined with search
      expect(capturedWhere.AND).toBeDefined();
      expect(capturedWhere.AND[0]).toEqual({
        OR: [{ isArchived: true }, { deletedAt: { not: null } }],
      });
    });
  });
});
