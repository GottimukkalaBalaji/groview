import React from "react";
import { X, Send, ShieldCheck, CheckCircle2, FileImage } from "lucide-react";
import { PosterCampaignAttachment } from "../../types/poster.js";

interface PosterUseInCampaignModalProps {
  isOpen: boolean;
  onClose: () => void;
  attachment: PosterCampaignAttachment | null;
  onProceedToCampaign: (attachment: PosterCampaignAttachment) => void;
}

export const PosterUseInCampaignModal: React.FC<PosterUseInCampaignModalProps> = ({
  isOpen,
  onClose,
  attachment,
  onProceedToCampaign,
}) => {
  if (!isOpen || !attachment) return null;

  const fileSizeKb = Math.round(attachment.blob.size / 1024);

  return (
    <div
      className="poster-modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="use-in-campaign-title"
    >
      <div className="poster-modal-card poster-use-campaign-modal-card">
        {/* Header */}
        <div className="poster-modal-header">
          <div className="modal-title-wrap">
            <div className="modal-icon-badge text-emerald">
              <Send size={20} />
            </div>
            <div>
              <h3 id="use-in-campaign-title">Use Poster in Grovastra Campaign</h3>
              <p className="modal-subtitle">
                Attach this high-resolution marketing flyer to a WhatsApp campaign.
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
        <div className="poster-modal-body use-campaign-modal-body">
          {/* Poster Image Preview */}
          <div className="use-campaign-preview-container">
            <div className="campaign-poster-thumb-wrap">
              <img
                src={attachment.dataUrl}
                alt={attachment.title}
                className="campaign-poster-thumb-img"
              />
            </div>
            <div className="campaign-poster-meta">
              <h4>{attachment.title}</h4>
              <div className="meta-badge-row">
                <span className="meta-pill">
                  <FileImage size={13} className="text-emerald" />
                  {attachment.format.toUpperCase()}
                </span>
                <span className="meta-pill">
                  {attachment.width} × {attachment.height} px
                </span>
                <span className="meta-pill">{fileSizeKb} KB (in-memory)</span>
              </div>
            </div>
          </div>

          {/* Privacy & In-Memory Storage Notice */}
          <div className="campaign-storage-notice">
            <ShieldCheck size={22} className="text-emerald" />
            <div className="notice-content">
              <strong>Held Securely in Browser Memory</strong>
              <p>
                This poster is ready for your campaign and will be attached directly to your message
                preview. It has <strong>not</strong> been saved to your mobile phone’s local Downloads
                or photo gallery.
              </p>
            </div>
          </div>

          {/* Explicit User Confirmation Note */}
          <div className="campaign-explicit-confirmation-note">
            <CheckCircle2 size={16} className="text-amber" />
            <span>
              Clicking below opens the campaign creator draft. No messages or campaigns will be sent
              until you review and explicitly launch the campaign.
            </span>
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
            onClick={() => onProceedToCampaign(attachment)}
            aria-label="Create Campaign Draft with Poster"
          >
            <Send size={15} />
            <span>Create Campaign Draft with Poster</span>
          </button>
        </div>
      </div>
    </div>
  );
};
