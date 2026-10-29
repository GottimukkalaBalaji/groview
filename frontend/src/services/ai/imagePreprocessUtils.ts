/**
 * Grovastra Poster Studio — Image Preprocessing & Mask Postprocessing Utilities
 * Optimized for U²-Netp ONNX background removal in browser / Web Worker.
 */

export const MODEL_INPUT_SIZE = 320;
export const MAX_PROCESS_DIMENSION = 2048; // Protect mobile browser memory from >48MP raw images

// ImageNet standardization parameters expected by standard U²-Netp
export const IMAGENET_MEAN = [0.485, 0.456, 0.406];
export const IMAGENET_STD = [0.229, 0.224, 0.225];

/**
 * Bounds image dimensions while strictly preserving aspect ratio.
 */
export function calculateBoundedDimensions(
  origWidth: number,
  origHeight: number,
  maxDimension: number = MAX_PROCESS_DIMENSION
): { width: number; height: number; scale: number } {
  if (origWidth <= 0 || origHeight <= 0) {
    return { width: 320, height: 320, scale: 1 };
  }

  const maxEdge = Math.max(origWidth, origHeight);
  if (maxEdge <= maxDimension) {
    return { width: origWidth, height: origHeight, scale: 1 };
  }

  const scale = maxDimension / maxEdge;
  return {
    width: Math.round(origWidth * scale),
    height: Math.round(origHeight * scale),
    scale,
  };
}

/**
 * Creates an OffscreenCanvas or fallback HTMLCanvasElement based on runtime capability.
 */
export function createCompatibleCanvas(width: number, height: number): OffscreenCanvas | HTMLCanvasElement {
  if (typeof OffscreenCanvas !== "undefined") {
    return new OffscreenCanvas(Math.max(1, width), Math.max(1, height));
  }
  if (typeof document !== "undefined") {
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, width);
    canvas.height = Math.max(1, height);
    return canvas;
  }
  throw new Error("Canvas is not supported in the current execution environment.");
}

/**
 * Extracts RGB pixels from an image source, resizes to 320x320, and normalizes into
 * a planar Float32Array [1, 3, 320, 320] (CHW layout).
 */
export function preprocessImageToTensor(
  imageSource: CanvasImageSource,
  sourceWidth: number,
  sourceHeight: number
): Float32Array {
  const canvas = createCompatibleCanvas(MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const ctx = canvas.getContext("2d", { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!ctx) {
    throw new Error("Failed to obtain 2D rendering context for model preprocessing.");
  }

  // Draw scaled to 320x320
  ctx.drawImage(imageSource, 0, 0, sourceWidth, sourceHeight, 0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const imageData = ctx.getImageData(0, 0, MODEL_INPUT_SIZE, MODEL_INPUT_SIZE);
  const { data } = imageData;

  const totalPixels = MODEL_INPUT_SIZE * MODEL_INPUT_SIZE;
  const tensor = new Float32Array(totalPixels * 3);

  const planeR = 0;
  const planeG = totalPixels;
  const planeB = totalPixels * 2;

  for (let i = 0; i < totalPixels; i++) {
    const r = data[i * 4 + 0] / 255.0;
    const g = data[i * 4 + 1] / 255.0;
    const b = data[i * 4 + 2] / 255.0;

    tensor[planeR + i] = (r - IMAGENET_MEAN[0]) / IMAGENET_STD[0];
    tensor[planeG + i] = (g - IMAGENET_MEAN[1]) / IMAGENET_STD[1];
    tensor[planeB + i] = (b - IMAGENET_MEAN[2]) / IMAGENET_STD[2];
  }

  return tensor;
}

/**
 * Normalizes raw model output mask using Min-Max scaling to ensure consistent [0.0, 1.0] range.
 */
export function normalizeRawMask(rawMask: Float32Array | number[]): Float32Array {
  let min = Infinity;
  let max = -Infinity;

  for (let i = 0; i < rawMask.length; i++) {
    const val = rawMask[i];
    if (val < min) min = val;
    if (val > max) max = val;
  }

  const range = max - min;
  const normalized = new Float32Array(rawMask.length);

  for (let i = 0; i < rawMask.length; i++) {
    normalized[i] = range > 1e-6 ? (rawMask[i] - min) / range : 0;
  }

  return normalized;
}

/**
 * Renders a 320x320 normalized probability mask into an RGBA canvas for bilinear scaling.
 */
export function createMaskCanvas(
  normalizedMask: Float32Array,
  maskWidth: number = MODEL_INPUT_SIZE,
  maskHeight: number = MODEL_INPUT_SIZE
): OffscreenCanvas | HTMLCanvasElement {
  const canvas = createCompatibleCanvas(maskWidth, maskHeight);
  const ctx = canvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!ctx) throw new Error("Could not acquire context for mask canvas.");

  const imgData = ctx.createImageData(maskWidth, maskHeight);
  const { data } = imgData;

  for (let i = 0; i < normalizedMask.length; i++) {
    const alpha = Math.max(0, Math.min(255, Math.round(normalizedMask[i] * 255)));
    data[i * 4 + 0] = 255;
    data[i * 4 + 1] = 255;
    data[i * 4 + 2] = 255;
    data[i * 4 + 3] = alpha;
  }

  ctx.putImageData(imgData, 0, 0);
  return canvas;
}

/**
 * Composites the original image with the upscaled alpha mask to produce a transparent PNG.
 * Preserves original RGB colors and pre-existing alpha.
 */
export async function compositeAlphaMask(
  sourceCanvas: CanvasImageSource,
  maskCanvas: CanvasImageSource,
  width: number,
  height: number
): Promise<Blob> {
  const compositeCanvas = createCompatibleCanvas(width, height);
  const ctx = compositeCanvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!ctx) throw new Error("Could not acquire 2D context for compositing.");

  // 1. Draw original source image
  ctx.drawImage(sourceCanvas, 0, 0, width, height);

  // 2. Hardware-accelerated destination-in composite multiplies alpha channel
  ctx.globalCompositeOperation = "destination-in";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(maskCanvas, 0, 0, width, height);

  // 3. Reset composite operation
  ctx.globalCompositeOperation = "source-over";

  // Convert to Blob
  if ("convertToBlob" in compositeCanvas) {
    return await (compositeCanvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
  }

  return new Promise<Blob>((resolve, reject) => {
    (compositeCanvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export composite transparent PNG blob."));
    }, "image/png");
  });
}

/**
 * Inpaints and extends background colors inward behind the foreground subject.
 * This completely eliminates foreground color contamination (e.g. bright white shirt bleeding
 * into dark background or dark hair bleeding into light background) when applying Gaussian blur.
 */
export function prepareInfilledBackgroundPlate(
  sourceCanvas: CanvasImageSource,
  foregroundCutout: CanvasImageSource,
  width: number,
  height: number
): OffscreenCanvas | HTMLCanvasElement {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const origCanvas = createCompatibleCanvas(w, h);
  const origCtx = origCanvas.getContext("2d", { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  const fgCanvas = createCompatibleCanvas(w, h);
  const fgCtx = fgCanvas.getContext("2d", { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!origCtx || !fgCtx) {
    throw new Error("Could not acquire 2D context for background plate inpainting.");
  }

  let origImgData: ImageData | null = null;
  let fgImgData: ImageData | null = null;

  try {
    if ("getContext" in sourceCanvas && typeof (sourceCanvas as any).getContext === "function") {
      const sCtx = (sourceCanvas as any).getContext("2d");
      origImgData = sCtx?.getImageData ? sCtx.getImageData(0, 0, w, h) : null;
    }
    if (!origImgData || !origImgData.data || origImgData.data.length === 0) {
      origCtx.drawImage(sourceCanvas, 0, 0, w, h);
      origImgData = origCtx.getImageData(0, 0, w, h);
    }

    if ("getContext" in foregroundCutout && typeof (foregroundCutout as any).getContext === "function") {
      const fCtx = (foregroundCutout as any).getContext("2d");
      fgImgData = fCtx?.getImageData ? fCtx.getImageData(0, 0, w, h) : null;
    }
    if (!fgImgData || !fgImgData.data || fgImgData.data.length === 0) {
      fgCtx.drawImage(foregroundCutout, 0, 0, w, h);
      fgImgData = fgCtx.getImageData(0, 0, w, h);
    }
  } catch (e) {
    console.warn("[prepareInfilledBackgroundPlate] getImageData failed or mocked, returning original canvas:", e);
    return origCanvas;
  }

  if (!origImgData || !fgImgData || !origImgData.data || !fgImgData.data) {
    return origCanvas;
  }

  const origData = origImgData.data;
  const fgData = fgImgData.data;
  const totalPixels = w * h;

  if (origData.length < totalPixels * 4 || fgData.length < totalPixels * 4) {
    return origCanvas;
  }

  const plateImgData = origCtx.createImageData(w, h);
  const plateData = plateImgData.data;
  plateData.set(origData);

  // 1 = known background pixel (safe to sample), 0 = foreground pixel needing infill
  const known = new Uint8Array(totalPixels);
  let foregroundPixelCount = 0;

  for (let i = 0; i < totalPixels; i++) {
    const alphaFg = fgData[i * 4 + 3];
    // Low foreground alpha (< 32) indicates genuine background pixel
    if (alphaFg < 32) {
      known[i] = 1;
    } else {
      known[i] = 0;
      foregroundPixelCount++;
    }
  }

  // If entirely background or entirely foreground, return original plate directly
  if (foregroundPixelCount === 0 || foregroundPixelCount === totalPixels) {
    origCtx.putImageData(plateImgData, 0, 0);
    return origCanvas;
  }

  // Multi-step jump flood / dilation inward to propagate background edge colors into foreground area
  const steps = [1, 2, 4, 8, 16, 24];

  for (let s = 0; s < steps.length; s++) {
    const step = steps[s];
    let newlyFilled = 0;

    for (let y = 0; y < h; y++) {
      const rowOffset = y * w;
      for (let x = 0; x < w; x++) {
        const idx = rowOffset + x;
        if (known[idx]) continue;

        let sumR = 0, sumG = 0, sumB = 0, count = 0;

        if (x - step >= 0) {
          const nidx = rowOffset + (x - step);
          if (known[nidx]) {
            const p = nidx * 4;
            sumR += plateData[p];
            sumG += plateData[p + 1];
            sumB += plateData[p + 2];
            count++;
          }
        }
        if (x + step < w) {
          const nidx = rowOffset + (x + step);
          if (known[nidx]) {
            const p = nidx * 4;
            sumR += plateData[p];
            sumG += plateData[p + 1];
            sumB += plateData[p + 2];
            count++;
          }
        }
        if (y - step >= 0) {
          const nidx = (y - step) * w + x;
          if (known[nidx]) {
            const p = nidx * 4;
            sumR += plateData[p];
            sumG += plateData[p + 1];
            sumB += plateData[p + 2];
            count++;
          }
        }
        if (y + step < h) {
          const nidx = (y + step) * w + x;
          if (known[nidx]) {
            const p = nidx * 4;
            sumR += plateData[p];
            sumG += plateData[p + 1];
            sumB += plateData[p + 2];
            count++;
          }
        }

        if (count > 0) {
          const p = idx * 4;
          plateData[p] = (sumR / count) | 0;
          plateData[p + 1] = (sumG / count) | 0;
          plateData[p + 2] = (sumB / count) | 0;
          // Preserve 100% opacity in infilled background plate unless original image pixel was transparent
          plateData[p + 3] = origData[p + 3] === 0 ? 0 : 255;
          newlyFilled++;
        }
      }
    }

    if (newlyFilled > 0) {
      for (let y = 0; y < h; y++) {
        const rowOffset = y * w;
        for (let x = 0; x < w; x++) {
          const idx = rowOffset + x;
          if (!known[idx]) {
            const p = idx * 4;
            if (
              plateData[p] !== origData[p] ||
              plateData[p + 1] !== origData[p + 1] ||
              plateData[p + 2] !== origData[p + 2]
            ) {
              known[idx] = 1;
            }
          }
        }
      }
    }
  }

  origCtx.putImageData(plateImgData, 0, 0);
  (origCanvas as any)._plateImgData = plateImgData;
  return origCanvas;
}

/**
 * Composites the sharp foreground cutout over the blurred background plate.
 * Eliminates halos by using an infilled background plate where the foreground subject
 * is pre-extended with neighboring background colors before blurring.
 */
export async function compositeBlurredBackground(
  sourceCanvas: CanvasImageSource,
  foregroundCutout: CanvasImageSource,
  width: number,
  height: number,
  blurRadius: number = 12,
  infilledBackground?: CanvasImageSource | null
): Promise<Blob> {
  const compositeCanvas = createCompatibleCanvas(width, height);
  const ctx = compositeCanvas.getContext("2d") as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!ctx) throw new Error("Could not acquire 2D context for blur compositing.");

  const radius = Math.max(0, Math.min(100, Math.round(blurRadius)));

  // Clear canvas
  ctx.clearRect(0, 0, width, height);

  // 1. Draw blurred background
  if (radius > 0) {
    const bgPlate =
      infilledBackground || prepareInfilledBackgroundPlate(sourceCanvas, foregroundCutout, width, height);

    ctx.save();
    // Overscan bleed margin avoids transparent edge fading from Gaussian filter
    const bleed = Math.ceil(radius * 1.5);
    ctx.filter = `blur(${radius}px)`;
    ctx.drawImage(bgPlate, -bleed, -bleed, width + 2 * bleed, height + 2 * bleed);
    ctx.restore();
  } else {
    // 0px blur: draw sharp unblurred original background
    ctx.drawImage(sourceCanvas, 0, 0, width, height);
  }

  // 2. Draw 100% sharp foreground cutout on top
  ctx.save();
  ctx.filter = "none";
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = "high";
  ctx.drawImage(foregroundCutout, 0, 0, width, height);
  ctx.restore();

  // 3. Export as PNG Blob
  if ("convertToBlob" in compositeCanvas) {
    return await (compositeCanvas as OffscreenCanvas).convertToBlob({ type: "image/png" });
  }

  return new Promise<Blob>((resolve, reject) => {
    (compositeCanvas as HTMLCanvasElement).toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("Failed to export composite blurred background blob."));
    }, "image/png");
  });
}

export interface BrushPoint {
  x: number;
  y: number;
}

export interface BrushStroke {
  tool: "keep" | "remove";
  size: number;
  points: BrushPoint[];
}

/**
 * Extracts a 2D editable alpha mask canvas from a transparent cutout image.
 * RGB channels are set to 255 (white) and Alpha channel matches the cutout's alpha.
 */
export function createEditableMaskFromCutout(
  cutoutSource: CanvasImageSource,
  width: number,
  height: number
): OffscreenCanvas | HTMLCanvasElement {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));

  const maskCanvas = createCompatibleCanvas(w, h);
  const maskCtx = maskCanvas.getContext("2d", { willReadFrequently: true }) as
    | CanvasRenderingContext2D
    | OffscreenCanvasRenderingContext2D
    | null;

  if (!maskCtx) throw new Error("Could not acquire 2D context for editable mask canvas.");

  // Draw the cutout to read its alpha channel
  maskCtx.drawImage(cutoutSource, 0, 0, w, h);

  let imgData: ImageData | null = null;
  try {
    imgData = maskCtx.getImageData(0, 0, w, h);
  } catch (e) {
    console.warn("[createEditableMaskFromCutout] getImageData failed or mocked:", e);
    return maskCanvas;
  }

  if (imgData && imgData.data) {
    const { data } = imgData;
    for (let i = 0; i < data.length; i += 4) {
      const alpha = data[i + 3];
      data[i] = 255;
      data[i + 1] = 255;
      data[i + 2] = 255;
      data[i + 3] = alpha;
    }
    maskCtx.putImageData(imgData, 0, 0);
  }

  return maskCanvas;
}

/**
 * Renders a manual brush stroke onto an editable mask canvas.
 * - "keep": Paints white (alpha 255) using source-over to restore foreground pixels from the original image.
 * - "remove": Erases pixels (alpha 0) using destination-out to clear unwanted background pixels.
 */
export function applyBrushStrokeToMask(
  ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D,
  stroke: BrushStroke
): void {
  const { tool, size, points } = stroke;
  if (!points || points.length === 0) return;

  ctx.save();
  ctx.lineCap = "round";
  ctx.lineJoin = "round";
  ctx.lineWidth = Math.max(1, size);

  if (tool === "keep") {
    ctx.globalCompositeOperation = "source-over";
    ctx.strokeStyle = "rgba(255, 255, 255, 1.0)";
    ctx.fillStyle = "rgba(255, 255, 255, 1.0)";
  } else {
    ctx.globalCompositeOperation = "destination-out";
    ctx.strokeStyle = "rgba(0, 0, 0, 1.0)";
    ctx.fillStyle = "rgba(0, 0, 0, 1.0)";
  }

  if (points.length === 1) {
    // Single tap/dot
    const pt = points[0];
    ctx.beginPath();
    ctx.arc(pt.x, pt.y, Math.max(1, size) / 2, 0, Math.PI * 2);
    ctx.fill();
  } else {
    // Connected drag path
    ctx.beginPath();
    ctx.moveTo(points[0].x, points[0].y);
    for (let i = 1; i < points.length; i++) {
      ctx.lineTo(points[i].x, points[i].y);
    }
    ctx.stroke();
  }

  ctx.restore();
}

/**
 * Re-composites the original image with an edited mask canvas.
 * Restored foreground pixels retain 100% of their original RGB values with no blur or color contamination.
 */
export async function recompositeCutout(
  originalSource: CanvasImageSource,
  maskCanvas: CanvasImageSource,
  width: number,
  height: number
): Promise<Blob> {
  return compositeAlphaMask(originalSource, maskCanvas, width, height);
}


