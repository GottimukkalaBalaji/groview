export type ExportFormat = "png" | "jpeg";

export interface PosterDimensions {
  width: number;
  height: number;
}

export interface PosterPreset {
  id: string;
  name: string;
  width: number;
  height: number;
  ratioLabel: string;
  description: string;
}

export const POSTER_PRESETS: PosterPreset[] = [
  {
    id: "whatsapp-post",
    name: "WhatsApp Post",
    width: 1080,
    height: 1080,
    ratioLabel: "1:1",
    description: "Square poster (1080×1080) for WhatsApp campaign creatives",
  },
];

export const LEGACY_POSTER_PRESETS: PosterPreset[] = [
  {
    id: "whatsapp-status",
    name: "WhatsApp Status",
    width: 1080,
    height: 1920,
    ratioLabel: "9:16",
    description: "Vertical poster (1080×1920) for WhatsApp Status",
  },
  {
    id: "square-1080",
    name: "WhatsApp Post",
    width: 1080,
    height: 1080,
    ratioLabel: "1:1",
    description: "Square poster (1080×1080) for WhatsApp chat sharing",
  },
  {
    id: "story-1080-1920",
    name: "WhatsApp Status",
    width: 1080,
    height: 1920,
    ratioLabel: "9:16",
    description: "Vertical poster (1080×1920) for WhatsApp Status",
  },
  {
    id: "landscape-1200-628",
    name: "Banner Header",
    width: 1200,
    height: 628,
    ratioLabel: "1.91:1",
    description: "Wide promotional banner & link preview",
  },
  {
    id: "whatsapp-header",
    name: "WhatsApp Header",
    width: 1200,
    height: 628,
    ratioLabel: "1.91:1",
    description: "WhatsApp Template Image Header (1200×628, 1.91:1 Landscape)",
  },
];

/**
 * Finds matching preset by id, alias, or dimensions, supporting current, legacy, and custom designs.
 */
export function findPreset(idOrWidth: string | number, height?: number): PosterPreset | undefined {
  if (typeof idOrWidth === "number" && height !== undefined) {
    const match =
      POSTER_PRESETS.find((p) => p.width === idOrWidth && p.height === height) ||
      LEGACY_POSTER_PRESETS.find((p) => p.width === idOrWidth && p.height === height);
    if (match) return match;
    return {
      id: `custom-${idOrWidth}-${height}`,
      name: `Custom (${idOrWidth}×${height})`,
      width: idOrWidth,
      height: height,
      ratioLabel: `${(idOrWidth / height).toFixed(2)}:1`,
      description: `Custom dimensions (${idOrWidth}×${height})`,
    };
  }

  const id = String(idOrWidth).toLowerCase();
  if (
    id === "square-post" ||
    id === "square" ||
    id === "whatsapp-post" ||
    id === "square-1080"
  ) {
    return POSTER_PRESETS[0];
  }
  if (id === "whatsapp-header") {
    return (
      LEGACY_POSTER_PRESETS.find((p) => p.id === "whatsapp-header") ||
      POSTER_PRESETS[0]
    );
  }
  if (
    id === "banner" ||
    id === "landscape-1200-628" ||
    id === "banner-header"
  ) {
    return (
      LEGACY_POSTER_PRESETS.find((p) => p.id === "landscape-1200-628") ||
      POSTER_PRESETS[0]
    );
  }
  if (
    id === "story" ||
    id === "whatsapp-status" ||
    id === "story-1080-1920" ||
    id === "vertical-story"
  ) {
    return (
      LEGACY_POSTER_PRESETS.find((p) => p.id === "whatsapp-status" || p.id === "story-1080-1920") ||
      POSTER_PRESETS[0]
    );
  }

  return (
    POSTER_PRESETS.find((p) => p.id === id) ||
    LEGACY_POSTER_PRESETS.find((p) => p.id === id)
  );
}

export interface PosterExportOptions {
  format: ExportFormat;
  quality?: number; // 0.1 to 1.0 (for JPEG)
  filename?: string;
}

export interface PosterCampaignAttachment {
  blob: Blob;
  dataUrl: string;
  title: string;
  width: number;
  height: number;
  presetId: string;
  format: ExportFormat;
  filename: string;
  createdAt: number;
}

export interface ActiveObjectProperties {
  type: string;
  fill?: string;
  stroke?: string;
  strokeWidth?: number;
  opacity?: number;
  text?: string;
  fontSize?: number;
  fontFamily?: string;
  fontWeight?: string | number;
  fontStyle?: string;
  textAlign?: string;
  isLocked?: boolean;
}

export const POSTER_IMAGE_LIMITS = {
  maxBytes: 10 * 1024 * 1024, // 10 MB limit for uploaded product photos
  maxMb: 10,
  allowedMimes: ["image/jpeg", "image/png", "image/webp", "image/gif"],
  allowedExtensions: [".jpg", ".jpeg", ".png", ".webp", ".gif"],
};

export interface ImageValidationResult {
  valid: boolean;
  error?: string;
}

export function validatePosterImage(file: File): ImageValidationResult {
  if (!file) {
    return { valid: false, error: "No file selected." };
  }

  if (file.size > POSTER_IMAGE_LIMITS.maxBytes) {
    return {
      valid: false,
      error: `Image size exceeds ${POSTER_IMAGE_LIMITS.maxMb} MB. Selected file is ${(file.size / (1024 * 1024)).toFixed(1)} MB.`,
    };
  }

  const extension = `.${file.name.split(".").pop()?.toLowerCase() || ""}`;
  const mime = file.type?.toLowerCase() || "";

  const extValid = POSTER_IMAGE_LIMITS.allowedExtensions.includes(extension);
  const mimeValid = !mime || POSTER_IMAGE_LIMITS.allowedMimes.includes(mime);

  if (!extValid && !mimeValid) {
    return {
      valid: false,
      error: "Unsupported image format. Allowed formats: PNG, JPEG, WebP, GIF.",
    };
  }

  return { valid: true };
}

export type AlignmentType =
  | "centerH"
  | "centerV"
  | "centerBoth"
  | "alignLeft"
  | "alignRight"
  | "alignTop"
  | "alignBottom";

export type StickerType =
  | "sale-badge"
  | "discount-50"
  | "new-arrival"
  | "price-bubble"
  | "order-whatsapp";

export interface PosterLayerItem {
  id: string;
  name: string;
  type: string;
  visible: boolean;
  isLocked: boolean;
  isSelected: boolean;
}

export type PosterToolTab = "elements" | "text" | "stickers" | "background";

export interface PosterAssetRecord {
  id: string;
  blob: Blob;
  mimeType: string;
  name: string;
  size: number;
  createdAt: number;
}

export interface SavedPosterDesign {
  id: string;
  name: string;
  presetId: string;
  width: number;
  height: number;
  canvasJson: string;
  thumbnailDataUrl?: string;
  assetIds: string[];
  createdAt: number;
  updatedAt: number;
}

export type SavedPosterDesignSummary = Omit<SavedPosterDesign, "canvasJson">;

export interface SavedPosterDesignInput {
  id?: string;
  name: string;
  presetId: string;
  width: number;
  height: number;
  canvasJson: string;
  thumbnailDataUrl?: string;
  assetIds?: string[];
}

export type AutoSaveStatus = "idle" | "unsaved" | "saving" | "saved" | "error";
