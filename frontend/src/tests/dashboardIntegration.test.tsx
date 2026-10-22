import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { DashboardPage } from "../pages/DashboardPage.js";
import { AudiencesPage } from "../pages/AudiencesPage.js";
import { TemplatesPage } from "../pages/TemplatesPage.js";
import { apiClient } from "../services/api.js";

// Mock AuthContext
vi.mock("../context/AuthContext.js", () => ({
  useAuth: () => ({
    user: {
      id: "user-123",
      email: "owner@clientbrand.com",
      firstName: "Brand",
      lastName: "Manager",
      role: "OWNER",
      organizationId: "org-tenant-1",
      createdAt: "2026-01-01T00:00:00.000Z",
    },
    organization: {
      id: "org-tenant-1",
      name: "Acme Retail Ltd",
      slug: "acme-retail",
    },
    isAuthenticated: true,
    isLoading: false,
  }),
}));

// Mock ApiClient
vi.mock("../services/api.js", () => {
  return {
    apiClient: {
      getHealth: vi.fn(),
      getReadiness: vi.fn(),
      listCampaigns: vi.fn(),
      listAudiences: vi.fn(),
      listContacts: vi.fn(),
      listImportJobs: vi.fn(),
      getWhatsAppStatus: vi.fn(),
      listTemplates: vi.fn(),
      syncTemplates: vi.fn(),
      getBaseUrl: () => "http://localhost:5000",
    },
  };
});

describe("Phase 8B: Customer Dashboard Integration & Hub Experiences", () => {
  const mockHealth = {
    status: "ok",
    version: "1.0.0",
    timestamp: "2026-10-15T12:00:00.000Z",
    environment: "test",
    uptimeSeconds: 3600,
  };

  const mockReadiness = {
    status: "ready",
    timestamp: "2026-10-15T12:00:00.000Z",
    checks: { database: true, redis: true },
  };

  const mockSharedWhatsAppStatus = {
    connected: true,
    status: "CONNECTED",
    source: "PLATFORM_SHARED",
    mode: "SHARED_PLATFORM" as const,
    isSharedPlatform: true,
    canManageCredentials: false,
    sharedNotice: "Connected via Grovastra's shared WhatsApp platform account. Outbound campaigns use Grovastra's verified business number.",
    wabaId: "1075305975271164",
    phoneNumberId: "100012345678901",
    displayPhoneNumber: "+1 555-0199",
    verifiedName: "Grovastra Platform",
    tokenExpiresAt: null,
    verifiedAt: "2026-10-15T00:00:00.000Z",
    lastSyncedAt: "2026-10-15T12:00:00.000Z",
    lastError: null,
  };

  const mockCampaigns = [
    {
      id: "camp-101",
      name: "Diwali VIP Blast",
      description: "Festive promo for loyal members",
      status: "DRAFT" as const,
      templateId: "tpl-1",
      templateName: "jaspers_market_order_confirmation_v1",
      templateLanguage: "en_US",
      templateCategory: "UTILITY",
      audienceType: "CONTACT_LIST" as const,
      audienceId: "list-1",
      audienceName: "VIP Club Members",
      totalRecipients: 250,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      variablesMapping: {},
      createdAt: "2026-10-15T10:00:00.000Z",
      updatedAt: "2026-10-15T10:30:00.000Z",
      organizationId: "org-tenant-1",
    },
  ];

  const mockCampaignMetrics = {
    total: 1,
    draft: 1,
    scheduled: 0,
    sending: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  };

  const mockContactLists = [
    {
      id: "list-1",
      name: "VIP Club Members",
      description: "Loyalty tier customers",
      memberCount: 300,
      eligibleMemberCount: 250, // 50 unconsented excluded
      createdAt: "2026-10-10T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    },
  ];

  const mockContacts = [
    {
      id: "c-1",
      phoneNumber: "+15551234567",
      firstName: "Priya",
      lastName: "Sharma",
      email: "priya@example.com",
      consentStatus: "OPTED_IN",
      isSuppressed: false,
      organizationId: "org-tenant-1",
      createdAt: "2026-10-12T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
      lists: [{ id: "list-1", name: "VIP Club Members" }],
    },
    {
      id: "c-2",
      phoneNumber: "+15559876543",
      firstName: "Rahul",
      lastName: "Verma",
      email: "rahul@example.com",
      consentStatus: "PENDING",
      isSuppressed: false,
      organizationId: "org-tenant-1",
      createdAt: "2026-10-14T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
      lists: [{ id: "list-1", name: "VIP Club Members" }],
    },
    {
      id: "c-3",
      phoneNumber: "+15558889999",
      firstName: "Anil",
      lastName: "Kumar",
      email: "anil@example.com",
      consentStatus: "OPTED_IN",
      isSuppressed: true,
      organizationId: "org-tenant-1",
      createdAt: "2026-10-15T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
      lists: [{ id: "list-1", name: "VIP Club Members" }],
    },
  ];

  const mockTemplates = [
    {
      id: "tpl-1",
      name: "jaspers_market_order_confirmation_v1",
      language: "en_US",
      category: "UTILITY",
      status: "APPROVED",
      isSendable: true,
      body: "Special order: Use code {{1}} for {{2}} items with delivery {{3}}!",
      variables: [{ key: "1" }, { key: "2" }, { key: "3" }],
      buttons: [],
    },
    {
      id: "tpl-2",
      name: "jaspers_market_plain_text_v1",
      language: "en_US",
      category: "MARKETING",
      status: "PENDING",
      isSendable: false,
      body: "Welcome to Jaspers Market!",
      variables: [],
      buttons: [],
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.getHealth).mockResolvedValue({
      success: true,
      data: mockHealth as any,
    } as any);

    vi.mocked(apiClient.getReadiness).mockResolvedValue({
      success: true,
      data: mockReadiness as any,
    } as any);

    vi.mocked(apiClient.listCampaigns).mockResolvedValue({
      success: true,
      data: {
        items: mockCampaigns as any,
        metrics: mockCampaignMetrics,
        pagination: { page: 1, limit: 10, total: 1, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      },
    } as any);

    vi.mocked(apiClient.listAudiences).mockResolvedValue({
      status: "success",
      data: mockContactLists as any,
    } as any);

    vi.mocked(apiClient.listContacts).mockResolvedValue({
      status: "success",
      data: {
        items: mockContacts as any,
        pagination: { page: 1, limit: 15, totalItems: 3, totalPages: 1 },
      },
    } as any);

    vi.mocked(apiClient.listImportJobs).mockResolvedValue({
      status: "success",
      data: [],
    } as any);

    vi.mocked(apiClient.getWhatsAppStatus).mockResolvedValue({
      status: "success",
      data: mockSharedWhatsAppStatus as any,
    } as any);

    vi.mocked(apiClient.listTemplates).mockResolvedValue({
      status: "success",
      data: {
        templates: mockTemplates as any,
        totalCount: 2,
        approvedCount: 1,
        source: "SHARED_PLATFORM_WABA",
      },
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("Dashboard: loads and renders real authenticated-tenant data without mock values", async () => {
    const handleNavigate = vi.fn();

    render(<DashboardPage onNavigate={handleNavigate} />);

    // Check that real campaign metric is displayed
    await waitFor(() => {
      expect(screen.getByText(/1 Draft/i)).toBeDefined();
    });

    // Check that total contacts & eligible contacts are displayed accurately
    expect(screen.getByText("250 Opted-In & Send-Eligible")).toBeDefined();

    // Check that WhatsApp Shared Platform status is displayed
    expect(screen.getByText("Grovastra Shared WhatsApp Platform")).toBeDefined();
    expect(screen.getByText("Connected & Active")).toBeDefined();
    expect(screen.getByText("Shared Platform Account")).toBeDefined();

    // Check that real recent campaign appears in the table (responsive desktop table and mobile card view)
    expect(screen.getAllByText("Diwali VIP Blast").length).toBeGreaterThanOrEqual(1);
    expect(screen.getAllByText("jaspers_market_order_confirmation_v1").length).toBeGreaterThanOrEqual(1);
  });

  it("Dashboard: displays clean empty state when tenant has zero campaigns", async () => {
    vi.mocked(apiClient.listCampaigns).mockResolvedValue({
      success: true,
      data: {
        items: [],
        metrics: { total: 0, draft: 0, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 },
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      },
    } as any);

    const handleNavigate = vi.fn();
    render(<DashboardPage onNavigate={handleNavigate} />);

    await waitFor(() => {
      expect(screen.getAllByText("No campaigns created yet").length).toBeGreaterThanOrEqual(1);
      expect(screen.getByText("Draft First Campaign")).toBeDefined();
    });
  });

  it("Audiences & Contacts Hub: displays eligible vs total members and explicit send eligibility badges", async () => {
    render(<AudiencesPage />);

    // Check audience list card displays eligible vs total and exclusion warning
    await waitFor(() => {
      expect(screen.getByText("VIP Club Members")).toBeDefined();
      expect(screen.getByText("250 Eligible")).toBeDefined();
      expect(screen.getByText("300 Total Contacts")).toBeDefined();
      expect(screen.getByText(/50 unconsented contacts excluded/i)).toBeDefined();
    });

    // Switch to All Contacts tab
    const contactsTabBtn = screen.getByRole("button", { name: /All Contacts/i });
    fireEvent.click(contactsTabBtn);

    // Verify Contacts table shows Send Eligibility column
    expect(await screen.findByText("Send Eligibility")).toBeDefined();

    // Priya is OPTED_IN and not suppressed -> Send Eligible
    expect(screen.getByText("Send Eligible")).toBeDefined();

    // Rahul is PENDING -> Pending Consent (Ineligible)
    expect(screen.getByText("Pending Consent")).toBeDefined();

    // Anil is suppressed -> Suppressed (Ineligible)
    expect(screen.getByText("Suppressed (Ineligible)")).toBeDefined();
  });

  it("Templates Hub: clearly distinguishes approved/sendable from non-sendable templates", async () => {
    render(<TemplatesPage />);

    // Wait for templates to load
    await waitFor(() => {
      expect(screen.getByText("jaspers_market_order_confirmation_v1")).toBeDefined();
      expect(screen.getByText("jaspers_market_plain_text_v1")).toBeDefined();
    });

    // Verify Sendable badge on approved template
    expect(screen.getByText("Sendable")).toBeDefined();

    // Verify Non-Sendable badge on pending template
    expect(screen.getByText("Non-Sendable")).toBeDefined();

    // Filter by Sendable
    const statusSelect = screen.getByLabelText("Filter by status");
    fireEvent.change(statusSelect, { target: { value: "SENDABLE" } });

    // Only jaspers_market_order_confirmation_v1 remains visible
    expect(screen.getByText("jaspers_market_order_confirmation_v1")).toBeDefined();
    expect(screen.queryByText("jaspers_market_plain_text_v1")).toBeNull();
  });

  it("Templates Hub: opening approved template renders locked inspector view with Meta editing restriction notice", async () => {
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("jaspers_market_order_confirmation_v1")).toBeDefined();
    });

    // Click "View & Preview" on the approved template card
    const viewBtn = screen.getByRole("button", { name: /View jaspers_market_order_confirmation_v1/i });
    fireEvent.click(viewBtn);

    // Verify prominent banner and explanation
    expect(
      await screen.findByText("Meta-approved template · Editing unavailable")
    ).toBeDefined();
    expect(
      screen.getByText(
        /This template is managed by Meta\. Its approved content cannot be edited here\. Create or update a template through the supported Meta workflow, then refresh its status\./i
      )
    ).toBeDefined();

    // Verify Save Draft button does not exist
    expect(screen.queryByRole("button", { name: /Save Draft/i })).toBeNull();
  });

  it("Templates Hub: displays clean empty state when zero templates exist", async () => {
    vi.mocked(apiClient.listTemplates).mockResolvedValue({
      status: "success",
      data: {
        templates: [],
        totalCount: 0,
        approvedCount: 0,
        source: "SHARED_PLATFORM_WABA",
      },
    } as any);

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(
        screen.getByText("No approved WhatsApp templates available")
      ).toBeDefined();
    });
  });

  it("Dashboard: demo toggle and mock metrics switch are completely absent", async () => {
    const handleNavigate = vi.fn();
    render(<DashboardPage onNavigate={handleNavigate} />);

    await waitFor(() => {
      expect(screen.getByText(/1 Draft/i)).toBeDefined();
    });

    // Ensure demo toggle button is completely gone
    expect(screen.queryByTestId("btn-toggle-demo")).toBeNull();
    expect(screen.queryByText(/Demo Mode/i)).toBeNull();
  });
});
