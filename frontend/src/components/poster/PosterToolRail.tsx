import React, { useRef, useState } from "react";
import {
  ImagePlus,
  Type,
  Square,
  Circle as CircleIcon,
  Minus,
  Palette,
  Trash2,
  AlertCircle,
  Sparkles,
  Sliders,
} from "lucide-react";
import { StickerType } from "../../types/poster.js";

export type PosterToolTab = "elements" | "text" | "stickers" | "background";

interface PosterToolRailProps {
  activeTool?: PosterToolTab;
  onToolChange?: (tool: PosterToolTab) => void;
  onAddImage: (file: File) => void;
  onOpenAiBgRemoval?: () => void;
  onOpenAiBgBlur?: () => void;
  onAddText: (type: "heading" | "subheading" | "body" | "badge") => void;
  onAddShape: (shape: "rect" | "circle" | "line") => void;
  onAddSticker: (type: StickerType) => void;
  onBackgroundColorChange: (color: string) => void;
  onClearCanvas: () => void;
}

export const PosterToolRail: React.FC<PosterToolRailProps> = ({
  activeTool = "elements",
  onToolChange,
  onAddImage,
  onOpenAiBgRemoval,
  onOpenAiBgBlur,
  onAddText,
  onAddShape,
  onAddSticker,
  onBackgroundColorChange,
  onClearCanvas,
}) => {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [internalTab, setInternalTab] = useState<PosterToolTab>(activeTool);
  const activeTab = onToolChange ? activeTool : internalTab;

  const handleTabChange = (tab: PosterToolTab) => {
    setInternalTab(tab);
    onToolChange?.(tab);
  };
  const [uploadError, setUploadError] = useState<string | null>(null);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadError(null);
    try {
      onAddImage(file);
    } catch (err: any) {
      setUploadError(err.message || "Failed to add image.");
    }

    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  };

  const bgSwatches = [
    { label: "Pure White", color: "#ffffff" },
    { label: "Dark Pitch", color: "#0b0f19" },
    { label: "Card Dark", color: "#1e293b" },
    { label: "Emerald Glow", color: "#064e3b" },
    { label: "Indigo Mist", color: "#312e81" },
    { label: "Warm Cream", color: "#fef3c7" },
  ];

  return (
    <aside className="poster-tool-rail" aria-label="Editor Tools Panel">
      {/* Category Tabs */}
      <div className="tool-rail-tabs" role="tablist">
        <button
          type="button"
          className={`tool-tab-btn ${activeTab === "elements" ? "active" : ""}`}
          onClick={() => handleTabChange("elements")}
          role="tab"
          aria-selected={activeTab === "elements"}
        >
          <Square size={15} />
          <span>Shapes</span>
        </button>

        <button
          type="button"
          className={`tool-tab-btn ${activeTab === "text" ? "active" : ""}`}
          onClick={() => handleTabChange("text")}
          role="tab"
          aria-selected={activeTab === "text"}
        >
          <Type size={15} />
          <span>Text</span>
        </button>

        <button
          type="button"
          className={`tool-tab-btn ${activeTab === "stickers" ? "active" : ""}`}
          onClick={() => handleTabChange("stickers")}
          role="tab"
          aria-selected={activeTab === "stickers"}
        >
          <Sparkles size={15} />
          <span>Badges</span>
        </button>

        <button
          type="button"
          className={`tool-tab-btn ${activeTab === "background" ? "active" : ""}`}
          onClick={() => handleTabChange("background")}
          role="tab"
          aria-selected={activeTab === "background"}
        >
          <Palette size={15} />
          <span>Color</span>
        </button>
      </div>

      {/* Tab Content Panel */}
      <div className="tool-tab-content">
        {uploadError && (
          <div className="poster-error-alert" role="alert">
            <AlertCircle size={14} />
            <span>{uploadError}</span>
          </div>
        )}

        {/* ELEMENTS TAB */}
        {activeTab === "elements" && (
          <div className="tool-section">
            <h4 className="tool-section-title">Upload Image</h4>
            <input
              type="file"
              ref={fileInputRef}
              onChange={handleFileChange}
              accept="image/png,image/jpeg,image/webp,image/gif"
              style={{ display: "none" }}
              id="poster-image-upload-input"
            />
            <button
              type="button"
              className="poster-tool-card upload-card"
              onClick={() => fileInputRef.current?.click()}
            >
              <ImagePlus size={24} className="text-emerald" />
              <div className="tool-card-label">
                <strong>Upload Product Photo</strong>
                <span>PNG, JPG, WebP up to 10 MB</span>
              </div>
            </button>

            {onOpenAiBgRemoval && (
              <button
                type="button"
                className="poster-tool-card upload-card"
                onClick={onOpenAiBgRemoval}
                style={{
                  marginTop: "0.5rem",
                  borderColor: "rgba(16, 185, 129, 0.35)",
                  background:
                    "linear-gradient(135deg, rgba(16, 185, 129, 0.08), rgba(99, 102, 241, 0.08))",
                }}
              >
                <Sparkles size={22} className="text-emerald" />
                <div className="tool-card-label">
                  <strong>AI Remove Background</strong>
                  <span>Transparent Cutout (PoC)</span>
                </div>
              </button>
            )}

            {onOpenAiBgBlur && (
              <button
                type="button"
                className="poster-tool-card upload-card"
                onClick={onOpenAiBgBlur}
                style={{
                  marginTop: "0.5rem",
                  borderColor: "rgba(99, 102, 241, 0.35)",
                  background:
                    "linear-gradient(135deg, rgba(99, 102, 241, 0.08), rgba(168, 85, 247, 0.08))",
                }}
              >
                <Sliders size={22} style={{ color: "#a5b4fc" }} />
                <div className="tool-card-label">
                  <strong>AI Background Blur</strong>
                  <span>Sharp Subject + Bokeh Blur</span>
                </div>
              </button>
            )}

            <h4 className="tool-section-title" style={{ marginTop: "1rem" }}>
              Shapes & Accents
            </h4>
            <div className="shape-btn-grid">
              <button
                type="button"
                className="shape-action-btn"
                onClick={() => onAddShape("rect")}
                title="Add Rectangle"
              >
                <Square size={20} />
                <span>Box</span>
              </button>

              <button
                type="button"
                className="shape-action-btn"
                onClick={() => onAddShape("circle")}
                title="Add Circle"
              >
                <CircleIcon size={20} />
                <span>Circle</span>
              </button>

              <button
                type="button"
                className="shape-action-btn"
                onClick={() => onAddShape("line")}
                title="Add Line"
              >
                <Minus size={20} />
                <span>Line</span>
              </button>
            </div>
          </div>
        )}

        {/* TEXT TAB */}
        {activeTab === "text" && (
          <div className="tool-section">
            <h4 className="tool-section-title">Add Typography</h4>
            <p
              className="text-tool-hint"
              style={{
                fontSize: "0.74rem",
                color: "var(--accent-emerald-light)",
                background: "rgba(16, 185, 129, 0.08)",
                padding: "0.45rem 0.6rem",
                borderRadius: "var(--radius-sm)",
                marginBottom: "0.75rem",
                border: "1px solid rgba(16, 185, 129, 0.2)",
                lineHeight: 1.4,
              }}
            >
              Click anywhere on the white poster canvas to place text, or choose a preset:
            </p>

            <button
              type="button"
              className="text-add-preset headline-preset"
              onClick={() => onAddText("heading")}
            >
              <span className="preset-sample-heading">Add a Heading</span>
              <span className="preset-sample-sub">Bold headline for deals</span>
            </button>

            <button
              type="button"
              className="text-add-preset subheading-preset"
              onClick={() => onAddText("subheading")}
            >
              <span className="preset-sample-subhead">Add a Subheading</span>
              <span className="preset-sample-sub">Secondary details & specs</span>
            </button>

            <button
              type="button"
              className="text-add-preset body-preset"
              onClick={() => onAddText("body")}
            >
              <span className="preset-sample-body">Add Body Text</span>
              <span className="preset-sample-sub">Contact info, terms, disclaimer</span>
            </button>
          </div>
        )}

        {/* STICKERS / BADGES TAB */}
        {activeTab === "stickers" && (
          <div className="tool-section">
            <h4 className="tool-section-title">Promotional Badges</h4>

            <button
              type="button"
              className="sticker-preset-card sticker-sale"
              onClick={() => onAddSticker("sale-badge")}
            >
              <div className="sticker-sample-badge badge-rose">🔥 MEGA SALE</div>
              <span className="sticker-label">Sale callout badge</span>
            </button>

            <button
              type="button"
              className="sticker-preset-card sticker-discount"
              onClick={() => onAddSticker("discount-50")}
            >
              <div className="sticker-sample-badge badge-emerald">⚡ FLAT 50% OFF</div>
              <span className="sticker-label">Discount offer badge</span>
            </button>

            <button
              type="button"
              className="sticker-preset-card sticker-arrival"
              onClick={() => onAddSticker("new-arrival")}
            >
              <div className="sticker-sample-badge badge-indigo">✨ NEW ARRIVAL</div>
              <span className="sticker-label">Product launch label</span>
            </button>

            <button
              type="button"
              className="sticker-preset-card sticker-price"
              onClick={() => onAddSticker("price-bubble")}
            >
              <div className="sticker-sample-badge badge-amber">🏷️ ONLY ₹499</div>
              <span className="sticker-label">Price tag bubble</span>
            </button>

            <button
              type="button"
              className="sticker-preset-card sticker-whatsapp"
              onClick={() => onAddSticker("order-whatsapp")}
            >
              <div className="sticker-sample-badge badge-whatsapp">💬 ORDER ON WHATSAPP</div>
              <span className="sticker-label">WhatsApp conversion CTA</span>
            </button>
          </div>
        )}

        {/* BACKGROUND TAB */}
        {activeTab === "background" && (
          <div className="tool-section">
            <h4 className="tool-section-title">Canvas Color</h4>
            <div className="color-swatch-grid">
              {bgSwatches.map((s) => (
                <button
                  key={s.color}
                  type="button"
                  className="color-swatch-btn"
                  style={{ backgroundColor: s.color }}
                  onClick={() => onBackgroundColorChange(s.color)}
                  title={s.label}
                  aria-label={s.label}
                />
              ))}
            </div>

            <div className="custom-color-input-wrap">
              <label htmlFor="custom-bg-picker">Custom Color:</label>
              <input
                id="custom-bg-picker"
                type="color"
                className="color-picker-inline"
                defaultValue="#ffffff"
                onChange={(e) => onBackgroundColorChange(e.target.value)}
              />
            </div>
          </div>
        )}
      </div>

      {/* Bottom Footer Action */}
      <div className="tool-rail-footer">
        <button
          type="button"
          className="poster-btn-danger"
          onClick={() => {
            if (window.confirm("Clear all objects from the poster? This action can be undone.")) {
              onClearCanvas();
            }
          }}
          title="Clear canvas"
        >
          <Trash2 size={14} />
          <span>Clear Canvas</span>
        </button>
      </div>
    </aside>
  );
};
