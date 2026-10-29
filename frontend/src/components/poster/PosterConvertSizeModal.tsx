import React from "react";
import { X, RefreshCw, ArrowRight, ShieldCheck, Check } from "lucide-react";
import { PosterPreset } from "../../types/poster.js";

interface PosterConvertSizeModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentPreset: PosterPreset;
  targetPreset: PosterPreset;
  posterTitle: string;
  onConfirmConvert: (targetPreset: PosterPreset) => void;
}

export const PosterConvertSizeModal: React.FC<PosterConvertSizeModalProps> = ({
  isOpen,
  onClose,
  currentPreset,
  targetPreset,
  posterTitle,
  onConfirmConvert,
}) => {
  if (!isOpen) return null;

  return (
    <div
      className="poster-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="convert-modal-title"
    >
      <div className="poster-modal-card poster-convert-modal-card">
        {/* Header */}
        <div className="poster-modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge text-emerald">
              <RefreshCw size={20} />
            </div>
            <div>
              <h3 id="convert-modal-title">Convert to Other Size</h3>
              <p className="modal-subtitle">
                Adapt your design between WhatsApp Post and WhatsApp Status formats.
              </p>
            </div>
          </div>
          <button
            type="button"
            className="modal-btn-close"
            onClick={onClose}
            aria-label="Close conversion modal"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="poster-modal-body convert-modal-body">
          {/* Format Comparison */}
          <div className="convert-presets-compare">
            <div className="compare-card current-format">
              <span className="format-badge">Current Format</span>
              <h4>{currentPreset.name}</h4>
              <p className="dim-text">
                {currentPreset.width} × {currentPreset.height} px ({currentPreset.ratioLabel})
              </p>
              <div
                className="aspect-preview-box"
                style={{
                  aspectRatio: `${currentPreset.width} / ${currentPreset.height}`,
                  maxHeight: "90px",
                }}
              >
                <span>{currentPreset.ratioLabel}</span>
              </div>
            </div>

            <div className="convert-arrow-indicator">
              <ArrowRight size={22} className="text-emerald" />
            </div>

            <div className="compare-card target-format">
              <span className="format-badge target">New Target Format</span>
              <h4>{targetPreset.name}</h4>
              <p className="dim-text">
                {targetPreset.width} × {targetPreset.height} px ({targetPreset.ratioLabel})
              </p>
              <div
                className="aspect-preview-box target-box"
                style={{
                  aspectRatio: `${targetPreset.width} / ${targetPreset.height}`,
                  maxHeight: "90px",
                }}
              >
                <span>{targetPreset.ratioLabel}</span>
              </div>
            </div>
          </div>

          {/* Safety & Design Preservation Notice */}
          <div className="convert-safety-notice">
            <ShieldCheck size={20} className="text-emerald" />
            <div className="notice-content">
              <strong>Your Original Design is Safe</strong>
              <p>
                The original design <em>"{posterTitle || "Untitled Poster"}"</em> will remain untouched in
                your My Posters gallery. A new design named <em>"{posterTitle || "Untitled Poster"} ({targetPreset.name})"</em> will
                be created with layout adapted to prevent clipping.
              </p>
            </div>
          </div>
        </div>

        {/* Footer Actions */}
        <div className="poster-modal-footer">
          <button
            type="button"
            className="poster-btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="button"
            className="poster-btn-primary"
            onClick={() => onConfirmConvert(targetPreset)}
            aria-label={`Convert and Save Copy as ${targetPreset.name}`}
          >
            <Check size={16} />
            <span>Convert and Open Copy ({targetPreset.ratioLabel})</span>
          </button>
        </div>
      </div>
    </div>
  );
};
