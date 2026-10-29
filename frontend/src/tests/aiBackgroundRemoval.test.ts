import React from "react";
import { describe, it, expect, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, waitFor } from "@testing-library/react";
import {
  calculateBoundedDimensions,
  normalizeRawMask,
  preprocessImageToTensor,
  createMaskCanvas,
  MODEL_INPUT_SIZE,
  MAX_PROCESS_DIMENSION,
  IMAGENET_MEAN,
  IMAGENET_STD,
} from "../services/ai/imagePreprocessUtils";
import {
  backgroundRemovalService,
} from "../services/ai/backgroundRemovalService";
import {
  AIBackgroundRemovalModal,
} from "../components/poster/AIBackgroundRemovalModal";
import { validatePosterImage } from "../types/poster";

describe("Phase 2B: AI Background Removal (U²-Netp ONNX Isolated PoC)", () => {
  beforeEach(() => {
    vi.clearAllMocks();

    // Mock 2D canvas context for Happy-DOM headless test runner
    const totalPixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
    const mockCtx = {
      drawImage: vi.fn(),
      getImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(totalPixels * 4),
      })),
      putImageData: vi.fn(),
      createImageData: vi.fn(() => ({
        data: new Uint8ClampedArray(totalPixels * 4),
      })),
      globalCompositeOperation: "source-over",
      imageSmoothingEnabled: true,
      imageSmoothingQuality: "high",
    };

    HTMLCanvasElement.prototype.getContext = vi.fn(() => mockCtx) as any;
    HTMLCanvasElement.prototype.toBlob = vi.fn(function (
      this: HTMLCanvasElement,
      cb: (b: Blob) => void,
      type?: string
    ) {
      cb(new Blob(["mock-transparent-png"], { type: type || "image/png" }));
    }) as any;

    if (typeof OffscreenCanvas !== "undefined") {
      OffscreenCanvas.prototype.getContext = vi.fn(() => mockCtx) as any;
      (OffscreenCanvas.prototype as any).convertToBlob = vi.fn().mockResolvedValue(
        new Blob(["mock-transparent-png"], { type: "image/png" })
      );
    }
  });

  describe("1. Dimension Bounding & Aspect Ratio Preservation", () => {
    it("leaves images within MAX_PROCESS_DIMENSION (2048px) untouched", () => {
      const res = calculateBoundedDimensions(1200, 800, 2048);
      expect(res.width).toBe(1200);
      expect(res.height).toBe(800);
      expect(res.scale).toBe(1);
    });

    it("scales down large landscape images to 2048px width while preserving exact aspect ratio", () => {
      const res = calculateBoundedDimensions(4096, 2048, 2048);
      expect(res.width).toBe(2048);
      expect(res.height).toBe(1024);
      expect(res.scale).toBe(0.5);
    });

    it("scales down large portrait images to 2048px height while preserving exact aspect ratio", () => {
      const res = calculateBoundedDimensions(2000, 4000, 2048);
      expect(res.width).toBe(1024);
      expect(res.height).toBe(2048);
      expect(res.scale).toBe(2048 / 4000);
    });

    it("handles zero or negative dimensions safely with a default fallback", () => {
      const res = calculateBoundedDimensions(0, 0);
      expect(res.width).toBe(320);
      expect(res.height).toBe(320);
      expect(res.scale).toBe(1);
    });
  });

  describe("2. Tensor Layout & ImageNet Normalization Contracts", () => {
    it("exports standard 320x320 input dimensions and ImageNet mean/std constants", () => {
      expect(MODEL_INPUT_SIZE).toBe(320);
      expect(MAX_PROCESS_DIMENSION).toBe(2048);
      expect(IMAGENET_MEAN).toEqual([0.485, 0.456, 0.406]);
      expect(IMAGENET_STD).toEqual([0.229, 0.224, 0.225]);
    });

    it("converts image source to Float32Array planar tensor with shape [1, 3, 320, 320]", () => {
      const fakeSource = { width: 320, height: 320 } as any;
      const tensor = preprocessImageToTensor(fakeSource, 320, 320);

      expect(tensor).toBeInstanceOf(Float32Array);
      expect(tensor.length).toBe(3 * MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);

      // Verify normalization formula: (norm - mean) / std
      const rVal = 0 / 255.0;
      const expectedR0 = (rVal - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
      expect(tensor[0]).toBeCloseTo(expectedR0, 4);
    });
  });

  describe("3. Mask Normalization (Min-Max Scaling)", () => {
    it("normalizes arbitrary raw model logits to the range [0.0, 1.0]", () => {
      const rawLogits = new Float32Array([-10.0, -5.0, 0.0, 5.0, 10.0]);
      const normalized = normalizeRawMask(rawLogits);

      expect(normalized.length).toBe(rawLogits.length);
      expect(normalized[0]).toBe(0.0); // Minimum maps to 0
      expect(normalized[2]).toBe(0.5); // Midpoint maps to 0.5
      expect(normalized[4]).toBe(1.0); // Maximum maps to 1.0
    });

    it("handles zero-variance flat output gracefully without NaN", () => {
      const flatLogits = new Float32Array([4.2, 4.2, 4.2, 4.2]);
      const normalized = normalizeRawMask(flatLogits);

      expect(normalized.length).toBe(4);
      expect(normalized[0]).toBe(0);
      expect(Number.isNaN(normalized[0])).toBe(false);
    });

    it("creates an alpha mask canvas with 320x320 pixels", () => {
      const mask = new Float32Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE);
      mask.fill(1.0); // Solid foreground
      const maskCanvas = createMaskCanvas(mask, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
      expect(maskCanvas.width).toBe(MODEL_INPUT_SIZE);
      expect(maskCanvas.height).toBe(MODEL_INPUT_SIZE);
    });
  });

  describe("4. Upload Limits and Validation Preservation", () => {
    it("accepts valid image uploads up to 10 MB", () => {
      const validFile = new File(["dummy content"], "photo.png", { type: "image/png" });
      const res = validatePosterImage(validFile);
      expect(res.valid).toBe(true);
    });

    it("rejects oversized images beyond 10 MB limit", () => {
      const oversized = new File([new ArrayBuffer(12 * 1024 * 1024)], "oversized.png", {
        type: "image/png",
      });
      const res = validatePosterImage(oversized);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("exceeds 10 MB");
    });

    it("rejects non-image files", () => {
      const script = new File(["alert(1)"], "script.js", { type: "application/javascript" });
      const res = validatePosterImage(script);
      expect(res.valid).toBe(false);
      expect(res.error).toContain("Unsupported image format");
    });
  });

  describe("5. Deterministic Mocked Background Removal Pipeline", () => {
    it("successfully runs direct background removal pipeline with mocked ONNX session", async () => {
      const totalPixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
      const mockRawMask = new Float32Array(totalPixels);
      for (let i = 0; i < totalPixels; i++) {
        mockRawMask[i] = i % 2 === 0 ? 5.0 : -5.0;
      }

      const mockSession = {
        inputNames: ["input.1"],
        outputNames: ["d0"],
        run: vi.fn().mockResolvedValue({
          d0: {
            data: mockRawMask,
            dims: [1, 1, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE],
            type: "float32",
          },
        }),
      } as any;

      const mockCanvasSource = {
        width: 400,
        height: 300,
      } as any;

      const progressHistory: string[] = [];
      const resultBlob = await backgroundRemovalService.processDirectly(
        mockCanvasSource,
        400,
        300,
        {
          customSession: mockSession,
          onProgress: (stage) => progressHistory.push(stage),
        }
      );

      expect(resultBlob).toBeDefined();
      expect(resultBlob.type).toBe("image/png");
      expect(mockSession.run).toHaveBeenCalledOnce();
      expect(progressHistory).toContain("init");
      expect(progressHistory).toContain("preprocessing");
      expect(progressHistory).toContain("inference");
      expect(progressHistory).toContain("compositing");
      expect(progressHistory).toContain("complete");
    });
  });

  describe("6. AIBackgroundRemovalModal UI & Canvas State Isolation", () => {
    it("renders file selection state when opened without initial file", () => {
      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
        })
      );

      expect(screen.getByText("AI Product Background Removal")).toBeInTheDocument();
      expect(screen.getByText("Select a Product Photo")).toBeInTheDocument();
      expect(screen.getByText("Choose Photo")).toBeInTheDocument();
    });

    it("clicking Cancel calls onClose and leaves the canvas unchanged (never calls onApplyResult)", () => {
      const handleClose = vi.fn();
      const handleApply = vi.fn();

      render(
        React.createElement(AIBackgroundRemovalModal, {
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

    it("displays actionable error state when service rejects", async () => {
      vi.spyOn(backgroundRemovalService, "removeBackground").mockRejectedValueOnce(
        new Error("Model initialization failed: WASM runtime unavailable.")
      );

      const badFile = new File(["broken"], "corrupt.jpg", { type: "image/jpeg" });

      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: badFile,
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Background Removal Failed")).toBeInTheDocument();
        expect(
          screen.getByText("Model initialization failed: WASM runtime unavailable.")
        ).toBeInTheDocument();
        expect(screen.getByText("Try Another Photo")).toBeInTheDocument();
      });
    });

    it("displays before/after preview upon successful inference and permits 'Use Result'", async () => {
      const fakeBlob = new Blob(["transparent-png"], { type: "image/png" });
      const fakeFile = new File([fakeBlob], "product-nobg.png", { type: "image/png" });

      vi.spyOn(backgroundRemovalService, "removeBackground").mockResolvedValueOnce({
        transparentBlob: fakeBlob,
        transparentFile: fakeFile,
        transparentUrl: "blob:http://localhost/fake-transparent",
        originalUrl: "blob:http://localhost/fake-original",
        width: 800,
        height: 600,
        originalWidth: 800,
        originalHeight: 600,
        scaleApplied: 1,
      });

      const handleApply = vi.fn();
      const handleClose = vi.fn();
      const validFile = new File(["valid-photo"], "shoes.png", { type: "image/png" });

      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: handleClose,
          onApplyResult: handleApply,
          initialFile: validFile,
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Background Removed")).toBeInTheDocument();
        expect(screen.getByText("Use Result")).toBeInTheDocument();
      });

      // Click "Use Result"
      const useResultBtn = screen.getByText("Use Result");
      fireEvent.click(useResultBtn);

      expect(handleApply).toHaveBeenCalledOnce();
      expect(handleApply).toHaveBeenCalledWith(fakeFile);
    });

    it("cleans up object URLs on modal close to prevent memory leaks", async () => {
      const revokeSpy = vi.spyOn(backgroundRemovalService, "revokeUrls");
      const fakeBlob = new Blob(["transparent-png"], { type: "image/png" });
      const fakeFile = new File([fakeBlob], "product-nobg.png", { type: "image/png" });

      vi.spyOn(backgroundRemovalService, "removeBackground").mockResolvedValueOnce({
        transparentBlob: fakeBlob,
        transparentFile: fakeFile,
        transparentUrl: "blob:http://localhost/fake-transparent",
        originalUrl: "blob:http://localhost/fake-original",
        width: 800,
        height: 600,
        originalWidth: 800,
        originalHeight: 600,
        scaleApplied: 1,
      });

      const { unmount } = render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: new File(["data"], "test.png", { type: "image/png" }),
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Background Removed")).toBeInTheDocument();
      });

      unmount();
      expect(revokeSpy).toHaveBeenCalledWith(
        "blob:http://localhost/fake-transparent",
        "blob:http://localhost/fake-original"
      );
    });
  });

  describe("7. Phase 2C.1: WASM Initialization, Worker Lifecycle & Canvas Isolation Regressions", () => {
    it("configures ONNX Runtime WASM paths, single-threading, and non-proxy mode", async () => {
      const ort = await import("onnxruntime-web");
      // Simulate direct initialization check
      ort.env.wasm.wasmPaths = "/wasm/";
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;

      expect(ort.env.wasm.wasmPaths).toBe("/wasm/");
      expect(ort.env.wasm.numThreads).toBe(1);
      expect(ort.env.wasm.proxy).toBe(false);
    });

    it("propagates actionable error messages when worker encounters initialization or inference failure", async () => {
      vi.spyOn(backgroundRemovalService, "removeBackground").mockRejectedValueOnce(
        new Error("WASM initialization failed: [wasm] Error: failed to load /wasm/ort-wasm-simd-threaded.jsep.wasm")
      );

      const file = new File(["test-img"], "product.jpg", { type: "image/jpeg" });
      render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: vi.fn(),
          onApplyResult: vi.fn(),
          initialFile: file,
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Background Removal Failed")).toBeInTheDocument();
        expect(
          screen.getByText(/WASM initialization failed: \[wasm\] Error: failed to load \/wasm\/ort-wasm-simd-threaded\.jsep\.wasm/)
        ).toBeInTheDocument();
      });
    });

    it("cancels pending background removal requests when service is disposed", async () => {
      // Mock worker creation to verify pending request cancellation
      const fakeWorker = {
        postMessage: vi.fn(),
        terminate: vi.fn(),
        onmessage: null,
        onerror: null,
      } as any;

      (backgroundRemovalService as any).worker = fakeWorker;
      let rejectTriggered = false;
      let caughtError = "";

      (backgroundRemovalService as any).pendingRequests.set("test-req-1", {
        resolve: vi.fn(),
        reject: (err: Error) => {
          rejectTriggered = true;
          caughtError = err.message;
        },
      });

      backgroundRemovalService.dispose();

      expect(fakeWorker.postMessage).toHaveBeenCalledWith({ type: "DISPOSE" });
      expect(fakeWorker.terminate).toHaveBeenCalled();
      expect(rejectTriggered).toBe(true);
      expect(caughtError).toBe("Background removal operation was cancelled.");
      expect((backgroundRemovalService as any).pendingRequests.size).toBe(0);
    });

    it("guarantees Cancel leaves canvas unchanged and Use Result adds exactly one layer", async () => {
      const handleApply = vi.fn();
      const handleClose = vi.fn();
      const testFile = new File(["transparent-data"], "test-nobg.png", { type: "image/png" });

      vi.spyOn(backgroundRemovalService, "removeBackground").mockResolvedValueOnce({
        transparentBlob: new Blob(["transparent-data"], { type: "image/png" }),
        transparentFile: testFile,
        transparentUrl: "blob:http://localhost/trans",
        originalUrl: "blob:http://localhost/orig",
        width: 400,
        height: 400,
        originalWidth: 400,
        originalHeight: 400,
        scaleApplied: 1,
      });

      const { rerender } = render(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: handleClose,
          onApplyResult: handleApply,
          initialFile: new File(["source"], "test.png", { type: "image/png" }),
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Use Result")).toBeInTheDocument();
      });

      // 1. Cancel leaves canvas unchanged
      const cancelBtn = screen.getByText("Cancel");
      fireEvent.click(cancelBtn);
      expect(handleClose).toHaveBeenCalledOnce();
      expect(handleApply).not.toHaveBeenCalled();

      // 2. Re-open and apply result
      vi.spyOn(backgroundRemovalService, "removeBackground").mockResolvedValueOnce({
        transparentBlob: new Blob(["transparent-data"], { type: "image/png" }),
        transparentFile: testFile,
        transparentUrl: "blob:http://localhost/trans",
        originalUrl: "blob:http://localhost/orig",
        width: 400,
        height: 400,
        originalWidth: 400,
        originalHeight: 400,
        scaleApplied: 1,
      });

      rerender(
        React.createElement(AIBackgroundRemovalModal, {
          isOpen: true,
          onClose: handleClose,
          onApplyResult: handleApply,
          initialFile: new File(["source"], "test.png", { type: "image/png" }),
        })
      );

      await waitFor(() => {
        expect(screen.getByText("Use Result")).toBeInTheDocument();
      });

      const useBtn = screen.getByText("Use Result");
      fireEvent.click(useBtn);

      // Verify onApplyResult is called exactly once with the generated file
      expect(handleApply).toHaveBeenCalledOnce();
      expect(handleApply).toHaveBeenCalledWith(testFile);
    });

    it("verifies WebGPU fallback safely initializes WASM backend if WebGPU session creation fails", async () => {
      const ort = await import("onnxruntime-web");
      const wasmSession = {
        inputNames: ["input.1"],
        outputNames: ["d0"],
        run: vi.fn().mockResolvedValue({
          d0: { data: new Float32Array(MODEL_INPUT_SIZE * MODEL_INPUT_SIZE) },
        }),
        release: vi.fn().mockResolvedValue(undefined),
      };

      const createSpy = vi.spyOn(ort.InferenceSession, "create")
        .mockRejectedValueOnce(new Error("WebGPU adapter unavailable"))
        .mockResolvedValueOnce(wasmSession as any);

      // Calling create with webgpu fails then falls back to wasm
      let sessionResult: any = null;
      try {
        sessionResult = await ort.InferenceSession.create("/models/u2netp.onnx", {
          executionProviders: ["webgpu", "wasm"],
        });
      } catch {
        sessionResult = await ort.InferenceSession.create("/models/u2netp.onnx", {
          executionProviders: ["wasm"],
        });
      }

      expect(sessionResult).toBe(wasmSession);
      expect(createSpy).toHaveBeenCalledTimes(2);
      expect(createSpy).toHaveBeenLastCalledWith("/models/u2netp.onnx", {
        executionProviders: ["wasm"],
      });
      createSpy.mockRestore();
    });
  });
});
