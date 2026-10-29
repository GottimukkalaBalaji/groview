import React, { useState, useEffect, useRef } from "react";
import {
  X,
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  AlignCenterHorizontal,
  AlignCenterVertical,
  Maximize2,
  ChevronUp,
  ChevronDown,
  Type,
  FileImage,
  Square,
  Sparkles,
} from "lucide-react";
import { ActiveObjectProperties, AlignmentType } from "../../types/poster.js";

interface PosterMobileSheetProps {
  isOpen: boolean;
  onClose: () => void;
  properties: ActiveObjectProperties | null;
  onUpdateProperty: (key: string, value: any) => void;
  onDeleteSelected: () => void;
  onAlign?: (alignment: AlignmentType) => void;
}

function normalizeHexColor(color?: string, fallback: string = "#000000"): string {
  if (!color) return fallback;
  const trimmed = color.trim().toLowerCase();
  if (/^#[0-9a-f]{6}$/.test(trimmed)) return trimmed;
  if (/^#[0-9a-f]{3}$/.test(trimmed)) {
    return `#${trimmed[1]}${trimmed[1]}${trimmed[2]}${trimmed[2]}${trimmed[3]}${trimmed[3]}`;
  }
  return fallback;
}

export const PosterMobileSheet: React.FC<PosterMobileSheetProps> = ({
  isOpen,
  onClose,
  properties,
  onUpdateProperty,
  onDeleteSelected,
  onAlign,
}) => {
  const [isExpanded, setIsExpanded] = useState<boolean>(false);
  const closeBtnRef = useRef<HTMLButtonElement | null>(null);
  const previouslyFocusedRef = useRef<HTMLElement | null>(null);

  // Reset to compact mode whenever opened
  useEffect(() => {
    if (isOpen) {
      previouslyFocusedRef.current = document.activeElement as HTMLElement | null;
      setTimeout(() => {
        closeBtnRef.current?.focus();
      }, 50);
    } else {
      setIsExpanded(false);
      if (previouslyFocusedRef.current) {
        previouslyFocusedRef.current.focus();
      }
    }

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        if (isExpanded) {
          setIsExpanded(false);
        } else {
          onClose();
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isExpanded, onClose]);

  if (!isOpen || !properties) return null;

  const objType = (properties.type || "").toLowerCase();
  const isText = objType === "i-text" || objType === "text";
  const isImage = objType === "image" || objType === "fabricimage";
  const isLine = objType === "line";
  const isShape = objType === "rect" || objType === "circle";

  const isBold =
    properties.fontWeight === "bold" ||
    properties.fontWeight === "700" ||
    properties.fontWeight === 700 ||
    properties.fontWeight === "800" ||
    properties.fontWeight === 800;
  const isItalic = properties.fontStyle === "italic";
  const currentAlign = properties.textAlign || "left";

  const fillColor = normalizeHexColor(properties.fill, "#111827");
  const strokeColor = normalizeHexColor(properties.stroke, isLine ? "#10b981" : "#000000");

  const getObjectTypeLabel = () => {
    if (isText) return { label: "Text", icon: <Type size={14} className="text-emerald" /> };
    if (isImage) return { label: "Image", icon: <FileImage size={14} className="text-amber" /> };
    if (isLine) return { label: "Line", icon: <Square size={14} className="text-indigo" /> };
    if (isShape) return { label: "Shape", icon: <Square size={14} className="text-indigo" /> };
    return { label: "Object", icon: <Sparkles size={14} className="text-emerald" /> };
  };

  const typeInfo = getObjectTypeLabel();

  return (
    <>
      {/* Backdrop only shown in expanded mode to keep poster visible/tappable in compact mode */}
      {isExpanded && (
        <div
          className="mobile-sheet-backdrop"
          onClick={() => setIsExpanded(false)}
          aria-hidden="true"
        />
      )}

      {/* Slide-Up Bottom Sheet (Compact or Expanded) */}
      <div
        className={`mobile-properties-sheet ${isExpanded ? "expanded" : "compact"}`}
        role="dialog"
        aria-modal={isExpanded}
        aria-label="Object Properties Sheet"
      >
        {/* Grab Handle (Clicking toggles expand/collapse) */}
        <div
          className="mobile-sheet-handle-bar"
          onClick={() => setIsExpanded(!isExpanded)}
          title={isExpanded ? "Collapse sheet" : "Expand sheet"}
        >
          <div className="sheet-handle" />
        </div>

        {/* COMPACT BAR (Always visible when sheet is open) */}
        <div className="mobile-sheet-compact-bar">
          <div className="compact-type-badge">
            {typeInfo.icon}
            <span className="compact-type-text">{typeInfo.label}</span>
          </div>

          {/* Quick Color Picker (For text and shapes) */}
          {(isText || isShape) && (
            <div className="compact-color-wrap">
              <input
                type="color"
                className="color-picker-inline compact"
                value={fillColor}
                onChange={(e) => onUpdateProperty("fill", e.target.value)}
                title="Change Color"
                aria-label="Change Color"
              />
            </div>
          )}

          {/* Expand / Minimize Toggle Button */}
          <button
            type="button"
            className="compact-expand-btn"
            onClick={() => setIsExpanded(!isExpanded)}
            aria-label={isExpanded ? "Collapse properties" : "Expand all properties"}
          >
            {isExpanded ? (
              <>
                <ChevronDown size={14} />
                <span>Less</span>
              </>
            ) : (
              <>
                <ChevronUp size={14} />
                <span>Edit Details</span>
              </>
            )}
          </button>

          {/* Quick Delete */}
          <button
            type="button"
            className="sheet-btn-delete"
            onClick={() => {
              onDeleteSelected();
              onClose();
            }}
            title="Delete Object"
            aria-label="Delete Object"
          >
            <Trash2 size={16} />
          </button>

          {/* Close */}
          <button
            ref={closeBtnRef}
            type="button"
            className="sheet-btn-close"
            onClick={onClose}
            title="Close properties sheet"
            aria-label="Close"
          >
            <X size={18} />
          </button>
        </div>

        {/* EXPANDED CONTROLS BODY */}
        {isExpanded && (
          <div className="mobile-sheet-body">
            {/* Alignment Tools (All objects) */}
            {onAlign && (
              <div className="sheet-control-group">
                <label>Alignment</label>
                <div className="sheet-alignment-row">
                  <button
                    type="button"
                    className="sheet-align-btn"
                    onClick={() => onAlign("centerH")}
                    title="Center Horizontally"
                  >
                    <AlignCenterHorizontal size={16} />
                    <span>Center H</span>
                  </button>
                  <button
                    type="button"
                    className="sheet-align-btn"
                    onClick={() => onAlign("centerV")}
                    title="Center Vertically"
                  >
                    <AlignCenterVertical size={16} />
                    <span>Center V</span>
                  </button>
                  <button
                    type="button"
                    className="sheet-align-btn"
                    onClick={() => onAlign("centerBoth")}
                    title="Center Both"
                  >
                    <Maximize2 size={14} />
                    <span>Both</span>
                  </button>
                </div>
              </div>
            )}

            {/* Fill Color (Text and Shapes only) */}
            {(isText || isShape) && (
              <div className="sheet-control-group">
                <label htmlFor="mobile-fill-color">Fill Color</label>
                <div className="sheet-color-row">
                  <input
                    id="mobile-fill-color"
                    type="color"
                    className="color-picker-inline"
                    value={fillColor}
                    onChange={(e) => onUpdateProperty("fill", e.target.value)}
                  />
                  <span className="color-hex-label">{properties.fill || fillColor}</span>
                </div>
              </div>
            )}

            {/* Text Settings (Text only) */}
            {isText && (
              <>
                <div className="sheet-control-group">
                  <label htmlFor="mobile-font-size">Font Size: {properties.fontSize || 36}px</label>
                  <input
                    id="mobile-font-size"
                    type="range"
                    min="12"
                    max="140"
                    value={properties.fontSize || 36}
                    onChange={(e) => onUpdateProperty("fontSize", parseInt(e.target.value, 10))}
                    className="prop-range-slider"
                  />
                </div>

                <div className="sheet-control-group">
                  <label>Style & Alignment</label>
                  <div className="sheet-toggle-row">
                    <button
                      type="button"
                      className={`sheet-toggle-btn ${isBold ? "active" : ""}`}
                      onClick={() => onUpdateProperty("fontWeight", isBold ? "normal" : "bold")}
                      title="Toggle Bold"
                    >
                      <Bold size={16} />
                    </button>

                    <button
                      type="button"
                      className={`sheet-toggle-btn ${isItalic ? "active" : ""}`}
                      onClick={() => onUpdateProperty("fontStyle", isItalic ? "normal" : "italic")}
                      title="Toggle Italic"
                    >
                      <Italic size={16} />
                    </button>

                    <div className="sheet-toggle-sep" />

                    <button
                      type="button"
                      className={`sheet-toggle-btn ${currentAlign === "left" ? "active" : ""}`}
                      onClick={() => onUpdateProperty("textAlign", "left")}
                      title="Align Left"
                    >
                      <AlignLeft size={16} />
                    </button>

                    <button
                      type="button"
                      className={`sheet-toggle-btn ${currentAlign === "center" ? "active" : ""}`}
                      onClick={() => onUpdateProperty("textAlign", "center")}
                      title="Align Center"
                    >
                      <AlignCenter size={16} />
                    </button>

                    <button
                      type="button"
                      className={`sheet-toggle-btn ${currentAlign === "right" ? "active" : ""}`}
                      onClick={() => onUpdateProperty("textAlign", "right")}
                      title="Align Right"
                    >
                      <AlignRight size={16} />
                    </button>
                  </div>
                </div>
              </>
            )}

            {/* Line specific formatting */}
            {isLine && (
              <>
                <div className="sheet-control-group">
                  <label htmlFor="mobile-line-color">Line Color</label>
                  <div className="sheet-color-row">
                    <input
                      id="mobile-line-color"
                      type="color"
                      className="color-picker-inline"
                      value={strokeColor}
                      onChange={(e) => onUpdateProperty("stroke", e.target.value)}
                    />
                    <span className="color-hex-label">{properties.stroke || strokeColor}</span>
                  </div>
                </div>

                <div className="sheet-control-group">
                  <label htmlFor="mobile-line-width">
                    Line Thickness: {properties.strokeWidth || 4}px
                  </label>
                  <input
                    id="mobile-line-width"
                    type="range"
                    min="1"
                    max="24"
                    value={properties.strokeWidth || 4}
                    onChange={(e) => onUpdateProperty("strokeWidth", parseInt(e.target.value, 10))}
                    className="prop-range-slider"
                  />
                </div>
              </>
            )}

            {/* Shape Border Settings (Shapes only: Rect, Circle) */}
            {isShape && (
              <>
                <div className="sheet-control-group">
                  <label htmlFor="mobile-stroke-color">Border Color</label>
                  <div className="sheet-color-row">
                    <input
                      id="mobile-stroke-color"
                      type="color"
                      className="color-picker-inline"
                      value={strokeColor}
                      onChange={(e) => onUpdateProperty("stroke", e.target.value)}
                    />
                    <span className="color-hex-label">{properties.stroke || "None"}</span>
                  </div>
                </div>

                <div className="sheet-control-group">
                  <label htmlFor="mobile-stroke-width">
                    Border Width: {properties.strokeWidth || 0}px
                  </label>
                  <input
                    id="mobile-stroke-width"
                    type="range"
                    min="0"
                    max="24"
                    value={properties.strokeWidth || 0}
                    onChange={(e) => onUpdateProperty("strokeWidth", parseInt(e.target.value, 10))}
                    className="prop-range-slider"
                  />
                </div>
              </>
            )}

            {/* Opacity (All objects) */}
            <div className="sheet-control-group">
              <label htmlFor="mobile-opacity">
                Opacity: {Math.round((properties.opacity ?? 1) * 100)}%
              </label>
              <input
                id="mobile-opacity"
                type="range"
                min="0.1"
                max="1.0"
                step="0.05"
                value={properties.opacity ?? 1}
                onChange={(e) => onUpdateProperty("opacity", parseFloat(e.target.value))}
                className="prop-range-slider"
              />
            </div>
          </div>
        )}
      </div>
    </>
  );
};
