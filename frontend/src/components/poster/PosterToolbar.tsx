import React, { useState, useRef, useEffect } from "react";
import {
  Undo2,
  Redo2,
  ZoomIn,
  ZoomOut,
  Maximize2,
  ChevronDown,
  Sparkles,
  Save,
  Check,
  Loader2,
  AlertCircle,
  FolderOpen,
  Plus,
  ArrowLeft,
} from "lucide-react";
import {
  POSTER_PRESETS,
  PosterPreset,
  ExportFormat,
  AutoSaveStatus,
} from "../../types/poster.js";

export interface PosterToolbarProps {
  title: string;
  onTitleChange: (newTitle: string) => void;
  selectedPreset: PosterPreset;
  onPresetChange: (preset: PosterPreset) => void;
  canUndo: boolean;
  canRedo: boolean;
  onUndo: () => void;
  onRedo: () => void;
  zoomLevel: number;
  onZoomChange: (newZoom: number) => void;
  onResetZoom: () => void;
  onExport?: (format: ExportFormat) => void;
  isExporting?: boolean;
  onUseInCampaign?: () => void;
  onConvertToOtherSize?: (targetPreset: PosterPreset) => void;
  onSave?: () => void;
  isSaving?: boolean;
  saveStatus?: AutoSaveStatus;
  autoSaveEnabled?: boolean;
  onAutoSaveToggle?: (enabled: boolean) => void;
  onOpenMyDesigns?: () => void;
  onBackToGallery?: () => void;
  onNewPoster?: () => void;
}

export const PosterToolbar: React.FC<PosterToolbarProps> = ({
  title,
  onTitleChange,
  selectedPreset,
  onPresetChange,
  canUndo,
  canRedo,
  onUndo,
  onRedo,
  zoomLevel,
  onZoomChange,
  onResetZoom,
  onSave,
  isSaving = false,
  saveStatus,
  autoSaveEnabled = true,
  onAutoSaveToggle,
  onOpenMyDesigns,
  onBackToGallery,
  onNewPoster,
}) => {
  const [isPresetOpen, setIsPresetOpen] = useState(false);
  const presetDropdownRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (
        presetDropdownRef.current &&
        !presetDropdownRef.current.contains(e.target as Node)
      ) {
        setIsPresetOpen(false);
      }
    };
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, []);

  return (
    <header className="poster-toolbar" role="toolbar" aria-label="Poster Editor Controls">
      {/* Left: Branding, My Designs, New & Title */}
      <div className="poster-toolbar-left">
        <div className="poster-brand-badge">
          <Sparkles size={16} className="text-emerald" />
          <span>Poster Studio</span>
        </div>

        {onBackToGallery && (
          <button
            type="button"
            className="poster-btn-secondary poster-my-designs-btn poster-back-to-gallery-btn"
            onClick={onBackToGallery}
            title="Return to My Posters gallery"
            aria-label="Back to My Posters"
          >
            <ArrowLeft size={15} className="text-emerald" />
            <span className="btn-label-desktop">My Posters</span>
          </button>
        )}

        {onOpenMyDesigns && (
          <button
            type="button"
            className="poster-btn-secondary poster-my-designs-btn"
            onClick={onOpenMyDesigns}
            title="My Saved Posters"
            aria-label="Open My Saved Designs"
          >
            <FolderOpen size={15} className="text-emerald" />
            <span className="btn-label-desktop">My Designs</span>
          </button>
        )}

        {onNewPoster && (
          <button
            type="button"
            className="poster-icon-btn poster-new-btn"
            onClick={onNewPoster}
            title="Create a new blank poster"
            aria-label="Create a new blank poster"
          >
            <Plus size={16} />
          </button>
        )}

        <input
          type="text"
          className="poster-title-input"
          value={title}
          onChange={(e) => onTitleChange(e.target.value)}
          placeholder="Untitled Poster"
          aria-label="Poster project title"
        />
        {saveStatus && (
          <div
            className={`poster-save-status ${saveStatus}`}
            role="status"
            aria-live="polite"
            title={
              saveStatus === "saving"
                ? "Saving changes to browser storage..."
                : saveStatus === "saved"
                ? "All changes saved locally"
                : saveStatus === "unsaved"
                ? "Unsaved changes"
                : "Save failed. Click Save to retry."
            }
          >
            {saveStatus === "saving" && (
              <>
                <Loader2 size={13} className="spin" />
                <span>Saving…</span>
              </>
            )}
            {saveStatus === "saved" && (
              <>
                <Check size={13} className="text-emerald" />
                <span>Saved</span>
              </>
            )}
            {saveStatus === "unsaved" && (
              <>
                <span className="save-status-dot unsaved" />
                <span>Unsaved changes</span>
              </>
            )}
            {saveStatus === "error" && (
              <>
                <AlertCircle size={13} className="text-rose" />
                <span>Save failed</span>
              </>
            )}
          </div>
        )}
      </div>

      {/* Center: Presets, Undo/Redo & Zoom */}
      <div className="poster-toolbar-center">
        {/* Preset Selector */}
        <div className="poster-dropdown-wrap" ref={presetDropdownRef}>
          <button
            type="button"
            className="poster-toolbar-btn dropdown-toggle"
            onClick={() => setIsPresetOpen(!isPresetOpen)}
            aria-expanded={isPresetOpen}
            aria-haspopup="listbox"
          >
            <span>{selectedPreset.name}</span>
            <span className="poster-ratio-tag">{selectedPreset.ratioLabel}</span>
            <ChevronDown size={14} />
          </button>

          {isPresetOpen && (
            <div className="poster-dropdown-menu" role="listbox">
              {POSTER_PRESETS.map((p) => {
                const isSelected =
                  p.id === selectedPreset.id ||
                  (p.width === selectedPreset.width && p.height === selectedPreset.height);
                return (
                  <button
                    key={p.id}
                    type="button"
                    className={`poster-dropdown-item ${isSelected ? "active" : ""}`}
                    onClick={() => {
                      onPresetChange(p);
                      setIsPresetOpen(false);
                    }}
                    role="option"
                    aria-selected={isSelected}
                  >
                    <div className="preset-item-header">
                      <strong>{p.name}</strong>
                      <span className="preset-dim">
                        {p.width} × {p.height}
                      </span>
                    </div>
                    <div className="preset-desc">{p.description}</div>
                  </button>
                );
              })}

            </div>
          )}
        </div>

        <div className="toolbar-divider" />

        {/* Undo / Redo */}
        <div className="toolbar-btn-group">
          <button
            type="button"
            className="poster-icon-btn"
            onClick={onUndo}
            disabled={!canUndo}
            title="Undo (Ctrl+Z)"
            aria-label="Undo canvas change"
          >
            <Undo2 size={16} />
          </button>
          <button
            type="button"
            className="poster-icon-btn"
            onClick={onRedo}
            disabled={!canRedo}
            title="Redo (Ctrl+Y)"
            aria-label="Redo canvas change"
          >
            <Redo2 size={16} />
          </button>
        </div>

        <div className="toolbar-divider" />

        {/* Zoom Controls */}
        <div className="toolbar-btn-group toolbar-zoom-group">
          <button
            type="button"
            className="poster-icon-btn"
            onClick={() => onZoomChange(Number((zoomLevel - 0.1).toFixed(2)))}
            disabled={zoomLevel <= 0.2}
            title="Zoom Out (Min 20%)"
            aria-label="Zoom Out"
          >
            <ZoomOut size={16} />
          </button>
          <button
            type="button"
            className="poster-zoom-indicator"
            onClick={onResetZoom}
            title="Fit to screen (Reset Zoom)"
            aria-label="Fit to screen (Reset Zoom)"
          >
            {Math.round(zoomLevel * 100)}%
          </button>
          <button
            type="button"
            className="poster-icon-btn"
            onClick={() => onZoomChange(Number((zoomLevel + 0.1).toFixed(2)))}
            disabled={zoomLevel >= 3.0}
            title="Zoom In (Max 300%)"
            aria-label="Zoom In"
          >
            <ZoomIn size={16} />
          </button>
          <button
            type="button"
            className="poster-icon-btn"
            onClick={onResetZoom}
            title="Fit to screen"
            aria-label="Fit to screen"
          >
            <Maximize2 size={14} />
          </button>
        </div>
      </div>

      {/* Right: Save, AutoSave Toggle & Export / Campaign Buttons */}
      <div className="poster-toolbar-right">
        {onAutoSaveToggle !== undefined && (
          <label className="poster-autosave-toggle" title="Auto Save (saves changes automatically)">
            <input
              type="checkbox"
              checked={autoSaveEnabled}
              onChange={(e) => onAutoSaveToggle(e.target.checked)}
              aria-label="Auto Save toggle"
            />
            <span className="toggle-label">Auto Save</span>
          </label>
        )}

        {onSave && (
          <button
            type="button"
            className="poster-btn-primary poster-save-btn"
            onClick={onSave}
            disabled={isSaving}
            title="Save poster design (Ctrl+S)"
            aria-label="Save poster design"
          >
            {isSaving ? <Loader2 size={15} className="spin" /> : <Save size={15} />}
            <span>{isSaving ? "Saving..." : "Save"}</span>
          </button>
        )}

      </div>
    </header>
  );
};
