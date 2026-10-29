import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, cleanup } from "@testing-library/react";
import { TemplatesPage } from "../pages/TemplatesPage.js";
import { TemplateEditor } from "../components/TemplateEditor.js";
import { TemplateList } from "../components/TemplateList.js";
import {
  WhatsAppPhonePreview,
  validatePreviewPhoneNumber,
  validateActionButtonPhoneNumber,
} from "../components/WhatsAppPhonePreview.js";
import { WhatsAppMessageBubble } from "../components/WhatsAppMessageBubble.js";
import { CampaignWizard } from "../components/CampaignWizard.js";
import { apiClient } from "../services/api.js";
import * as AuthContextModule from "../context/AuthContext.js";
import { User } from "../types/auth.js";
import { WhatsAppTemplate } from "../types/template.js";

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
                mediaUrl: "https://admin.example.com/admin-catalog-sample.jpg",
                mediaFilename: "admin-catalog-sample.jpg",
              },
              body: "Hello {{1}}! Your order {{2}} has been confirmed.",
              variables: [
                { key: "1", sampleValue: "Rahul", fallbackValue: "Customer" },
                { key: "2", sampleValue: "ORD-9988", fallbackValue: "ORD-0000" },
              ],
              buttons: [],
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

describe("Phase 3J — Hide Admin Sample Images in User Preview & Editable Preview Phone Number", () => {
  const standardCustomerUser: User = {
    id: "usr_customer_j",
    email: "customer@tenant.com",
    firstName: "Standard",
    lastName: "Customer",
    role: "MEMBER",
    platformRole: "NONE",
    organizationId: "org_tenant_j",
    createdAt: new Date().toISOString(),
  };

  const superAdminUser: User = {
    id: "usr_super_admin_j",
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
        name: isSuperAdmin ? "Grovastra Platform" : "Tenant Store",
        slug: isSuperAdmin ? "grovastra-platform" : "tenant-store",
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

  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  // 1. Admin sample image is hidden from standard-user template previews
  it("Requirement 1: Admin sample image is hidden from standard-user template previews", async () => {
    setupAuth(standardCustomerUser);

    render(<TemplatesPage />);

    // Wait for templates to load
    const tplName = await screen.findByText("jaspers_market_order_confirmation_v1");
    const tplCard = tplName.closest('[role="button"]');
    expect(tplCard).toBeDefined();
    fireEvent.click(tplCard!);

    // Template details inspector opens
    await waitFor(() => {
      expect(screen.getByTestId("template-editor")).toBeDefined();
    });

    // Verify phone preview does NOT render the admin sample image
    const previewImgs = document.querySelectorAll(".wa-bubble-media img");
    expect(previewImgs.length).toBe(0);

    // Placeholder box must be rendered
    const placeholder = screen.getByTestId("preview-image-placeholder");
    expect(placeholder.textContent).toContain("No image selected");
  });

  // 2. Image-header preview shows No image selected by default
  it("Requirement 2: Image-header preview shows 'No image selected' by default", () => {
    const imageTemplate: WhatsAppTemplate = {
      id: "tpl_img_test",
      name: "jaspers_market_order_confirmation_v1",
      language: "en_US",
      category: "MARKETING",
      status: "APPROVED",
      isSendable: true,
      header: {
        type: "IMAGE",
        mediaUrl: "https://admin.com/sample.jpg",
      },
      body: "Test template body",
      variables: [],
      buttons: [],
    };

    // Render WhatsAppMessageBubble with hideSampleMedia={true} (standard user mode)
    render(<WhatsAppMessageBubble template={imageTemplate} hideSampleMedia={true} />);

    const placeholder = screen.getByTestId("preview-image-placeholder");
    expect(placeholder.textContent).toContain("No image selected");
    expect(screen.queryByTestId("preview-header-image")).toBeNull();
  });

  // 3. User-selected preview image appears only in local preview state
  it("Requirement 3: User-selected preview image appears only in local preview state", () => {
    const baseTemplate: WhatsAppTemplate = {
      id: "tpl_local_test",
      name: "jaspers_market_order_confirmation_v1",
      language: "en_US",
      category: "MARKETING",
      status: "APPROVED",
      isSendable: true,
      header: {
        type: "IMAGE",
        mediaUrl: undefined,
      },
      body: "Hello {{1}}!",
      variables: [{ key: "1", sampleValue: "Test", fallbackValue: "User" }],
      buttons: [],
    };

    let currentTemplate = { ...baseTemplate };
    const handleChange = vi.fn((updated) => {
      currentTemplate = updated;
    });

    const { rerender } = render(
      <TemplateEditor
        template={currentTemplate}
        onChange={handleChange}
        onCancel={vi.fn()}
        canSaveDraft={false}
      />
    );

    // Initial state: No image selected
    expect(screen.getByTestId("header-image-placeholder-box")).toBeDefined();
    expect(screen.getByText("No image selected")).toBeDefined();

    // User uploads a local image
    const file = new File(["fake-bytes"], "user_banner.png", { type: "image/png" });
    const fileInput = screen.getByTestId("template-header-file-input");

    // Simulate file input
    fireEvent.change(fileInput, { target: { files: [file] } });

    // Simulate updating with the user's selected file
    const userSelectedTemplate: WhatsAppTemplate = {
      ...baseTemplate,
      header: {
        type: "IMAGE",
        mediaUrl: "data:image/png;base64,userImageBytes",
        mediaFilename: "user_banner.png",
        mediaIsLocal: true,
        mediaSource: "FILE",
      },
    };

    rerender(
      <TemplateEditor
        template={userSelectedTemplate}
        onChange={handleChange}
        onCancel={vi.fn()}
        canSaveDraft={false}
      />
    );

    // User's selected image is now rendered in local editor state
    expect(screen.getByTestId("header-image-current-box")).toBeDefined();
    expect(screen.getByText("user_banner.png")).toBeDefined();

    // Base template catalog definition was not mutated
    expect(baseTemplate.header?.mediaUrl).toBeUndefined();
  });

  // 4. Removing the user image restores the empty placeholder
  it("Requirement 4: Removing the user image restores the empty placeholder", () => {
    const handleChange = vi.fn();
    const userSelectedTemplate: WhatsAppTemplate = {
      id: "tpl_remove_test",
      name: "jaspers_market_order_confirmation_v1",
      language: "en_US",
      category: "MARKETING",
      status: "APPROVED",
      isSendable: true,
      header: {
        type: "IMAGE",
        mediaUrl: "data:image/png;base64,userImageBytes",
        mediaFilename: "user_banner.png",
        mediaIsLocal: true,
        mediaSource: "FILE",
      },
      body: "Hello {{1}}!",
      variables: [],
      buttons: [],
    };

    render(
      <TemplateEditor
        template={userSelectedTemplate}
        onChange={handleChange}
        onCancel={vi.fn()}
        canSaveDraft={false}
      />
    );

    // Click remove button
    const removeBtn = screen.getByTestId("btn-remove-header-image");
    fireEvent.click(removeBtn);

    // Verify onChange was called with cleared media
    expect(handleChange).toHaveBeenCalledWith(
      expect.objectContaining({
        header: expect.objectContaining({
          type: "IMAGE",
          mediaUrl: undefined,
          mediaFilename: undefined,
        }),
      })
    );
  });

  // 5. Featured cards and template details do not leak Admin sample images
  it("Requirement 5: Featured cards and template details do not leak Admin sample images", () => {
    const featuredAdminTemplate: WhatsAppTemplate = {
      id: "draft_featured_1",
      name: "featured_festive_sale",
      language: "en_US",
      category: "MARKETING",
      status: "LOCAL_DRAFT",
      isLocalDraft: true,
      isSendable: false,
      header: {
        type: "IMAGE",
        mediaUrl: "https://admin.example.com/secret-admin-poster.png",
        mediaFilename: "secret-admin-poster.png",
      },
      body: "Exclusive Diwali sale for our valued members!",
      variables: [],
      buttons: [],
    };

    // Render TemplateList for a standard user (isSuperAdmin = false)
    render(
      <TemplateList
        templates={[featuredAdminTemplate]}
        onSelectTemplate={vi.fn()}
        isSuperAdmin={false}
      />
    );

    // The card must NOT render the admin sample image
    const cardImgs = document.querySelectorAll(".wa-card-canvas img");
    expect(cardImgs.length).toBe(0);

    // The card must show the empty placeholder
    const cardPlaceholder = screen.getByTestId("preview-image-placeholder");
    expect(cardPlaceholder.textContent).toContain("No image selected");
  });

  // 6. Text-only templates remain free of image controls
  it("Requirement 6: Text-only templates remain free of image controls", () => {
    const textOnlyTemplate: WhatsAppTemplate = {
      id: "tpl_text_only_test",
      name: "jaspers_market_plain_text_v1",
      language: "en_US",
      category: "MARKETING",
      status: "APPROVED",
      isSendable: true,
      header: { type: "NONE" },
      body: "This is a plain text message.",
      variables: [],
      buttons: [],
    };

    render(
      <TemplateEditor
        template={textOnlyTemplate}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        canSaveDraft={false}
      />
    );

    // Verify image controls are absent
    expect(screen.queryByTestId("header-image-edit-panel")).toBeNull();
    expect(screen.queryByTestId("btn-upload-image")).toBeNull();
    expect(screen.queryByTestId("btn-choose-poster")).toBeNull();

    // Verify text-only notice is displayed
    expect(screen.getByTestId("text-only-header-notice")).toBeDefined();
    expect(screen.getByText(/Image and media options are disabled for text-only templates/i)).toBeDefined();
  });

  // 7. Preview phone number can be edited and updates the displayed value
  it("Requirement 7: Preview phone number can be edited and updates the displayed value immediately", () => {
    const dummyTemplate: WhatsAppTemplate = {
      id: "tpl_phone_test",
      name: "test_tpl",
      language: "en_US",
      category: "UTILITY",
      status: "APPROVED",
      header: { type: "NONE" },
      body: "Hello from Grovastra",
      variables: [],
      buttons: [],
    };

    render(<WhatsAppPhonePreview template={dummyTemplate} />);

    // Initial default value
    const phoneInput = screen.getByTestId("preview-phone-input") as HTMLInputElement;
    expect(phoneInput.value).toBe("+91 98765 43210");
    expect(phoneInput.disabled).toBe(false);
    expect(phoneInput.readOnly).toBe(false);

    // Header and chat banner display initial default
    expect(screen.getByTestId("preview-recipient-phone").textContent).toBe("+91 98765 43210");
    expect(screen.getByTestId("preview-recipient-phone-pill").textContent).toBe("+91 98765 43210");

    // Edit the preview phone number using keyboard input
    fireEvent.change(phoneInput, { target: { value: "+1 555 987 6543" } });

    // Verify immediate update in phone screen header and banner
    expect(phoneInput.value).toBe("+1 555 987 6543");
    expect(screen.getByTestId("preview-recipient-phone").textContent).toBe("+1 555 987 6543");
    expect(screen.getByTestId("preview-recipient-phone-pill").textContent).toBe("+1 555 987 6543");
  });

  it("Requirement 7b: Preview phone input in TemplatesPage is enabled, editable, and persists across template re-renders", async () => {
    setupAuth(standardCustomerUser);
    render(<TemplatesPage />);

    await waitFor(() => {
      expect(screen.getByText(/WhatsApp Message Templates/i)).toBeDefined();
    });

    // Select the template
    const tplCard = screen.getByText("jaspers_market_order_confirmation_v1").closest('[role="button"]');
    expect(tplCard).toBeDefined();
    fireEvent.click(tplCard!);

    await waitFor(() => {
      expect(screen.getByTestId("preview-phone-input")).toBeDefined();
    });

    const phoneInput = screen.getByTestId("preview-phone-input") as HTMLInputElement;
    expect(phoneInput.disabled).toBe(false);
    expect(phoneInput.readOnly).toBe(false);

    // Type a custom phone number
    fireEvent.change(phoneInput, { target: { value: "+44 7911 123456" } });
    expect(phoneInput.value).toBe("+44 7911 123456");
    expect(screen.getByTestId("preview-recipient-phone").textContent).toBe("+44 7911 123456");

    // Simulate variable update in TemplateEditor (which causes TemplatesPage to re-render)
    const varInput = screen.getByPlaceholderText("Test value for {{1}}");
    fireEvent.change(varInput, { target: { value: "Alice" } });

    // Verify phone number was NOT reset on re-render
    expect((screen.getByTestId("preview-phone-input") as HTMLInputElement).value).toBe("+44 7911 123456");
    expect(screen.getByTestId("preview-recipient-phone").textContent).toBe("+44 7911 123456");
  });

  // 8. Invalid phone numbers receive appropriate validation feedback
  it("Requirement 8: Invalid phone numbers receive appropriate validation feedback", () => {
    // Test validation helper directly
    expect(validatePreviewPhoneNumber("").isValid).toBe(false);
    expect(validatePreviewPhoneNumber("").error).toContain("Please enter a preview phone number");

    expect(validatePreviewPhoneNumber("123").isValid).toBe(false);
    expect(validatePreviewPhoneNumber("123").error).toContain("too short");

    expect(validatePreviewPhoneNumber("+1 9999999999999999").isValid).toBe(false);
    expect(validatePreviewPhoneNumber("+1 9999999999999999").error).toContain("too long");

    expect(validatePreviewPhoneNumber("invalid#phone!").isValid).toBe(false);
    expect(validatePreviewPhoneNumber("invalid#phone!").error).toContain("may only contain digits");

    expect(validatePreviewPhoneNumber("+91 98765 43210").isValid).toBe(true);
    expect(validatePreviewPhoneNumber("+91 98765 43210").error).toBeNull();

    // Test in component UI
    const dummyTemplate: WhatsAppTemplate = {
      id: "tpl_val_test",
      name: "test_tpl",
      language: "en_US",
      category: "UTILITY",
      status: "APPROVED",
      header: { type: "NONE" },
      body: "Hello",
      variables: [],
      buttons: [],
    };

    render(<WhatsAppPhonePreview template={dummyTemplate} />);
    const phoneInput = screen.getByTestId("preview-phone-input");

    // Type invalid short number
    fireEvent.change(phoneInput, { target: { value: "123" } });
    expect(screen.getByTestId("preview-phone-error")).toBeDefined();
    expect(screen.getByTestId("preview-phone-error").textContent).toContain("too short");

    // Type valid number
    fireEvent.change(phoneInput, { target: { value: "+91 98765 00000" } });
    expect(screen.queryByTestId("preview-phone-error")).toBeNull();
  });

  // 9. Changing the preview number does not modify campaign recipients or call any send API
  it("Requirement 9: Changing the preview number does not modify campaign recipients or call any send API", async () => {
    setupAuth(standardCustomerUser);

    const createCampaignSpy = vi.spyOn(apiClient, "createCampaign");

    render(
      <CampaignWizard
        onSave={vi.fn()}
        onCancel={vi.fn()}
        isSaving={false}
      />
    );

    await waitFor(() => {
      expect(screen.getByTestId("preview-phone-input")).toBeDefined();
    });

    const phoneInput = screen.getByTestId("preview-phone-input");
    fireEvent.change(phoneInput, { target: { value: "+44 7700 900077" } });

    // Verify 0 API calls triggered
    expect(createCampaignSpy).toHaveBeenCalledTimes(0);

    // Verify campaign form fields (such as campaign basics) are not mutated or submitted
    const nameInput = screen.getByLabelText(/Campaign Name/i) as HTMLInputElement;
    expect(nameInput.value).toBe("");
  });

  // 10. Standard users still cannot save Admin template drafts
  it("Requirement 10: Standard users still cannot save Admin template drafts", () => {
    const onSaveSpy = vi.fn();
    const draftTemplate: WhatsAppTemplate = {
      id: "draft_test_10",
      name: "holiday_special",
      language: "en_US",
      category: "MARKETING",
      status: "DRAFT",
      isSendable: false,
      header: { type: "IMAGE" },
      body: "Draft body",
      variables: [],
      buttons: [],
    };

    render(
      <TemplateEditor
        template={draftTemplate}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={onSaveSpy}
        canSaveDraft={false}
      />
    );

    // Button must be absent
    expect(screen.queryByTestId("btn-save-draft-changes")).toBeNull();
    expect(onSaveSpy).not.toHaveBeenCalled();
  });

  // 11. Admin user template authoring preview retains configured admin sample image
  it("Requirement 11: Admin user template authoring preview retains configured admin sample image", async () => {
    setupAuth(superAdminUser);

    render(<TemplatesPage />);

    const tplName = await screen.findByText("jaspers_market_order_confirmation_v1");
    const tplCard = tplName.closest('[role="button"]');
    expect(tplCard).toBeDefined();
    fireEvent.click(tplCard!);

    await waitFor(() => {
      expect(screen.getByTestId("template-editor")).toBeDefined();
    });

    // For Super Admin, admin sample image is retained in preview
    const previewImgs = document.querySelectorAll(".wa-bubble-media img");
    expect(previewImgs.length).toBe(1);
    expect((previewImgs[0] as HTMLImageElement).src).toBe("https://admin.example.com/admin-catalog-sample.jpg");

    // Also verify canSaveDraft allows Super Admin to save local drafts
    const draftTemplate: WhatsAppTemplate = {
      id: "draft_test_admin",
      name: "holiday_special",
      language: "en_US",
      category: "MARKETING",
      status: "DRAFT",
      isSendable: false,
      header: { type: "IMAGE", mediaUrl: "https://admin.com/sample.jpg" },
      body: "Draft body",
      variables: [],
      buttons: [],
    };
    render(
      <TemplateEditor
        template={draftTemplate}
        onChange={vi.fn()}
        onCancel={vi.fn()}
        onSave={vi.fn()}
        canSaveDraft={true}
      />
    );
    expect(screen.getByTestId("btn-save-draft-changes")).toBeDefined();
  });
});

describe("Phase 3J.2 — Make Phone Action Button Editable in User Preview", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    localStorage.clear();
  });

  afterEach(() => {
    cleanup();
  });

  const mockPhoneTemplate: WhatsAppTemplate = {
    id: "tpl_phone_btn_test",
    name: "customer_support_template",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    header: { type: "NONE" },
    body: "Need help? Tap the call button below to speak with our support agent.",
    variables: [],
    buttons: [
      {
        id: "btn_call_1",
        type: "PHONE_NUMBER",
        text: "Call Support",
        phoneNumber: "+919876543210",
      },
      {
        id: "btn_url_1",
        type: "URL",
        text: "Visit Help Center",
        url: "https://grovastra.com/help",
      },
    ],
  };

  it("1. Action button phone validation helper enforces international E.164 requirements", () => {
    // Empty
    expect(validateActionButtonPhoneNumber("").isValid).toBe(false);
    expect(validateActionButtonPhoneNumber("").error).toContain("Please enter a test phone number");

    // Missing leading '+'
    expect(validateActionButtonPhoneNumber("9876543210").isValid).toBe(false);
    expect(validateActionButtonPhoneNumber("9876543210").error).toContain("must start with '+'");

    // Too short (< 7 digits)
    expect(validateActionButtonPhoneNumber("+123").isValid).toBe(false);
    expect(validateActionButtonPhoneNumber("+123").error).toContain("too short");

    // Too long (> 15 digits)
    expect(validateActionButtonPhoneNumber("+1999999999999999").isValid).toBe(false);
    expect(validateActionButtonPhoneNumber("+1999999999999999").error).toContain("too long");

    // Non-digits
    expect(validateActionButtonPhoneNumber("+1555callnow").isValid).toBe(false);
    expect(validateActionButtonPhoneNumber("+1555callnow").error).toContain("only contain digits");

    // Valid formats
    expect(validateActionButtonPhoneNumber("+919876543210").isValid).toBe(true);
    expect(validateActionButtonPhoneNumber("+919876543210").error).toBeNull();
    expect(validateActionButtonPhoneNumber("+1 555 123 4567").isValid).toBe(true);
    expect(validateActionButtonPhoneNumber("+44 7700 900077").isValid).toBe(true);
  });

  it("2. Existing phone-button number appears in the editable input and WhatsApp preview", () => {
    const handleChange = vi.fn();

    render(
      <div>
        <TemplateEditor
          template={mockPhoneTemplate}
          onChange={handleChange}
          onCancel={vi.fn()}
        />
        <WhatsAppMessageBubble template={mockPhoneTemplate} />
      </div>
    );

    // Editable input exists and has initial phone number
    const phoneInput = screen.getByTestId("input-button-phone-btn_call_1") as HTMLInputElement;
    expect(phoneInput).toBeDefined();
    expect(phoneInput.value).toBe("+919876543210");
    expect(phoneInput.disabled).toBe(false);
    expect(phoneInput.readOnly).toBe(false);

    // Label and simulation badge
    expect(screen.getByText("Test Phone Button Number")).toBeDefined();
    expect(screen.getByText("Simulation Only")).toBeDefined();

    // In WhatsApp preview bubble, the button displays the phone number
    const btnPhoneDisplay = screen.getByTestId("preview-btn-phone-btn_call_1");
    expect(btnPhoneDisplay.textContent).toContain("+919876543210");
  });

  it("3. User can edit the phone-button number and WhatsApp preview updates immediately", () => {
    let currentTemplate = { ...mockPhoneTemplate };
    const { rerender } = render(
      <div>
        <TemplateEditor
          template={currentTemplate}
          onChange={(updated) => {
            currentTemplate = updated;
          }}
          onCancel={vi.fn()}
        />
        <WhatsAppMessageBubble template={currentTemplate} />
      </div>
    );

    const phoneInput = screen.getByTestId("input-button-phone-btn_call_1");
    fireEvent.change(phoneInput, { target: { value: "+1 555 999 8888" } });

    // Rerender with updated template (simulating React parent state update)
    rerender(
      <div>
        <TemplateEditor
          template={currentTemplate}
          onChange={(updated) => {
            currentTemplate = updated;
          }}
          onCancel={vi.fn()}
        />
        <WhatsAppMessageBubble template={currentTemplate} />
      </div>
    );

    // Input updated
    expect((screen.getByTestId("input-button-phone-btn_call_1") as HTMLInputElement).value).toBe("+1 555 999 8888");

    // WhatsApp preview button updated immediately
    const btnPhoneDisplay = screen.getByTestId("preview-btn-phone-btn_call_1");
    expect(btnPhoneDisplay.textContent).toContain("+1 555 999 8888");
  });

  it("4. Reset button restores the original phone number", () => {
    let currentTemplate = { ...mockPhoneTemplate };
    const { rerender } = render(
      <div>
        <TemplateEditor
          template={currentTemplate}
          onChange={(updated) => {
            currentTemplate = updated;
          }}
          onCancel={vi.fn()}
        />
      </div>
    );

    const phoneInput = screen.getByTestId("input-button-phone-btn_call_1");
    fireEvent.change(phoneInput, { target: { value: "+44 7911 123456" } });

    rerender(
      <div>
        <TemplateEditor
          template={currentTemplate}
          onChange={(updated) => {
            currentTemplate = updated;
          }}
          onCancel={vi.fn()}
        />
      </div>
    );

    // Reset button appears because value differs from original
    const resetBtn = screen.getByTestId("btn-reset-phone-btn_call_1");
    expect(resetBtn).toBeDefined();

    // Click Reset
    fireEvent.click(resetBtn);

    rerender(
      <div>
        <TemplateEditor
          template={currentTemplate}
          onChange={(updated) => {
            currentTemplate = updated;
          }}
          onCancel={vi.fn()}
        />
      </div>
    );

    // Restores original number
    expect((screen.getByTestId("input-button-phone-btn_call_1") as HTMLInputElement).value).toBe("+919876543210");
  });

  it("5. Multiple phone buttons remain completely independent", () => {
    const multiPhoneTemplate: WhatsAppTemplate = {
      ...mockPhoneTemplate,
      id: "tpl_multi_phone",
      buttons: [
        {
          id: "btn_sales",
          type: "PHONE_NUMBER",
          text: "Call Sales",
          phoneNumber: "+15551111111",
        },
        {
          id: "btn_support",
          type: "PHONE_NUMBER",
          text: "Call Support",
          phoneNumber: "+15552222222",
        },
      ],
    };

    let currentTemplate = { ...multiPhoneTemplate };
    const { rerender } = render(
      <TemplateEditor
        template={currentTemplate}
        onChange={(updated) => {
          currentTemplate = updated;
        }}
        onCancel={vi.fn()}
      />
    );

    const inputSales = screen.getByTestId("input-button-phone-btn_sales") as HTMLInputElement;
    const inputSupport = screen.getByTestId("input-button-phone-btn_support") as HTMLInputElement;

    expect(inputSales.value).toBe("+15551111111");
    expect(inputSupport.value).toBe("+15552222222");

    // Edit only sales button
    fireEvent.change(inputSales, { target: { value: "+15559999999" } });

    rerender(
      <TemplateEditor
        template={currentTemplate}
        onChange={(updated) => {
          currentTemplate = updated;
        }}
        onCancel={vi.fn()}
      />
    );

    // Sales updated, Support untouched
    expect((screen.getByTestId("input-button-phone-btn_sales") as HTMLInputElement).value).toBe("+15559999999");
    expect((screen.getByTestId("input-button-phone-btn_support") as HTMLInputElement).value).toBe("+15552222222");
  });

  it("6. URL buttons and non-phone templates are unaffected and do not show phone inputs", () => {
    const urlOnlyTemplate: WhatsAppTemplate = {
      id: "tpl_url_only",
      name: "url_template",
      language: "en_US",
      category: "MARKETING",
      status: "APPROVED",
      header: { type: "NONE" },
      body: "Check out our website.",
      variables: [],
      buttons: [
        {
          id: "btn_website",
          type: "URL",
          text: "Visit Website",
          url: "https://example.com",
        },
      ],
    };

    render(
      <TemplateEditor
        template={urlOnlyTemplate}
        onChange={vi.fn()}
        onCancel={vi.fn()}
      />
    );

    // URL input is present
    expect(screen.getByTestId("input-button-url-btn_website")).toBeDefined();

    // No phone button editing group or phone input is present
    expect(screen.queryByTestId("phone-btn-edit-group-btn_website")).toBeNull();
    expect(screen.queryByTestId("input-button-phone-btn_website")).toBeNull();
  });

  it("7. Invalid phone number shows validation error feedback", () => {
    let currentTemplate = { ...mockPhoneTemplate };
    const { rerender } = render(
      <TemplateEditor
        template={currentTemplate}
        onChange={(updated) => {
          currentTemplate = updated;
        }}
        onCancel={vi.fn()}
      />
    );

    const phoneInput = screen.getByTestId("input-button-phone-btn_call_1");

    // Enter invalid number missing '+'
    fireEvent.change(phoneInput, { target: { value: "12345" } });

    rerender(
      <TemplateEditor
        template={currentTemplate}
        onChange={(updated) => {
          currentTemplate = updated;
        }}
        onCancel={vi.fn()}
      />
    );

    const errorEl = screen.getByTestId("phone-btn-error-btn_call_1");
    expect(errorEl).toBeDefined();
    expect(errorEl.textContent).toContain("must start with '+'");

    // Enter valid number
    fireEvent.change(phoneInput, { target: { value: "+15553334444" } });

    rerender(
      <TemplateEditor
        template={currentTemplate}
        onChange={(updated) => {
          currentTemplate = updated;
        }}
        onCancel={vi.fn()}
      />
    );

    expect(screen.queryByTestId("phone-btn-error-btn_call_1")).toBeNull();
  });

  it("8. Strict Isolation: Phone button edits do not alter separate Preview Phone Number or trigger API calls", () => {
    const listCampaignsSpy = vi.spyOn(apiClient, "listCampaigns");
    const createCampaignSpy = vi.spyOn(apiClient, "createCampaign");

    let currentTemplate = { ...mockPhoneTemplate };
    let recipientPhone = "+91 98765 43210";

    render(
      <div>
        <WhatsAppPhonePreview
          template={currentTemplate}
          previewPhone={recipientPhone}
          onPreviewPhoneChange={(p) => {
            recipientPhone = p;
          }}
        />
        <TemplateEditor
          template={currentTemplate}
          onChange={(updated) => {
            currentTemplate = updated;
          }}
          onCancel={vi.fn()}
          canSaveDraft={false}
        />
      </div>
    );

    // Initial recipient phone
    const previewPhoneInput = screen.getByTestId("preview-phone-input") as HTMLInputElement;
    expect(previewPhoneInput.value).toBe("+91 98765 43210");

    // Edit the action button phone number
    const buttonPhoneInput = screen.getByTestId("input-button-phone-btn_call_1") as HTMLInputElement;
    fireEvent.change(buttonPhoneInput, { target: { value: "+1 800 555 0199" } });

    // The recipient phone number must remain completely unchanged
    expect(previewPhoneInput.value).toBe("+91 98765 43210");
    expect(recipientPhone).toBe("+91 98765 43210");

    // No API calls
    expect(listCampaignsSpy).not.toHaveBeenCalled();
    expect(createCampaignSpy).not.toHaveBeenCalled();

    // Standard user still cannot save drafts
    expect(screen.queryByTestId("btn-save-draft-changes")).toBeNull();
  });
});

