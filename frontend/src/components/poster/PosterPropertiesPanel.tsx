import React from "react";
import {
  Bold,
  Italic,
  AlignLeft,
  AlignCenter,
  AlignRight,
  Trash2,
  Sliders,
  Layers,
  AlignCenterHorizontal,
  AlignCenterVertical,
  AlignStartHorizontal,
  AlignEndHorizontal,
  AlignStartVertical,
  AlignEndVertical,
  Maximize2,
} from "lucide-react";
import { ActiveObjectProperties, AlignmentType } from "../../types/poster.js";

interface PosterPropertiesPanelProps {
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

export const PosterPropertiesPanel: React.FC<PosterPropertiesPanelProps> = ({
  properties,
  onUpdateProperty,
  onDeleteSelected,
  onAlign,
}) => {
  if (!properties) {
    return (
      <aside className="poster-properties-panel empty-state">
        <div className="empty-panel-prompt">
          <Layers size={28} className="text-muted" />
          <h4>No Object Selected</h4>
          <p>Click on any text, shape, or image on the poster to customize its properties and alignment.</p>
        </div>
      </aside>
    );
  }

  const objType = (properties.type || "").toLowerCase();
  const isText = objType === "i-text" || objType === "text";
  const isLine = objType === "line";
  const isShape = objType === "rect" || objType === "circle";
  const isImage = objType === "image" || objType === "fabricimage";

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

  const panelTitle = isText
    ? "Text Settings"
    : isLine
    ? "Line Settings"
    : isShape
    ? "Shape Settings"
    : isImage
    ? "Image Settings"
    : "Object Settings";

  return (
    <aside className="poster-properties-panel" aria-label="Selected Object Properties">
      <div className="properties-header">
        <div className="properties-title-group">
          <Sliders size={16} className="text-emerald" />
          <h3>{panelTitle}</h3>
        </div>
        <button
          type="button"
          className="poster-icon-btn btn-danger-icon"
          onClick={onDeleteSelected}
          title="Delete selected object (Del)"
          aria-label="Delete selected object"
        >
          <Trash2 size={16} />
        </button>
      </div>

      <div className="properties-content">
        {/* Alignment Tools */}
        {onAlign && (
          <div className="prop-control-row">
            <label>Poster Alignment</label>
            <div className="prop-alignment-grid">
              <button
                type="button"
                className="alignment-btn"
                onClick={() => onAlign("centerH")}
                title="Center Horizontally"
                aria-label="Center Horizontally"
              >
                <AlignCenterHorizontal size={16} />
              </button>

              <button
                type="button"
                className="alignment-btn"
                onClick={() => onAlign("centerV")}
                title="Center Vertically"
                aria-label="Center Vertically"
              >
                <AlignCenterVertical size={16} />
              </button>

              <button
                type="button"
                className="alignment-btn"
                onClick={() => onAlign("centerBoth")}
                title="Center on Poster"
                aria-label="Center on Poster"
              >
                <Maximize2 size={14} />
              </button>

              <button
                type="button"
                className="alignment-btn"
                onClick={() => onAlign("alignLeft")}
                title="Align to Left Edge"
                aria-label="Align to Left Edge"
              >
                <AlignStartHorizontal size={16} />
              </button>

              <button
                type="button"
                className="alignment-btn"
                onClick={() => onAlign("alignRight")}
                title="Align to Right Edge"
                aria-label="Align to Right Edge"
              >
                <AlignEndHorizontal size={16} />
              </button>

              <button
                type="button"
                className="alignment-btn"
                onClick={() => onAlign("alignTop")}
                title="Align to Top Edge"
                aria-label="Align to Top Edge"
              >
                <AlignStartVertical size={16} />
              </button>

              <button
                type="button"
                className="alignment-btn"
                onClick={() => onAlign("alignBottom")}
                title="Align to Bottom Edge"
                aria-label="Align to Bottom Edge"
              >
                <AlignEndVertical size={16} />
              </button>
            </div>
          </div>
        )}

        {/* Fill Color (Text and Shapes only, not Images or Lines) */}
        {(isText || isShape) && (
          <div className="prop-control-row">
            <label htmlFor="prop-fill-color">Fill Color</label>
            <div className="color-picker-input-wrap">
              <input
                id="prop-fill-color"
                type="color"
                className="color-picker-inline"
                value={fillColor}
                onChange={(e) => onUpdateProperty("fill", e.target.value)}
              />
              <span className="color-hex-label">{properties.fill || fillColor}</span>
            </div>
          </div>
        )}

        {/* Text Specific Formatting */}
        {isText && (
          <>
            {/* Font Size */}
            <div className="prop-control-row">
              <label htmlFor="prop-font-size">Font Size ({properties.fontSize || 36}px)</label>
              <input
                id="prop-font-size"
                type="range"
                min="12"
                max="140"
                value={properties.fontSize || 36}
                onChange={(e) => onUpdateProperty("fontSize", parseInt(e.target.value, 10))}
                className="prop-range-slider"
              />
            </div>

            {/* Font Style & Alignment Group */}
            <div className="prop-control-row">
              <label>Styling & Alignment</label>
              <div className="prop-btn-toggle-group">
                <button
                  type="button"
                  className={`prop-toggle-btn ${isBold ? "active" : ""}`}
                  onClick={() => onUpdateProperty("fontWeight", isBold ? "normal" : "bold")}
                  title="Toggle Bold"
                >
                  <Bold size={16} />
                </button>

                <button
                  type="button"
                  className={`prop-toggle-btn ${isItalic ? "active" : ""}`}
                  onClick={() => onUpdateProperty("fontStyle", isItalic ? "normal" : "italic")}
                  title="Toggle Italic"
                >
                  <Italic size={16} />
                </button>

                <div className="toggle-group-sep" />

                <button
                  type="button"
                  className={`prop-toggle-btn ${currentAlign === "left" ? "active" : ""}`}
                  onClick={() => onUpdateProperty("textAlign", "left")}
                  title="Align Left"
                >
                  <AlignLeft size={16} />
                </button>

                <button
                  type="button"
                  className={`prop-toggle-btn ${currentAlign === "center" ? "active" : ""}`}
                  onClick={() => onUpdateProperty("textAlign", "center")}
                  title="Align Center"
                >
                  <AlignCenter size={16} />
                </button>

                <button
                  type="button"
                  className={`prop-toggle-btn ${currentAlign === "right" ? "active" : ""}`}
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
            <div className="prop-control-row">
              <label htmlFor="prop-line-color">Line Color</label>
              <div className="color-picker-input-wrap">
                <input
                  id="prop-line-color"
                  type="color"
                  className="color-picker-inline"
                  value={strokeColor}
                  onChange={(e) => onUpdateProperty("stroke", e.target.value)}
                />
                <span className="color-hex-label">{properties.stroke || strokeColor}</span>
              </div>
            </div>

            <div className="prop-control-row">
              <label htmlFor="prop-line-width">Line Thickness ({properties.strokeWidth || 4}px)</label>
              <input
                id="prop-line-width"
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

        {/* Stroke / Border for shapes (Rect, Circle) */}
        {isShape && (
          <>
            <div className="prop-control-row">
              <label htmlFor="prop-stroke-color">Border Color</label>
              <div className="color-picker-input-wrap">
                <input
                  id="prop-stroke-color"
                  type="color"
                  className="color-picker-inline"
                  value={strokeColor}
                  onChange={(e) => onUpdateProperty("stroke", e.target.value)}
                />
                <span className="color-hex-label">{properties.stroke || "None"}</span>
              </div>
            </div>

            <div className="prop-control-row">
              <label htmlFor="prop-stroke-width">Border Width ({properties.strokeWidth || 0}px)</label>
              <input
                id="prop-stroke-width"
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

        {/* Opacity Slider (all objects) */}
        <div className="prop-control-row">
          <label htmlFor="prop-opacity">
            Opacity ({Math.round((properties.opacity ?? 1) * 100)}&#37;)
          </label>
          <input
            id="prop-opacity"
            type="range"
            min="0.05"
            max="1.0"
            step="0.05"
            value={properties.opacity ?? 1}
            onChange={(e) => onUpdateProperty("opacity", parseFloat(e.target.value))}
            className="prop-range-slider"
          />
        </div>
      </div>
    </aside>
  );
};
