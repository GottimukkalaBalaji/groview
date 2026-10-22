import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup, within } from "@testing-library/react";
import { SettingsPage } from "../pages/SettingsPage.js";
import { apiClient, ApiClientError } from "../services/api.js";
import { SafeConnectionStatus } from "../types/whatsappIntegration.js";

// Mock AuthContext
vi.mock("../context/AuthContext.js", () => ({
  useAuth: () => ({
    user: {
      id: "user-123",
      email: "admin@enterprise.com",
      firstName: "Enterprise",
      lastName: "Admin",
      role: "OWNER",
      organizationId: "org-456",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    organization: {
      id: "org-456",
      name: "Enterprise Brand Ltd",
      slug: "enterprise-brand",
    },
    isAuthenticated: true,
    isLoading: false,
    login: vi.fn(),
    signup: vi.fn(),
    logout: vi.fn(),
    refreshUser: vi.fn(),
  }),
}));

// Mock ApiClient
vi.mock("../services/api.js", () => {
  class MockApiClientError extends Error {
    public statusCode: number;
    public code: string;
    constructor(message: string, statusCode: number, code = "UNKNOWN_ERROR") {
      super(message);
      this.name = "ApiClientError";
      this.statusCode = statusCode;
      this.code = code;
    }
  }

  return {
    apiClient: {
      getWhatsAppStatus: vi.fn(),
      connectWhatsApp: vi.fn(),
      refreshWhatsApp: vi.fn(),
      disconnectWhatsApp: vi.fn(),
    },
    ApiClientError: MockApiClientError,
  };
});

describe("Phase 6D: WhatsApp Integration Settings UI", () => {
  const mockConnectedStatus: SafeConnectionStatus = {
    connected: true,
    status: "CONNECTED",
    source: "DATABASE",
    wabaId: "109823485729182",
    phoneNumberId: "108374928174829",
    displayPhoneNumber: "+1 555-0199",
    verifiedName: "Enterprise Brand Official",
    tokenExpiresAt: null,
    verifiedAt: "2026-10-15T10:00:00.000Z",
    lastSyncedAt: "2026-10-15T12:00:00.000Z",
    lastError: null,
  };

  const mockNotConnectedStatus: SafeConnectionStatus = {
    connected: false,
    status: "NOT_CONNECTED",
    source: "NONE",
    wabaId: null,
    phoneNumberId: null,
    displayPhoneNumber: null,
    verifiedName: null,
    tokenExpiresAt: null,
    verifiedAt: null,
    lastSyncedAt: null,
    lastError: null,
  };

  const mockDisconnectedStatus: SafeConnectionStatus = {
    connected: false,
    status: "DISCONNECTED",
    source: "DATABASE",
    wabaId: "109823485729182",
    phoneNumberId: "108374928174829",
    displayPhoneNumber: "+1 555-0199",
    verifiedName: "Enterprise Brand Official",
    tokenExpiresAt: null,
    verifiedAt: "2026-10-14T00:00:00.000Z",
    lastSyncedAt: "2026-10-15T00:00:00.000Z",
    lastError: "Disconnected by user",
  };

  const mockTokenExpiredStatus: SafeConnectionStatus = {
    connected: false,
    status: "TOKEN_EXPIRED",
    source: "DATABASE",
    wabaId: "109823485729182",
    phoneNumberId: "108374928174829",
    displayPhoneNumber: "+1 555-0199",
    verifiedName: "Enterprise Brand Official",
    tokenExpiresAt: "2026-10-14T00:00:00.000Z",
    verifiedAt: "2026-10-01T00:00:00.000Z",
    lastSyncedAt: "2026-10-15T08:00:00.000Z",
    lastError: "Meta rejected access token: Token was revoked or expired",
  };

  beforeEach(() => {
    vi.resetAllMocks();
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockNotConnectedStatus,
      timestamp: new Date().toISOString(),
    });
  });

  afterEach(() => {
    cleanup();
  });

  // --------------------------------------------------------------------------
  // Requirement 1: Loading and rendering a connected account
  // --------------------------------------------------------------------------
  it("Requirement 1: loads and renders a connected WhatsApp account with verified details and safe IDs", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockConnectedStatus,
      timestamp: new Date().toISOString(),
    });

    render(<SettingsPage />);

    // After resolving, displays verified details
    await waitFor(() => {
      expect(screen.getByText("Enterprise Brand Official")).toBeInTheDocument();
    });

    expect(screen.getByText("+1 555-0199")).toBeInTheDocument();
    expect(screen.getByText("109823485729182")).toBeInTheDocument();
    expect(screen.getByText("108374928174829")).toBeInTheDocument();
    expect(screen.getByText("Custom Business Account")).toBeInTheDocument();
    expect(screen.getByText("Connected & Verified")).toBeInTheDocument();

    // Access token is NEVER displayed
    expect(screen.queryByText(/EAAG/)).not.toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // Requirement 2: Rendering the empty / disconnected state
  // --------------------------------------------------------------------------
  it("Requirement 2A: renders the empty not-connected state when no WhatsApp account exists", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockNotConnectedStatus,
      timestamp: new Date().toISOString(),
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No WhatsApp Account Connected")).toBeInTheDocument();
    });

    expect(screen.getByText("Connect Account Now")).toBeInTheDocument();
    expect(screen.getByText("Not Connected")).toBeInTheDocument();
  });

  it("Requirement 2B: renders the disconnected state when account was disconnected", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockDisconnectedStatus,
      timestamp: new Date().toISOString(),
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("WhatsApp Account Disconnected")).toBeInTheDocument();
    });

    expect(screen.getByText("Disconnected")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Connect WhatsApp Account/i })).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // Requirement 3: Connect form validation
  // --------------------------------------------------------------------------
  it("Requirement 3: validates required fields before submission", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockNotConnectedStatus,
      timestamp: new Date().toISOString(),
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/WhatsApp Business Account ID/i)).toBeInTheDocument();
    });

    const wabaInput = screen.getByLabelText(/WhatsApp Business Account ID/i);
    const phoneInput = screen.getByLabelText(/Phone Number ID/i);
    const submitBtn = screen.getByRole("button", { name: /Verify & Connect WhatsApp/i });

    // When empty, submit button is disabled
    expect(submitBtn).toBeDisabled();

    // Fill only WABA ID
    fireEvent.change(wabaInput, { target: { value: "12345" } });
    expect(submitBtn).toBeDisabled();

    // Fill Phone ID
    fireEvent.change(phoneInput, { target: { value: "67890" } });
    expect(submitBtn).toBeDisabled();

    // Fill Token
    const tokenInput = screen.getByLabelText(/System User Access Token/i);
    fireEvent.change(tokenInput, { target: { value: "EAAG_TEST_TOKEN" } });

    // Now submit button is enabled
    expect(submitBtn).not.toBeDisabled();
    expect(apiClient.connectWhatsApp).not.toHaveBeenCalled();
  });

  // --------------------------------------------------------------------------
  // Requirement 4: Token masking and clearing after submission
  // --------------------------------------------------------------------------
  it("Requirement 4: masks token by default, toggles show/hide, and clears immediately after submit", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockNotConnectedStatus,
      timestamp: new Date().toISOString(),
    });
    vi.mocked(apiClient.connectWhatsApp).mockRejectedValueOnce(
      new ApiClientError("Verification failed", 401, "META_AUTH_INVALID")
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/System User Access Token/i)).toBeInTheDocument();
    });

    const tokenInput = screen.getByLabelText(/System User Access Token/i) as HTMLInputElement;
    const toggleBtn = screen.getByLabelText(/Show access token/i);

    // Default: masked as password
    expect(tokenInput.type).toBe("password");

    // Toggle to visible text
    fireEvent.click(toggleBtn);
    expect(tokenInput.type).toBe("text");

    // Toggle back to password
    const hideBtn = screen.getByLabelText(/Hide access token/i);
    fireEvent.click(hideBtn);
    expect(tokenInput.type).toBe("password");

    // Enter credentials
    fireEvent.change(screen.getByLabelText(/WhatsApp Business Account ID/i), {
      target: { value: "109823485729182" },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number ID/i), {
      target: { value: "108374928174829" },
    });
    fireEvent.change(tokenInput, {
      target: { value: "EAAG_SENSITIVE_SECRET_TOKEN" },
    });

    expect(tokenInput.value).toBe("EAAG_SENSITIVE_SECRET_TOKEN");

    // Submit form
    const form = tokenInput.closest("form")!;
    fireEvent.submit(form);

    // After submit, token must be cleared immediately from component state
    await waitFor(() => {
      expect(tokenInput.value).toBe("");
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 5: Successful connection refreshes status
  // --------------------------------------------------------------------------
  it("Requirement 5: successful connection refreshes connection status and shows verified details", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockNotConnectedStatus,
      timestamp: new Date().toISOString(),
    });
    vi.mocked(apiClient.connectWhatsApp).mockResolvedValueOnce({
      success: true,
      data: mockConnectedStatus,
      timestamp: new Date().toISOString(),
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("No WhatsApp Account Connected")).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/WhatsApp Business Account ID/i), {
      target: { value: "109823485729182" },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number ID/i), {
      target: { value: "108374928174829" },
    });
    fireEvent.change(screen.getByLabelText(/System User Access Token/i), {
      target: { value: "EAAG_NEW_VALID_TOKEN" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Verify & Connect WhatsApp/i }));

    await waitFor(() => {
      expect(apiClient.connectWhatsApp).toHaveBeenCalledWith({
        wabaId: "109823485729182",
        phoneNumberId: "108374928174829",
        accessToken: "EAAG_NEW_VALID_TOKEN",
      });
    });

    // Verification success banner and connected card appear
    await waitFor(() => {
      expect(
        screen.getByText(/WhatsApp Business Account connected and verified successfully/i)
      ).toBeInTheDocument();
      expect(screen.getByText("Enterprise Brand Official")).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 6: Failed connection shows a safe error and clears the token
  // --------------------------------------------------------------------------
  it("Requirement 6: failed connection shows a safe error message and clears the token field", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockNotConnectedStatus,
      timestamp: new Date().toISOString(),
    });
    vi.mocked(apiClient.connectWhatsApp).mockRejectedValueOnce(
      new ApiClientError("The provided Meta access token is invalid, expired, or has been revoked.", 401, "META_AUTH_INVALID")
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/System User Access Token/i)).toBeInTheDocument();
    });

    const tokenInput = screen.getByLabelText(/System User Access Token/i) as HTMLInputElement;

    fireEvent.change(screen.getByLabelText(/WhatsApp Business Account ID/i), {
      target: { value: "109823485729182" },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number ID/i), {
      target: { value: "108374928174829" },
    });
    fireEvent.change(tokenInput, {
      target: { value: "EAAG_INVALID_TOKEN" },
    });

    fireEvent.click(screen.getByRole("button", { name: /Verify & Connect WhatsApp/i }));

    // Safe error banner appears
    await waitFor(() => {
      expect(
        screen.getByText("The provided Meta access token is invalid, expired, or has been revoked.")
      ).toBeInTheDocument();
    });

    // Token is cleared even on failure
    expect(tokenInput.value).toBe("");
  });

  // --------------------------------------------------------------------------
  // Requirement 7: Refresh loading / success / failure states
  // --------------------------------------------------------------------------
  it("Requirement 7A: revalidates connection and displays success feedback", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockConnectedStatus,
      timestamp: new Date().toISOString(),
    });
    vi.mocked(apiClient.refreshWhatsApp).mockResolvedValueOnce({
      success: true,
      data: {
        ...mockConnectedStatus,
        lastSyncedAt: new Date().toISOString(),
      },
      timestamp: new Date().toISOString(),
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Revalidate")).toBeInTheDocument();
    });

    const refreshBtn = screen.getByRole("button", { name: /Refresh WhatsApp connection status/i });
    fireEvent.click(refreshBtn);

    await waitFor(() => {
      expect(apiClient.refreshWhatsApp).toHaveBeenCalledTimes(1);
      expect(
        screen.getByText("WhatsApp connection details refreshed and verified.")
      ).toBeInTheDocument();
    });
  });

  it("Requirement 7B: refresh detects token expiration and displays expired alert", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockConnectedStatus,
      timestamp: new Date().toISOString(),
    });
    vi.mocked(apiClient.refreshWhatsApp).mockResolvedValueOnce({
      success: true,
      data: mockTokenExpiredStatus,
      timestamp: new Date().toISOString(),
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Revalidate")).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /Refresh WhatsApp connection status/i }));

    await waitFor(() => {
      expect(
        screen.getByText(/Meta System User Token Expired or Revoked/i)
      ).toBeInTheDocument();
      expect(screen.getByText("Reconnect Account Now")).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 8: Disconnect requires confirmation and refreshes status after success
  // --------------------------------------------------------------------------
  it("Requirement 8: requires confirmation modal to disconnect and refreshes status", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockConnectedStatus,
      timestamp: new Date().toISOString(),
    });
    vi.mocked(apiClient.disconnectWhatsApp).mockResolvedValueOnce({
      success: true,
      data: {
        success: true,
        message: "WhatsApp connection successfully disconnected.",
        status: "DISCONNECTED",
      },
      timestamp: new Date().toISOString(),
    });

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Disconnect Account")).toBeInTheDocument();
    });

    // Clicking Disconnect opens confirmation modal
    fireEvent.click(screen.getByText("Disconnect Account"));

    expect(screen.getByText("Disconnect WhatsApp Account?")).toBeInTheDocument();
    expect(
      screen.getByText(/Future WhatsApp campaign dispatches and broadcast jobs will be disabled/i)
    ).toBeInTheDocument();

    // Prepare disconnected status for the refresh call
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockDisconnectedStatus,
      timestamp: new Date().toISOString(),
    });

    // Confirm disconnection inside modal
    const dialog = screen.getByRole("dialog");
    const confirmBtn = within(dialog).getByRole("button", { name: /Disconnect Account/i });
    fireEvent.click(confirmBtn);

    await waitFor(() => {
      expect(apiClient.disconnectWhatsApp).toHaveBeenCalledTimes(1);
    });

    // After success, modal is closed and disconnected status is rendered
    await waitFor(() => {
      expect(screen.queryByText("Disconnect WhatsApp Account?")).not.toBeInTheDocument();
      expect(screen.getByText("WhatsApp Account Disconnected")).toBeInTheDocument();
    });
  });

  // --------------------------------------------------------------------------
  // Requirement 9: Authentication errors are handled correctly
  // --------------------------------------------------------------------------
  it("Requirement 9: handles 401 unauthorized and server errors gracefully", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockRejectedValueOnce(
      new ApiClientError("Authentication required. Organization context is missing.", 401, "UNAUTHORIZED")
    );

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByText("Failed to Load Status")).toBeInTheDocument();
      expect(
        screen.getByText("Authentication required. Organization context is missing.")
      ).toBeInTheDocument();
    });

    expect(screen.getByRole("button", { name: /Retry/i })).toBeInTheDocument();
  });

  // --------------------------------------------------------------------------
  // Requirement 10: Duplicate submissions are prevented
  // --------------------------------------------------------------------------
  it("Requirement 10: prevents duplicate form submissions while a request is in progress", async () => {
    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      success: true,
      data: mockNotConnectedStatus,
      timestamp: new Date().toISOString(),
    });

    // Create a delayed promise to keep submission in progress
    let resolvePromise: (value: any) => void;
    const delayedPromise = new Promise((resolve) => {
      resolvePromise = resolve;
    });

    vi.mocked(apiClient.connectWhatsApp).mockReturnValueOnce(delayedPromise as any);

    render(<SettingsPage />);

    await waitFor(() => {
      expect(screen.getByLabelText(/System User Access Token/i)).toBeInTheDocument();
    });

    fireEvent.change(screen.getByLabelText(/WhatsApp Business Account ID/i), {
      target: { value: "109823485729182" },
    });
    fireEvent.change(screen.getByLabelText(/Phone Number ID/i), {
      target: { value: "108374928174829" },
    });
    fireEvent.change(screen.getByLabelText(/System User Access Token/i), {
      target: { value: "EAAG_FIRST_SUBMIT" },
    });

    const submitBtn = screen.getByRole("button", { name: /Verify & Connect WhatsApp/i });
    fireEvent.click(submitBtn);

    // In-flight state: button disabled and shows spinner text
    expect(screen.getByText(/Verifying with Meta Graph API/i)).toBeInTheDocument();
    expect(submitBtn).toBeDisabled();

    // Secondary click attempt should NOT trigger additional call
    fireEvent.click(submitBtn);
    expect(apiClient.connectWhatsApp).toHaveBeenCalledTimes(1);

    // Resolve delayed response
    resolvePromise!({
      success: true,
      data: mockConnectedStatus,
      timestamp: new Date().toISOString(),
    });

    await waitFor(() => {
      expect(screen.getByText("Enterprise Brand Official")).toBeInTheDocument();
    });
  });
});
