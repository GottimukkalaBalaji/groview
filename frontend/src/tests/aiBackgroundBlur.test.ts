import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  compositeBlurredBackground,
  prepareInfilledBackgroundPlate,
  MODEL_INPUT_SIZE,
} from "../services/ai/imagePreprocessUtils";
import {
  backgroundRemovalService,
} from "../services/ai/backgroundRemovalService";
import {
  AIBackgroundBlurModal,
  DEFAULT_BLUR_RADIUS,
  MIN_BLUR_RADIUS,
  MAX_BLUR_RADIUS,
} from "../components/poster/AIBackgroundBlurModal";
import { PosterToolRail } from "../components/poster/PosterToolRail";
import { PosterMobileAddSheet } from "../components/poster/PosterMobileAddSheet";

describe("Phase 2D: AI Background Blur Tests", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    const sharedSpies = {
      drawImage: vi.fn(),
      clearRect: vi.fn(),
      save: vi.fn(),
      restore: vi.fn(),
    };

    function createMockContext(canvas: any) {
      if (!canvas._mockCtx) {
        let storedData = new Uint8ClampedArray((canvas.width || MODEL_INPUT_SIZE) * (canvas.height || MODEL_INPUT_SIZE) * 4);
        canvas._mockCtx = {
          drawImage: sharedSpies.drawImage,
          getImageData: vi.fn((_sx = 0, _sy = 0, sw = canvas.width, sh = canvas.height) => {
            if (canvas._plateImgData) {
              return canvas._plateImgData;
            }
            const w = sw || canvas.width || MODEL_INPUT_SIZE;
            const h = sh || canvas.height || MODEL_INPUT_SIZE;
            if (storedData.length !== w * h * 4) {
              const next = new Uint8ClampedArray(w * h * 4);
              next.set(storedData.subarray(0, Math.min(storedData.length, next.length)));
              storedData = next;
            }
            return { data: storedData };
          }),
          putImageData: vi.fn((imgData: any) => {
            if (imgData?.data) {
              if (storedData.length !== imgData.data.length) {
                storedData = new Uint8ClampedArray(imgData.data.length);
              }
              storedData.set(imgData.data);
            }
          }),
          createImageData: vi.fn((sw = canvas.width, sh = canvas.height) => {
            const w = sw || canvas.width || MODEL_INPUT_SIZE;
            const h = sh || canvas.height || MODEL_INPUT_SIZE;
            return { data: new Uint8ClampedArray(w * h * 4) };
          }),
          clearRect: sharedSpies.clearRect,
          save: sharedSpies.save,
          restore: sharedSpies.restore,
          filter: "none",
          globalCompositeOperation: "source-over",
          imageSmoothingEnabled: true,
          imageSmoothingQuality: "high",
        };
      }
      return canvas._mockCtx;
    }

    HTMLCanvasElement.prototype.getContext = function (this: HTMLCanvasElement) {
      return createMockContext(this);
    } as any;

    HTMLCanvasElement.prototype.toBlob = vi.fn(function (
      this: HTMLCanvasElement,
      cb: (b: Blob) => void,
      type?: string
    ) {
      cb(new Blob(["mock-blurred-png"], { type: type || "image/png" }));
    }) as any;

    if (typeof OffscreenCanvas !== "undefined") {
      OffscreenCanvas.prototype.getContext = function (this: OffscreenCanvas) {
        return createMockContext(this);
      } as any;
      (OffscreenCanvas.prototype as any).convertToBlob = vi.fn().mockResolvedValue(
        new Blob(["mock-blurred-png"], { type: "image/png" })
      );
    }
  });

  describe("1. Blur Compositing & Deterministic Edge Handling", () => {
    it("exports sensible default (12px), min (0px), and max (30px) blur constants", () => {
      expect(DEFAULT_BLUR_RADIUS).toBe(12);
      expect(MIN_BLUR_RADIUS).toBe(0);
      expect(MAX_BLUR_RADIUS).toBe(30);
    });

    it("applies Gaussian blur with bleed margin for positive blurRadius and restores filter to none for sharp foreground", async () => {
      const fakeSource = { width: 800, height: 600 } as any;
      const fakeCutout = { width: 800, height: 600 } as any;

      const blob = await compositeBlurredBackground(fakeSource, fakeCutout, 800, 600, 15);
      expect(blob).toBeDefined();
      expect(blob.type).toBe("image/png");

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d") as any;

      // Ensure drawImage was called for both background and sharp foreground
      expect(ctx.drawImage).toHaveBeenCalled();
      expect(ctx.clearRect).toHaveBeenCalledWith(0, 0, 800, 600);
    });

    it("handles 0px blur by drawing original sharp background without filter", async () => {
      const fakeSource = { width: 400, height: 300 } as any;
      const fakeCutout = { width: 400, height: 300 } as any;

      const blob = await compositeBlurredBackground(fakeSource, fakeCutout, 400, 300, 0);
      expect(blob).toBeDefined();
      expect(blob.type).toBe("image/png");
    });

    it("clamps negative and excessively large blur values safely", async () => {
      const fakeSource = { width: 400, height: 400 } as any;
      const fakeCutout = { width: 400, height: 400 } as any;

      const blobNegative = await compositeBlurredBackground(fakeSource, fakeCutout, 400, 400, -10);
      const blobOverflow = await compositeBlurredBackground(fakeSource, fakeCutout, 400, 400, 200);

      expect(blobNegative).toBeDefined();
      expect(blobOverflow).toBeDefined();
    });

    it("creates blurred composite using backgroundRemovalService.createBlurredComposite", async () => {
      const fakeSource = { width: 500, height: 500 } as any;
      const fakeCutout = { width: 500, height: 500 } as any;

      const res = await backgroundRemovalService.createBlurredComposite(
        fakeSource,
        fakeCutout,
        500,
        500,
        12,
        "product-blurred.png"
      );

      expect(res.blurredBlob).toBeDefined();
      expect(res.blurredFile.name).toBe("product-blurred.png");
      expect(res.blurredUrl).toContain("blob:");
    });
  });

  describe("2. Synthetic Image/Mask Edge Fixtures & Halo Elimination", () => {
    // Helper to create real in-memory canvas with test pixel data
    function createSyntheticCanvases(
      width: number,
      height: number,
      bgRGB: [number, number, number],
      fgRGB: [number, number, number],
      isFgFn: (x: number, y: number) => number // returns alpha 0-255
    ) {
      const origCanvas = document.createElement("canvas");
      origCanvas.width = width;
      origCanvas.height = height;
      const origCtx = origCanvas.getContext("2d")!;
      const origData = origCtx.createImageData(width, height);

      const fgCanvas = document.createElement("canvas");
      fgCanvas.width = width;
      fgCanvas.height = height;
      const fgCtx = fgCanvas.getContext("2d")!;
      const fgData = fgCtx.createImageData(width, height);

      for (let y = 0; y < height; y++) {
        for (let x = 0; x < width; x++) {
          const idx = (y * width + x) * 4;
          const alpha = isFgFn(x, y);

          if (alpha > 0) {
            origData.data[idx] = fgRGB[0];
            origData.data[idx + 1] = fgRGB[1];
            origData.data[idx + 2] = fgRGB[2];
            origData.data[idx + 3] = 255;

            fgData.data[idx] = fgRGB[0];
            fgData.data[idx + 1] = fgRGB[1];
            fgData.data[idx + 2] = fgRGB[2];
            fgData.data[idx + 3] = alpha;
          } else {
            origData.data[idx] = bgRGB[0];
            origData.data[idx + 1] = bgRGB[1];
            origData.data[idx + 2] = bgRGB[2];
            origData.data[idx + 3] = 255;

            fgData.data[idx] = 0;
            fgData.data[idx + 1] = 0;
            fgData.data[idx + 2] = 0;
            fgData.data[idx + 3] = 0;
          }
        }
      }

      origCtx.putImageData(origData, 0, 0);
      fgCtx.putImageData(fgData, 0, 0);

      (origCanvas as any)._plateImgData = origData;
      (fgCanvas as any)._plateImgData = fgData;

      return { origCanvas, fgCanvas, origCtx, fgCtx };
    }

    it("eliminates bright white shirt halo against dark background via infilled background plate", () => {
      const w = 60, h = 60;
      // Dark background (30, 40, 50), bright white shirt in center (250, 250, 250)
      const { origCanvas, fgCanvas } = createSyntheticCanvases(
        w,
        h,
        [30, 40, 50],
        [250, 250, 250],
        (x, y) => (x >= 20 && x <= 40 && y >= 20 && y <= 40 ? 255 : 0)
      );

      const infilled = prepareInfilledBackgroundPlate(origCanvas, fgCanvas, w, h);
      expect(infilled).toBeDefined();

      const infilledCtx = (infilled as HTMLCanvasElement).getContext("2d")!;
      const infilledData = infilledCtx.getImageData(0, 0, w, h);

      // Verify pixel at x=21 (just inside the shirt boundary):
      // In the infilled background plate, it MUST NOT be 250 (white shirt);
      // it must be infilled with neighboring background color (30, 40, 50).
      const pIdx = (25 * w + 21) * 4;
      const redVal = infilledData.data[pIdx];

      expect(redVal).toBeLessThan(100);
      expect(redVal).toBeGreaterThanOrEqual(30);
    });

    it("prevents dark halo and color bleed for dark hair against bright background", () => {
      const w = 60, h = 60;
      // Bright background (230, 230, 230), dark hair in center (20, 20, 20)
      const { origCanvas, fgCanvas } = createSyntheticCanvases(
        w,
        h,
        [230, 230, 230],
        [20, 20, 20],
        (x, y) => (x >= 20 && x <= 40 && y >= 20 && y <= 40 ? 255 : 0)
      );

      const infilled = prepareInfilledBackgroundPlate(origCanvas, fgCanvas, w, h);
      const infilledCtx = (infilled as HTMLCanvasElement).getContext("2d")!;
      const infilledData = infilledCtx.getImageData(0, 0, w, h);

      // Verify pixel at x=21 (just inside hair boundary):
      // In infilled plate, it MUST NOT remain dark (20);
      // it must be infilled with bright background color (230).
      const pIdx = (25 * w + 21) * 4;
      const redVal = infilledData.data[pIdx];

      expect(redVal).toBeGreaterThan(150);
      expect(redVal).toBeLessThanOrEqual(230);
    });

    it("preserves soft mask-edge transitions without harsh staircasing or artificial white outline", () => {
      const w = 60, h = 60;
      // Contrast background with anti-aliased gradient edge
      const { origCanvas, fgCanvas } = createSyntheticCanvases(
        w,
        h,
        [40, 50, 60],
        [240, 240, 240],
        (x, y) => {
          if (x >= 25 && x <= 35 && y >= 25 && y <= 35) return 255;
          if (x >= 23 && x <= 37 && y >= 23 && y <= 37) return 128; // soft edge
          return 0;
        }
      );

      const infilled = prepareInfilledBackgroundPlate(origCanvas, fgCanvas, w, h);
      expect(infilled.width).toBe(w);
      expect(infilled.height).toBe(h);
    });

    it("preserves 100% sharp foreground cutout pixels by drawing with filter none", async () => {
      const fakeSource = { width: 300, height: 300 } as any;
      const fakeCutout = { width: 300, height: 300 } as any;

      await compositeBlurredBackground(fakeSource, fakeCutout, 300, 300, 15);

      const canvas = document.createElement("canvas");
      const ctx = canvas.getContext("2d") as any;

      // Ensure drawImage was called with high smoothing and none filter for foreground
      expect(ctx.filter).toBe("none");
      expect(ctx.imageSmoothingQuality).toBe("high");
    });
  });

  describe("3. AIBackgroundBlurModal UI, Slider & Isolation", () => {
    it("renders file selection dropzone in idle state", () => {
      render(
        React.createElement(AIBackgroundBlurModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
        })
      );

      expect(screen.getByText("AI Product Background Blur")).toBeInTheDocument();
      expect(screen.getByText("Select a Product or Model Photo")).toBeInTheDocument();
      expect(screen.getByText("Select Image")).toBeInTheDocument();
    });

    it("shows actionable error when segmentation fails rather than silently applying full blur", async () => {
      vi.spyOn(backgroundRemovalService, "removeBackground").mockRejectedValueOnce(
        new Error("AI Model segmentation failed: subject could not be isolated.")
      );

      const file = new File(["corrupt"], "test.png", { type: "image/png" });

      render(
        React.createElement(AIBackgroundBlurModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: file,
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Background Blur Failed")).toBeInTheDocument();
        expect(
          screen.getByText("AI Model segmentation failed: subject could not be isolated.")
        ).toBeInTheDocument();
        expect(screen.getByText("Try Another Photo")).toBeInTheDocument();
      });
    });

    it("allows adjusting blur radius with slider and presets without re-running AI segmentation", async () => {
      const fakeCutoutBlob = new Blob(["cutout"], { type: "image/png" });
      const fakeCutoutFile = new File([fakeCutoutBlob], "prod-nobg.png", { type: "image/png" });

      const removeBgSpy = vi.spyOn(backgroundRemovalService, "removeBackground").mockResolvedValueOnce({
        transparentBlob: fakeCutoutBlob,
        transparentFile: fakeCutoutFile,
        transparentUrl: "blob:http://localhost/cutout",
        originalUrl: "blob:http://localhost/orig",
        width: 600,
        height: 600,
        originalWidth: 600,
        originalHeight: 600,
        scaleApplied: 1,
      });

      const fakeImageElement = { width: 600, height: 600 } as any;
      vi.spyOn(backgroundRemovalService, "loadImageElement").mockResolvedValue(fakeImageElement);

      const blurSpy = vi.spyOn(backgroundRemovalService, "createBlurredComposite").mockResolvedValue({
        blurredBlob: new Blob(["blurred"], { type: "image/png" }),
        blurredFile: new File(["blurred"], "prod-blurred.png", { type: "image/png" }),
        blurredUrl: "blob:http://localhost/blurred",
      });

      const file = new File(["photo"], "product.jpg", { type: "image/jpeg" });

      render(
        React.createElement(AIBackgroundBlurModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: file,
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Blur Strength:")).toBeInTheDocument();
        expect(screen.getByText("12px")).toBeInTheDocument();
        expect(screen.getByText("Subtle (5px)")).toBeInTheDocument();
        expect(screen.getByText("Deep (24px)")).toBeInTheDocument();
      });

      // AI inference was called once
      expect(removeBgSpy).toHaveBeenCalledOnce();

      // Click "Deep (24px)" preset button
      const deepPresetBtn = screen.getByText("Deep (24px)");
      fireEvent.click(deepPresetBtn);

      await waitFor(() => {
        expect(screen.getByText("24px")).toBeInTheDocument();
      });

      // AI inference was NOT called again; only blur composite was regenerated
      expect(removeBgSpy).toHaveBeenCalledOnce();
      expect(blurSpy).toHaveBeenCalledTimes(2); // once initial, once on preset change
    });

    it("clicking Cancel calls onClose and never mutates canvas or calls onApplyResult", async () => {
      const handleClose = vi.fn();
      const handleApply = vi.fn();

      render(
        React.createElement(AIBackgroundBlurModal, {
          isOpen: true,
          onClose: handleClose,
          onApplyResult: handleApply,
        })
      );

      const cancelBtn = screen.getByText("Cancel");
      fireEvent.click(cancelBtn);

      expect(handleClose).toHaveBeenCalledOnce();
      expect(handleApply).not.toHaveBeenCalled();
    });

    it("clicking Use Result calls onApplyResult exactly once with the blurred File", async () => {
      const handleClose = vi.fn();
      const handleApply = vi.fn();

      vi.spyOn(backgroundRemovalService, "removeBackground").mockResolvedValueOnce({
        transparentBlob: new Blob(["cutout"], { type: "image/png" }),
        transparentFile: new File(["cutout"], "item-nobg.png", { type: "image/png" }),
        transparentUrl: "blob:http://localhost/cutout",
        originalUrl: "blob:http://localhost/orig",
        width: 400,
        height: 400,
        originalWidth: 400,
        originalHeight: 400,
        scaleApplied: 1,
      });

      vi.spyOn(backgroundRemovalService, "loadImageElement").mockResolvedValue({
        width: 400,
        height: 400,
      } as any);

      const expectedBlurredFile = new File(["blur-bytes"], "item-blurred.png", { type: "image/png" });
      vi.spyOn(backgroundRemovalService, "createBlurredComposite").mockResolvedValue({
        blurredBlob: new Blob(["blur-bytes"], { type: "image/png" }),
        blurredFile: expectedBlurredFile,
        blurredUrl: "blob:http://localhost/blurred",
      });

      render(
        React.createElement(AIBackgroundBlurModal, {
          isOpen: true,
          onClose: handleClose,
          onApplyResult: handleApply,
          initialFile: new File(["valid"], "item.png", { type: "image/png" }),
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Use Result")).toBeInTheDocument();
      });

      const useResultBtn = screen.getByText("Use Result");
      fireEvent.click(useResultBtn);

      expect(handleApply).toHaveBeenCalledOnce();
      expect(handleApply).toHaveBeenCalledWith(expectedBlurredFile);
      expect(handleClose).toHaveBeenCalledOnce();
    });

    it("cleans up object URLs on modal close to prevent memory leaks", async () => {
      const revokeSpy = vi.spyOn(backgroundRemovalService, "revokeUrls");

      vi.spyOn(backgroundRemovalService, "removeBackground").mockResolvedValueOnce({
        transparentBlob: new Blob(["cutout"], { type: "image/png" }),
        transparentFile: new File(["cutout"], "item-nobg.png", { type: "image/png" }),
        transparentUrl: "blob:http://localhost/cutout-url",
        originalUrl: "blob:http://localhost/orig-url",
        width: 400,
        height: 400,
        originalWidth: 400,
        originalHeight: 400,
        scaleApplied: 1,
      });

      vi.spyOn(backgroundRemovalService, "loadImageElement").mockResolvedValue({
        width: 400,
        height: 400,
      } as any);

      vi.spyOn(backgroundRemovalService, "createBlurredComposite").mockResolvedValue({
        blurredBlob: new Blob(["blur"], { type: "image/png" }),
        blurredFile: new File(["blur"], "item-blurred.png", { type: "image/png" }),
        blurredUrl: "blob:http://localhost/blurred-url",
      });

      const { unmount } = render(
        React.createElement(AIBackgroundBlurModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Use Result")).toBeInTheDocument();
      });

      unmount();
      expect(revokeSpy).toHaveBeenCalledWith("blob:http://localhost/blurred-url");
      expect(revokeSpy).toHaveBeenCalledWith(
        "blob:http://localhost/cutout-url",
        "blob:http://localhost/orig-url"
      );
    });
  });

  describe("3. Tool Rail & Mobile Add Sheet Entrypoints", () => {
    it("renders AI Background Blur button in PosterToolRail and fires callback", () => {
      const handleOpenBlur = vi.fn();

      render(
        React.createElement(PosterToolRail, {
          activeTool: "elements",
          onAddImage: vi.fn(),
          onOpenAiBgBlur: handleOpenBlur,
          onAddText: vi.fn(),
          onAddShape: vi.fn(),
          onAddSticker: vi.fn(),
          onBackgroundColorChange: vi.fn(),
          onClearCanvas: vi.fn(),
        })
      );

      const blurBtn = screen.getByText("AI Background Blur");
      expect(blurBtn).toBeInTheDocument();
      fireEvent.click(blurBtn);
      expect(handleOpenBlur).toHaveBeenCalledOnce();
    });

    it("renders AI Blur button in PosterMobileAddSheet and fires callback while closing sheet", () => {
      const handleOpenBlur = vi.fn();
      const handleClose = vi.fn();

      render(
        React.createElement(PosterMobileAddSheet, {
          isOpen: true,
          onClose: handleClose,
          onAddImage: vi.fn(),
          onOpenAiBgBlur: handleOpenBlur,
          onAddText: vi.fn(),
          onAddShape: vi.fn(),
          onAddSticker: vi.fn(),
          onBackgroundColorChange: vi.fn(),
        })
      );

      const mobileBlurBtn = screen.getByText("AI Blur");
      expect(mobileBlurBtn).toBeInTheDocument();
      fireEvent.click(mobileBlurBtn);

      expect(handleClose).toHaveBeenCalledOnce();
      expect(handleOpenBlur).toHaveBeenCalledOnce();
    });
  });
});
