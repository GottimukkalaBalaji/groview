import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { hashPassword, hashSessionToken } from "../utils/crypto.js";
import { clearRateLimitStore } from "../middleware/rateLimiter.js";
import { SESSION_COOKIE_NAME } from "../middleware/tenantContext.js";

interface MockOrg {
  id: string;
  name: string;
  slug: string;
  createdAt: Date;
  updatedAt: Date;
  isArchived: boolean;
  deletedAt: Date | null;
}

interface MockUser {
  id: string;
  organizationId: string;
  email: string;
  passwordHash: string;
  firstName: string;
  lastName: string | null;
  role: "OWNER" | "ADMIN" | "MEMBER";
  createdAt: Date;
  updatedAt: Date;
}

interface MockSession {
  id: string;
  userId: string;
  organizationId: string;
  tokenHash: string;
  expiresAt: Date;
  createdAt: Date;
  userAgent: string | null;
  ipAddress: string | null;
}

let mockOrgsStore: MockOrg[] = [];
let mockUsersStore: MockUser[] = [];
let mockSessionsStore: MockSession[] = [];

// Mock Prisma client with in-memory stores for isolated, fast, non-destructive automated testing
vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => {
      const client = {
        organization: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            const org: MockOrg = {
              id: `org_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              name: data.name,
              slug: data.slug,
              createdAt: new Date(),
              updatedAt: new Date(),
              isArchived: data.isArchived ?? false,
              deletedAt: data.deletedAt ?? null,
            };
            mockOrgsStore.push(org);
            return org;
          }),
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            return mockOrgsStore.find((o) => o.id === where.id) || null;
          }),
        },
        user: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            if (where.email) {
              const targetEmail =
                typeof where.email === "object" ? where.email.equals : where.email;
              const found = mockUsersStore.find(
                (u) => u.email.toLowerCase() === targetEmail.toLowerCase()
              );
              if (!found) return null;
              const org = mockOrgsStore.find((o) => o.id === found.organizationId);
              return { ...found, organization: org };
            }
            return null;
          }),
          create: vi.fn().mockImplementation(async ({ data }) => {
            const user: MockUser = {
              id: `usr_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              organizationId: data.organizationId,
              email: data.email,
              passwordHash: data.passwordHash,
              firstName: data.firstName,
              lastName: data.lastName || null,
              role: data.role || "OWNER",
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockUsersStore.push(user);
            return user;
          }),
        },
        session: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            const session: MockSession = {
              id: `sess_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
              userId: data.userId,
              organizationId: data.organizationId,
              tokenHash: data.tokenHash,
              expiresAt: data.expiresAt,
              createdAt: new Date(),
              userAgent: data.userAgent || null,
              ipAddress: data.ipAddress || null,
            };
            mockSessionsStore.push(session);
            return session;
          }),
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            const session = mockSessionsStore.find((s) => s.tokenHash === where.tokenHash);
            if (!session) return null;
            const user = mockUsersStore.find((u) => u.id === session.userId);
            const org = mockOrgsStore.find((o) => o.id === session.organizationId);
            return {
              ...session,
              user,
              organization: org,
            };
          }),
          delete: vi.fn().mockImplementation(async ({ where }) => {
            const index = mockSessionsStore.findIndex((s) => s.id === where.id);
            if (index !== -1) mockSessionsStore.splice(index, 1);
            return { count: 1 };
          }),
          deleteMany: vi.fn().mockImplementation(async ({ where }) => {
            const initial = mockSessionsStore.length;
            mockSessionsStore = mockSessionsStore.filter(
              (s) => s.tokenHash !== where.tokenHash
            );
            return { count: initial - mockSessionsStore.length };
          }),
        },
        campaign: {
          findMany: vi.fn().mockResolvedValue([]),
          count: vi.fn().mockResolvedValue(0),
          groupBy: vi.fn().mockResolvedValue([]),
        },
        $transaction: vi.fn().mockImplementation(async (callback) => {
          return callback(client);
        }),
      };
      return client;
    },
  };
});

let precomputedPasswordHash = "";

describe("Authentication & Tenant Isolation API (/api/v1/auth)", () => {
  beforeAll(async () => {
    precomputedPasswordHash = await hashPassword("ValidPass123");
  });

  beforeEach(() => {
    mockOrgsStore = [];
    mockUsersStore = [];
    mockSessionsStore = [];
    clearRateLimitStore();

    // Seed one existing organization and user for testing login & duplicates
    const existingOrg: MockOrg = {
      id: "org_existing_01",
      name: "Acme Corp",
      slug: "acme-corp-123456",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockOrgsStore.push(existingOrg);

    const existingUser: MockUser = {
      id: "usr_existing_01",
      organizationId: existingOrg.id,
      email: "existing@example.com",
      passwordHash: precomputedPasswordHash,
      firstName: "Existing",
      lastName: "Customer",
      role: "OWNER",
      createdAt: new Date(),
      updatedAt: new Date(),
    };
    mockUsersStore.push(existingUser);
  });

  describe("POST /api/v1/auth/signup", () => {
    it("should successfully register customer, provision organization, and set HttpOnly cookie", async () => {
      const response = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: "newcustomer@example.com",
          password: "SecurePassword1!",
          firstName: "John",
          lastName: "Doe",
          organizationName: "Nova Technologies",
        });

      expect(response.status).toBe(201);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user).toBeDefined();
      expect(response.body.data.user.email).toBe("newcustomer@example.com");
      expect(response.body.data.user.firstName).toBe("John");
      expect(response.body.data.user.role).toBe("OWNER");
      expect(response.body.data.organization).toBeDefined();
      expect(response.body.data.organization.name).toBe("Nova Technologies");

      // Verify password hash and token are NOT returned in JSON response
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(response.body.data.token).toBeUndefined();

      // Verify HttpOnly session cookie was set
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain(SESSION_COOKIE_NAME);
      expect(cookies[0]).toContain("HttpOnly");

      // Verify SHA-256 session token hashing: Database stores tokenHash, NOT the raw token
      expect(mockSessionsStore.length).toBe(1);
      const storedSession = mockSessionsStore[0];
      expect(storedSession.tokenHash).toHaveLength(64);

      const cookieMatch = cookies[0].match(/grovastra_session=([^;]+)/);
      expect(cookieMatch).not.toBeNull();
      const rawCookieToken = cookieMatch![1];
      expect(storedSession.tokenHash).toBe(hashSessionToken(rawCookieToken));
      expect(storedSession.tokenHash).not.toBe(rawCookieToken);
    });

    it("should reject signup when email already exists with HTTP 409", async () => {
      const response = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: "existing@example.com",
          password: "SecurePassword1!",
          firstName: "Duplicate",
          organizationName: "Another Org",
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    });

    it("should reject signup when email differs only in casing (case-insensitive duplicate check)", async () => {
      const response = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: "EXISTING@EXAMPLE.COM",
          password: "SecurePassword1!",
          firstName: "Duplicate",
          organizationName: "Another Org",
        });

      expect(response.status).toBe(409);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("EMAIL_ALREADY_EXISTS");
    });

    it("should reject password failing complexity rules with HTTP 422", async () => {
      const weakPasswords = [
        "short", // < 8 chars
        "alllowercase1", // No uppercase
        "ALLUPPERCASE1", // No lowercase
        "NoNumbersHere!", // No digit
      ];

      for (const pwd of weakPasswords) {
        const response = await request(app)
          .post("/api/v1/auth/signup")
          .send({
            email: "valid@example.com",
            password: pwd,
            firstName: "Valid",
            organizationName: "Valid Org",
          });

        expect(response.status).toBe(422);
        expect(response.body.success).toBe(false);
        expect(response.body.error.code).toBe("VALIDATION_ERROR");
      }
    });

    it("should reject missing organization name with HTTP 422", async () => {
      const response = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: "test@example.com",
          password: "SecurePassword1!",
          firstName: "Test",
          organizationName: " ", // Empty after trim
        });

      expect(response.status).toBe(422);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/v1/auth/login", () => {
    it("should authenticate customer with correct credentials and set session cookie", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "existing@example.com",
          password: "ValidPass123",
        });

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe("existing@example.com");
      expect(response.body.data.organization.name).toBe("Acme Corp");

      // Verify no secrets or password hash returned
      expect(response.body.data.user.passwordHash).toBeUndefined();
      expect(response.body.data.token).toBeUndefined();

      // Verify cookie
      const cookies = response.headers["set-cookie"];
      expect(cookies).toBeDefined();
      expect(cookies[0]).toContain(SESSION_COOKIE_NAME);
      expect(cookies[0]).toContain("HttpOnly");

      // Verify session stored in DB is hashed with SHA-256
      const lastSession = mockSessionsStore[mockSessionsStore.length - 1];
      expect(lastSession.tokenHash).toHaveLength(64);
      const cookieMatch = cookies[0].match(/grovastra_session=([^;]+)/);
      expect(lastSession.tokenHash).toBe(hashSessionToken(cookieMatch![1]));
    });

    it("should return generic error message on invalid password without leaking details", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "existing@example.com",
          password: "WrongPassword999",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe("Invalid email or password");
    });

    it("should return identical generic error message on non-existent email", async () => {
      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "nonexistent@example.com",
          password: "ValidPass123",
        });

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.message).toBe("Invalid email or password");
    });

    it(
      "should enforce rate limiting after 5 failed attempts with HTTP 429",
      async () => {
        // 5 failed attempts
        for (let i = 0; i < 5; i++) {
          const res = await request(app)
            .post("/api/v1/auth/login")
            .send({
              email: "existing@example.com",
              password: "WrongPassword!",
            });
          expect(res.status).toBe(401);
        }

        // 6th attempt should be blocked by rate limiter
        const blockedRes = await request(app)
          .post("/api/v1/auth/login")
          .send({
            email: "existing@example.com",
            password: "ValidPass123", // Even with correct password, blocked!
          });

        expect(blockedRes.status).toBe(429);
        expect(blockedRes.body.success).toBe(false);
        expect(blockedRes.body.error.code).toBe("RATE_LIMITED");
        expect(blockedRes.body.error.message).toContain("Too many login attempts");
      },
      30000
    );
  });

  describe("GET /api/v1/auth/me", () => {
    it("should return authenticated user profile and organization when valid session exists", async () => {
      // Create session in mock store using SHA-256 hash
      const sessionToken = "valid_test_token_abc123";
      mockSessionsStore.push({
        id: "sess_test_01",
        userId: "usr_existing_01",
        organizationId: "org_existing_01",
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60), // 1 hour future
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      });

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", [`${SESSION_COOKIE_NAME}=${sessionToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.user.email).toBe("existing@example.com");
      expect(response.body.data.organization.id).toBe("org_existing_01");
    });

    it("should reject expired session with HTTP 401", async () => {
      const expiredToken = "expired_token_xyz";
      mockSessionsStore.push({
        id: "sess_expired_01",
        userId: "usr_existing_01",
        organizationId: "org_existing_01",
        tokenHash: hashSessionToken(expiredToken),
        expiresAt: new Date(Date.now() - 1000 * 60), // 1 minute in the past
        createdAt: new Date(Date.now() - 1000 * 60 * 60),
        userAgent: null,
        ipAddress: null,
      });

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", [`${SESSION_COOKIE_NAME}=${expiredToken}`]);

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });

    it("should return HTTP 401 when no session cookie or token is provided", async () => {
      const response = await request(app).get("/api/v1/auth/me");
      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
    });
  });

  describe("POST /api/v1/auth/logout", () => {
    it("should revoke session and clear cookie", async () => {
      const sessionToken = "logout_test_token_456";
      mockSessionsStore.push({
        id: "sess_logout_01",
        userId: "usr_existing_01",
        organizationId: "org_existing_01",
        tokenHash: hashSessionToken(sessionToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      });

      const response = await request(app)
        .post("/api/v1/auth/logout")
        .set("Cookie", [`${SESSION_COOKIE_NAME}=${sessionToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
      expect(response.body.data.loggedOut).toBe(true);

      // Verify cookie is expired/cleared
      const cookies = response.headers["set-cookie"];
      expect(cookies[0]).toContain(`${SESSION_COOKIE_NAME}=;`);

      // Verify session was removed from database
      expect(mockSessionsStore.find((s) => s.tokenHash === hashSessionToken(sessionToken))).toBeUndefined();
    });
  });

  describe("Tenant Isolation & Protected Routes", () => {
    it("should reject unauthenticated access to protected routes when auth is enforced", async () => {
      const response = await request(app)
        .get("/api/v1/campaigns")
        .set("x-test-enforce-auth", "true");

      expect(response.status).toBe(401);
      expect(response.body.success).toBe(false);
      expect(response.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should allow authenticated access to campaigns scoped to the user's organization", async () => {
      const validToken = "authenticated_org_token";
      mockSessionsStore.push({
        id: "sess_org_01",
        userId: "usr_existing_01",
        organizationId: "org_existing_01",
        tokenHash: hashSessionToken(validToken),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      });

      const response = await request(app)
        .get("/api/v1/campaigns")
        .set("Cookie", [`${SESSION_COOKIE_NAME}=${validToken}`]);

      expect(response.status).toBe(200);
      expect(response.body.success).toBe(true);
    });

    it("should prevent cross-organization data leakage between distinct tenant accounts", async () => {
      // 1. User A belongs to Org A
      const tokenOrgA = "token_org_a";
      mockSessionsStore.push({
        id: "sess_org_a",
        userId: "usr_existing_01",
        organizationId: "org_existing_01",
        tokenHash: hashSessionToken(tokenOrgA),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      });

      // 2. User B belongs to Org B
      const orgB: MockOrg = {
        id: "org_b_tenant",
        name: "Competitor Corp",
        slug: "competitor-corp-999",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockOrgsStore.push(orgB);

      const userB: MockUser = {
        id: "usr_b_tenant",
        organizationId: orgB.id,
        email: "userb@competitor.com",
        passwordHash: "hash",
        firstName: "User",
        lastName: "B",
        role: "OWNER",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsersStore.push(userB);

      const tokenOrgB = "token_org_b";
      mockSessionsStore.push({
        id: "sess_org_b",
        userId: userB.id,
        organizationId: orgB.id,
        tokenHash: hashSessionToken(tokenOrgB),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      });

      // User B verifies their session: receives Org B, not Org A
      const meResponse = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", [`${SESSION_COOKIE_NAME}=${tokenOrgB}`]);

      expect(meResponse.status).toBe(200);
      expect(meResponse.body.data.organization.id).toBe("org_b_tenant");
      expect(meResponse.body.data.organization.id).not.toBe("org_existing_01");

      // Attempting to override organizationId via query or body has zero effect
      const spoofAttempt = await request(app)
        .post("/api/v1/auth/signup")
        .send({
          email: "spoof@example.com",
          password: "SecurePassword1!",
          firstName: "Spoofer",
          organizationName: "Spoof Corp",
          organizationId: "org_existing_01", // Malicious tenant override attempt
        });

      expect(spoofAttempt.status).toBe(201);
      // New account must have a newly generated ID, never the spoofed target
      expect(spoofAttempt.body.data.organization.id).not.toBe("org_existing_01");
    });
  });

  describe("Organization Archival & Soft-Delete Enforcement", () => {
    it("rejects login with HTTP 401 when organization is archived", async () => {
      const archivedOrg: MockOrg = {
        id: "org_archived_1",
        name: "Archived Org",
        slug: "archived-org",
        createdAt: new Date(),
        updatedAt: new Date(),
        isArchived: true,
        deletedAt: null,
      };
      mockOrgsStore.push(archivedOrg);

      const passwordHash = await hashPassword("ValidPassword1!");
      const user: MockUser = {
        id: "usr_archived_1",
        organizationId: archivedOrg.id,
        email: "archived@example.com",
        passwordHash,
        firstName: "Archived",
        lastName: "User",
        role: "OWNER",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsersStore.push(user);

      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "archived@example.com",
          password: "ValidPassword1!",
        });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain("Organization is archived or suspended");
    });

    it("rejects login with HTTP 401 when organization is soft-deleted", async () => {
      const deletedOrg: MockOrg = {
        id: "org_deleted_1",
        name: "Deleted Org",
        slug: "deleted-org",
        createdAt: new Date(),
        updatedAt: new Date(),
        isArchived: false,
        deletedAt: new Date(),
      };
      mockOrgsStore.push(deletedOrg);

      const passwordHash = await hashPassword("ValidPassword1!");
      const user: MockUser = {
        id: "usr_deleted_1",
        organizationId: deletedOrg.id,
        email: "deleted@example.com",
        passwordHash,
        firstName: "Deleted",
        lastName: "User",
        role: "OWNER",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsersStore.push(user);

      const response = await request(app)
        .post("/api/v1/auth/login")
        .send({
          email: "deleted@example.com",
          password: "ValidPassword1!",
        });

      expect(response.status).toBe(401);
      expect(response.body.error.message).toContain("Organization is archived or suspended");
    });

    it("rejects session validation and access to protected routes when organization is archived", async () => {
      const archivedOrg: MockOrg = {
        id: "org_archived_session",
        name: "Archived Session Org",
        slug: "archived-session-org",
        createdAt: new Date(),
        updatedAt: new Date(),
        isArchived: true,
        deletedAt: null,
      };
      mockOrgsStore.push(archivedOrg);

      const user: MockUser = {
        id: "usr_archived_session",
        organizationId: archivedOrg.id,
        email: "session_archived@example.com",
        passwordHash: "hash",
        firstName: "Session",
        lastName: "User",
        role: "OWNER",
        createdAt: new Date(),
        updatedAt: new Date(),
      };
      mockUsersStore.push(user);

      const token = "token_archived_session";
      mockSessionsStore.push({
        id: "sess_archived",
        userId: user.id,
        organizationId: archivedOrg.id,
        tokenHash: hashSessionToken(token),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60),
        createdAt: new Date(),
        userAgent: null,
        ipAddress: null,
      });

      const response = await request(app)
        .get("/api/v1/auth/me")
        .set("Cookie", [`${SESSION_COOKIE_NAME}=${token}`]);

      expect(response.status).toBe(401);
    });
  });
});

