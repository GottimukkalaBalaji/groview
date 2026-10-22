import React, { useState, useEffect } from "react";
import {
  ExternalLink,
  Phone,
  CornerDownLeft,
  CheckCheck,
  FileText,
  Video,
  ShieldCheck,
  Wifi,
  Battery,
  Signal,
  Eye,
  Code2,
  Lock,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import { WhatsAppTemplate } from "../types/template.js";

interface WhatsAppPhonePreviewProps {
  template: WhatsAppTemplate;
}

export const WhatsAppPhonePreview: React.FC<WhatsAppPhonePreviewProps> = ({ template }) => {
  const [showSampleValues, setShowSampleValues] = useState<boolean>(true);
  const [imageStatus, setImageStatus] = useState<"idle" | "loading" | "loaded" | "error">(() =>
    template.header.mediaUrl ? "loading" : "idle"
  );

  // Stale preview prevention: reset image loading status when mediaUrl changes
  useEffect(() => {
    if (template.header.mediaUrl) {
      setImageStatus("loading");
    } else {
      setImageStatus("idle");
    }
  }, [template.header.mediaUrl]);

  // Check if header is a GIF
  const isGif = Boolean(
    template.header.mimeType === "image/gif" ||
      template.header.mediaFilename?.toLowerCase().endsWith(".gif") ||
      (template.header.mediaUrl && /\.gif(\?|$)/i.test(template.header.mediaUrl))
  );

  // Substitute variables like {{1}}, {{2}} with sample values
  const renderBodyContent = () => {
    let text = template.body;

    if (showSampleValues && template.variables && template.variables.length > 0) {
      template.variables.forEach((v) => {
        const replacement = v.sampleValue || v.fallbackValue || `{{${v.key}}}`;
        const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, "g");
        text = text.replace(regex, replacement);
      });
    }

    // Convert basic WhatsApp formatting to HTML:
    // *bold* -> <strong>
    // _italic_ -> <em>
    // ~strike~ -> <del>
    const lines = text.split("\n");
    return lines.map((line, idx) => {
      let formatted = line;

      // Bold: *text*
      formatted = formatted.replace(/\*([^*]+)\*/g, "<strong>$1</strong>");
      // Italic: _text_
      formatted = formatted.replace(/_([^_]+)_/g, "<em>$1</em>");
      // Strikethrough: ~text~
      formatted = formatted.replace(/~([^~]+)~/g, "<del>$1</del>");

      return (
        <React.Fragment key={idx}>
          <span dangerouslySetInnerHTML={{ __html: formatted }} />
          {idx < lines.length - 1 && <br />}
        </React.Fragment>
      );
    });
  };

  // Substitute variables like {{1}} in text header with sample values
  const renderHeaderText = (headerText: string) => {
    let text = headerText;
    if (showSampleValues && template.variables && template.variables.length > 0) {
      template.variables.forEach((v) => {
        const replacement = v.sampleValue || v.fallbackValue || `{{${v.key}}}`;
        const regex = new RegExp(`\\{\\{${v.key}\\}\\}`, "g");
        text = text.replace(regex, replacement);
      });
    }
    return text;
  };

  const currentTime = new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });

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

          {/* Incoming Message Bubble */}
          <div className="wa-message-bubble">
            {/* Header Area */}
            {template.header.type === "IMAGE" && (
              <div className="wa-bubble-media" data-testid="preview-bubble-image-container">
                {template.header.mediaUrl ? (
                  <>
                    {imageStatus === "error" ? (
                      <div className="wa-media-error-box" data-testid="preview-image-error">
                        <AlertCircle size={22} className="wa-media-error-icon" />
                        <span className="wa-media-error-title">Image failed to load</span>
                        <span className="wa-media-error-desc">Check the image URL or select a valid file</span>
                      </div>
                    ) : (
                      <img
                        src={template.header.mediaUrl}
                        alt={template.header.mediaFilename || "Template Header Media"}
                        className="wa-media-img"
                        data-testid="preview-header-image"
                        onLoad={() => setImageStatus("loaded")}
                        onError={() => setImageStatus("error")}
                      />
                    )}
                  </>
                ) : (
                  <div className="wa-media-placeholder-box" data-testid="preview-image-placeholder">
                    <ImageIcon size={26} className="wa-media-placeholder-icon" />
                    <span>Image Header (No media selected)</span>
                  </div>
                )}
                {isGif && (
                  <div
                    className="wa-gif-advisory-pill"
                    data-testid="preview-gif-advisory"
                    style={{
                      fontSize: "0.68rem",
                      color: "#f59e0b",
                      background: "rgba(245, 158, 11, 0.15)",
                      padding: "0.25rem 0.5rem",
                      borderRadius: "0 0 6px 6px",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.3rem",
                      marginTop: "-2px",
                      borderTop: "1px solid rgba(245, 158, 11, 0.3)",
                    }}
                  >
                    <AlertCircle size={12} />
                    <span>GIF preview: WhatsApp templates require MP4 encoding.</span>
                  </div>
                )}
              </div>
            )}

            {template.header.type === "TEXT" && template.header.text && (
              <div className="wa-bubble-header-text">{renderHeaderText(template.header.text)}</div>
            )}

            {template.header.type === "DOCUMENT" && (
              <div className="wa-bubble-document" data-testid="preview-document-card">
                <FileText size={22} className="wa-doc-icon" />
                <div className="wa-doc-info">
                  <span className="wa-doc-title" data-testid="preview-doc-title">
                    {template.header.mediaFilename ||
                      (template.header.mediaUrl
                        ? template.header.mediaUrl.split("/").pop()?.split("?")[0]
                        : "Document Attachment (PDF)") ||
                      "Document Attachment (PDF)"}
                  </span>
                  <span className="wa-doc-size" data-testid="preview-doc-size">
                    {template.header.mediaFilesize || "PDF Document"}
                  </span>
                </div>
              </div>
            )}

            {template.header.type === "VIDEO" && (
              <div
                className="wa-bubble-video-placeholder"
                data-testid="preview-video-container"
                style={{ padding: template.header.mediaUrl ? 0 : undefined, overflow: "hidden" }}
              >
                {template.header.mediaUrl ? (
                  <video
                    src={template.header.mediaUrl}
                    controls
                    className="wa-media-video"
                    data-testid="preview-header-video"
                    style={{ width: "100%", maxHeight: "160px", display: "block", borderRadius: "6px" }}
                  />
                ) : (
                  <>
                    <Video size={28} />
                    <span>{template.header.mediaFilename || "Video Header (MP4)"}</span>
                    {template.header.mediaFilesize && (
                      <span style={{ fontSize: "0.68rem", color: "#8696a0" }}>{template.header.mediaFilesize}</span>
                    )}
                  </>
                )}
              </div>
            )}

            {/* Message Body Content */}
            <div className="wa-bubble-body">{renderBodyContent()}</div>

            {/* Message Footer (if provided) */}
            {template.footer && <div className="wa-bubble-footer">{template.footer}</div>}

            {/* Timestamp & double blue ticks */}
            <div className="wa-bubble-meta">
              <span className="wa-time">{currentTime}</span>
              <CheckCheck size={14} className="wa-ticks" />
            </div>
          </div>

          {/* Action Buttons (Attached below message bubble in WhatsApp) */}
          {template.buttons && template.buttons.length > 0 && (
            <div className="wa-buttons-stack" data-testid="preview-buttons-stack">
              {template.buttons.map((btn) => (
                <div key={btn.id} className="wa-action-btn" data-testid={`preview-btn-${btn.id}`}>
                  {btn.type === "URL" && <ExternalLink size={14} className="wa-btn-icon" />}
                  {btn.type === "PHONE_NUMBER" && <Phone size={14} className="wa-btn-icon" />}
                  {btn.type === "QUICK_REPLY" && <CornerDownLeft size={14} className="wa-btn-icon" />}
                  <span>{btn.text || "Button Action"}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
