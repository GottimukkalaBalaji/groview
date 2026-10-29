import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, waitFor, act } from "@testing-library/react";
import { PosterGalleryView } from "../components/poster/PosterGalleryView";
import { PosterEditorPage } from "../pages/PosterEditorPage";
import { posterStorageService, PosterStorageError } from "../services/posterStorageService";
import { SavedPosterDesignSummary, SavedPosterDesign } from "../types/poster";

// Mock canvas manager for isolated integration testing in Happy-DOM
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

describe("Phase 3B: Gallery-First Landing Screen Integration Tests", () => {
  const mockDesigns: SavedPosterDesignSummary[] = [
    {
      id: "des_recent",
      name: "Weekend Mega Sale",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      thumbnailDataUrl: "data:image/jpeg;base64,thumb_recent",
      assetIds: ["ast_sale"],
      createdAt: 1000,
      updatedAt: 5000, // newest
    },
    {
      id: "des_older",
      name: "Daily Motivation Story",
      presetId: "whatsapp-status",
      width: 1080,
      height: 1920,
      thumbnailDataUrl: "data:image/jpeg;base64,thumb_status",
      assetIds: [],
      createdAt: 500,
      updatedAt: 2000, // older
    },
  ];

  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    posterStorageService.closeDB();
  });

  afterEach(() => {
    posterStorageService.closeDB();
  });

  describe("1. Gallery-First Landing & Initial State", () => {
    it("opens Poster Studio in gallery-first mode by default without opening default editor", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);

      render(<PosterEditorPage />);

      // The My Posters gallery header is displayed
      expect(screen.getByRole("heading", { name: "My Posters", level: 1 })).toBeInTheDocument();
      expect(
        screen.getByText("Reopen and edit your saved designs or create a new marketing flyer.")
      ).toBeInTheDocument();

      // Primary + Create New Poster action is available in the gallery header
      expect(screen.getByRole("button", { name: "Create New Poster" })).toBeInTheDocument();

      // Designs are listed from storage
      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
        expect(screen.getByText("Daily Motivation Story")).toBeInTheDocument();
      });
    });

    it("displays designs sorted newest first and renders thumbnails, presets, dimensions, and relative time", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);

      render(<PosterEditorPage />);

      await waitFor(() => {
        const items = screen.getAllByRole("listitem");
        expect(items).toHaveLength(2);
        // First item should be the newest: Weekend Mega Sale
        expect(items[0]).toHaveTextContent("Weekend Mega Sale");
        expect(items[0]).toHaveTextContent("WhatsApp Post");
        expect(items[0]).toHaveTextContent("1080 × 1080 px");

        // Second item should be: Daily Motivation Story
        expect(items[1]).toHaveTextContent("Daily Motivation Story");
        expect(items[1]).toHaveTextContent("WhatsApp Status");
        expect(items[1]).toHaveTextContent("1080 × 1920 px");
      });
    });
  });

  describe("2. Search & Preset Filtering in Gallery", () => {
    it("filters saved posters dynamically by search title", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);

      render(<PosterGalleryView onOpenDesign={vi.fn()} onNewPoster={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText("Search saved designs");
      fireEvent.change(searchInput, { target: { value: "Motivation" } });

      expect(screen.queryByText("Weekend Mega Sale")).not.toBeInTheDocument();
      expect(screen.getByText("Daily Motivation Story")).toBeInTheDocument();

      // Clear search button
      const clearBtn = screen.getByLabelText("Clear search");
      fireEvent.click(clearBtn);

      expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      expect(screen.getByText("Daily Motivation Story")).toBeInTheDocument();
    });

    it("filters saved posters by preset pills: All, WhatsApp Post (1:1), and WhatsApp Status (9:16)", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);

      render(<PosterGalleryView onOpenDesign={vi.fn()} onNewPoster={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });

      // Filter to WhatsApp Status only
      const statusPill = screen.getByRole("tab", { name: "WhatsApp Status (9:16)" });
      fireEvent.click(statusPill);

      expect(screen.queryByText("Weekend Mega Sale")).not.toBeInTheDocument();
      expect(screen.getByText("Daily Motivation Story")).toBeInTheDocument();

      // Filter to WhatsApp Post only
      const postPill = screen.getByRole("tab", { name: "WhatsApp Post (1:1)" });
      fireEvent.click(postPill);

      expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      expect(screen.queryByText("Daily Motivation Story")).not.toBeInTheDocument();

      // Reset to All
      const allPill = screen.getByRole("tab", { name: "All" });
      fireEvent.click(allPill);

      expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      expect(screen.getByText("Daily Motivation Story")).toBeInTheDocument();
    });

    it("renders empty filter state when no posters match search query", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);

      render(<PosterGalleryView onOpenDesign={vi.fn()} onNewPoster={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });

      const searchInput = screen.getByLabelText("Search saved designs");
      fireEvent.change(searchInput, { target: { value: "Nonexistent Design" } });

      expect(screen.getByText("No matching designs")).toBeInTheDocument();

      const resetBtn = screen.getByRole("button", { name: "Reset Filters" });
      fireEvent.click(resetBtn);

      expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
    });
  });

  describe("3. Opening a Saved Poster to Edit", () => {
    const mockFullDesign: SavedPosterDesign = {
      id: "des_recent",
      name: "Weekend Mega Sale",
      presetId: "whatsapp-post",
      width: 1080,
      height: 1080,
      canvasJson: JSON.stringify({
        objects: [{ type: "IText", text: "WEEKEND SALE", top: 120 }],
      }),
      thumbnailDataUrl: "data:image/jpeg;base64,thumb_recent",
      assetIds: ["ast_sale"],
      createdAt: 1000,
      updatedAt: 5000,
    };

    it("clicking a saved poster card opens it in the editor and preserves active design ID", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);
      vi.spyOn(posterStorageService, "getDesign").mockResolvedValue(mockFullDesign);
      vi.spyOn(posterStorageService, "hydrateDesignForCanvas").mockResolvedValue({
        hydratedJson: mockFullDesign.canvasJson,
        sessionUrls: ["blob:hydrated-sale-url"],
      });
      vi.spyOn(posterStorageService, "getAssets").mockResolvedValue(
        new Map([
          [
            "ast_sale",
            {
              id: "ast_sale",
              blob: new Blob(["sale"], { type: "image/png" }),
              mimeType: "image/png",
              name: "sale.png",
              size: 4,
              createdAt: 1000,
            },
          ],
        ])
      );

      render(<PosterEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });

      // Click "Open" button on the card
      const openBtn = screen.getAllByRole("button", { name: /^Open$/i })[0];
      await act(async () => {
        fireEvent.click(openBtn);
      });

      await waitFor(() => {
        // Now inside editor mode!
        const titleInput = screen.getByLabelText("Poster project title") as HTMLInputElement;
        expect(titleInput.value).toBe("Weekend Mega Sale");
      });

      // Back to gallery button is now visible in the editor toolbar
      expect(screen.getByRole("button", { name: "Back to My Posters" })).toBeInTheDocument();

      // Canvas loadFromJSON was invoked with the restored JSON
      expect(mockCanvasManagerInstance.loadFromJSON).toHaveBeenCalled();
      expect(mockCanvasManagerInstance.trackSessionUrl).toHaveBeenCalledWith("blob:hydrated-sale-url");
    });
  });

  describe("4. Create New Poster Flow", () => {
    it("opens fresh editor without modifying or overwriting previously saved designs", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);
      const saveSpy = vi.spyOn(posterStorageService, "saveDesign");

      render(<PosterEditorPage />);

      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });

      // Click "Create New Poster" from the gallery header
      const newPosterBtn = screen.getByRole("button", { name: "Create New Poster" });
      await act(async () => {
        fireEvent.click(newPosterBtn);
      });

      // Editor opens with fresh Untitled Poster
      const titleInput = screen.getByLabelText("Poster project title") as HTMLInputElement;
      expect(titleInput.value).toBe("Untitled Poster");

      // Verify canvas was reset cleanly
      expect(mockCanvasManagerInstance.clear).toHaveBeenCalled();
      expect(mockCanvasManagerInstance.setLogicalDimensions).toHaveBeenCalledWith(1080, 1080);

      // Verify no storage write occurred merely by opening a new poster
      expect(saveSpy).not.toHaveBeenCalled();
    });
  });

  describe("5. Navigation Back to Gallery & Unsaved Changes Protection", () => {
    it("returns directly to gallery when editor has no unsaved changes", async () => {
      render(<PosterEditorPage initialView="editor" />);

      // In editor mode initially
      const backBtn = screen.getByRole("button", { name: "Back to My Posters" });
      expect(backBtn).toBeInTheDocument();

      await act(async () => {
        fireEvent.click(backBtn);
      });

      // Now back in gallery mode!
      expect(screen.getByRole("heading", { name: "My Posters", level: 1 })).toBeInTheDocument();
    });

    it("flushes pending changes before returning to gallery when Auto Save is ON", async () => {
      const saveSpy = vi.spyOn(posterStorageService, "saveDesign").mockResolvedValue({
        id: "des_saved_auto",
        name: "Auto Saved Poster",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: "{}",
        assetIds: [],
        createdAt: 1000,
        updatedAt: 2000,
      });

      render(<PosterEditorPage initialView="editor" />);

      // Make a dirty edit
      const titleInput = screen.getByLabelText("Poster project title");
      fireEvent.change(titleInput, { target: { value: "Auto Saved Poster" } });

      // Click "Back to My Posters"
      const backBtn = screen.getByRole("button", { name: "Back to My Posters" });
      await act(async () => {
        fireEvent.click(backBtn);
      });

      // Verified save was executed before navigating
      expect(saveSpy).toHaveBeenCalledTimes(1);

      // Successfully transitioned to gallery
      await waitFor(() => {
        expect(screen.getByRole("heading", { name: "My Posters", level: 1 })).toBeInTheDocument();
      });
    });

    it("prompts with UnsavedChangesModal when Auto Save is OFF and edits are dirty", async () => {
      localStorage.setItem("grovastra_poster_autosave_enabled", "false");

      render(<PosterEditorPage initialView="editor" />);

      // Make a dirty edit
      const titleInput = screen.getByLabelText("Poster project title");
      fireEvent.change(titleInput, { target: { value: "Unsaved Work" } });

      // Click "Back to My Posters"
      const backBtn = screen.getByRole("button", { name: "Back to My Posters" });
      fireEvent.click(backBtn);

      // Unsaved Changes modal appears
      expect(screen.getByText("Unsaved Changes")).toBeInTheDocument();

      // 1. Test Cancel: stays in editor
      const cancelBtn = screen.getByRole("button", { name: "Cancel" });
      fireEvent.click(cancelBtn);

      expect(screen.queryByText("Unsaved Changes")).not.toBeInTheDocument();
      expect(screen.getByLabelText("Poster project title")).toBeInTheDocument();

      // 2. Test Discard: transitions to gallery without saving
      fireEvent.click(backBtn);
      const discardBtn = screen.getByRole("button", { name: "Discard Changes" });
      await act(async () => {
        fireEvent.click(discardBtn);
      });

      expect(screen.getByRole("heading", { name: "My Posters", level: 1 })).toBeInTheDocument();
    });
  });

  describe("6. Gallery Inline Actions: Rename, Duplicate, Delete", () => {
    it("allows inline renaming with validation", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);
      const renameSpy = vi.spyOn(posterStorageService, "renameDesign").mockResolvedValue({
        ...mockDesigns[0],
        name: "Renamed Title",
        canvasJson: "{}",
      });

      render(<PosterGalleryView onOpenDesign={vi.fn()} onNewPoster={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });

      // Click Rename icon on card
      const renameBtn = screen.getByLabelText("Rename Weekend Mega Sale");
      fireEvent.click(renameBtn);

      const renameInput = screen.getByLabelText("New poster name");
      fireEvent.change(renameInput, { target: { value: "Renamed Title" } });

      const confirmBtn = screen.getByTitle("Save name");
      await act(async () => {
        fireEvent.click(confirmBtn);
      });

      expect(renameSpy).toHaveBeenCalledWith("des_recent", "Renamed Title");
    });

    it("duplicates a design on duplicate button click", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);
      const dupSpy = vi.spyOn(posterStorageService, "duplicateDesign").mockResolvedValue({
        id: "des_copy_1",
        name: "Weekend Mega Sale (Copy)",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: "{}",
        assetIds: ["ast_sale"],
        createdAt: 6000,
        updatedAt: 6000,
      });

      render(<PosterGalleryView onOpenDesign={vi.fn()} onNewPoster={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });

      const duplicateBtn = screen.getByLabelText("Duplicate Weekend Mega Sale");
      await act(async () => {
        fireEvent.click(duplicateBtn);
      });

      expect(dupSpy).toHaveBeenCalledWith("des_recent");
    });

    it("prompts for delete confirmation and deletes design with orphan cleanup", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue(mockDesigns);
      const deleteSpy = vi.spyOn(posterStorageService, "deleteDesign").mockResolvedValue(true);

      render(<PosterGalleryView onOpenDesign={vi.fn()} onNewPoster={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });

      const deleteBtn = screen.getByLabelText("Delete Weekend Mega Sale");
      fireEvent.click(deleteBtn);

      // Confirmation dialog opens
      expect(screen.getByRole("alertdialog")).toBeInTheDocument();
      expect(screen.getByText("Delete Poster?")).toBeInTheDocument();

      const confirmDeleteBtn = screen.getByRole("button", { name: "Delete Permanently" });
      await act(async () => {
        fireEvent.click(confirmDeleteBtn);
      });

      expect(deleteSpy).toHaveBeenCalledWith("des_recent", { cleanupOrphans: true });
    });
  });

  describe("7. Empty, Loading, and Storage Error States", () => {
    it("renders empty state with 'Create New Poster' button when no designs exist", async () => {
      vi.spyOn(posterStorageService, "listDesigns").mockResolvedValue([]);
      const onNewMock = vi.fn();

      render(<PosterGalleryView onOpenDesign={vi.fn()} onNewPoster={onNewMock} />);

      await waitFor(() => {
        expect(screen.getByText("No Saved Posters Yet")).toBeInTheDocument();
      });

      // Both the header action and the empty state card feature Create New Poster buttons
      const ctaBtns = screen.getAllByRole("button", { name: "Create New Poster" });
      expect(ctaBtns.length).toBeGreaterThanOrEqual(2);
      // Click the empty state call-to-action button
      fireEvent.click(ctaBtns[1]);
      expect(onNewMock).toHaveBeenCalledTimes(1);
    });

    it("surfaces storage error and provides functional Retry button", async () => {
      const listSpy = vi
        .spyOn(posterStorageService, "listDesigns")
        .mockRejectedValueOnce(new PosterStorageError("IndexedDB read failure", "READ_FAILED"))
        .mockResolvedValueOnce(mockDesigns);

      render(<PosterGalleryView onOpenDesign={vi.fn()} onNewPoster={vi.fn()} />);

      await waitFor(() => {
        expect(screen.getByText("Storage Error")).toBeInTheDocument();
        expect(screen.getByText("IndexedDB read failure")).toBeInTheDocument();
      });

      const retryBtn = screen.getByRole("button", { name: "Retry" });
      await act(async () => {
        fireEvent.click(retryBtn);
      });

      expect(listSpy).toHaveBeenCalledTimes(2);
      await waitFor(() => {
        expect(screen.getByText("Weekend Mega Sale")).toBeInTheDocument();
      });
    });
  });
});
