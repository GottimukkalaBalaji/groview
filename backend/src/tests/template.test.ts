import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { RawMetaTemplate } from "../types/template.js";
import { getPrismaClient } from "../config/prisma.js";
import { MetaConnectionStatus } from "@prisma/client";
import { encryptSecret } from "../utils/encryption.js";
import { setAllowedTestTemplates, ALLOWED_TEST_TEMPLATE_NAMES } from "../constants/templateAllowlist.js";

// Sample Meta WABA API fixture data
const MOCK_RAW_TEMPLATES: RawMetaTemplate[] = [
  {
    id: "1630220355353093",
    name: "hello_world",
    language: "en_US",
    status: "APPROVED",
    category: "UTILITY",
    parameter_format: "POSITIONAL",
    components: [
      { type: "HEADER", format: "TEXT", text: "Hello World" },
      {
        type: "BODY",
        text: "Welcome and congratulations!! This message demonstrates your ability to send a WhatsApp message notification from the Cloud API, hosted by Meta. Thank you for taking the time to test with us.",
      },
      { type: "FOOTER", text: "WhatsApp Business Platform sample message" },
    ],
  },
  {
    id: "1103893482345974",
    name: "jaspers_market_plain_text_v1",
    language: "en_US",
    status: "APPROVED",
    category: "MARKETING",
    parameter_format: "POSITIONAL",
    components: [
      {
        type: "BODY",
        text: "Welcome to Jasper’s Market, your local grocery store providing farm-fresh produce and high-quality goods!",
      },
    ],
  },
  {
    id: "2923300844675149",
    name: "jaspers_market_order_confirmation_v1",
    language: "en_US",
    status: "APPROVED",
    category: "UTILITY",
    parameter_format: "POSITIONAL",
    components: [
      { type: "HEADER", format: "TEXT", text: "Order confirmed" },
      {
        type: "BODY",
        text: "Hi {{1}},\n\nThank you for your purchase! Your order number is {{2}}.\n\nWe'll start getting your farm fresh groceries ready to ship.\n\nEstimated delivery:  {{3}}.\n\nWe will let you know when your order ships.",
        example: {
          body_text: [["Valued Customer", "ORD-9921", "Tomorrow, 4 PM"]],
        },
      },
      { type: "FOOTER", text: "developers.facebook.com" },
      {
        type: "BUTTONS",
        buttons: [
          {
            type: "URL",
            text: "Visit order details",
            url: "https://developers.facebook.com/docs/whatsapp/business-management-api/message-templates/utility-templates",
          },
        ],
      },
    ],
  },
  {
    id: "1118349117607137",
    name: "m13b3_s3_hand_receipt",
    language: "en_US",
    status: "PENDING",
    category: "UTILITY",
    parameter_format: "POSITIONAL",
    components: [
      { type: "BODY", text: "Your hand receipt {{1}} has been registered." },
    ],
  },
];

describe("WhatsApp Template API & Service Layer (/api/v1/templates)", () => {
  let origMetaOrg: string | undefined;
  let origAccountMode: string | undefined;

  beforeEach(() => {
    origMetaOrg = process.env.META_ORGANIZATION_ID;
    origAccountMode = process.env.WHATSAPP_ACCOUNT_MODE;
    process.env.META_ORGANIZATION_ID = "org_default";
    process.env.WHATSAPP_ACCOUNT_MODE = "DEDICATED";
    whatsappTemplateService.clearCache();
    setAllowedTestTemplates([...ALLOWED_TEST_TEMPLATE_NAMES, "m13b3_s3_hand_receipt"]);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.META_ORGANIZATION_ID = origMetaOrg;
    process.env.WHATSAPP_ACCOUNT_MODE = origAccountMode;
    whatsappTemplateService.clearCache();
    setAllowedTestTemplates(null);
    vi.restoreAllMocks();
  });

  describe("Authentication & Tenant Isolation", () => {
    it("should reject unauthenticated request when auth is strictly enforced with HTTP 401", async () => {
      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-enforce-auth", "true");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("UNAUTHORIZED");
    });

    it("should allow authenticated tenant to fetch templates and attach organization context", async () => {
      // Mock global fetch for Meta API
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_RAW_TEMPLATES }),
      });

      // Mock database MetaAccount connection for org_tenant_1
      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
        id: "meta_test_tenant_1",
        organizationId: "org_tenant_1",
        wabaId: "1075305975271164",
        phoneNumberId: "105555555555555",
        displayPhoneNumber: null,
        verifiedName: "Tenant 1",
        encryptedAccessToken: encryptSecret("EAAGm0PX4ZCpsBAK_tenant_token").ciphertext,
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
        .set("x-test-org-id", "org_tenant_1");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      expect(res.body.data.organizationId).toBe("org_tenant_1");
      expect(res.body.data.templates).toBeInstanceOf(Array);
      expect(res.body.data.templates.length).toBe(4);
    });

    it("should return HTTP 404 META_CONFIG_UNAVAILABLE for tenant without connected MetaAccount or env fallback", async () => {
      const res = await request(app)
        .get("/api/v1/templates")
        .set("x-test-org-id", "unconnected_tenant_99");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_CONFIG_UNAVAILABLE");
    });
  });

  describe("Template Fetching, Normalization & Requested Templates", () => {
    it("should correctly identify and normalize the three requested templates", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_RAW_TEMPLATES }),
      });

      const res = await request(app).get("/api/v1/templates");

      expect(res.status).toBe(200);
      const summary = res.body.data.summary;
      expect(summary.requestedTemplatesFound.hello_world).toBe(true);
      expect(summary.requestedTemplatesFound.jaspers_market_plain_text_v1).toBe(true);
      expect(summary.requestedTemplatesFound.jaspers_market_order_confirmation_v1).toBe(true);

      const templates = res.body.data.templates;
      const helloWorld = templates.find((t: { name: string }) => t.name === "hello_world");
      expect(helloWorld).toBeDefined();
      expect(helloWorld.status).toBe("APPROVED");
      expect(helloWorld.isSendable).toBe(true);
      expect(helloWorld.variables).toHaveLength(0);

      const plainText = templates.find(
        (t: { name: string }) => t.name === "jaspers_market_plain_text_v1"
      );
      expect(plainText).toBeDefined();
      expect(plainText.status).toBe("APPROVED");
      expect(plainText.isSendable).toBe(true);
      expect(plainText.variables).toHaveLength(0);

      const orderConfirm = templates.find(
        (t: { name: string }) => t.name === "jaspers_market_order_confirmation_v1"
      );
      expect(orderConfirm).toBeDefined();
      expect(orderConfirm.status).toBe("APPROVED");
      expect(orderConfirm.isSendable).toBe(true);
      expect(orderConfirm.variables).toHaveLength(3);
      expect(orderConfirm.variables[0].key).toBe("1");
      expect(orderConfirm.variables[1].key).toBe("2");
      expect(orderConfirm.variables[2].key).toBe("3");
    });

    it("should handle multi-page results via Meta pagination (paging.next)", async () => {
      let callCount = 0;
      global.fetch = vi.fn().mockImplementation(async (_url: string) => {
        callCount++;
        if (callCount === 1) {
          return {
            ok: true,
            status: 200,
            json: async () => ({
              data: [MOCK_RAW_TEMPLATES[0], MOCK_RAW_TEMPLATES[1]],
              paging: { next: "https://graph.facebook.com/v22.0/test_waba/message_templates?after=page2" },
            }),
          };
        }
        return {
          ok: true,
          status: 200,
          json: async () => ({
            data: [MOCK_RAW_TEMPLATES[2], MOCK_RAW_TEMPLATES[3]],
          }),
        };
      });

      const { templates } = await whatsappTemplateService.fetchWabaTemplates(true);
      expect(callCount).toBe(2);
      expect(templates).toHaveLength(4);
    });
  });

  describe("Status Handling & Non-sendable Templates", () => {
    it("should flag PENDING templates as isSendable: false", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_RAW_TEMPLATES }),
      });

      const res = await request(app).get("/api/v1/templates");
      const pendingTpl = res.body.data.templates.find(
        (t: { name: string }) => t.name === "m13b3_s3_hand_receipt"
      );

      expect(pendingTpl).toBeDefined();
      expect(pendingTpl.status).toBe("PENDING");
      expect(pendingTpl.isSendable).toBe(false);
    });

    it("should return only APPROVED and sendable templates when ?approvedOnly=true is provided", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_RAW_TEMPLATES }),
      });

      const res = await request(app).get("/api/v1/templates?approvedOnly=true");
      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);

      const templates = res.body.data.templates;
      expect(templates.length).toBe(3);
      templates.forEach((t: { status: string; isSendable: boolean }) => {
        expect(t.status).toBe("APPROVED");
        expect(t.isSendable).toBe(true);
      });

      const pendingTpl = templates.find(
        (t: { name: string }) => t.name === "m13b3_s3_hand_receipt"
      );
      expect(pendingTpl).toBeUndefined();
    });

    it("should reject parameter validation on non-sendable / pending templates", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_RAW_TEMPLATES }),
      });

      const res = await request(app)
        .post("/api/v1/templates/m13b3_s3_hand_receipt/validate")
        .send({ variables: { "1": "RECEIPT_100" } });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.errors._template).toContain("is PENDING on Meta and cannot be sent");
    });
  });

  describe("Parameter Validation for jaspers_market_order_confirmation_v1", () => {
    beforeEach(() => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_RAW_TEMPLATES }),
      });
    });

    it("should fail validation when required positional parameters are missing", async () => {
      const res = await request(app)
        .post("/api/v1/templates/jaspers_market_order_confirmation_v1/validate")
        .send({
          variables: {
            "1": "Aarav Sharma",
            // "2" and "3" missing!
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(false);
      expect(res.body.data.errors["2"]).toBeDefined();
      expect(res.body.data.errors["3"]).toBeDefined();
      expect(res.body.data.errors["1"]).toBeUndefined();
    });

    it("should pass validation when all 3 parameters are supplied", async () => {
      const res = await request(app)
        .post("/api/v1/templates/jaspers_market_order_confirmation_v1/validate")
        .send({
          variables: {
            "1": "Aarav Sharma",
            "2": "ORD-2026-9912",
            "3": "Friday, Oct 16 by 5 PM",
          },
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isValid).toBe(true);
      expect(Object.keys(res.body.data.errors)).toHaveLength(0);
    });
  });

  describe("Meta API Error & Token Expiration Handling", () => {
    it("should translate Meta OAuth error 190 into META_AUTH_EXPIRED (HTTP 401)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 401,
        json: async () => ({
          error: {
            message: "Error validating access token: Session has expired",
            code: 190,
            error_subcode: 463,
            type: "OAuthException",
          },
        }),
      });

      const res = await request(app).get("/api/v1/templates?force=true");
      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_AUTH_EXPIRED");
      expect(res.body.error.message).toContain("META_WHATSAPP_ACCESS_TOKEN");
    });

    it("should handle single template not found with HTTP 404", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({ data: MOCK_RAW_TEMPLATES }),
      });

      const res = await request(app).get("/api/v1/templates/non_existent_template_xyz");
      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("NOT_FOUND");
    });

    it("should translate Meta permissions or generic API errors into META_API_ERROR (HTTP 502)", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: "(#200) Provide valid app permission to access this resource",
            code: 200,
            type: "OAuthException",
          },
        }),
      });

      const res = await request(app).get("/api/v1/templates?force=true");
      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_API_ERROR");
      expect(res.body.error.message).toContain("Meta Cloud API request failed");
    });

    it("should translate network timeout into META_API_TIMEOUT (HTTP 504)", async () => {
      global.fetch = vi.fn().mockImplementation(() => {
        const error = new Error("The operation was aborted");
        error.name = "AbortError";
        return Promise.reject(error);
      });

      const res = await request(app).get("/api/v1/templates?force=true");
      expect(res.status).toBe(504);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_API_TIMEOUT");
    });

    it("should translate network connection failures into META_NETWORK_ERROR (HTTP 502)", async () => {
      global.fetch = vi.fn().mockRejectedValue(new Error("connect ECONNREFUSED 127.0.0.1:443"));

      const res = await request(app).get("/api/v1/templates?force=true");
      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_NETWORK_ERROR");
    });
  });

  // ============================================================================
  // Testing Phase: Strict 3-Template Allowlist Enforcement
  // ============================================================================
  describe("Testing Phase: Strict 3-Template Allowlist Enforcement", () => {
    beforeEach(() => {
      // Strictly enforce default 3-template allowlist
      setAllowedTestTemplates(null);
      whatsappTemplateService.clearCache();

      const prisma = getPrismaClient();
      vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValue({
        id: "meta_default",
        organizationId: "org_default",
        wabaId: "1075305975271164",
        phoneNumberId: "phone_123",
        displayPhoneNumber: null,
        verifiedName: "Test Org",
        encryptedAccessToken: encryptSecret("mock_token").ciphertext,
        tokenKeyId: "v1",
        tokenExpiresAt: null,
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: new Date(),
        lastError: null,
        lastSyncedAt: new Date(),
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Meta returns 5 templates (3 allowlisted + 2 unallowlisted)
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            ...MOCK_RAW_TEMPLATES, // hello_world, jaspers_market_plain_text_v1, jaspers_market_order_confirmation_v1, m13b3_s3_hand_receipt
            {
              id: "999999999",
              name: "extra_unapproved_template",
              language: "en_US",
              status: "APPROVED",
              category: "MARKETING",
              components: [{ type: "BODY", text: "Extra body" }],
            },
          ],
        }),
      });
    });

    it("GET /api/v1/templates shows ONLY the three exact allowlisted template names", async () => {
      const res = await request(app).get("/api/v1/templates");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const names = res.body.data.templates.map((t: any) => t.name);

      expect(names).toEqual([
        "hello_world",
        "jaspers_market_plain_text_v1",
        "jaspers_market_order_confirmation_v1",
      ]);
      expect(names).not.toContain("m13b3_s3_hand_receipt");
      expect(names).not.toContain("extra_unapproved_template");
    });

    it("POST /api/v1/templates/sync synchronizes and restricts to the exact three allowlisted templates", async () => {
      const res = await request(app).post("/api/v1/templates/sync");

      expect(res.status).toBe(200);
      expect(res.body.success).toBe(true);
      const names = res.body.data.templates.map((t: any) => t.name);

      expect(names).toEqual([
        "hello_world",
        "jaspers_market_plain_text_v1",
        "jaspers_market_order_confirmation_v1",
      ]);
      expect(res.body.data.summary.totalOnMeta).toBe(3);
    });

    it("GET /api/v1/templates/:name rejects non-allowlisted template with HTTP 404", async () => {
      const res = await request(app).get("/api/v1/templates/extra_unapproved_template");

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("restricted to testing allowlist");
    });

    it("POST /api/v1/templates/:name/validate rejects non-allowlisted template with HTTP 404", async () => {
      const res = await request(app)
        .post("/api/v1/templates/extra_unapproved_template/validate")
        .send({ variables: { "1": "Test" } });

      expect(res.status).toBe(404);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).toContain("restricted to testing allowlist");
    });

    it("displays real Meta status and disables sending if an allowlisted template is not APPROVED", async () => {
      // Mock Meta returning jaspers_market_plain_text_v1 as REJECTED
      global.fetch = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          data: [
            {
              id: "1630220355353093",
              name: "hello_world",
              language: "en_US",
              status: "APPROVED",
              category: "UTILITY",
              components: [],
            },
            {
              id: "1103893482345974",
              name: "jaspers_market_plain_text_v1",
              language: "en_US",
              status: "REJECTED",
              category: "MARKETING",
              components: [],
            },
            {
              id: "2923300844675149",
              name: "jaspers_market_order_confirmation_v1",
              language: "en_US",
              status: "APPROVED",
              category: "UTILITY",
              components: [],
            },
          ],
        }),
      });

      const res = await request(app).get("/api/v1/templates");

      expect(res.status).toBe(200);
      const plainText = res.body.data.templates.find((t: any) => t.name === "jaspers_market_plain_text_v1");
      expect(plainText).toBeDefined();
      expect(plainText.status).toBe("REJECTED");
      expect(plainText.isSendable).toBe(false);
    });
  });
});
