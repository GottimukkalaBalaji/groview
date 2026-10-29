import React, { useState } from "react";
import {
  ShieldCheck,
  Wifi,
  Battery,
  Signal,
  Eye,
  Code2,
  Lock,
  Phone,
  AlertCircle,
} from "lucide-react";
import { WhatsAppTemplate } from "../types/template.js";
import { WhatsAppMessageBubble } from "./WhatsAppMessageBubble.js";

export function validatePreviewPhoneNumber(phone: string): { isValid: boolean; error: string | null } {
  const trimmed = phone.trim();
  if (!trimmed) {
    return { isValid: false, error: "Please enter a preview phone number." };
  }
  // Only allow digits, spaces, parentheses, hyphens, and leading '+'
  if (!/^\+?[\d\s\-()]+$/.test(trimmed)) {
    return {
      isValid: false,
      error: "Phone number may only contain digits, spaces, hyphens, and an optional '+' prefix.",
    };
  }
  const digitsOnly = trimmed.replace(/\D/g, "");
  if (digitsOnly.length < 7) {
    return {
      isValid: false,
      error: "Phone number is too short (minimum 7 digits required).",
    };
  }
  if (digitsOnly.length > 15) {
    return {
      isValid: false,
      error: "Phone number is too long (maximum 15 digits according to E.164).",
    };
  }
  return { isValid: true, error: null };
}

export function validateActionButtonPhoneNumber(phone: string): { isValid: boolean; error: string | null } {
  const trimmed = phone.trim();
  if (!trimmed) {
    return { isValid: false, error: "Please enter a test phone number." };
  }
  if (!trimmed.startsWith("+")) {
    return {
      isValid: false,
      error: "Phone number must start with '+' followed by country code (e.g. +919876543210).",
    };
  }
  const clean = trimmed.replace(/[\s\-()]/g, "");
  if (!/^\+\d+$/.test(clean)) {
    return {
      isValid: false,
      error: "Phone number may only contain digits, spaces, and hyphens after '+'.",
    };
  }
  const digitsOnly = clean.substring(1);
  if (digitsOnly.length < 7) {
    return {
      isValid: false,
      error: "Phone number is too short (minimum 7 digits required).",
    };
  }
  if (digitsOnly.length > 15) {
    return {
      isValid: false,
      error: "Phone number is too long (maximum 15 digits according to E.164).",
    };
  }
  return { isValid: true, error: null };
}

export interface WhatsAppPhonePreviewProps {
  template: WhatsAppTemplate;
  hideSampleMedia?: boolean;
  previewPhone?: string;
  initialPreviewPhone?: string;
  onPreviewPhoneChange?: (phone: string) => void;
}

export const WhatsAppPhonePreview: React.FC<WhatsAppPhonePreviewProps> = ({
  template,
  hideSampleMedia = false,
  previewPhone: controlledPreviewPhone,
  initialPreviewPhone = "+91 98765 43210",
  onPreviewPhoneChange,
}) => {
  const [showSampleValues, setShowSampleValues] = useState<boolean>(true);
  const [internalPhone, setInternalPhone] = useState<string>(
    controlledPreviewPhone !== undefined ? controlledPreviewPhone : initialPreviewPhone
  );
  const [phoneError, setPhoneError] = useState<string | null>(null);

  // Use controlled prop if supplied by parent; otherwise fallback to local component state
  const activePhone = controlledPreviewPhone !== undefined ? controlledPreviewPhone : internalPhone;

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (controlledPreviewPhone === undefined) {
      setInternalPhone(val);
    }
    const validation = validatePreviewPhoneNumber(val);
    setPhoneError(validation.error);
    onPreviewPhoneChange?.(val);
  };

  const displayPhone = activePhone.trim() || "+91 98765 43210";

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

      {/* Editable Preview Phone Number Control */}
      <div className="preview-phone-control-box" data-testid="preview-phone-control-box">
        <div className="preview-phone-row">
          <label htmlFor="preview-phone-input" className="preview-phone-label">
            <Phone size={13} style={{ color: "var(--accent-emerald)" }} />
            <span>Preview Phone Number</span>
            <span className="preview-phone-badge">Simulation Only</span>
          </label>
          <input
            id="preview-phone-input"
            type="tel"
            className={`preview-phone-input ${phoneError ? "form-input-error" : ""}`}
            placeholder="+91 98765 43210"
            value={activePhone}
            onChange={handlePhoneChange}
            aria-label="Preview Phone Number"
            data-testid="preview-phone-input"
            autoComplete="off"
            spellCheck={false}
          />
        </div>
        {phoneError && (
          <div className="preview-phone-error" data-testid="preview-phone-error" role="alert">
            <AlertCircle size={12} style={{ flexShrink: 0 }} />
            <span>{phoneError}</span>
          </div>
        )}
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
            <div className="wa-header-recipient" style={{ fontSize: "0.68rem", color: "#8696a0", marginTop: "1px" }}>
              <span>To: </span>
              <strong className="preview-recipient-phone" data-testid="preview-recipient-phone" style={{ color: "#e9edef" }}>
                {displayPhone}
              </strong>
            </div>
          </div>
        </div>

        {/* WhatsApp Chat Background & Wallpaper */}
        <div className="wa-chat-canvas">
          <div className="wa-recipient-banner" data-testid="preview-recipient-banner">
            <Lock size={11} />
            <span>Preview recipient: <strong data-testid="preview-recipient-phone-pill">{displayPhone}</strong></span>
          </div>
          <div className="wa-date-pill">TODAY</div>
          <WhatsAppMessageBubble
            template={template}
            showSampleValues={showSampleValues}
            hideSampleMedia={hideSampleMedia}
          />
        </div>
      </div>
    </div>
  );
};
