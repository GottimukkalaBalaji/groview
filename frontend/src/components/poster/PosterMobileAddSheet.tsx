import React, { useState, useRef } from "react";
import {
  X,
  Type,
  Square,
  Circle as CircleIcon,
  Minus,
  Sparkles,
  Palette,
  ImagePlus,
  AlertCircle,
  Sliders,
  FolderOpen,
} from "lucide-react";
import { StickerType } from "../../types/poster.js";

interface PosterMobileAddSheetProps {
  isOpen: boolean;
  onClose: () => void;
  onAddImage: (file: File) => void;
  onOpenAiBgRemoval?: () => void;
  onOpenAiBgBlur?: () => void;
  onAddText: (type: "heading" | "subheading" | "body" | "badge") => void;
  onAddShape: (shape: "rect" | "circle" | "line") => void;
  onAddSticker: (type: StickerType) => void;
  onBackgroundColorChange: (color: string) => void;
  onOpenMyDesigns?: () => void;
}

export const PosterMobileAddSheet: React.FC<PosterMobileAddSheetProps> = ({
  isOpen,
  onClose,
  onAddImage,
  onOpenAiBgRemoval,
  onOpenAiBgBlur,
  onAddText,
  onAddShape,
  onAddSticker,
  onBackgroundColorChange,
  onOpenMyDesigns,
}) => {
  const [activeCategory, setActiveCategory] = useState<"text" | "shapes" | "badges" | "color">("text");
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  if (!isOpen) return null;

  const bgSwatches = [
    { label: "White", color: "#ffffff" },
    { label: "Dark", color: "#0b0f19" },
    { label: "Slate", color: "#1e293b" },
    { label: "Emerald", color: "#064e3b" },
    { label: "Indigo", color: "#312e81" },
    { label: "Cream", color: "#fef3c7" },
  ];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    try {
      onAddImage(file);
      onClose();
    } catch (err: any) {
      setUploadError(err.message || "Failed to add image.");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  return (
    <>
      <div className="mobile-sheet-backdrop" onClick={onClose} aria-hidden="true" />

      <div
        className="mobile-properties-sheet mobile-add-sheet"
        role="dialog"
        aria-modal="true"
        aria-label="Add Elements to Poster"
      >
        <div className="mobile-sheet-handle-bar">
          <div className="sheet-handle" />
        </div>

        {/* Header */}
        <div className="mobile-sheet-header">
          <div className="sheet-title-group">
            <h3>Add to Poster</h3>
          </div>
          <button
            type="button"
            className="sheet-btn-close"
            onClick={onClose}
            aria-label="Close add menu"
          >
            <X size={18} />
          </button>
        </div>

        {/* Category Navigation Tabs */}
        <div className="mobile-add-tabs" role="tablist">
          <button
            type="button"
            className={`mobile-add-tab-btn ${activeCategory === "text" ? "active" : ""}`}
            onClick={() => setActiveCategory("text")}
            role="tab"
            aria-selected={activeCategory === "text"}
          >
            <Type size={15} />
            <span>Text</span>
          </button>

          <button
            type="button"
            className={`mobile-add-tab-btn ${activeCategory === "shapes" ? "active" : ""}`}
            onClick={() => setActiveCategory("shapes")}
            role="tab"
            aria-selected={activeCategory === "shapes"}
          >
            <Square size={15} />
            <span>Shapes</span>
          </button>

          <button
            type="button"
            className={`mobile-add-tab-btn ${activeCategory === "badges" ? "active" : ""}`}
            onClick={() => setActiveCategory("badges")}
            role="tab"
            aria-selected={activeCategory === "badges"}
          >
            <Sparkles size={15} />
            <span>Badges</span>
          </button>

          <button
            type="button"
            className={`mobile-add-tab-btn ${activeCategory === "color" ? "active" : ""}`}
            onClick={() => setActiveCategory("color")}
            role="tab"
            aria-selected={activeCategory === "color"}
          >
            <Palette size={15} />
            <span>Canvas</span>
          </button>
        </div>

        {/* Body Content */}
        <div className="mobile-sheet-body">
          {uploadError && (
            <div className="poster-error-alert" role="alert">
              <AlertCircle size={14} />
              <span>{uploadError}</span>
            </div>
          )}

          {/* Quick Photo Upload Button (Always reachable) */}
          <div className="mobile-add-upload-row">
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: "none" }}
              id="mobile-poster-photo-input"
            />
            <button
              type="button"
              className="mobile-upload-btn"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={18} className="text-emerald" />
              <span>Upload Product Photo</span>
            </button>

            {onOpenAiBgRemoval && (
              <button
                type="button"
                className="mobile-upload-btn"
                onClick={() => {
                  onClose();
                  onOpenAiBgRemoval();
                }}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(16, 185, 129, 0.12), rgba(99, 102, 241, 0.12))",
                  borderColor: "rgba(16, 185, 129, 0.3)",
                }}
              >
                <Sparkles size={18} className="text-emerald" />
                <span>AI Cutout</span>
              </button>
            )}

            {onOpenAiBgBlur && (
              <button
                type="button"
                className="mobile-upload-btn"
                onClick={() => {
                  onClose();
                  onOpenAiBgBlur();
                }}
                style={{
                  background:
                    "linear-gradient(135deg, rgba(99, 102, 241, 0.12), rgba(168, 85, 247, 0.12))",
                  borderColor: "rgba(99, 102, 241, 0.3)",
                }}
              >
                <Sliders size={18} style={{ color: "#a5b4fc" }} />
                <span>AI Blur</span>
              </button>
            )}

            {onOpenMyDesigns && (
              <button
                type="button"
                className="mobile-upload-btn"
                onClick={() => {
                  onClose();
                  onOpenMyDesigns();
                }}
              >
                <FolderOpen size={18} className="text-emerald" />
                <span>My Posters</span>
              </button>
            )}
          </div>

          {/* 1. TEXT PRESETS */}
          {activeCategory === "text" && (
            <div className="mobile-add-options-grid">
              <button
                type="button"
                className="mobile-add-preset-card text-preset-heading"
                onClick={() => {
                  onAddText("heading");
                  onClose();
                }}
              >
                <span className="preset-card-title">Add Heading</span>
                <span className="preset-card-sub">Bold title for promos</span>
              </button>

              <button
                type="button"
                className="mobile-add-preset-card text-preset-subhead"
                onClick={() => {
                  onAddText("subheading");
                  onClose();
                }}
              >
                <span className="preset-card-title">Add Subheading</span>
                <span className="preset-card-sub">Secondary details</span>
              </button>

              <button
                type="button"
                className="mobile-add-preset-card text-preset-body"
                onClick={() => {
                  onAddText("body");
                  onClose();
                }}
              >
                <span className="preset-card-title">Add Body Text</span>
                <span className="preset-card-sub">Offer details & terms</span>
              </button>
            </div>
          )}

          {/* 2. SHAPES */}
          {activeCategory === "shapes" && (
            <div className="mobile-shapes-grid">
              <button
                type="button"
                className="mobile-shape-btn"
                onClick={() => {
                  onAddShape("rect");
                  onClose();
                }}
              >
                <Square size={24} className="text-emerald" />
                <span>Rectangle Box</span>
              </button>

              <button
                type="button"
                className="mobile-shape-btn"
                onClick={() => {
                  onAddShape("circle");
                  onClose();
                }}
              >
                <CircleIcon size={24} className="text-indigo" />
                <span>Circle</span>
              </button>

              <button
                type="button"
                className="mobile-shape-btn"
                onClick={() => {
                  onAddShape("line");
                  onClose();
                }}
              >
                <Minus size={24} className="text-muted" />
                <span>Divider Line</span>
              </button>
            </div>
          )}

          {/* 3. PROMOTIONAL BADGES */}
          {activeCategory === "badges" && (
            <div className="mobile-badges-grid">
              <button
                type="button"
                className="sticker-preset-card sticker-sale"
                onClick={() => {
                  onAddSticker("sale-badge");
                  onClose();
                }}
              >
                <div className="sticker-sample-badge badge-rose">🔥 MEGA SALE</div>
                <span className="sticker-label">Sale callout badge</span>
              </button>

              <button
                type="button"
                className="sticker-preset-card sticker-discount"
                onClick={() => {
                  onAddSticker("discount-50");
                  onClose();
                }}
              >
                <div className="sticker-sample-badge badge-emerald">⚡ FLAT 50% OFF</div>
                <span className="sticker-label">Discount offer badge</span>
              </button>

              <button
                type="button"
                className="sticker-preset-card sticker-arrival"
                onClick={() => {
                  onAddSticker("new-arrival");
                  onClose();
                }}
              >
                <div className="sticker-sample-badge badge-indigo">✨ NEW ARRIVAL</div>
                <span className="sticker-label">Product launch label</span>
              </button>

              <button
                type="button"
                className="sticker-preset-card sticker-price"
                onClick={() => {
                  onAddSticker("price-bubble");
                  onClose();
                }}
              >
                <div className="sticker-sample-badge badge-amber">🏷️ ONLY ₹499</div>
                <span className="sticker-label">Price tag bubble</span>
              </button>

              <button
                type="button"
                className="sticker-preset-card sticker-whatsapp"
                onClick={() => {
                  onAddSticker("order-whatsapp");
                  onClose();
                }}
              >
                <div className="sticker-sample-badge badge-whatsapp">💬 ORDER ON WHATSAPP</div>
                <span className="sticker-label">WhatsApp conversion CTA</span>
              </button>
            </div>
          )}

          {/* 4. CANVAS BACKGROUND */}
          {activeCategory === "color" && (
            <div className="mobile-add-color-section">
              <label>Canvas Color Preset</label>
              <div className="color-swatch-grid">
                {bgSwatches.map((s) => (
                  <button
                    key={s.color}
                    type="button"
                    className="color-swatch-btn"
                    style={{ backgroundColor: s.color }}
                    onClick={() => {
                      onBackgroundColorChange(s.color);
                      onClose();
                    }}
                    title={s.label}
                    aria-label={s.label}
                  />
                ))}
              </div>

              <div className="custom-color-input-wrap" style={{ marginTop: "1rem" }}>
                <label htmlFor="mobile-custom-bg-picker">Custom Hex Color:</label>
                <input
                  id="mobile-custom-bg-picker"
                  type="color"
                  className="color-picker-inline"
                  defaultValue="#ffffff"
                  onChange={(e) => onBackgroundColorChange(e.target.value)}
                />
              </div>
            </div>
          )}
        </div>
      </div>
    </>
  );
};
