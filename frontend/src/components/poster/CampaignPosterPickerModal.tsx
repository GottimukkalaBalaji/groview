import React, { useState, useEffect } from "react";
import {
  FileImage,
  CheckCircle2,
  X,
  Sparkles,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { SavedPosterDesignSummary, PosterCampaignAttachment } from "../../types/poster.js";
import { posterStorageService } from "../../services/posterStorageService.js";
import { dataUrlToBlob } from "../../services/posterExportService.js";

export interface CampaignPosterPickerModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSelectPoster: (attachment: PosterCampaignAttachment) => void;
  userId?: string | null;
}

export const CampaignPosterPickerModal: React.FC<CampaignPosterPickerModalProps> = ({
  isOpen,
  onClose,
  onSelectPoster,
  userId,
}) => {
  const [designs, setDesigns] = useState<SavedPosterDesignSummary[]>([]);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [selectedDesignId, setSelectedDesignId] = useState<string | null>(null);
  const [compatibilityNotice, setCompatibilityNotice] = useState<string | null>(null);

  useEffect(() => {
    if (!isOpen) {
      setSelectedDesignId(null);
      setCompatibilityNotice(null);
      return;
    }

    let isMounted = true;
    setIsLoading(true);
    setLoadError(null);

    const loadUserPosters = async () => {
      try {
        // Enforce strict user isolation: point service to authenticated user ID
        if (userId !== undefined) {
          posterStorageService.setUserId(userId);
        }

        const userDesigns = await posterStorageService.listDesigns();
        if (isMounted) {
          setDesigns(userDesigns);
          setSelectedDesignId(null);
        }
      } catch (err: any) {
        if (isMounted) {
          console.error("Failed to load user posters for campaign picker:", err);
          setLoadError(err?.message || "Failed to load saved posters from Poster Studio.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    };

    loadUserPosters();

    return () => {
      isMounted = false;
    };
  }, [isOpen, userId]);

  if (!isOpen) return null;

  const isOptimalHeader = (d: SavedPosterDesignSummary) => {
    return (
      d.presetId === "whatsapp-header" ||
      d.presetId === "landscape-1200-628" ||
      (d.width === 1200 && d.height === 628) ||
      Math.abs(d.width / d.height - 1.91) < 0.05
    );
  };

  const isDesignCompatible = (d: SavedPosterDesignSummary) => {
    if (d.presetId === "whatsapp-status" || d.presetId === "story-1080-1920" || d.height > d.width) {
      return false;
    }
    return true;
  };

  const handleConfirmSelection = () => {
    const selected = designs.find((d) => d.id === selectedDesignId);
    if (!selected || !isDesignCompatible(selected)) return;

    // Use existing high-quality thumbnailDataUrl or fallback
    const dataUrl = selected.thumbnailDataUrl || "";
    const blob = dataUrl ? dataUrlToBlob(dataUrl) : new Blob([], { type: "image/png" });

    const attachment: PosterCampaignAttachment = {
      blob,
      dataUrl,
      title: selected.name,
      width: selected.width,
      height: selected.height,
      presetId: selected.presetId,
      format: "png",
      filename: `${selected.name.toLowerCase().replace(/[^a-z0-9]/g, "_")}.png`,
      createdAt: selected.createdAt,
    };

    onSelectPoster(attachment);
    onClose();
  };

  const selectedDesign = designs.find((d) => d.id === selectedDesignId);

  return (
    <div
      className="poster-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="poster-picker-title"
    >
      <div className="poster-modal-card campaign-poster-picker-modal" style={{ maxWidth: "780px", width: "95vw" }}>
        {/* Modal Header */}
        <div className="poster-modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge" style={{ background: "rgba(16, 185, 129, 0.15)", color: "var(--accent-emerald)" }}>
              <FileImage size={20} />
            </div>
            <div>
              <h3 id="poster-picker-title" style={{ margin: 0, fontSize: "1.1rem" }}>
                Select from Saved Posters
              </h3>
              <p className="modal-subtitle" style={{ margin: "0.2rem 0 0 0", fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                Attach a compatible WhatsApp Header (1200×628) or Square (1080×1080) design created in Poster Studio.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-btn-close"
            onClick={onClose}
            aria-label="Close modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="poster-modal-body" style={{ maxHeight: "60vh", overflowY: "auto", padding: "1.25rem" }}>
          {compatibilityNotice && (
            <div
              className="wizard-error-banner"
              role="alert"
              style={{
                margin: "0 0 1rem 0",
                background: "rgba(245, 158, 11, 0.1)",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                color: "var(--accent-amber)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
                padding: "0.6rem 0.85rem",
                borderRadius: "6px",
                fontSize: "0.82rem",
              }}
            >
              <AlertCircle size={16} style={{ flexShrink: 0 }} />
              <span>{compatibilityNotice}</span>
            </div>
          )}

          {isLoading ? (
            <div style={{ textAlign: "center", padding: "3rem 1rem", color: "var(--text-secondary)" }}>
              <Loader2 size={28} className="spinning" style={{ margin: "0 auto 0.75rem auto" }} />
              <p>Loading your saved posters...</p>
            </div>
          ) : loadError ? (
            <div className="wizard-error-banner" role="alert" style={{ margin: "1rem 0" }}>
              <span>{loadError}</span>
            </div>
          ) : designs.length === 0 ? (
            <div
              className="empty-designs-state"
              style={{
                textAlign: "center",
                padding: "3rem 1.5rem",
                background: "var(--bg-glass-card)",
                borderRadius: "8px",
                border: "1px dashed var(--border-subtle)",
              }}
            >
              <Sparkles size={36} color="var(--accent-emerald)" style={{ margin: "0 auto 1rem auto" }} />
              <h4 style={{ margin: "0 0 0.5rem 0", fontSize: "1.05rem" }}>No Saved Posters Found</h4>
              <p style={{ color: "var(--text-secondary)", fontSize: "0.85rem", maxWidth: "420px", margin: "0 auto 1.25rem auto", lineHeight: 1.5 }}>
                You haven't created any posters in Poster Studio yet. Create and save a 1080×1080 WhatsApp poster first, then select it here.
              </p>
              <button
                type="button"
                className="btn-secondary"
                onClick={onClose}
                style={{ fontSize: "0.85rem" }}
              >
                Close & Return
              </button>
            </div>
          ) : (
            <div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fill, minmax(210px, 1fr))",
                  gap: "1rem",
                }}
              >
                {designs.map((design) => {
                  const isSelected = design.id === selectedDesignId;
                  const isOptimal = isOptimalHeader(design);
                  const isCompatible = isDesignCompatible(design);
                  const isStatus = design.presetId === "whatsapp-status" || design.height > design.width;

                  const handleSelect = () => {
                    if (!isCompatible) {
                      setCompatibilityNotice(
                        `"${design.name}" (${design.width}×${design.height}) is a vertical Status design and cannot be used for WhatsApp campaign headers. Grovastra campaigns require 1080×1080 Square creatives.`
                      );
                      return;
                    }
                    setCompatibilityNotice(null);
                    setSelectedDesignId(design.id);
                  };

                  return (
                    <div
                      key={design.id}
                      role="button"
                      tabIndex={0}
                      aria-pressed={isSelected}
                      onClick={handleSelect}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          handleSelect();
                        }
                      }}
                      style={{
                        position: "relative",
                        display: "flex",
                        flexDirection: "column",
                        borderRadius: "8px",
                        border: isSelected
                          ? "2px solid var(--accent-emerald)"
                          : !isCompatible
                          ? "1px dashed rgba(245, 158, 11, 0.4)"
                          : "1px solid var(--border-subtle)",
                        background: isSelected
                          ? "rgba(16, 185, 129, 0.08)"
                          : "var(--bg-glass-card)",
                        padding: "0.75rem",
                        cursor: isCompatible ? "pointer" : "not-allowed",
                        opacity: isCompatible ? 1 : 0.72,
                        transition: "all 0.2s ease",
                      }}
                    >
                      {/* Selection Checkmark */}
                      {isSelected && (
                        <div
                          style={{
                            position: "absolute",
                            top: "10px",
                            right: "10px",
                            background: "var(--accent-emerald)",
                            color: "#fff",
                            borderRadius: "50%",
                            width: "22px",
                            height: "22px",
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "center",
                            zIndex: 2,
                            boxShadow: "0 2px 5px rgba(0,0,0,0.3)",
                          }}
                        >
                          <CheckCircle2 size={16} />
                        </div>
                      )}

                      {/* Poster Thumbnail Image */}
                      <div
                        style={{
                          width: "100%",
                          height: isStatus ? "200px" : "150px",
                          borderRadius: "6px",
                          overflow: "hidden",
                          background: "#18181b",
                          display: "flex",
                          alignItems: "center",
                          justifyContent: "center",
                          marginBottom: "0.6rem",
                        }}
                      >
                        {design.thumbnailDataUrl ? (
                          <img
                            src={design.thumbnailDataUrl}
                            alt={design.name}
                            style={{
                              width: "100%",
                              height: "100%",
                              objectFit: "contain",
                            }}
                          />
                        ) : (
                          <FileImage size={32} color="var(--text-muted)" />
                        )}
                      </div>

                      {/* Title & Dimension Meta */}
                      <div style={{ flex: 1 }}>
                        <div
                          style={{
                            fontWeight: 600,
                            fontSize: "0.9rem",
                            color: "var(--text-primary)",
                            whiteSpace: "nowrap",
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            marginBottom: "0.3rem",
                          }}
                          title={design.name}
                        >
                          {design.name}
                        </div>
                        <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", flexWrap: "wrap" }}>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              background: "rgba(255, 255, 255, 0.08)",
                              color: "var(--text-secondary)",
                            }}
                          >
                            {design.width} × {design.height} px
                          </span>
                          <span
                            style={{
                              fontSize: "0.7rem",
                              padding: "0.15rem 0.4rem",
                              borderRadius: "4px",
                              background: isCompatible
                                ? "rgba(16, 185, 129, 0.15)"
                                : "rgba(245, 158, 11, 0.15)",
                              color: isCompatible
                                ? "var(--accent-emerald-light)"
                                : "var(--accent-amber)",
                              fontWeight: 500,
                            }}
                          >
                            {isOptimal
                              ? "WhatsApp Header (1.91:1)"
                              : isCompatible
                              ? "Compatible (1080×1080)"
                              : "Incompatible (Status)"}
                          </span>
                        </div>
                        {!isCompatible && (
                          <div style={{ fontSize: "0.72rem", color: "var(--accent-amber)", marginTop: "0.3rem" }}>
                            Requires 1080×1080 Square
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="poster-modal-footer" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div>
            {selectedDesign ? (
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)" }}>
                Selected: <strong data-testid="selected-poster-footer-name">{selectedDesign.name}</strong> ({selectedDesign.width}×{selectedDesign.height})
              </span>
            ) : (
              <span style={{ fontSize: "0.82rem", color: "var(--text-muted)" }}>
                Click a compatible poster above to select it
              </span>
            )}
          </div>
          <div style={{ display: "flex", gap: "0.75rem" }}>
            <button
              type="button"
              className="poster-btn-secondary"
              onClick={onClose}
              aria-label="Cancel poster selection"
              data-testid="poster-picker-cancel-btn"
            >
              Cancel
            </button>
            <button
              type="button"
              className="poster-btn-primary"
              disabled={!selectedDesignId || !designs.find((d) => d.id === selectedDesignId && isDesignCompatible(d))}
              onClick={handleConfirmSelection}
              aria-label="Use Selected Poster"
            >
              Use Selected Poster
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
