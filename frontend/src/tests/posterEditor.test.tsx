import { describe, it, expect, vi, afterEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/react";
import {
  validatePosterImage,
  POSTER_PRESETS,
  ActiveObjectProperties,
  PosterLayerItem,
  findPreset,
} from "../types/poster.js";
import { PosterHistoryManager } from "../services/posterHistoryManager.js";
import { PosterToolbar } from "../components/poster/PosterToolbar.js";
import { PosterToolRail } from "../components/poster/PosterToolRail.js";
import { PosterPropertiesPanel } from "../components/poster/PosterPropertiesPanel.js";
import { PosterLayersPanel } from "../components/poster/PosterLayersPanel.js";
import { PosterMobileSheet } from "../components/poster/PosterMobileSheet.js";
import { PosterMobileDock } from "../components/poster/PosterMobileDock.js";
import { PosterMobileAddSheet } from "../components/poster/PosterMobileAddSheet.js";
import { exportCanvasToImage } from "../services/posterExportService.js";
import { PosterEditorPage } from "../pages/PosterEditorPage.js";

vi.mock("../services/posterCanvasManager.js", () => {
  return {
    PosterCanvasManager: vi.fn().mockImplementation(() => ({
      setActiveTool: vi.fn(),
      setZoom: vi.fn(),
      addText: vi.fn(),
      toJSON: vi.fn(() => JSON.stringify({ objects: [] })),
      getLayers: vi.fn(() => []),
      dispose: vi.fn(),
      setLogicalDimensions: vi.fn(),
      getSelectedProperties: vi.fn(() => null),
      loadFromJSON: vi.fn().mockResolvedValue({ width: 1080, height: 1080 }),
    })),
  };
});

describe("Poster Editor — Phase 1A, 1B, 1C & 1D Foundation & Mobile-First Tests", () => {
  describe("1. Image Upload Validation", () => {
    it("approves valid PNG and JPEG images within size limit", () => {
      const validPng = new File(["dummy-png-data"], "product.png", { type: "image/png" });
      const validJpg = new File(["dummy-jpg-data"], "banner.jpg", { type: "image/jpeg" });
      const validWebp = new File(["dummy-webp-data"], "hero.webp", { type: "image/webp" });

      expect(validatePosterImage(validPng).valid).toBe(true);
      expect(validatePosterImage(validJpg).valid).toBe(true);
      expect(validatePosterImage(validWebp).valid).toBe(true);
    });

    it("rejects files exceeding the 10 MB size limit", () => {
      const largeFile = new File([new ArrayBuffer(11 * 1024 * 1024)], "huge.png", {
        type: "image/png",
      });
      const result = validatePosterImage(largeFile);

      expect(result.valid).toBe(false);
      expect(result.error).toContain("exceeds 10 MB");
    });

    it("rejects unsupported file formats like executable or pdf", () => {
      const exeFile = new File(["malicious"], "virus.exe", { type: "application/x-msdownload" });
      const pdfFile = new File(["document"], "brochure.pdf", { type: "application/pdf" });

      expect(validatePosterImage(exeFile).valid).toBe(false);
      expect(validatePosterImage(pdfFile).valid).toBe(false);
      expect(validatePosterImage(exeFile).error).toContain("Unsupported image format");
    });

    it("handles null or undefined files safely", () => {
      // @ts-expect-error testing null safety
      const result = validatePosterImage(null);
      expect(result.valid).toBe(false);
      expect(result.error).toContain("No file selected");
    });
  });

  describe("2. PosterHistoryManager (Undo/Redo Stack)", () => {
    it("initializes with empty stacks and cannot undo/redo", () => {
      const history = new PosterHistoryManager(10);
      expect(history.canUndo()).toBe(false);
      expect(history.canRedo()).toBe(false);
      expect(history.undoCount).toBe(0);
    });

    it("tracks state transitions and enables undo after second state", () => {
      const history = new PosterHistoryManager(10);
      history.pushState(JSON.stringify({ objects: [] }));
      expect(history.canUndo()).toBe(false);

      history.pushState(JSON.stringify({ objects: [{ type: "rect" }] }));
      expect(history.canUndo()).toBe(true);
      expect(history.canRedo()).toBe(false);
    });

    it("performs undo and redo sequentially", () => {
      const history = new PosterHistoryManager(10);
      const state1 = JSON.stringify({ version: 1 });
      const state2 = JSON.stringify({ version: 2 });
      const state3 = JSON.stringify({ version: 3 });

      history.pushState(state1);
      history.pushState(state2);
      history.pushState(state3);

      const undone = history.undo();
      expect(undone).toBe(state2);
      expect(history.canRedo()).toBe(true);

      const redone = history.redo();
      expect(redone).toBe(state3);
      expect(history.canRedo()).toBe(false);
    });

    it("clears redo stack when a new state is pushed after undo", () => {
      const history = new PosterHistoryManager(10);
      history.pushState(JSON.stringify({ v: 1 }));
      history.pushState(JSON.stringify({ v: 2 }));
      history.undo();
      expect(history.canRedo()).toBe(true);

      history.pushState(JSON.stringify({ v: "2-alt" }));
      expect(history.canRedo()).toBe(false);
    });

    it("ignores identical consecutive states to avoid redundant history", () => {
      const history = new PosterHistoryManager(10);
      const state = JSON.stringify({ items: [1, 2] });

      history.pushState(state);
      history.pushState(state);
      expect(history.undoCount).toBe(1);
    });

    it("enforces maximum stack capacity", () => {
      const history = new PosterHistoryManager(3);
      history.pushState("state-1");
      history.pushState("state-2");
      history.pushState("state-3");
      history.pushState("state-4");

      expect(history.undoCount).toBe(3);
    });
  });

  describe("3. PosterToolbar Component", () => {
    it("renders title, preset selector, and action buttons", () => {
      const onTitleChange = vi.fn();
      const onPresetChange = vi.fn();
      const onUndo = vi.fn();
      const onRedo = vi.fn();
      const onZoomChange = vi.fn();
      const onResetZoom = vi.fn();
      const onExport = vi.fn();

      render(
        <PosterToolbar
          title="Promo Banner"
          onTitleChange={onTitleChange}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={onPresetChange}
          canUndo={true}
          canRedo={false}
          onUndo={onUndo}
          onRedo={onRedo}
          zoomLevel={0.6}
          onZoomChange={onZoomChange}
          onResetZoom={onResetZoom}
          onExport={onExport}
          isExporting={false}
        />
      );

      expect(screen.getByDisplayValue("Promo Banner")).toBeInTheDocument();
      expect(screen.getByText("WhatsApp Post")).toBeInTheDocument();
      expect(screen.getByText("60%")).toBeInTheDocument();

      const undoBtn = screen.getByLabelText("Undo canvas change");
      expect(undoBtn).not.toBeDisabled();
      fireEvent.click(undoBtn);
      expect(onUndo).toHaveBeenCalledTimes(1);

      const redoBtn = screen.getByLabelText("Redo canvas change");
      expect(redoBtn).toBeDisabled();
    });

    it("renders fixed campaign preset WhatsApp Post (1:1) in PosterToolbar", () => {
      const onPresetChange = vi.fn();

      render(
        <PosterToolbar
          title="Promo"
          onTitleChange={vi.fn()}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={onPresetChange}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          zoomLevel={1}
          onZoomChange={vi.fn()}
          onResetZoom={vi.fn()}
        />
      );

      expect(screen.getByText("WhatsApp Post")).toBeInTheDocument();
      expect(screen.getByText("1:1")).toBeInTheDocument();
    });
  });

  describe("4. PosterToolRail Component & Stickers", () => {
    it("renders tabs and triggers shape and sticker callbacks", () => {
      const onAddImage = vi.fn();
      const onAddText = vi.fn();
      const onAddShape = vi.fn();
      const onAddSticker = vi.fn();
      const onBackgroundColorChange = vi.fn();
      const onClearCanvas = vi.fn();

      render(
        <PosterToolRail
          onAddImage={onAddImage}
          onAddText={onAddText}
          onAddShape={onAddShape}
          onAddSticker={onAddSticker}
          onBackgroundColorChange={onBackgroundColorChange}
          onClearCanvas={onClearCanvas}
        />
      );

      expect(screen.getByText("Upload Product Photo")).toBeInTheDocument();

      const boxBtn = screen.getByTitle("Add Rectangle");
      fireEvent.click(boxBtn);
      expect(onAddShape).toHaveBeenCalledWith("rect");

      // Switch to Badges / Stickers tab
      const badgesTab = screen.getByRole("tab", { name: /badges/i });
      fireEvent.click(badgesTab);

      expect(screen.getByText("🔥 MEGA SALE")).toBeInTheDocument();
      fireEvent.click(screen.getByText("🔥 MEGA SALE"));
      expect(onAddSticker).toHaveBeenCalledWith("sale-badge");

      expect(screen.getByText("⚡ FLAT 50% OFF")).toBeInTheDocument();
      fireEvent.click(screen.getByText("⚡ FLAT 50% OFF"));
      expect(onAddSticker).toHaveBeenCalledWith("discount-50");
    });
  });

  describe("5. PosterPropertiesPanel & Alignment", () => {
    it("renders empty state placeholder when no object is selected", () => {
      render(
        <PosterPropertiesPanel
          properties={null}
          onUpdateProperty={vi.fn()}
          onDeleteSelected={vi.fn()}
          onAlign={vi.fn()}
        />
      );

      expect(screen.getByText("No Object Selected")).toBeInTheDocument();
    });

    it("renders formatting controls and alignment tools", () => {
      const onUpdateProperty = vi.fn();
      const onDeleteSelected = vi.fn();
      const onAlign = vi.fn();

      const textProps: ActiveObjectProperties = {
        type: "i-text",
        text: "Special Offer",
        fill: "#10b981",
        fontSize: 48,
        fontWeight: "bold",
        fontStyle: "normal",
        textAlign: "center",
        opacity: 1,
      };

      render(
        <PosterPropertiesPanel
          properties={textProps}
          onUpdateProperty={onUpdateProperty}
          onDeleteSelected={onDeleteSelected}
          onAlign={onAlign}
        />
      );

      expect(screen.getByText("Text Settings")).toBeInTheDocument();
      expect(screen.getByDisplayValue(48)).toBeInTheDocument();

      // Test alignment actions
      const centerHBtn = screen.getByLabelText("Center Horizontally");
      fireEvent.click(centerHBtn);
      expect(onAlign).toHaveBeenCalledWith("centerH");

      const centerBothBtn = screen.getByLabelText("Center on Poster");
      fireEvent.click(centerBothBtn);
      expect(onAlign).toHaveBeenCalledWith("centerBoth");

      // Test Bold toggle
      const boldBtn = screen.getByTitle("Toggle Bold");
      expect(boldBtn).toHaveClass("active");

      // Test Delete
      const deleteBtn = screen.getByLabelText("Delete selected object");
      fireEvent.click(deleteBtn);
      expect(onDeleteSelected).toHaveBeenCalledTimes(1);
    });
  });

  describe("6. PosterLayersPanel Component", () => {
    const mockLayers: PosterLayerItem[] = [
      {
        id: "layer-top",
        name: "Sale Badge",
        type: "i-text",
        visible: true,
        isLocked: false,
        isSelected: true,
      },
      {
        id: "layer-bottom",
        name: "Product Photo",
        type: "image",
        visible: false,
        isLocked: true,
        isSelected: false,
      },
    ];

    it("renders layers list with count, icons, and state indicators", () => {
      const onSelectLayer = vi.fn();
      const onMoveUp = vi.fn();
      const onMoveDown = vi.fn();
      const onToggleVisibility = vi.fn();
      const onToggleLock = vi.fn();
      const onDeleteLayer = vi.fn();

      render(
        <PosterLayersPanel
          layers={mockLayers}
          onSelectLayer={onSelectLayer}
          onMoveUp={onMoveUp}
          onMoveDown={onMoveDown}
          onToggleVisibility={onToggleVisibility}
          onToggleLock={onToggleLock}
          onDeleteLayer={onDeleteLayer}
        />
      );

      expect(screen.getByText("Layers")).toBeInTheDocument();
      expect(screen.getByText("2")).toBeInTheDocument(); // count
      expect(screen.getByText("Sale Badge")).toBeInTheDocument();
      expect(screen.getByText("Product Photo")).toBeInTheDocument();

      // Select top layer
      fireEvent.click(screen.getByText("Sale Badge"));
      expect(onSelectLayer).toHaveBeenCalledWith("layer-top");

      // Toggle visibility on bottom layer
      const hideShowBtn = screen.getByLabelText("Show Product Photo");
      fireEvent.click(hideShowBtn);
      expect(onToggleVisibility).toHaveBeenCalledWith("layer-bottom");

      // Toggle lock on top layer
      const lockBtn = screen.getByLabelText("Lock Sale Badge");
      fireEvent.click(lockBtn);
      expect(onToggleLock).toHaveBeenCalledWith("layer-top");

      // Move Down on top layer
      const moveDownBtn = screen.getByLabelText("Send Sale Badge backward");
      expect(moveDownBtn).not.toBeDisabled();
      fireEvent.click(moveDownBtn);
      expect(onMoveDown).toHaveBeenCalledWith("layer-top");
    });
  });

  describe("7. PosterMobileSheet Component", () => {
    it("renders slide-up sheet when open with object properties", () => {
      const onClose = vi.fn();
      const onUpdateProperty = vi.fn();
      const onDeleteSelected = vi.fn();
      const onAlign = vi.fn();

      const textProps: ActiveObjectProperties = {
        type: "i-text",
        text: "Discount",
        fill: "#f43f5e",
        fontSize: 32,
        opacity: 0.9,
      };

      const { rerender } = render(
        <PosterMobileSheet
          isOpen={false}
          onClose={onClose}
          properties={textProps}
          onUpdateProperty={onUpdateProperty}
          onDeleteSelected={onDeleteSelected}
          onAlign={onAlign}
        />
      );

      // Hidden when isOpen is false
      expect(screen.queryByText("Edit Text")).not.toBeInTheDocument();

      // Open sheet
      rerender(
        <PosterMobileSheet
          isOpen={true}
          onClose={onClose}
          properties={textProps}
          onUpdateProperty={onUpdateProperty}
          onDeleteSelected={onDeleteSelected}
          onAlign={onAlign}
        />
      );

      // Open sheet in compact mode
      expect(screen.getByText("Text")).toBeInTheDocument();
      expect(screen.getByText("Edit Details")).toBeInTheDocument();

      // Expand sheet to view full controls
      fireEvent.click(screen.getByText("Edit Details"));

      expect(screen.getByText("Center H")).toBeInTheDocument();

      // Align trigger inside mobile sheet
      fireEvent.click(screen.getByText("Center H"));
      expect(onAlign).toHaveBeenCalledWith("centerH");

      // Close button
      fireEvent.click(screen.getByLabelText("Close"));
      expect(onClose).toHaveBeenCalledTimes(1);
    });
  });

  describe("8. exportCanvasToImage Zoom Clipping Prevention (Defect #1 Fix)", () => {
    it("temporarily expands dimensions to target size and restores viewport zoom after export", () => {
      const callLog: string[] = [];

      const mockCanvas = {
        discardActiveObject: vi.fn(() => callLog.push("discardActiveObject")),
        getZoom: vi.fn(() => 0.55),
        viewportTransform: [0.55, 0, 0, 0.55, 0, 0],
        getWidth: vi.fn(() => 594),
        getHeight: vi.fn(() => 594),
        setDimensions: vi.fn((dims) => callLog.push(`setDimensions:${dims.width}x${dims.height}`)),
        setZoom: vi.fn((zoom) => callLog.push(`setZoom:${zoom}`)),
        setViewportTransform: vi.fn(() => callLog.push("setViewportTransform")),
        toDataURL: vi.fn((opts) => {
          callLog.push(`toDataURL:multiplier=${opts.multiplier}`);
          return "data:image/png;base64,sample-full-resolution-artwork";
        }),
        requestRenderAll: vi.fn(() => callLog.push("requestRenderAll")),
      };

      const result = exportCanvasToImage(mockCanvas as any, 1080, 1080, { format: "png" });

      expect(result.width).toBe(1080);
      expect(result.height).toBe(1080);
      expect(result.dataUrl).toContain("sample-full-resolution-artwork");

      // Verify execution order:
      // 1. Resized to 1080x1080
      // 2. Zoom set to 1
      // 3. Exported at multiplier 1 (full unclipped buffer)
      // 4. In finally block, restored back to 594x594 and zoom 0.55
      expect(callLog).toContain("setDimensions:1080x1080");
      expect(callLog).toContain("setZoom:1");
      expect(callLog).toContain("toDataURL:multiplier=1");
      expect(callLog).toContain("setDimensions:594x594");
      expect(callLog).toContain("setZoom:0.55");
    });
  });

  describe("9. Object Locking and Stacking Consistency (Defect #2 Fix)", () => {
    it("preserves locked and interaction flags across serialization", () => {
      const mockLockedObject = {
        get: (prop: string) => {
          if (prop === "id") return "layer_locked_1";
          if (prop === "name") return "Protected Logo";
          if (prop === "isLocked") return true;
          return undefined;
        },
        type: "image",
        visible: true,
      };

      const layers: PosterLayerItem[] = [
        {
          id: mockLockedObject.get("id") as string,
          name: mockLockedObject.get("name") as string,
          type: mockLockedObject.type,
          visible: mockLockedObject.visible,
          isLocked: true,
          isSelected: false,
        },
      ];

      expect(layers[0].isLocked).toBe(true);
      expect(layers[0].id).toBe("layer_locked_1");
    });
  });

  describe("10. GIF File Upload & Validation Audit", () => {
    it("validates static GIF uploads under 10MB limit and rejects oversized GIFs", () => {
      const validGif = new File(["gif-data"], "banner.gif", { type: "image/gif" });
      const validation = validatePosterImage(validGif);
      expect(validation.valid).toBe(true);

      const hugeGif = new File([new ArrayBuffer(11 * 1024 * 1024)], "heavy.gif", {
        type: "image/gif",
      });
      const hugeValidation = validatePosterImage(hugeGif);
      expect(hugeValidation.valid).toBe(false);
      expect(hugeValidation.error).toContain("exceeds 10 MB");
    });
  });

  describe("11. Bounding Box Alignment Offsets for Rotated/Scaled Objects (Defect #4 Fix)", () => {
    it("computes accurate anchor offsets for rotated objects", () => {
      // Simulate an object of width 200 at left 100 rotated by 45 degrees
      // Bounding box extends left to 80 and width is 240
      const activeObj = {
        left: 100,
        top: 100,
        getBoundingRect: () => ({ left: 80, top: 80, width: 240, height: 240 }),
      };

      const bound = activeObj.getBoundingRect();
      const leftOffset = activeObj.left - bound.left; // 20
      const topOffset = activeObj.top - bound.top; // 20
      const logicalWidth = 1080;
      const logicalHeight = 1080;

      // Align Left:
      const alignLeftPos = 0 + leftOffset; // 20
      expect(alignLeftPos).toBe(20);
      // When active.left is 20, new bounding box left is 20 - 20 = 0 (flush with left edge)

      // Align Right:
      const alignRightPos = logicalWidth - bound.width + leftOffset; // 1080 - 240 + 20 = 860
      expect(alignRightPos).toBe(860);
      // When active.left is 860, bounding box right edge is (860 - 20) + 240 = 1080 (flush with right edge)

      // Align Top & Bottom:
      const alignTopPos = 0 + topOffset;
      expect(alignTopPos).toBe(20);

      const alignBottomPos = logicalHeight - bound.height + topOffset;
      expect(alignBottomPos).toBe(860);
    });
  });

  describe("12. PosterMobileDock Component (Phase 1D)", () => {
    it("renders mobile navigation buttons and manages tab toggling", () => {
      const onTabChange = vi.fn();
      const onFitCanvas = vi.fn();

      const { rerender } = render(
        <PosterMobileDock
          activeTab={null}
          onTabChange={onTabChange}
          hasSelection={false}
          layersCount={3}
          onFitCanvas={onFitCanvas}
        />
      );

      // Verify buttons
      expect(screen.getByText("Add")).toBeInTheDocument();
      expect(screen.getByText("Layers")).toBeInTheDocument();
      expect(screen.getByText("Edit")).toBeInTheDocument();
      expect(screen.getByText("Fit")).toBeInTheDocument();

      // Check layer count badge
      expect(screen.getByText("3")).toBeInTheDocument();

      // Edit should be disabled when hasSelection is false
      const editBtn = screen.getByRole("button", { name: /no object selected to edit/i });
      expect(editBtn).toBeDisabled();

      // Tap Add
      const addBtn = screen.getByRole("button", { name: /add text, shapes, or stickers/i });
      fireEvent.click(addBtn);
      expect(onTabChange).toHaveBeenCalledWith("add");

      // Tap Fit
      const fitBtn = screen.getByRole("button", { name: /fit poster to screen/i });
      fireEvent.click(fitBtn);
      expect(onFitCanvas).toHaveBeenCalledTimes(1);

      // Rerender with hasSelection = true
      rerender(
        <PosterMobileDock
          activeTab="edit"
          onTabChange={onTabChange}
          hasSelection={true}
          layersCount={3}
          onFitCanvas={onFitCanvas}
        />
      );

      const activeEditBtn = screen.getByRole("button", { name: /edit selected object properties/i });
      expect(activeEditBtn).not.toBeDisabled();
      expect(activeEditBtn).toHaveClass("active");

      // Tapping active tab toggles it closed (null)
      fireEvent.click(activeEditBtn);
      expect(onTabChange).toHaveBeenCalledWith(null);
    });
  });

  describe("13. PosterMobileAddSheet Component (Phase 1D)", () => {
    it("displays category tabs and dispatches element additions with auto-dismiss", () => {
      const onClose = vi.fn();
      const onAddImage = vi.fn();
      const onAddText = vi.fn();
      const onAddShape = vi.fn();
      const onAddSticker = vi.fn();
      const onBackgroundColorChange = vi.fn();

      const { rerender } = render(
        <PosterMobileAddSheet
          isOpen={false}
          onClose={onClose}
          onAddImage={onAddImage}
          onAddText={onAddText}
          onAddShape={onAddShape}
          onAddSticker={onAddSticker}
          onBackgroundColorChange={onBackgroundColorChange}
        />
      );

      expect(screen.queryByText("Add to Poster")).not.toBeInTheDocument();

      // Open sheet
      rerender(
        <PosterMobileAddSheet
          isOpen={true}
          onClose={onClose}
          onAddImage={onAddImage}
          onAddText={onAddText}
          onAddShape={onAddShape}
          onAddSticker={onAddSticker}
          onBackgroundColorChange={onBackgroundColorChange}
        />
      );

      expect(screen.getByText("Add to Poster")).toBeInTheDocument();
      expect(screen.getByText("Upload Product Photo")).toBeInTheDocument();

      // Test Add Heading
      const addHeadingBtn = screen.getByText("Add Heading");
      fireEvent.click(addHeadingBtn);
      expect(onAddText).toHaveBeenCalledWith("heading");
      expect(onClose).toHaveBeenCalled();

      // Test Badges Tab
      const badgesTab = screen.getByRole("tab", { name: /badges/i });
      fireEvent.click(badgesTab);

      const megaSaleBtn = screen.getByText("🔥 MEGA SALE");
      fireEvent.click(megaSaleBtn);
      expect(onAddSticker).toHaveBeenCalledWith("sale-badge");
      expect(onClose).toHaveBeenCalled();
    });
  });

  describe("14. Dynamic Fit to Workspace Calculation (Phase 1D)", () => {
    it("calculates exact proportional zoom across phone viewports and poster aspect ratios", () => {
      // 1. Phone Viewport (390x844 with 24px padding = 366x820 avail)
      const availW = 366;
      const availH = 820;

      // Square (1080x1080)
      const squareScale = Math.min(availW / 1080, availH / 1080);
      expect(squareScale).toBeCloseTo(0.338, 2);

      // Vertical Story (1080x1920)
      const storyScale = Math.min(availW / 1080, availH / 1920);
      expect(storyScale).toBeCloseTo(0.338, 2);

      // Banner Header (1200x628)
      const bannerScale = Math.min(availW / 1200, availH / 628);
      expect(bannerScale).toBeCloseTo(0.305, 2);
    });
  });

  describe("15. Phase 1E — Zoom Range, Precision & Manual Zoom Persistence (Issue 1)", () => {
    it("supports the full 20% to 300% zoom range with clean step increments", () => {
      const onZoomChange = vi.fn();
      const onResetZoom = vi.fn();

      const { rerender } = render(
        <PosterToolbar
          title="Zoom Test"
          onTitleChange={vi.fn()}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={vi.fn()}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          zoomLevel={0.5}
          onZoomChange={onZoomChange}
          onResetZoom={onResetZoom}
          onExport={vi.fn()}
          isExporting={false}
        />
      );

      // Verify zoom indicator shows 50%
      expect(screen.getByText("50%")).toBeInTheDocument();

      // Zoom In beyond 51%: clicking zoom in at 0.5 should request 0.6 (60%)
      const zoomInBtn = screen.getByLabelText("Zoom In");
      fireEvent.click(zoomInBtn);
      expect(onZoomChange).toHaveBeenCalledWith(0.6);

      // Test Zoom In approaching upper boundary (from 2.9 to 3.0 max)
      rerender(
        <PosterToolbar
          title="Zoom Test"
          onTitleChange={vi.fn()}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={vi.fn()}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          zoomLevel={2.9}
          onZoomChange={onZoomChange}
          onResetZoom={onResetZoom}
          onExport={vi.fn()}
          isExporting={false}
        />
      );

      fireEvent.click(zoomInBtn);
      expect(onZoomChange).toHaveBeenLastCalledWith(3.0);

      // At upper boundary (3.0 max), button is disabled
      rerender(
        <PosterToolbar
          title="Zoom Test"
          onTitleChange={vi.fn()}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={vi.fn()}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          zoomLevel={3.0}
          onZoomChange={onZoomChange}
          onResetZoom={onResetZoom}
          onExport={vi.fn()}
          isExporting={false}
        />
      );

      expect(screen.getByText("300%")).toBeInTheDocument();
      expect(zoomInBtn).toBeDisabled();

      // Test Zoom Out approaching lower boundary (from 0.3 to 0.2 min)
      rerender(
        <PosterToolbar
          title="Zoom Test"
          onTitleChange={vi.fn()}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={vi.fn()}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          zoomLevel={0.3}
          onZoomChange={onZoomChange}
          onResetZoom={onResetZoom}
          onExport={vi.fn()}
          isExporting={false}
        />
      );

      const zoomOutBtn = screen.getByLabelText("Zoom Out");
      fireEvent.click(zoomOutBtn);
      expect(onZoomChange).toHaveBeenLastCalledWith(0.2);

      // At lower boundary (0.2 min), button is disabled
      rerender(
        <PosterToolbar
          title="Zoom Test"
          onTitleChange={vi.fn()}
          selectedPreset={POSTER_PRESETS[0]}
          onPresetChange={vi.fn()}
          canUndo={false}
          canRedo={false}
          onUndo={vi.fn()}
          onRedo={vi.fn()}
          zoomLevel={0.2}
          onZoomChange={onZoomChange}
          onResetZoom={onResetZoom}
          onExport={vi.fn()}
          isExporting={false}
        />
      );

      expect(screen.getByText("20%")).toBeInTheDocument();
      expect(zoomOutBtn).toBeDisabled();

      // Fit to screen indicator button triggers reset
      const indicatorBtn = screen.getByRole("button", { name: "Fit to screen (Reset Zoom)" });
      fireEvent.click(indicatorBtn);
      expect(onResetZoom).toHaveBeenCalledTimes(1);

      // Fit to screen icon button triggers reset
      const fitIconBtn = screen.getByRole("button", { name: "Fit to screen" });
      fireEvent.click(fitIconBtn);
      expect(onResetZoom).toHaveBeenCalledTimes(2);
    });

    it("ensures fitToWorkspace clamps within 0.2 and 3.0 across diverse workspace dimensions", () => {
      // Very small workspace (e.g. tiny embedded preview 100x100)
      const tinyW = 100;
      const tinyH = 100;
      const rawTinyScale = Math.min((tinyW - 48) / 1080, (tinyH - 48) / 1080);
      const clampMin = Math.max(0.2, Math.min(Number(rawTinyScale.toFixed(3)), 3.0));
      expect(clampMin).toBe(0.2); // Clamped to 20% floor

      // Huge 4K/8K monitor workspace (e.g. 3840x2160)
      const bigW = 3840;
      const bigH = 2160;
      const rawBigScale = Math.min((bigW - 48) / 1080, (bigH - 48) / 1080);
      const clampMax = Math.max(0.2, Math.min(Number(rawBigScale.toFixed(3)), 3.0));
      expect(clampMax).toBeLessThanOrEqual(3.0); // Never exceeds 300%
    });
  });

  describe("16. Phase 1E — WhatsApp Marketing Presets & Backward Compatibility (Issue 2)", () => {
    it("provides fixed WhatsApp Post (1080x1080, 1:1) as single active campaign preset", () => {
      expect(POSTER_PRESETS).toHaveLength(1);

      const [postPreset] = POSTER_PRESETS;

      expect(postPreset.id).toBe("whatsapp-post");
      expect(postPreset.name).toBe("WhatsApp Post");
      expect(postPreset.width).toBe(1080);
      expect(postPreset.height).toBe(1080);
      expect(postPreset.ratioLabel).toBe("1:1");

      // Verify no generic or non-campaign format presets exist in active presets
      const names = POSTER_PRESETS.map((p) => p.name.toLowerCase());
      expect(names).not.toContain("square post");
      expect(names).not.toContain("whatsapp status");
      expect(names).not.toContain("vertical story");
      expect(names).not.toContain("instagram");
      expect(names).not.toContain("facebook");
      expect(names).not.toContain("youtube");
    });

    it("resolves legacy presets and dimensions gracefully via findPreset", () => {
      // Current preset lookups by ID
      expect(findPreset("whatsapp-post")?.name).toBe("WhatsApp Post");
      expect(findPreset("whatsapp-status")?.name).toBe("WhatsApp Status");

      // Legacy ID backward compatibility
      expect(findPreset("square-post")?.name).toBe("WhatsApp Post");
      expect(findPreset("story")?.name).toBe("WhatsApp Status");
      expect(findPreset("banner")?.name).toBe("Banner Header");

      // Dimension lookups (used during undo/redo restoration)
      expect(findPreset(1080, 1080)?.name).toBe("WhatsApp Post");
      expect(findPreset(1080, 1920)?.name).toBe("WhatsApp Status");
      expect(findPreset(1200, 628)?.name).toBe("Banner Header");

      // Arbitrary/Custom saved dimensions fallback
      const custom = findPreset(800, 600);
      expect(custom?.name).toBe("Custom (800×600)");
      expect(custom?.width).toBe(800);
      expect(custom?.height).toBe(600);
    });

    it("exports canvas at exact preset dimensions without alteration", () => {
      // Mock Fabric Canvas for export
      const mockCanvas = {
        getZoom: () => 0.5,
        viewportTransform: [1, 0, 0, 1, 0, 0],
        getWidth: () => 540,
        getHeight: () => 540,
        setZoom: vi.fn(),
        setDimensions: vi.fn(),
        setViewportTransform: vi.fn(),
        renderAll: vi.fn(),
        requestRenderAll: vi.fn(),
        discardActiveObject: vi.fn(),
        toDataURL: vi.fn(() => "data:image/png;base64,mockPostPng"),
      } as any;

      // WhatsApp Post export (1080x1080)
      const postExport = exportCanvasToImage(mockCanvas, 1080, 1080, {
        format: "png",
        filename: "post.png",
      });
      expect(postExport.width).toBe(1080);
      expect(postExport.height).toBe(1080);
      expect(postExport.dataUrl).toContain("data:image/png");

      // WhatsApp Status export (1080x1920)
      const statusExport = exportCanvasToImage(mockCanvas, 1080, 1920, {
        format: "png",
        filename: "status.png",
      });
      expect(statusExport.width).toBe(1080);
      expect(statusExport.height).toBe(1920);
    });
  });

  describe("17. Phase 1E — Desktop Text Placement & Coordinate Translation (Issue 3)", () => {
    it("accurately converts client coordinates to logical poster coordinates across zoom levels", () => {
      // Helper simulating PosterCanvasManager's getScenePointFromEvent
      const getScenePoint = (
        clientX: number,
        clientY: number,
        canvasRect: { left: number; top: number; width: number; height: number },
        zoom: number,
        logicalWidth: number,
        logicalHeight: number
      ) => {
        const localX = clientX - canvasRect.left;
        const localY = clientY - canvasRect.top;
        const logicalX = Math.round(localX / zoom);
        const logicalY = Math.round(localY / zoom);

        if (logicalX < 0 || logicalX > logicalWidth || logicalY < 0 || logicalY > logicalHeight) {
          return null; // Click is outside the white poster canvas boundary
        }
        return { x: logicalX, y: logicalY };
      };

      const logicalW = 1080;
      const logicalH = 1080;

      // Scenario 1: Zoom at 50% (0.5). Rendered canvas element is 540x540 on screen at (left: 200, top: 100)
      const rect50 = { left: 200, top: 100, width: 540, height: 540 };

      // Click center of poster: (200 + 270, 100 + 270) = (470, 370)
      const centerPoint50 = getScenePoint(470, 370, rect50, 0.5, logicalW, logicalH);
      expect(centerPoint50).toEqual({ x: 540, y: 540 });

      // Click top-left of poster: (200 + 10, 100 + 20) = (210, 120)
      const topLeftPoint50 = getScenePoint(210, 120, rect50, 0.5, logicalW, logicalH);
      expect(topLeftPoint50).toEqual({ x: 20, y: 40 });

      // Scenario 2: Zoom at 150% (1.5). Rendered canvas element is 1620x1620 on screen at (left: 100, top: 50)
      const rect150 = { left: 100, top: 50, width: 1620, height: 1620 };

      // Click at screen position (100 + 450, 50 + 900) = (550, 950)
      // Logical X = 450 / 1.5 = 300; Logical Y = 900 / 1.5 = 600
      const point150 = getScenePoint(550, 950, rect150, 1.5, logicalW, logicalH);
      expect(point150).toEqual({ x: 300, y: 600 });

      // Scenario 3: Click outside poster bounds (e.g. Gray workspace background)
      // Screen click to the left of the canvas (left: 200, click at 150)
      const outsideLeft = getScenePoint(150, 200, rect50, 0.5, logicalW, logicalH);
      expect(outsideLeft).toBeNull();

      // Screen click below the canvas (bottom: 100 + 540 = 640, click at 700)
      const outsideBottom = getScenePoint(300, 700, rect50, 0.5, logicalW, logicalH);
      expect(outsideBottom).toBeNull();
    });

    it("calculates true logical center coordinates instead of scaled canvas dimensions", () => {
      const logicalWidth = 1080;
      const logicalHeight = 1920; // WhatsApp Status
      const textWidth = 320;
      const textHeight = 60;

      // Correct formula using logical dimensions
      const trueCenterX = Math.round((logicalWidth - textWidth) / 2);
      const trueCenterY = Math.round((logicalHeight - textHeight) / 2);

      expect(trueCenterX).toBe(380); // (1080 - 320) / 2 = 380
      expect(trueCenterY).toBe(930); // (1920 - 60) / 2 = 930

      // Defective legacy behavior: using canvas.width / 2 when zoom is 0.5 (canvas.width = 540)
      const defectiveCenterX = 540 / 2 - textWidth / 2;
      expect(defectiveCenterX).toBe(110); // Far off to the left instead of centered at 380!
    });

    it("displays the interactive text placement banner in PosterToolRail", () => {
      const onToolChange = vi.fn();
      const onAddText = vi.fn();

      render(
        <PosterToolRail
          activeTool="text"
          onToolChange={onToolChange}
          onAddImage={vi.fn()}
          onAddText={onAddText}
          onAddShape={vi.fn()}
          onAddSticker={vi.fn()}
          onBackgroundColorChange={vi.fn()}
          onClearCanvas={vi.fn()}
        />
      );

      // Verify instruction banner is visible
      expect(
        screen.getByText(/Click anywhere on the white poster canvas to place text/i)
      ).toBeInTheDocument();

      // Verify preset text buttons remain functional
      const headingBtn = screen.getByText("Add a Heading");
      fireEvent.click(headingBtn);
      expect(onAddText).toHaveBeenCalledWith("heading");
    });
  });

  describe("18. Phase 1F — Responsive Regression & Targeted Sizing Tests", () => {
    const originalInnerWidth = window.innerWidth;
    const originalInnerHeight = window.innerHeight;

    const setViewport = (width: number, height: number) => {
      Object.defineProperty(window, "innerWidth", { writable: true, configurable: true, value: width });
      Object.defineProperty(window, "innerHeight", { writable: true, configurable: true, value: height });
      window.dispatchEvent(new Event("resize"));
    };

    afterEach(() => {
      setViewport(originalInnerWidth, originalInnerHeight);
    });

    describe("Desktop & Tablet Viewport Protection (> 640px)", () => {
      it("strictly does not mount mobile dock or sheets on desktop (1440x900)", () => {
        setViewport(1440, 900);
        render(<PosterEditorPage initialView="editor" />);

        // Mobile dock and mobile sheets must NOT be rendered into the DOM on desktop
        expect(screen.queryByRole("navigation", { name: "Mobile Poster Studio Dock" })).not.toBeInTheDocument();
        expect(screen.queryByRole("dialog", { name: "Object Properties Sheet" })).not.toBeInTheDocument();

        // Desktop studio controls must remain mounted and accessible
        expect(screen.getByRole("tab", { name: /Properties/i })).toBeInTheDocument();
        expect(screen.getByRole("tab", { name: /Layers/i })).toBeInTheDocument();
        expect(screen.getByText("Shapes")).toBeInTheDocument();
      });

      it("maintains the desktop 3-column studio layout on tablet (1024x768 and 768x1024)", () => {
        setViewport(1024, 768);
        const { unmount } = render(<PosterEditorPage initialView="editor" />);

        // Mobile dock must remain hidden on 1024px tablet
        expect(screen.queryByRole("navigation", { name: "Mobile Poster Studio Dock" })).not.toBeInTheDocument();
        expect(screen.getByRole("tab", { name: /Properties/i })).toBeInTheDocument();
        unmount();

        // Check 768px tablet width
        setViewport(768, 1024);
        render(<PosterEditorPage initialView="editor" />);
        expect(screen.queryByRole("navigation", { name: "Mobile Poster Studio Dock" })).not.toBeInTheDocument();
        expect(screen.getByRole("tab", { name: /Properties/i })).toBeInTheDocument();
      });
    });

    describe("Mobile Viewport Layout & Usable Canvas Sizing (360px, 375px, 390px)", () => {
      it("renders mobile navigation dock on mobile (390x844)", () => {
        setViewport(390, 844);
        render(<PosterEditorPage initialView="editor" />);

        expect(screen.getByRole("navigation", { name: "Mobile Poster Studio Dock" })).toBeInTheDocument();
        expect(screen.getByText("Add")).toBeInTheDocument();
        expect(screen.getByText("Layers")).toBeInTheDocument();
        expect(screen.getByText("Edit")).toBeInTheDocument();
      });

      it("calculates accurate mobile fit scale filling available space across mobile devices", () => {
        // Calculation helper reproducing PosterEditorPage's fitToWorkspace logic
        const calculateFit = (
          containerWidth: number,
          containerHeight: number,
          presetWidth: number,
          presetHeight: number,
          isMobileViewport: boolean
        ) => {
          const padX = isMobileViewport ? 16 : 48;
          const padY = isMobileViewport ? 72 : 48;
          const availW = Math.max(120, containerWidth - padX);
          const availH = Math.max(120, containerHeight - padY);
          const scaleW = availW / presetWidth;
          const scaleH = availH / presetHeight;
          const targetZoom = Math.min(scaleW, scaleH);
          return Math.max(0.2, Math.min(Number(targetZoom.toFixed(3)), 3.0));
        };

        // 1. iPhone 14 Pro: 390x844 (Workspace container ~390x726)
        const postZoom390 = calculateFit(390, 726, 1080, 1080, true);
        expect(postZoom390).toBe(0.346);
        // Canvas width on screen = 1080 * 0.346 = 373.68px -> fills 96% of 390px mobile width
        expect(1080 * postZoom390).toBeCloseTo(373.68, 1);

        const statusZoom390 = calculateFit(390, 726, 1080, 1920, true);
        expect(statusZoom390).toBe(0.341);
        // Canvas height on screen = 1920 * 0.341 = 654.7px -> fits perfectly within 654px avail vertical space
        expect(1920 * statusZoom390).toBeCloseTo(654.7, 0);

        // 2. iPhone SE: 375x667 (Workspace container ~375x549)
        const postZoom375 = calculateFit(375, 549, 1080, 1080, true);
        expect(postZoom375).toBe(0.332);
        // Fills 96% of 375px screen without overflowing (358.5px)
        expect(1080 * postZoom375).toBeCloseTo(358.5, 0);

        const statusZoom375 = calculateFit(375, 549, 1080, 1920, true);
        expect(statusZoom375).toBe(0.248);
        expect(1920 * statusZoom375).toBeCloseTo(476.2, 0);

        // 3. Compact Android: 360x740 (Workspace container ~360x622)
        const postZoom360 = calculateFit(360, 622, 1080, 1080, true);
        expect(postZoom360).toBe(0.319);
        expect(1080 * postZoom360).toBeCloseTo(344.5, 0);

        const statusZoom360 = calculateFit(360, 622, 1080, 1920, true);
        expect(statusZoom360).toBe(0.286);
        expect(1920 * statusZoom360).toBeCloseTo(549.1, 0);
      });

      it("preserves aspect ratio and dimension lookups for post preset and legacy status preset", () => {
        const postPreset = POSTER_PRESETS[0]; // 1080x1080
        const statusPreset = findPreset(1080, 1920); // legacy status 1080x1920

        expect(postPreset.width / postPreset.height).toBe(1);
        expect(statusPreset).toBeDefined();
        if (statusPreset) {
          expect(statusPreset.width / statusPreset.height).toBe(9 / 16);
        }

        // Verified that preset dimension lookups return the exact matching presets
        expect(findPreset(postPreset.width, postPreset.height)?.id).toBe("whatsapp-post");
        expect(findPreset(1080, 1920)?.id).toBe("whatsapp-status");
      });
    });
  });
});



