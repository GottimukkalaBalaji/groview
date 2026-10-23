import React, { useState, useEffect, useMemo } from "react";
import {
  ExternalLink,
  Phone,
  CornerDownLeft,
  CheckCheck,
  FileText,
  Video,
  Clock,
  Image as ImageIcon,
  AlertCircle,
} from "lucide-react";
import { WhatsAppTemplate } from "../types/template.js";

export interface WhatsAppMessageBubbleProps {
  template: WhatsAppTemplate;
  showSampleValues?: boolean;
  compact?: boolean;
  overrideTime?: string;
}

export const WhatsAppMessageBubble: React.FC<WhatsAppMessageBubbleProps> = ({
  template,
  showSampleValues = true,
  compact = false,
  overrideTime,
}) => {
  const [imageStatus, setImageStatus] = useState<"idle" | "loading" | "loaded" | "error">(() =>
    template.header?.mediaUrl ? "loading" : "idle"
  );

  // Stale preview prevention: reset image loading status when mediaUrl changes
  useEffect(() => {
    if (template.header?.mediaUrl) {
      setImageStatus("loading");
    } else {
      setImageStatus("idle");
    }
  }, [template.header?.mediaUrl]);

  // Check if header is a GIF
  const isGif = Boolean(
    template.header?.mimeType === "image/gif" ||
      template.header?.mediaFilename?.toLowerCase().endsWith(".gif") ||
      (template.header?.mediaUrl && /\.gif(\?|$)/i.test(template.header.mediaUrl))
  );

  // Substitute variables like {{1}}, {{2}} with sample values
  const renderBodyContent = () => {
    let text = template.body || "";

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

  const isLocalDraft = Boolean(template.isLocalDraft || template.status === "LOCAL_DRAFT");
  const isApproved = template.status === "APPROVED";

  const displayTime = useMemo(() => {
    if (overrideTime) return overrideTime;
    if (template.lastUpdated) {
      try {
        const d = new Date(template.lastUpdated);
        if (!isNaN(d.getTime())) {
          return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
      } catch {
        // fallback
      }
    }
    return "9:41 AM";
  }, [overrideTime, template.lastUpdated]);

  const header = template.header || { type: "NONE" };
  const isLocalMediaMissing = Boolean(
    header.mediaIsLocal && (!header.mediaUrl || header.mediaUrl.trim() === "")
  );

  return (
    <div
      className={`wa-message-container ${compact ? "wa-message-compact" : ""}`}
      style={{ width: "100%", display: "flex", flexDirection: "column", gap: "2px" }}
    >
      {/* WhatsApp Message Bubble */}
      <div
        className={`wa-message-bubble ${compact ? "wa-bubble-compact" : ""}`}
        style={compact ? { maxWidth: "100%", width: "100%" } : undefined}
      >
        {/* Header Area */}
        {header.type === "IMAGE" && (
          <div
            className="wa-bubble-media"
            data-testid="preview-bubble-image-container"
            style={compact ? { maxHeight: "140px" } : undefined}
          >
            {header.mediaUrl ? (
              <>
                {imageStatus === "error" ? (
                  <div className="wa-media-error-box" data-testid="preview-image-error">
                    <AlertCircle size={20} className="wa-media-error-icon" />
                    <span className="wa-media-error-title">
                      {header.mediaIsLocal ? "Local media expired" : "Image failed to load"}
                    </span>
                    <span className="wa-media-error-desc">
                      {header.mediaIsLocal
                        ? "Re-select image in template editor"
                        : "Check the image URL or select a valid file"}
                    </span>
                  </div>
                ) : (
                  <img
                    src={header.mediaUrl}
                    alt={header.mediaFilename || "Template Header Media"}
                    className="wa-media-img"
                    data-testid="preview-header-image"
                    onLoad={() => setImageStatus("loaded")}
                    onError={() => setImageStatus("error")}
                  />
                )}
              </>
            ) : isLocalMediaMissing ? (
              <div
                className="wa-media-placeholder-box wa-media-reselect-placeholder"
                data-testid="preview-image-placeholder"
                style={{ padding: compact ? "1rem 0.75rem" : "1.5rem 1rem" }}
              >
                <ImageIcon size={24} className="wa-media-placeholder-icon" />
                <span style={{ fontWeight: 600, color: "#cbd5e1" }}>Image Header (Re-select image)</span>
                {header.mediaFilename && (
                  <span style={{ fontSize: "0.68rem", color: "#94a3b8" }}>{header.mediaFilename}</span>
                )}
                <span style={{ fontSize: "0.68rem", color: "#64748b" }}>
                  Local file preview not available after refresh
                </span>
              </div>
            ) : (
              <div
                className="wa-media-placeholder-box"
                data-testid="preview-image-placeholder"
                style={{ padding: compact ? "1rem 0.75rem" : "1.5rem 1rem" }}
              >
                <ImageIcon size={24} className="wa-media-placeholder-icon" />
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

        {header.type === "TEXT" && header.text && (
          <div className="wa-bubble-header-text">{renderHeaderText(header.text)}</div>
        )}

        {header.type === "DOCUMENT" && (
          <div className="wa-bubble-document" data-testid="preview-document-card">
            <FileText size={20} className="wa-doc-icon" />
            <div className="wa-doc-info">
              <span className="wa-doc-title" data-testid="preview-doc-title">
                {header.mediaFilename ||
                  (header.mediaUrl ? header.mediaUrl.split("/").pop()?.split("?")[0] : "Document Attachment (PDF)") ||
                  "Document Attachment (PDF)"}
              </span>
              <span className="wa-doc-size" data-testid="preview-doc-size">
                {header.mediaFilesize ||
                  (header.mediaIsLocal && !header.mediaUrl ? "Re-select document" : "PDF Document")}
              </span>
            </div>
          </div>
        )}

        {header.type === "VIDEO" && (
          <div
            className="wa-bubble-video-placeholder"
            data-testid="preview-video-container"
            style={{
              padding: header.mediaUrl ? 0 : undefined,
              overflow: "hidden",
              height: compact ? "110px" : "120px",
            }}
          >
            {header.mediaUrl ? (
              <video
                src={header.mediaUrl}
                controls={!compact}
                className="wa-media-video"
                data-testid="preview-header-video"
                style={{
                  width: "100%",
                  maxHeight: compact ? "110px" : "160px",
                  display: "block",
                  borderRadius: "6px",
                }}
              />
            ) : isLocalMediaMissing ? (
              <div
                className="wa-media-placeholder-box"
                style={{ width: "100%", border: "none", background: "transparent" }}
              >
                <Video size={24} />
                <span style={{ fontWeight: 600 }}>Video Header (Re-select video)</span>
                {header.mediaFilename && (
                  <span style={{ fontSize: "0.68rem", color: "#8696a0" }}>{header.mediaFilename}</span>
                )}
              </div>
            ) : (
              <>
                <Video size={26} />
                <span>{header.mediaFilename || "Video Header (MP4)"}</span>
                {header.mediaFilesize && (
                  <span style={{ fontSize: "0.68rem", color: "#8696a0" }}>{header.mediaFilesize}</span>
                )}
              </>
            )}
          </div>
        )}

        {/* Message Body Content */}
        <div
          className="wa-bubble-body"
          style={
            compact
              ? {
                  maxHeight: "180px",
                  overflowY: "auto",
                  wordBreak: "break-word",
                  lineHeight: 1.4,
                }
              : undefined
          }
        >
          {renderBodyContent()}
        </div>

        {/* Message Footer (if provided) */}
        {template.footer && <div className="wa-bubble-footer">{template.footer}</div>}

        {/* Timestamp & subtle delivery/read indicator */}
        <div className="wa-bubble-meta">
          <span className="wa-time">{displayTime}</span>
          {isLocalDraft ? (
            <span title="Draft preview (not sent)" style={{ display: "inline-flex" }}>
              <Clock
                size={11}
                className="wa-draft-clock"
                aria-label="Draft"
                style={{ color: "#8696a0" }}
              />
            </span>
          ) : isApproved ? (
            <span title="Template approved on Meta" style={{ display: "inline-flex" }}>
              <CheckCheck size={14} className="wa-ticks" aria-label="Approved" />
            </span>
          ) : (
            <span title="Pending template" style={{ display: "inline-flex" }}>
              <Clock
                size={11}
                className="wa-draft-clock"
                aria-label="Pending"
                style={{ color: "#8696a0" }}
              />
            </span>
          )}
        </div>
      </div>

      {/* Action Buttons (Attached below message bubble in WhatsApp) */}
      {template.buttons && template.buttons.length > 0 && (
        <div
          className="wa-buttons-stack"
          data-testid="preview-buttons-stack"
          style={compact ? { maxWidth: "100%", width: "100%" } : undefined}
        >
          {template.buttons.map((btn, bIdx) => (
            <div
              key={btn.id || `btn-${bIdx}`}
              className="wa-action-btn"
              data-testid={`preview-btn-${btn.id || bIdx}`}
              style={compact ? { padding: "0.45rem 0.65rem", fontSize: "0.75rem" } : undefined}
            >
              {btn.type === "URL" && <ExternalLink size={13} className="wa-btn-icon" />}
              {btn.type === "PHONE_NUMBER" && <Phone size={13} className="wa-btn-icon" />}
              {(btn.type === "QUICK_REPLY" || !btn.type) && <CornerDownLeft size={13} className="wa-btn-icon" />}
              <span>{btn.text || "Button Action"}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
