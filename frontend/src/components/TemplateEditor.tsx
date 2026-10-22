import React from "react";
import {
  Lock,
  ArrowLeft,
  Sliders,
  ExternalLink,
  PhoneCall,
  CornerDownLeft,
} from "lucide-react";
import { WhatsAppTemplate } from "../types/template.js";

interface TemplateEditorProps {
  template: WhatsAppTemplate;
  onChange: (updated: WhatsAppTemplate) => void;
  onCancel: () => void;
  // Retained optional for backwards test compatibility
  onSave?: (template: WhatsAppTemplate) => void;
}

export const TemplateEditor: React.FC<TemplateEditorProps> = ({
  template,
  onChange,
  onCancel,
}) => {
  // Update local sample preview values without mutating template structure
  const updateVariableSample = (key: string, sampleValue: string) => {
    const updatedVariables = template.variables.map((v) =>
      v.key === key ? { ...v, sampleValue } : v
    );
    onChange({
      ...template,
      variables: updatedVariables,
    });
  };

  const isApproved = template.status === "APPROVED";

  return (
    <div className="template-editor-container">
      {/* 1. Meta-Approved Locked Template Notice */}
      <div
        className="meta-locked-banner"
        style={{
          background: "rgba(99, 102, 241, 0.08)",
          border: "1px solid rgba(99, 102, 241, 0.25)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
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

      {/* Editor Header Bar */}
      <div className="editor-top-actions">
        <div className="editor-heading-wrap">
          <h2 className="editor-heading">Template Specification</h2>
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
            Verified Specification
          </span>
        </div>

        <div className="editor-action-buttons">
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
                value={`${template.status} (${isApproved ? "Eligible for sending" : "Non-sendable"})`}
                disabled
                readOnly
                style={{
                  background: "rgba(255, 255, 255, 0.03)",
                  cursor: "not-allowed",
                  color: isApproved ? "var(--accent-emerald)" : "var(--accent-rose)",
                  fontWeight: 500,
                }}
              />
              <span className="input-hint">Synchronized status from Meta WABA</span>
            </div>
          </div>
        </section>

        {/* SECTION 2: Message Header (Read-Only) */}
        {template.header && template.header.type !== "NONE" && (
          <section className="editor-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="section-title-sm" style={{ margin: 0 }}>2. Header</h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Lock size={12} /> Read-Only
              </span>
            </div>

            <div className="form-group">
              <label className="form-label">Header Format: <strong>{template.header.type}</strong></label>
              {template.header.type === "TEXT" && (
                <input
                  type="text"
                  className="form-input"
                  value={template.header.text || ""}
                  disabled
                  readOnly
                  style={{ background: "rgba(255, 255, 255, 0.03)", cursor: "not-allowed" }}
                />
              )}
              {template.header.type === "IMAGE" && (
                <div style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
                  Media format: Image header approved by Meta
                </div>
              )}
            </div>
          </section>
        )}

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
        {template.variables && template.variables.length > 0 && (
          <section className="editor-card">
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
                Interactive Preview
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
                    />
                  </div>
                </div>
              ))}
            </div>
          </section>
        )}

        {/* SECTION 5: Footer & Buttons (Read-Only) */}
        {((template.footer) || (template.buttons && template.buttons.length > 0)) && (
          <section className="editor-card">
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.75rem" }}>
              <h3 className="section-title-sm" style={{ margin: 0 }}>5. Footer & Buttons</h3>
              <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.3rem" }}>
                <Lock size={12} /> Read-Only
              </span>
            </div>

            {template.footer && (
              <div className="form-group" style={{ marginBottom: "1rem" }}>
                <label className="form-label">Footer Text</label>
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

            {template.buttons && template.buttons.length > 0 && (
              <div>
                <label className="form-label">Approved Action Buttons ({template.buttons.length})</label>
                <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
                  {template.buttons.map((btn, idx) => (
                    <div
                      key={btn.id || idx}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: "0.75rem",
                        padding: "0.6rem 0.85rem",
                        background: "rgba(255, 255, 255, 0.03)",
                        border: "1px solid var(--border-subtle)",
                        borderRadius: "var(--radius-sm)",
                        fontSize: "0.85rem",
                      }}
                    >
                      {btn.type === "URL" && <ExternalLink size={14} color="var(--accent-indigo-light)" />}
                      {btn.type === "PHONE_NUMBER" && <PhoneCall size={14} color="var(--accent-emerald)" />}
                      {btn.type === "QUICK_REPLY" && <CornerDownLeft size={14} color="var(--accent-amber)" />}
                      <span style={{ fontWeight: 500 }}>{btn.text}</span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginLeft: "auto" }}>
                        Type: {btn.type} {btn.url ? `(${btn.url})` : btn.phoneNumber ? `(${btn.phoneNumber})` : ""}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </section>
        )}
      </div>
    </div>
  );
};
