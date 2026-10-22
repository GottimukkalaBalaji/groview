import { describe, it, expect } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../app.js";
import {
  verifyMetaSignature,
  computeWebhookDedupHash,
} from "../services/webhook.service.js";

describe("Phase 5C — Webhook Signature & Verification Tests", () => {
  const testSecret = "test_meta_app_secret_1234567890abcdef";
  const testBody = Buffer.from(
    JSON.stringify({
      object: "whatsapp_business_account",
      entry: [
        {
          id: "WABA_123",
          changes: [
            {
              field: "messages",
              value: {
                messaging_product: "whatsapp",
                metadata: {
                  display_phone_number: "15550001",
                  phone_number_id: "PHONE_123",
                },
                statuses: [
                  {
                    id: "wamid.HBgLMTEyMjMzNDQ1NQ==",
                    status: "delivered",
                    timestamp: "1728984000",
                    recipient_id: "919876543210",
                  },
                ],
              },
            },
          ],
        },
      ],
    })
  );

  it("verifies valid HMAC-SHA256 signature against raw body", () => {
    const signatureHash = crypto
      .createHmac("sha256", testSecret)
      .update(testBody)
      .digest("hex");
    const signatureHeader = `sha256=${signatureHash}`;

    const isValid = verifyMetaSignature(testBody, signatureHeader, testSecret);
    expect(isValid).toBe(true);
  });

  it("rejects tampered raw body or wrong app secret", () => {
    const signatureHash = crypto
      .createHmac("sha256", testSecret)
      .update(testBody)
      .digest("hex");
    const signatureHeader = `sha256=${signatureHash}`;

    const tamperedBody = Buffer.from(testBody.toString().replace("delivered", "read"));
    expect(verifyMetaSignature(tamperedBody, signatureHeader, testSecret)).toBe(false);

    const wrongSecret = "wrong_secret_abcdef";
    expect(verifyMetaSignature(testBody, signatureHeader, wrongSecret)).toBe(false);
  });

  it("rejects missing, malformed, or empty signatures", () => {
    expect(verifyMetaSignature(testBody, undefined, testSecret)).toBe(false);
    expect(verifyMetaSignature(testBody, "malformed_signature", testSecret)).toBe(false);
    expect(verifyMetaSignature(undefined, "sha256=abcdef", testSecret)).toBe(false);
  });

  it("computes deterministic deduplication hash for webhook status event", () => {
    const hash1 = computeWebhookDedupHash("wamid.123", "delivered", 1728984000, null);
    const hash2 = computeWebhookDedupHash("wamid.123", "delivered", "1728984000", "");
    expect(hash1).toBe(hash2);

    const hashDifferentStatus = computeWebhookDedupHash("wamid.123", "read", 1728984000, null);
    expect(hash1).not.toBe(hashDifferentStatus);

    const hashDifferentTime = computeWebhookDedupHash("wamid.123", "delivered", 1728984001, null);
    expect(hash1).not.toBe(hashDifferentTime);
  });

  it("handles GET /api/v1/webhooks/whatsapp verification challenge", async () => {
    const verifyToken = process.env.META_WEBHOOK_VERIFY_TOKEN || "grovastra_webhook_secret_token_2026";
    const challengeCode = "challenge_test_code_987654";

    // Successful challenge
    const resSuccess = await request(app)
      .get("/api/v1/webhooks/whatsapp")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": verifyToken,
        "hub.challenge": challengeCode,
      });

    expect(resSuccess.status).toBe(200);
    expect(resSuccess.text).toBe(challengeCode);

    // Forbidden challenge with invalid token
    const resForbidden = await request(app)
      .get("/api/v1/webhooks/whatsapp")
      .query({
        "hub.mode": "subscribe",
        "hub.verify_token": "wrong_token_here",
        "hub.challenge": challengeCode,
      });

    expect(resForbidden.status).toBe(403);

    // Forbidden challenge with invalid mode
    const resInvalidMode = await request(app)
      .get("/api/v1/webhooks/whatsapp")
      .query({
        "hub.mode": "unsubscribe",
        "hub.verify_token": verifyToken,
        "hub.challenge": challengeCode,
      });

    expect(resInvalidMode.status).toBe(403);
  });

  it("handles POST /api/v1/webhooks/whatsapp signature checking and non-waba payload filtering", async () => {
    const originalSecret = process.env.META_APP_SECRET;
    try {
      process.env.META_APP_SECRET = testSecret;

      // 1. Invalid signature rejection when app secret is present
      const badSigRes = await request(app)
        .post("/api/v1/webhooks/whatsapp")
        .set("x-hub-signature-256", "sha256=invalid_hex_digest_0000000000000000000000000000000000000000000000000000000000000000")
        .send({ object: "whatsapp_business_account", entry: [] });

      expect(badSigRes.status).toBe(401);
      expect(badSigRes.body.error).toBe("Invalid signature");

      // 2. Non-WABA payload with valid signature should be safely ignored with HTTP 200
      const nonWabaPayload = { object: "user", entry: [] };
      const nonWabaRaw = Buffer.from(JSON.stringify(nonWabaPayload));
      const nonWabaSig = `sha256=${crypto.createHmac("sha256", testSecret).update(nonWabaRaw).digest("hex")}`;

      const nonWabaRes = await request(app)
        .post("/api/v1/webhooks/whatsapp")
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", nonWabaSig)
        .send(JSON.stringify(nonWabaPayload));

      expect(nonWabaRes.status).toBe(200);
      expect(nonWabaRes.body.status).toBe("ignored_non_waba_event");

      // 3. Valid signature matching rawBody for WABA payload
      const validPayload = { object: "whatsapp_business_account", entry: [] };
      const validRawBuffer = Buffer.from(JSON.stringify(validPayload));
      const validHmac = crypto
        .createHmac("sha256", testSecret)
        .update(validRawBuffer)
        .digest("hex");

      const goodSigRes = await request(app)
        .post("/api/v1/webhooks/whatsapp")
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", `sha256=${validHmac}`)
        .send(JSON.stringify(validPayload));

      expect(goodSigRes.status).toBe(200);
      expect(goodSigRes.body.status).toBe("received");
    } finally {
      process.env.META_APP_SECRET = originalSecret;
    }
  });

  it("validates environment configuration schema and required variable error messaging", async () => {
    const { validateWebhookConfig, validateMetaConfig } = await import("../config/env.js");

    // Webhook configuration allows optional verify token & app secret in dev/test
    const webhookConf = validateWebhookConfig();
    expect(typeof webhookConf).toBe("object");

    // validateMetaConfig throws descriptive error when mandatory tokens are missing
    const origToken = process.env.META_WHATSAPP_ACCESS_TOKEN;
    try {
      delete process.env.META_WHATSAPP_ACCESS_TOKEN;
      expect(() => validateMetaConfig()).toThrow(/META_WHATSAPP_ACCESS_TOKEN is required/);
    } finally {
      process.env.META_WHATSAPP_ACCESS_TOKEN = origToken;
    }
  });
});

