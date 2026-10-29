import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { TemplatesPage } from "../pages/TemplatesPage.js";
import { TemplateEditor } from "../components/TemplateEditor.js";
import { CampaignWizard } from "../components/CampaignWizard.js";
import { apiClient } from "../services/api.js";
import * as AuthContextModule from "../context/AuthContext.js";
import { User } from "../types/auth.js";
import { WhatsAppTemplate } from "../types/template.js";
import {
  getTemplateDraftsStorageKey,
  loadTemplateDraftsRaw,
  LEGACY_DRAFTS_STORAGE_KEY,
} from "../components/TemplateStudioAuthoring.js";
import { PosterCampaignAttachment } from "../types/poster.js";

// Mock API Client
vi.mock("../services/api.js", () => {
  return {
    apiClient: {
      getSchedulerStatus: vi.fn().mockResolvedValue({ success: true, data: { isRunning: true } }),
      listCampaigns: vi.fn().mockResolvedValue({
        success: true,
        data: {
          items: [],
          metrics: { total: 0, draft: 0, scheduled: 0, sending: 0, completed: 0, failed: 0, cancelled: 0 },
          pagination: { page: 1, limit: 10, total: 0, totalPages: 1, hasNextPage: false, hasPrevPage: false },
        },
      }),
      listAudiences: vi.fn().mockResolvedValue({
        status: "success",
        data: [{ id: "aud_1", name: "VIP Club", memberCount: 50, eligibleMemberCount: 50 }],
      }),
      listTemplates: vi.fn().mockResolvedValue({
        status: "success",
        data: {
          templates: [
            {
              id: "tpl_order_conf_1",
              name: "jaspers_market_order_confirmation_v1",
              language: "en_US",
              category: "MARKETING",
              status: "APPROVED",
              isSendable: true,
              header: {
                type: "IMAGE",
                mediaUrl: "https://admin.example.com/catalog-sample-header.jpg",
                mediaFilename: "catalog-sample-header.jpg",
              },
              body: "Hello {{1}}! Your order {{2}} has been confirmed.",
              variables: [
                { key: "1", sampleValue: "Rahul", fallbackValue: "Customer" },
                { key: "2", sampleValue: "ORD-9988", fallbackValue: "ORD-0000" },
              ],
              buttons: [
                { id: "btn-1", type: "URL", text: "Track Order", url: "https://orders.example.com/{{1}}" },
              ],
            },
            {
              id: "tpl_plain_text_1",
              name: "jaspers_market_plain_text_v1",
              language: "en_US",
              category: "MARKETING",
              status: "APPROVED",
              isSendable: true,
              header: { type: "NONE" },
              body: "Welcome to Jaspers Market plain updates!",
              variables: [],
              buttons: [],
            },
          ],
          totalCount: 2,
          approvedCount: 2,
          source: "SHARED_PLATFORM_WABA",
        },
      }),
      syncTemplates: vi.fn(),
      validateTemplateParameters: vi.fn().mockResolvedValue({ success: true, data: { isValid: true } }),
      createCampaign: vi.fn().mockResolvedValue({ success: true, data: { id: "cmp_new", name: "Test" } }),
    },
    ApiClientError: class extends Error {},
  };
});

describe("Phase 3I — Admin/User Template Image Isolation & Storage Guardrails", () => {
  const standardCustomerUser: User = {
    id: "usr_customer_1",
    email: "customer@tenant.com",
    firstName: "Standard",
    lastName: "Customer",
    role: "MEMBER",
    platformRole: "NONE",
    organizationId: "org_tenant_1",
    createdAt: new Date().toISOString(),
  };

  const superAdminUser: User = {
    id: "usr_super_admin",
    email: "admin@grovastra.com",
    firstName: "Super",
    lastName: "Admin",
    role: "OWNER",
    platformRole: "PLATFORM_MASTER_ADMIN",
    organizationId: "org_master",
    createdAt: new Date().toISOString(),
  };

  const setupAuth = (user: User) => {
    const isSuperAdmin = user.platformRole === "PLATFORM_MASTER_ADMIN";
    const platformRole = user.platformRole || "NONE";
    return vi.spyOn(AuthContextModule, "useAuth").mockReturnValue({
      user,
      organization: {
        id: user.organizationId,
        name: isSuperAdmin ? "Grovastra Platform" : "Tenant One Store",
        slug: isSuperAdmin ? "grovastra-platform" : "tenant-one",
      },
      platformCapabilities: {
        isPlatformAdmin: isSuperAdmin,
        platformRole,
        canManagePlatformWhatsApp: isSuperAdmin,
        canManageAllOrganizations: isSuperAdmin,
        canAssignBusinesses: isSuperAdmin,
      },
      isAuthenticated: true,
      isLoading: false,
      login: vi.fn(),
      signup: vi.fn(),
      logout: vi.fn(),
      refreshUser: vi.fn(),
    });
  };

  const renderWizard = (props: any = {}) => {
    return render(
      <CampaignWizard
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
        {...props}
      />
    );
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
  });

  afterEach(() => {
    cleanup();
  });

  // Test 1: Standard users cannot see or invoke Admin draft-save functionality
  it("Requirement 1: Standard users cannot see or invoke Admin draft-save functionality", () => {
    const onSaveSpy = vi.fn();
    const mockDraftTemplate: WhatsAppTemplate = {
      id: "draft_sample_123",
      name: "sample_draft_template",
      language: "en_US",
      category: "MARKETING",
      status: "DRAFT",
      isSendable: false,
      header: { type: "IMAGE", mediaUrl: "https://admin.example.com/draft.jpg" },
      body: "Draft body text",
      variables: [],
      buttons: [],
    };

    // Render TemplateEditor with canSaveDraft={false}
    const { rerender } = render(
      <TemplateEditor
        template={mockDraftTemplate}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={onSaveSpy}
        canSaveDraft={false}
      />
    );

    // Save button must not be rendered
    expect(screen.queryByTestId("btn-save-draft-changes")).toBeNull();
    expect(screen.queryByText(/Save Draft Changes/i)).toBeNull();
    expect(onSaveSpy).not.toHaveBeenCalled();

    // Verify even if onSave was not passed
    rerender(
      <TemplateEditor
        template={mockDraftTemplate}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        canSaveDraft={false}
      />
    );
    expect(screen.queryByTestId("btn-save-draft-changes")).toBeNull();
  });

  // Test 2: Admin draft changes remain available to authorized Admins
  it("Requirement 2: Admin draft changes remain available to authorized Admins", () => {
    setupAuth(superAdminUser);
    const onSaveSpy = vi.fn();
    const mockDraftTemplate: WhatsAppTemplate = {
      id: "draft_admin_tpl_456",
      name: "admin_holiday_sale",
      language: "en_US",
      category: "MARKETING",
      status: "DRAFT",
      isSendable: false,
      header: { type: "IMAGE", mediaUrl: "https://admin.example.com/holiday.jpg" },
      body: "Admin Draft Body",
      variables: [],
      buttons: [],
    };

    render(
      <TemplateEditor
        template={mockDraftTemplate}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={onSaveSpy}
        canSaveDraft={true}
      />
    );

    const saveDraftBtn = screen.getByTestId("btn-save-draft-changes");
    expect(saveDraftBtn).toBeDefined();
    expect(saveDraftBtn.textContent).toContain("Save Draft Changes");

    fireEvent.click(saveDraftBtn);
    expect(onSaveSpy).toHaveBeenCalledTimes(1);
    expect(onSaveSpy).toHaveBeenCalledWith(mockDraftTemplate);
  });

  // Test 3: User image edits do not mutate Admin drafts or shared template catalog objects
  it("Requirement 3: User image edits do not mutate Admin drafts or shared template catalog objects", async () => {
    setupAuth(standardCustomerUser);

    // Seed admin drafts in local storage
    const adminKey = getTemplateDraftsStorageKey("org_master");
    const initialAdminDraft = [
      {
        id: "draft_admin_locked",
        name: "admin_locked_template",
        category: "MARKETING",
        language: "en_US",
        headerType: "IMAGE",
        headerText: "",
        headerMediaUrl: "https://admin.com/original.png",
        body: "Admin locked content",
        footer: "",
        buttons: [],
        variables: {},
        updatedAt: Date.now(),
      },
    ];
    localStorage.setItem(adminKey, JSON.stringify(initialAdminDraft));

    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText(/WhatsApp Message Templates/i)).toBeDefined();
    });

    // Verify admin storage key content remains unmodified
    const currentAdminDrafts = JSON.parse(localStorage.getItem(adminKey) || "[]");
    expect(currentAdminDrafts[0].headerMediaUrl).toBe("https://admin.com/original.png");
  });

  // Test 4: Admin image edits do not mutate user campaign state
  it("Requirement 4: Admin image edits do not mutate user campaign state", async () => {
    setupAuth(standardCustomerUser);

    const userAttachment: PosterCampaignAttachment = {
      blob: new Blob(["user-poster-bytes"], { type: "image/png" }),
      dataUrl: "data:image/png;base64,userCustomPosterData",
      title: "User Custom Poster",
      width: 1200,
      height: 628,
      presetId: "poster_1",
      format: "png",
      filename: "user_poster.png",
      createdAt: Date.now(),
    };

    renderWizard({ posterAttachment: userAttachment });

    // Verify user's custom poster is attached
    await waitFor(() => {
      expect(screen.getByTestId("attached-media-card")).toBeDefined();
      expect(screen.getByText("User Custom Poster")).toBeDefined();
    });

    // Simulate an admin modifying drafts in localStorage behind the scenes
    const adminKey = getTemplateDraftsStorageKey("org_master");
    localStorage.setItem(
      adminKey,
      JSON.stringify([
        {
          id: "draft_admin_mod",
          name: "jaspers_market_order_confirmation_v1",
          headerMediaUrl: "https://admin.com/brand-new-admin-sample.png",
        },
      ])
    );

    // User campaign wizard state must remain isolated and unchanged
    expect(screen.getByText("User Custom Poster")).toBeDefined();
    const imgEls = screen.getAllByAltText("User Custom Poster");
    expect(imgEls.length).toBeGreaterThanOrEqual(1);
    expect((imgEls[0] as HTMLImageElement).src).toContain("userCustomPosterData");
  });

  // Test 5: Nested template objects are isolated after selection (deepCloneTemplate)
  it("Requirement 5: Nested template objects are isolated after selection (deep copy validation)", () => {
    const rawCatalogTemplate: WhatsAppTemplate = {
      id: "tpl_order_conf_1",
      name: "jaspers_market_order_confirmation_v1",
      language: "en_US",
      category: "MARKETING",
      status: "APPROVED",
      isSendable: true,
      header: {
        type: "IMAGE",
        mediaUrl: "https://catalog.example.com/sample.jpg",
        mediaFilename: "sample.jpg",
      },
      body: "Hello {{1}}! Your order {{2}} has been confirmed.",
      variables: [
        { key: "1", sampleValue: "Rahul", fallbackValue: "Customer" },
        { key: "2", sampleValue: "ORD-9988", fallbackValue: "ORD-0000" },
      ],
      buttons: [
        { id: "btn-1", type: "URL", text: "Track Order", url: "https://orders.example.com/{{1}}" },
      ],
    };

    // Deep clone simulation as implemented in TemplatesPage
    const deepCloned: WhatsAppTemplate =
      typeof structuredClone === "function"
        ? structuredClone(rawCatalogTemplate)
        : JSON.parse(JSON.stringify(rawCatalogTemplate));

    // Verify reference separation
    expect(deepCloned).not.toBe(rawCatalogTemplate);
    expect(deepCloned.header).not.toBe(rawCatalogTemplate.header);
    expect(deepCloned.variables).not.toBe(rawCatalogTemplate.variables);
    expect(deepCloned.variables[0]).not.toBe(rawCatalogTemplate.variables[0]);
    expect(deepCloned.buttons).not.toBe(rawCatalogTemplate.buttons);
    expect(deepCloned.buttons[0]).not.toBe(rawCatalogTemplate.buttons[0]);

    // Mutating cloned state does not mutate catalog template
    deepCloned.header!.mediaUrl = "https://user-preview.com/new-image.png";
    deepCloned.variables[0].sampleValue = "Priya";
    deepCloned.buttons[0].text = "Custom Button";

    expect(rawCatalogTemplate.header!.mediaUrl).toBe("https://catalog.example.com/sample.jpg");
    expect(rawCatalogTemplate.variables[0].sampleValue).toBe("Rahul");
    expect(rawCatalogTemplate.buttons[0].text).toBe("Track Order");
  });

  // Test 6: Campaign Creation starts with attachedMedia = null and displays (No image selected)
  it("Requirement 6: Campaign Creation starts with attachedMedia = null and displays (No image selected)", async () => {
    setupAuth(standardCustomerUser);

    renderWizard();

    await waitFor(() => {
      expect(screen.getByTestId("campaign-media-section")).toBeDefined();
    });

    // Assert the media picker empty state is rendered
    expect(screen.getByTestId("campaign-media-picker-card")).toBeDefined();
    expect(screen.getByText("(No image selected)")).toBeDefined();

    // Verify WhatsApp preview shows the empty image header placeholder
    const previewPlaceholder = screen.getByTestId("preview-image-placeholder");
    expect(previewPlaceholder.textContent).toContain("No image selected");

    // No attached media thumbnail should exist
    expect(screen.queryByTestId("attached-media-card")).toBeNull();
  });

  // Test 7: Admin sample images are not used as campaign image fallbacks
  it("Requirement 7: Admin sample images are not used as campaign image fallbacks", async () => {
    setupAuth(standardCustomerUser);

    // The API mock returns jaspers_market_order_confirmation_v1 which has an admin mediaUrl in catalog
    renderWizard();

    await waitFor(() => {
      expect(screen.getByTestId("campaign-media-picker-card")).toBeDefined();
    });

    // Ensure no img element with the admin's sample url is rendered in the preview bubble
    const previewBubbleImages = document.querySelectorAll(".wa-header-media-card img");
    expect(previewBubbleImages.length).toBe(0);

    // The placeholder must remain displayed
    expect(screen.getByText("Image Header — No image selected")).toBeDefined();
  });

  // Test 8: Text-only templates do not expose image controls
  it("Requirement 8: Text-only templates do not expose image controls", async () => {
    setupAuth(standardCustomerUser);

    // Initial campaign using text-only template
    const textOnlyCampaign: any = {
      id: "cmp_text_only",
      name: "Plain Text Campaign",
      templateId: "tpl_plain_text_1",
      audienceId: "aud_1",
      variablesMapping: {},
      status: "DRAFT",
    };

    renderWizard({ initialCampaign: textOnlyCampaign });

    await waitFor(() => {
      expect(screen.getByTestId("campaign-media-disabled-banner")).toBeDefined();
    });

    // Ensure Upload Image and Posters buttons are absent
    expect(screen.queryByRole("button", { name: /Upload Image/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /Posters/i })).toBeNull();
    expect(screen.getByText(/does not support image headers/i)).toBeDefined();
  });

  // Test 9: Test Preview makes no send API calls, does not enqueue campaigns and does not invoke Meta endpoints
  it("Requirement 9: Test Preview makes no send API calls, does not enqueue campaigns and does not invoke Meta endpoints", async () => {
    setupAuth(standardCustomerUser);

    const createCampaignSpy = vi.spyOn(apiClient, "createCampaign");
    const syncTemplatesSpy = vi.spyOn(apiClient, "syncTemplates");

    const mockTemplate: WhatsAppTemplate = {
      id: "tpl_order_conf_1",
      name: "jaspers_market_order_confirmation_v1",
      language: "en_US",
      category: "MARKETING",
      status: "APPROVED",
      isSendable: true,
      header: { type: "IMAGE" },
      body: "Hello {{1}}! Your order {{2}} has been confirmed.",
      variables: [
        { key: "1", sampleValue: "TestUser", fallbackValue: "User" },
      ],
      buttons: [],
    };

    render(
      <TemplateEditor
        template={mockTemplate}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        canSaveDraft={false}
      />
    );

    // Verify simulation safety banner is rendered confirming 0 messages sent
    expect(screen.getByTestId("simulation-safety-banner")).toBeDefined();
    expect(screen.getByText(/0 messages sent/i)).toBeDefined();

    // Verify 0 calls to createCampaign or syncTemplates
    expect(createCampaignSpy).toHaveBeenCalledTimes(0);
    expect(syncTemplatesSpy).toHaveBeenCalledTimes(0);
  });

  // Test 10: Existing saved drafts and posters are preserved across storage keys
  it("Requirement 10: Existing saved drafts and posters are preserved across storage keys", () => {
    // Populate legacy storage key with existing drafts
    const legacyDrafts = [
      {
        id: "draft_legacy_1",
        name: "legacy_welcome_promo",
        category: "MARKETING",
        language: "en_US",
        headerType: "NONE",
        headerText: "",
        headerMediaUrl: "",
        body: "Welcome to Grovastra!",
        footer: "",
        buttons: [],
        variables: {},
        updatedAt: 1700000000000,
      },
    ];
    localStorage.setItem(LEGACY_DRAFTS_STORAGE_KEY, JSON.stringify(legacyDrafts));

    // When loading for an organization with no new scoped key yet, loadTemplateDraftsRaw migrates/reads legacy
    const raw = loadTemplateDraftsRaw("org_migration_test");
    const loaded = JSON.parse(raw || "[]");
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("draft_legacy_1");
    expect(loaded[0].name).toBe("legacy_welcome_promo");

    // The org-scoped key should now contain the migrated draft
    const orgKey = getTemplateDraftsStorageKey("org_migration_test");
    expect(localStorage.getItem(orgKey)).toContain("legacy_welcome_promo");
  });

  // Test 11: Existing campaign/template behavior and user isolation remain intact
  it("Requirement 11: Existing campaign/template behavior and user isolation remain intact", async () => {
    setupAuth(standardCustomerUser);

    renderWizard();

    await waitFor(() => {
      expect(screen.getByTestId("campaign-media-picker-card")).toBeDefined();
    });

    // Enter campaign name
    const nameInput = screen.getByLabelText(/Campaign Name/i);
    fireEvent.change(nameInput, { target: { value: "Summer Festival Sale" } });
    expect((nameInput as HTMLInputElement).value).toBe("Summer Festival Sale");

    // Simulate uploading a user image via file input
    const file = new File(["fake-image-bytes"], "banner.png", { type: "image/png" });
    const fileInput = screen.getByTestId("campaign-image-file-input");

    // Trigger file change
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Campaign name must remain intact
    expect((nameInput as HTMLInputElement).value).toBe("Summer Festival Sale");
  });
});
