import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { getPrismaClient } from "../config/prisma.js";
import { MetaConnectionStatus } from "@prisma/client";
import { encryptSecret } from "../utils/encryption.js";
import { setAllowedTestTemplates, ALLOWED_TEST_TEMPLATE_NAMES, isAllowedTestTemplate } from "../constants/templateAllowlist.js";

const VALID_SUBMISSION_PAYLOAD = {
  name: "spring_exclusive_offer",
  category: "MARKETING",
  language: "en_US",
  components: [
    {
      type: "HEADER",
      format: "TEXT",
      text: "Special Spring Offer!",
    },
    {
      type: "BODY",
      text: "Hello {{1}}! Enjoy our exclusive spring collection with {{2}}% off using code {{3}}.",
      example: {
        body_text: [["Priya", "25", "SPRING25"]],
      },
    },
    {
      type: "FOOTER",
      text: "Reply STOP to unsubscribe.",
    },
    {
      type: "BUTTONS",
      buttons: [
        {
          type: "URL",
          text: "Shop Now",
          url: "https://grovastra.com/spring",
        },
        {
          type: "PHONE_NUMBER",
          text: "Call Support",
          phone_number: "+15551234567",
        },
      ],
    },
  ],
};

describe("Meta WhatsApp Template Submission API (POST /api/v1/templates)", () => {
  let origMetaOrg: string | undefined;
  let origAccountMode: string | undefined;

  beforeEach(() => {
    origMetaOrg = process.env.META_ORGANIZATION_ID;
    origAccountMode = process.env.WHATSAPP_ACCOUNT_MODE;
    process.env.META_ORGANIZATION_ID = "org_default";
    process.env.WHATSAPP_ACCOUNT_MODE = "DEDICATED";
    whatsappTemplateService.clearCache();
    setAllowedTestTemplates([...ALLOWED_TEST_TEMPLATE_NAMES]);
    vi.restoreAllMocks();
  });

  afterEach(() => {
    process.env.META_ORGANIZATION_ID = origMetaOrg;
    process.env.WHATSAPP_ACCOUNT_MODE = origAccountMode;
    whatsappTemplateService.clearCache();
    setAllowedTestTemplates(null);
    vi.restoreAllMocks();
  });

  describe("1. Validation & Schema Enforcement (Pre-submission checks)", () => {
    it("rejects template with uppercase or special characters in name", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .send({
          ...VALID_SUBMISSION_PAYLOAD,
          name: "Spring-Offer-2026!",
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.details)).toContain("lowercase alphanumeric");
    });

    it("rejects template without a BODY component", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .send({
          ...VALID_SUBMISSION_PAYLOAD,
          components: [
            { type: "HEADER", format: "TEXT", text: "Only Header" },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.details)).toContain("exactly one BODY component");
    });

    it("rejects non-sequential body variables (e.g. {{1}} and {{3}} skipping {{2}})", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .send({
          ...VALID_SUBMISSION_PAYLOAD,
          components: [
            {
              type: "BODY",
              text: "Hello {{1}}, your order {{3}} is ready.",
              example: { body_text: [["John", "ORD-123"]] },
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.details)).toContain("Body variables must be sequential starting at {{1}}");
    });

    it("rejects body variables with missing or incomplete sample values", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .send({
          ...VALID_SUBMISSION_PAYLOAD,
          components: [
            {
              type: "BODY",
              text: "Hello {{1}}, code {{2}}.",
              example: { body_text: [["OnlyOneSample"]] },
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.details)).toContain("sample value");
    });

    it("rejects footer containing variables", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .send({
          ...VALID_SUBMISSION_PAYLOAD,
          components: [
            {
              type: "BODY",
              text: "Hello world",
            },
            {
              type: "FOOTER",
              text: "Footer with {{1}} variable",
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.details)).toContain("Footer text cannot contain variables");
    });

    it("rejects invalid URL in URL buttons", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .send({
          ...VALID_SUBMISSION_PAYLOAD,
          components: [
            {
              type: "BODY",
              text: "Hello world",
            },
            {
              type: "BUTTONS",
              buttons: [
                {
                  type: "URL",
                  text: "Bad URL",
                  url: "not-a-valid-url",
                },
              ],
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.details)).toContain("valid URL");
    });

    it("rejects invalid phone number in PHONE_NUMBER buttons", async () => {
      const res = await request(app)
        .post("/api/v1/templates")
        .send({
          ...VALID_SUBMISSION_PAYLOAD,
          components: [
            {
              type: "BODY",
              text: "Hello world",
            },
            {
              type: "BUTTONS",
              buttons: [
                {
                  type: "PHONE_NUMBER",
                  text: "Support",
                  phone_number: "invalid-phone",
                },
              ],
            },
          ],
        });

      expect(res.status).toBe(422);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("VALIDATION_ERROR");
      expect(JSON.stringify(res.body.error.details)).toContain("valid E.164 phone number");
    });
  });

  describe("2. Successful Submission to Meta API", () => {
    it("submits valid template to Meta Graph API and returns PENDING status with Meta ID", async () => {
      const metaFetchMock = vi.fn().mockResolvedValue({
        ok: true,
        status: 200,
        json: async () => ({
          id: "9988776655443322",
          status: "PENDING",
          category: "MARKETING",
        }),
      });
      global.fetch = metaFetchMock;

      const res = await request(app)
        .post("/api/v1/templates")
        .send(VALID_SUBMISSION_PAYLOAD);

      expect(res.status).toBe(201);
      expect(res.body.success).toBe(true);
      expect(res.body.data.id).toBe("9988776655443322");
      expect(res.body.data.name).toBe("spring_exclusive_offer");
      expect(res.body.data.status).toBe("PENDING");
      expect(res.body.data.status).not.toBe("APPROVED"); // Must not infer approval
      expect(res.body.data.category).toBe("MARKETING");
      expect(res.body.data.language).toBe("en_US");

      // Verify Meta fetch was called with correct endpoint and sanitized payload
      expect(metaFetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledInit] = metaFetchMock.mock.calls[0];
      expect(calledUrl).toContain("/message_templates");
      expect(calledInit.method).toBe("POST");
      const sentBody = JSON.parse(calledInit.body);
      expect(sentBody.name).toBe("spring_exclusive_offer");
      expect(sentBody.components).toHaveLength(4);

      // Verify the template was added to allowlist dynamically
      expect(isAllowedTestTemplate("spring_exclusive_offer")).toBe(true);
    });
  });

  describe("3. Meta API Error Handling & Sanitization", () => {
    it("handles expired Meta access token (code 190) with HTTP 401 META_AUTH_EXPIRED", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: "Error validating access token: Session has expired on Thursday, 22-Oct-26 23:00:00 PDT.",
            code: 190,
          },
        }),
      });

      const res = await request(app)
        .post("/api/v1/templates")
        .send(VALID_SUBMISSION_PAYLOAD);

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_AUTH_EXPIRED");
      expect(res.body.error.message).toContain("expired or is invalid");
    });

    it("handles duplicate template name (code 100 / subcode 2388042) with HTTP 409 TEMPLATE_NAME_EXISTS", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 400,
        json: async () => ({
          error: {
            message: "(#100) A template with this name already exists in this language",
            code: 100,
            error_subcode: 2388042,
          },
        }),
      });

      const res = await request(app)
        .post("/api/v1/templates")
        .send(VALID_SUBMISSION_PAYLOAD);

      expect(res.status).toBe(409);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("TEMPLATE_NAME_EXISTS");
      expect(res.body.error.message).toContain("already exists");
    });

    it("handles insufficient permissions (code 200) with HTTP 403 META_PERMISSION_DENIED", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 403,
        json: async () => ({
          error: {
            message: "(#200) Provide valid app permission to access this resource",
            code: 200,
          },
        }),
      });

      const res = await request(app)
        .post("/api/v1/templates")
        .send(VALID_SUBMISSION_PAYLOAD);

      expect(res.status).toBe(403);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_PERMISSION_DENIED");
      expect(res.body.error.message).toContain("whatsapp_business_management");
    });

    it("handles rate limiting (code 80007) with HTTP 429 META_RATE_LIMITED", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 429,
        json: async () => ({
          error: {
            message: "Rate limit reached for WABA template creation",
            code: 80007,
          },
        }),
      });

      const res = await request(app)
        .post("/api/v1/templates")
        .send(VALID_SUBMISSION_PAYLOAD);

      expect(res.status).toBe(429);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_RATE_LIMITED");
    });

    it("handles network timeout without automatic retry and returns HTTP 504 META_API_TIMEOUT", async () => {
      const abortError = new Error("The operation was aborted");
      abortError.name = "AbortError";
      global.fetch = vi.fn().mockRejectedValue(abortError);

      const res = await request(app)
        .post("/api/v1/templates")
        .send(VALID_SUBMISSION_PAYLOAD);

      expect(res.status).toBe(504);
      expect(res.body.success).toBe(false);
      expect(res.body.error.code).toBe("META_API_TIMEOUT");
      expect(res.body.error.message).toContain("Do not retry immediately");
    });

    it("redacts sensitive tokens from generic Meta error messages", async () => {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({
          error: {
            message: "Internal error processing request for token EAAXlNN1234567890abcdef and Bearer EAAXlNN999999",
            code: 999,
          },
        }),
      });

      const res = await request(app)
        .post("/api/v1/templates")
        .send(VALID_SUBMISSION_PAYLOAD);

      expect(res.status).toBe(502);
      expect(res.body.success).toBe(false);
      expect(res.body.error.message).not.toContain("EAAXlNN1234567890abcdef");
      expect(res.body.error.message).toContain("[REDACTED_TOKEN]");
    });
  });
});
