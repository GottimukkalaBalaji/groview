import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { getPrismaClient } from "../config/prisma.js";
import { authService } from "../services/auth.service.js";
import { platformAuthService } from "../services/platformAuth.service.js";
import { comparePassword } from "../utils/crypto.js";

const PLATFORM_ORG_ID = "cmv7xnkn20000t818segbx7xq";
const CUSTOMER_ORG_1 = "org_customer_alpha";

describe("Phase A1 — Master Admin Delegated Admin Account Creation & Management", () => {
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

  describe("1. POST /api/v1/admin/platform/admins (Creation)", () => {
    it("allows Master Admin to create a delegated admin with direct password choice", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.user, "findFirst").mockResolvedValueOnce(null); // No existing email

      const mockAgencyOrg = {
        id: "org_agency_123",
        name: "Dan Delegated's Agency",
        slug: "agency-a1b2c3d4",
      };

      const mockUser = {
        id: "usr_delegated_new",
        organizationId: mockAgencyOrg.id,
        email: "dan@agency.com",
        passwordHash: "$2a$12$someValidBcryptHashStringOverHere",
        firstName: "Dan",
        lastName: "Delegated",
        role: "ADMIN",
        platformRole: "DELEGATED_ADMIN",
        createdAt: new Date("2026-10-27T10:00:00Z"),
      };

      vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback: any) => {
        const txMock = {
          organization: {
            create: vi.fn().mockResolvedValueOnce(mockAgencyOrg),
          },
          user: {
            create: vi.fn().mockImplementationOnce(({ data }) => {
              expect(data.platformRole).toBe("DELEGATED_ADMIN");
              expect(data.email).toBe("dan@agency.com");
              expect(data.passwordHash).toMatch(/^\$2[aby]\$\d{2}\$/); // Valid bcrypt hash!
              return Promise.resolve({
                ...mockUser,
                passwordHash: data.passwordHash,
              });
            }),
          },
        };
        return callback(txMock);
      });

      const res = await request(app)
        .post("/api/v1/admin/platform/admins")
        .set("Cookie", cookie)
        .send({
          firstName: "Dan",
          lastName: "Delegated",
          email: "dan@agency.com",
          password: "SecurePassword123!",
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe("usr_delegated_new");
      expect(res.body.data.email).toBe("dan@agency.com");
      expect(res.body.data.firstName).toBe("Dan");
      expect(res.body.data.lastName).toBe("Delegated");
      expect(res.body.data.platformRole).toBe("DELEGATED_ADMIN");
      expect(res.body.data.organizationId).toBe("org_agency_123");
      expect(res.body.data.activeAssignmentsCount).toBe(0);

      // CRITICAL: Ensure passwordHash is NEVER leaked in response
      expect(res.body.data.passwordHash).toBeUndefined();
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("strictly server-enforces DELEGATED_ADMIN even if client attempts privilege escalation", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.user, "findFirst").mockResolvedValueOnce(null);

      let createdUserPayload: any = null;
      vi.spyOn(prisma, "$transaction").mockImplementationOnce(async (callback: any) => {
        const txMock = {
          organization: {
            create: vi.fn().mockResolvedValueOnce({
              id: "org_agency_safe",
              name: "Eve's Agency",
              slug: "agency-safe-slug",
            }),
          },
          user: {
            create: vi.fn().mockImplementationOnce(({ data }) => {
              createdUserPayload = data;
              return Promise.resolve({
                id: "usr_eve",
                ...data,
                createdAt: new Date(),
              });
            }),
          },
        };
        return callback(txMock);
      });

      const res = await request(app)
        .post("/api/v1/admin/platform/admins")
        .set("Cookie", cookie)
        .send({
          firstName: "Eve",
          email: "eve@agency.com",
          password: "StrongPassword123",
          platformRole: "PLATFORM_MASTER_ADMIN", // Malicious injection
          role: "OWNER",
          isPlatformAdmin: true,
        });

      expect(res.status).toBe(201);
      expect(createdUserPayload.platformRole).toBe("DELEGATED_ADMIN");
      expect(res.body.data.platformRole).toBe("DELEGATED_ADMIN");
    });

    it("denies regular customer user with HTTP 403 Forbidden", async () => {
      const customerCookie = mockSessionCookie({
        role: "OWNER",
        platformRole: "NONE",
      });

      const res = await request(app)
        .post("/api/v1/admin/platform/admins")
        .set("Cookie", customerCookie)
        .send({
          firstName: "Attacker",
          email: "attacker@example.com",
          password: "StrongPassword123",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Platform Master Administrator authorization required/i);
    });

    it("denies delegated admin from creating other admins with HTTP 403 Forbidden", async () => {
      const delegatedCookie = mockSessionCookie({
        role: "ADMIN",
        platformRole: "DELEGATED_ADMIN",
      });

      const res = await request(app)
        .post("/api/v1/admin/platform/admins")
        .set("Cookie", delegatedCookie)
        .send({
          firstName: "SubAdmin",
          email: "subadmin@example.com",
          password: "StrongPassword123",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/Platform Master Administrator authorization required/i);
    });

    it("rejects unauthenticated requests with HTTP 403/401", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/admins")
        .send({
          firstName: "Anon",
          email: "anon@example.com",
          password: "StrongPassword123",
        });

      expect([401, 403]).toContain(res.status);
      expect(res.body.success).toBe(false);
    });

    it("rejects duplicate email case-insensitively with HTTP 409 Conflict", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.user, "findFirst").mockResolvedValueOnce({
        id: "usr_existing_1",
        email: "existing@agency.com",
      } as any);

      const res = await request(app)
        .post("/api/v1/admin/platform/admins")
        .set("Cookie", cookie)
        .send({
          firstName: "Duplicate",
          email: "EXISTING@Agency.com", // Uppercase test
          password: "StrongPassword123",
        });

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toMatch(/An account with this email address already exists/i);
    });

    it("rejects weak password without numbers or uppercase with HTTP 422 Unprocessable Entity", async () => {
      const cookie = mockSessionCookie();

      const res = await request(app)
        .post("/api/v1/admin/platform/admins")
        .set("Cookie", cookie)
        .send({
          firstName: "WeakPass",
          email: "weakpass@agency.com",
          password: "lowercaseonly",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });

    it("rejects invalid email with HTTP 422 Unprocessable Entity", async () => {
      const cookie = mockSessionCookie();

      const res = await request(app)
        .post("/api/v1/admin/platform/admins")
        .set("Cookie", cookie)
        .send({
          firstName: "InvalidEmail",
          email: "not-an-email-address",
          password: "StrongPassword123",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
    });
  });

  describe("2. GET /api/v1/admin/platform/admins (Listing)", () => {
    it("returns delegated admins list with active assignment counts to Master Admin", async () => {
      const cookie = mockSessionCookie();
      const prisma = getPrismaClient();

      vi.spyOn(prisma.user, "findMany").mockResolvedValueOnce([
        {
          id: "usr_dan_1",
          email: "dan@agency.com",
          firstName: "Dan",
          lastName: "Delegated",
          platformRole: "DELEGATED_ADMIN",
          organizationId: "org_dan_agency",
          organization: { id: "org_dan_agency", name: "Dan's Agency", slug: "agency-dan" },
          createdAt: new Date("2026-10-25T12:00:00Z"),
          delegatedAssignments: [
            {
              id: "asgn_1",
              organizationId: "org_client_alpha",
              organization: { id: "org_client_alpha", name: "Client Alpha" },
            },
          ],
        },
        {
          id: "usr_jane_2",
          email: "jane@agency.com",
          firstName: "Jane",
          lastName: null,
          platformRole: "DELEGATED_ADMIN",
          organizationId: "org_jane_agency",
          organization: { id: "org_jane_agency", name: "Jane's Agency", slug: "agency-jane" },
          createdAt: new Date("2026-10-26T14:00:00Z"),
          delegatedAssignments: [], // Unassigned
        },
      ] as any);

      const res = await request(app)
        .get("/api/v1/admin/platform/admins")
        .set("Cookie", cookie);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.length).toBe(2);

      const dan = res.body.data[0];
      expect(dan.email).toBe("dan@agency.com");
      expect(dan.activeAssignmentsCount).toBe(1);
      expect(dan.assignedOrganizations).toEqual([{ id: "org_client_alpha", name: "Client Alpha" }]);

      const jane = res.body.data[1];
      expect(jane.email).toBe("jane@agency.com");
      expect(jane.activeAssignmentsCount).toBe(0);
      expect(jane.assignedOrganizations).toEqual([]);

      // Verify no password hash is returned in listing
      expect(JSON.stringify(res.body)).not.toContain("passwordHash");
    });

    it("denies regular customer user from listing delegated admins with HTTP 403", async () => {
      const customerCookie = mockSessionCookie({
        role: "OWNER",
        platformRole: "NONE",
      });

      const res = await request(app)
        .get("/api/v1/admin/platform/admins")
        .set("Cookie", customerCookie);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
    });
  });

  describe("3. Security & Isolation Invariants", () => {
    it("ensures created password can be verified via bcrypt comparePassword", async () => {
      const { hashPassword } = await import("../utils/crypto.js");
      const password = "ChosenSecret123!";
      const hash = await hashPassword(password);

      expect(await comparePassword(password, hash)).toBe(true);
      expect(await comparePassword("WrongPassword123!", hash)).toBe(false);
    });

    it("ensures an unassigned delegated admin fails closed when accessing unassigned customer organization", () => {
      const unassignedReq = {
        headers: {},
        context: {
          organizationId: "org_agency_isolated",
          userId: "usr_unassigned_admin",
          user: {
            id: "usr_unassigned_admin",
            organizationId: "org_agency_isolated",
            email: "unassigned@agency.com",
            firstName: "Unassigned",
            lastName: null,
            role: "ADMIN",
            platformRole: "DELEGATED_ADMIN",
            createdAt: new Date(),
          },
          sessionId: "sess_unassigned",
          isDevScaffold: false,
          assignedOrganizationIds: [], // Zero assignments!
        },
      } as unknown as any;

      expect(() => {
        platformAuthService.assertOrganizationAccess(unassignedReq, CUSTOMER_ORG_1);
      }).toThrowError(/Access denied: Organization is not assigned to this delegated administrator/i);
    });
  });
});
