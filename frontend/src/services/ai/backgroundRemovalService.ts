/**
 * Grovastra Poster Studio — AI Background Removal Service
 * Coordinates U²-Netp ONNX inference in a dedicated Web Worker with main-thread safety fallbacks.
 */

import type * as ort from "onnxruntime-web";
import { validatePosterImage } from "../../types/poster";
import {
  calculateBoundedDimensions,
  createCompatibleCanvas,
  MODEL_INPUT_SIZE,
  MAX_PROCESS_DIMENSION,
  preprocessImageToTensor,
  normalizeRawMask,
  createMaskCanvas,
  compositeAlphaMask,
  compositeBlurredBackground,
  prepareInfilledBackgroundPlate,
  createEditableMaskFromCutout,
  applyBrushStrokeToMask,
  recompositeCutout,
  BrushStroke,
} from "./imagePreprocessUtils";

export type ProgressStage = "init" | "preprocessing" | "inference" | "compositing" | "complete";

export interface BackgroundRemovalOptions {
  modelUrl?: string;
  maxDimension?: number;
  onProgress?: (stage: ProgressStage, progress: number) => void;
}

export interface BackgroundBlurResult {
  blurredBlob: Blob;
  blurredFile: File;
  blurredUrl: string;
  originalUrl: string;
  transparentUrl: string;
  width: number;
  height: number;
  blurRadius: number;
}

export interface BackgroundRemovalResult {
  transparentBlob: Blob;
  transparentFile: File;
  transparentUrl: string;
  originalUrl: string;
  width: number;
  height: number;
  originalWidth: number;
  originalHeight: number;
  scaleApplied: number;
}

class BackgroundRemovalService {
  private worker: Worker | null = null;
  private isInitializingWorker = false;
  private pendingRequests = new Map<
    string,
    {
      resolve: (blob: Blob) => void;
      reject: (err: Error) => void;
      onProgress?: (stage: ProgressStage, progress: number) => void;
    }
  >();

  /**
   * Initializes or reuses the background removal Web Worker.
   */
  private getWorker(): Worker | null {
    if (typeof Worker === "undefined") {
      return null;
    }

    if (!this.worker && !this.isInitializingWorker) {
      try {
        this.isInitializingWorker = true;
        this.worker = new Worker(new URL("../../workers/bgRemoval.worker.ts", import.meta.url), {
          type: "module",
        });

        this.worker.onmessage = (e: MessageEvent) => {
          const { type, id, stage, progress, blob, error } = e.data || {};
          const pending = id ? this.pendingRequests.get(id) : null;

          if (type === "PROGRESS" && pending?.onProgress) {
            pending.onProgress(stage, progress);
          } else if (type === "PROCESS_SUCCESS" && pending) {
            this.pendingRequests.delete(id);
            pending.resolve(blob);
          } else if (type === "PROCESS_ERROR" && pending) {
            this.pendingRequests.delete(id);
            pending.reject(new Error(error || "Worker processing error."));
          }
        };

        this.worker.onerror = (err) => {
          console.error("[BackgroundRemovalService] Worker error:", err);
          const errorMsg =
            err instanceof ErrorEvent && err.message
              ? `Web Worker error: ${err.message}`
              : "Web Worker encountered an unexpected error.";
          this.pendingRequests.forEach(({ reject }) => {
            reject(new Error(errorMsg));
          });
          this.pendingRequests.clear();
        };
      } catch (err) {
        console.warn("[BackgroundRemovalService] Could not instantiate Web Worker:", err);
        this.worker = null;
      } finally {
        this.isInitializingWorker = false;
      }
    }

    return this.worker;
  }

  /**
   * Loads an image file and extracts its natural dimensions.
   */
  public async decodeImageSource(
    file: File
  ): Promise<{ source: HTMLImageElement | ImageBitmap; width: number; height: number; originalUrl: string }> {
    const originalUrl = URL.createObjectURL(file);

    if (typeof createImageBitmap !== "undefined") {
      try {
        const bitmap = await createImageBitmap(file);
        return {
          source: bitmap,
          width: bitmap.width,
          height: bitmap.height,
          originalUrl,
        };
      } catch (err) {
        console.warn("[BackgroundRemovalService] createImageBitmap failed, falling back to Image element:", err);
      }
    }

    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => {
        resolve({
          source: img,
          width: img.naturalWidth || img.width,
          height: img.naturalHeight || img.height,
          originalUrl,
        });
      };
      img.onerror = () => {
        URL.revokeObjectURL(originalUrl);
        reject(new Error("Failed to load and decode image. The file may be corrupt or an unsupported format."));
      };
      img.src = originalUrl;
    });
  }

  /**
   * Primary entry point: Removes the background from a user-supplied image file.
   */
  public async removeBackground(
    file: File,
    options: BackgroundRemovalOptions = {}
  ): Promise<BackgroundRemovalResult> {
    // 1. Validate file constraints (size <= 10 MB and valid image mime)
    const validation = validatePosterImage(file);
    if (!validation.valid) {
      throw new Error(validation.error || "Invalid image file.");
    }

    const { maxDimension = MAX_PROCESS_DIMENSION, onProgress, modelUrl = "/models/u2netp.onnx" } = options;

    // 2. Decode source image and measure dimensions
    const { source, width: origWidth, height: origHeight, originalUrl } = await this.decodeImageSource(file);

    // 3. Compute memory-safe bounded dimensions
    const bounded = calculateBoundedDimensions(origWidth, origHeight, maxDimension);
    const targetWidth = bounded.width;
    const targetHeight = bounded.height;

    // 4. Prepare bounded canvas source
    const boundedCanvas = createCompatibleCanvas(targetWidth, targetHeight);
    const bCtx = boundedCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;

    if (!bCtx) {
      URL.revokeObjectURL(originalUrl);
      throw new Error("Unable to create canvas context for image processing.");
    }

    bCtx.drawImage(source, 0, 0, origWidth, origHeight, 0, 0, targetWidth, targetHeight);

    // Close raw source bitmap if applicable
    if ("close" in source && typeof source.close === "function") {
      try {
        source.close();
      } catch {
        // ignore
      }
    }

    let transparentBlob: Blob;
    const worker = this.getWorker();

    // 5. Run inference via Web Worker where supported
    if (worker && typeof createImageBitmap !== "undefined") {
      const transferBitmap = await createImageBitmap(boundedCanvas);
      const requestId = `req_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;

      transparentBlob = await new Promise<Blob>((resolve, reject) => {
        this.pendingRequests.set(requestId, { resolve, reject, onProgress });

        worker.postMessage(
          {
            type: "PROCESS",
            id: requestId,
            imageBitmap: transferBitmap,
            width: targetWidth,
            height: targetHeight,
          },
          [transferBitmap]
        );
      });
    } else {
      // Direct main-thread execution fallback (for testing or environments lacking Web Worker support)
      transparentBlob = await this.processDirectly(boundedCanvas, targetWidth, targetHeight, {
        modelUrl,
        onProgress,
      });
    }

    // 6. Wrap result in transparent PNG File and create object URL
    const transparentUrl = URL.createObjectURL(transparentBlob);
    const baseName = file.name.replace(/\.[^/.]+$/, "");
    const transparentFile = new File([transparentBlob], `${baseName}-nobg.png`, {
      type: "image/png",
    });

    return {
      transparentBlob,
      transparentFile,
      transparentUrl,
      originalUrl,
      width: targetWidth,
      height: targetHeight,
      originalWidth: origWidth,
      originalHeight: origHeight,
      scaleApplied: bounded.scale,
    };
  }

  /**
   * Helper to load an image URL into an HTMLImageElement for canvas compositing.
   */
  public async loadImageElement(url: string): Promise<HTMLImageElement> {
    return new Promise((resolve, reject) => {
      const img = new Image();
      img.crossOrigin = "anonymous";
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Failed to load image element from URL."));
      img.src = url;
    });
  }

  /**
   * Pre-computes infilled background plate once per segmented image.
   * Eliminates foreground color halos (e.g. bright white shirt bleeding into background).
   */
  public prepareInfilledBackground(
    originalSource: CanvasImageSource,
    foregroundSource: CanvasImageSource,
    width: number,
    height: number
  ): CanvasImageSource {
    return prepareInfilledBackgroundPlate(originalSource, foregroundSource, width, height);
  }

  /**
   * Generates a composite blurred background image using an existing sharp cutout and original image.
   * Runs locally in canvas in <20ms without re-running ONNX model inference.
   */
  public async createBlurredComposite(
    originalSource: CanvasImageSource,
    foregroundSource: CanvasImageSource,
    width: number,
    height: number,
    blurRadius: number = 12,
    fileName: string = "product-blurred.png",
    infilledSource?: CanvasImageSource | null
  ): Promise<{ blurredBlob: Blob; blurredFile: File; blurredUrl: string }> {
    const blurredBlob = await compositeBlurredBackground(
      originalSource,
      foregroundSource,
      width,
      height,
      blurRadius,
      infilledSource
    );
    const blurredUrl = URL.createObjectURL(blurredBlob);
    const blurredFile = new File([blurredBlob], fileName, { type: "image/png" });

    return {
      blurredBlob,
      blurredFile,
      blurredUrl,
    };
  }

  /**
   * Creates an editable alpha mask canvas from a transparent cutout image.
   */
  public createEditableMask(
    cutoutSource: CanvasImageSource,
    width: number,
    height: number
  ): OffscreenCanvas | HTMLCanvasElement {
    return createEditableMaskFromCutout(cutoutSource, width, height);
  }

  /**
   * Applies a manual Keep or Remove brush stroke onto the editable mask canvas.
   */
  public applyBrushStroke(
    maskCanvas: OffscreenCanvas | HTMLCanvasElement,
    stroke: BrushStroke
  ): void {
    const ctx = maskCanvas.getContext("2d") as
      | CanvasRenderingContext2D
      | OffscreenCanvasRenderingContext2D
      | null;
    if (ctx) {
      applyBrushStrokeToMask(ctx, stroke);
    }
  }

  /**
   * Re-composites the original image with an updated mask canvas to generate a refined transparent PNG.
   * Original source pixels are 100% preserved without blur or recoloring.
   */
  public async recompositeWithMask(
    originalSource: CanvasImageSource,
    maskCanvas: CanvasImageSource,
    width: number,
    height: number,
    fileName: string = "refined-cutout.png"
  ): Promise<{ transparentBlob: Blob; transparentFile: File; transparentUrl: string }> {
    const transparentBlob = await recompositeCutout(originalSource, maskCanvas, width, height);
    const transparentUrl = URL.createObjectURL(transparentBlob);
    const transparentFile = new File([transparentBlob], fileName, { type: "image/png" });

    return {
      transparentBlob,
      transparentFile,
      transparentUrl,
    };
  }

  /**
   * Direct execution fallback without Web Worker (used in tests or constrained environments).
   */
  public async processDirectly(
    canvasSource: CanvasImageSource,
    width: number,
    height: number,
    options: {
      modelUrl?: string;
      customSession?: ort.InferenceSession;
      onProgress?: (stage: ProgressStage, progress: number) => void;
    } = {}
  ): Promise<Blob> {
    const { modelUrl = "/models/u2netp.onnx", customSession, onProgress } = options;

    onProgress?.("init", 10);
    let session = customSession;
    let ownSession = false;

    const ort = await import("onnxruntime-web");

    if (!session) {
      ort.env.wasm.wasmPaths = "/wasm/";
      ort.env.wasm.numThreads = 1;
      ort.env.wasm.proxy = false;
      session = await ort.InferenceSession.create(modelUrl, {
        executionProviders: ["wasm"],
        graphOptimizationLevel: "all",
      });
      ownSession = true;
    }

    try {
      onProgress?.("preprocessing", 30);
      const tensorData = preprocessImageToTensor(canvasSource, width, height);

      onProgress?.("inference", 60);
      const inputTensor = new ort.Tensor("float32", tensorData, [1, 3, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE]);
      const inputName = session.inputNames[0] || "input.1";
      const outputName = session.outputNames[0] || "d0";

      const results = await session.run({ [inputName]: inputTensor });
      const outputTensor = results[outputName];

      if (!outputTensor) {
        throw new Error(`Output tensor '${outputName}' not found in direct inference.`);
      }

      onProgress?.("compositing", 85);
      const rawMask = outputTensor.data as Float32Array;
      const normalizedMask = normalizeRawMask(rawMask);
      const maskCanvas = createMaskCanvas(normalizedMask, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);

      const transparentBlob = await compositeAlphaMask(canvasSource, maskCanvas, width, height);
      onProgress?.("complete", 100);
      return transparentBlob;
    } finally {
      if (ownSession && session) {
        try {
          await session.release();
        } catch {
          // ignore release error
        }
      }
    }
  }

  /**
   * Terminates active Web Worker and disposes session.
   */
  public dispose(): void {
    if (this.worker) {
      try {
        this.worker.postMessage({ type: "DISPOSE" });
        this.worker.terminate();
      } catch (err) {
        console.warn("[BackgroundRemovalService] Error terminating worker:", err);
      }
      this.worker = null;
    }
    this.pendingRequests.forEach(({ reject }) => {
      reject(new Error("Background removal operation was cancelled."));
    });
    this.pendingRequests.clear();
  }

  /**
   * Revokes temporary object URLs to prevent memory leaks.
   */
  public revokeUrls(...urls: (string | undefined | null)[]): void {
    urls.forEach((url) => {
      if (url && typeof url === "string" && url.startsWith("blob:")) {
        try {
          URL.revokeObjectURL(url);
        } catch {
          // ignore
        }
      }
    });
  }
}

export const backgroundRemovalService = new BackgroundRemovalService();
