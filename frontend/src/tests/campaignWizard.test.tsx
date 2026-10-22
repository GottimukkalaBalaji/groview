import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { CampaignWizard } from "../components/CampaignWizard.js";
import { apiClient } from "../services/api.js";

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
      listAudiences: vi.fn(),
      listTemplates: vi.fn(),
      syncTemplates: vi.fn(),
      validateTemplateParameters: vi.fn(),
    },
    ApiClientError: MockApiClientError,
  };
});

describe("Phase 8A: Customer Campaign Flow & CampaignWizard", () => {
  const mockApprovedTemplate = {
    id: "tpl-101",
    name: "jaspers_market_order_confirmation_v1",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    isSendable: true,
    lastUpdated: "2026-10-15T12:00:00.000Z",
    body: "Hi {{1}}, your order {{2}} has been confirmed! Track here: {{3}}",
    variables: [
      { key: "1", label: "Customer Name", fallbackValue: "Valued Customer", sampleValue: "Balaji" },
      { key: "2", label: "Order ID", fallbackValue: "ORD-999", sampleValue: "ORD-12345" },
      { key: "3", label: "Tracking Code", fallbackValue: "TRK-001", sampleValue: "TRACK-987" },
    ],
    footer: "Reply STOP to unsubscribe",
    buttons: [{ id: "btn-1", type: "QUICK_REPLY", text: "Track Order" }],
  };

  const mockPlainTextTemplate = {
    id: "tpl-102",
    name: "jaspers_market_plain_text_v1",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    isSendable: true,
    lastUpdated: "2026-10-15T12:00:00.000Z",
    body: "Welcome to Jaspers Market! Enjoy 20% off all organic groceries this weekend.",
    variables: [],
    footer: "Reply STOP to unsubscribe",
    buttons: [],
  };

  const mockPendingTemplate = {
    id: "tpl-103",
    name: "unapproved_flash_promo",
    language: "en_US",
    category: "MARKETING",
    status: "PENDING",
    isSendable: false,
    lastUpdated: "2026-10-15T12:00:00.000Z",
    body: "Flash sale is starting soon!",
    variables: [],
    footer: "Reply STOP to unsubscribe",
  };

  const mockContactLists = [
    {
      id: "list-alpha",
      name: "VIP Club Customers",
      description: "High engagement members with verified opt-in",
      memberCount: 150,
      eligibleMemberCount: 140, // 10 contacts pending or suppressed
      createdAt: "2026-10-01T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    },
    {
      id: "list-beta",
      name: "Recent Signups",
      description: "Pending verification list",
      memberCount: 80,
      eligibleMemberCount: 20, // 60 unconsented contacts
      createdAt: "2026-10-10T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    },
    {
      id: "list-empty",
      name: "Zero Consent List",
      description: "Contacts without consent",
      memberCount: 50,
      eligibleMemberCount: 0,
      createdAt: "2026-10-12T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();

    vi.mocked(apiClient.listAudiences).mockResolvedValue({
      status: "success",
      data: mockContactLists as any,
    } as any);

    vi.mocked(apiClient.listTemplates).mockResolvedValue({
      status: "success",
      data: {
        templates: [mockApprovedTemplate, mockPlainTextTemplate, mockPendingTemplate],
        totalCount: 3,
        approvedCount: 2,
        source: "SHARED_PLATFORM_WABA",
      },
    } as any);

    vi.mocked(apiClient.syncTemplates).mockResolvedValue({
      status: "success",
      data: {
        message: "Synchronized with Grovastra shared WhatsApp account",
        syncedCount: 3,
        approvedCount: 2,
        cachedAt: "2026-10-15T12:00:00.000Z",
      },
    } as any);

    vi.mocked(apiClient.validateTemplateParameters).mockResolvedValue({
      status: "success",
      data: {
        isValid: true,
        errors: {},
      },
    } as any);
  });

  afterEach(() => {
    cleanup();
  });

  it("renders Step 1 (Basics) and validates campaign name requirements", async () => {
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    render(
      <CampaignWizard
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Verify Step 1 header and fields
    expect(screen.getByText("Step 1: Campaign Basics")).toBeDefined();
    const nameInput = screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i);
    expect(nameInput).toBeDefined();

    // Click Continue with empty name -> shows validation error
    const continueBtn = screen.getByRole("button", { name: /Continue/i });
    fireEvent.click(continueBtn);

    expect(await screen.findByText(/Campaign name must be at least 3 characters long/i)).toBeDefined();

    // Enter valid name (>= 3 chars)
    fireEvent.change(nameInput, { target: { value: "Diwali Special Campaign" } });

    // Step 1 allows entering description
    const descInput = screen.getByPlaceholderText(/Internal notes regarding promotional discount codes/i);
    fireEvent.change(descInput, { target: { value: "Exclusive WhatsApp discounts for loyal members" } });

    // Advance to Step 2
    fireEvent.click(continueBtn);

    // Verify Step 2 is shown
    expect(await screen.findByText("Step 2: Select Message Template")).toBeDefined();
  });

  it("Step 2: filters out non-allowlisted templates and allows syncing shared templates", async () => {
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    render(
      <CampaignWizard
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Fill Step 1 and advance
    const nameInput = screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i);
    fireEvent.change(nameInput, { target: { value: "Diwali Special Campaign" } });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Wait for Step 2
    expect(await screen.findByText("Step 2: Select Message Template")).toBeDefined();

    // Only allowlisted approved templates are selectable
    await waitFor(() => {
      expect(screen.getByText("jaspers_market_order_confirmation_v1")).toBeDefined();
      expect(screen.getByText("jaspers_market_plain_text_v1")).toBeDefined();
    });

    // Verify non-allowlisted / unapproved template is filtered out and never rendered as a choice
    expect(screen.queryByText("unapproved_flash_promo")).toBeNull();

    // Verify Sync Templates button works
    const syncBtn = screen.getByRole("button", { name: /Sync from Meta/i });
    fireEvent.click(syncBtn);

    await waitFor(() => {
      expect(apiClient.syncTemplates).toHaveBeenCalledTimes(1);
    });

    // Advance to Step 3
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(await screen.findByText("Step 3: Select Target Audience")).toBeDefined();
  });

  it("Step 3: displays send-eligible recipient counts and flags excluded unconsented members", async () => {
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    render(
      <CampaignWizard
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Step 1
    fireEvent.change(screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i), {
      target: { value: "Diwali Special Campaign" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 2
    await screen.findByText("Step 2: Select Message Template");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 3: Audience
    await screen.findByText("Step 3: Select Target Audience");

    // Check that VIP Club Customers shows verified opt-in count
    await waitFor(() => {
      expect(screen.getByText("VIP Club Customers")).toBeDefined();
      expect(screen.getByText("140")).toBeDefined(); // eligible count
    });

    // Advance to Step 4
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(await screen.findByText("Step 4: Configure Message Variables")).toBeDefined();
  });

  it("Step 4: validates template parameters with backend validator before proceeding", async () => {
    const handleSave = vi.fn();
    const handleCancel = vi.fn();

    render(
      <CampaignWizard
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Fast-forward to Step 4
    fireEvent.change(screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i), {
      target: { value: "Diwali Special Campaign" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 2
    await screen.findByText("Step 2: Select Message Template");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 3
    await screen.findByText("Step 3: Select Target Audience");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 4

    await screen.findByText("Step 4: Configure Message Variables");

    // Advance should call validateTemplateParameters
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    await waitFor(() => {
      expect(apiClient.validateTemplateParameters).toHaveBeenCalledWith(
        "jaspers_market_order_confirmation_v1",
        expect.any(Object)
      );
    });

    // Now in Step 5: Review Campaign
    expect(await screen.findByText("Step 5: Review Campaign Details")).toBeDefined();
  });

  it("Step 5: displays Grovastra Shared Platform account review details and saves draft safely", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    render(
      <CampaignWizard
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Fill Step 1
    fireEvent.change(screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i), {
      target: { value: "Diwali Special Campaign" },
    });
    fireEvent.change(screen.getByPlaceholderText(/Internal notes regarding promotional discount codes/i), {
      target: { value: "Special Festive Blast" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 2
    await screen.findByText("Step 2: Select Message Template");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 3
    await screen.findByText("Step 3: Select Target Audience");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 4
    await screen.findByText("Step 4: Configure Message Variables");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 5: Review
    await screen.findByText("Step 5: Review Campaign Details");

    // Verify Review Card details
    expect(screen.getAllByText("Diwali Special Campaign").length).toBeGreaterThanOrEqual(2);
    expect(screen.getByText(/Grovastra Shared Platform Account/i)).toBeDefined();
    expect(screen.getByText(/Safety Protection/i)).toBeDefined();
    expect(screen.getByText(/Outbound WhatsApp messages require your explicit confirmation/i)).toBeDefined();

    // Click Save as Draft
    const saveDraftBtn = screen.getByRole("button", { name: /Save as Draft/i });
    fireEvent.click(saveDraftBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledTimes(1);
      const [payload, isEdit] = handleSave.mock.calls[0];
      expect(isEdit).toBe(false);
      expect(payload.name).toBe("Diwali Special Campaign");
      expect(payload.templateName).toBe("jaspers_market_order_confirmation_v1");
      expect(payload.totalRecipients).toBeDefined();
      expect(payload.clientRequestId).toBeDefined();
    });
  });

  it("Step 5: shows pre-launch readiness feedback and enables Review & Launch button when valid", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleLaunch = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    const { container } = render(
      <CampaignWizard
        onSave={handleSave}
        onLaunch={handleLaunch}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Fast-forward to Step 5
    fireEvent.change(screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i), {
      target: { value: "Launch Ready Campaign" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 2
    await screen.findByText("Step 2: Select Message Template");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 3
    await screen.findByText("Step 3: Select Target Audience");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 4
    await screen.findByText("Step 4: Configure Message Variables");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 5
    await screen.findByText("Step 5: Review Campaign Details");

    // Pre-launch readiness badge should be shown as Ready
    expect(screen.getByText(/Ready to Launch/i)).toBeDefined();

    // Launch button should be present and enabled
    const launchBtn = container.querySelector("#wizard-launch-campaign-btn") as HTMLButtonElement;
    expect(launchBtn).toBeDefined();
    expect(launchBtn.disabled).toBe(false);

    // Click Launch button -> opens Launch Confirmation Modal
    fireEvent.click(launchBtn);
    expect(await screen.findByText(/Confirm Campaign Launch/i)).toBeDefined();
  });

  it("Step 5: disables Review & Launch and displays clear failure reason when audience has 0 eligible contacts", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleLaunch = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    const { container } = render(
      <CampaignWizard
        onSave={handleSave}
        onLaunch={handleLaunch}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Step 1
    fireEvent.change(screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i), {
      target: { value: "Zero Audience Campaign" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 2: Select template
    await screen.findByText("Step 2: Select Message Template");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 3: Select Zero Consent List
    await screen.findByText("Step 3: Select Target Audience");
    const emptyListCard = screen.getByText("Zero Consent List");
    fireEvent.click(emptyListCard);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 4
    await screen.findByText("Step 4: Configure Message Variables");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 5: Review
    await screen.findByText("Step 5: Review Campaign Details");

    // Sending disabled alert should be visible
    expect(screen.getByText(/Sending is currently disabled/i)).toBeDefined();
    expect(screen.getAllByText(/Selected contact list has 0 eligible opted-in contacts/i).length).toBeGreaterThanOrEqual(1);

    // Review & Launch button must be disabled
    const launchBtn = container.querySelector("#wizard-launch-campaign-btn") as HTMLButtonElement;
    expect(launchBtn.disabled).toBe(true);
  });

  it("supports plain text template with 0 variables without requiring variable inputs", async () => {
    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    render(
      <CampaignWizard
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Step 1
    fireEvent.change(screen.getByPlaceholderText(/Diwali Mega Flash Sale 2026/i), {
      target: { value: "Plain Text Campaign" },
    });
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 2: Select jaspers_market_plain_text_v1
    await screen.findByText("Step 2: Select Message Template");
    const plainTextCard = screen.getByText("jaspers_market_plain_text_v1");
    fireEvent.click(plainTextCard);
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 3: Audience
    await screen.findByText("Step 3: Select Target Audience");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));

    // Step 4: Shows zero variables notice
    await screen.findByText("Step 4: Configure Message Variables");
    expect(screen.getByText("No Dynamic Variables")).toBeDefined();
    expect(screen.getByText(/The message body is static and ready for broadcast without variable mapping/i)).toBeDefined();

    // Advancing immediately to Step 5
    fireEvent.click(screen.getByRole("button", { name: /Continue/i }));
    expect(await screen.findByText("Step 5: Review Campaign Details")).toBeDefined();
  });

  it("supports reopening and editing an existing campaign draft with pre-filled fields", async () => {
    const existingDraft = {
      id: "camp-existing-1",
      name: "Existing Saved Draft",
      description: "Existing Description",
      status: "DRAFT" as const,
      templateId: "tpl-101",
      templateName: "jaspers_market_order_confirmation_v1",
      templateLanguage: "en_US",
      templateCategory: "UTILITY",
      audienceType: "CONTACT_LIST" as const,
      audienceId: "list-alpha",
      audienceName: "VIP Club Customers",
      totalRecipients: 140,
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
      variablesMapping: { "1": "Valued VIP", "2": "Summer", "3": "VIP20" },
      createdAt: "2026-10-14T00:00:00.000Z",
      updatedAt: "2026-10-15T00:00:00.000Z",
      organizationId: "org-456",
    };

    const handleSave = vi.fn().mockResolvedValue(undefined);
    const handleCancel = vi.fn();

    render(
      <CampaignWizard
        initialCampaign={existingDraft as any}
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={false}
      />
    );

    // Check pre-populated name
    const nameInput = screen.getByDisplayValue("Existing Saved Draft");
    expect(nameInput).toBeDefined();

    // Check pre-populated description
    const descInput = screen.getByDisplayValue("Existing Description");
    expect(descInput).toBeDefined();

    // Navigate through steps to Step 5 (Review & Save)
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 2
    await screen.findByText("Step 2: Select Message Template");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 3
    await screen.findByText("Step 3: Select Target Audience");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 4
    await screen.findByText("Step 4: Configure Message Variables");
    fireEvent.click(screen.getByRole("button", { name: /Continue/i })); // to 5
    await screen.findByText("Step 5: Review Campaign Details");

    // Button should now say "Update Draft" because isEdit is true
    const updateDraftBtn = screen.getByRole("button", { name: /Update Draft/i });
    fireEvent.click(updateDraftBtn);

    await waitFor(() => {
      expect(handleSave).toHaveBeenCalledTimes(1);
      const [payload, isEdit] = handleSave.mock.calls[0];
      expect(isEdit).toBe(true);
      expect(payload.name).toBe("Existing Saved Draft");
      expect(payload.variablesMapping).toEqual({
        "1": "Valued VIP",
        "2": "Summer",
        "3": "VIP20",
      });
    });
  });
});
