import { describe, it, expect, vi } from "vitest";
import { WhatsAppSendService } from "../services/whatsappSend.service.js";

describe("Phase 5C — WhatsApp Dispatch & Preflight Unit Tests", () => {
  const dummyConfig = {
    accessToken: "mock_meta_access_token",
    phoneNumberId: "mock_phone_12345",
    graphApiVersion: "v22.0",
  };

  it("returns SUCCESS with WAMID when Meta returns HTTP 200 with valid message ID", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({
        messaging_product: "whatsapp",
        contacts: [{ input: "919876543210", wa_id: "919876543210" }],
        messages: [{ id: "wamid.HBgLMTEyMjMzNDQ1NQ==" }],
      }),
    });

    const result = await WhatsAppSendService.executeMetaSend({
      recipientPhone: "+919876543210",
      templateName: "order_confirmation",
      templateLanguage: "en_US",
      parameters: { name: "Alice", orderId: "ORD-999" },
      metaConfigOverride: {
        ...dummyConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    });

    expect(result.outcome).toBe("SUCCESS");
    if (result.outcome === "SUCCESS") {
      expect(result.wamid).toBe("wamid.HBgLMTEyMjMzNDQ1NQ==");
    }
  });

  it("classifies HTTP 500/502/503 as AMBIGUOUS_TIMEOUT and never as generic terminal failure", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 503,
      json: async () => ({
        error: {
          message: "Service temporarily unavailable from upstream WhatsApp gateway",
        },
      }),
    });

    const result = await WhatsAppSendService.executeMetaSend({
      recipientPhone: "+919876543210",
      templateName: "order_confirmation",
      templateLanguage: "en_US",
      parameters: {},
      metaConfigOverride: {
        ...dummyConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    });

    expect(result.outcome).toBe("AMBIGUOUS_TIMEOUT");
    if (result.outcome === "AMBIGUOUS_TIMEOUT") {
      expect(result.errorCode).toBe("HTTP_503");
      expect(result.errorMessage).toContain("Service temporarily unavailable");
    }
  });

  it("classifies client AbortController timeout as AMBIGUOUS_TIMEOUT", async () => {
    const mockFetch = vi.fn().mockRejectedValue(
      new (class AbortError extends Error {
        name = "AbortError";
        constructor() {
          super("This operation was aborted");
        }
      })()
    );

    const result = await WhatsAppSendService.executeMetaSend({
      recipientPhone: "+919876543210",
      templateName: "order_confirmation",
      templateLanguage: "en_US",
      parameters: {},
      metaConfigOverride: {
        ...dummyConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    });

    expect(result.outcome).toBe("AMBIGUOUS_TIMEOUT");
    if (result.outcome === "AMBIGUOUS_TIMEOUT") {
      expect(result.errorCode).toBe("TIMEOUT");
    }
  });

  it("classifies HTTP 400 Bad Request with Meta error details as TERMINAL_ERROR", async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: false,
      status: 400,
      json: async () => ({
        error: {
          message: "(#100) Param template['components'] has an invalid format",
          type: "OAuthException",
          code: 100,
          error_subcode: 2388001,
        },
      }),
    });

    const result = await WhatsAppSendService.executeMetaSend({
      recipientPhone: "+919876543210",
      templateName: "order_confirmation",
      templateLanguage: "en_US",
      parameters: {},
      metaConfigOverride: {
        ...dummyConfig,
        fetchFn: mockFetch as unknown as typeof fetch,
      },
    });

    expect(result.outcome).toBe("TERMINAL_ERROR");
    if (result.outcome === "TERMINAL_ERROR") {
      expect(result.errorCode).toBe("META_100");
      expect(result.errorMessage).toContain("invalid format");
    }
  });
});
