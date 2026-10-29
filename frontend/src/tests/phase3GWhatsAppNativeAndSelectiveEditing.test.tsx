import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import { WhatsAppMessageBubble } from "../components/WhatsAppMessageBubble";
import { TemplateEditor } from "../components/TemplateEditor";
import { TemplateList } from "../components/TemplateList";
import { CampaignPosterPickerModal } from "../components/poster/CampaignPosterPickerModal";
import { WhatsAppTemplate } from "../types/template";
import { SavedPosterDesignSummary } from "../types/poster";
import { posterStorageService } from "../services/posterStorageService";

// Mock posterStorageService
vi.mock("../services/posterStorageService.js", () => {
  return {
    posterStorageService: {
      initDB: vi.fn().mockResolvedValue(undefined),
      closeDB: vi.fn(),
      setUserId: vi.fn(),
      listDesigns: vi.fn(),
      getDesign: vi.fn(),
      saveDesign: vi.fn(),
    },
    PosterStorageError: class extends Error {},
  };
});

describe("Phase 3G: WhatsApp-Native Poster Format, Template Testing & Selective Editing", () => {
  const mockImageTemplate: WhatsAppTemplate = {
    id: "tpl_image_promo",
    name: "seasonal_promo_image_v1",
    language: "en_US",
    category: "MARKETING",
    status: "APPROVED",
    isSendable: true,
    header: {
      type: "IMAGE",
      mediaUrl: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==",
      mediaFilename: "diwali_square_poster.png",
      mediaFilesize: "1080×1080 px",
    },
    body: "Hi {{1}}, celebrate Diwali with a special discount code: {{2}}!",
    footer: "Reply STOP to unsubscribe",
    variables: [
      { key: "1", sampleValue: "Aarav", fallbackValue: "Valued Customer" },
      { key: "2", sampleValue: "DIWALI50", fallbackValue: "SAVE50" },
    ],
    buttons: [
      { id: "btn_shop", type: "URL", text: "Shop Now", url: "https://example.com/diwali" },
      { id: "btn_help", type: "QUICK_REPLY", text: "Talk to Agent" },
    ],
    lastUpdated: "2026-10-25T10:00:00Z",
  };

  const mockTextOnlyTemplate: WhatsAppTemplate = {
    id: "tpl_text_only",
    name: "appointment_reminder_v1",
    language: "en_US",
    category: "UTILITY",
    status: "APPROVED",
    isSendable: true,
    header: { type: "NONE" },
    body: "Hello {{1}}, your appointment is confirmed for {{2}}.",
    variables: [
      { key: "1", sampleValue: "Priya", fallbackValue: "Customer" },
      { key: "2", sampleValue: "Tomorrow at 10 AM", fallbackValue: "the scheduled time" },
    ],
    buttons: [],
    lastUpdated: "2026-10-25T11:00:00Z",
  };

  const mockFeaturedDraftTemplate: WhatsAppTemplate = {
    id: "local_featured_draft",
    name: "diwali_flash_sale_featured",
    language: "en_US",
    category: "MARKETING",
    status: "LOCAL_DRAFT",
    isSendable: false,
    isLocalDraft: true,
    header: {
      type: "IMAGE",
    },
    body: "Happy Diwali! Enjoy exclusive deals on our store.",
    variables: [],
    buttons: [],
    lastUpdated: "2026-10-25T12:00:00Z",
  };

  const sampleDesigns: SavedPosterDesignSummary[] = [
    {
      id: "des_square_1",
      name: "Diwali 1080x1080 Square",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      thumbnailDataUrl: "data:image/png;base64,mockSquare",
      assetIds: [],
      createdAt: 1000,
      updatedAt: 1000,
    },
    {
      id: "des_header_1",
      name: "Promotional 1200x628 Header",
      presetId: "whatsapp-header",
      width: 1200,
      height: 628,
      thumbnailDataUrl: "data:image/png;base64,mockHeader",
      assetIds: [],
      createdAt: 2000,
      updatedAt: 2000,
    },
    {
      id: "des_story_1",
      name: "Status Story 1080x1920",
      presetId: "whatsapp-status",
      width: 1080,
      height: 1920,
      thumbnailDataUrl: "data:image/png;base64,mockStory",
      assetIds: [],
      createdAt: 3000,
      updatedAt: 3000,
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    (posterStorageService.listDesigns as any).mockResolvedValue(sampleDesigns);
  });

  afterEach(() => {
    posterStorageService.closeDB();
  });

  /* -------------------------------------------------------------------------
   * Requirement 1: Poster Dimensions & Aspect Ratio in WhatsApp Bubble
   * ------------------------------------------------------------------------- */
  describe("1. WhatsApp Image Header Aspect Ratio & Fluid Display", () => {
    it("renders image in wa-bubble-media with wa-media-img class and contain mode without cropping", () => {
      const { container } = render(
        <WhatsAppMessageBubble template={mockImageTemplate} showSampleValues={true} />
      );

      const mediaContainer = container.querySelector(".wa-bubble-media");
      expect(mediaContainer).not.toBeNull();

      const imageEl = screen.getByTestId("preview-header-image");
      expect(imageEl).toBeDefined();
      expect(imageEl.getAttribute("src")).toBe(mockImageTemplate.header?.mediaUrl);
      expect(imageEl.className).toContain("wa-media-img");
    });

    it("displays both 1080x1080 square and 1200x628 landscape header images cleanly", () => {
      // 1080x1080 square template
      const { rerender } = render(
        <WhatsAppMessageBubble template={mockImageTemplate} showSampleValues={true} />
      );
      expect(screen.getByTestId("preview-header-image")).toBeDefined();

      // Switch to 1200x628 landscape header
      const landscapeTemplate: WhatsAppTemplate = {
        ...mockImageTemplate,
        header: {
          type: "IMAGE",
          mediaUrl: "data:image/png;base64,mockLandscape",
          mediaFilename: "promo_banner.png",
          mediaFilesize: "1200×628 px",
        },
      };
      rerender(<WhatsAppMessageBubble template={landscapeTemplate} showSampleValues={true} />);
      const landscapeImg = screen.getByTestId("preview-header-image");
      expect(landscapeImg.getAttribute("src")).toBe("data:image/png;base64,mockLandscape");
    });

    it("displays placeholder when image header is empty", () => {
      const emptyHeaderTemplate: WhatsAppTemplate = {
        ...mockImageTemplate,
        header: { type: "IMAGE" },
      };
      render(<WhatsAppMessageBubble template={emptyHeaderTemplate} showSampleValues={true} />);
      expect(screen.getByTestId("preview-image-placeholder")).toBeDefined();
    });
  });

  /* -------------------------------------------------------------------------
   * Requirement 2: Campaign Poster Picker Modal Compatibility Validation
   * ------------------------------------------------------------------------- */
  describe("2. Poster Picker Dimension Compatibility Validation", () => {
    it("allows selection of 1080x1080 Square design with Compatible badge", async () => {
      const handleSelect = vi.fn();
      render(
        <CampaignPosterPickerModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectPoster={handleSelect}
          userId="user_123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Diwali 1080x1080 Square")).toBeDefined();
      });

      expect(screen.getByText("Compatible (1080×1080)")).toBeDefined();

      // Click the square design card
      const squareCard = screen.getByText("Diwali 1080x1080 Square").closest('[role="button"]');
      expect(squareCard).not.toBeNull();
      fireEvent.click(squareCard!);

      // Confirm button becomes active and clickable
      const confirmBtn = screen.getByRole("button", { name: /Use Selected Poster/i });
      expect(confirmBtn).toBeDefined();
      fireEvent.click(confirmBtn);

      expect(handleSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Diwali 1080x1080 Square",
          width: 1080,
          height: 1080,
        })
      );
    });

    it("allows selection of 1200x628 WhatsApp Header design with optimal badge", async () => {
      const handleSelect = vi.fn();
      render(
        <CampaignPosterPickerModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectPoster={handleSelect}
          userId="user_123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Promotional 1200x628 Header")).toBeDefined();
      });

      expect(screen.getByText("WhatsApp Header (1.91:1)")).toBeDefined();

      const headerCard = screen.getByText("Promotional 1200x628 Header").closest('[role="button"]');
      expect(headerCard).not.toBeNull();
      fireEvent.click(headerCard!);

      const confirmBtn = screen.getByRole("button", { name: /Use Selected Poster/i });
      fireEvent.click(confirmBtn);

      expect(handleSelect).toHaveBeenCalledWith(
        expect.objectContaining({
          title: "Promotional 1200x628 Header",
          width: 1200,
          height: 628,
        })
      );
    });

    it("flags 1080x1920 Status story as incompatible and prevents selection", async () => {
      const handleSelect = vi.fn();
      render(
        <CampaignPosterPickerModal
          isOpen={true}
          onClose={vi.fn()}
          onSelectPoster={handleSelect}
          userId="user_123"
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Status Story 1080x1920")).toBeDefined();
      });

      expect(screen.getByText("Incompatible (Status)")).toBeDefined();

      // Clicking an incompatible design does NOT make it selected
      const storyCard = screen.getByText("Status Story 1080x1920").closest('[role="button"]');
      expect(storyCard).not.toBeNull();
      fireEvent.click(storyCard!);

      const confirmBtn = screen.getByRole("button", { name: /Use Selected Poster/i });
      expect((confirmBtn as HTMLButtonElement).disabled).toBe(true);
      expect(handleSelect).not.toHaveBeenCalled();
    });
  });

  /* -------------------------------------------------------------------------
   * Requirement 3: Contextual Selective Editing for Templates
   * ------------------------------------------------------------------------- */
  describe("3. Selective Contextual Editing for Templates", () => {
    it("renders image attachment controls ONLY for templates with IMAGE header", () => {
      const handleChange = vi.fn();
      const { rerender } = render(
        <TemplateEditor
          template={mockImageTemplate}
          onChange={handleChange}
          onCancel={vi.fn()}
        />
      );

      // IMAGE header template renders header image panel and buttons
      expect(screen.getByTestId("section-header-controls")).toBeDefined();
      expect(screen.getByTestId("header-image-current-box")).toBeDefined();
      expect(screen.getByTestId("btn-change-image-posters")).toBeDefined();
      expect(screen.getByTestId("btn-change-image-upload")).toBeDefined();
      expect(screen.getByTestId("btn-remove-header-image")).toBeDefined();

      // Now rerender with text-only template
      rerender(
        <TemplateEditor
          template={mockTextOnlyTemplate}
          onChange={handleChange}
          onCancel={vi.fn()}
        />
      );

      // Text-only template shows notice and no image buttons
      expect(screen.getByTestId("text-only-header-notice")).toBeDefined();
      expect(screen.queryByTestId("btn-change-image-posters")).toBeNull();
      expect(screen.queryByTestId("btn-change-image-upload")).toBeNull();
      expect(screen.queryByTestId("btn-remove-header-image")).toBeNull();
      expect(screen.queryByTestId("btn-choose-poster")).toBeNull();
    });

    it("allows removing attached header image from IMAGE header template", () => {
      const handleChange = vi.fn();
      render(
        <TemplateEditor
          template={mockImageTemplate}
          onChange={handleChange}
          onCancel={vi.fn()}
        />
      );

      const removeBtn = screen.getByTestId("btn-remove-header-image");
      fireEvent.click(removeBtn);

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

    it("keeps basic details and approved message body locked as read-only", () => {
      render(
        <TemplateEditor
          template={mockImageTemplate}
          onChange={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const nameInput = screen.getByLabelText("Template Name") as HTMLInputElement;
      expect(nameInput.readOnly).toBe(true);
      expect(nameInput.disabled).toBe(true);
      expect(nameInput.value).toBe(mockImageTemplate.name);

      const categoryInput = screen.getByLabelText("Category") as HTMLInputElement;
      expect(categoryInput.readOnly).toBe(true);
      expect(categoryInput.disabled).toBe(true);

      const languageInput = screen.getByLabelText("Language") as HTMLInputElement;
      expect(languageInput.readOnly).toBe(true);
      expect(languageInput.disabled).toBe(true);

      // Body text is displayed read-only
      expect(screen.getByText(/Hi \{\{1\}\}, celebrate Diwali with a special discount code: \{\{2\}\}!/)).toBeDefined();
    });

    it("allows interactive editing of sample preview variables without altering template body structure", () => {
      const handleChange = vi.fn();
      render(
        <TemplateEditor
          template={mockImageTemplate}
          onChange={handleChange}
          onCancel={vi.fn()}
        />
      );

      const sampleInput1 = screen.getByTestId("input-sample-1") as HTMLInputElement;
      expect(sampleInput1.value).toBe("Aarav");

      fireEvent.change(sampleInput1, { target: { value: "Rohan" } });

      expect(handleChange).toHaveBeenCalledWith(
        expect.objectContaining({
          body: mockImageTemplate.body, // Body structure unchanged
          variables: expect.arrayContaining([
            expect.objectContaining({ key: "1", sampleValue: "Rohan" }),
          ]),
        })
      );
    });

    it("renders action buttons section only when buttons exist in template", () => {
      const { rerender } = render(
        <TemplateEditor
          template={mockImageTemplate}
          onChange={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // Has buttons: Shop Now and Talk to Agent
      expect(screen.getByTestId("section-footer-buttons")).toBeDefined();
      expect(screen.getByText("Shop Now")).toBeDefined();
      expect(screen.getByText("Talk to Agent")).toBeDefined();
      expect(screen.getByTestId("input-button-url-btn_shop")).toBeDefined();

      // Rerender with template that has NO buttons
      rerender(
        <TemplateEditor
          template={mockTextOnlyTemplate}
          onChange={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      // No buttons section rendered
      expect(screen.queryByTestId("section-footer-buttons")).toBeNull();
    });
  });

  /* -------------------------------------------------------------------------
   * Requirement 4: Test Preview Safety Guarantee (No Real Sends / API Calls)
   * ------------------------------------------------------------------------- */
  describe("4. Test Preview Simulation Safety Guarantee", () => {
    it("displays prominent local simulation safety banner in TemplateEditor", () => {
      render(
        <TemplateEditor
          template={mockImageTemplate}
          onChange={vi.fn()}
          onCancel={vi.fn()}
        />
      );

      const safetyBanner = screen.getByTestId("simulation-safety-banner");
      expect(safetyBanner).toBeDefined();
      expect(safetyBanner.textContent).toContain("Local Test Simulation");
      expect(safetyBanner.textContent).toContain("0 messages sent");
      expect(safetyBanner.textContent).toContain("no campaigns enqueued");
      expect(safetyBanner.textContent).toContain("no Meta endpoints invoked");
    });

    it("renders Test Preview button in TemplateList and triggers local selection without sending", () => {
      const handleSelect = vi.fn();
      render(
        <TemplateList
          templates={[mockFeaturedDraftTemplate, mockTextOnlyTemplate]}
          onSelectTemplate={handleSelect}
        />
      );

      // Featured admin draft has "Test Preview" button
      const testPreviewBtn = screen.getByTestId(`btn-test-preview-${mockFeaturedDraftTemplate.id}`);
      expect(testPreviewBtn).toBeDefined();
      expect(testPreviewBtn.textContent).toContain("Test Preview");

      fireEvent.click(testPreviewBtn);

      // Selected template callback invoked in browser memory
      expect(handleSelect).toHaveBeenCalledWith(mockFeaturedDraftTemplate);
    });

    it("allows saving draft changes to local storage when template is a featured local draft", () => {
      const handleSave = vi.fn();
      render(
        <TemplateEditor
          template={mockFeaturedDraftTemplate}
          onChange={vi.fn()}
          onCancel={vi.fn()}
          onSave={handleSave}
        />
      );

      // Featured draft displays Featured Admin banner and Save Draft Changes button
      expect(screen.getByTestId("local-featured-banner")).toBeDefined();
      expect(screen.getByTestId("featured-admin-pill")).toBeDefined();

      const saveBtn = screen.getByTestId("btn-save-draft-changes");
      expect(saveBtn).toBeDefined();

      fireEvent.click(saveBtn);
      expect(handleSave).toHaveBeenCalledWith(mockFeaturedDraftTemplate);
    });
  });
});
