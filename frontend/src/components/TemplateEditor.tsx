import React, { useState, useRef, useEffect } from "react";
import {
  Lock,
  ArrowLeft,
  Sliders,
  ExternalLink,
  PhoneCall,
  CornerDownLeft,
  Sparkles,
  FileImage,
  Upload,
  Trash2,
  Check,
  Eye,
  RotateCcw,
  AlertCircle,
} from "lucide-react";
import { WhatsAppTemplate } from "../types/template.js";
import { CampaignPosterPickerModal } from "./poster/CampaignPosterPickerModal.js";
import { PosterCampaignAttachment } from "../types/poster.js";
import { validateActionButtonPhoneNumber } from "./WhatsAppPhonePreview.js";

export { validateActionButtonPhoneNumber };

interface TemplateEditorProps {
  template: WhatsAppTemplate;
  onChange: (updated: WhatsAppTemplate) => void;
  onCancel: () => void;
  onSave?: (template: WhatsAppTemplate) => void;
  canSaveDraft?: boolean;
  hideAdminSampleImage?: boolean;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  template,
  onChange,
  onCancel,
  onSave,
  canSaveDraft = Boolean(onSave),
  hideAdminSampleImage = false,
}) => {
  const [isPosterPickerOpen, setIsPosterPickerOpen] = useState<boolean>(false);
  const [isSaveSuccess, setIsSaveSuccess] = useState<boolean>(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Update local sample preview values without mutating template structure
  const updateVariableSample = (key: string, sampleValue: string) => {
    const updatedVariables = (template.variables || []).map((v) =>
      v.key === key ? { ...v, sampleValue } : v
    );
    onChange({
      ...template,
      variables: updatedVariables,
    });
  };

  // Update button sample URL (for URL buttons that support dynamic parameter simulation)
  const updateButtonSampleUrl = (btnId: string, url: string) => {
    const updatedButtons = (template.buttons || []).map((b) =>
      b.id === btnId ? { ...b, url } : b
    );
    onChange({
      ...template,
      buttons: updatedButtons,
    });
  };

  // Record initial phone button numbers to allow customer to reset back to original
  const originalPhoneNumbersRef = useRef<Record<string, string>>({});
  const [phoneBtnErrors, setPhoneBtnErrors] = useState<Record<string, string | null>>({});

  useEffect(() => {
    (template.buttons || []).forEach((b, idx) => {
      const key = b.id || String(idx);
      if (b.type === "PHONE_NUMBER" && originalPhoneNumbersRef.current[key] === undefined) {
        originalPhoneNumbersRef.current[key] = b.phoneNumber || "";
      }
    });
  }, [template.id]);

  // Update phone button number in local preview state
  const updateButtonSamplePhoneNumber = (btnIdOrIdx: string, phoneNumber: string) => {
    const validation = validateActionButtonPhoneNumber(phoneNumber);
    setPhoneBtnErrors((prev) => ({
      ...prev,
      [btnIdOrIdx]: validation.error,
    }));

    const updatedButtons = (template.buttons || []).map((b, idx) => {
      const key = b.id || String(idx);
      return key === btnIdOrIdx ? { ...b, phoneNumber } : b;
    });

    onChange({
      ...template,
      buttons: updatedButtons,
    });
  };

  // Reset phone button number to original template definition
  const handleResetButtonPhone = (btnIdOrIdx: string) => {
    const originalNum = originalPhoneNumbersRef.current[btnIdOrIdx] ?? "";
    setPhoneBtnErrors((prev) => ({
      ...prev,
      [btnIdOrIdx]: null,
    }));

    const updatedButtons = (template.buttons || []).map((b, idx) => {
      const key = b.id || String(idx);
      return key === btnIdOrIdx ? { ...b, phoneNumber: originalNum } : b;
    });

    onChange({
      ...template,
      buttons: updatedButtons,
    });
  };

  // Handle poster selection for image header
  const handleSelectPoster = (attachment: PosterCampaignAttachment) => {
    onChange({
      ...template,
      header: {
        ...template.header,
        type: "IMAGE",
        mediaUrl: attachment.dataUrl,
        mediaFilename: attachment.filename || `${attachment.title}.png`,
        mediaFilesize: `${attachment.width}×${attachment.height} px`,
        mediaIsLocal: true,
        mimeType: attachment.format === "jpeg" ? "image/jpeg" : "image/png",
      },
    });
    setIsPosterPickerOpen(false);
  };

  // Handle local image file upload for image header
  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = "";

    if (!file.type.startsWith("image/")) {
      return;
    }

    const reader = new FileReader();
    reader.onload = (ev) => {
      const dataUrl = ev.target?.result as string;
      if (!dataUrl) return;

      onChange({
        ...template,
        header: {
          ...template.header,
          type: "IMAGE",
          mediaUrl: dataUrl,
          mediaFilename: file.name,
          mediaFilesize: `${(file.size / 1024).toFixed(1)} KB`,
          mediaIsLocal: true,
          mimeType: file.type,
        },
      });
    };
    reader.readAsDataURL(file);
  };

  // Handle removal of header image
  const handleRemoveImage = () => {
    onChange({
      ...template,
      header: {
        ...template.header,
        type: "IMAGE",
        mediaUrl: undefined,
        mediaFilename: undefined,
        mediaFilesize: undefined,
        mediaIsLocal: false,
      },
    });
  };

  const handleSaveDraft = () => {
    if (onSave && canSaveDraft) {
      onSave(template);
      setIsSaveSuccess(true);
      setTimeout(() => setIsSaveSuccess(false), 2500);
    }
  };

  const isApproved = template.status === "APPROVED";
  const isLocalDraft = Boolean(
    template.isLocalDraft ||
    template.status === "LOCAL_DRAFT" ||
    template.status === "DRAFT" ||
    template.id?.startsWith("draft_")
  );
  const isImageHeader = template.header?.type === "IMAGE";
  const hasButtons = Boolean(template.buttons && template.buttons.length > 0);
  const hasVariables = Boolean(template.variables && template.variables.length > 0);

  // Security & Isolation: When hideAdminSampleImage is active, only user-selected
  // local uploads/posters are rendered in the customer preview.
  const isUserSelectedImage = Boolean(
    template.header?.mediaIsLocal || template.header?.mediaSource === "FILE"
  );
  const showSelectedImage = Boolean(
    template.header?.mediaUrl && (!hideAdminSampleImage || isUserSelectedImage)
  );

  return (
    <div className="template-editor-container" data-testid="template-editor">
      {/* 1. Status Banner: Featured Local Draft vs Meta-Approved Template */}
      {isLocalDraft ? (
        <div
          className="meta-locked-banner local-featured-banner"
          data-testid="local-featured-banner"
          style={{
            background: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.3)",
            borderRadius: "var(--radius-md)",
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.85rem",
          }}
          role="note"
        >
          <div
            style={{
              background: "rgba(99, 102, 241, 0.2)",
              color: "var(--accent-indigo-light)",
              padding: "0.4rem",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            <Sparkles size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
              <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
                Featured Template · Pending Meta Approval
              </strong>
              <span
                className="status-sub-pill"
                data-testid="featured-admin-pill"
                style={{
                  background: "rgba(99, 102, 241, 0.15)",
                  color: "var(--accent-indigo-light)",
                  border: "1px solid rgba(99, 102, 241, 0.35)",
                  fontWeight: 600,
                  fontSize: "0.68rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                Featured (Admin Saved)
              </span>
              <span
                className="status-sub-pill"
                style={{
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "var(--accent-amber)",
                  fontWeight: 600,
                  fontSize: "0.68rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                Non-Sendable
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              This template was created and saved by an Admin as a Grovastra Featured Template. It is visible for customer discovery and preview, but sending through WhatsApp requires official Meta submission and approval.
            </p>
          </div>
        </div>
      ) : (
        <div
          className="meta-locked-banner"
          style={{
            background: "rgba(99, 102, 241, 0.08)",
            border: "1px solid rgba(99, 102, 241, 0.25)",
            borderRadius: "var(--radius-md)",
            padding: "1rem 1.25rem",
            marginBottom: "1.25rem",
            display: "flex",
            alignItems: "flex-start",
            gap: "0.85rem",
          }}
          role="note"
        >
          <div
            style={{
              background: "rgba(99, 102, 241, 0.2)",
              color: "var(--accent-indigo-light)",
              padding: "0.4rem",
              borderRadius: "6px",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
              marginTop: "2px",
            }}
          >
            <Lock size={18} />
          </div>
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
              <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
                Meta-approved template · Editing unavailable
              </strong>
              <span
                className="status-sub-pill"
                style={{
                  background: isApproved ? "rgba(16, 185, 129, 0.15)" : "rgba(245, 158, 11, 0.15)",
                  color: isApproved ? "var(--accent-emerald)" : "var(--accent-amber)",
                  fontWeight: 600,
                  fontSize: "0.68rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                {template.status}
              </span>
            </div>
            <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
              This template is managed by Meta. Its approved content cannot be edited here. Create or update a template through the supported Meta workflow, then refresh its status.
            </p>
          </div>
        </div>
      )}

      {/* Safety Notice: Local Simulation Only */}
      <div
        className="simulation-safety-banner"
        data-testid="simulation-safety-banner"
        style={{
          display: "flex",
          alignItems: "center",
          gap: "0.65rem",
          padding: "0.65rem 0.95rem",
          borderRadius: "var(--radius-sm)",
          background: "rgba(16, 185, 129, 0.06)",
          border: "1px solid rgba(16, 185, 129, 0.25)",
          color: "var(--text-primary)",
          fontSize: "0.8rem",
          marginBottom: "1.25rem",
        }}
      >
        <Eye size={16} style={{ color: "var(--accent-emerald)", flexShrink: 0 }} />
        <span>
          <strong>Local Test Simulation:</strong> Testing variable parameter values and media appearance in browser memory. <strong>0 messages sent</strong>, no campaigns enqueued, and no Meta endpoints invoked.
        </span>
      </div>

      {/* Editor Header Bar */}
      <div className="editor-top-actions">
        <div className="editor-heading-wrap">
          <h2 className="editor-heading">Template Specification & Preview</h2>
          <span
            className="status-sub-pill"
            style={{
              background: "rgba(255, 255, 255, 0.05)",
              color: "var(--text-secondary)",
              fontSize: "0.75rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "var(--radius-full)",
            }}
          >
            {isLocalDraft ? "Local Draft" : "Meta Verified"}
          </span>
        </div>

        <div className="editor-action-buttons" style={{ display: "flex", gap: "0.5rem" }}>
          {isLocalDraft && onSave && canSaveDraft && (
            <button
              type="button"
              className="btn-primary"
              onClick={handleSaveDraft}
              data-testid="btn-save-draft-changes"
              style={{ fontSize: "0.85rem", padding: "0.4rem 0.85rem" }}
            >
              {isSaveSuccess ? <Check size={14} style={{ marginRight: "0.35rem" }} /> : null}
              <span>{isSaveSuccess ? "Saved!" : "Save Draft Changes"}</span>
            </button>
          )}
          <button type="button" className="btn-secondary" onClick={onCancel}>
            <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
            <span>Back to List</span>
          </button>
        </div>
      </div>

      <div className="editor-sections-stack">
        {/* SECTION 1: Basic Information (Read-Only) */}
        <section className="editor-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 className="section-title-sm" style={{ margin: 0 }}>1. Basic Details</h3>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Lock size={12} /> Structure Locked
            </span>
          </div>

          <div className="form-grid-2">
            <div className="form-group">
              <label htmlFor="tpl-name" className="form-label">
                Template Name
              </label>
              <input
                id="tpl-name"
                type="text"
                className="form-input"
                value={template.name}
                disabled
                readOnly
                style={{ background: "rgba(255, 255, 255, 0.03)", cursor: "not-allowed", color: "var(--text-secondary)" }}
              />
              <span className="input-hint">Unique identifier on Meta WhatsApp Cloud API</span>
            </div>

            <div className="form-group">
              <label htmlFor="tpl-category" className="form-label">
                Category
              </label>
              <input
                id="tpl-category"
                type="text"
                className="form-input"
                value={template.category}
                disabled
                readOnly
                style={{ background: "rgba(255, 255, 255, 0.03)", cursor: "not-allowed", color: "var(--text-secondary)" }}
              />
              <span className="input-hint">Official Meta category classification</span>
            </div>

            <div className="form-group">
              <label htmlFor="tpl-language" className="form-label">
                Language
              </label>
              <input
                id="tpl-language"
                type="text"
                className="form-input"
                value={template.language}
                disabled
                readOnly
                style={{ background: "rgba(255, 255, 255, 0.03)", cursor: "not-allowed", color: "var(--text-secondary)" }}
              />
              <span className="input-hint">Language code approved on Meta</span>
            </div>

            <div className="form-group">
              <label htmlFor="tpl-status" className="form-label">
                Meta Status
              </label>
              <input
                id="tpl-status"
                type="text"
                className="form-input"
                value={
                  isLocalDraft
                    ? "LOCAL_DRAFT (Pending Meta Submission)"
                    : `${template.status} (${isApproved ? "Eligible for sending" : "Non-sendable"})`
                }
                disabled
                readOnly
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  cursor: "not-allowed",
                  color: isApproved ? "var(--accent-emerald)" : isLocalDraft ? "var(--accent-indigo-light)" : "var(--accent-rose)",
                  fontWeight: 500,
                }}
              />
              <span className="input-hint">Synchronized status from Meta WABA</span>
            </div>
          </div>
        </section>

        {/* SECTION 2: Message Header (Contextual Editing: ONLY if IMAGE header) */}
        <section className="editor-card" data-testid="section-header-controls">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 className="section-title-sm" style={{ margin: 0 }}>
              2. Header Component: {template.header?.type || "NONE"}
            </h3>
            {isImageHeader ? (
              <span
                style={{
                  fontSize: "0.72rem",
                  color: "var(--accent-emerald)",
                  background: "rgba(16, 185, 129, 0.12)",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                  fontWeight: 500,
                }}
              >
                Media Configurable
              </span>
            ) : (
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Lock size={12} /> {template.header?.type === "TEXT" ? "Text Header Locked" : "Text-Only Template"}
              </span>
            )}
          </div>

          {isImageHeader ? (
            /* Contextual Image Controls: Rendered ONLY when template has an IMAGE header */
            <div className="header-image-edit-panel" data-testid="header-image-edit-panel">
              <input
                ref={fileInputRef}
                type="file"
                accept="image/png,image/jpeg,image/jpg"
                style={{ display: "none" }}
                onChange={handleFileUpload}
                aria-label="Upload Replacement Image"
                data-testid="template-header-file-input"
              />

              {showSelectedImage ? (
                <div
                  className="header-image-current-box"
                  data-testid="header-image-current-box"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "space-between",
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.3)",
                    gap: "1rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", minWidth: 0, flex: 1 }}>
                    <img
                      src={template.header.mediaUrl}
                      alt={template.header.mediaFilename || "Header Media"}
                      style={{
                        width: "56px",
                        height: "56px",
                        objectFit: "contain",
                        borderRadius: "6px",
                        background: "#0b141a",
                        border: "1px solid rgba(255, 255, 255, 0.1)",
                        flexShrink: 0,
                      }}
                    />
                    <div style={{ minWidth: 0 }}>
                      <strong style={{ fontSize: "0.88rem", color: "var(--text-primary)", display: "block", textOverflow: "ellipsis", overflow: "hidden", whiteSpace: "nowrap" }}>
                        {template.header.mediaFilename || "Attached Header Image"}
                      </strong>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)" }}>
                        {template.header.mediaFilesize || "1200×628 px (Recommended)"}
                      </span>
                    </div>
                  </div>

                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexShrink: 0 }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                      onClick={() => setIsPosterPickerOpen(true)}
                      data-testid="btn-change-image-posters"
                      aria-label="Change Image from Posters"
                    >
                      <Sparkles size={13} style={{ marginRight: "0.3rem", color: "var(--accent-emerald)" }} />
                      <span>Posters</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem" }}
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="btn-change-image-upload"
                      aria-label="Upload Replacement Image"
                    >
                      <Upload size={13} style={{ marginRight: "0.3rem" }} />
                      <span>Upload</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: "0.78rem", padding: "0.35rem 0.65rem", color: "var(--accent-rose)" }}
                      onClick={handleRemoveImage}
                      data-testid="btn-remove-header-image"
                      aria-label="Remove Image"
                    >
                      <Trash2 size={13} />
                    </button>
                  </div>
                </div>
              ) : (
                <div
                  className="header-image-placeholder-box"
                  data-testid="header-image-placeholder-box"
                  style={{
                    display: "flex",
                    flexDirection: "column",
                    alignItems: "center",
                    justifyContent: "center",
                    padding: "1.5rem 1rem",
                    borderRadius: "8px",
                    background: "rgba(0, 0, 0, 0.2)",
                    border: "1px dashed var(--border-subtle)",
                    textAlign: "center",
                    gap: "0.75rem",
                    marginBottom: "0.75rem",
                  }}
                >
                  <FileImage size={32} color="var(--text-muted)" />
                  <div>
                    <h4 style={{ margin: "0 0 0.25rem 0", fontSize: "0.95rem" }}>No image selected</h4>
                    <p style={{ margin: 0, fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      This template requires an image header. Attach a 1200×628 WhatsApp header poster or upload an image to simulate in the preview bubble.
                    </p>
                  </div>
                  <div style={{ display: "flex", gap: "0.5rem" }}>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                      onClick={() => setIsPosterPickerOpen(true)}
                      data-testid="btn-choose-poster"
                    >
                      <Sparkles size={14} style={{ marginRight: "0.35rem", color: "var(--accent-emerald)" }} />
                      <span>Choose from Posters</span>
                    </button>
                    <button
                      type="button"
                      className="btn-secondary"
                      style={{ fontSize: "0.8rem", padding: "0.4rem 0.75rem" }}
                      onClick={() => fileInputRef.current?.click()}
                      data-testid="btn-upload-image"
                    >
                      <Upload size={14} style={{ marginRight: "0.35rem" }} />
                      <span>Upload Image</span>
                    </button>
                  </div>
                </div>
              )}

              <p className="input-hint" style={{ margin: 0 }}>
                WhatsApp template image headers natively use 1.91:1 landscape (1200×628). Square 1:1 designs are safely letterboxed with contain mode without cropping.
              </p>

              {/* Saved Posters Picker Modal */}
              <CampaignPosterPickerModal
                isOpen={isPosterPickerOpen}
                onClose={() => setIsPosterPickerOpen(false)}
                onSelectPoster={handleSelectPoster}
              />
            </div>
          ) : template.header?.type === "TEXT" ? (
            /* Text Header: Visibly locked */
            <div className="form-group" style={{ margin: 0 }}>
              <label className="form-label">Approved Header Text</label>
              <input
                type="text"
                className="form-input"
                value={template.header.text || ""}
                disabled
                readOnly
                style={{ background: "rgba(255, 255, 255, 0.03)", cursor: "not-allowed", color: "var(--text-secondary)" }}
              />
              <span className="input-hint">Header text is locked by Meta template registration.</span>
            </div>
          ) : (
            /* NONE: Text-only template without header */
            <div
              className="text-only-header-notice"
              data-testid="text-only-header-notice"
              style={{
                fontSize: "0.84rem",
                color: "var(--text-secondary)",
                padding: "0.75rem",
                background: "rgba(255, 255, 255, 0.02)",
                borderRadius: "6px",
                border: "1px solid var(--border-subtle)",
              }}
            >
              This template does not contain a header component. Image and media options are disabled for text-only templates.
            </div>
          )}
        </section>

        {/* SECTION 3: Approved Message Body (Read-Only) */}
        <section className="editor-card">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
            <h3 className="section-title-sm" style={{ margin: 0 }}>3. Approved Message Body</h3>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
              <Lock size={12} /> Meta Content Locked
            </span>
          </div>
          <p className="section-desc" style={{ marginBottom: "0.75rem" }}>
            The exact approved text body registered on Meta. Variable placeholders (e.g. <code>&#123;&#123;1&#125;&#125;</code>) will be populated with recipient data during campaign dispatch.
          </p>

          <div
            style={{
              padding: "1rem",
              background: "rgba(0, 0, 0, 0.25)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-sm)",
              fontFamily: "var(--font-mono, monospace)",
              fontSize: "0.88rem",
              lineHeight: 1.6,
              color: "var(--text-primary)",
              whiteSpace: "pre-wrap",
            }}
          >
            {template.body}
          </div>
        </section>

        {/* SECTION 4: Interactive Sample Preview Variables */}
        {hasVariables && (
          <section className="editor-card" data-testid="section-sample-variables">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem" }}>
                <Sliders size={16} color="var(--accent-indigo-light)" />
                <h3 className="section-title-sm" style={{ margin: 0 }}>
                  4. Sample Preview Variables
                </h3>
              </div>
              <span
                className="status-sub-pill"
                style={{
                  background: "rgba(16, 185, 129, 0.12)",
                  color: "var(--accent-emerald)",
                  fontSize: "0.7rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                Interactive Simulation
              </span>
            </div>

            <p className="section-desc" style={{ marginBottom: "1rem" }}>
              Enter sample values below to preview how dynamic parameters will look inside the WhatsApp message bubble on the right.
            </p>

            <div className="variables-fields-stack">
              {template.variables.map((variable) => (
                <div key={variable.key} className="variable-row-card" style={{ marginBottom: "0.75rem" }}>
                  <div className="var-header-line">
                    <span className="var-chip">&#123;&#123;{variable.key}&#125;&#125;</span>
                    <span className="var-label-text">
                      Parameter {variable.key} {variable.fallbackValue ? `(${variable.fallbackValue})` : ""}
                    </span>
                  </div>

                  <div className="form-group" style={{ margin: 0 }}>
                    <input
                      type="text"
                      className="form-input"
                      placeholder={`Test value for {{${variable.key}}}`}
                      value={variable.sampleValue || ""}
                      onChange={(e) => updateVariableSample(variable.key, e.target.value)}
                      data-testid={`input-sample-${variable.key}`}
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SECTION 5: Footer & Buttons (Contextual: Shows button inputs only when buttons exist) */}
        {(template.footer || hasButtons) && (
          <section className="editor-card" data-testid="section-footer-buttons">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="section-title-sm" style={{ margin: 0 }}>5. Footer & Buttons</h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Lock size={12} /> Meta-Approved Actions
              </span>
            </div>

            {template.footer && (
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Footer Text (Read-Only)</label>
                <input
                  type="text"
                  className="form-input"
                  value={template.footer}
                  disabled
                  readOnly
                  style={{ background: "rgba(255, 255, 255, 0.03)", cursor: "not-allowed" }}
                />
              </div>
            )}

            {hasButtons ? (
              <div>
                <label className="form-label">Action Buttons ({template.buttons.length})</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.6rem" }}>
                  {template.buttons.map((btn, idx) => (
                    <div
                      key={btn.id || idx}
                      style={{
                        padding: "0.75rem",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        display: "flex",
                        flexDirection: "column",
                        gap: "0.4rem",
                      }}
                    >
                      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                        {btn.type === "URL" && <ExternalLink size={14} color="var(--accent-indigo-light)" />}
                        {btn.type === "PHONE_NUMBER" && <PhoneCall size={14} color="var(--accent-emerald)" />}
                        {btn.type === "QUICK_REPLY" && <CornerDownLeft size={14} color="var(--accent-amber)" />}
                        <strong style={{ fontSize: "0.85rem" }}>{btn.text}</strong>
                        <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                          Type: {btn.type}
                        </span>
                      </div>

                      {btn.type === "URL" && (
                        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginTop: "0.2rem" }}>
                          <span style={{ fontSize: "0.75rem", color: "var(--text-secondary)", minWidth: "60px" }}>URL:</span>
                          <input
                            type="text"
                            className="form-input"
                            value={btn.url || ""}
                            onChange={(e) => updateButtonSampleUrl(btn.id, e.target.value)}
                            placeholder="https://example.com"
                            style={{ fontSize: "0.8rem", padding: "0.3rem 0.5rem" }}
                            data-testid={`input-button-url-${btn.id}`}
                          />
                        </div>
                      )}

                      {btn.type === "PHONE_NUMBER" && (
                        <div
                          className="phone-btn-edit-group"
                          data-testid={`phone-btn-edit-group-${btn.id || idx}`}
                          style={{ display: "flex", flexDirection: "column", gap: "0.35rem", marginTop: "0.35rem" }}
                        >
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", flexWrap: "wrap", gap: "0.35rem" }}>
                            <label
                              htmlFor={`input-phone-btn-${btn.id || idx}`}
                              className="form-label"
                              style={{ fontSize: "0.75rem", margin: 0, display: "flex", alignItems: "center", gap: "0.35rem" }}
                            >
                              <span>Test Phone Button Number</span>
                              <span
                                style={{
                                  fontSize: "0.62rem",
                                  color: "var(--accent-emerald-light)",
                                  background: "rgba(16, 185, 129, 0.12)",
                                  border: "1px solid rgba(16, 185, 129, 0.25)",
                                  padding: "0.08rem 0.35rem",
                                  borderRadius: "4px",
                                  fontWeight: 500,
                                }}
                              >
                                Simulation Only
                              </span>
                            </label>

                            {/* Reset button to restore original configured number */}
                            {originalPhoneNumbersRef.current[btn.id || String(idx)] !== undefined &&
                              btn.phoneNumber !== originalPhoneNumbersRef.current[btn.id || String(idx)] && (
                                <button
                                  type="button"
                                  className="btn-secondary"
                                  onClick={() => handleResetButtonPhone(btn.id || String(idx))}
                                  data-testid={`btn-reset-phone-${btn.id || idx}`}
                                  style={{
                                    fontSize: "0.68rem",
                                    padding: "0.15rem 0.45rem",
                                    height: "auto",
                                    minHeight: "22px",
                                    display: "inline-flex",
                                    alignItems: "center",
                                    gap: "0.25rem",
                                    background: "rgba(255, 255, 255, 0.05)",
                                  }}
                                  title={`Reset to original (${originalPhoneNumbersRef.current[btn.id || String(idx)]})`}
                                >
                                  <RotateCcw size={11} />
                                  <span>Reset</span>
                                </button>
                              )}
                          </div>

                          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                            <input
                              id={`input-phone-btn-${btn.id || idx}`}
                              type="tel"
                              className={`form-input ${phoneBtnErrors[btn.id || String(idx)] ? "form-input-error" : ""}`}
                              value={btn.phoneNumber || ""}
                              onChange={(e) => updateButtonSamplePhoneNumber(btn.id || String(idx), e.target.value)}
                              placeholder="+919876543210"
                              style={{ fontSize: "0.82rem", padding: "0.35rem 0.6rem", height: "36px" }}
                              data-testid={`input-button-phone-${btn.id || idx}`}
                              autoComplete="off"
                              spellCheck={false}
                            />
                          </div>

                          {phoneBtnErrors[btn.id || String(idx)] && (
                            <div
                              className="phone-btn-error"
                              data-testid={`phone-btn-error-${btn.id || idx}`}
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "0.3rem",
                                fontSize: "0.72rem",
                                color: "var(--accent-rose)",
                              }}
                              role="alert"
                            >
                              <AlertCircle size={12} style={{ flexShrink: 0 }} />
                              <span>{phoneBtnErrors[btn.id || String(idx)]}</span>
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </section>
        )}
      </div>
    </div>
  );
};
