import React from "react";
import {
  Layers,
  Eye,
  EyeOff,
  Lock,
  Unlock,
  ChevronUp,
  ChevronDown,
  Trash2,
  Type,
  FileImage,
  Square,
  Circle as CircleIcon,
  Minus,
  Sparkles,
} from "lucide-react";
import { PosterLayerItem } from "../../types/poster.js";

interface PosterLayersPanelProps {
  layers: PosterLayerItem[];
  onSelectLayer: (id: string) => void;
  onMoveUp: (id: string) => void;
  onMoveDown: (id: string) => void;
  onToggleVisibility: (id: string) => void;
  onToggleLock: (id: string) => void;
  onDeleteLayer: (id: string) => void;
}

export const PosterLayersPanel: React.FC<PosterLayersPanelProps> = ({
  layers,
  onSelectLayer,
  onMoveUp,
  onMoveDown,
  onToggleVisibility,
  onToggleLock,
  onDeleteLayer,
}) => {
  const getLayerIcon = (type: string, name: string = "") => {
    const lowerName = name.toLowerCase();
    if (
      lowerName.includes("badge") ||
      lowerName.includes("tag") ||
      lowerName.includes("callout") ||
      lowerName.includes("sticker")
    ) {
      return <Sparkles size={14} className="text-emerald" />;
    }

    switch (type.toLowerCase()) {
      case "i-text":
      case "text":
        return <Type size={14} className="text-emerald" />;
      case "image":
      case "fabricimage":
        return <FileImage size={14} className="text-amber" />;
      case "rect":
        return <Square size={14} className="text-indigo" />;
      case "circle":
        return <CircleIcon size={14} className="text-indigo" />;
      case "line":
        return <Minus size={14} className="text-muted" />;
      default:
        return <Sparkles size={14} className="text-emerald" />;
    }
  };

  return (
    <aside className="poster-layers-panel" aria-label="Poster Layers Order and Controls">
      <div className="layers-header">
        <div className="layers-title-wrap">
          <Layers size={16} className="text-emerald" />
          <h3>Layers</h3>
        </div>
        <span className="layers-count-badge">{layers.length}</span>
      </div>

      <div className="layers-list-container" role="list" aria-label="Layers list">
        {layers.length === 0 ? (
          <div className="layers-empty-prompt">
            <Layers size={24} className="text-muted" />
            <p>No layers yet. Add elements from the left panel.</p>
          </div>
        ) : (
          layers.map((layer, index) => {
            const isTop = index === 0;
            const isBottom = index === layers.length - 1;

            return (
              <div
                key={layer.id}
                className={`layer-item-row ${layer.isSelected ? "active" : ""} ${
                  !layer.visible ? "layer-hidden" : ""
                } ${layer.isLocked ? "layer-locked" : ""}`}
                onClick={() => onSelectLayer(layer.id)}
                role="listitem"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onSelectLayer(layer.id);
                  }
                }}
                aria-selected={layer.isSelected}
                aria-label={`Layer ${layer.name}`}
              >
                {/* Layer Icon and Name */}
                <div className="layer-info">
                  {getLayerIcon(layer.type, layer.name)}
                  <span className="layer-name-text" title={layer.name}>
                    {layer.name}
                  </span>
                </div>

                {/* Layer Actions */}
                <div
                  className="layer-actions"
                  onClick={(e) => e.stopPropagation()} // Prevent selecting layer when clicking actions
                >
                  {/* Move Up */}
                  <button
                    type="button"
                    className="layer-btn"
                    onClick={() => onMoveUp(layer.id)}
                    disabled={isTop}
                    title="Bring Forward"
                    aria-label={`Bring ${layer.name} forward`}
                  >
                    <ChevronUp size={13} />
                  </button>

                  {/* Move Down */}
                  <button
                    type="button"
                    className="layer-btn"
                    onClick={() => onMoveDown(layer.id)}
                    disabled={isBottom}
                    title="Send Backward"
                    aria-label={`Send ${layer.name} backward`}
                  >
                    <ChevronDown size={13} />
                  </button>

                  {/* Visibility Toggle */}
                  <button
                    type="button"
                    className={`layer-btn ${!layer.visible ? "text-muted" : ""}`}
                    onClick={() => onToggleVisibility(layer.id)}
                    title={layer.visible ? "Hide layer" : "Show layer"}
                    aria-label={`${layer.visible ? "Hide" : "Show"} ${layer.name}`}
                  >
                    {layer.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                  </button>

                  {/* Lock Toggle */}
                  <button
                    type="button"
                    className={`layer-btn ${layer.isLocked ? "text-amber" : ""}`}
                    onClick={() => onToggleLock(layer.id)}
                    title={layer.isLocked ? "Unlock layer" : "Lock layer"}
                    aria-label={`${layer.isLocked ? "Unlock" : "Lock"} ${layer.name}`}
                  >
                    {layer.isLocked ? <Lock size={13} /> : <Unlock size={13} />}
                  </button>

                  {/* Delete Layer */}
                  <button
                    type="button"
                    className="layer-btn btn-danger-hover"
                    onClick={() => onDeleteLayer(layer.id)}
                    title="Delete layer"
                    aria-label={`Delete ${layer.name}`}
                  >
                    <Trash2 size={13} />
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>
    </aside>
  );
};
