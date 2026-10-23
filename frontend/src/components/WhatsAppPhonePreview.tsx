import React, { useState } from "react";
import {
  ShieldCheck,
  Wifi,
  Battery,
  Signal,
  Eye,
  Code2,
  Lock,
} from "lucide-react";
import { WhatsAppTemplate } from "../types/template.js";
import { WhatsAppMessageBubble } from "./WhatsAppMessageBubble.js";

interface WhatsAppPhonePreviewProps {
  template: WhatsAppTemplate;
}

export const WhatsAppPhonePreview: React.FC<WhatsAppPhonePreviewProps> = ({ template }) => {
  const [showSampleValues, setShowSampleValues] = useState<boolean>(true);

  return (
    <div className="phone-preview-wrapper">
      {/* Mode toggle bar */}
      <div className="preview-toolbar">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
          <span className="preview-label">Live WhatsApp Preview</span>
          <span
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "0.25rem",
              fontSize: "0.68rem",
              color: "var(--text-muted)",
              background: "rgba(255, 255, 255, 0.05)",
              padding: "0.15rem 0.45rem",
              borderRadius: "4px",
              border: "1px solid var(--border-subtle)",
            }}
          >
            <Lock size={10} /> Read-Only Structure
          </span>
        </div>
        <button
          type="button"
          className="btn-toggle-samples"
          onClick={() => setShowSampleValues(!showSampleValues)}
          title="Toggle between sample values and raw variable placeholders"
          aria-label="Toggle sample values"
        >
          {showSampleValues ? <Eye size={13} /> : <Code2 size={13} />}
          <span>{showSampleValues ? "Sample Values" : "Raw Variables"}</span>
        </button>
      </div>

      {/* Realistic Mobile Device Frame */}
      <div className="phone-frame">
        {/* Device Status Bar */}
        <div className="phone-status-bar">
          <span className="status-time">9:41</span>
          <div className="status-notch"></div>
          <div className="status-icons">
            <Signal size={12} />
            <Wifi size={12} />
            <Battery size={13} />
          </div>
        </div>

        {/* WhatsApp Chat App Header */}
        <div className="wa-header">
          <div className="wa-header-avatar">
            <span>G</span>
          </div>
          <div className="wa-header-info">
            <div className="wa-header-title">
              <span>Grovastra</span>
              <ShieldCheck size={14} className="wa-verified-badge" />
            </div>
            <div className="wa-header-subtitle">Official Business Account</div>
          </div>
        </div>

        {/* WhatsApp Chat Background & Wallpaper */}
        <div className="wa-chat-canvas">
          <div className="wa-date-pill">TODAY</div>
          <WhatsAppMessageBubble template={template} showSampleValues={showSampleValues} />
        </div>
      </div>
    </div>
  );
};

