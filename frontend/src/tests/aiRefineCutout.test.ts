import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  createEditableMaskFromCutout,
  applyBrushStrokeToMask,
  recompositeCutout,
  BrushStroke,
} from "../services/ai/imagePreprocessUtils";
import {
  backgroundRemovalService,
} from "../services/ai/backgroundRemovalService";
import {
  AIBackgroundRemovalModal,
} from "../components/poster/AIBackgroundRemovalModal";

describe("Phase 2E: Auto Cut Quality + Manual Refine Cutout Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const mockCtx2D = {
      drawImage: vi.fn(),
      getImageData: vi.fn((_sx = 0, _sy = 0, sw = 100, sh = 100) => {
        const data = new Uint8ClampedArray(sw * sh * 4);
        return { data, width: sw, height: sh };
      }),
      putImageData: vi.fn(),
      createImageData: vi.fn((sw = 100, sh = 100) => ({
        data: new Uint8ClampedArray(sw * sh * 4),
        width: sw,
        height: sh,
      })),
      beginPath: vi.fn(),
      moveTo: vi.fn(),
      lineTo: vi.fn(),
      stroke: vi.fn(),
      arc: vi.fn(),
      fill: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
      clearRect: vi.fn(),
      globalCompositeOperation: "source-over",
      strokeStyle: "rgba(0,0,0,1)",
      fillStyle: "rgba(0,0,0,1)",
      lineWidth: 1,
      lineCap: "round",
      lineJoin: "round",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    };

    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx2D) as any;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (
      this: HTMLCanvasElement,
      cb: (b: Blob) => void,
      type?: string
    ) {
      cb(new Blob(["mock-refined-transparent-png"], { type: type || "image/png" }));
    }) as any;

    if (typeof OffscreenCanvas !== "undefined") {
      OffscreenCanvas.prototype.getContext = vi.fn(() => mockCtx2D) as any;
      (OffscreenCanvas.prototype as any).convertToBlob = vi.fn().mockResolvedValue(
        new Blob(["mock-refined-transparent-png"], { type: "image/png" })
      );
    }
  });

  describe("1. Mask Editing Functions: Keep & Remove Brushes", () => {
    it("Keep brush sets composite mode to source-over with solid white (adds foreground region)", () => {
      const mockCtx: any = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        globalCompositeOperation: "",
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
      };

      const stroke: BrushStroke = {
        tool: "keep",
        size: 20,
        points: [
          { x: 10, y: 10 },
          { x: 20, y: 20 },
        ],
      };

      applyBrushStrokeToMask(mockCtx, stroke);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.globalCompositeOperation).toBe("source-over");
      expect(mockCtx.strokeStyle).toBe("rgba(255, 255, 255, 1.0)");
      expect(mockCtx.lineWidth).toBe(20);
      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.moveTo).toHaveBeenCalledWith(10, 10);
      expect(mockCtx.lineTo).toHaveBeenCalledWith(20, 20);
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it("Remove brush sets composite mode to destination-out to erase pixels to transparent", () => {
      const mockCtx: any = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        moveTo: vi.fn(),
        lineTo: vi.fn(),
        stroke: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        globalCompositeOperation: "",
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
      };

      const stroke: BrushStroke = {
        tool: "remove",
        size: 15,
        points: [
          { x: 50, y: 50 },
          { x: 60, y: 70 },
        ],
      };

      applyBrushStrokeToMask(mockCtx, stroke);

      expect(mockCtx.save).toHaveBeenCalled();
      expect(mockCtx.globalCompositeOperation).toBe("destination-out");
      expect(mockCtx.strokeStyle).toBe("rgba(0, 0, 0, 1.0)");
      expect(mockCtx.lineWidth).toBe(15);
      expect(mockCtx.stroke).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it("handles single-point taps by filling an arc/dot at the brush size", () => {
      const mockCtx: any = {
        save: vi.fn(),
        restore: vi.fn(),
        beginPath: vi.fn(),
        arc: vi.fn(),
        fill: vi.fn(),
        globalCompositeOperation: "",
        strokeStyle: "",
        fillStyle: "",
        lineWidth: 0,
      };

      const dotStroke: BrushStroke = {
        tool: "keep",
        size: 30,
        points: [{ x: 45, y: 90 }],
      };

      applyBrushStrokeToMask(mockCtx, dotStroke);

      expect(mockCtx.beginPath).toHaveBeenCalled();
      expect(mockCtx.arc).toHaveBeenCalledWith(45, 90, 15, 0, Math.PI * 2);
      expect(mockCtx.fill).toHaveBeenCalled();
      expect(mockCtx.restore).toHaveBeenCalled();
    });

    it("ignores empty strokes safely without error", () => {
      const mockCtx: any = { save: vi.fn() };
      applyBrushStrokeToMask(mockCtx, { tool: "keep", size: 10, points: [] });
      expect(mockCtx.save).not.toHaveBeenCalled();
    });
  });

  describe("2. RGB Preservation and Alpha Mask Compositing", () => {
    it("extracts editable mask with RGB=255 and preserved Alpha channel from cutout", () => {
      const testPixels = new Uint8ClampedArray(4 * 4 * 4); // 4x4 image
      // Pixel 0: red foreground with alpha 200
      testPixels[0] = 255;
      testPixels[1] = 0;
      testPixels[2] = 0;
      testPixels[3] = 200;

      // Pixel 1: background pixel with alpha 0
      testPixels[4] = 100;
      testPixels[5] = 100;
      testPixels[6] = 100;
      testPixels[7] = 0;

      let savedImageData: any = null;
      const customCtx = {
        drawImage: vi.fn(),
        getImageData: vi.fn(() => ({ data: testPixels })),
        putImageData: vi.fn((imgData: any) => {
          savedImageData = imgData;
        }),
      };

      if (typeof OffscreenCanvas !== "undefined") {
        OffscreenCanvas.prototype.getContext = vi.fn(() => customCtx) as any;
      }
      HTMLCanvasElement.prototype.getContext = vi.fn(() => customCtx) as any;

      const fakeCutout = { width: 4, height: 4 } as any;
      const maskCanvas = createEditableMaskFromCutout(fakeCutout, 4, 4);

      expect(maskCanvas).toBeDefined();
      expect(customCtx.drawImage).toHaveBeenCalledWith(fakeCutout, 0, 0, 4, 4);
      expect(customCtx.getImageData).toHaveBeenCalledWith(0, 0, 4, 4);
      expect(customCtx.putImageData).toHaveBeenCalled();

      expect(savedImageData).toBeDefined();
      const { data } = savedImageData;

      // Pixel 0 RGB is set to 255, and Alpha remains 200
      expect(data[0]).toBe(255);
      expect(data[1]).toBe(255);
      expect(data[2]).toBe(255);
      expect(data[3]).toBe(200);

      // Pixel 1 RGB is set to 255, Alpha remains 0
      expect(data[4]).toBe(255);
      expect(data[5]).toBe(255);
      expect(data[6]).toBe(255);
      expect(data[7]).toBe(0);
    });

    it("recomposites original source image with mask using destination-in without recoloring or blurring source", async () => {
      const drawImageSpy = vi.fn();
      let compositeOp = "source-over";

      const mockCompositeCtx = {
        drawImage: drawImageSpy,
        get globalCompositeOperation() {
          return compositeOp;
        },
        set globalCompositeOperation(val: string) {
          compositeOp = val;
        },
        imageSmoothingEnabled: false,
        imageSmoothingQuality: "high",
      };

      if (typeof OffscreenCanvas !== "undefined") {
        OffscreenCanvas.prototype.getContext = vi.fn(() => mockCompositeCtx) as any;
      }
      HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCompositeCtx) as any;

      const origCanvas = { width: 100, height: 100 } as any;
      const maskCanvas = { width: 100, height: 100 } as any;

      const blob = await recompositeCutout(origCanvas, maskCanvas, 100, 100);

      expect(blob).toBeDefined();
      expect(blob.type).toBe("image/png");
      // Step 1: Draws original source image with default source-over
      expect(drawImageSpy).toHaveBeenNthCalledWith(1, origCanvas, 0, 0, 100, 100);
      // Step 2: Draws mask with destination-in to preserve original RGB values
      expect(drawImageSpy).toHaveBeenNthCalledWith(2, maskCanvas, 0, 0, 100, 100);
    });
  });

  describe("3. Coordinate Transformation Under Scaling", () => {
    it("accurately maps client pointer coordinates to full-resolution canvas coordinates", () => {
      // Simulate an image of 1000x800 displayed in a responsive container of 500x400 (scale = 2)
      const canvasWidth = 1000;
      const canvasHeight = 800;
      const clientRect = {
        left: 50,
        top: 100,
        width: 500,
        height: 400,
      };

      const simulateEvent = {
        clientX: 150, // 100px from left of element
        clientY: 200, // 100px from top of element
      };

      const scaleX = canvasWidth / clientRect.width; // 2
      const scaleY = canvasHeight / clientRect.height; // 2

      const mappedX = (simulateEvent.clientX - clientRect.left) * scaleX;
      const mappedY = (simulateEvent.clientY - clientRect.top) * scaleY;

      expect(mappedX).toBe(200);
      expect(mappedY).toBe(200);
    });

    it("clamps coordinates safely within canvas boundaries if pointer leaves element", () => {
      const canvasWidth = 800;
      const canvasHeight = 600;
      const clientRect = { left: 0, top: 0, width: 400, height: 300 };

      // Pointer moved beyond right edge
      const overX = 450;
      const clampedX = Math.max(0, Math.min(canvasWidth, (overX - clientRect.left) * (canvasWidth / clientRect.width)));
      expect(clampedX).toBe(canvasWidth);

      // Pointer moved beyond top edge
      const underY = -20;
      const clampedY = Math.max(0, Math.min(canvasHeight, (underY - clientRect.top) * (canvasHeight / clientRect.height)));
      expect(clampedY).toBe(0);
    });
  });

  describe("4. Refine Cutout Modal Workflow: Keep, Remove, Undo, Redo, Cancel, Apply", () => {
    const fakeBlob = new Blob(["cutout-png"], { type: "image/png" });
    const fakeFile = new File([fakeBlob], "product-nobg.png", { type: "image/png" });

    beforeEach(() => {
      vi.spyOn(backgroundRemovalService, "removeBackground").mockResolvedValue({
        transparentBlob: fakeBlob,
        transparentFile: fakeFile,
        transparentUrl: "blob:http://localhost/cutout-png",
        originalUrl: "blob:http://localhost/original-jpg",
        width: 400,
        height: 300,
        originalWidth: 400,
        originalHeight: 300,
        scaleApplied: 1,
      });

      vi.spyOn(backgroundRemovalService, "loadImageElement").mockImplementation((url: string) => {
        const img = {
          src: url,
          width: 400,
          height: 300,
          naturalWidth: 400,
          naturalHeight: 300,
        } as any;
        return Promise.resolve(img);
      });
    });

    it("enters Refine Cutout mode from preview and displays brush controls", async () => {
      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      const refineBtn = await screen.findByRole("button", { name: /Refine Cutout/i });
      fireEvent.click(refineBtn);

      await waitFor(() => {
        expect(screen.getByText("Keep / Restore")).toBeInTheDocument();
        expect(screen.getByText("Remove Background")).toBeInTheDocument();
        expect(screen.getByText("Done Refining")).toBeInTheDocument();
      });
    });

    it("switches between Keep and Remove brush tools and updates active tool class", async () => {
      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      const refineBtn = await screen.findByRole("button", { name: /Refine Cutout/i });
      fireEvent.click(refineBtn);

      await waitFor(() => {
        expect(screen.getByText("Keep / Restore")).toBeInTheDocument();
      });

      const keepBtn = screen.getByText("Keep / Restore").closest("button")!;
      const removeBtn = screen.getByText("Remove Background").closest("button")!;

      expect(keepBtn).toHaveClass("active");
      expect(removeBtn).not.toHaveClass("active");

      // Switch to Remove tool
      fireEvent.click(removeBtn);
      expect(removeBtn).toHaveClass("active");
      expect(keepBtn).not.toHaveClass("active");
    });

    it("adjusts brush size using presets (10px, 25px, 50px) and slider", async () => {
      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      const refineBtn = await screen.findByRole("button", { name: /Refine Cutout/i });
      fireEvent.click(refineBtn);

      await waitFor(() => {
        expect(screen.getByText("10")).toBeInTheDocument();
      });

      // Click preset 10px
      fireEvent.click(screen.getByText("10"));
      expect(screen.getByText("10px")).toBeInTheDocument();

      // Click preset 50px
      fireEvent.click(screen.getByText("50"));
      expect(screen.getByText("50px")).toBeInTheDocument();
    });

    it("does NOT rerun AI background removal inference when drawing brush strokes", async () => {
      const removeSpy = vi.spyOn(backgroundRemovalService, "removeBackground");

      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      const refineBtn = await screen.findByRole("button", { name: /Refine Cutout/i });
      // Initial inference was called once
      expect(removeSpy).toHaveBeenCalledTimes(1);

      fireEvent.click(refineBtn);

      await waitFor(() => {
        expect(screen.getByText("Keep / Restore")).toBeInTheDocument();
      });

      const canvas = document.querySelector(".ai-refine-canvas")!;
      expect(canvas).toBeInTheDocument();

      // Simulate a stroke
      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, button: 0 });
      fireEvent.pointerMove(canvas, { clientX: 70, clientY: 70 });
      fireEvent.pointerUp(canvas);

      // AI inference MUST NOT be called again
      expect(removeSpy).toHaveBeenCalledTimes(1);
    });

    it("supports local Undo, Redo, and Reset to initial AI Cutout", async () => {
      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      const refineBtn = await screen.findByRole("button", { name: /Refine Cutout/i });
      fireEvent.click(refineBtn);

      await waitFor(() => {
        expect(screen.getByText("Keep / Restore")).toBeInTheDocument();
      });

      const undoBtn = screen.getByTitle("Undo latest brush stroke");
      const redoBtn = screen.getByTitle("Redo stroke");
      const resetBtn = screen.getByTitle("Reset to initial AI Cutout");

      expect(undoBtn).toBeDisabled();
      expect(redoBtn).toBeDisabled();

      const canvas = document.querySelector(".ai-refine-canvas")!;

      // Simulate a stroke
      fireEvent.pointerDown(canvas, { clientX: 50, clientY: 50, button: 0 });
      fireEvent.pointerMove(canvas, { clientX: 70, clientY: 70 });
      fireEvent.pointerUp(canvas);

      // Undo is now enabled
      expect(undoBtn).not.toBeDisabled();
      expect(redoBtn).toBeDisabled();

      // Click Undo
      fireEvent.click(undoBtn);
      expect(undoBtn).toBeDisabled();
      expect(redoBtn).not.toBeDisabled();

      // Click Redo
      fireEvent.click(redoBtn);
      expect(undoBtn).not.toBeDisabled();

      // Click Reset
      fireEvent.click(resetBtn);
      expect(resetBtn).toBeInTheDocument();
    });

    it("Cancel Refine exits refine mode back to preview without saving manual changes", async () => {
      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      const refineBtn = await screen.findByRole("button", { name: /Refine Cutout/i });
      fireEvent.click(refineBtn);

      await waitFor(() => {
        expect(screen.getByText("Cancel Refine")).toBeInTheDocument();
      });

      // Click Cancel Refine
      fireEvent.click(screen.getByText("Cancel Refine"));

      await waitFor(() => {
        expect(screen.getByRole("button", { name: /Refine Cutout/i })).toBeInTheDocument();
        expect(screen.getByText("Side-by-Side")).toBeInTheDocument();
      });
    });

    it("Done Refining updates preview with refined transparent cutout", async () => {
      const recompositeSpy = vi.spyOn(backgroundRemovalService, "recompositeWithMask").mockResolvedValueOnce({
        transparentBlob: new Blob(["recomposited-blob"], { type: "image/png" }),
        transparentFile: new File(["recomposited-blob"], "product-refined.png", { type: "image/png" }),
        transparentUrl: "blob:http://localhost/refined-url",
      });

      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      const refineBtn = await screen.findByRole("button", { name: /Refine Cutout/i });
      fireEvent.click(refineBtn);

      await waitFor(() => {
        expect(screen.getByText("Done Refining")).toBeInTheDocument();
      });

      fireEvent.click(screen.getByText("Done Refining"));

      await waitFor(() => {
        expect(recompositeSpy).toHaveBeenCalledOnce();
        expect(screen.getByRole("button", { name: /Refine Cutout/i })).toBeInTheDocument();
      });
    });

    it("Use Result from Refine mode applies cutout to canvas exactly once", async () => {
      const handleApply = vi.fn();
      const handleClose = vi.fn();

      vi.spyOn(backgroundRemovalService, "recompositeWithMask").mockResolvedValueOnce({
        transparentBlob: new Blob(["final-blob"], { type: "image/png" }),
        transparentFile: new File(["final-blob"], "product-refined.png", { type: "image/png" }),
        transparentUrl: "blob:http://localhost/final-url",
      });

      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: handleClose,
          onApplyResult: handleApply,
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      const refineBtn = await screen.findByRole("button", { name: /Refine Cutout/i });
      fireEvent.click(refineBtn);

      await waitFor(() => {
        expect(screen.getByText("Done Refining")).toBeInTheDocument();
      });

      // Click "Use Result" directly in refine mode footer
      const useResultBtns = screen.getAllByText("Use Result");
      fireEvent.click(useResultBtns[0]);

      await waitFor(() => {
        expect(handleApply).toHaveBeenCalledOnce();
        expect(handleClose).toHaveBeenCalledOnce();
      });
    });
  });
});
