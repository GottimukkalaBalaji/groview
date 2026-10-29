import React from "react";
import { Plus, Layers, Sliders, Maximize2 } from "lucide-react";

export type MobileActiveTab = "add" | "layers" | "edit" | null;

interface PosterMobileDockProps {
  activeTab: MobileActiveTab;
  onTabChange: (tab: MobileActiveTab) => void;
  hasSelection: boolean;
  layersCount: number;
  onFitCanvas: () => void;
}

export const PosterMobileDock: React.FC<PosterMobileDockProps> = ({
  activeTab,
  onTabChange,
  hasSelection,
  layersCount,
  onFitCanvas,
}) => {
  const handleTabClick = (tab: "add" | "layers" | "edit") => {
    if (activeTab === tab) {
      onTabChange(null); // Toggle close
    } else {
      onTabChange(tab);
    }
  };

  return (
    <nav className="poster-mobile-dock" role="navigation" aria-label="Mobile Poster Studio Dock">
      {/* 1. Add Tool Drawer Button */}
      <button
        type="button"
        className={`mobile-dock-btn ${activeTab === "add" ? "active" : ""}`}
        onClick={() => handleTabClick("add")}
        aria-label="Add text, shapes, or stickers"
        aria-expanded={activeTab === "add"}
      >
        <div className="dock-icon-wrap">
          <Plus size={20} />
        </div>
        <span className="dock-label">Add</span>
      </button>

      {/* 2. Layers Drawer Button */}
      <button
        type="button"
        className={`mobile-dock-btn ${activeTab === "layers" ? "active" : ""}`}
        onClick={() => handleTabClick("layers")}
        aria-label={`Open layers list (${layersCount} layers)`}
        aria-expanded={activeTab === "layers"}
      >
        <div className="dock-icon-wrap">
          <Layers size={20} />
          {layersCount > 0 && <span className="dock-count-badge">{layersCount}</span>}
        </div>
        <span className="dock-label">Layers</span>
      </button>

      {/* 3. Object Edit Properties Button */}
      <button
        type="button"
        className={`mobile-dock-btn ${activeTab === "edit" ? "active" : ""} ${
          !hasSelection ? "disabled" : ""
        }`}
        onClick={() => {
          if (hasSelection) {
            handleTabClick("edit");
          }
        }}
        disabled={!hasSelection}
        aria-label={hasSelection ? "Edit selected object properties" : "No object selected to edit"}
        aria-expanded={activeTab === "edit"}
      >
        <div className="dock-icon-wrap">
          <Sliders size={20} />
          {hasSelection && <span className="dock-selection-dot" />}
        </div>
        <span className="dock-label">Edit</span>
      </button>

      {/* 4. Fit to Screen Button */}
      <button
        type="button"
        className="mobile-dock-btn"
        onClick={onFitCanvas}
        title="Fit poster to screen"
        aria-label="Fit poster to screen"
      >
        <div className="dock-icon-wrap">
          <Maximize2 size={18} />
        </div>
        <span className="dock-label">Fit</span>
      </button>
    </nav>
  );
};
