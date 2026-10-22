import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { getPrismaClient } from "../config/prisma.js";
import { MetaConnectionStatus, ConsentStatus } from "@prisma/client";
import { encryptSecret } from "../utils/encryption.js";
import { clearRateLimitStore } from "../middleware/rateLimiter.js";
import { MetaConfigResolver } from "../services/metaConfigResolver.js";
import { WhatsAppSendService } from "../services/whatsappSend.service.js";
import { setAllowedTestTemplates, ALLOWED_TEST_TEMPLATE_NAMES } from "../constants/templateAllowlist.js";

const PLATFORM_ORG_ID = "cmv7xnkn20000t818segbx7xq"; // Groviews
const CUSTOMER_ORG_A = "org_customer_alpha_111";
const CUSTOMER_ORG_B = "org_customer_beta_222";

const PLATFORM_WABA = "1075305975271164";
const PLATFORM_PHONE = "1290524220819472";
const PLATFORM_TOKEN = "EAAGtest_platform_token_secret_xyz123";
const PLATFORM_ADMIN_SECRET = "super_secret_platform_operator_key_999";

describe("Phase 7B — Shared WhatsApp Platform Account Foundation", () => {
  let originalEnvKey: string | undefined;
  let originalMetaOrg: string | undefined;
  let originalPlatformOrg: string | undefined;
  let originalAdminSecret: string | undefined;
  let originalMode: string | undefined;
  let originalWabaId: string | undefined;
  let originalPhoneId: string | undefined;
  let originalToken: string | undefined;

  let mockMetaAccounts: Map<string, any>;
  let mockOrganizations: Map<string, any>;

  beforeEach(() => {
    originalEnvKey = process.env.APP_ENCRYPTION_KEY;
    originalMetaOrg = process.env.META_ORGANIZATION_ID;
    originalPlatformOrg = process.env.PLATFORM_ORGANIZATION_ID;
    originalAdminSecret = process.env.PLATFORM_ADMIN_SECRET;
    originalMode = process.env.WHATSAPP_ACCOUNT_MODE;
    originalWabaId = process.env.META_WABA_ID;
    originalPhoneId = process.env.META_PHONE_NUMBER_ID;
    originalToken = process.env.META_WHATSAPP_ACCESS_TOKEN;

    process.env.APP_ENCRYPTION_KEY =
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.META_ORGANIZATION_ID = PLATFORM_ORG_ID;
    process.env.PLATFORM_ORGANIZATION_ID = PLATFORM_ORG_ID;
    process.env.PLATFORM_ADMIN_SECRET = PLATFORM_ADMIN_SECRET;
    process.env.WHATSAPP_ACCOUNT_MODE = "SHARED_PLATFORM";
    process.env.META_WABA_ID = PLATFORM_WABA;
    process.env.META_PHONE_NUMBER_ID = PLATFORM_PHONE;
    process.env.META_WHATSAPP_ACCESS_TOKEN = PLATFORM_TOKEN;

    clearRateLimitStore();
    vi.restoreAllMocks();

    mockMetaAccounts = new Map();
    mockOrganizations = new Map([
      [PLATFORM_ORG_ID, { id: PLATFORM_ORG_ID, name: "Groviews Platform", slug: "groviews", isArchived: false, deletedAt: null }],
      [CUSTOMER_ORG_A, { id: CUSTOMER_ORG_A, name: "Alpha Customer", slug: "alpha-customer", isArchived: false, deletedAt: null }],
      [CUSTOMER_ORG_B, { id: CUSTOMER_ORG_B, name: "Beta Customer", slug: "beta-customer", isArchived: false, deletedAt: null }],
    ]);

    const prisma = getPrismaClient();

    vi.spyOn(prisma.organization, "findUnique").mockImplementation(async (args: any) => {
      const id = args.where.id;
      return mockOrganizations.get(id) || null;
    });

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
      const data = {
        id: `meta_acc_${Date.now()}`,
        organizationId: orgId,
        createdAt: new Date(),
        updatedAt: new Date(),
        ...(args.create || {}),
        ...(args.update || {}),
      };
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

    // Mock global fetch for Meta API verification
    global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
      const auth = init?.headers ? (init.headers as Record<string, string>)["Authorization"] : "";

      if (url.includes(`/${PLATFORM_PHONE}`)) {
        if (!auth?.includes(PLATFORM_TOKEN)) {
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
            verified_name: "Grovastra Official",
            display_phone_number: "+1 555-0199",
            whatsapp_business_account: { id: PLATFORM_WABA },
            code_verification_status: "VERIFIED",
          }),
        };
      }

      if (url.includes(`/${PLATFORM_WABA}`)) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            id: PLATFORM_WABA,
            name: "Grovastra Official WABA",
            timezone_id: "1",
          }),
        };
      }

      if (url.includes("/debug_token")) {
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: { is_valid: true, expires_at: 0 },
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
    process.env.PLATFORM_ORGANIZATION_ID = originalPlatformOrg;
    process.env.PLATFORM_ADMIN_SECRET = originalAdminSecret;
    process.env.WHATSAPP_ACCOUNT_MODE = originalMode;
    process.env.META_WABA_ID = originalWabaId;
    process.env.META_PHONE_NUMBER_ID = originalPhoneId;
    process.env.META_WHATSAPP_ACCESS_TOKEN = originalToken;

    clearRateLimitStore();
    vi.restoreAllMocks();
  });

  // ============================================================================
  // Suite 1: Sanitized Shared Status for Customers
  // ============================================================================
  describe("1. Customer API Sanitized Shared Status", () => {
    it("returns sanitized shared status without platform identifiers or credentials", async () => {
      // Connect platform account in DB
      const encrypted = encryptSecret(PLATFORM_TOKEN);
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        displayPhoneNumber: "+1 555-0199",
        verifiedName: "Grovastra Shared Business",
        encryptedAccessToken: encrypted.ciphertext,
        tokenKeyId: encrypted.keyId,
        tokenExpiresAt: null,
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: null,
      });

      const res = await request(app)
        .get("/api/v1/integrations/whatsapp/status")
        .set("x-test-org-id", CUSTOMER_ORG_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const data = res.body.data;
      expect(data.mode).toBe("SHARED_PLATFORM");
      expect(data.isSharedPlatform).toBe(true);
      expect(data.canManageCredentials).toBe(false);
      expect(data.connected).toBe(true);
      expect(data.status).toBe("CONNECTED");
      expect(data.verifiedName).toBe("Grovastra Shared Business");
      expect(data.displayPhoneNumber).toBe("+1 555-0199");
      expect(data.sharedNotice).toContain("Outbound campaigns use Grovastra's shared WhatsApp business identity");

      // CRITICAL SECURITY: Platform internal identifiers, tokens, and ciphertexts must NEVER be exposed
      expect(data.wabaId).toBeNull();
      expect(data.phoneNumberId).toBeNull();
      expect(data.accessToken).toBeUndefined();
      expect(data.encryptedAccessToken).toBeUndefined();
      expect(data.tokenKeyId).toBeUndefined();
    });

    it("returns safe disconnected status when platform account is disconnected, with zero token leakage", async () => {
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        displayPhoneNumber: "+1 555-0199",
        verifiedName: "Grovastra Shared Business",
        encryptedAccessToken: "DISCONNECTED",
        tokenKeyId: "v1",
        tokenExpiresAt: null,
        status: MetaConnectionStatus.DISCONNECTED,
        verifiedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: "Platform maintenance disconnect",
      });

      const res = await request(app)
        .get("/api/v1/integrations/whatsapp/status")
        .set("x-test-org-id", CUSTOMER_ORG_A);

      expect(res.status).toBe(200);
      expect(res.body.data.connected).toBe(false);
      expect(res.body.data.status).toBe("DISCONNECTED");
      expect(res.body.data.canManageCredentials).toBe(false);
      expect(res.body.data.wabaId).toBeNull();
      expect(res.body.data.phoneNumberId).toBeNull();
      expect(res.body.data.lastError).toBeNull(); // Redacts internal operator error from customer
    });
  });

  // ============================================================================
  // Suite 2: Customer Role Mutation Restrictions in Shared Mode
  // ============================================================================
  describe("2. Customer Mutation Restrictions in Shared Mode", () => {
    it("rejects customer OWNER connect requests with HTTP 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/connect")
        .set("x-test-org-id", CUSTOMER_ORG_A)
        .set("x-test-user-id", "customer_owner_user_1")
        .send({
          wabaId: "999999999999999",
          phoneNumberId: "888888888888888",
          accessToken: "EAAGcustomer_token_attempt",
        });

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("SHARED_PLATFORM_READ_ONLY");
      expect(res.body.error.message).toContain("shared WhatsApp platform mode");
    });

    it("rejects customer refresh requests with HTTP 403 Forbidden", async () => {
      const res = await request(app)
        .post("/api/v1/integrations/whatsapp/refresh")
        .set("x-test-org-id", CUSTOMER_ORG_A);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("SHARED_PLATFORM_READ_ONLY");
    });

    it("rejects customer disconnect requests with HTTP 403 Forbidden", async () => {
      const res = await request(app)
        .delete("/api/v1/integrations/whatsapp/disconnect")
        .set("x-test-org-id", CUSTOMER_ORG_A);

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("SHARED_PLATFORM_READ_ONLY");
    });
  });

  // ============================================================================
  // Suite 3: Platform Management Authorization Guard
  // ============================================================================
  describe("3. Platform Management Authorization (/api/v1/admin/platform/whatsapp)", () => {
    it("rejects requests without platform admin credentials with HTTP 403", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/whatsapp/status");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
      expect(res.body.error.message).toContain("Platform administrator authorization required");
    });

    it("rejects requests with invalid platform secret with HTTP 403", async () => {
      const res = await request(app)
        .get("/api/v1/admin/platform/whatsapp/status")
        .set("x-platform-admin-secret", "wrong_invalid_secret_key");

      expect(res.status).toBe(403);
      expect(res.body.error.code).toBe("FORBIDDEN");
    });

    it("allows authorized platform admin to inspect full platform connection status", async () => {
      const encrypted = encryptSecret(PLATFORM_TOKEN);
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        displayPhoneNumber: "+1 555-0199",
        verifiedName: "Grovastra Platform",
        encryptedAccessToken: encrypted.ciphertext,
        tokenKeyId: encrypted.keyId,
        tokenExpiresAt: null,
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
        lastSyncedAt: new Date(),
        lastError: null,
      });

      const res = await request(app)
        .get("/api/v1/admin/platform/whatsapp/status")
        .set("x-platform-admin-secret", PLATFORM_ADMIN_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.wabaId).toBe(PLATFORM_WABA);
      expect(res.body.data.phoneNumberId).toBe(PLATFORM_PHONE);
      expect(res.body.data.displayPhoneNumber).toBe("+1 555-0199");
      // Even for platform admin, plaintext token is NEVER returned in response
      expect(res.body.data.accessToken).toBeUndefined();
      expect(res.body.data.encryptedAccessToken).toBeUndefined();
    });

    it("allows authorized platform admin to connect and encrypt platform credentials", async () => {
      const res = await request(app)
        .post("/api/v1/admin/platform/whatsapp/connect")
        .set("x-platform-admin-secret", PLATFORM_ADMIN_SECRET)
        .send({
          wabaId: PLATFORM_WABA,
          phoneNumberId: PLATFORM_PHONE,
          accessToken: PLATFORM_TOKEN,
        });

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.connected).toBe(true);
      expect(res.body.data.status).toBe("CONNECTED");
      expect(res.body.data.verifiedName).toBe("Grovastra Official");

      // Verify stored in DB
      const stored = mockMetaAccounts.get(PLATFORM_ORG_ID);
      expect(stored).toBeDefined();
      expect(stored.wabaId).toBe(PLATFORM_WABA);
      expect(stored.encryptedAccessToken).not.toBe(PLATFORM_TOKEN); // Must be encrypted
    });

    it("allows authorized platform admin to disconnect platform account and tombstones token", async () => {
      const encrypted = encryptSecret(PLATFORM_TOKEN);
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        encryptedAccessToken: encrypted.ciphertext,
        status: MetaConnectionStatus.CONNECTED,
      });

      const res = await request(app)
        .delete("/api/v1/admin/platform/whatsapp/disconnect")
        .set("x-platform-admin-secret", PLATFORM_ADMIN_SECRET);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.status).toBe("DISCONNECTED");

      const stored = mockMetaAccounts.get(PLATFORM_ORG_ID);
      expect(stored.status).toBe(MetaConnectionStatus.DISCONNECTED);
      expect(stored.encryptedAccessToken).not.toBe(encrypted.ciphertext); // Tombstoned
    });
  });

  // ============================================================================
  // Suite 4: Fail-Closed Resolver Behavior & Customer Override Prevention
  // ============================================================================
  describe("4. Fail-Closed Resolver Behavior", () => {
    it("fails closed when platform account is disconnected in database and does NOT fall back to .env", async () => {
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        encryptedAccessToken: "DISCONNECTED",
        status: MetaConnectionStatus.DISCONNECTED,
      });

      await expect(
        MetaConfigResolver.resolveOutboundConfig(CUSTOMER_ORG_A)
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "META_ACCOUNT_NOT_CONNECTED",
        })
      );
    });

    it("fails closed when platform account token is expired and does NOT fall back to .env", async () => {
      const encrypted = encryptSecret(PLATFORM_TOKEN);
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        encryptedAccessToken: encrypted.ciphertext,
        tokenExpiresAt: new Date(Date.now() - 3600000), // Expired 1 hour ago
        status: MetaConnectionStatus.CONNECTED,
      });

      await expect(
        MetaConfigResolver.resolveOutboundConfig(CUSTOMER_ORG_A)
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 401,
          code: "META_TOKEN_EXPIRED",
        })
      );
    });

    it("fails closed when platform account decryption fails and does NOT fall back to .env", async () => {
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        encryptedAccessToken: "corrupt_ciphertext_cannot_be_decrypted",
        status: MetaConnectionStatus.CONNECTED,
      });

      await expect(
        MetaConfigResolver.resolveOutboundConfig(CUSTOMER_ORG_A)
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 500,
          code: "ENCRYPTION_CONFIGURATION_ERROR",
        })
      );
    });

    it("prevents customer MetaAccount from overriding platform account in shared mode", async () => {
      // Connect platform account
      const platformEncrypted = encryptSecret(PLATFORM_TOKEN);
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        encryptedAccessToken: platformEncrypted.ciphertext,
        status: MetaConnectionStatus.CONNECTED,
      });

      // Customer has a rogue/legacy MetaAccount in the database with different WABA
      const customerEncrypted = encryptSecret("rogue_customer_token");
      mockMetaAccounts.set(CUSTOMER_ORG_A, {
        id: "meta_rogue_customer",
        organizationId: CUSTOMER_ORG_A,
        wabaId: "999999999999999",
        phoneNumberId: "888888888888888",
        encryptedAccessToken: customerEncrypted.ciphertext,
        status: MetaConnectionStatus.CONNECTED,
      });

      // In SHARED_PLATFORM mode, outbound config MUST resolve platform account
      const resolved = await MetaConfigResolver.resolveOutboundConfig(CUSTOMER_ORG_A);
      expect(resolved.wabaId).toBe(PLATFORM_WABA);
      expect(resolved.phoneNumberId).toBe(PLATFORM_PHONE);
      expect(resolved.accessToken).toBe(PLATFORM_TOKEN);
      expect(resolved.isPlatform).toBe(true);
      expect(resolved.organizationId).toBe(CUSTOMER_ORG_A); // Preserves customer org context
    });
  });

  // ============================================================================
  // Suite 5: Tenant Isolation Across Campaigns, Contacts, and Preflight
  // ============================================================================
  describe("5. Tenant Isolation Across Preflight & Messaging Records", () => {
    it("preserves tenant organizationId and rejects cross-organization campaign access", async () => {
      const prisma = getPrismaClient();

      // Customer A tries to validate preflight for a campaign belonging to Customer B
      vi.spyOn(prisma.campaign, "findFirst").mockResolvedValueOnce(null);

      const preflight = await WhatsAppSendService.validatePreflight({
        organizationId: CUSTOMER_ORG_A,
        recipientPhone: "+15551234567",
        campaignId: "campaign_belonging_to_customer_b",
      });

      expect(preflight.valid).toBe(false);
      expect(preflight.errorCode).toBe("CAMPAIGN_NOT_FOUND");
    });

    it("strictly enforces contact ownership and OPTED_IN consent", async () => {
      const prisma = getPrismaClient();

      vi.spyOn(prisma.contact, "findFirst").mockResolvedValueOnce({
        id: "contact_1",
        organizationId: CUSTOMER_ORG_A,
        isSuppressed: false,
        consentStatus: ConsentStatus.PENDING,
      } as any);

      const preflight = await WhatsAppSendService.validatePreflight({
        organizationId: CUSTOMER_ORG_A,
        recipientPhone: "+15551234567",
        contactId: "contact_1",
      });

      expect(preflight.valid).toBe(false);
      expect(preflight.errorCode).toBe("CONSENT_REQUIRED");
    });
  });

  // ============================================================================
  // Suite 6: Dedicated Mode Preservation
  // ============================================================================
  describe("6. Dedicated Mode Preservation", () => {
    it("resolves dedicated customer MetaAccount when WHATSAPP_ACCOUNT_MODE is DEDICATED", async () => {
      process.env.WHATSAPP_ACCOUNT_MODE = "DEDICATED";

      const customerEncrypted = encryptSecret("dedicated_token_alpha");
      mockMetaAccounts.set(CUSTOMER_ORG_A, {
        id: "meta_dedicated_alpha",
        organizationId: CUSTOMER_ORG_A,
        wabaId: "333333333333333",
        phoneNumberId: "444444444444444",
        encryptedAccessToken: customerEncrypted.ciphertext,
        status: MetaConnectionStatus.CONNECTED,
      });

      const resolved = await MetaConfigResolver.resolveOutboundConfig(CUSTOMER_ORG_A);
      expect(resolved.source).toBe("DATABASE");
      expect(resolved.mode).toBe("DEDICATED");
      expect(resolved.wabaId).toBe("333333333333333");
      expect(resolved.accessToken).toBe("dedicated_token_alpha");
    });
  });

  // ============================================================================
  // Suite 7: Shared Platform Template Synchronization & Listing
  // ============================================================================
  describe("7. Shared Platform Template Synchronization & Listing", () => {
    beforeEach(() => {
      // Connect platform account
      const platformEncrypted = encryptSecret(PLATFORM_TOKEN);
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        displayPhoneNumber: "+1 555-0199",
        verifiedName: "Grovastra Platform",
        encryptedAccessToken: platformEncrypted.ciphertext,
        tokenKeyId: platformEncrypted.keyId,
        status: MetaConnectionStatus.CONNECTED,
      });

      const baseFetch = global.fetch;
      global.fetch = vi.fn().mockImplementation(async (url: string, init?: RequestInit) => {
        if (url.includes(`/${PLATFORM_WABA}/message_templates`)) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: [
                {
                  id: "tpl_101",
                  name: "seasonal_promo_v1",
                  language: "en_US",
                  status: "APPROVED",
                  category: "MARKETING",
                  components: [
                    { type: "BODY", text: "Hello {{1}}, enjoy 20% off!" },
                  ],
                },
                {
                  id: "tpl_102",
                  name: "order_update_v1",
                  language: "en_US",
                  status: "APPROVED",
                  category: "UTILITY",
                  components: [
                    { type: "BODY", text: "Your order {{1}} has shipped." },
                  ],
                },
              ],
            }),
          };
        }
        return baseFetch(url, init);
      });
      setAllowedTestTemplates([...ALLOWED_TEST_TEMPLATE_NAMES, "seasonal_promo_v1", "order_update_v1"]);
    });

    afterEach(() => {
      setAllowedTestTemplates(null);
    });

    it("allows customer organizations to list shared platform templates", async () => {
      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", CUSTOMER_ORG_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe(CUSTOMER_ORG_A);
      expect(res.body.data.templates).toHaveLength(2);
      expect(res.body.data.templates[0].name).toBe("seasonal_promo_v1");
      expect(res.body.data.templates[0].isSendable).toBe(true);
      expect(res.body.data.templates[1].name).toBe("order_update_v1");
    });

    it("allows customer organizations to sync shared platform templates", async () => {
      const res = await request(app)
        .post("/api/v1/templates/sync")
        .set("x-test-org-id", CUSTOMER_ORG_A);

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe(CUSTOMER_ORG_A);
      expect(res.body.data.summary.totalOnMeta).toBe(2);
      expect(res.body.data.summary.approvedCount).toBe(2);
    });

    it("allows customer organizations to retrieve and validate a specific template", async () => {
      const getRes = await request(app)
        .get("/api/v1/templates/seasonal_promo_v1")
        .set("x-test-org-id", CUSTOMER_ORG_A);

      expect(getRes.status).toBe(200);
      expect(getRes.body.data.name).toBe("seasonal_promo_v1");

      const valRes = await request(app)
        .post("/api/v1/templates/seasonal_promo_v1/validate")
        .set("x-test-org-id", CUSTOMER_ORG_A)
        .send({
          variables: { "1": "Alice" },
        });

      expect(valRes.status).toBe(200);
      expect(valRes.body.data.isValid).toBe(true);
      expect(valRes.body.data.errors).toEqual({});
    });

    it("fails closed when platform account is disconnected or unconfigured during template fetch", async () => {
      // Disconnect platform account
      mockMetaAccounts.set(PLATFORM_ORG_ID, {
        id: "meta_platform_1",
        organizationId: PLATFORM_ORG_ID,
        wabaId: PLATFORM_WABA,
        phoneNumberId: PLATFORM_PHONE,
        encryptedAccessToken: "DISCONNECTED",
        status: MetaConnectionStatus.DISCONNECTED,
      });

      const res = await request(app)
        .get("/api/v1/templates?force=true")
        .set("x-test-org-id", CUSTOMER_ORG_A);

      expect(res.status).toBe(400);
      expect(res.body.error.code).toBe("META_ACCOUNT_NOT_CONNECTED");
    });
  });
});
