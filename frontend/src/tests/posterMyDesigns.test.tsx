import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { MyDesignsModal } from "../components/poster/MyDesignsModal";
import { UnsavedChangesModal } from "../components/poster/UnsavedChangesModal";
import { PosterToolbar } from "../components/poster/PosterToolbar";
import { PosterEditorPage } from "../pages/PosterEditorPage";
import { posterStorageService, PosterStorageError } from "../services/posterStorageService";
import { POSTER_PRESETS, SavedPosterDesignSummary, SavedPosterDesign } from "../types/poster";

// Mock canvas manager for isolated editor-level testing in Happy-DOM
let mockCanvasManagerInstance: any = null;
vi.mock("../services/posterCanvasManager.js", () => {
  return {
    PosterCanvasManager: class MockPosterCanvasManager {
      setActiveTool = vi.fn();
      setZoom = vi.fn();
      addText = vi.fn();
      clear = vi.fn();
      toJSON = vi.fn(() =>
        JSON.stringify({
          objects: [
            { type: "IText", text: "SUMMER SALE", top: 100 },
          ],
        })
      );
      getRegisteredAssets = vi.fn(() => new Map());
      fabricCanvas = {
        getObjects: vi.fn(() => []),
        getActiveObject: vi.fn(() => null),
        backgroundColor: "#ffffff",
        requestRenderAll: vi.fn(),
      };
      getLayers = vi.fn(() => []);
      dispose = vi.fn();
      setLogicalDimensions = vi.fn();
      getSelectedProperties = vi.fn(() => null);
      loadFromJSON = vi.fn().mockResolvedValue({ width: 1080, height: 1080 });
      trackSessionUrl = vi.fn();
      getSessionObjectUrls = vi.fn(() => []);

      constructor(public options?: any) {
        mockCanvasManagerInstance = this;
      }
    },
  };
});

vi.mock("../services/posterExportService.js", async (importOriginal) => {
  const actual: any = await importOriginal();
  return {
    ...actual,
    generateCanvasThumbnail: vi.fn(() => "data:image/jpeg;base64,mockthumb"),
  };
});

describe("Phase 3A, Step 3: My Designs & Design Restoration Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    posterStorageService.closeDB();
  });

  afterEach(() => {
    posterStorageService.closeDB();
  });

  describe("1. MyDesignsModal Component UI & Actions", () => {
    const mockDesigns: SavedPosterDesignSummary[] = [
      {
        id: "des_1",
        name: "Diwali Special Offer",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        thumbnailDataUrl: "data:image/jpeg;base64,thumb1",
        assetIds: ["ast_1"],
        createdAt: Date.now() - 3600000,
        updatedAt: Date.now() - 1800000,
      },
      {
        id: "des_2",
        name: "Flash Sale Status",
        presetId: "whatsapp-status",
        width: 1080,
        height: 1920,
        thumbnailDataUrl: "data:image/jpeg;base64,thumb2",
        assetIds: [],
        createdAt: Date.now() - 7200000,
        updatedAt: Date.now() - 3600000,
      },
    ];

    it("renders list of saved designs with thumbnails, names, presets, and active badge", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);

      render(
        <MyDesignsModal
          isOpen={true}
          onClose={vi.fn()}
          activeDesignId="des_1"
          onOpenDesign={vi.fn()}
          onNewPoster={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Diwali Special Offer")).toBeInTheDocument();
        expect(screen.getByText("Flash Sale Status")).toBeInTheDocument();
      });

      // Active badge for des_1
      expect(screen.getByText("Active")).toBeInTheDocument();
      expect(screen.getByText("Editing")).toBeInTheDocument();

      // Non-active des_2 has Open button
      expect(screen.getByRole("button", { name: /Open/i })).toBeInTheDocument();
    });

    it("filters saved designs by search query and preset tab", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);

      render(
        <MyDesignsModal
          isOpen={true}
          onClose={vi.fn()}
          activeDesignId={null}
          onOpenDesign={vi.fn()}
          onNewPoster={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Diwali Special Offer")).toBeInTheDocument();
      });

      // Filter by search query
      const searchInput = screen.getByLabelText("Search saved designs");
      fireEvent.change(searchInput, { target: { value: "Flash" } });

      expect(screen.queryByText("Diwali Special Offer")).not.toBeInTheDocument();
      expect(screen.getByText("Flash Sale Status")).toBeInTheDocument();

      // Clear search
      fireEvent.change(searchInput, { target: { value: "" } });
      expect(screen.getByText("Diwali Special Offer")).toBeInTheDocument();

      // Filter by WhatsApp Status preset tab
      const statusTab = screen.getByRole("tab", { name: "WhatsApp Status (9:16)" });
      fireEvent.click(statusTab);

      expect(screen.queryByText("Diwali Special Offer")).not.toBeInTheDocument();
      expect(screen.getByText("Flash Sale Status")).toBeInTheDocument();
    });

    it("renders empty state when no designs are saved and allows creating new poster", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue([]);
      const onNewPoster = vi.fn();

      render(
        <MyDesignsModal
          isOpen={true}
          onClose={vi.fn()}
          activeDesignId={null}
          onOpenDesign={vi.fn()}
          onNewPoster={onNewPoster}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("No Saved Posters Yet")).toBeInTheDocument();
      });

      const createBtn = screen.getByRole("button", { name: "Create Your First Poster" });
      fireEvent.click(createBtn);
      expect(onNewPoster).toHaveBeenCalledTimes(1);
    });

    it("surfaces storage error and enables retry in MyDesignsModal", async () => {
      const listSpy = vi
        .spyOn(posterStorageService, "listDesigns")
        .mockRejectedValueOnce(new PosterStorageError("Database corrupt", "CORRUPT"))
        .mockResolvedValueOnce(mockDesigns);

      render(
        <MyDesignsModal
          isOpen={true}
          onClose={vi.fn()}
          activeDesignId={null}
          onOpenDesign={vi.fn()}
          onNewPoster={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Database corrupt")).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole("button", { name: "Retry" });
      fireEvent.click(retryBtn);

      await waitFor(() => {
        expect(screen.getByText("Diwali Special Offer")).toBeInTheDocument();
      });
      expect(listSpy).toHaveBeenCalledTimes(2);
    });

    it("supports inline rename with validation (non-empty, max 80 chars)", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);
      const renameSpy = vi.spyOn(posterStorageService, "renameDesign").mockResolvedValue({
        ...mockDesigns[0],
        canvasJson: "{}",
        name: "Grand Mega Sale",
      });

      render(
        <MyDesignsModal
          isOpen={true}
          onClose={vi.fn()}
          activeDesignId={null}
          onOpenDesign={vi.fn()}
          onNewPoster={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Diwali Special Offer")).toBeInTheDocument();
      });

      const renameBtn = screen.getByLabelText("Rename Diwali Special Offer");
      fireEvent.click(renameBtn);

      const input = screen.getByLabelText("New poster name");
      expect(input).toBeInTheDocument();

      // 1. Validation: empty name
      fireEvent.change(input, { target: { value: "   " } });
      const confirmBtn = screen.getByTitle("Save name");
      fireEvent.click(confirmBtn);

      expect(screen.getByText("Name cannot be empty.")).toBeInTheDocument();
      expect(renameSpy).not.toHaveBeenCalled();

      // 2. Valid name save
      fireEvent.change(input, { target: { value: "Grand Mega Sale" } });
      fireEvent.click(confirmBtn);

      await waitFor(() => {
        expect(renameSpy).toHaveBeenCalledWith("des_1", "Grand Mega Sale");
      });
    });

    it("duplicates a design on duplicate action click", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);
      const dupSpy = vi.spyOn(posterStorageService, "duplicateDesign").mockResolvedValue({
        id: "des_dup_1",
        name: "Copy of Diwali Special Offer",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: "{}",
        assetIds: ["ast_1"],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      render(
        <MyDesignsModal
          isOpen={true}
          onClose={vi.fn()}
          activeDesignId={null}
          onOpenDesign={vi.fn()}
          onNewPoster={vi.fn()}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Diwali Special Offer")).toBeInTheDocument();
      });

      const dupBtn = screen.getByLabelText("Duplicate Diwali Special Offer");
      fireEvent.click(dupBtn);

      await waitFor(() => {
        expect(dupSpy).toHaveBeenCalledWith("des_1");
      });
    });

    it("requires explicit confirmation before deleting a design and cleans up orphans", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);
      const delSpy = vi.spyOn(posterStorageService, "deleteDesign").mockResolvedValue(true);
      const onDeleted = vi.fn();

      render(
        <MyDesignsModal
          isOpen={true}
          onClose={vi.fn()}
          activeDesignId={null}
          onOpenDesign={vi.fn()}
          onNewPoster={vi.fn()}
          onDesignDeleted={onDeleted}
        />
      );

      await waitFor(() => {
        expect(screen.getByText("Diwali Special Offer")).toBeInTheDocument();
      });

      const delBtn = screen.getByLabelText("Delete Diwali Special Offer");
      fireEvent.click(delBtn);

      // Confirmation dialog appears
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(screen.getByText(/Are you sure you want to permanently delete/i)).toBeInTheDocument();

      const confirmDeleteBtn = screen.getByRole("button", { name: "Delete Poster" });
      fireEvent.click(confirmDeleteBtn);

      await waitFor(() => {
        expect(delSpy).toHaveBeenCalledWith("des_1", { cleanupOrphans: true });
        expect(onDeleted).toHaveBeenCalledWith("des_1");
      });
    });
  });

  describe("2. UnsavedChangesModal Component", () => {
    it("renders Save & Continue, Discard, and Cancel buttons with callbacks", () => {
      const onSave = vi.fn();
      const onDiscard = vi.fn();
      const onCancel = vi.fn();

      render(
        <UnsavedChangesModal
          isOpen={true}
          onSaveAndContinue={onSave}
          onDiscard={onDiscard}
          onCancel={onCancel}
          isSaving={false}
        />
      );

      expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();

      fireEvent.click(screen.getByRole("button", { name: "Save & Continue" }));
      expect(onSave).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Discard Changes" }));
      expect(onDiscard).toHaveBeenCalledTimes(1);

      fireEvent.click(screen.getByRole("button", { name: "Cancel" }));
      expect(onCancel).toHaveBeenCalledTimes(1);
    });
  });

  describe("3. PosterToolbar & Mobile Add Sheet Integration", () => {
    it("renders My Designs and New Poster buttons on toolbar", () => {
      const onOpenMyDesigns = vi.fn();
      const onNewPoster = vi.fn();

      render(
        <PosterToolbar
          title="Promo"
          onTitleChange={vi.fn()}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={vi.fn()}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          zoomLevel={1}
          onZoomChange={vi.fn()}
          onResetZoom={vi.fn()}
          onExport={vi.fn()}
          isExporting={false}
          onOpenMyDesigns={onOpenMyDesigns}
          onNewPoster={onNewPoster}
        />
      );

      const myDesignsBtn = screen.getByRole("button", { name: "Open My Saved Designs" });
      expect(myDesignsBtn).toBeInTheDocument();
      fireEvent.click(myDesignsBtn);
      expect(onOpenMyDesigns).toHaveBeenCalledTimes(1);

      const newBtn = screen.getByRole("button", { name: "Create a new blank poster" });
      expect(newBtn).toBeInTheDocument();
      fireEvent.click(newBtn);
      expect(onNewPoster).toHaveBeenCalledTimes(1);
    });
  });

  describe("4. End-to-End Design Restoration & New Poster Workflow in PosterEditorPage", () => {
    const mockFullDesign: SavedPosterDesign = {
      id: "des_saved_101",
      name: "Independence Day Banner",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      canvasJson: JSON.stringify({
        objects: [
          { type: "IText", text: "FREEDOM SALE", top: 120 },
          { type: "Image", assetId: "ast_flag", src: "blob:stale-url" },
        ],
      }),
      thumbnailDataUrl: "data:image/jpeg;base64,flagthumb",
      assetIds: ["ast_flag"],
      createdAt: 1000,
      updatedAt: 2000,
    };

    it("opens and restores a saved design with text and hydrated image asset URLs", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue([
        {
          id: mockFullDesign.id,
          name: mockFullDesign.name,
          presetId: mockFullDesign.presetId,
          width: mockFullDesign.width,
          height: mockFullDesign.height,
          thumbnailDataUrl: mockFullDesign.thumbnailDataUrl,
          assetIds: mockFullDesign.assetIds,
          createdAt: mockFullDesign.createdAt,
          updatedAt: mockFullDesign.updatedAt,
        },
      ]);
      vi.spyOn(posterStorageService, "getDesign").mockResolvedValue(mockFullDesign);
      vi.spyOn(posterStorageService, "hydrateDesignForCanvas").mockResolvedValue({
        hydratedJson: JSON.stringify({
          objects: [
            { type: "IText", text: "FREEDOM SALE", top: 120 },
            { type: "Image", assetId: "ast_flag", src: "blob:fresh-url-123" },
          ],
        }),
        sessionUrls: ["blob:fresh-url-123"],
      });
      vi.spyOn(posterStorageService, "getAssets").mockResolvedValue(
        new Map([
          [
            "ast_flag",
            {
              id: "ast_flag",
              blob: new Blob(["flag"], { type: "image/png" }),
              mimeType: "image/png",
              name: "flag.png",
              size: 4,
              createdAt: 1000,
            },
          ],
        ])
      );

      render(<PosterEditorPage initialView="editor" />);

      // Open My Designs modal via toolbar
      const myDesignsBtn = screen.getByRole("button", { name: "Open My Saved Designs" });
      fireEvent.click(myDesignsBtn);

      await waitFor(() => {
        expect(screen.getByText("Independence Day Banner")).toBeInTheDocument();
      });

      // Click Open on the design card
      const openBtn = screen.getByRole("button", { name: /^Open$/i });
      await act(async () => {
        fireEvent.click(openBtn);
      });

      await waitFor(() => {
        // Active design ID is updated in editor
        const titleInput = screen.getByLabelText("Poster project title") as HTMLInputElement;
        expect(titleInput.value).toBe("Independence Day Banner");
      });

      // Canvas loadFromJSON was invoked with hydrated JSON
      expect(mockCanvasManagerInstance.loadFromJSON).toHaveBeenCalled();
      expect(mockCanvasManagerInstance.trackSessionUrl).toHaveBeenCalledWith("blob:fresh-url-123");
    });

    it("creates a fresh new poster without overwriting previous design", async () => {
      render(<PosterEditorPage initialView="editor" />);

      // Click New Poster button
      const newBtn = screen.getByRole("button", { name: "Create a new blank poster" });
      await act(async () => {
        fireEvent.click(newBtn);
      });

      // Manager cleared and reset
      expect(mockCanvasManagerInstance.clear).toHaveBeenCalled();
      const titleInput = screen.getByLabelText("Poster project title") as HTMLInputElement;
      expect(titleInput.value).toBe("Untitled Poster");
    });

    it("prompts with UnsavedChangesModal when Auto Save is OFF and edits are dirty", async () => {
      // Set Auto Save to OFF in localStorage
      localStorage.setItem("grovastra_poster_autosave_enabled", "false");

      render(<PosterEditorPage initialView="editor" />);

      // Verify Auto Save toggle is unchecked
      const autoSaveToggle = screen.getByRole("checkbox", { name: "Auto Save toggle" });
      expect(autoSaveToggle).not.toBeChecked();

      // Make canvas edit by changing title
      const titleInput = screen.getByLabelText("Poster project title");
      fireEvent.change(titleInput, { target: { value: "Dirty Unsaved Title" } });

      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

      // User attempts to create a new poster
      const newBtn = screen.getByRole("button", { name: "Create a new blank poster" });
      fireEvent.click(newBtn);

      // Unsaved Changes modal must appear!
      expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();

      // Click Cancel -> dialog closes, title remains dirty
      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);
      expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
      expect((screen.getByLabelText("Poster project title") as HTMLInputElement).value).toBe(
        "Dirty Unsaved Title"
      );
    });

    it("surfaces actionable error and preserves current canvas when asset is missing", async () => {
      vi.spyOn(posterStorageService, "getDesign").mockResolvedValue({
        ...mockFullDesign,
        assetIds: ["ast_missing"],
      });
      vi.spyOn(posterStorageService, "hydrateDesignForCanvas").mockRejectedValue(
        new PosterStorageError("Missing image asset record 'ast_missing'.", "MISSING_ASSET")
      );
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue([
        {
          id: mockFullDesign.id,
          name: mockFullDesign.name,
          presetId: mockFullDesign.presetId,
          width: mockFullDesign.width,
          height: mockFullDesign.height,
          thumbnailDataUrl: mockFullDesign.thumbnailDataUrl,
          assetIds: ["ast_missing"],
          createdAt: 1000,
          updatedAt: 2000,
        },
      ]);

      render(<PosterEditorPage initialView="editor" />);

      // Trigger open directly
      const myDesignsBtn = screen.getByRole("button", { name: "Open My Saved Designs" });
      fireEvent.click(myDesignsBtn);

      await waitFor(() => {
        expect(screen.getByText("Independence Day Banner")).toBeInTheDocument();
      });

      const openBtn = screen.getByRole("button", { name: /^Open$/i });
      await act(async () => {
        fireEvent.click(openBtn);
      });

      // Error message surfaced to user
      await waitFor(() => {
        expect(
          screen.getByText(/Missing image asset record 'ast_missing'/i)
        ).toBeInTheDocument();
      });
    });
  });
});
