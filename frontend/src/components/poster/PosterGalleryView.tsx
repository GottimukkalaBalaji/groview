import React, { useState, useEffect, useMemo, useCallback } from "react";
import {
  Plus,
  Search,
  Copy,
  Edit2,
  Trash2,
  Check,
  Loader2,
  AlertCircle,
  ExternalLink,
  Sparkles,
  Layout,
  X,
} from "lucide-react";
import {
  SavedPosterDesignSummary,
  POSTER_PRESETS,
  PosterPreset,
  findPreset,
} from "../../types/poster.js";
import { posterStorageService } from "../../services/posterStorageService.js";

export interface PosterGalleryViewProps {
  userId?: string | null;
  onOpenDesign: (id: string) => void;
  onNewPoster: (preset?: PosterPreset) => void;
  activeDesignId?: string | null;
  onDesignRenamed?: (id: string, newName: string) => void;
  onDesignDeleted?: (id: string) => void;
}

function formatRelativeTime(timestamp: number): string {
  const diffSec = Math.round((Date.now() - timestamp) / 1000);
  if (diffSec < 60) return "Just now";
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHours = Math.round(diffMin / 60);
  if (diffHours < 24) return `${diffHours}h ago`;
  const diffDays = Math.round(diffHours / 24);
  if (diffDays < 7) return `${diffDays}d ago`;
  const date = new Date(timestamp);
  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: date.getFullYear() !== new Date().getFullYear() ? "numeric" : undefined,
  });
}

export const PosterGalleryView: React.FC<PosterGalleryViewProps> = ({
  userId,
  onOpenDesign,
  onNewPoster,
  activeDesignId,
  onDesignRenamed,
  onDesignDeleted,
}) => {
  const [designs, setDesigns] = useState<SavedPosterDesignSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [storageError, setStorageError] = useState<string | null>(null);

  const [searchQuery, setSearchQuery] = useState<string>("");
  const [filterPreset, setFilterPreset] = useState<string>("all");

  // Inline Rename State
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState<string>("");
  const [renameError, setRenameError] = useState<string | null>(null);

  // In-flight Action State
  const [actionLoadingId, setActionLoadingId] = useState<string | null>(null);

  // Delete Confirmation State
  const [deletingDesign, setDeletingDesign] = useState<SavedPosterDesignSummary | null>(null);

  const loadDesigns = useCallback(async () => {
    setIsLoading(true);
    setStorageError(null);
    try {
      const list = await posterStorageService.listDesigns();
      setDesigns(list);
    } catch (err: any) {
      const msg = err?.message || "Failed to load saved designs from browser storage.";
      setStorageError(msg);
      console.error("PosterGalleryView load error:", err);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (userId !== undefined) {
      posterStorageService.setUserId(userId);
    }
    loadDesigns();
  }, [loadDesigns, userId]);

  // Filtered designs
  const filteredDesigns = useMemo(() => {
    return designs.filter((d) => {
      const matchesSearch =
        !searchQuery.trim() ||
        d.name.toLowerCase().includes(searchQuery.trim().toLowerCase());
      const matchesPreset =
        filterPreset === "all" ||
        d.presetId === filterPreset ||
        (filterPreset === "whatsapp-post" && d.width === 1080 && d.height === 1080) ||
        (filterPreset === "whatsapp-status" && d.width === 1080 && d.height === 1920);
      return matchesSearch && matchesPreset;
    });
  }, [designs, searchQuery, filterPreset]);

  // Rename handlers
  const handleStartRename = (design: SavedPosterDesignSummary) => {
    setRenamingId(design.id);
    setRenameValue(design.name);
    setRenameError(null);
  };

  const handleSaveRename = async (design: SavedPosterDesignSummary) => {
    const trimmed = renameValue.trim();
    if (!trimmed) {
      setRenameError("Name cannot be empty.");
      return;
    }
    if (trimmed.length > 80) {
      setRenameError("Name cannot exceed 80 characters.");
      return;
    }

    setActionLoadingId(design.id);
    try {
      await posterStorageService.renameDesign(design.id, trimmed);
      setRenamingId(null);
      setRenameError(null);
      onDesignRenamed?.(design.id, trimmed);
      await loadDesigns();
    } catch (err: any) {
      setRenameError(err?.message || "Failed to rename design.");
    } finally {
      setActionLoadingId(null);
    }
  };

  const handleCancelRename = () => {
    setRenamingId(null);
    setRenameValue("");
    setRenameError(null);
  };

  // Duplicate handler
  const handleDuplicate = async (design: SavedPosterDesignSummary) => {
    setActionLoadingId(design.id);
    try {
      await posterStorageService.duplicateDesign(design.id);
      await loadDesigns();
    } catch (err: any) {
      setStorageError(err?.message || "Failed to duplicate design.");
    } finally {
      setActionLoadingId(null);
    }
  };

  // Delete handlers
  const handleConfirmDelete = async () => {
    if (!deletingDesign) return;
    setActionLoadingId(deletingDesign.id);
    try {
      await posterStorageService.deleteDesign(deletingDesign.id, { cleanupOrphans: true });
      onDesignDeleted?.(deletingDesign.id);
      setDeletingDesign(null);
      await loadDesigns();
    } catch (err: any) {
      setStorageError(err?.message || "Failed to delete design.");
    } finally {
      setActionLoadingId(null);
    }
  };

  return (
    <div className="poster-gallery-page" role="region" aria-label="My Posters Gallery">
      {/* Page Header */}
      <div className="poster-gallery-header">
        <div className="poster-gallery-title-wrap">
          <div className="poster-gallery-icon-badge">
            <Sparkles size={22} className="text-emerald" />
          </div>
          <div>
            <h1 className="poster-gallery-title">My Posters</h1>
            <p className="poster-gallery-subtitle">
              Reopen and edit your saved designs or create a new marketing flyer.
            </p>
          </div>
        </div>

        <div className="poster-gallery-header-actions">
          <button
            type="button"
            className="poster-btn-primary poster-gallery-new-btn"
            onClick={() => onNewPoster(POSTER_PRESETS[0])}
            title="Create a new blank WhatsApp Post (1080 × 1080)"
            aria-label="Create New Poster"
          >
            <Plus size={16} />
            <span>Create New Poster</span>
          </button>
        </div>
      </div>

      {/* Filter & Search Bar */}
      <div className="my-designs-filter-bar poster-gallery-filter-bar">
        <div className="my-designs-search-wrap">
          <Search size={15} className="search-icon" />
          <input
            type="text"
            placeholder="Search designs by name..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="my-designs-search-input"
            aria-label="Search saved designs"
          />
          {searchQuery && (
            <button
              type="button"
              className="search-clear-btn"
              onClick={() => setSearchQuery("")}
              aria-label="Clear search"
            >
              <X size={14} />
            </button>
          )}
        </div>

        <div className="my-designs-preset-tabs" role="tablist">
          <button
            type="button"
            className={`preset-tab-pill ${filterPreset === "all" ? "active" : ""}`}
            onClick={() => setFilterPreset("all")}
            role="tab"
            aria-selected={filterPreset === "all"}
          >
            All
          </button>
          <button
            type="button"
            className={`preset-tab-pill ${filterPreset === "whatsapp-post" ? "active" : ""}`}
            onClick={() => setFilterPreset("whatsapp-post")}
            role="tab"
            aria-selected={filterPreset === "whatsapp-post"}
          >
            WhatsApp Post (1:1)
          </button>
          <button
            type="button"
            className={`preset-tab-pill ${filterPreset === "whatsapp-status" ? "active" : ""}`}
            onClick={() => setFilterPreset("whatsapp-status")}
            role="tab"
            aria-selected={filterPreset === "whatsapp-status"}
          >
            WhatsApp Status (9:16)
          </button>
        </div>

        <div className="poster-gallery-count-badge">
          <span>{designs.length} {designs.length === 1 ? "poster" : "posters"} saved</span>
        </div>
      </div>

      {/* Gallery Body */}
      <div className="poster-gallery-body">
        {storageError && (
          <div className="poster-error-alert my-designs-alert" role="alert">
            <AlertCircle size={16} />
            <div className="alert-text">
              <strong>Storage Error</strong>
              <span>{storageError}</span>
            </div>
            <button
              type="button"
              className="btn-retry"
              onClick={loadDesigns}
            >
              Retry
            </button>
          </div>
        )}

        {isLoading ? (
          <div className="my-designs-loading-state" role="status">
            <Loader2 size={32} className="spin text-emerald" />
            <p>Loading your saved posters…</p>
          </div>
        ) : designs.length === 0 ? (
          <div className="my-designs-empty-state">
            <div className="empty-state-icon">
              <Sparkles size={36} className="text-emerald" />
            </div>
            <h3>No Saved Posters Yet</h3>
            <p>
              Your saved posters and marketing flyers will appear here. Designs are securely
              persisted in your browser storage.
            </p>
            <div className="empty-state-actions" style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", justifyContent: "center" }}>
              <button
                type="button"
                className="poster-btn-primary"
                onClick={() => onNewPoster(POSTER_PRESETS[0])}
                aria-label="Create New Poster"
              >
                <Plus size={16} />
                <span>Create New Poster</span>
              </button>
              <button
                type="button"
                className="poster-btn-secondary"
                onClick={() => onNewPoster(POSTER_PRESETS[1])}
                aria-label="Create WhatsApp Status"
              >
                <Layout size={15} className="text-emerald" />
                <span>Create WhatsApp Status (9:16)</span>
              </button>
            </div>
          </div>
        ) : filteredDesigns.length === 0 ? (
          <div className="my-designs-empty-state">
            <div className="empty-state-icon">
              <Search size={32} className="text-muted" />
            </div>
            <h3>No matching designs</h3>
            <p>No designs match your search filter "{searchQuery}".</p>
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                setSearchQuery("");
                setFilterPreset("all");
              }}
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="my-designs-grid" role="list">
            {filteredDesigns.map((design) => {
              const isActive = design.id === activeDesignId;
              const isRenaming = renamingId === design.id;
              const isActing = actionLoadingId === design.id;
              const preset =
                findPreset(design.presetId) ||
                findPreset(design.width, design.height) ||
                POSTER_PRESETS[0];

              return (
                <div
                  key={design.id}
                  className={`my-designs-card ${isActive ? "active-design" : ""}`}
                  role="listitem"
                >
                  {/* Thumbnail Container */}
                  <div
                    className="my-designs-thumbnail-wrap"
                    onClick={() => !isRenaming && onOpenDesign(design.id)}
                    title={`Open "${design.name}"`}
                  >
                    {design.thumbnailDataUrl ? (
                      <img
                        src={design.thumbnailDataUrl}
                        alt={design.name}
                        className="my-designs-thumbnail-img"
                        loading="lazy"
                      />
                    ) : (
                      <div className="my-designs-thumbnail-fallback">
                        <Layout size={32} className="text-muted" />
                        <span className="fallback-dim">
                          {design.width} × {design.height}
                        </span>
                      </div>
                    )}

                    {/* Badges on Thumbnail */}
                    <div className="thumbnail-badges">
                      <span className="badge-preset">{preset.name}</span>
                      {isActive && (
                        <span className="badge-active-pill">
                          <span className="active-dot" />
                          Active
                        </span>
                      )}
                    </div>
                  </div>

                  {/* Card Content & Meta */}
                  <div className="my-designs-card-content">
                    {isRenaming ? (
                      <div className="card-rename-form">
                        <input
                          type="text"
                          value={renameValue}
                          onChange={(e) => setRenameValue(e.target.value)}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") handleSaveRename(design);
                            if (e.key === "Escape") handleCancelRename();
                          }}
                          className="card-rename-input"
                          autoFocus
                          maxLength={80}
                          aria-label="New poster name"
                        />
                        {renameError && (
                          <span className="rename-error-text">{renameError}</span>
                        )}
                        <div className="rename-actions-row">
                          <button
                            type="button"
                            className="rename-action-btn confirm"
                            onClick={() => handleSaveRename(design)}
                            disabled={isActing}
                            title="Save name"
                          >
                            <Check size={14} />
                          </button>
                          <button
                            type="button"
                            className="rename-action-btn cancel"
                            onClick={handleCancelRename}
                            disabled={isActing}
                            title="Cancel"
                          >
                            <X size={14} />
                          </button>
                        </div>
                      </div>
                    ) : (
                      <div className="card-title-row">
                        <h3
                          className="my-designs-card-title"
                          title={design.name}
                          onClick={() => onOpenDesign(design.id)}
                        >
                          {design.name}
                        </h3>
                        <button
                          type="button"
                          className="btn-card-inline-action"
                          onClick={() => handleStartRename(design)}
                          title="Rename poster"
                          aria-label={`Rename ${design.name}`}
                        >
                          <Edit2 size={13} />
                        </button>
                      </div>
                    )}

                    <div className="my-designs-card-meta">
                      <span className="meta-dim">
                        {design.width} × {design.height} px
                      </span>
                      <span className="meta-dot">•</span>
                      <span className="meta-date">
                        {formatRelativeTime(design.updatedAt)}
                      </span>
                    </div>
                  </div>

                  {/* Card Footer Actions */}
                  <div className="my-designs-card-actions">
                    <button
                      type="button"
                      className={`poster-btn-primary card-btn-open ${
                        isActive ? "btn-is-active" : ""
                      }`}
                      onClick={() => onOpenDesign(design.id)}
                      disabled={isActing}
                      title={isActive ? "Currently open in editor" : "Open and edit this poster"}
                    >
                      {isActive ? (
                        <>
                          <Check size={14} />
                          <span>Editing</span>
                        </>
                      ) : (
                        <>
                          <ExternalLink size={14} />
                          <span>Open</span>
                        </>
                      )}
                    </button>

                    <div className="card-btn-icon-group">
                      <button
                        type="button"
                        className="poster-icon-btn card-icon-btn"
                        onClick={() => handleDuplicate(design)}
                        disabled={isActing}
                        title="Duplicate poster design"
                        aria-label={`Duplicate ${design.name}`}
                      >
                        {isActing ? (
                          <Loader2 size={15} className="spin" />
                        ) : (
                          <Copy size={15} />
                        )}
                      </button>

                      <button
                        type="button"
                        className="poster-icon-btn card-icon-btn btn-danger-hover"
                        onClick={() => setDeletingDesign(design)}
                        disabled={isActing}
                        title="Delete poster"
                        aria-label={`Delete ${design.name}`}
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Delete Confirmation Modal Overlay */}
      {deletingDesign && (
        <div
          className="my-designs-delete-backdrop"
          onClick={() => setDeletingDesign(null)}
        >
          <div
            className="my-designs-delete-dialog"
            role="alertdialog"
            aria-labelledby="delete-dialog-title"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="delete-dialog-header">
              <div className="delete-dialog-icon">
                <Trash2 size={22} className="text-rose" />
              </div>
              <div>
                <h3 id="delete-dialog-title">Delete Poster?</h3>
                <p>
                  Are you sure you want to permanently delete{" "}
                  <strong>"{deletingDesign.name}"</strong>? This action cannot be undone.
                </p>
              </div>
            </div>

            <div className="delete-dialog-actions">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setDeletingDesign(null)}
                disabled={actionLoadingId === deletingDesign.id}
              >
                Cancel
              </button>
              <button
                type="button"
                className="poster-btn-danger"
                onClick={handleConfirmDelete}
                disabled={actionLoadingId === deletingDesign.id}
              >
                {actionLoadingId === deletingDesign.id ? (
                  <>
                    <Loader2 size={14} className="spin" />
                    <span>Deleting…</span>
                  </>
                ) : (
                  <span>Delete Permanently</span>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
