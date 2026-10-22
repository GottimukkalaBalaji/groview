import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import {
  ApiClient,
  ApiClientError,
  sanitizeErrorMessage,
} from "../services/api.js";
import { ConnectPlatformWhatsAppPayload } from "../types/platform.js";

describe("Phase 9E — Master Admin Step 2: Platform WhatsApp API Client Methods", () => {
  const BASE_URL = "http://localhost:5000/api/v1";
  let client: ApiClient;
  let fetchMock: ReturnType<typeof vi.fn>;

  const validPayload: ConnectPlatformWhatsAppPayload = {
    wabaId: "1075305975271164",
    phoneNumberId: "1290524220819472",
    accessToken: "EAAXlNNfTiIkBS5nBg2HWevYQ9db29ajoFa4iZCbWiE8nxebyOYm5GdcgTAg2C2Z",
  };

  const mockConnectedStatus = {
    connected: true,
    status: "CONNECTED",
    source: "DATABASE",
    mode: "SHARED_PLATFORM",
    canManageCredentials: true,
    isSharedPlatform: true,
    wabaId: "1075305975271164",
    phoneNumberId: "1290524220819472",
    displayPhoneNumber: "+1 555-0199",
    verifiedName: "Grovastra Platform",
    tokenExpiresAt: "2026-12-31T23:59:59.000Z",
    verifiedAt: "2026-10-18T12:00:00.000Z",
    lastSyncedAt: "2026-10-18T12:00:00.000Z",
    lastError: null,
  };

  beforeEach(() => {
    client = new ApiClient(BASE_URL);
    fetchMock = vi.fn();
    global.fetch = fetchMock as unknown as typeof fetch;
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  // ============================================================================
  // 1. connectPlatformWhatsApp
  // ============================================================================
  describe("1. connectPlatformWhatsApp", () => {
    it("makes POST request to /admin/platform/whatsapp/connect with credentials: include and serialized payload", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: mockConnectedStatus,
          message: "Platform WhatsApp Business Account connected and verified successfully.",
          timestamp: "2026-10-18T12:00:00.000Z",
        }),
      });

      const response = await client.connectPlatformWhatsApp(validPayload);

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledConfig] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe(`${BASE_URL}/admin/platform/whatsapp/connect`);
      expect(calledConfig.method).toBe("POST");
      expect(calledConfig.credentials).toBe("include");
      expect(calledConfig.headers).toEqual({
        "Content-Type": "application/json",
        Accept: "application/json",
      });
      expect(JSON.parse(calledConfig.body)).toEqual(validPayload);

      expect(response.success).toBe(true);
      expect(response.data.connected).toBe(true);
      expect(response.data.status).toBe("CONNECTED");
      expect(response.data.wabaId).toBe("1075305975271164");
      expect(response.data.phoneNumberId).toBe("1290524220819472");
    });

    it("handles 400 Bad Request validation errors properly", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "wabaId is required and must be alphanumeric",
            details: [
              { field: "wabaId", message: "wabaId must be a valid Meta identifier" },
            ],
          },
          timestamp: "2026-10-18T12:00:00.000Z",
        }),
      });

      await expect(client.connectPlatformWhatsApp({ ...validPayload, wabaId: "" })).rejects.toThrow(
        ApiClientError
      );

      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {
            code: "VALIDATION_ERROR",
            message: "wabaId is required and must be alphanumeric",
          },
        }),
      });

      try {
        await client.connectPlatformWhatsApp({ ...validPayload, wabaId: "" });
      } catch (err: unknown) {
        const apiError = err as ApiClientError;
        expect(apiError.statusCode).toBe(400);
        expect(apiError.code).toBe("VALIDATION_ERROR");
        expect(apiError.message).toContain("wabaId is required");
      }
    });

    it("handles 403 Forbidden when caller is not an authorized platform administrator", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 403,
        json: async () => ({
          success: false,
          error: {
            code: "PLATFORM_ADMIN_FORBIDDEN",
            message: "Access restricted to verified platform administrators.",
          },
        }),
      });

      try {
        await client.connectPlatformWhatsApp(validPayload);
        expect.unreachable("Should have thrown ApiClientError");
      } catch (err: unknown) {
        const apiError = err as ApiClientError;
        expect(apiError).toBeInstanceOf(ApiClientError);
        expect(apiError.statusCode).toBe(403);
        expect(apiError.code).toBe("PLATFORM_ADMIN_FORBIDDEN");
        expect(apiError.message).toBe("Access restricted to verified platform administrators.");
      }
    });

    it("handles 409 Conflict when WABA or Phone Number ID is already linked to another organization", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 409,
        json: async () => ({
          success: false,
          error: {
            code: "CONFLICT",
            message: "This WhatsApp Business Account ID is already linked to another organization.",
          },
        }),
      });

      try {
        await client.connectPlatformWhatsApp(validPayload);
        expect.unreachable("Should have thrown ApiClientError");
      } catch (err: unknown) {
        const apiError = err as ApiClientError;
        expect(apiError.statusCode).toBe(409);
        expect(apiError.code).toBe("CONFLICT");
        expect(apiError.message).toContain("already linked to another organization");
      }
    });

    it("handles network failure (TypeError: Failed to fetch) cleanly with statusCode 0", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      try {
        await client.connectPlatformWhatsApp(validPayload);
        expect.unreachable("Should have thrown ApiClientError");
      } catch (err: unknown) {
        const apiError = err as ApiClientError;
        expect(apiError).toBeInstanceOf(ApiClientError);
        expect(apiError.statusCode).toBe(0);
        expect(apiError.code).toBe("NETWORK_ERROR");
        expect(apiError.message).toContain("Unable to connect to Grovastra backend");
      }
    });
  });

  // ============================================================================
  // 2. refreshPlatformWhatsApp
  // ============================================================================
  describe("2. refreshPlatformWhatsApp", () => {
    it("makes POST request to /admin/platform/whatsapp/refresh without request body", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: mockConnectedStatus,
          message: "Platform WhatsApp connection refreshed successfully.",
          timestamp: "2026-10-18T12:00:00.000Z",
        }),
      });

      const response = await client.refreshPlatformWhatsApp();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledConfig] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe(`${BASE_URL}/admin/platform/whatsapp/refresh`);
      expect(calledConfig.method).toBe("POST");
      expect(calledConfig.credentials).toBe("include");
      expect(calledConfig.body).toBeUndefined();

      expect(response.success).toBe(true);
      expect(response.data.status).toBe("CONNECTED");
    });

    it("handles 401 Unauthorized during refresh if Meta token has expired", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 401,
        json: async () => ({
          success: false,
          error: {
            code: "META_AUTH_INVALID",
            message: "The Meta WhatsApp access token has expired or was revoked.",
          },
        }),
      });

      try {
        await client.refreshPlatformWhatsApp();
        expect.unreachable("Should have thrown ApiClientError");
      } catch (err: unknown) {
        const apiError = err as ApiClientError;
        expect(apiError.statusCode).toBe(401);
        expect(apiError.code).toBe("META_AUTH_INVALID");
      }
    });

    it("handles network failure on refresh", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(client.refreshPlatformWhatsApp()).rejects.toThrow("Unable to connect to Grovastra backend");
    });
  });

  // ============================================================================
  // 3. disconnectPlatformWhatsApp
  // ============================================================================
  describe("3. disconnectPlatformWhatsApp", () => {
    it("makes DELETE request to /admin/platform/whatsapp/disconnect with credentials: include", async () => {
      const mockDisconnectResult = {
        success: true,
        message: "Platform WhatsApp connection successfully disconnected.",
        status: "DISCONNECTED",
      };

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 200,
        json: async () => ({
          success: true,
          data: mockDisconnectResult,
          message: "Platform WhatsApp connection successfully disconnected.",
          timestamp: "2026-10-18T12:00:00.000Z",
        }),
      });

      const response = await client.disconnectPlatformWhatsApp();

      expect(fetchMock).toHaveBeenCalledTimes(1);
      const [calledUrl, calledConfig] = fetchMock.mock.calls[0];
      expect(calledUrl).toBe(`${BASE_URL}/admin/platform/whatsapp/disconnect`);
      expect(calledConfig.method).toBe("DELETE");
      expect(calledConfig.credentials).toBe("include");

      expect(response.success).toBe(true);
      expect(response.data.status).toBe("DISCONNECTED");
      expect(response.data.message).toContain("disconnected");
    });

    it("handles 400 Bad Request when attempting to disconnect legacy environment fallback", async () => {
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 400,
        json: async () => ({
          success: false,
          error: {
            code: "BAD_REQUEST",
            message: "The legacy environment fallback WhatsApp connection cannot be disconnected via API.",
          },
        }),
      });

      try {
        await client.disconnectPlatformWhatsApp();
        expect.unreachable("Should have thrown ApiClientError");
      } catch (err: unknown) {
        const apiError = err as ApiClientError;
        expect(apiError.statusCode).toBe(400);
        expect(apiError.message).toContain("legacy environment fallback");
      }
    });

    it("handles network failure on disconnect", async () => {
      fetchMock.mockRejectedValueOnce(new TypeError("Failed to fetch"));

      await expect(client.disconnectPlatformWhatsApp()).rejects.toThrow(ApiClientError);
    });
  });

  // ============================================================================
  // 4. Credential Privacy & Error Sanitization (Security Guarantee)
  // ============================================================================
  describe("4. Credential Privacy & Error Sanitization", () => {
    it("sanitizes error messages containing raw Meta access tokens", async () => {
      const rawLeakedToken = "EAAXlNNfTiIkBS5nBg2HWevYQ9db29ajoFa4iZCbWiE8nxebyOYm5GdcgTAg2C2Z";
      fetchMock.mockResolvedValueOnce({
        ok: false,
        status: 500,
        json: async () => ({
          success: false,
          error: {
            code: "INTERNAL_ERROR",
            message: `Graph API rejected token: ${rawLeakedToken} with code 190`,
            details: [
              { message: `Invalid token param: access_token=${rawLeakedToken}` },
            ],
          },
        }),
      });

      try {
        await client.connectPlatformWhatsApp(validPayload);
        expect.unreachable("Should have thrown ApiClientError");
      } catch (err: unknown) {
        const apiError = err as ApiClientError;
        expect(apiError.message).not.toContain(rawLeakedToken);
        expect(apiError.message).toContain("[REDACTED_ACCESS_TOKEN]");
        expect(apiError.details?.[0].message).not.toContain(rawLeakedToken);
        expect(apiError.details?.[0].message).toContain("[REDACTED]");
      }
    });

    it("sanitizes unexpected non-fetch runtime exceptions", async () => {
      const rawToken = "EAA_TEST_TOKEN_SECRET_123456789";
      fetchMock.mockRejectedValueOnce(new Error(`Failed with secret token ${rawToken}`));

      try {
        await client.connectPlatformWhatsApp(validPayload);
        expect.unreachable("Should have thrown ApiClientError");
      } catch (err: unknown) {
        const apiError = err as ApiClientError;
        expect(apiError.message).not.toContain(rawToken);
        expect(apiError.message).toContain("[REDACTED_ACCESS_TOKEN]");
      }
    });

    it("does not log request bodies, access tokens, or sensitive values to console", async () => {
      const consoleLogSpy = vi.spyOn(console, "log").mockImplementation(() => {});
      const consoleInfoSpy = vi.spyOn(console, "info").mockImplementation(() => {});
      const consoleWarnSpy = vi.spyOn(console, "warn").mockImplementation(() => {});
      const consoleErrorSpy = vi.spyOn(console, "error").mockImplementation(() => {});

      fetchMock.mockResolvedValueOnce({
        ok: true,
        status: 201,
        json: async () => ({
          success: true,
          data: mockConnectedStatus,
        }),
      });

      await client.connectPlatformWhatsApp(validPayload);

      // Verify no console logger was called with any part of the sensitive payload
      const allCalls = [
        ...consoleLogSpy.mock.calls,
        ...consoleInfoSpy.mock.calls,
        ...consoleWarnSpy.mock.calls,
        ...consoleErrorSpy.mock.calls,
      ].flat();

      for (const arg of allCalls) {
        const str = String(arg);
        expect(str).not.toContain(validPayload.accessToken);
        expect(str).not.toContain(validPayload.wabaId);
        expect(str).not.toContain(validPayload.phoneNumberId);
      }
    });

    it("sanitizeErrorMessage utility redacts bearer tokens, access tokens, and passwords", () => {
      expect(sanitizeErrorMessage("Bearer ya29.a0AfH6SM...1234")).toBe("Bearer [REDACTED]");
      expect(sanitizeErrorMessage("Token: EAA1234567890abcdef")).toBe("Token: [REDACTED_ACCESS_TOKEN]");
      expect(sanitizeErrorMessage("access_token=secret_value_123")).toBe("access_token=[REDACTED]");
      expect(sanitizeErrorMessage("password=MySecretPassword123")).toBe("password=[REDACTED]");
      expect(
        sanitizeErrorMessage("postgresql://postgres:secret123@aws-0.pooler.supabase.com:6543/postgres")
      ).toBe("postgresql://***:***@aws-0.pooler.supabase.com:6543/postgres");
    });
  });
});
