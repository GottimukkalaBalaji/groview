import { describe, it, expect, vi, beforeEach } from "vitest";
import crypto from "crypto";
import request from "supertest";
import { app } from "../app.js";
import {
  WebhookService,
  computeTemplateWebhookDedupHash,
  extractRawTemplateId,
  parseLosslessMetaWebhookPayload,
  TEMPLATE_LOCK_NAMESPACE,
} from "../services/webhook.service.js";
import {
  whatsappTemplateService,
  isTemplateEventSendable,
} from "../services/whatsappTemplate.service.js";
import { AppError } from "../utils/errors.js";

describe("Phase 5F — Template Status Webhook Handling & Cache Invalidation", { timeout: 35000 }, () => {

  const testSecret = "test_meta_app_secret_phase5f_123456";
  const testWabaId = "1075305975271164";
  const testTemplateId = "1442305841309958";

  beforeEach(() => {
    whatsappTemplateService.clearCache();
  });

  it("verifies TEMPLATE_LOCK_NAMESPACE is dedicated and distinct from WAMID namespace", () => {
    expect(TEMPLATE_LOCK_NAMESPACE).toBe(43);
  });

  it("evaluates sendability status fail-closed: only APPROVED is sendable", () => {
    expect(isTemplateEventSendable("APPROVED")).toBe(true);
    expect(isTemplateEventSendable("approved")).toBe(true);
    expect(isTemplateEventSendable("PENDING")).toBe(false);
    expect(isTemplateEventSendable("REJECTED")).toBe(false);
    expect(isTemplateEventSendable("PAUSED")).toBe(false);
    expect(isTemplateEventSendable("DISABLED")).toBe(false);
    expect(isTemplateEventSendable("FLAGGED")).toBe(false);
    expect(isTemplateEventSendable("UNKNOWN_EVENT")).toBe(false);
    expect(isTemplateEventSendable("")).toBe(false);
  });

  it("computes pure, deterministic deduplication hash without current-clock dependency", () => {
    const hashWithTime1 = computeTemplateWebhookDedupHash(
      testWabaId,
      testTemplateId,
      "APPROVED",
      "NONE",
      1792044507
    );
    const hashWithTime2 = computeTemplateWebhookDedupHash(
      testWabaId,
      testTemplateId,
      "APPROVED",
      "NONE",
      "1792044507"
    );
    expect(hashWithTime1).toBe(hashWithTime2);
    expect(hashWithTime1.length).toBe(64);

    // When timeSeconds is absent, produces pure deterministic hash normalized with "absent"
    const hashNoTime1 = computeTemplateWebhookDedupHash(
      testWabaId,
      testTemplateId,
      "APPROVED",
      "NONE",
      null
    );
    const hashNoTime2 = computeTemplateWebhookDedupHash(
      testWabaId,
      testTemplateId,
      "APPROVED",
      "NONE",
      undefined
    );
    const hashNoTime3 = computeTemplateWebhookDedupHash(
      testWabaId,
      testTemplateId,
      "APPROVED",
      "NONE",
      ""
    );
    expect(hashNoTime1).toBe(hashNoTime2);
    expect(hashNoTime1).toBe(hashNoTime3);
    expect(hashNoTime1).not.toBe(hashWithTime1);

    // Verify hash matches pure expected format without any dynamic clock
    const expectedAbsentHash = crypto
      .createHash("sha256")
      .update(`template:${testWabaId}:${testTemplateId}:APPROVED:NONE:absent`)
      .digest("hex");
    expect(hashNoTime1).toBe(expectedAbsentHash);
  });

  it("rejects invalid HMAC-SHA256 signature for template webhook with HTTP 401", async () => {
    const origSecret = process.env.META_APP_SECRET;
    try {
      process.env.META_APP_SECRET = testSecret;

      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: testWabaId,
            time: 1792044507,
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "APPROVED",
                  message_template_id: testTemplateId,
                  message_template_name: "test_template",
                },
              },
            ],
          },
        ],
      };

      const res = await request(app)
        .post("/api/v1/webhooks/whatsapp")
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", "sha256=invalid_hash_signature_00000000000000000000000000000000000000000000")
        .send(JSON.stringify(payload));

      expect(res.status).toBe(401);
      expect(res.body.error).toBe("Invalid signature");
    } finally {
      process.env.META_APP_SECRET = origSecret;
    }
  });

  it("accepts valid HMAC-SHA256 signature and ingests template webhook successfully", async () => {
    const origSecret = process.env.META_APP_SECRET;
    const origWaba = process.env.META_WABA_ID;
    try {
      process.env.META_APP_SECRET = testSecret;
      process.env.META_WABA_ID = testWabaId;

      const liveTestTemplateId = "tpl_sig_test_" + Date.now();
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: testWabaId,
            time: 1792044507,
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "APPROVED",
                  message_template_id: liveTestTemplateId,
                  message_template_name: "m13b3_s2_video_offer",
                  message_template_language: "en",
                  reason: "NONE",
                  message_template_category: "MARKETING",
                },
              },
            ],
          },
        ],
      };

      const jsonString = JSON.stringify(payload);
      const raw = Buffer.from(jsonString);
      const sig = "sha256=" + crypto.createHmac("sha256", testSecret).update(raw).digest("hex");

      const res = await request(app)
        .post("/api/v1/webhooks/whatsapp")
        .set("Content-Type", "application/json")
        .set("x-hub-signature-256", sig)
        .send(jsonString);

      expect(res.status).toBe(200);
      expect(res.body.status).toBe("received");
      expect(res.body.data).toBeDefined();
    } finally {
      process.env.META_APP_SECRET = origSecret;
      process.env.META_WABA_ID = origWaba;
    }
  });

  it("does not modify tenant cache or status when WABA ID is untrusted or unmapped", async () => {
    const origWaba = process.env.META_WABA_ID;
    try {
      process.env.META_WABA_ID = "trusted_waba_111111";

      const untrustedTemplateId = "untrusted_tpl_" + Date.now();

      // Seed cache with a sendable template
      whatsappTemplateService.setCacheForTesting({
        templates: [
          {
            id: untrustedTemplateId,
            name: "m13b3_s2_video_offer",
            language: "en",
            category: "MARKETING",
            status: "APPROVED",
            isSendable: true,
            parameterFormat: "POSITIONAL",
            body: "Hello",
            buttons: [],
            variables: [],
            rawComponents: [],
          },
        ],
        rawTemplates: [],
        summary: {
          totalOnMeta: 1,
          approvedCount: 1,
          pendingCount: 0,
          rejectedCount: 0,
          wabaIdMasked: "***1111",
          syncedAt: new Date().toISOString(),
          requestedTemplatesFound: {
            hello_world: false,
            jaspers_market_plain_text_v1: false,
            jaspers_market_order_confirmation_v1: false,
          },
        },
        expiresAt: Date.now() + 60000,
      });

      // Send webhook for a different, untrusted WABA ID
      const untrustedPayload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: "untrusted_foreign_waba_999999",
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "DISABLED",
                  message_template_id: untrustedTemplateId,
                  message_template_name: "m13b3_s2_video_offer",
                },
              },
            ],
          },
        ],
      };

      const result = await WebhookService.ingestWebhookPayload(untrustedPayload);

      // Verified: classified as unmatched, not processed
      expect(result.unmatchedCount).toBe(1);
      expect(result.processedCount).toBe(0);

      // Verified: tenant cache was NOT modified or corrupted
      const cached = whatsappTemplateService.getCacheForTesting();
      expect(cached).not.toBeNull();
      expect(cached?.templates[0].status).toBe("APPROVED");
      expect(cached?.templates[0].isSendable).toBe(true);
    } finally {
      process.env.META_WABA_ID = origWaba;
    }
  });

  it("handles duplicate callbacks idempotently and increments duplicateCount when organization is mapped", async () => {
    const origWaba = process.env.META_WABA_ID;
    const origOrg = process.env.META_ORGANIZATION_ID;
    try {
      process.env.META_WABA_ID = testWabaId;
      process.env.META_ORGANIZATION_ID = "org_default";

      const uniqueDedupId = "test_dedup_" + Date.now();
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: testWabaId,
            time: 1792044507,
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "APPROVED",
                  message_template_id: uniqueDedupId,
                  message_template_name: "test_dedup_tpl",
                  reason: "NONE",
                },
              },
            ],
          },
        ],
      };

      // First ingestion
      const res1 = await WebhookService.ingestWebhookPayload(payload);
      expect(res1.processedCount).toBe(1);
      expect(res1.duplicateCount).toBe(0);

      // Second ingestion with identical payload
      const res2 = await WebhookService.ingestWebhookPayload(payload);
      expect(res2.duplicateCount).toBe(1);
      expect(res2.processedCount).toBe(0);
    } finally {
      process.env.META_WABA_ID = origWaba;
      process.env.META_ORGANIZATION_ID = origOrg;
    }
  });

  it("persists unmatched audit event and skips cache mutation when META_ORGANIZATION_ID is absent", async () => {
    const origWaba = process.env.META_WABA_ID;
    const origOrg = process.env.META_ORGANIZATION_ID;
    try {
      process.env.META_WABA_ID = testWabaId;
      delete process.env.META_ORGANIZATION_ID;

      // Seed cache with a sendable template
      whatsappTemplateService.setCacheForTesting({
        templates: [
          {
            id: "tpl_isolation_test_123",
            name: "test_isolation_tpl",
            language: "en",
            category: "MARKETING",
            status: "APPROVED",
            isSendable: true,
            parameterFormat: "POSITIONAL",
            body: "Hello",
            buttons: [],
            variables: [],
            rawComponents: [],
          },
        ],
        rawTemplates: [],
        summary: {
          totalOnMeta: 1,
          approvedCount: 1,
          pendingCount: 0,
          rejectedCount: 0,
          wabaIdMasked: "***1164",
          syncedAt: new Date().toISOString(),
          requestedTemplatesFound: {
            hello_world: false,
            jaspers_market_plain_text_v1: false,
            jaspers_market_order_confirmation_v1: false,
          },
        },
        expiresAt: Date.now() + 60000,
      });

      const uniqueUnmatchedId = "test_unmatched_" + Date.now();
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: testWabaId,
            time: 1792044507,
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "DISABLED",
                  message_template_id: uniqueUnmatchedId,
                  message_template_name: "test_isolation_tpl",
                  reason: "NONE",
                },
              },
            ],
          },
        ],
      };

      // First ingestion when organization mapping is absent
      const res1 = await WebhookService.ingestWebhookPayload(payload);
      expect(res1.unmatchedCount).toBe(1);
      expect(res1.processedCount).toBe(0);
      expect(res1.duplicateCount).toBe(0);

      // Verify tenant cache was NOT mutated
      const cached = whatsappTemplateService.getCacheForTesting();
      expect(cached?.templates[0].status).toBe("APPROVED");
      expect(cached?.templates[0].isSendable).toBe(true);

      // Second ingestion: duplicate handling must still work for unmatched events
      const res2 = await WebhookService.ingestWebhookPayload(payload);
      expect(res2.duplicateCount).toBe(1);
      expect(res2.unmatchedCount).toBe(0);
    } finally {
      process.env.META_WABA_ID = origWaba;
      process.env.META_ORGANIZATION_ID = origOrg;
    }
  });

  it("extracts 64-bit integer IDs exceeding MAX_SAFE_INTEGER without precision loss and prevents multi-item regex bleeding", () => {
    // 9007199254740993 exceeds Number.MAX_SAFE_INTEGER (9007199254740991)
    // In standard JSON.parse, 9007199254740993 becomes 9007199254740992
    // Wire-format HTTP payload sent by Meta containing bare 64-bit integers
    const multiItemRawBody = `{"object":"whatsapp_business_account","entry":[{"id":"${testWabaId}","changes":[{"field":"message_template_status_update","value":{"message_template_id":9007199254740993,"message_template_name":"template_alpha","event":"APPROVED"}},{"field":"message_template_status_update","value":{"message_template_id":9007199254740997,"message_template_name":"template_beta","event":"PAUSED"}}]}]}`;

    // 1. Verify JSON.parse indeed loses precision on raw numbers
    const parsedNaive = JSON.parse(multiItemRawBody);
    expect(parsedNaive.entry[0].changes[0].value.message_template_id).toBe(9007199254740992);

    // 2. Verify extractRawTemplateId extracts exact string representation
    const idAlpha = extractRawTemplateId(multiItemRawBody, "template_alpha");
    const idBeta = extractRawTemplateId(multiItemRawBody, "template_beta");

    expect(idAlpha).toBe("9007199254740993");
    expect(idBeta).toBe("9007199254740997");
    expect(idAlpha).not.toBe(idBeta);
  });

  it("losslessly parses multiple 64-bit integer IDs, preserves unrelated numbers, and handles complex whitespace safely", () => {
    const rawWirePayload = `{
      "object": "whatsapp_business_account",
      "entry": [
        {
          "id": "${testWabaId}",
          "time": 1792044507,
          "changes": [
            {
              "field": "message_template_status_update",
              "value": {
                "message_template_id"  :  9007199254740993  ,
                "message_template_name": "first_tpl",
                "other_numeric_field": 12345,
                "nested": {
                  "custom_message_template_id": 999
                }
              }
            },
            {
              "field": "message_template_status_update",
              "value": {
                "message_template_id": 9007199254740997,
                "message_template_name": "second_tpl",
                "pre_quoted_id": "9007199254740999"
              }
            }
          ]
        }
      ]
    }`;

    const parsed = parseLosslessMetaWebhookPayload(rawWirePayload);

    // 1. Both large 64-bit integer template IDs are parsed as exact lossless strings
    const val0 = parsed.entry[0].changes[0].value as {
      message_template_id: string;
      other_numeric_field: number;
      nested: { custom_message_template_id: number };
    };
    const val1 = parsed.entry[0].changes[1].value as {
      message_template_id: string;
      pre_quoted_id: string;
    };

    expect(val0.message_template_id).toBe("9007199254740993");
    expect(typeof val0.message_template_id).toBe("string");

    expect(val1.message_template_id).toBe("9007199254740997");
    expect(typeof val1.message_template_id).toBe("string");

    // 2. Unrelated numeric fields remain numbers
    expect(val0.other_numeric_field).toBe(12345);
    expect(typeof val0.other_numeric_field).toBe("number");

    // 3. Substring keys (custom_message_template_id) remain untouched
    expect(val0.nested.custom_message_template_id).toBe(999);
    expect(typeof val0.nested.custom_message_template_id).toBe("number");

    // 4. Pre-quoted fields are not double-quoted
    expect(val1.pre_quoted_id).toBe("9007199254740999");
  });

  it("throws SyntaxError and fails safely on malformed JSON in parseLosslessMetaWebhookPayload", () => {
    const malformed = `{"object": "whatsapp_business_account", "entry": [ { "message_template_id": 9007199254740993`;
    expect(() => parseLosslessMetaWebhookPayload(malformed)).toThrow(SyntaxError);
  });

  it("deduplicates untimestamped callbacks within 24 hours to prevent uncontrolled duplicate inserts", async () => {
    const origWaba = process.env.META_WABA_ID;
    const origOrg = process.env.META_ORGANIZATION_ID;
    try {
      process.env.META_WABA_ID = testWabaId;
      process.env.META_ORGANIZATION_ID = "org_default";

      const untimestampedId = "test_no_time_" + Date.now();
      const payload = {
        object: "whatsapp_business_account",
        entry: [
          {
            id: testWabaId,
            // time is intentionally omitted
            changes: [
              {
                field: "message_template_status_update",
                value: {
                  event: "APPROVED",
                  message_template_id: untimestampedId,
                  message_template_name: "test_untimestamped_tpl",
                  reason: "NONE",
                },
              },
            ],
          },
        ],
      };

      // 1. First arrival of untimestamped event: processed
      const res1 = await WebhookService.ingestWebhookPayload(payload);
      expect(res1.processedCount).toBe(1);
      expect(res1.duplicateCount).toBe(0);

      // 2. Second arrival of identical untimestamped event within 24h: suppressed as duplicate retry
      const res2 = await WebhookService.ingestWebhookPayload(payload);
      expect(res2.duplicateCount).toBe(1);
      expect(res2.processedCount).toBe(0);
    } finally {
      process.env.META_WABA_ID = origWaba;
      process.env.META_ORGANIZATION_ID = origOrg;
    }
  });

  it("safely updates cached template status and handles large numeric template IDs without precision loss", () => {
    // 64-bit integer ID that exceeds 32 bits
    const largeTemplateId = 1442305841309958;

    whatsappTemplateService.setCacheForTesting({
      templates: [
        {
          id: "1442305841309958",
          name: "m13b3_s2_video_offer",
          language: "en",
          category: "MARKETING",
          status: "PENDING",
          isSendable: false,
          parameterFormat: "POSITIONAL",
          body: "Hello",
          buttons: [],
          variables: [],
          rawComponents: [],
        },
      ],
      rawTemplates: [],
      summary: {
        totalOnMeta: 1,
        approvedCount: 0,
        pendingCount: 1,
        rejectedCount: 0,
        wabaIdMasked: "***9958",
        syncedAt: new Date().toISOString(),
        requestedTemplatesFound: {
          hello_world: false,
          jaspers_market_plain_text_v1: false,
          jaspers_market_order_confirmation_v1: false,
        },
      },
      expiresAt: Date.now() + 60000,
    });

    // Update passing numeric ID
    const updateRes = whatsappTemplateService.applyTemplateStatusUpdate(
      largeTemplateId,
      "APPROVED"
    );

    expect(updateRes.applied).toBe(true);
    expect(updateRes.isSendable).toBe(true);

    const cached = whatsappTemplateService.getCacheForTesting();
    expect(cached?.templates[0].status).toBe("APPROVED");
    expect(cached?.templates[0].isSendable).toBe(true);
    // ExpiresAt should be 0 to trigger fresh sync on next full fetch
    expect(cached?.expiresAt).toBe(0);
  });

  it("fails closed when cache is invalidated and subsequent Meta fetch fails", async () => {
    // Invalidate cache
    whatsappTemplateService.invalidateCache();
    expect(whatsappTemplateService.getCacheForTesting()).toBeNull();

    // Mock global fetch returning 500 error
    const origFetch = global.fetch;
    try {
      global.fetch = vi.fn().mockResolvedValue({
        ok: false,
        status: 500,
        json: async () => ({ error: { message: "Internal Meta Gateway Error" } }),
      });

      // Must throw AppError and fail closed: NEVER return stale data or claim sendable
      await expect(whatsappTemplateService.fetchWabaTemplates(true)).rejects.toThrow(
        AppError
      );
    } finally {
      global.fetch = origFetch;
    }
  });

  it("updates template to isSendable: false when event is PAUSED, REJECTED, or DISABLED", () => {
    whatsappTemplateService.setCacheForTesting({
      templates: [
        {
          id: testTemplateId,
          name: "m13b3_s2_video_offer",
          language: "en",
          category: "MARKETING",
          status: "APPROVED",
          isSendable: true,
          parameterFormat: "POSITIONAL",
          body: "Hello",
          buttons: [],
          variables: [],
          rawComponents: [],
        },
      ],
      rawTemplates: [],
      summary: {
        totalOnMeta: 1,
        approvedCount: 1,
        pendingCount: 0,
        rejectedCount: 0,
        wabaIdMasked: "***9958",
        syncedAt: new Date().toISOString(),
        requestedTemplatesFound: {
          hello_world: false,
          jaspers_market_plain_text_v1: false,
          jaspers_market_order_confirmation_v1: false,
        },
      },
      expiresAt: Date.now() + 60000,
    });

    // Receive PAUSED event from Meta
    const res = whatsappTemplateService.applyTemplateStatusUpdate(testTemplateId, "PAUSED");
    expect(res.applied).toBe(true);
    expect(res.wasSendable).toBe(true);
    expect(res.isSendable).toBe(false);

    const cached = whatsappTemplateService.getCacheForTesting();
    expect(cached?.templates[0].status).toBe("PAUSED");
    expect(cached?.templates[0].isSendable).toBe(false);
  });
});
