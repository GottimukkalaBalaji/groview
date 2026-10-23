import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { TemplatesPage } from "../pages/TemplatesPage.js";
import { CampaignsPage } from "../pages/CampaignsPage.js";
import { apiClient } from "../services/api.js";
import * as AuthContextModule from "../context/AuthContext.js";
import { User } from "../types/auth.js";

// Mock API client
vi.mock("../services/api.js", () => {
  return {
    apiClient: {
      listTemplates: vi.fn(),
      syncTemplates: vi.fn(),
      listCampaigns: vi.fn(),
      getSchedulerStatus: vi.fn(),
    },
    ApiClientError: class extends Error {},
  };
});

describe("Template Studio Entry Point & Access Control", () => {
  const mockTemplates = [
    {
      id: "tpl-1",
      name: "hello_world",
      language: "en_US",
      category: "UTILITY",
      status: "APPROVED",
      isSendable: true,
      lastUpdated: "2026-10-15T12:00:00.000Z",
      header: { type: "NONE" },
      body: "Welcome to WhatsApp Business API!",
      variables: [],
      buttons: [],
    },
  ];

  const mockSuperAdminUser: User = {
    id: "usr_super_admin",
    email: "admin@grovastra.com",
    firstName: "Super",
    lastName: "Admin",
    role: "OWNER",
    platformRole: "PLATFORM_MASTER_ADMIN",
    organizationId: "org_master",
    createdAt: new Date().toISOString(),
  };

  const setupSuperAdminAuth = () => {
    return vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: mockSuperAdminUser,
      organization: { id: "org_master", name: "Grovastra Platform", slug: "grovastra-platform" },
      platformCapabilities: {
        isPlatformAdmin: true,
        platformRole: "PLATFORM_MASTER_ADMIN",
        canManagePlatformWhatsApp: true,
        canManageAllOrganizations: true,
        canAssignBusinesses: true,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  };

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();

    if (!window.URL.createObjectURL) {
      window.URL.createObjectURL = vi.fn((file: any) => `blob:http://localhost/${file.name}`);
    } else {
      vi.spyOn(window.URL, "createObjectURL").mockImplementation((file: any) => `blob:http://localhost/${file.name}`);
    }
    if (!window.URL.revokeObjectURL) {
      window.URL.revokeObjectURL = vi.fn();
    } else {
      vi.spyOn(window.URL, "revokeObjectURL").mockImplementation(() => {});
    }

    (apiClient.listTemplates as any).mockResolvedValue({
      success: true,
      data: {
        templates: mockTemplates,
        summary: {
          totalOnMeta: 1,
          approvedCount: 1,
          pendingCount: 0,
          rejectedCount: 0,
          wabaIdMasked: "***1234",
          syncedAt: new Date().toISOString(),
          requestedTemplatesFound: {
            hello_world: true,
            jaspers_market_plain_text_v1: false,
            jaspers_market_order_confirmation_v1: false,
          },
        },
      },
    });

    (apiClient.listCampaigns as any).mockResolvedValue({
      success: true,
      data: {
        items: [],
        metrics: { total: 0, draft: 0, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 },
        pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
      },
    });
    (apiClient.getSchedulerStatus as any).mockResolvedValue({
      success: true,
      data: { workerActive: true },
    });
  });

  afterEach(() => {
    cleanup();
    localStorage.clear();
    vi.restoreAllMocks();
  });

  it("renders 'Create New Template' button on Templates page when authenticated as Super Admin", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("WhatsApp Message Templates")).toBeInTheDocument();
    });

    // Super Admin should see "Create New Template" button
    const createBtn = screen.getByRole("button", { name: /create new template/i });
    expect(createBtn).toBeInTheDocument();

    // Super Admin should NOT see the passive "Managed in Meta Business Manager" message
    expect(screen.queryByText("Managed in Meta Business Manager")).not.toBeInTheDocument();

    // "Sync with Meta" button remains intact
    expect(screen.getByRole("button", { name: /sync with meta/i })).toBeInTheDocument();
  });

  it("hides 'Create New Template' and shows 'Managed in Meta Business Manager' for ordinary users", async () => {
    // Mock Ordinary User (Customer OWNER, platformRole: NONE)
    const ordinaryUser: User = {
      id: "usr_regular",
      email: "customer@company.com",
      firstName: "Regular",
      lastName: "User",
      role: "OWNER",
      platformRole: "NONE",
      organizationId: "org_cust_123",
      createdAt: new Date().toISOString(),
    };

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: ordinaryUser,
      organization: { id: "org_cust_123", name: "Acme Corp", slug: "acme-corp" },
      platformCapabilities: {
        isPlatformAdmin: false,
        platformRole: "NONE",
        canManagePlatformWhatsApp: false,
        canManageAllOrganizations: false,
        canAssignBusinesses: false,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("WhatsApp Message Templates")).toBeInTheDocument();
    });

    // Ordinary user must NOT see "Create New Template"
    expect(screen.queryByRole("button", { name: /create new template/i })).not.toBeInTheDocument();

    // Ordinary user MUST see the informative "Managed in Meta Business Manager" message
    expect(screen.getByText("Managed in Meta Business Manager")).toBeInTheDocument();

    // "Sync with Meta" button remains functional for ordinary users
    expect(screen.getByRole("button", { name: /sync with meta/i })).toBeInTheDocument();
  });

  it("hides 'Create New Template' and shows 'Managed in Meta Business Manager' for Delegated Admins", async () => {
    // Mock Delegated Admin (platformRole: DELEGATED_ADMIN)
    const delegatedUser: User = {
      id: "usr_delegated",
      email: "delegated@agency.com",
      firstName: "Agency",
      lastName: "Admin",
      role: "ADMIN",
      platformRole: "DELEGATED_ADMIN",
      organizationId: "org_agency",
      createdAt: new Date().toISOString(),
    };

    vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user: delegatedUser,
      organization: { id: "org_agency", name: "Agency", slug: "agency" },
      platformCapabilities: {
        isPlatformAdmin: false,
        platformRole: "DELEGATED_ADMIN",
        canManagePlatformWhatsApp: false,
        canManageAllOrganizations: false,
        canAssignBusinesses: false,
        assignedOrganizationIds: ["org_cust_123"],
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText("WhatsApp Message Templates")).toBeInTheDocument();
    });

    // Delegated admin must NOT see "Create New Template"
    expect(screen.queryByRole("button", { name: /create new template/i })).not.toBeInTheDocument();
    expect(screen.getByText("Managed in Meta Business Manager")).toBeInTheDocument();
  });

  it("opens Template Studio authoring workspace with Local Draft notice when Super Admin clicks 'Create New Template'", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    // Click "Create New Template"
    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // Verify Template Studio opens
    await waitFor(() => {
      expect(screen.getByText("Super Admin Template Studio:")).toBeInTheDocument();
      expect(screen.getByText("Local Draft — Not Submitted to Meta")).toBeInTheDocument();
    });

    // Verify presence of form sections
    expect(screen.getByText(/1\. Basic Details/i)).toBeInTheDocument();
    expect(screen.getByText(/3\. Message Body/i)).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /save local draft/i })).toBeInTheDocument();

    // Verify live phone preview is rendered
    expect(screen.getByText(/Live WhatsApp Preview/i)).toBeInTheDocument();
  });

  it("supports variable insertion and reactive validation in Template Studio", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /add variable/i })).toBeInTheDocument();
    });

    // Click Add Variable
    fireEvent.click(screen.getByRole("button", { name: /add variable/i }));

    // Input template name with invalid characters (e.g. spaces/uppercase)
    const nameInput = screen.getByLabelText(/template name/i);
    fireEvent.change(nameInput, { target: { value: "Invalid Name With Spaces!" } });

    // Sanitizer forces lowercase alphanumeric with underscores
    expect((nameInput as HTMLInputElement).value).toBe("invalidnamewithspaces");
  });

  it("preserves Campaigns page 'Create Campaign' button label exactly as it is today", async () => {
    setupSuperAdminAuth();

    render(<CampaignsPage />);

    // Campaigns page must retain "Create Campaign" exactly (NOT changed)
    await waitFor(() => {
      const createCampaignBtn = screen.getByRole("button", { name: /create campaign/i });
      expect(createCampaignBtn).toBeInTheDocument();
      expect(createCampaignBtn.textContent).toContain("Create Campaign");
    });
  });

  it("defaults Template Type to 'Standard Text / Media + Buttons' and opens editor immediately", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    await waitFor(() => {
      const typeSelect = screen.getByTestId("template-type-select") as HTMLSelectElement;
      expect(typeSelect).toBeInTheDocument();
      // Default selection must be STANDARD
      expect(typeSelect.value).toBe("STANDARD");
    });

    // Check all options exist in required order
    const typeSelect = screen.getByTestId("template-type-select") as HTMLSelectElement;
    const options = Array.from(typeSelect.options).map((opt) => opt.text);
    expect(options).toEqual([
      "Standard Text / Media + Buttons",
      "Carousel",
      "Coupon / LTO",
      "Authentication",
      "WhatsApp Flows",
      "Commerce Integrations",
    ]);

    // Standard editor opened immediately without any separate selection page
    expect(screen.getByTestId("standard-editor-workspace")).toBeInTheDocument();
  });

  it("changes the displayed workspace and phone preview when selecting each dropdown option", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    const typeSelect = await screen.findByTestId("template-type-select");

    // 1. Switch to CAROUSEL
    fireEvent.change(typeSelect, { target: { value: "CAROUSEL" } });
    expect(screen.getByTestId("carousel-editor-workspace")).toBeInTheDocument();
    expect(screen.getByText("Carousel Template Specification")).toBeInTheDocument();
    expect(screen.getByText("2 to 10 Cards")).toBeInTheDocument();
    expect(screen.getByText(/Carousel Mockup/i)).toBeInTheDocument();

    // 2. Switch to COUPON_LTO
    fireEvent.change(typeSelect, { target: { value: "COUPON_LTO" } });
    expect(screen.getByTestId("coupon-lto-editor-workspace")).toBeInTheDocument();
    expect(screen.getByText("Coupon & LTO Specification")).toBeInTheDocument();
    expect(screen.getByText("COPY_CODE Button")).toBeInTheDocument();

    // 3. Switch to AUTHENTICATION
    fireEvent.change(typeSelect, { target: { value: "AUTHENTICATION" } });
    expect(screen.getByTestId("authentication-editor-workspace")).toBeInTheDocument();
    expect(screen.getByText("Authentication Template Specification")).toBeInTheDocument();
    expect(screen.getByText("1 to 90 Minutes")).toBeInTheDocument();

    // 4. Switch to FLOWS
    fireEvent.change(typeSelect, { target: { value: "FLOWS" } });
    expect(screen.getByTestId("flows-editor-workspace")).toBeInTheDocument();
    expect(screen.getByText("WhatsApp Flows Specification")).toBeInTheDocument();
    expect(screen.getByText("flow_id Required")).toBeInTheDocument();

    // 5. Switch to COMMERCE
    fireEvent.change(typeSelect, { target: { value: "COMMERCE" } });
    expect(screen.getByTestId("commerce-editor-workspace")).toBeInTheDocument();
    expect(screen.getByText("Commerce Template Specification")).toBeInTheDocument();
    expect(screen.getByText("catalog_id Required")).toBeInTheDocument();

    // 6. Switch back to STANDARD
    fireEvent.change(typeSelect, { target: { value: "STANDARD" } });
    expect(screen.getByTestId("standard-editor-workspace")).toBeInTheDocument();
  });

  it("prevents saving unsupported template types as Standard templates", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    const typeSelect = await screen.findByTestId("template-type-select");
    fireEvent.change(typeSelect, { target: { value: "CAROUSEL" } });

    // The save button is disabled with disabled testid
    const disabledBtn = screen.getByTestId("save-draft-disabled-btn");
    expect(disabledBtn).toBeInTheDocument();
    expect(disabledBtn).toBeDisabled();
    expect(disabledBtn.textContent).toContain("Save Disabled");

    // Standard save button should not be present
    expect(screen.queryByTestId("save-draft-btn")).not.toBeInTheDocument();
  });

  it("warns user before switching type when unsaved edits exist and does not silently lose content", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    const nameInput = (await screen.findByLabelText(/template name/i)) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "critical_summer_offer" } });
    expect(nameInput.value).toBe("critical_summer_offer");

    const typeSelect = screen.getByTestId("template-type-select");

    // Attempt to switch to Carousel while having unsaved edits
    fireEvent.change(typeSelect, { target: { value: "CAROUSEL" } });

    // Warning modal should pop up!
    await waitFor(() => {
      expect(screen.getByText("Switch Template Type?")).toBeInTheDocument();
      expect(screen.getByText(/You have unsaved changes in your current/i)).toBeInTheDocument();
    });

    // User chooses to stay
    const stayBtn = screen.getByRole("button", { name: /stay on current editor/i });
    fireEvent.click(stayBtn);

    // Modal closes, still on standard editor, and input value is completely preserved!
    expect(screen.queryByText("Switch Template Type?")).not.toBeInTheDocument();
    expect(screen.getByTestId("standard-editor-workspace")).toBeInTheDocument();
    expect((screen.getByLabelText(/template name/i) as HTMLInputElement).value).toBe("critical_summer_offer");

    // Attempt to switch again and confirm discard
    fireEvent.change(typeSelect, { target: { value: "CAROUSEL" } });
    await waitFor(() => {
      expect(screen.getByText("Switch Template Type?")).toBeInTheDocument();
    });

    const confirmDiscardBtn = screen.getByRole("button", { name: /discard changes & switch/i });
    fireEvent.click(confirmDiscardBtn);

    // Now switched to Carousel workspace
    await waitFor(() => {
      expect(screen.getByTestId("carousel-editor-workspace")).toBeInTheDocument();
    });
  });

  it("enforces Meta variable rules: sequential numbering and required sample values", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    const bodyTextarea = (await screen.findByPlaceholderText(/type your message body here/i)) as HTMLTextAreaElement;
    const nameInput = (await screen.findByLabelText(/template name/i)) as HTMLInputElement;

    fireEvent.change(nameInput, { target: { value: "valid_name" } });

    // 1. Non-sequential variables: {{1}} and {{3}} skipping {{2}}
    fireEvent.change(bodyTextarea, { target: { value: "Hello {{1}}, your order ID is {{3}}." } });

    const saveBtn = screen.getByRole("button", { name: /save local draft/i });
    fireEvent.click(saveBtn);

    // Expect sequential numbering error
    await waitFor(() => {
      expect(screen.getByText(/Variables must be numbered sequentially starting from \{\{1\}\} without gaps/i)).toBeInTheDocument();
    });

    // 2. Fix numbering to {{1}} and {{2}}, but leave a sample value blank
    fireEvent.change(bodyTextarea, { target: { value: "Hello {{1}}, your order ID is {{2}}." } });

    const sample1Input = (await screen.findByPlaceholderText(/sample value for \{\{1\}\}/i)) as HTMLInputElement;
    fireEvent.change(sample1Input, { target: { value: "" } });

    fireEvent.click(saveBtn);

    // Expect missing sample error
    await waitFor(() => {
      expect(screen.getByText(/Sample value for variable \{\{1\}\} is required/i)).toBeInTheDocument();
    });
  });

  it("enforces Meta button rules: unique titles, per-type limits, and dynamic URL restrictions", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    const nameInput = (await screen.findByLabelText(/template name/i)) as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "button_rules_test" } });

    const saveBtn = screen.getByRole("button", { name: /save local draft/i });
    const addBtn = screen.getByRole("button", { name: /add button/i });

    // 1. Add button and set duplicate titles
    fireEvent.click(addBtn);
    const titleInputs = screen.getAllByPlaceholderText(/button label/i);
    fireEvent.change(titleInputs[0], { target: { value: "Visit Store" } });
    fireEvent.change(titleInputs[1], { target: { value: "visit store" } });

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Button title must be unique/i)).toBeInTheDocument();
    });

    // Fix title uniqueness
    fireEvent.change(titleInputs[1], { target: { value: "Special Offer" } });

    // 2. Dynamic URL with multiple variables
    const urlInputs = screen.getAllByPlaceholderText(/yourstore\.com/i);
    if (urlInputs.length > 0) {
      fireEvent.change(urlInputs[0], { target: { value: "https://grovastra.com/{{1}}/{{2}}" } });
    }

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Website URL can contain at most one variable/i)).toBeInTheDocument();
    });

    // 3. Domain as variable
    if (urlInputs.length > 0) {
      fireEvent.change(urlInputs[0], { target: { value: "https://{{1}}/orders" } });
    }

    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Domain cannot be a variable/i)).toBeInTheDocument();
    });
  });

  it("accurately substitutes variable samples in text header within phone preview", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // Select TEXT header
    const textHeaderBtn = await screen.findByRole("button", { name: /^TEXT$/i });
    fireEvent.click(textHeaderBtn);

    const headerInput = await screen.findByPlaceholderText(/special announcement/i);
    fireEvent.change(headerInput, { target: { value: "Hello {{1}} Announcement!" } });

    // Verify phone preview displays substituted header text with sample value
    await waitFor(() => {
      const headerPreview = screen.getByText(/Hello (Priya|Sample 1) Announcement!/i);
      expect(headerPreview).toBeInTheDocument();
    });
  });

  it("removes Quick Reply from new options and safely handles legacy drafts with Quick Reply", async () => {
    setupSuperAdminAuth();

    // Place a legacy draft in localStorage with a Quick Reply button
    const legacyDraft = [
      {
        name: "legacy_quick_reply_draft",
        category: "MARKETING",
        language: "en_US",
        headerType: "NONE",
        headerText: "",
        headerMediaUrl: "",
        body: "Hello customer, reply below:",
        footer: "",
        buttons: [
          {
            id: "btn-legacy-1",
            type: "QUICK_REPLY",
            text: "Legacy Reply",
          },
        ],
        variables: {},
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(legacyDraft));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // Legacy draft should load safely without corruption or crashing
    await waitFor(() => {
      expect(screen.getByDisplayValue("legacy_quick_reply_draft")).toBeInTheDocument();
    });

    // Explains unsupported legacy button type with notice
    expect(screen.getByTestId("legacy-quick-reply-notice")).toBeInTheDocument();
    expect(screen.getByText(/Legacy Quick Reply Detected/i)).toBeInTheDocument();

    // Phone preview renders the legacy button safely
    expect(screen.getByText("Legacy Reply")).toBeInTheDocument();

    // The button type dropdown shows the legacy option as disabled
    const select = screen.getByTestId("button-type-select-0") as HTMLSelectElement;
    expect(select.value).toBe("QUICK_REPLY");
    const quickReplyOption = select.querySelector("option[value='QUICK_REPLY']") as HTMLOptionElement;
    expect(quickReplyOption.disabled).toBe(true);

    // New button options only allow URL and PHONE_NUMBER
    const availableOptions = Array.from(select.querySelectorAll("option:not([disabled])")).map(
      (opt) => (opt as HTMLOptionElement).value
    );
    expect(availableOptions).toContain("URL");
    expect(availableOptions).toContain("PHONE_NUMBER");
    expect(availableOptions).not.toContain("QUICK_REPLY");
  });

  it("enforces 3-button maximum and per-type limits (max 2 URL, max 1 Phone Number)", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    const addBtn = (await screen.findByRole("button", { name: /add button/i })) as HTMLButtonElement;

    // Starts with 2 buttons (btn-init-1 is URL, btn-init-2 is PHONE_NUMBER)
    expect(screen.getByText(/Interactive Buttons \(2\/3\)/i)).toBeInTheDocument();
    expect(addBtn.disabled).toBe(false);

    // Click Add Button to reach 3 total buttons
    fireEvent.click(addBtn);
    expect(screen.getByText(/Interactive Buttons \(3\/3\)/i)).toBeInTheDocument();
    expect(addBtn.disabled).toBe(true);

    // Button 3 was added as URL (now 2 URLs and 1 Phone Number)
    // Verify user cannot add a 3rd URL or a 2nd Phone Number
    const select0 = screen.getByTestId("button-type-select-0") as HTMLSelectElement;
    const phoneOption = select0.querySelector("option[value='PHONE_NUMBER']") as HTMLOptionElement;
    expect(phoneOption.disabled).toBe(true); // Phone limit 1 reached

    const select1 = screen.getByTestId("button-type-select-1") as HTMLSelectElement;
    const urlOption = select1.querySelector("option[value='URL']") as HTMLOptionElement;
    expect(urlOption.disabled).toBe(true); // URL limit 2 reached
  });

  it("renders exact Image URL A and updates cleanly to URL B without stock substitutes", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // Switch to IMAGE header
    const imgHeaderBtn = await screen.findByRole("button", { name: /^IMAGE$/i });
    fireEvent.click(imgHeaderBtn);

    // Initial state with no URL shows placeholder, never stock photo
    expect(screen.getByTestId("preview-image-placeholder")).toBeInTheDocument();
    expect(screen.queryByTestId("preview-header-image")).not.toBeInTheDocument();

    const urlInput = await screen.findByTestId("header-media-url-input");

    // Provide URL A
    fireEvent.change(urlInput, { target: { value: "https://cdn.example.com/promo-a.png" } });

    await waitFor(() => {
      const img = screen.getByTestId("preview-header-image") as HTMLImageElement;
      expect(img).toBeInTheDocument();
      expect(img.src).toBe("https://cdn.example.com/promo-a.png");
    });

    // Update to URL B - must update cleanly without stale state or stock photo
    fireEvent.change(urlInput, { target: { value: "https://cdn.example.com/promo-b.png" } });

    await waitFor(() => {
      const img = screen.getByTestId("preview-header-image") as HTMLImageElement;
      expect(img.src).toBe("https://cdn.example.com/promo-b.png");
      expect(img.src).not.toContain("unsplash.com");
    });
  });

  it("shows clear error state when image fails to load without silently falling back to stock photos", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // Switch to IMAGE header
    const imgHeaderBtn = await screen.findByRole("button", { name: /^IMAGE$/i });
    fireEvent.click(imgHeaderBtn);

    const urlInput = await screen.findByTestId("header-media-url-input");
    fireEvent.change(urlInput, { target: { value: "https://broken-domain-404.test/image.jpg" } });

    const img = (await screen.findByTestId("preview-header-image")) as HTMLImageElement;
    expect(img.src).toBe("https://broken-domain-404.test/image.jpg");

    // Fire onError event on image
    fireEvent.error(img);

    // Shows explicit error UI
    await waitFor(() => {
      expect(screen.getByTestId("preview-image-error")).toBeInTheDocument();
      expect(screen.getByText("Image failed to load")).toBeInTheDocument();
    });

    // Never substitute stock photo
    expect(screen.queryByTestId("preview-header-image")).not.toBeInTheDocument();
    expect(screen.queryByAltText(/unsplash/i)).not.toBeInTheDocument();
  });

  it("supports local file upload from device for Image, Video, Document, and GIF with preview and cleanup", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // 1. Image Upload
    const imgHeaderBtn = await screen.findByRole("button", { name: /^IMAGE$/i });
    fireEvent.click(imgHeaderBtn);

    const fileModeBtn = screen.getByTestId("media-source-file-btn");
    fireEvent.click(fileModeBtn);

    const fileInput = screen.getByTestId("header-file-upload-input") as HTMLInputElement;

    const fakeImageFile = new File(["dummy image content"], "spring_sale.png", { type: "image/png" });
    Object.defineProperty(fakeImageFile, "size", { value: 1.5 * 1024 * 1024 });

    fireEvent.change(fileInput, { target: { files: [fakeImageFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("selected-file-name")).toHaveTextContent("spring_sale.png");
      expect(screen.getByTestId("selected-file-size")).toHaveTextContent("1.5 MB");
    });

    const previewImg = (await screen.findByTestId("preview-header-image")) as HTMLImageElement;
    expect(previewImg.src).toContain("blob:http://localhost/spring_sale.png");

    // 2. Remove file
    const removeFileBtn = screen.getByTestId("remove-file-btn");
    fireEvent.click(removeFileBtn);

    await waitFor(() => {
      expect(screen.getByTestId("preview-image-placeholder")).toBeInTheDocument();
      expect(window.URL.revokeObjectURL).toHaveBeenCalled();
    });

    // 3. Document (PDF) Upload
    const docHeaderBtn = screen.getByRole("button", { name: /^DOCUMENT$/i });
    fireEvent.click(docHeaderBtn);
    fireEvent.click(screen.getByTestId("media-source-file-btn"));

    const docFileInput = screen.getByTestId("header-file-upload-input") as HTMLInputElement;
    const fakePdfFile = new File(["dummy pdf content"], "product_catalog_2026.pdf", { type: "application/pdf" });
    Object.defineProperty(fakePdfFile, "size", { value: 2.4 * 1024 * 1024 });

    fireEvent.change(docFileInput, { target: { files: [fakePdfFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("preview-doc-title")).toHaveTextContent("product_catalog_2026.pdf");
      expect(screen.getByTestId("preview-doc-size")).toHaveTextContent("2.4 MB");
    });

    // 4. Video Upload
    const videoHeaderBtn = screen.getByRole("button", { name: /^VIDEO$/i });
    fireEvent.click(videoHeaderBtn);
    fireEvent.click(screen.getByTestId("media-source-file-btn"));

    const videoFileInput = screen.getByTestId("header-file-upload-input") as HTMLInputElement;
    const fakeVideoFile = new File(["dummy mp4 content"], "brand_promo.mp4", { type: "video/mp4" });
    Object.defineProperty(fakeVideoFile, "size", { value: 8.5 * 1024 * 1024 });

    fireEvent.change(videoFileInput, { target: { files: [fakeVideoFile] } });

    await waitFor(() => {
      const videoEl = screen.getByTestId("preview-header-video") as HTMLVideoElement;
      expect(videoEl).toBeInTheDocument();
      expect(videoEl.src).toContain("blob:http://localhost/brand_promo.mp4");
    });

    // 5. GIF Upload advisory
    fireEvent.click(screen.getByRole("button", { name: /^IMAGE$/i }));
    fireEvent.click(screen.getByTestId("media-source-file-btn"));

    const gifFileInput = screen.getByTestId("header-file-upload-input") as HTMLInputElement;
    const fakeGifFile = new File(["dummy gif content"], "deal_animation.gif", { type: "image/gif" });
    Object.defineProperty(fakeGifFile, "size", { value: 1.2 * 1024 * 1024 });

    fireEvent.change(gifFileInput, { target: { files: [fakeGifFile] } });

    await waitFor(() => {
      expect(screen.getByTestId("preview-gif-advisory")).toBeInTheDocument();
      expect(screen.getByText(/GIF preview: WhatsApp templates require MP4 encoding/i)).toBeInTheDocument();
    });
  });

  it("enforces media file size and format validation", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    const imgHeaderBtn = await screen.findByRole("button", { name: /^IMAGE$/i });
    fireEvent.click(imgHeaderBtn);
    fireEvent.click(screen.getByTestId("media-source-file-btn"));

    const fileInput = screen.getByTestId("header-file-upload-input") as HTMLInputElement;

    // 1. File size exceeds 5 MB limit
    const oversizedImage = new File(["large"], "huge_image.png", { type: "image/png" });
    Object.defineProperty(oversizedImage, "size", { value: 6 * 1024 * 1024 }); // 6 MB

    fireEvent.change(fileInput, { target: { files: [oversizedImage] } });

    await waitFor(() => {
      expect(screen.getByText(/exceeds maximum allowed size of 5 MB/i)).toBeInTheDocument();
    });

    // 2. Unsupported format (e.g. text file)
    const invalidFormatFile = new File(["text"], "data.txt", { type: "text/plain" });
    Object.defineProperty(invalidFormatFile, "size", { value: 1024 });

    fireEvent.change(fileInput, { target: { files: [invalidFormatFile] } });

    await waitFor(() => {
      expect(screen.getByText(/Unsupported image format/i)).toBeInTheDocument();
    });
  });

  it("clears and isolates incompatible media state when switching header types", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // Provide Image URL
    fireEvent.click(await screen.findByRole("button", { name: /^IMAGE$/i }));
    const urlInput = await screen.findByTestId("header-media-url-input");
    fireEvent.change(urlInput, { target: { value: "https://example.com/logo.png" } });

    expect(screen.getByTestId("preview-header-image")).toBeInTheDocument();

    // Switch to TEXT header: media state must be cleared without corrupting body or buttons
    fireEvent.click(screen.getByRole("button", { name: /^TEXT$/i }));

    await waitFor(() => {
      expect(screen.queryByTestId("preview-header-image")).not.toBeInTheDocument();
    });

    // Switch to DOCUMENT header: clean state
    fireEvent.click(screen.getByRole("button", { name: /^DOCUMENT$/i }));

    await waitFor(() => {
      expect(screen.getByTestId("preview-doc-title")).toHaveTextContent("Document Attachment (PDF)");
    });
  });

  it("displays CTA Directions & Action Guidance explaining native client-side actions", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // Verify Action Guidance section exists
    await waitFor(() => {
      expect(screen.getByTestId("action-guidance-card")).toBeInTheDocument();
    });

    expect(screen.getByText("CTA Directions & Action Guidance")).toBeInTheDocument();
    expect(screen.getByText(/Website URL Buttons:/i)).toBeInTheDocument();
    expect(screen.getByText(/Phone Number Buttons:/i)).toBeInTheDocument();
    expect(screen.getByText(/These buttons perform direct device actions/i)).toBeInTheDocument();
    expect(screen.getByText(/Inbound reply-triggered automation is a future platform capability/i)).toBeInTheDocument();

    // Author can enter internal documentation notes
    const notesInput = screen.getByTestId("action-guidance-notes") as HTMLTextAreaElement;
    fireEvent.change(notesInput, { target: { value: "Landing page directs to seasonal discount with UTM tag" } });
    expect(notesInput.value).toBe("Landing page directs to seasonal discount with UTM tag");
  });

  it("collapses technical action guidance by default and provides compact direction per button", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    // Verify compact directions are rendered on each button card
    await waitFor(() => {
      expect(screen.getByTestId("button-direction-0")).toBeInTheDocument();
    });

    // Button 0 is URL
    const urlDirection = screen.getByTestId("button-direction-0");
    expect(urlDirection).toHaveTextContent("Opens this website when the customer taps the button.");
    expect(urlDirection).toHaveTextContent("https://grovastra.com");

    // Button 1 is Phone Number
    const phoneDirection = screen.getByTestId("button-direction-1");
    expect(phoneDirection).toHaveTextContent("Opens the customer's phone dialer.");
    expect(phoneDirection).toHaveTextContent("+15551234567");

    // Technical action guidance is collapsed by default (inside <details> element without open attribute)
    const guidanceCard = screen.getByTestId("action-guidance-card") as HTMLDetailsElement;
    expect(guidanceCard.open).toBe(false);
    expect(screen.getByText(/Learn about button actions & internal notes/i)).toBeInTheDocument();
  });

  it("lists all saved local drafts on TemplatesPage with Local Draft / Pending Meta Submission status and header type", async () => {
    setupSuperAdminAuth();

    // Save a custom local draft in localStorage
    const savedDrafts = [
      {
        name: "festival_bonanza_2026",
        category: "MARKETING",
        language: "en_US",
        headerType: "IMAGE",
        body: "Exclusive festival offer {{1}}! Valid for 24 hours.",
        footer: "Terms apply",
        buttons: [
          {
            id: "btn-fest-1",
            type: "URL",
            text: "Shop Deal",
            url: "https://grovastra.com/deal",
          },
        ],
        variables: { "1": "DIWALI50" },
        status: "LOCAL_DRAFT",
        updatedAt: "2026-10-22T10:00:00.000Z",
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(savedDrafts));

    render(<TemplatesPage />);

    // The draft must be listed on the Templates page even though its name is not on the test allowlist
    await waitFor(() => {
      expect(screen.getAllByText("festival_bonanza_2026").length).toBeGreaterThan(0);
    });

    // Displays Header Type
    expect(screen.getByText("Header: IMAGE")).toBeInTheDocument();

    // Truthful status: Local Draft + Pending Meta Submission (never Approved or Sendable)
    expect(screen.getByText("Local Draft")).toBeInTheDocument();
    expect(screen.getByText("Pending Meta Submission")).toBeInTheDocument();

    // Browser storage explanation notice is displayed
    expect(screen.getByTestId("browser-storage-notice")).toBeInTheDocument();
    expect(screen.getByText(/Saved template drafts are stored in this browser profile and are pending submission to Meta/i)).toBeInTheDocument();
  });

  it("loads previously saved drafts with backward-compatible parsing for legacy single objects", async () => {
    setupSuperAdminAuth();

    // Legacy format: single draft object instead of array
    const legacySingleDraft = {
      name: "legacy_single_draft_obj",
      category: "UTILITY",
      language: "en_US",
      headerType: "TEXT",
      headerText: "Important Update",
      body: "Hello {{1}}, your order status has changed.",
      footer: "Grovastra Updates",
      buttons: [],
      variables: { "1": "Alex" },
      status: "LOCAL_DRAFT",
    };
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(legacySingleDraft));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("legacy_single_draft_obj").length).toBeGreaterThan(0);
    });

    expect(screen.getByText("Header: TEXT")).toBeInTheDocument();
    expect(screen.getByText("Local Draft")).toBeInTheDocument();
    expect(screen.getByText("Pending Meta Submission")).toBeInTheDocument();
  });

  it("allows editing and re-saving an existing draft without creating duplicate entries", async () => {
    setupSuperAdminAuth();

    const existingDraft = [
      {
        name: "spring_exclusive_sale",
        category: "MARKETING",
        language: "en_US",
        headerType: "NONE",
        headerText: "",
        headerMediaUrl: "",
        body: "Hello customer, check out our spring sale!",
        footer: "",
        buttons: [
          {
            id: "btn-spring-1",
            type: "URL",
            text: "View Sale",
            url: "https://grovastra.com/spring",
          },
        ],
        variables: {},
        status: "LOCAL_DRAFT",
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(existingDraft));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("spring_exclusive_sale").length).toBeGreaterThan(0);
    });

    // Click Edit Draft button on the local draft card
    const editBtn = screen.getByRole("button", { name: /edit spring_exclusive_sale/i });
    fireEvent.click(editBtn);

    // Template Studio opens with the draft loaded
    await waitFor(() => {
      expect(screen.getByDisplayValue("spring_exclusive_sale")).toBeInTheDocument();
    });

    // Update the body
    const bodyInput = screen.getByPlaceholderText(/type your message body/i);
    fireEvent.change(bodyInput, { target: { value: "Updated spring sale with exciting rewards and perks!" } });

    // Save the draft again
    const saveBtn = screen.getByRole("button", { name: /save local draft/i });
    fireEvent.click(saveBtn);

    await waitFor(() => {
      expect(screen.getByText(/Draft "spring_exclusive_sale" saved locally/i)).toBeInTheDocument();
    });

    // Return to Templates page
    const backBtn = screen.getByRole("button", { name: /back to templates list/i });
    fireEvent.click(backBtn);

    // Verify the list still contains exactly one instance of spring_exclusive_sale card (no duplicate card created)
    await waitFor(() => {
      const editButtons = screen.getAllByRole("button", { name: /edit spring_exclusive_sale/i });
      expect(editButtons.length).toBe(1);
    });

    expect(screen.getByText("Updated spring sale with exciting rewards and perks!")).toBeInTheDocument();

    // Verify localStorage has only 1 entry
    const inStorage = JSON.parse(localStorage.getItem("grovastra_local_template_drafts_v1") || "[]");
    const matching = inStorage.filter((d: any) => d.name === "spring_exclusive_sale");
    expect(matching.length).toBe(1);
  });

  it("ensures internal author action notes never leak into message preview or customer content", async () => {
    setupSuperAdminAuth();

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByRole("button", { name: /create new template/i })).toBeInTheDocument();
    });

    fireEvent.click(screen.getByRole("button", { name: /create new template/i }));

    await waitFor(() => {
      expect(screen.getByTestId("action-guidance-notes")).toBeInTheDocument();
    });

    // Enter sensitive internal notes
    const notesInput = screen.getByTestId("action-guidance-notes") as HTMLTextAreaElement;
    fireEvent.change(notesInput, {
      target: { value: "INTERNAL ONLY: Marketing UTM campaign=secret_vip_q4 discount=40" },
    });

    // Check phone preview column
    const previewContainer = document.querySelector(".workspace-col-preview");
    expect(previewContainer).toBeInTheDocument();

    // The internal notes must NEVER appear in the preview container
    expect(previewContainer?.textContent).not.toContain("INTERNAL ONLY");
    expect(previewContainer?.textContent).not.toContain("secret_vip_q4");
  });

  it("filters local drafts accurately when selecting Local Drafts filter", async () => {
    setupSuperAdminAuth();

    const drafts = [
      {
        name: "filtered_local_draft",
        category: "UTILITY",
        language: "en_US",
        headerType: "NONE",
        headerText: "",
        headerMediaUrl: "",
        body: "Your package is on its way.",
        footer: "",
        buttons: [],
        variables: {},
        status: "LOCAL_DRAFT",
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(drafts));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("filtered_local_draft").length).toBeGreaterThan(0);
    });

    // Filter by LOCAL_DRAFT
    const statusSelect = screen.getByLabelText(/filter by status/i);
    fireEvent.change(statusSelect, { target: { value: "LOCAL_DRAFT" } });

    // Local draft is still visible
    expect(screen.getAllByText("filtered_local_draft").length).toBeGreaterThan(0);

    // Filter by SENDABLE (only approved Meta templates)
    fireEvent.change(statusSelect, { target: { value: "SENDABLE" } });

    // Local draft is hidden
    expect(screen.queryByText("filtered_local_draft")).not.toBeInTheDocument();
  });

  it("renders saved template cards as WhatsApp-style message bubbles with actual content, headers, footers, and CTA buttons", async () => {
    setupSuperAdminAuth();

    const savedDraft = [
      {
        name: "diwali_vip_offer",
        category: "MARKETING",
        language: "en_US",
        headerType: "TEXT",
        headerText: "Diwali *Special* Offer",
        headerMediaUrl: "",
        body: "Hello {{1}}, enjoy an exclusive *20% off* on all electronics this week! Use code ~EXPIRED~ *FESTIVE20* at checkout.",
        footer: "Reply STOP to unsubscribe",
        buttons: [
          {
            id: "btn-diwali-1",
            type: "URL",
            text: "Claim Discount",
            url: "https://grovastra.com/diwali",
          },
          {
            id: "btn-diwali-2",
            type: "PHONE_NUMBER",
            text: "Call Support",
            phoneNumber: "+15551234567",
          },
        ],
        variables: { "1": "Priya" },
        status: "LOCAL_DRAFT",
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(savedDraft));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("diwali_vip_offer").length).toBeGreaterThan(0);
    });

    // 1. Metadata toolbar outside the bubble
    expect(screen.getByText("MARKETING")).toBeInTheDocument();
    expect(screen.getAllByText("en_US").length).toBeGreaterThan(0);
    expect(screen.getByText("Header: TEXT")).toBeInTheDocument();
    expect(screen.getByText("Local Draft")).toBeInTheDocument();
    expect(screen.getByText("Pending Meta Submission")).toBeInTheDocument();

    // 2. WhatsApp chat canvas & message bubble inside the card
    const previewContainer = screen.getByTestId("template-card-preview-local-draft-diwali_vip_offer");
    expect(previewContainer).toBeInTheDocument();

    // Text header rendered inside bubble
    const headerTextEl = previewContainer.querySelector(".wa-bubble-header-text");
    expect(headerTextEl).toBeInTheDocument();
    expect(headerTextEl?.textContent).toContain("Diwali *Special* Offer");

    // Formatted body rendered with sample variable replacement Priya
    const bubbleBody = previewContainer.querySelector(".wa-bubble-body");
    expect(bubbleBody).toBeInTheDocument();
    expect(bubbleBody?.textContent).toContain("Hello Priya, enjoy an exclusive 20% off on all electronics this week!");
    // Bold tag exists for *20% off*
    expect(bubbleBody?.innerHTML).toContain("<strong>20% off</strong>");
    // Strike tag exists for ~EXPIRED~
    expect(bubbleBody?.innerHTML).toContain("<del>EXPIRED</del>");

    // Footer text rendered
    const footerEl = previewContainer.querySelector(".wa-bubble-footer");
    expect(footerEl).toBeInTheDocument();
    expect(footerEl?.textContent).toBe("Reply STOP to unsubscribe");

    // Subtle draft indicator clock (does NOT imply delivered/sent)
    const clockEl = previewContainer.querySelector(".wa-draft-clock");
    expect(clockEl).toBeInTheDocument();
    // Must NOT show double blue ticks for a local draft
    expect(previewContainer.querySelector(".wa-ticks")).not.toBeInTheDocument();

    // CTA buttons stack
    const buttonsStack = previewContainer.querySelector(".wa-buttons-stack");
    expect(buttonsStack).toBeInTheDocument();
    expect(buttonsStack?.textContent).toContain("Claim Discount");
    expect(buttonsStack?.textContent).toContain("Call Support");

    // 3. Actions remain available in card footer
    expect(screen.getByRole("button", { name: /edit diwali_vip_offer/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /preview diwali_vip_offer/i })).toBeInTheDocument();
  });

  it("ensures different saved templates render their own distinct preview state without leaking", async () => {
    setupSuperAdminAuth();

    const multiDrafts = [
      {
        name: "order_confirmation_draft",
        category: "UTILITY",
        language: "en_US",
        headerType: "DOCUMENT",
        headerMediaFilename: "invoice_1001.pdf",
        headerMediaFilesize: "128 KB",
        body: "Hi {{1}}, your order #9948 has been placed.",
        footer: "Order Helpdesk",
        buttons: [
          {
            id: "btn-order-1",
            type: "PHONE_NUMBER",
            text: "Track by Phone",
            phoneNumber: "+15559876543",
          },
        ],
        variables: { "1": "David" },
        status: "LOCAL_DRAFT",
      },
      {
        name: "flash_sale_draft",
        category: "MARKETING",
        language: "en_US",
        headerType: "TEXT",
        headerText: "Midnight Flash Sale",
        body: "Hey {{1}}, 50% flash sale starts in 10 minutes!",
        footer: "Terms apply",
        buttons: [
          {
            id: "btn-sale-1",
            type: "URL",
            text: "Shop Flash Sale",
            url: "https://grovastra.com/flash",
          },
        ],
        variables: { "1": "Sarah" },
        status: "LOCAL_DRAFT",
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(multiDrafts));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("order_confirmation_draft").length).toBeGreaterThan(0);
      expect(screen.getAllByText("flash_sale_draft").length).toBeGreaterThan(0);
    });

    const card1 = screen.getByTestId("template-card-preview-local-draft-order_confirmation_draft");
    const card2 = screen.getByTestId("template-card-preview-local-draft-flash_sale_draft");

    // Card 1 assertions
    expect(card1.textContent).toContain("invoice_1001.pdf");
    expect(card1.textContent).toContain("Hi David, your order #9948 has been placed.");
    expect(card1.textContent).toContain("Track by Phone");
    expect(card1.textContent).not.toContain("Midnight Flash Sale");
    expect(card1.textContent).not.toContain("Shop Flash Sale");

    // Card 2 assertions
    expect(card2.textContent).toContain("Midnight Flash Sale");
    expect(card2.textContent).toContain("Hey Sarah, 50% flash sale starts in 10 minutes!");
    expect(card2.textContent).toContain("Shop Flash Sale");
    expect(card2.textContent).not.toContain("invoice_1001.pdf");
    expect(card2.textContent).not.toContain("Hi David");
  });

  it("shows clear placeholder when local media is expired after refresh and never invents fake stock images", async () => {
    setupSuperAdminAuth();

    // Draft where user previously uploaded a local image, but after page reload the temporary blob is gone
    const draftWithExpiredLocalMedia = [
      {
        name: "product_launch_card",
        category: "MARKETING",
        language: "en_US",
        headerType: "IMAGE",
        headerMediaUrl: "", // blob URL was cleared / expired
        headerMediaIsLocal: true,
        headerMediaFilename: "banner_hero.jpg",
        body: "Check out our newest flagship product!",
        footer: "",
        buttons: [],
        variables: {},
        status: "LOCAL_DRAFT",
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(draftWithExpiredLocalMedia));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("product_launch_card").length).toBeGreaterThan(0);
    });

    const previewContainer = screen.getByTestId("template-card-preview-local-draft-product_launch_card");

    // Placeholder displayed for local media re-selection
    expect(previewContainer.textContent).toContain("Image Header (Re-select image)");
    expect(previewContainer.textContent).toContain("banner_hero.jpg");
    expect(previewContainer.textContent).toContain("Local file preview not available after refresh");

    // Must NOT have any <img> tag with a stock photo or invented preview
    const imgTag = previewContainer.querySelector("img");
    expect(imgTag).toBeNull();

    // Body content is still preserved and visible
    expect(previewContainer.textContent).toContain("Check out our newest flagship product!");
  });

  it("opens full phone preview when clicking Preview button on saved template card", async () => {
    setupSuperAdminAuth();

    const savedDraft = [
      {
        name: "modal_preview_test_draft",
        category: "MARKETING",
        language: "en_US",
        headerType: "TEXT",
        headerText: "Preview Modal Header",
        body: "Testing full modal preview functionality.",
        footer: "Grovastra Footnote",
        buttons: [],
        variables: {},
        status: "LOCAL_DRAFT",
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(savedDraft));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("modal_preview_test_draft").length).toBeGreaterThan(0);
    });

    // Click Preview button on the card
    const previewBtn = screen.getByRole("button", { name: /preview modal_preview_test_draft/i });
    fireEvent.click(previewBtn);

    // Full inspection workspace opens
    await waitFor(() => {
      expect(screen.getByText("Inspecting Template (Read-Only):")).toBeInTheDocument();
      expect(screen.getByText("modal_preview_test_draft")).toBeInTheDocument();
    });

    // The full phone frame is rendered
    expect(document.querySelector(".phone-frame")).toBeInTheDocument();
    expect(screen.getByText("Official Business Account")).toBeInTheDocument();

    // Back button returns to Templates page list
    const backBtn = screen.getByRole("button", { name: /back to templates list/i });
    fireEvent.click(backBtn);

    await waitFor(() => {
      expect(screen.getByText("WhatsApp Message Templates")).toBeInTheDocument();
    });
  });

  it("deletes a local draft card when clicking delete action", async () => {
    setupSuperAdminAuth();

    const draftToDelete = [
      {
        name: "draft_to_be_deleted",
        category: "UTILITY",
        language: "en_US",
        headerType: "NONE",
        body: "This draft should be deleted.",
        footer: "",
        buttons: [],
        variables: {},
        status: "LOCAL_DRAFT",
      },
    ];
    localStorage.setItem("grovastra_local_template_drafts_v1", JSON.stringify(draftToDelete));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getAllByText("draft_to_be_deleted").length).toBeGreaterThan(0);
    });

    // Click Delete button
    const deleteBtn = screen.getByRole("button", { name: /delete draft_to_be_deleted/i });
    fireEvent.click(deleteBtn);

    // Draft card is removed from view
    await waitFor(() => {
      expect(screen.queryByText("draft_to_be_deleted")).not.toBeInTheDocument();
    });

    // Storage is cleared
    const inStorage = JSON.parse(localStorage.getItem("grovastra_local_template_drafts_v1") || "[]");
    expect(inStorage.find((d: any) => d.name === "draft_to_be_deleted")).toBeUndefined();
  });
});
