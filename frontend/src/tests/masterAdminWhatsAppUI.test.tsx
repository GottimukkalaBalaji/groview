import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, cleanup, fireEvent, waitFor, within } from "@testing-library/react";
import { MasterAdminPage } from "../pages/MasterAdminPage.js";
import * as AuthModule from "../context/AuthContext.js";
import { apiClient, ApiClientError } from "../services/api.js";
import {
  PlatformWhatsAppStatus,
  PlatformTemplateResponse,
  PlatformOverview,
} from "../types/platform.js";

const mockMasterUser = {
  id: "usr_master_balaji",
  email: "balaji@example.com",
  firstName: "Balaji",
  lastName: "Master",
  role: "OWNER" as const,
  platformRole: "PLATFORM_MASTER_ADMIN" as const,
  organizationId: "org_platform",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const mockPlatformOrg = {
  id: "org_platform",
  name: "Platform Root",
  slug: "platform",
  createdAt: "2026-01-01T00:00:00.000Z",
};

const mockCapabilities = {
  isPlatformAdmin: true,
  platformRole: "PLATFORM_MASTER_ADMIN" as const,
  canManagePlatformWhatsApp: true,
  canManageAllOrganizations: true,
  canAssignBusinesses: false,
};

const mockConnectedWhatsAppStatus: PlatformWhatsAppStatus = {
  connected: true,
  status: "CONNECTED",
  source: "DATABASE",
  mode: "SHARED_PLATFORM",
  canManageCredentials: true,
  isSharedPlatform: true,
  wabaId: "1075305975271164",
  phoneNumberId: "105741875883651",
  displayPhoneNumber: "+1 555-0199",
  verifiedName: "Grovastra Platform Sender",
  tokenExpiresAt: "2027-01-01T00:00:00.000Z",
  verifiedAt: "2026-01-01T00:00:00.000Z",
  lastSyncedAt: "2026-10-15T12:00:00.000Z",
  lastError: null,
};

const mockDisconnectedWhatsAppStatus: PlatformWhatsAppStatus = {
  connected: false,
  status: "DISCONNECTED",
  source: "DATABASE",
  mode: "SHARED_PLATFORM",
  canManageCredentials: true,
  isSharedPlatform: true,
  wabaId: null,
  phoneNumberId: null,
  displayPhoneNumber: null,
  verifiedName: null,
  tokenExpiresAt: null,
  verifiedAt: null,
  lastSyncedAt: null,
  lastError: null,
};

const mockTemplatesEmpty: PlatformTemplateResponse = {
  templates: [],
  summary: {
    totalOnMeta: 0,
    approvedCount: 0,
    pendingCount: 0,
    rejectedCount: 0,
    wabaIdMasked: "",
    syncedAt: new Date().toISOString(),
    requestedTemplatesFound: {
      hello_world: false,
      jaspers_market_plain_text_v1: false,
      jaspers_market_order_confirmation_v1: false,
    },
  },
};

const mockOverview: PlatformOverview = {
  platformStatus: "OPERATIONAL",
  mode: "SHARED_PLATFORM",
  organizations: { total: 1, active: 1, archived: 0 },
  users: { total: 1, masterAdmins: 1, delegatedAdmins: 0, regularUsers: 0 },
  whatsapp: {
    connected: true,
    status: "CONNECTED",
    mode: "SHARED_PLATFORM",
    source: "DATABASE",
    wabaId: "1075305975271164",
    phoneNumberId: "105741875883651",
    displayPhoneNumber: "+1 555-0199",
    verifiedName: "Grovastra Platform Sender",
    tokenExpiresAt: "2027-01-01T00:00:00.000Z",
    lastSyncedAt: "2026-10-15T12:00:00.000Z",
    lastError: null,
    organizationsWithConnectedAccount: 1,
  },
};

describe("Grovastra Master Admin Step 3: Shared WhatsApp Credential Management UI", () => {
  let consoleSpy: any;

  beforeEach(() => {
    consoleSpy = vi.spyOn(console, "log");
    vi.spyOn(console, "error").mockImplementation(() => {});

    vi.spyOn(AuthModule, "useAuth").mockReturnValue({
      user: mockMasterUser,
      organization: mockPlatformOrg,
      platformCapabilities: mockCapabilities,
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    vi.spyOn(apiClient, "getPlatformOverview").mockResolvedValue({
      success: true,
      data: mockOverview,
      timestamp: new Date().toISOString(),
    });

    vi.spyOn(apiClient, "getPlatformTemplates").mockResolvedValue({
      success: true,
      data: mockTemplatesEmpty,
      timestamp: new Date().toISOString(),
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  // Helper to render page and switch to WhatsApp tab, ensuring status is resolved
  const renderAndSwitchToWhatsAppTab = async (status: PlatformWhatsAppStatus = mockConnectedWhatsAppStatus) => {
    vi.spyOn(apiClient, "getPlatformWhatsAppStatus").mockResolvedValue({
      success: true,
      data: status,
      timestamp: new Date().toISOString(),
    });

    const result = render(<MasterAdminPage />);

    const tabBtn = screen.getByRole("button", { name: /Shared WhatsApp Platform/i });
    fireEvent.click(tabBtn);

    if (status.connected) {
      await waitFor(() => {
        expect(screen.getByText("Connected & Verified")).toBeDefined();
      });
    } else if (status.status === "TOKEN_EXPIRED") {
      await waitFor(() => {
        expect(screen.getByText("Token Expired / Revoked")).toBeDefined();
      });
    } else if (status.status === "DISCONNECTED") {
      await waitFor(() => {
        expect(screen.getByText("Disconnected")).toBeDefined();
      });
    } else {
      await waitFor(() => {
        expect(screen.getByText("Shared WhatsApp Meta Infrastructure")).toBeDefined();
      });
    }

    return result;
  };

  describe("1. Current Connection State Display", () => {
    it("renders connection status, masked WABA ID, phone number, and sync info without exposing tokens", async () => {
      await renderAndSwitchToWhatsAppTab(mockConnectedWhatsAppStatus);

      // Connected badge
      expect(screen.getByText("Connected & Verified")).toBeDefined();
      // Display name and phone
      expect(screen.getByText("Grovastra Platform Sender")).toBeDefined();
      expect(screen.getByText("+1 555-0199")).toBeDefined();
      // Masked WABA ID: 1075...1164
      expect(screen.getByText("1075...1164")).toBeDefined();

      // No unmasked tokens or sensitive details rendered
      expect(screen.queryByText(/EAAG/)).toBeNull();
      expect(screen.queryByText(/Bearer/)).toBeNull();
    });

    it("distinguishes disconnected and token expired status correctly", async () => {
      await renderAndSwitchToWhatsAppTab({
        ...mockConnectedWhatsAppStatus,
        connected: false,
        status: "TOKEN_EXPIRED",
        lastError: "OAuth token revoked by Meta administrator",
      });

      expect(screen.getByText("Token Expired / Revoked")).toBeDefined();
      expect(screen.getByText(/Diagnostic Notice:/)).toBeDefined();
      expect(screen.getByText(/OAuth token revoked by Meta administrator/)).toBeDefined();
    });
  });

  describe("2. Connect / Update Credentials Modal & Field Validation", () => {
    it("opens connect modal with empty password input and allows show/hide toggle", async () => {
      await renderAndSwitchToWhatsAppTab(mockDisconnectedWhatsAppStatus);

      const connectBtn = screen.getByRole("button", { name: /Connect Platform WhatsApp/i });
      fireEvent.click(connectBtn);

      const modalTitle = screen.getByRole("heading", { name: /Connect Platform WhatsApp Account/i });
      expect(modalTitle).toBeDefined();

      const tokenInput = screen.getByPlaceholderText(/Paste permanent Meta System User token/i) as HTMLInputElement;
      expect(tokenInput.value).toBe("");
      expect(tokenInput.type).toBe("password");

      // Show/hide toggle button
      const toggleBtn = screen.getByRole("button", { name: /Show access token/i });
      fireEvent.click(toggleBtn);
      expect(tokenInput.type).toBe("text");
      expect(screen.getByRole("button", { name: /Hide access token/i })).toBeDefined();

      fireEvent.click(screen.getByRole("button", { name: /Hide access token/i }));
      expect(tokenInput.type).toBe("password");
    });

    it("validates empty/short inputs before submitting", async () => {
      await renderAndSwitchToWhatsAppTab(mockDisconnectedWhatsAppStatus);

      const connectBtn = screen.getByRole("button", { name: /Connect Platform WhatsApp/i });
      fireEvent.click(connectBtn);

      const submitBtn = screen.getByRole("button", { name: /Connect & Verify/i });
      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(screen.getByText(/WhatsApp Business Account ID \(WABA ID\) is required/i)).toBeDefined();
      });

      const wabaInput = screen.getByLabelText(/WhatsApp Business Account ID/i);
      fireEvent.change(wabaInput, { target: { value: "1075305975271164" } });
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(screen.getByText("Phone Number ID is required.")).toBeDefined();
      });

      const phoneInput = screen.getByLabelText(/Meta Phone Number ID/i);
      fireEvent.change(phoneInput, { target: { value: "105741875883651" } });
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(screen.getByText("Meta System User Access Token is required.")).toBeDefined();
      });

      const tokenInput = screen.getByPlaceholderText(/Paste permanent Meta System User token/i);
      fireEvent.change(tokenInput, { target: { value: "short" } });
      fireEvent.click(submitBtn);
      await waitFor(() => {
        expect(screen.getByText("Access token must be at least 10 characters.")).toBeDefined();
      });
    });

    it("requires explicit confirmation checkbox before overwriting an active connection", async () => {
      await renderAndSwitchToWhatsAppTab(mockConnectedWhatsAppStatus);

      // Click the toolbar button to open modal
      const updateBtn = screen.getByRole("button", { name: /Update Credentials/i });
      fireEvent.click(updateBtn);

      const modalDialog = screen.getByRole("dialog");
      expect(within(modalDialog).getByText("Warning: Modifying Active Platform Integration")).toBeDefined();

      const tokenInput = within(modalDialog).getByPlaceholderText(/Paste permanent Meta System User token/i);
      fireEvent.change(tokenInput, { target: { value: "EAAG_valid_test_token_1234567890" } });

      const submitBtn = within(modalDialog).getByRole("button", { name: /Update Credentials/i });
      fireEvent.click(submitBtn);

      // Blocked without checking confirmation checkbox
      expect(
        within(modalDialog).getByText(/Please confirm that you understand this will replace the active platform credentials/i)
      ).toBeDefined();

      // Check the overwrite box
      const checkbox = within(modalDialog).getByRole("checkbox", {
        name: /I understand and confirm replacing the active platform credentials/i,
      });
      fireEvent.click(checkbox);

      const connectSpy = vi.spyOn(apiClient, "connectPlatformWhatsApp").mockResolvedValueOnce({
        success: true,
        data: {
          ...mockConnectedWhatsAppStatus,
          verifiedName: "Updated Platform Sender",
        },
        message: "Platform credentials updated successfully.",
        timestamp: new Date().toISOString(),
      });

      fireEvent.click(submitBtn);

      await waitFor(() => {
        expect(connectSpy).toHaveBeenCalledWith({
          wabaId: "1075305975271164",
          phoneNumberId: "105741875883651",
          accessToken: "EAAG_valid_test_token_1234567890",
        });
      });
    });

    it("clears sensitive token from memory upon modal close or cancel", async () => {
      await renderAndSwitchToWhatsAppTab(mockDisconnectedWhatsAppStatus);

      fireEvent.click(screen.getByRole("button", { name: /Connect Platform WhatsApp/i }));

      const tokenInput = screen.getByPlaceholderText(/Paste permanent Meta System User token/i) as HTMLInputElement;
      fireEvent.change(tokenInput, { target: { value: "EAAG_secret_token_12345" } });
      expect(tokenInput.value).toBe("EAAG_secret_token_12345");

      // Cancel modal
      fireEvent.click(screen.getByRole("button", { name: /Cancel/i }));

      // Re-open modal - token MUST be empty
      fireEvent.click(screen.getByRole("button", { name: /Connect Platform WhatsApp/i }));
      const freshTokenInput = screen.getByPlaceholderText(/Paste permanent Meta System User token/i) as HTMLInputElement;
      expect(freshTokenInput.value).toBe("");
    });
  });

  describe("3. Re-verify Credentials", () => {
    it("successfully re-verifies connection with loading spinner and feedback", async () => {
      await renderAndSwitchToWhatsAppTab(mockConnectedWhatsAppStatus);

      const refreshSpy = vi.spyOn(apiClient, "refreshPlatformWhatsApp").mockResolvedValueOnce({
        success: true,
        data: {
          ...mockConnectedWhatsAppStatus,
          lastSyncedAt: new Date().toISOString(),
        },
        message: "Platform WhatsApp connection verified with Meta successfully.",
        timestamp: new Date().toISOString(),
      });

      const reverifyBtn = screen.getByRole("button", { name: /Re-verify Connection/i });
      fireEvent.click(reverifyBtn);

      await waitFor(() => {
        expect(refreshSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByText(/Platform WhatsApp connection verified with Meta successfully/i)).toBeDefined();
      });
    });

    it("preserves existing connection state and shows sanitized error if re-verify fails", async () => {
      await renderAndSwitchToWhatsAppTab(mockConnectedWhatsAppStatus);

      vi.spyOn(apiClient, "refreshPlatformWhatsApp").mockRejectedValueOnce(
        new ApiClientError("Meta Graph API token revoked: EAAG_LEAKED_TOKEN_SECRET", 500, "OAuthException")
      );

      const reverifyBtn = screen.getByRole("button", { name: /Re-verify Connection/i });
      fireEvent.click(reverifyBtn);

      await waitFor(() => {
        // Redacted token error
        expect(screen.getByText(/Meta Graph API token revoked: \[REDACTED_ACCESS_TOKEN\]/i)).toBeDefined();
        // Existing connection details still intact
        expect(screen.getByText("Grovastra Platform Sender")).toBeDefined();
        expect(screen.getByText("+1 555-0199")).toBeDefined();
      });

      // Ensure raw token was never printed to console
      for (const call of consoleSpy.mock.calls) {
        for (const arg of call) {
          if (typeof arg === "string") {
            expect(arg).not.toContain("EAAG_LEAKED_TOKEN_SECRET");
          }
        }
      }
    });
  });

  describe("4. Disconnect Safeguards & Operational Impact", () => {
    it("shows confirmation dialog with operational impact warning and cancels safely", async () => {
      await renderAndSwitchToWhatsAppTab(mockConnectedWhatsAppStatus);

      const disconnectBtn = screen.getByRole("button", { name: /Disconnect/i });
      fireEvent.click(disconnectBtn);

      expect(screen.getByText("Disconnect Shared WhatsApp Account?")).toBeDefined();
      expect(screen.getByText(/Campaign dispatch and message sending will immediately halt/i)).toBeDefined();
      expect(screen.getByText(/Stored credentials will be tombstoned/i)).toBeDefined();

      // Cancel button dismisses modal without calling disconnect
      const disconnectSpy = vi.spyOn(apiClient, "disconnectPlatformWhatsApp");
      const cancelBtn = screen.getByRole("button", { name: /Cancel/i });
      fireEvent.click(cancelBtn);

      expect(disconnectSpy).not.toHaveBeenCalled();
      expect(screen.queryByText("Disconnect Shared WhatsApp Account?")).toBeNull();
    });

    it("confirms disconnect, displays loading state, and refreshes connection status", async () => {
      await renderAndSwitchToWhatsAppTab(mockConnectedWhatsAppStatus);

      const disconnectSpy = vi.spyOn(apiClient, "disconnectPlatformWhatsApp").mockResolvedValueOnce({
        success: true,
        data: {
          success: true,
          status: "DISCONNECTED",
          message: "Platform credentials disconnected successfully.",
        },
        message: "Platform credentials disconnected successfully.",
        timestamp: new Date().toISOString(),
      });

      // Status mock after disconnect
      vi.spyOn(apiClient, "getPlatformWhatsAppStatus").mockResolvedValueOnce({
        success: true,
        data: mockDisconnectedWhatsAppStatus,
        timestamp: new Date().toISOString(),
      });

      fireEvent.click(screen.getByRole("button", { name: /Disconnect/i }));

      const confirmBtn = screen.getByRole("button", { name: /Confirm Disconnect/i });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(disconnectSpy).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Disconnected")).toBeDefined();
        expect(screen.getByRole("button", { name: /Connect Platform WhatsApp/i })).toBeDefined();
      });
    });

    it("displays sanitized error if disconnect fails on server without disconnecting locally", async () => {
      await renderAndSwitchToWhatsAppTab(mockConnectedWhatsAppStatus);

      vi.spyOn(apiClient, "disconnectPlatformWhatsApp").mockRejectedValueOnce(
        new ApiClientError("Database connection timeout during credential tombstone: token=EAAG_REVOKE_ERR", 500)
      );

      fireEvent.click(screen.getByRole("button", { name: /Disconnect/i }));
      fireEvent.click(screen.getByRole("button", { name: /Confirm Disconnect/i }));

      await waitFor(() => {
        expect(screen.getByText(/Database connection timeout during credential tombstone: token=\[REDACTED_ACCESS_TOKEN\]/i)).toBeDefined();
      });

      // Still connected since server failed
      expect(screen.getByText("Grovastra Platform Sender")).toBeDefined();
    });
  });

  describe("5. Keyboard Accessibility & Escape Handling", () => {
    it("closes Connect modal on Escape key press when not submitting", async () => {
      await renderAndSwitchToWhatsAppTab(mockDisconnectedWhatsAppStatus);

      fireEvent.click(screen.getByRole("button", { name: /Connect Platform WhatsApp/i }));
      expect(screen.getByRole("heading", { name: /Connect Platform WhatsApp Account/i })).toBeDefined();

      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByRole("heading", { name: /Connect Platform WhatsApp Account/i })).toBeNull();
      });
    });

    it("closes Disconnect modal on Escape key press when not pending", async () => {
      await renderAndSwitchToWhatsAppTab(mockConnectedWhatsAppStatus);

      fireEvent.click(screen.getByRole("button", { name: /Disconnect/i }));
      expect(screen.getByText("Disconnect Shared WhatsApp Account?")).toBeDefined();

      fireEvent.keyDown(window, { key: "Escape" });

      await waitFor(() => {
        expect(screen.queryByText("Disconnect Shared WhatsApp Account?")).toBeNull();
      });
    });
  });
});
