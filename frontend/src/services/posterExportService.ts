import { Canvas } from "fabric";
import { PosterExportOptions } from "../types/poster.js";

export interface ExportResult {
  dataUrl: string;
  width: number;
  height: number;
  format: "png" | "jpeg";
  filename: string;
}

/**
 * Exports a Fabric.js canvas at the exact logical poster dimensions,
 * regardless of the current viewport zoom/pan level.
 */
export function exportCanvasToImage(
  canvas: Canvas,
  targetWidth: number,
  targetHeight: number,
  options: PosterExportOptions
): ExportResult {
  const format = options.format || "png";
  const quality = options.quality !== undefined ? options.quality : 0.92;
  const extension = format === "jpeg" ? "jpg" : "png";
  const filename = options.filename || `grovastra-poster-${Date.now()}.${extension}`;

  // Deselect active object to avoid exporting selection bounding box
  canvas.discardActiveObject?.();

  // Save current viewport transform & zoom
  const currentZoom = canvas.getZoom ? canvas.getZoom() : 1;
  const currentVpt = canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0];
  const currentWidth = canvas.getWidth ? canvas.getWidth() : targetWidth;
  const currentHeight = canvas.getHeight ? canvas.getHeight() : targetHeight;

  try {
    // Set canvas dimensions to the full logical target dimensions
    canvas.setDimensions?.({ width: targetWidth, height: targetHeight });
    canvas.setZoom?.(1);
    canvas.setViewportTransform?.([1, 0, 0, 1, 0, 0]);

    const dataUrl = canvas.toDataURL({
      format: format === "jpeg" ? "jpeg" : "png",
      quality: format === "jpeg" ? quality : undefined,
      multiplier: 1,
      enableRetinaScaling: false,
    });

    return {
      dataUrl,
      width: targetWidth,
      height: targetHeight,
      format,
      filename,
    };
  } finally {
    // Always restore the previous zoom, dimensions and viewport transform
    canvas.setViewportTransform?.(currentVpt as [number, number, number, number, number, number]);
    canvas.setZoom?.(currentZoom);
    canvas.setDimensions?.({ width: currentWidth, height: currentHeight });
    canvas.requestRenderAll?.();
  }
}

/**
 * Triggers a browser file download for a dataURL string.
 */
export function downloadDataUrl(dataUrl: string, filename: string): void {
  const link = document.createElement("a");
  link.href = dataUrl;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
}

/**
 * Generates a lightweight JPEG dataURL thumbnail of the canvas.
 * Restores previous zoom and dimensions upon completion.
 */
export function generateCanvasThumbnail(
  canvas: Canvas,
  targetWidth: number,
  targetHeight: number,
  maxSize: number = 240
): string | undefined {
  if (!canvas) return undefined;

  // Deselect active object to avoid exporting selection bounding box
  canvas.discardActiveObject();

  const currentZoom = canvas.getZoom();
  const currentVpt = canvas.viewportTransform ? [...canvas.viewportTransform] : [1, 0, 0, 1, 0, 0];
  const currentWidth = canvas.getWidth();
  const currentHeight = canvas.getHeight();

  try {
    const scale = Math.min(maxSize / targetWidth, maxSize / targetHeight, 1);
    const multiplier = Number(scale.toFixed(3));

    canvas.setDimensions({ width: targetWidth, height: targetHeight });
    canvas.setZoom(1);
    canvas.setViewportTransform([1, 0, 0, 1, 0, 0]);

    return canvas.toDataURL({
      format: "jpeg",
      quality: 0.7,
      multiplier,
      enableRetinaScaling: false,
    });
  } catch {
    // In test or non-browser/tainted environments, gracefully return undefined
    return undefined;
  } finally {
    canvas.setViewportTransform(currentVpt as [number, number, number, number, number, number]);
    canvas.setZoom(currentZoom);
    canvas.setDimensions({ width: currentWidth, height: currentHeight });
    canvas.requestRenderAll();
  }
}

/**
 * Converts a data URL to a binary Blob in memory without network or disk access.
 */
export function dataUrlToBlob(dataUrl: string): Blob {
  const arr = dataUrl.split(",");
  const mime = arr[0].match(/:(.*?);/)?.[1] || "image/png";
  const bstr = atob(arr[1] || "");
  let n = bstr.length;
  const u8arr = new Uint8Array(n);
  while (n--) {
    u8arr[n] = bstr.charCodeAt(n);
  }
  return new Blob([u8arr], { type: mime });
}

/**
 * Exports a Fabric.js canvas as an in-memory Blob without downloading to disk.
 */
export function exportCanvasToBlob(
  canvas: Canvas,
  targetWidth: number,
  targetHeight: number,
  options: PosterExportOptions = { format: "png" }
): { blob: Blob; dataUrl: string; width: number; height: number; filename: string } {
  const result = exportCanvasToImage(canvas, targetWidth, targetHeight, options);
  const blob = dataUrlToBlob(result.dataUrl);

  return {
    blob,
    dataUrl: result.dataUrl,
    width: result.width,
    height: result.height,
    filename: result.filename,
  };
}
