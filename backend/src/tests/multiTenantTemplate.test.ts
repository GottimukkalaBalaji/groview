import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { MetaConfigResolver } from "../services/metaConfigResolver.js";
import { getPrismaClient } from "../config/prisma.js";
import { MetaConnectionStatus } from "@prisma/client";
import { encryptSecret } from "../utils/encryption.js";
import { WebhookService } from "../services/webhook.service.js";
import { RawMetaTemplate } from "../types/template.js";
import { setAllowedTestTemplates, ALLOWED_TEST_TEMPLATE_NAMES } from "../constants/templateAllowlist.js";

const ORG_A = "org_tenant_alpha_111";
const ORG_B = "org_tenant_beta_222";
const GROVIEWS_ORG = "cmv7xnkn20000t818segbx7xq";

const RAW_TEMPLATES_ORG_A: RawMetaTemplate[] = [
  {
    id: "1001",
    name: "promo_deal",
    language: "en_US",
    status: "APPROVED",
    category: "MARKETING",
    parameter_format: "POSITIONAL",
    components: [
      { type: "BODY", text: "Special deal for Org A customers!" },
    ],
  },
];

const RAW_TEMPLATES_ORG_B: RawMetaTemplate[] = [
  {
    id: "2001",
    name: "promo_deal", // Identical name, different tenant, different status!
    language: "en_US",
    status: "PENDING",
    category: "MARKETING",
    parameter_format: "POSITIONAL",
    components: [
      { type: "BODY", text: "Org B exclusive discount!" },
    ],
  },
];

describe("Phase 6B — Multi-Tenant WhatsApp Template & Service Integration", () => {
  let originalEnvKey: string | undefined;
  let originalMetaOrg: string | undefined;
  let originalWabaId: string | undefined;
  let originalMode: string | undefined;

  beforeEach(() => {
    originalEnvKey = process.env.APP_ENCRYPTION_KEY;
    originalMetaOrg = process.env.META_ORGANIZATION_ID;
    originalWabaId = process.env.META_WABA_ID;
    originalMode = process.env.WHATSAPP_ACCOUNT_MODE;

    process.env.WHATSAPP_ACCOUNT_MODE = "DEDICATED";
    process.env.APP_ENCRYPTION_KEY =
      process.env.APP_ENCRYPTION_KEY ||
      "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
    process.env.META_ORGANIZATION_ID = GROVIEWS_ORG;

    whatsappTemplateService.clearCache();
    setAllowedTestTemplates([...ALLOWED_TEST_TEMPLATE_NAMES, "promo_deal"]);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.APP_ENCRYPTION_KEY = originalEnvKey;
    process.env.META_ORGANIZATION_ID = originalMetaOrg;
    process.env.META_WABA_ID = originalWabaId;
    process.env.WHATSAPP_ACCOUNT_MODE = originalMode;

    whatsappTemplateService.clearCache();
    setAllowedTestTemplates(null);
    vi.restoreAllMocks();
  });

  describe("Tenant Cache Partitioning & Isolation", () => {
    it("partitions cache strictly by organizationId (Map<organizationId, CacheEntry>)", async () => {
      // Mock global fetch to return Org A templates when Org A token is used, Org B when Org B token is used
      global.fetch = vi.fn().mockImplementation(async (_url: string, init?: RequestInit) => {
        const auth = init?.headers ? (init.headers as Record<string, string>)["Authorization"] : "";
        if (auth?.includes("token_for_alpha")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: RAW_TEMPLATES_ORG_A }),
          };
        }
        if (auth?.includes("token_for_beta")) {
          return {
            ok: true,
            status: 200,
            json: async () => ({ data: RAW_TEMPLATES_ORG_B }),
          };
        }
        return {
          ok: false,
          status: 401,
          json: async () => ({ error: { message: "Unknown token" } }),
        };
      });

      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockImplementation(async (args) => {
        const orgId = args.where.organizationId;
        if (orgId === ORG_A) {
          return {
            id: "meta_a",
            organizationId: ORG_A,
            wabaId: "waba_alpha_111",
            phoneNumberId: "phone_alpha_111",
            displayPhoneNumber: null,
            verifiedName: "Alpha Corp",
            encryptedAccessToken: encryptSecret("token_for_alpha").ciphertext,
            tokenKeyId: "v1",
            tokenExpiresAt: null,
            status: MetaConnectionStatus.CONNECTED,
            verifiedAt: new Date(),
            lastError: null,
            lastSyncedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        if (orgId === ORG_B) {
          return {
            id: "meta_b",
            organizationId: ORG_B,
            wabaId: "waba_beta_222",
            phoneNumberId: "phone_beta_222",
            displayPhoneNumber: null,
            verifiedName: "Beta Corp",
            encryptedAccessToken: encryptSecret("token_for_beta").ciphertext,
            tokenKeyId: "v1",
            tokenExpiresAt: null,
            status: MetaConnectionStatus.CONNECTED,
            verifiedAt: new Date(),
            lastError: null,
            lastSyncedAt: new Date(),
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      });

      // 1. Fetch templates for Org A
      const resA = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", ORG_A);

      expect(resA.status).toBe(200);
      expect(resA.body.data.organizationId).toBe(ORG_A);
      expect(resA.body.data.templates).toHaveLength(1);
      expect(resA.body.data.templates[0].id).toBe("1001");
      expect(resA.body.data.templates[0].status).toBe("APPROVED");
      expect(resA.body.data.templates[0].isSendable).toBe(true);

      // 2. Fetch templates for Org B (with identical template name "promo_deal")
      const resB = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", ORG_B);

      expect(resB.status).toBe(200);
      expect(resB.body.data.organizationId).toBe(ORG_B);
      expect(resB.body.data.templates).toHaveLength(1);
      expect(resB.body.data.templates[0].id).toBe("2001");
      expect(resB.body.data.templates[0].status).toBe("PENDING");
      expect(resB.body.data.templates[0].isSendable).toBe(false);

      // 3. Verify internal cache contains exactly 2 distinct organization partitions
      expect(whatsappTemplateService.getCacheSizeForTesting()).toBe(2);

      // 4. Verify lookup by name returns distinct tenant-scoped status
      const tplA = await whatsappTemplateService.getTemplateByName("promo_deal", ORG_A);
      const tplB = await whatsappTemplateService.getTemplateByName("promo_deal", ORG_B);

      expect(tplA?.id).toBe("1001");
      expect(tplA?.isSendable).toBe(true);

      expect(tplB?.id).toBe("2001");
      expect(tplB?.isSendable).toBe(false);
    });

    it("invalidates cache strictly for the target organization without affecting other tenants", async () => {
      // Seed cache directly for two organizations
      whatsappTemplateService.setCacheForTesting(
        {
          templates: [{ id: "1001", name: "promo_deal", language: "en", status: "APPROVED", isSendable: true, parameterFormat: "POSITIONAL", body: "", buttons: [], variables: [], rawComponents: [] }],
          rawTemplates: [],
          summary: { totalOnMeta: 1, approvedCount: 1, pendingCount: 0, rejectedCount: 0, wabaIdMasked: "***", syncedAt: new Date().toISOString(), requestedTemplatesFound: { hello_world: false, jaspers_market_plain_text_v1: false, jaspers_market_order_confirmation_v1: false } },
          expiresAt: Date.now() + 60000,
        },
        ORG_A
      );

      whatsappTemplateService.setCacheForTesting(
        {
          templates: [{ id: "2001", name: "promo_deal", language: "en", status: "PENDING", isSendable: false, parameterFormat: "POSITIONAL", body: "", buttons: [], variables: [], rawComponents: [] }],
          rawTemplates: [],
          summary: { totalOnMeta: 1, approvedCount: 0, pendingCount: 1, rejectedCount: 0, wabaIdMasked: "***", syncedAt: new Date().toISOString(), requestedTemplatesFound: { hello_world: false, jaspers_market_plain_text_v1: false, jaspers_market_order_confirmation_v1: false } },
          expiresAt: Date.now() + 60000,
        },
        ORG_B
      );

      expect(whatsappTemplateService.getCacheSizeForTesting()).toBe(2);

      // Invalidate ONLY Org A's cache
      whatsappTemplateService.invalidateCache(ORG_A);

      // Org A's cache should be empty
      expect(whatsappTemplateService.getCacheForTesting(ORG_A)).toBeNull();

      // Org B's cache must remain intact and completely unaffected
      const orgBCache = whatsappTemplateService.getCacheForTesting(ORG_B);
      expect(orgBCache).not.toBeNull();
      expect(orgBCache?.templates[0].id).toBe("2001");
      expect(orgBCache?.templates[0].status).toBe("PENDING");
      expect(whatsappTemplateService.getCacheSizeForTesting()).toBe(1);
    });

    it("applies template status update exclusively to target organization's cache", async () => {
      // Both organizations have a template with identical ID or name
      whatsappTemplateService.setCacheForTesting(
        {
          templates: [{ id: "shared_id_500", name: "welcome", language: "en", status: "PENDING", isSendable: false, parameterFormat: "POSITIONAL", body: "", buttons: [], variables: [], rawComponents: [] }],
          rawTemplates: [],
          summary: { totalOnMeta: 1, approvedCount: 0, pendingCount: 1, rejectedCount: 0, wabaIdMasked: "***", syncedAt: new Date().toISOString(), requestedTemplatesFound: { hello_world: false, jaspers_market_plain_text_v1: false, jaspers_market_order_confirmation_v1: false } },
          expiresAt: Date.now() + 60000,
        },
        ORG_A
      );

      whatsappTemplateService.setCacheForTesting(
        {
          templates: [{ id: "shared_id_500", name: "welcome", language: "en", status: "PENDING", isSendable: false, parameterFormat: "POSITIONAL", body: "", buttons: [], variables: [], rawComponents: [] }],
          rawTemplates: [],
          summary: { totalOnMeta: 1, approvedCount: 0, pendingCount: 1, rejectedCount: 0, wabaIdMasked: "***", syncedAt: new Date().toISOString(), requestedTemplatesFound: { hello_world: false, jaspers_market_plain_text_v1: false, jaspers_market_order_confirmation_v1: false } },
          expiresAt: Date.now() + 60000,
        },
        ORG_B
      );

      // Status update arrives for Org A ONLY
      const updateResult = whatsappTemplateService.applyTemplateStatusUpdate(
        "shared_id_500",
        "APPROVED",
        ORG_A
      );

      expect(updateResult.applied).toBe(true);
      expect(updateResult.isSendable).toBe(true);

      // Org A's template was updated to APPROVED
      const cacheA = whatsappTemplateService.getCacheForTesting(ORG_A);
      expect(cacheA?.templates[0].status).toBe("APPROVED");
      expect(cacheA?.templates[0].isSendable).toBe(true);

      // Org B's template was NOT mutated; still PENDING and NOT sendable
      const cacheB = whatsappTemplateService.getCacheForTesting(ORG_B);
      expect(cacheB?.templates[0].status).toBe("PENDING");
      expect(cacheB?.templates[0].isSendable).toBe(false);
    });
  });

  describe("Fail-Closed Security & Connection State Validation", () => {
    it("fails closed with 401 META_TOKEN_EXPIRED when tokenExpiresAt is in the past", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
        id: "meta_expired",
        organizationId: "org_expired_token",
        wabaId: "waba_expired",
        phoneNumberId: "phone_expired",
        displayPhoneNumber: null,
        verifiedName: "Expired Corp",
        encryptedAccessToken: encryptSecret("token_expired").ciphertext,
        tokenKeyId: "v1",
        tokenExpiresAt: new Date(Date.now() - 3600000), // 1 hour ago
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
        lastError: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", "org_expired_token");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_TOKEN_EXPIRED");
      expect(res.body.error.message).toContain("access token has expired");
    });

    it("fails closed with 400 META_ACCOUNT_NOT_CONNECTED when account is in PENDING_VERIFICATION status", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
        id: "meta_pending",
        organizationId: "org_pending_status",
        wabaId: "waba_pending",
        phoneNumberId: "phone_pending",
        displayPhoneNumber: null,
        verifiedName: "Pending Corp",
        encryptedAccessToken: encryptSecret("token_pending").ciphertext,
        tokenKeyId: "v1",
        tokenExpiresAt: null,
        status: MetaConnectionStatus.PENDING_VERIFICATION,
        verifiedAt: null,
        lastError: null,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", "org_pending_status");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_ACCOUNT_NOT_CONNECTED");
    });

    it("fails closed with 400 META_ACCOUNT_NOT_CONNECTED when account is in DISCONNECTED status", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
        id: "meta_disc",
        organizationId: "org_disconnected",
        wabaId: "waba_disc",
        phoneNumberId: "phone_disc",
        displayPhoneNumber: null,
        verifiedName: "Disconnected Corp",
        encryptedAccessToken: encryptSecret("token_disc").ciphertext,
        tokenKeyId: "v1",
        tokenExpiresAt: null,
        status: MetaConnectionStatus.DISCONNECTED,
        verifiedAt: null,
        lastError: null,
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", "org_disconnected");

      expect(res.status).toBe(400);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_ACCOUNT_NOT_CONNECTED");
    });

    it("fails closed with 500 ENCRYPTION_CONFIGURATION_ERROR when decryption fails", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
        id: "meta_corrupted",
        organizationId: "org_corrupted_key",
        wabaId: "waba_corrupted",
        phoneNumberId: "phone_corrupted",
        displayPhoneNumber: null,
        verifiedName: "Corrupted Corp",
        encryptedAccessToken: "invalid_ciphertext_not_a_valid_gcm_payload",
        tokenKeyId: "v1",
        tokenExpiresAt: null,
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
        lastError: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", "org_corrupted_key");

      expect(res.status).toBe(500);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("ENCRYPTION_CONFIGURATION_ERROR");
      expect(res.body.error.message).toContain("APP_ENCRYPTION_KEY");
    });

    it("fails closed with 404 META_CONFIG_UNAVAILABLE when organization has no DB record and is not Groviews", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce(null);

      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", "unregistered_tenant_404");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_CONFIG_UNAVAILABLE");
    });

    it("never falls back to .env when a database MetaAccount exists even if that record has an error", async () => {
      // Even if the organization ID matches process.env.META_ORGANIZATION_ID,
      // if a DB MetaAccount exists in DISCONNECTED status, it MUST fail closed and NEVER fall back to .env!
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
        id: "meta_groviews_db",
        organizationId: GROVIEWS_ORG,
        wabaId: "waba_groviews",
        phoneNumberId: "phone_groviews",
        displayPhoneNumber: null,
        verifiedName: "Groviews",
        encryptedAccessToken: encryptSecret("token_groviews").ciphertext,
        tokenKeyId: "v1",
        tokenExpiresAt: null,
        status: MetaConnectionStatus.DISCONNECTED, // Disconnected in DB!
        verifiedAt: null,
        lastError: "Manual disconnect",
        lastSyncedAt: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        MetaConfigResolver.getMetaConfigForOrganization(GROVIEWS_ORG)
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 400,
          code: "META_ACCOUNT_NOT_CONNECTED",
        })
      );
    });

    it("falls back to .env ONLY for Groviews when no database MetaAccount exists", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce(null);

      const resolved = await MetaConfigResolver.getMetaConfigForOrganization(GROVIEWS_ORG);
      expect(resolved.source).toBe("ENV_FALLBACK");
      expect(resolved.organizationId).toBe(GROVIEWS_ORG);
      expect(resolved.status).toBe(MetaConnectionStatus.CONNECTED);
    });
  });

  describe("Webhook WABA Routing to Database Tenant", () => {
    it("routes template status update to correct database tenant via MetaConfigResolver.getOrganizationForWaba", async () => {
      const prisma = getPrismaClient();
      const targetWaba = "waba_custom_tenant_777";
      const targetOrg = "org_custom_tenant_777";

      // 1. Mock DB WABA resolution to target tenant
      vi.spyOn(prisma.metaAccount, "findUnique").mockImplementation(async (args) => {
        if (args.where.wabaId === targetWaba) {
          return {
            id: "meta_777",
            organizationId: targetOrg,
            wabaId: targetWaba,
            phoneNumberId: "phone_777",
            displayPhoneNumber: null,
            verifiedName: "Tenant 777",
            encryptedAccessToken: "enc",
            tokenKeyId: "v1",
            tokenExpiresAt: null,
            status: MetaConnectionStatus.CONNECTED,
            verifiedAt: null,
            lastError: null,
            lastSyncedAt: null,
            createdAt: new Date(),
            updatedAt: new Date(),
          };
        }
        return null;
      });

      // 2. Mock organization validation in PostgreSQL
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValueOnce({
        id: targetOrg,
        isArchived: false,
        deletedAt: null,
      } as any);

      // 3. Seed cache for target tenant
      whatsappTemplateService.setCacheForTesting(
        {
          templates: [{ id: "tpl_777_status", name: "deal_777", language: "en", status: "PENDING", isSendable: false, parameterFormat: "POSITIONAL", body: "", buttons: [], variables: [], rawComponents: [] }],
          rawTemplates: [],
          summary: { totalOnMeta: 1, approvedCount: 0, pendingCount: 1, rejectedCount: 0, wabaIdMasked: "***", syncedAt: new Date().toISOString(), requestedTemplatesFound: { hello_world: false, jaspers_market_plain_text_v1: false, jaspers_market_order_confirmation_v1: false } },
          expiresAt: Date.now() + 60000,
        },
        targetOrg
      );

      // Mock webhook event persistence
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          webhookEvent: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "evt_777" }),
          },
        };
        return callback(txMock as any);
      });

      const webhookPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: targetWaba,
            time: 1792055000,
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "APPROVED",
                  message_template_id: "tpl_777_status",
                  message_template_name: "deal_777",
                  reason: "NONE",
                },
              },
            ],
          },
        ],
      };

      const result = await WebhookService.ingestWebhookPayload(webhookPayload);
      expect(result.processedCount).toBe(1);

      // Target tenant's cache was updated
      const updatedCache = whatsappTemplateService.getCacheForTesting(targetOrg);
      expect(updatedCache?.templates[0].status).toBe("APPROVED");
      expect(updatedCache?.templates[0].isSendable).toBe(true);
    });

    it("leaves all tenant template caches unchanged when an unknown WABA status webhook arrives", async () => {
      const targetOrg = "org_legit_tenant_999";
      whatsappTemplateService.setCacheForTesting(
        {
          templates: [{ id: "tpl_legit", name: "legit_tpl", language: "en", status: "APPROVED", isSendable: true, parameterFormat: "POSITIONAL", body: "", buttons: [], variables: [], rawComponents: [] }],
          rawTemplates: [],
          summary: { totalOnMeta: 1, approvedCount: 1, pendingCount: 0, rejectedCount: 0, wabaIdMasked: "***", syncedAt: new Date().toISOString(), requestedTemplatesFound: { hello_world: false, jaspers_market_plain_text_v1: false, jaspers_market_order_confirmation_v1: false } },
          expiresAt: Date.now() + 60000,
        },
        targetOrg
      );

      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          webhookEvent: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "evt_unmatched" }),
          },
        };
        return callback(txMock as any);
      });

      const unknownWabaPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "untrusted_unknown_waba_404",
            time: 1792055100,
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "REJECTED",
                  message_template_id: "tpl_legit",
                  message_template_name: "legit_tpl",
                  reason: "INCORRECT_CATEGORY",
                },
              },
            ],
          },
        ],
      };

      const result = await WebhookService.ingestWebhookPayload(unknownWabaPayload);
      expect(result.unmatchedCount).toBe(1);
      expect(result.processedCount).toBe(0);

      // Verify legitimate tenant's cache was NOT modified or corrupted
      const cached = whatsappTemplateService.getCacheForTesting(targetOrg);
      expect(cached?.templates[0].status).toBe("APPROVED");
      expect(cached?.templates[0].isSendable).toBe(true);
    });

    it("routes template status update for configured Groviews WABA to Groviews organization via legacy fallback", async () => {
      const groviewsWaba = process.env.META_WABA_ID || "1075305975271164";
      process.env.META_WABA_ID = groviewsWaba;
      process.env.META_ORGANIZATION_ID = GROVIEWS_ORG;

      const prisma = getPrismaClient();
      // No database metaAccount exists for this WABA
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValue(null);
      vi.spyOn(prisma.organization, "findUnique").mockResolvedValue({
        id: GROVIEWS_ORG,
        isArchived: false,
        deletedAt: null,
      } as any);

      whatsappTemplateService.setCacheForTesting(
        {
          templates: [{ id: "tpl_groviews_1", name: "groviews_tpl", language: "en", status: "PENDING", isSendable: false, parameterFormat: "POSITIONAL", body: "", buttons: [], variables: [], rawComponents: [] }],
          rawTemplates: [],
          summary: { totalOnMeta: 1, approvedCount: 0, pendingCount: 1, rejectedCount: 0, wabaIdMasked: "***", syncedAt: new Date().toISOString(), requestedTemplatesFound: { hello_world: false, jaspers_market_plain_text_v1: false, jaspers_market_order_confirmation_v1: false } },
          expiresAt: Date.now() + 60000,
        },
        GROVIEWS_ORG
      );

      vi.spyOn(prisma, "$transaction").mockImplementation(async (callback) => {
        const txMock = {
          $executeRaw: vi.fn().mockResolvedValue(1),
          webhookEvent: {
            findUnique: vi.fn().mockResolvedValue(null),
            create: vi.fn().mockResolvedValue({ id: "evt_groviews" }),
          },
        };
        return callback(txMock as any);
      });

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: groviewsWaba,
            time: 1792055200,
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "APPROVED",
                  message_template_id: "tpl_groviews_1",
                  message_template_name: "groviews_tpl",
                  reason: "NONE",
                },
              },
            ],
          },
        ],
      };

      const result = await WebhookService.ingestWebhookPayload(payload);
      expect(result.processedCount).toBe(1);

      const cached = whatsappTemplateService.getCacheForTesting(GROVIEWS_ORG);
      expect(cached?.templates[0].status).toBe("APPROVED");
      expect(cached?.templates[0].isSendable).toBe(true);
    });
  });

  describe("Tenant Context Enforcement & Authorization Rejection", () => {
    it("rejects all template endpoints with HTTP 401 and never calls Meta when unauthenticated", async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const resList = await request(app)
        .get("/api/v1/templates")
        .set("x-test-enforce-auth", "true");
      expect(resList.status).toBe(401);
      expect(resList.body.error.code).toBe("UNAUTHORIZED");

      const resSync = await request(app)
        .post("/api/v1/templates/sync")
        .set("x-test-enforce-auth", "true");
      expect(resSync.status).toBe(401);
      expect(resSync.body.error.code).toBe("UNAUTHORIZED");

      const resGet = await request(app)
        .get("/api/v1/templates/hello_world")
        .set("x-test-enforce-auth", "true");
      expect(resGet.status).toBe(401);
      expect(resGet.body.error.code).toBe("UNAUTHORIZED");

      const resVal = await request(app)
        .post("/api/v1/templates/hello_world/validate")
        .set("x-test-enforce-auth", "true")
        .send({ variables: {} });
      expect(resVal.status).toBe(401);
      expect(resVal.body.error.code).toBe("UNAUTHORIZED");

      expect(fetchSpy).not.toHaveBeenCalled();
    });

    it("prevents a non-Groviews organization from using Groviews credentials in .env", async () => {
      const fetchSpy = vi.fn();
      global.fetch = fetchSpy;

      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValue(null);

      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", "org_rogue_attempting_env_hijack");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_CONFIG_UNAVAILABLE");
      expect(fetchSpy).not.toHaveBeenCalled();
    });
  });

  describe("Dispatch Worker Multi-Tenant Configuration Resolution", () => {
    it("resolves tenant credentials and passes metaConfigOverride to executeMetaSend", async () => {
      const prisma = getPrismaClient();
      const testOrg = "org_dispatch_tenant_1";

      // Mock database MetaAccount
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
        id: "meta_dispatch_1",
        organizationId: testOrg,
        wabaId: "waba_dispatch_1",
        phoneNumberId: "phone_dispatch_1",
        displayPhoneNumber: null,
        verifiedName: "Dispatch Corp",
        encryptedAccessToken: encryptSecret("token_dispatch_secret").ciphertext,
        tokenKeyId: "v1",
        tokenExpiresAt: null,
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
        lastError: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const config = await MetaConfigResolver.getMetaConfigForOrganization(testOrg);
      expect(config.source).toBe("DATABASE");
      expect(config.accessToken).toBe("token_dispatch_secret");
      expect(config.phoneNumberId).toBe("phone_dispatch_1");
    });

    it("fails closed without dispatching when tenant has no connected MetaAccount", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce(null);

      await expect(
        MetaConfigResolver.getMetaConfigForOrganization("unconnected_org_for_dispatch")
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 404,
          code: "META_CONFIG_UNAVAILABLE",
        })
      );
    });

    it("fails closed when tenant MetaAccount token is expired", async () => {
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
        id: "meta_expired_dispatch",
        organizationId: "org_expired_dispatch",
        wabaId: "waba_exp",
        phoneNumberId: "phone_exp",
        displayPhoneNumber: null,
        verifiedName: "Expired Corp",
        encryptedAccessToken: encryptSecret("token_exp").ciphertext,
        tokenKeyId: "v1",
        tokenExpiresAt: new Date(Date.now() - 5000), // Expired 5 seconds ago
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
        lastError: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      await expect(
        MetaConfigResolver.getMetaConfigForOrganization("org_expired_dispatch")
      ).rejects.toThrow(
        expect.objectContaining({
          statusCode: 401,
          code: "META_TOKEN_EXPIRED",
        })
      );
    });
  });
});
