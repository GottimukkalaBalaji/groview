import { PosterPreset } from "../types/poster.js";

export interface ConversionResult {
  convertedJson: string;
  targetPreset: PosterPreset;
  newName: string;
}

/**
 * Safely adapts canvas objects from a source preset dimensions to target preset dimensions
 * without modifying or overwriting the original design.
 *
 * 1. Square (1080×1080) -> Vertical Status (1080×1920):
 *    Shifts layers vertically into the center of the vertical canvas so content is not cramped at the top.
 *
 * 2. Vertical Status (1080×1920) -> Square (1080×1080):
 *    Scales vertical positions proportionally (1080/1920) and bounds object heights so no elements are clipped.
 */
export function adaptCanvasJsonToPreset(
  canvasJsonString: string,
  sourcePreset: PosterPreset,
  targetPreset: PosterPreset,
  originalTitle: string
): ConversionResult {
  let parsed: any;
  try {
    parsed = JSON.parse(canvasJsonString);
  } catch (err) {
    console.error("Failed to parse canvas JSON for conversion:", err);
    throw new Error("Invalid canvas data cannot be converted.");
  }

  const objects: any[] = Array.isArray(parsed.objects) ? parsed.objects : [];
  const srcW = sourcePreset.width || 1080;
  const srcH = sourcePreset.height || 1080;
  const dstW = targetPreset.width || 1080;
  const dstH = targetPreset.height || 1080;

  // Clone objects deeply to ensure total immutability
  const clonedObjects = objects.map((obj) => {
    const copy = JSON.parse(JSON.stringify(obj));

    const objTop = typeof copy.top === "number" ? copy.top : 0;
    const objLeft = typeof copy.left === "number" ? copy.left : 0;
    const scaleY = typeof copy.scaleY === "number" ? copy.scaleY : 1;
    const scaleX = typeof copy.scaleX === "number" ? copy.scaleX : 1;
    const objH = (copy.height || 100) * scaleY;

    if (srcH === 1080 && dstH === 1920) {
      // 1:1 Square -> 9:16 Vertical Status
      // Center content vertically by shifting down by half the height difference (+420px)
      const offsetY = Math.round((dstH - srcH) / 2);
      copy.top = Math.round(objTop + offsetY);
    } else if (srcH === 1920 && dstH === 1080) {
      // 9:16 Vertical Status -> 1:1 Square
      // Proportional vertical scaling
      const ratioY = dstH / srcH; // 1080 / 1920 = 0.5625
      let newTop = Math.round(objTop * ratioY);

      // If object height exceeds 85% of square canvas, scale it down proportionally to prevent clipping
      const maxAllowedH = dstH * 0.85;
      if (objH > maxAllowedH && copy.height) {
        const factor = maxAllowedH / objH;
        copy.scaleX = Number((scaleX * factor).toFixed(3));
        copy.scaleY = Number((scaleY * factor).toFixed(3));
      }

      // Bound within square canvas
      const adjustedH = (copy.height || 100) * (copy.scaleY || 1);
      if (newTop + adjustedH > dstH - 20) {
        newTop = Math.max(20, Math.round(dstH - adjustedH - 20));
      }
      if (newTop < 20) {
        newTop = 20;
      }
      copy.top = newTop;
    } else {
      // General scaling fallback
      const ratioX = dstW / srcW;
      const ratioY = dstH / srcH;
      copy.left = Math.round(objLeft * ratioX);
      copy.top = Math.round(objTop * ratioY);
    }

    return copy;
  });

  parsed.objects = clonedObjects;
  parsed.logicalWidth = dstW;
  parsed.logicalHeight = dstH;

  const cleanTitle = (originalTitle || "Untitled Poster").replace(/\s*\((WhatsApp Post|WhatsApp Status)\)$/i, "").trim();
  const newName = `${cleanTitle} (${targetPreset.name})`;

  return {
    convertedJson: JSON.stringify(parsed),
    targetPreset,
    newName,
  };
}
