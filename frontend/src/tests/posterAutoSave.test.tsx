import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import { PosterToolbar } from "../components/poster/PosterToolbar";
import { PosterEditorPage } from "../pages/PosterEditorPage";
import { posterStorageService, PosterStorageError } from "../services/posterStorageService";
import { POSTER_PRESETS } from "../types/poster";

// Mock canvas manager for isolated editor-level testing in Happy-DOM
let mockCanvasManagerInstance: any = null;
vi.mock("../services/posterCanvasManager.js", () => {
  return {
    PosterCanvasManager: class MockPosterCanvasManager {
      setActiveTool = vi.fn();
      setZoom = vi.fn();
      addText = vi.fn();
      toJSON = vi.fn(() => JSON.stringify({ objects: [] }));
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

describe("Phase 3A, Step 2: Manual Save + Auto Save Tests", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    localStorage.clear();
    posterStorageService.closeDB();
  });

  afterEach(() => {
    posterStorageService.closeDB();
  });

  describe("1. PosterToolbar Component: Save Button, Auto Save Toggle & Status Badge", () => {
    it("renders Save button and triggers onSave callback", () => {
      const onSave = vi.fn();
      render(
        <PosterToolbar
          title="Diwali Promo"
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
          onSave={onSave}
          isSaving={false}
          saveStatus="saved"
        />
      );

      const saveBtn = screen.getByRole("button", { name: "Save poster design" });
      expect(saveBtn).toBeInTheDocument();
      expect(saveBtn).not.toBeDisabled();
      expect(screen.getByText("Save")).toBeInTheDocument();

      fireEvent.click(saveBtn);
      expect(onSave).toHaveBeenCalledTimes(1);
    });

    it("disables Save button and renders spinner when isSaving is true", () => {
      const onSave = vi.fn();
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
          onSave={onSave}
          isSaving={true}
          saveStatus="saving"
        />
      );

      const saveBtn = screen.getByRole("button", { name: "Save poster design" });
      expect(saveBtn).toBeDisabled();
      expect(screen.getByText("Saving...")).toBeInTheDocument();
    });

    it("renders accessible Auto Save toggle and triggers callback on change", () => {
      const onAutoSaveToggle = vi.fn();
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
          autoSaveEnabled={true}
          onAutoSaveToggle={onAutoSaveToggle}
        />
      );

      const toggle = screen.getByRole("checkbox", { name: "Auto Save toggle" });
      expect(toggle).toBeInTheDocument();
      expect(toggle).toBeChecked();

      fireEvent.click(toggle);
      expect(onAutoSaveToggle).toHaveBeenCalledWith(false);
    });

    it("renders distinct badges for 'saved', 'saving', 'unsaved', and 'error' states", () => {
      const { rerender } = render(
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
          saveStatus="saved"
        />
      );

      expect(screen.getByText("Saved")).toBeInTheDocument();

      rerender(
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
          saveStatus="saving"
        />
      );
      expect(screen.getByText("Saving…")).toBeInTheDocument();

      rerender(
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
          saveStatus="unsaved"
        />
      );
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

      rerender(
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
          saveStatus="error"
        />
      );
      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });
  });

  describe("2. PosterEditorPage Integration: Manual Save & Stable Design ID", () => {
    it("creates a stable design ID on first manual save and updates the same ID on subsequent saves", async () => {
      let savedDesignRecord: any = null;
      let saveCount = 0;

      vi.spyOn(posterStorageService, "saveDesign").mockImplementation(
        async (input, _assets) => {
          saveCount++;
          const id = input.id || "des_test_stable_123";
          savedDesignRecord = {
            id,
            name: input.name,
            presetId: input.presetId,
            width: input.width,
            height: input.height,
            canvasJson: input.canvasJson,
            thumbnailDataUrl: input.thumbnailDataUrl,
            assetIds: input.assetIds || [],
            createdAt: Date.now(),
            updatedAt: Date.now(),
          };
          return savedDesignRecord;
        }
      );

      render(<PosterEditorPage initialView="editor" />);

      // Verify no design is automatically saved on initial mount
      expect(posterStorageService.saveDesign).not.toHaveBeenCalled();

      // Click Manual Save button
      const saveBtn = screen.getByRole("button", { name: "Save poster design" });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(posterStorageService.saveDesign).toHaveBeenCalledTimes(1);
      expect(savedDesignRecord.id).toBe("des_test_stable_123");
      expect(screen.getByText("Saved")).toBeInTheDocument();

      // Click Manual Save again - must update the existing ID
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(posterStorageService.saveDesign).toHaveBeenCalledTimes(2);
      expect(saveCount).toBe(2);
      expect(savedDesignRecord.id).toBe("des_test_stable_123"); // ID remains stable
    });

    it("triggers save on Ctrl+S keyboard shortcut", async () => {
      vi.spyOn(posterStorageService, "saveDesign").mockResolvedValue({
        id: "des_ctrl_s",
        name: "Shortcut Saved",
        presetId: "whatsapp-post",
        width: 1080,
        height: 1080,
        canvasJson: "{}",
        assetIds: [],
        createdAt: Date.now(),
        updatedAt: Date.now(),
      });

      render(<PosterEditorPage initialView="editor" />);

      await act(async () => {
        fireEvent.keyDown(window, { key: "s", ctrlKey: true });
      });

      expect(posterStorageService.saveDesign).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });
  });

  describe("3. Auto Save Debounce, Preference Persistence & Toggle", () => {
    it("defaults Auto Save to ON and stores preference in localStorage when toggled", async () => {
      render(<PosterEditorPage initialView="editor" />);

      const toggle = screen.getByRole("checkbox", { name: "Auto Save toggle" });
      expect(toggle).toBeChecked();

      // Turn OFF
      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(toggle).not.toBeChecked();
      expect(localStorage.getItem("grovastra_poster_autosave_enabled")).toBe("false");

      // Turn back ON
      await act(async () => {
        fireEvent.click(toggle);
      });
      expect(toggle).toBeChecked();
      expect(localStorage.getItem("grovastra_poster_autosave_enabled")).toBe("true");
    });

    it("debounces rapid edits and triggers auto save approximately 1500ms after the last edit", async () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(posterStorageService, "saveDesign").mockResolvedValue({
          id: "des_debounced",
          name: "Debounce Test",
          presetId: "whatsapp-post",
          width: 1080,
          height: 1080,
          canvasJson: "{}",
          assetIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        render(<PosterEditorPage initialView="editor" />);

        const titleInput = screen.getByRole("textbox", { name: "Poster project title" });

        // Edit 1
        await act(async () => {
          fireEvent.change(titleInput, { target: { value: "Edit A" } });
        });
        expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

        // Fast forward 500ms (not yet 1500ms)
        await act(async () => {
          vi.advanceTimersByTime(500);
        });
        expect(posterStorageService.saveDesign).not.toHaveBeenCalled();

        // Edit 2 (resets debounce timer)
        await act(async () => {
          fireEvent.change(titleInput, { target: { value: "Edit B" } });
        });

        // Fast forward 1000ms
        await act(async () => {
          vi.advanceTimersByTime(1000);
        });
        expect(posterStorageService.saveDesign).not.toHaveBeenCalled();

        // Fast forward remaining 600ms (1600ms from Edit 2)
        await act(async () => {
          vi.advanceTimersByTime(600);
        });

        expect(posterStorageService.saveDesign).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Saved")).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });

    it("stops auto saving edits when Auto Save is toggled OFF while manual save remains functional", async () => {
      vi.useFakeTimers();
      try {
        vi.spyOn(posterStorageService, "saveDesign").mockResolvedValue({
          id: "des_manual_only",
          name: "Manual Only",
          presetId: "whatsapp-post",
          width: 1080,
          height: 1080,
          canvasJson: "{}",
          assetIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

        render(<PosterEditorPage initialView="editor" />);

        // Turn Auto Save OFF
        const toggle = screen.getByRole("checkbox", { name: "Auto Save toggle" });
        await act(async () => {
          fireEvent.click(toggle);
        });

        const titleInput = screen.getByRole("textbox", { name: "Poster project title" });
        await act(async () => {
          fireEvent.change(titleInput, { target: { value: "Changed While Off" } });
        });

        expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

        // Advance timers significantly
        await act(async () => {
          vi.advanceTimersByTime(5000);
        });

        // Must NOT have auto-saved
        expect(posterStorageService.saveDesign).not.toHaveBeenCalled();
        expect(screen.getByText("Unsaved changes")).toBeInTheDocument();

        // Manual Save still works
        const saveBtn = screen.getByRole("button", { name: "Save poster design" });
        await act(async () => {
          fireEvent.click(saveBtn);
        });

        expect(posterStorageService.saveDesign).toHaveBeenCalledTimes(1);
        expect(screen.getByText("Saved")).toBeInTheDocument();
      } finally {
        vi.useRealTimers();
      }
    });
  });

  describe("4. In-Flight Edits & Error Handling", () => {
    it("handles edits occurring during an in-flight save without losing the latest state", async () => {
      let resolveFirstSave: (val: any) => void;
      const firstSavePromise = new Promise((resolve) => {
        resolveFirstSave = resolve;
      });

      const saveSpy = vi
        .spyOn(posterStorageService, "saveDesign")
        .mockImplementationOnce(() => firstSavePromise as any)
        .mockResolvedValueOnce({
          id: "des_inflight_test",
          name: "Second Version",
          presetId: "whatsapp-post",
          width: 1080,
          height: 1080,
          canvasJson: "{}",
          assetIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

      render(<PosterEditorPage initialView="editor" />);

      const saveBtn = screen.getByRole("button", { name: "Save poster design" });

      // Start first save
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Saving…")).toBeInTheDocument();

      // While saving is in progress, user makes an edit
      const titleInput = screen.getByRole("textbox", { name: "Poster project title" });
      await act(async () => {
        fireEvent.change(titleInput, { target: { value: "Second Version" } });
      });

      // Complete first save
      await act(async () => {
        resolveFirstSave!({
          id: "des_inflight_test",
          name: "First Version",
          presetId: "whatsapp-post",
          width: 1080,
          height: 1080,
          canvasJson: {},
          assetIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });
      });

      // Because an edit occurred in-flight, it should immediately be marked unsaved or scheduled
      expect(screen.getByText("Unsaved changes")).toBeInTheDocument();
    });

    it("surfaces storage errors, displays 'Save failed', and enables retry", async () => {
      const saveSpy = vi
        .spyOn(posterStorageService, "saveDesign")
        .mockRejectedValueOnce(
          new PosterStorageError("Storage quota exceeded.", "QuotaExceededError")
        )
        .mockResolvedValueOnce({
          id: "des_retry_ok",
          name: "Retry OK",
          presetId: "whatsapp-post",
          width: 1080,
          height: 1080,
          canvasJson: "{}",
          assetIds: [],
          createdAt: Date.now(),
          updatedAt: Date.now(),
        });

      render(<PosterEditorPage initialView="editor" />);

      const saveBtn = screen.getByRole("button", { name: "Save poster design" });

      // First click: fails
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(saveSpy).toHaveBeenCalledTimes(1);
      expect(screen.getByText("Save failed")).toBeInTheDocument();

      // Second click: retry succeeds
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(saveSpy).toHaveBeenCalledTimes(2);
      expect(screen.getByText("Saved")).toBeInTheDocument();
    });

    it("refuses to save when canvas contains image layers with missing binary Blobs", async () => {
      // Simulate an image layer on canvas with missing blob
      if (mockCanvasManagerInstance) {
        mockCanvasManagerInstance.fabricCanvas.getObjects.mockReturnValue([
          { type: "Image", assetId: "ast_corrupted_blob", name: "Corrupted Image" },
        ]);
        mockCanvasManagerInstance.getRegisteredAssets.mockReturnValue(new Map());
      }
      vi.spyOn(posterStorageService, "getAsset").mockResolvedValue(null);

      render(<PosterEditorPage initialView="editor" />);

      const saveBtn = screen.getByRole("button", { name: "Save poster design" });
      await act(async () => {
        fireEvent.click(saveBtn);
      });

      expect(screen.getByText("Save failed")).toBeInTheDocument();
    });
  });
});
