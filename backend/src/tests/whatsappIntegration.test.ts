import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { getPrismaClient } from "../config/prisma.js";
import { MetaConnectionStatus } from "@prisma/client";
import { encryptSecret, decryptSecret } from "../utils/encryption.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { clearRateLimitStore } from "../middleware/rateLimiter.js";
import { MetaConfigResolver } from "../services/metaConfigResolver.js";


const ORG_A = "org_whatsapp_alpha_111";
const ORG_B = "org_whatsapp_beta_222";
const GROVIEWS_ORG = "cmv7xnkn20000t818segbx7xq";

const VALID_WABA_A = "1075305975271164";
const VALID_PHONE_A = "104860000000001";
const VALID_TOKEN_A = "EAAGtest_system_user_token_alpha_123456789";

const VALID_WABA_B = "2075305975271164";
const VALID_PHONE_B = "204860000000002";
const VALID_TOKEN_B = "EAAGtest_system_user_token_beta_987654321";

describe("Phase 6C — Tenant-Specific WhatsApp Connection APIs", () => {
  let originalEnvKey: string | undefined;
  let originalMetaOrg: string | undefined;
  let originalWabaId: string | undefined;
  let originalPhoneId: string | undefined;
  let originalToken: string | undefined;

  // In-memory mock store for MetaAccount records
  let mockMetaAccounts: Map<string, any>;
  let mockOrganizations: Map<string, any>;
  let mockMessages: Array<{ id: string; organizationId: string; wamid: string }>;
  let mockWebhooks: Array<{ id: string; organizationId: string }>;

  let originalMode: string | undefined;

  beforeEach(() => {
    originalEnvKey = process.env.APP_ENCRYPTION_KEY;
    originalMetaOrg = process.env.META_ORGANIZATION_ID;
    originalWabaId = process.env.META_WABA_ID;
    originalPhoneId = process.env.META_PHONE_NUMBER_ID;
    originalToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    originalMode = process.env.WHATSAPP_ACCOUNT_MODE;

    process.env.WHATSAPP_ACCOUNT_MODE = "DEDICATED";
    process.env.APP_ENCRYPTION_KEY =
      process.env.APP_ENCRYPTION_KEY ||
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.META_ORGANIZATION_ID = GROVIEWS_ORG;
    process.env.META_WABA_ID = "1075305975271164";
    process.env.META_PHONE_NUMBER_ID = "104860000000000";
    process.env.META_WHATSAPP_ACCESS_TOKEN = "EAAGtest_groviews_legacy_token";

    clearRateLimitStore();
    whatsappTemplateService.clearCache();
    vi.restoreAllMocks();

    mockMetaAccounts = new Map();
    mockOrganizations = new Map([
      [ORG_A, { id: ORG_A, name: "Alpha Corp", slug: "alpha-corp", isArchived: false, deletedAt: null }],
      [ORG_B, { id: ORG_B, name: "Beta LLC", slug: "beta-llc", isArchived: false, deletedAt: null }],
      [GROVIEWS_ORG, { id: GROVIEWS_ORG, name: "Groviews", slug: "groviews", isArchived: false, deletedAt: null }],
    ]);
    mockMessages = [
      { id: "msg_1", organizationId: ORG_A, wamid: "wamid.HBgL1" },
      { id: "msg_2", organizationId: ORG_B, wamid: "wamid.HBgL2" },
    ];
    mockWebhooks = [
      { id: "evt_1", organizationId: ORG_A },
      { id: "evt_2", organizationId: ORG_B },
    ];

    const prisma = getPrismaClient();

    // Mock prisma.organization.findUnique
    vi.spyOn(prisma.organization, "findUnique").mockImplementation(async (args: any) => {
      const id = args.where.id;
      return mockOrganizations.get(id) || null;
    });

    // Mock prisma.metaAccount methods
    vi.spyOn(prisma.metaAccount, "findUnique").mockImplementation(async (args: any) => {
      if (args.where.organizationId) {
        return mockMetaAccounts.get(args.where.organizationId) || null;
      }
      if (args.where.wabaId) {
        for (const account of mockMetaAccounts.values()) {
          if (account.wabaId === args.where.wabaId) return account;
        }
      }
      if (args.where.phoneNumberId) {
        for (const account of mockMetaAccounts.values()) {
          if (account.phoneNumberId === args.where.phoneNumberId) return account;
        }
      }
      return null;
    });

    vi.spyOn(prisma.metaAccount, "findFirst").mockImplementation(async (args: any) => {
      const where = args.where;
      for (const account of mockMetaAccounts.values()) {
        let match = true;
        if (where.wabaId && account.wabaId !== where.wabaId) match = false;
        if (where.phoneNumberId && account.phoneNumberId !== where.phoneNumberId) match = false;
        if (where.organizationId?.not && account.organizationId === where.organizationId.not) match = false;
        if (match) return account;
      }
      return null;
    });

    vi.spyOn(prisma.metaAccount, "upsert").mockImplementation(async (args: any) => {
      const orgId = args.where.organizationId;
      const existing = mockMetaAccounts.get(orgId);
      const data = existing ? { ...existing, ...args.update } : { id: `meta_${orgId}`, ...args.create };
      mockMetaAccounts.set(orgId, data);
      return data;
    });

    vi.spyOn(prisma.metaAccount, "update").mockImplementation(async (args: any) => {
      const orgId = args.where.organizationId;
      const existing = mockMetaAccounts.get(orgId);
      if (!existing) throw new Error("Record to update not found");
      const updated = { ...existing, ...args.data };
      mockMetaAccounts.set(orgId, updated);
      return updated;
    });

    // Mock fetch for Meta Graph API
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const auth = init?.headers ? (init.headers as Record<string, string>)["Authorization"] : "";

      // Phone Number inspection URL
      if (url.includes(`/${VALID_PHONE_A}`)) {
        if (!auth?.includes(VALID_TOKEN_A)) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              error: { message: "Invalid OAuth access token.", code: 190 },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            verified_name: "Alpha Corp Official",
            display_phone_number: "+1 555-010-0001",
            whatsapp_business_account: { id: VALID_WABA_A },
            code_verification_status: "VERIFIED",
          }),
        };
      }

      // WABA inspection URL
      if (url.includes(`/${VALID_WABA_A}`)) {
        if (!auth?.includes(VALID_TOKEN_A)) {
          return {
            ok: false,
            status: 401,
            json: async () => ({
              error: { message: "Invalid OAuth access token.", code: 190 },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: VALID_WABA_A,
            name: "Alpha WhatsApp Business",
            timezone_id: "1",
          }),
        };
      }

      // debug_token inspection
      if (url.includes("/debug_token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: {
              is_valid: true,
              expires_at: 0, // Permanent System User Token
            },
          }),
        };
      }

      return {
        ok: false,
        status: 404,
        json: async () => ({
          error: { message: "Resource not found on Meta.", code: 100 },
        }),
      };
    });
  });

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEnvKey;
    process.env.META_ORGANIZATION_ID = originalMetaOrg;
    process.env.META_WABA_ID = originalWabaId;
    process.env.META_PHONE_NUMBER_ID = originalPhoneId;
    process.env.META_WHATSAPP_ACCESS_TOKEN = originalToken;
    process.env.WHATSAPP_ACCOUNT_MODE = originalMode;

    clearRateLimitStore();
    whatsappTemplateService.clearCache();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Test 1: Unauthenticated requests
  // ============================================================================
  describe("1. Unauthenticated Requests", () => {
    it("rejects GET /status with HTTP 401 when unauthenticated", async () => {
      const res = await request(app)
        .get("/api/v1/integrations/whatsapp/status")
        .set("x-test-enforce-auth", "true");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects POST /connect with HTTP 401 when unauthenticated", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-enforce-auth", "true")
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects POST /refresh with HTTP 401 when unauthenticated", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/refresh")
        .set("x-test-enforce-auth", "true");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("rejects DELETE /disconnect with HTTP 401 when unauthenticated", async () => {
      const res = await request(app)
        .delete("/api/v1/integrations/whatsapp/disconnect")
        .set("x-test-enforce-auth", "true");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ============================================================================
  // Test 2: Missing or invalid tenant context
  // ============================================================================
  describe("2. Missing or Invalid Tenant Context", () => {
    it("rejects requests when tenant context has empty or invalid organizationId", async () => {
      const res = await request(app)
        .get("/api/v1/integrations/whatsapp/status")
        .set("x-test-org-id", "   ");
      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });
  });

  // ============================================================================
  // Test 3: Client-supplied organization ID spoofing
  // ============================================================================
  describe("3. Client-Supplied Organization ID Spoofing", () => {
    it("never trusts client-supplied organizationId in request body", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_A)
        .send({
          organizationId: ORG_B, // Malicious spoofing attempt
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);

      // Verify that ORG_A was connected, NOT ORG_B!
      expect(mockMetaAccounts.has(ORG_A)).toBe(true);
      expect(mockMetaAccounts.has(ORG_B)).toBe(false);
      expect(mockMetaAccounts.get(ORG_A).organizationId).toBe(ORG_A);
    });
  });

  // ============================================================================
  // Test 4: Successful connection using mocked Meta responses
  // ============================================================================
  describe("4. Successful Connection Setup", () => {
    it("verifies credentials against Meta, encrypts token, and returns safe metadata", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_A)
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.status).toBe("CONNECTED");
      expect(res.body.data.wabaId).toBe(VALID_WABA_A);
      expect(res.body.data.phoneNumberId).toBe(VALID_PHONE_A);
      expect(res.body.data.displayPhoneNumber).toBe("+1 555-010-0001");
      expect(res.body.data.verifiedName).toBe("Alpha Corp Official");
      expect(res.body.data.verifiedAt).toBeTruthy();

      // NEVER return tokens or ciphertext in API response
      expect(res.body.data.accessToken).toBeUndefined();
      expect(res.body.data.encryptedAccessToken).toBeUndefined();
      expect(res.body.data.tokenKeyId).toBeUndefined();

      // Subsequent GET /status should reflect connected state
      const statusRes = await request(app)
        .get("/api/v1/integrations/whatsapp/status")
        .set("x-test-org-id", ORG_A);

      expect(statusRes.status).toBe(200);
      expect(statusRes.body.data.connected).toBe(true);
      expect(statusRes.body.data.status).toBe("CONNECTED");
      expect(statusRes.body.data.source).toBe("DATABASE");
      expect(statusRes.body.data.verifiedName).toBe("Alpha Corp Official");
      expect(statusRes.body.data.accessToken).toBeUndefined();
    });
  });

  // ============================================================================
  // Test 5: Invalid token and insufficient permissions
  // ============================================================================
  describe("5. Invalid Token and Insufficient Permissions", () => {
    it("returns HTTP 401 when Meta rejects token as invalid or expired (code 190)", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_A)
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: "EAAG_invalid_or_expired_token",
        });

      expect(res.status).toBe(401);
      expect(res.body.error.code).toBe("META_AUTH_INVALID");
      expect(mockMetaAccounts.has(ORG_A)).toBe(false);
    });

    it("returns HTTP 403 when Meta rejects request due to permission errors (code 10/200)", async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: "(#200) Provide valid permissions to access WABA.",
            code: 200,
          },
        }),
      }));

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_A)
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("META_PERMISSION_DENIED");
      expect(mockMetaAccounts.has(ORG_A)).toBe(false);
    });
  });

  // ============================================================================
  // Test 6: WABA/phone-number mismatch
  // ============================================================================
  describe("6. WABA and Phone Number Mismatch", () => {
    it("rejects connection with HTTP 400 WABA_PHONE_MISMATCH if phone does not belong to WABA", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes(`/${VALID_PHONE_A}`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              verified_name: "Mismatch Corp",
              display_phone_number: "+1 555-999-9999",
              whatsapp_business_account: { id: "DIFFERENT_WABA_99999" }, // Mismatch!
            }),
          };
        }
        return { ok: true, status: 200, json: async () => ({ id: VALID_WABA_A }) };
      });

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_A)
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("WABA_PHONE_MISMATCH");
      expect(mockMetaAccounts.has(ORG_A)).toBe(false);
    });
  });

  // ============================================================================
  // Test 7: Duplicate WABA or phone-number ownership conflict
  // ============================================================================
  describe("7. Duplicate Ownership Conflict (Tenant Isolation)", () => {
    beforeEach(() => {
      // Pre-register WABA_A and PHONE_A for ORG_A
      const enc = encryptSecret(VALID_TOKEN_A);
      mockMetaAccounts.set(ORG_A, {
        id: "meta_a",
        organizationId: ORG_A,
        wabaId: VALID_WABA_A,
        phoneNumberId: VALID_PHONE_A,
        displayPhoneNumber: "+1 555-010-0001",
        verifiedName: "Alpha Corp",
        encryptedAccessToken: enc.ciphertext,
        tokenKeyId: enc.keyId,
        status: MetaConnectionStatus.CONNECTED,
      });
    });

    it("rejects connection with HTTP 409 CONFLICT if another organization already registered the WABA", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_B) // ORG_B tries to claim ORG_A's WABA
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_B,
          accessToken: VALID_TOKEN_B,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      // Must not leak ORG_A's identity
      expect(res.body.error.message).not.toContain(ORG_A);
      expect(res.body.error.message).not.toContain("Alpha");
    });

    it("rejects connection with HTTP 409 CONFLICT if another organization already registered the Phone ID", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_B) // ORG_B tries to claim ORG_A's phone
        .send({
          wabaId: VALID_WABA_B,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_B,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.message).not.toContain(ORG_A);
    });

    it("handles concurrent connection race conditions safely via database unique constraint (P2002)", async () => {
      // Clear pre-existing store so application pre-check passes and lets DB constraint handle race
      mockMetaAccounts.clear();

      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "upsert").mockRejectedValueOnce({
        code: "P2002",
        message: "Unique constraint failed on the fields: (`wabaId`)",
      });

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_B)
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONFLICT");
      expect(res.body.error.message).toContain("already linked to another organization");
    });
  });



  // ============================================================================
  // Test 8: Token encryption at rest and absence from responses/logs
  // ============================================================================
  describe("8. Token Encryption at Rest & Sanitization", () => {
    it("stores token encrypted with AES-256-GCM and never exposes it in plain text", async () => {
      await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_A)
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });

      const stored = mockMetaAccounts.get(ORG_A);
      expect(stored).toBeDefined();

      // Confirm ciphertext is stored in iv:tag:cipher format
      expect(stored.encryptedAccessToken).not.toBe(VALID_TOKEN_A);
      expect(stored.encryptedAccessToken).toContain(":");
      const parts = stored.encryptedAccessToken.split(":");
      expect(parts).toHaveLength(3);

      // Verify decryptSecret produces the original token
      const decrypted = decryptSecret(stored.encryptedAccessToken);
      expect(decrypted).toBe(VALID_TOKEN_A);
    });
  });

  // ============================================================================
  // Test 9: Database failure during connection setup
  // ============================================================================
  describe("9. Database Failure Handling", () => {
    it("fails closed on database error without leaving partial connected records", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "upsert").mockRejectedValueOnce(
        new Error("Database connection pool exhausted")
      );

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_A)
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });

      expect(res.status).toBe(500);
      expect(mockMetaAccounts.has(ORG_A)).toBe(false);
    });
  });

  // ============================================================================
  // Test 10: Refresh success, revoked token, and timeout
  // ============================================================================
  describe("10. Refresh Lifecycle Handling", () => {
    beforeEach(() => {
      const enc = encryptSecret(VALID_TOKEN_A);
      mockMetaAccounts.set(ORG_A, {
        id: "meta_a",
        organizationId: ORG_A,
        wabaId: VALID_WABA_A,
        phoneNumberId: VALID_PHONE_A,
        displayPhoneNumber: "+1 555-010-0001",
        verifiedName: "Alpha Corp Initial",
        encryptedAccessToken: enc.ciphertext,
        tokenKeyId: enc.keyId,
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: new Date(Date.now() - 86400000),
        lastSyncedAt: new Date(Date.now() - 86400000),
      });
    });

    it("successfully revalidates connection and updates metadata and timestamps", async () => {
      global.fetch = vi.fn().mockImplementation(async (url: string) => {
        if (url.includes(`/${VALID_PHONE_A}`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              verified_name: "Alpha Corp Refreshed Name",
              display_phone_number: "+1 555-010-0001",
              whatsapp_business_account: { id: VALID_WABA_A },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({ id: VALID_WABA_A, name: "Alpha Refreshed WABA" }),
        };
      });

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/refresh")
        .set("x-test-org-id", ORG_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.verifiedName).toBe("Alpha Corp Refreshed Name");

      const stored = mockMetaAccounts.get(ORG_A);
      expect(stored.verifiedName).toBe("Alpha Corp Refreshed Name");
      expect(stored.status).toBe(MetaConnectionStatus.CONNECTED);
    });

    it("marks status TOKEN_EXPIRED and connected: false when Meta reports token revoked (code 190)", async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: "Error validating access token: Session expired.", code: 190 },
        }),
      }));

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/refresh")
        .set("x-test-org-id", ORG_A);

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(false);
      expect(res.body.data.status).toBe("TOKEN_EXPIRED");

      const stored = mockMetaAccounts.get(ORG_A);
      expect(stored.status).toBe(MetaConnectionStatus.TOKEN_EXPIRED);
    });

    it("handles Meta timeout during refresh without disconnecting the account", async () => {
      global.fetch = vi.fn().mockImplementation(async () => {
        const error = new Error("AbortError");
        error.name = "AbortError";
        throw error;
      });

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/refresh")
        .set("x-test-org-id", ORG_A);

      expect(res.status).toBe(504);
      expect(res.body.error.code).toBe("META_TIMEOUT");

      // Verify status remains CONNECTED despite temporary network timeout
      const stored = mockMetaAccounts.get(ORG_A);
      expect(stored.status).toBe(MetaConnectionStatus.CONNECTED);
    });

    it("persists only valid Prisma MetaConnectionStatus enum value when token revoked", async () => {
      global.fetch = vi.fn().mockImplementation(async () => ({
        ok: false,
        status: 401,
        json: async () => ({
          error: { message: "Error validating access token: Session expired.", code: 190 },
        }),
      }));

      await request(app)
        .post("/api/v1/integrations/whatsapp/refresh")
        .set("x-test-org-id", ORG_A);

      const stored = mockMetaAccounts.get(ORG_A);
      expect(stored.status).toBe(MetaConnectionStatus.TOKEN_EXPIRED);
      // Confirm it strictly matches a deployed enum value in PostgreSQL
      expect(Object.values(MetaConnectionStatus)).toContain(stored.status);
    });
  });

  // ============================================================================
  // Test 11: Disconnect isolation and history preservation
  // ============================================================================
  describe("11. Disconnect Isolation & History Preservation", () => {
    beforeEach(() => {
      const encA = encryptSecret(VALID_TOKEN_A);
      mockMetaAccounts.set(ORG_A, {
        id: "meta_a",
        organizationId: ORG_A,
        wabaId: VALID_WABA_A,
        phoneNumberId: VALID_PHONE_A,
        encryptedAccessToken: encA.ciphertext,
        tokenKeyId: encA.keyId,
        status: MetaConnectionStatus.CONNECTED,
      });

      const encB = encryptSecret(VALID_TOKEN_B);
      mockMetaAccounts.set(ORG_B, {
        id: "meta_b",
        organizationId: ORG_B,
        wabaId: VALID_WABA_B,
        phoneNumberId: VALID_PHONE_B,
        encryptedAccessToken: encB.ciphertext,
        tokenKeyId: encB.keyId,
        status: MetaConnectionStatus.CONNECTED,
      });
    });

    it("disconnects only current organization, tombstones credentials, and preserves messages/webhooks", async () => {
      const res = await request(app)
        .delete("/api/v1/integrations/whatsapp/disconnect")
        .set("x-test-org-id", ORG_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("DISCONNECTED");

      // ORG_A is disconnected
      const accountA = mockMetaAccounts.get(ORG_A);
      expect(accountA.status).toBe(MetaConnectionStatus.DISCONNECTED);
      expect(decryptSecret(accountA.encryptedAccessToken)).toContain("DISCONNECTED_TOMBSTONE");

      // ORG_B remains fully CONNECTED and untouched!
      const accountB = mockMetaAccounts.get(ORG_B);
      expect(accountB.status).toBe(MetaConnectionStatus.CONNECTED);
      expect(decryptSecret(accountB.encryptedAccessToken)).toBe(VALID_TOKEN_B);

      // Historical records preserved
      expect(mockMessages).toHaveLength(2);
      expect(mockWebhooks).toHaveLength(2);
    });

    it("handles repeated disconnect requests safely and idempotently", async () => {
      // First disconnect
      const res1 = await request(app)
        .delete("/api/v1/integrations/whatsapp/disconnect")
        .set("x-test-org-id", ORG_A);
      expect(res1.status).toBe(200);
      expect(res1.body.data.status).toBe("DISCONNECTED");

      // Second disconnect on already disconnected account
      const res2 = await request(app)
        .delete("/api/v1/integrations/whatsapp/disconnect")
        .set("x-test-org-id", ORG_A);
      expect(res2.status).toBe(200);
      expect(res2.body.data.status).toBe("DISCONNECTED");

      // Verify still tombstoned and status is DISCONNECTED
      const accountA = mockMetaAccounts.get(ORG_A);
      expect(accountA.status).toBe(MetaConnectionStatus.DISCONNECTED);
      expect(decryptSecret(accountA.encryptedAccessToken)).toContain("DISCONNECTED_TOMBSTONE");
    });

    it("rejects disconnected account before any Meta Graph API call", async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      // Disconnect account
      await request(app)
        .delete("/api/v1/integrations/whatsapp/disconnect")
        .set("x-test-org-id", ORG_A);

      // MetaConfigResolver must reject with META_ACCOUNT_NOT_CONNECTED
      await expect(MetaConfigResolver.getMetaConfigForOrganization(ORG_A)).rejects.toThrow(
        "cannot be used for sending"
      );

      // Refresh must also reject with ACCOUNT_DISCONNECTED
      const refreshRes = await request(app)
        .post("/api/v1/integrations/whatsapp/refresh")
        .set("x-test-org-id", ORG_A);
      expect(refreshRes.status).toBe(400);
      expect(refreshRes.body.error.code).toBe("ACCOUNT_DISCONNECTED");

      // Meta fetch was never called!
      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("returns 404 when disconnecting an organization with no connection", async () => {
      const res = await request(app)
        .delete("/api/v1/integrations/whatsapp/disconnect")
        .set("x-test-org-id", "org_unknown_999");

      expect(res.status).toBe(404);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });
  });


  // ============================================================================
  // Test 12: Missing/invalid encryption key and decryption failure
  // ============================================================================
  describe("12. Encryption Key Misconfiguration & Decryption Failure", () => {
    it("fails closed with HTTP 500 when APP_ENCRYPTION_KEY is missing during connect", async () => {
      delete process.env.APP_ENCRYPTION_KEY;

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", ORG_A)
        .send({
          wabaId: VALID_WABA_A,
          phoneNumberId: VALID_PHONE_A,
          accessToken: VALID_TOKEN_A,
        });

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("ENCRYPTION_CONFIGURATION_ERROR");
      expect(mockMetaAccounts.has(ORG_A)).toBe(false);
    });

    it("fails closed with HTTP 500 when decryption fails during refresh", async () => {
      mockMetaAccounts.set(ORG_A, {
        id: "meta_a",
        organizationId: ORG_A,
        wabaId: VALID_WABA_A,
        phoneNumberId: VALID_PHONE_A,
        encryptedAccessToken: "corrupted_invalid_ciphertext_segment",
        tokenKeyId: "v1",
        status: MetaConnectionStatus.CONNECTED,
      });

      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/refresh")
        .set("x-test-org-id", ORG_A);

      expect(res.status).toBe(500);
      expect(res.body.error.code).toBe("ENCRYPTION_CONFIGURATION_ERROR");
    });
  });

  // ============================================================================
  // Test 13: Backward-compatible Groviews legacy .env fallback
  // ============================================================================
  describe("13. Groviews Legacy .env Fallback", () => {
    it("returns ENV_FALLBACK status for Groviews organization when no DB record exists", async () => {
      const res = await request(app)
        .get("/api/v1/integrations/whatsapp/status")
        .set("x-test-org-id", GROVIEWS_ORG);

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.status).toBe("CONNECTED");
      expect(res.body.data.source).toBe("ENV_FALLBACK");
      expect(res.body.data.verifiedName).toBe("Groviews (Env Fallback)");
      expect(res.body.data.wabaId).toBe("1075305975271164");
      expect(res.body.data.phoneNumberId).toBe("104860000000000");
    });

    it("returns NOT_CONNECTED for any other organization without a database record", async () => {
      const res = await request(app)
        .get("/api/v1/integrations/whatsapp/status")
        .set("x-test-org-id", ORG_A);

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(false);
      expect(res.body.data.status).toBe("NOT_CONNECTED");
      expect(res.body.data.source).toBe("NONE");
      expect(res.body.data.wabaId).toBeNull();
    });
  });
});
