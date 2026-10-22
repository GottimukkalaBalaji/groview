import React from "react";
import {
  Lock,
  ArrowLeft,
  Layers,
  Tag,
  ShieldCheck,
  Workflow,
  ShoppingBag,
  Clock,
  Copy,
} from "lucide-react";

export type TemplateStudioType =
  | "STANDARD"
  | "CAROUSEL"
  | "COUPON_LTO"
  | "AUTHENTICATION"
  | "FLOWS"
  | "COMMERCE";

export interface TemplateTypeOption {
  id: TemplateStudioType;
  label: string;
  category: "STANDARD" | "ADVANCED";
  description: string;
}

export const TEMPLATE_TYPE_OPTIONS: TemplateTypeOption[] = [
  {
    id: "STANDARD",
    label: "Standard Text / Media + Buttons",
    category: "STANDARD",
    description:
      "Standard WhatsApp message with optional header (text or media), dynamic text body with variables, footer, and interactive buttons (Quick Replies, URL, Phone Number).",
  },
  {
    id: "CAROUSEL",
    label: "Carousel",
    category: "ADVANCED",
    description:
      "Multi-card horizontal scrolling template. Each card contains a uniform media header, message body, and up to 2 interactive buttons.",
  },
  {
    id: "COUPON_LTO",
    label: "Coupon / LTO",
    category: "ADVANCED",
    description:
      "Promotional template with specialized Copy Code buttons, limited-time offer badges, and expiration timestamps.",
  },
  {
    id: "AUTHENTICATION",
    label: "Authentication",
    category: "ADVANCED",
    description:
      "One-Time Password (OTP) verification template with strict Meta security rules, code expiration minutes, and auto-fill / copy-code buttons.",
  },
  {
    id: "FLOWS",
    label: "WhatsApp Flows",
    category: "ADVANCED",
    description:
      "Rich interactive in-app forms and multi-step workflows linked to a Meta Flow ID.",
  },
  {
    id: "COMMERCE",
    label: "Commerce Integrations",
    category: "ADVANCED",
    description:
      "Catalog and multi-product shopping messages linked to a Meta Commerce catalog ID.",
  },
];

interface ShellProps {
  onExit: () => void;
}

/* ==============================================================================
   1. CAROUSEL SHELL
   ============================================================================== */
export const CarouselWorkspaceShell: React.FC<ShellProps> = ({ onExit }) => {
  return (
    <div className="template-editor-container" data-testid="carousel-editor-workspace">
      {/* Pending Status Banner */}
      <div
        className="local-draft-notice-banner"
        style={{
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.85rem",
        }}
        role="status"
      >
        <div
          style={{
            background: "rgba(245, 158, 11, 0.2)",
            color: "var(--accent-amber)",
            padding: "0.4rem",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          <Clock size={18} />
        </div>
        <div>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: "0.5rem",
              flexWrap: "wrap",
              marginBottom: "0.25rem",
            }}
          >
            <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Carousel Template (Meta Cloud API)
            </strong>
            <span
              className="status-sub-pill"
              style={{
                background: "rgba(245, 158, 11, 0.18)",
                color: "var(--accent-amber)",
                fontWeight: 600,
                fontSize: "0.68rem",
                padding: "0.15rem 0.5rem",
                borderRadius: "var(--radius-full)",
              }}
            >
              Editor Setup Pending
            </span>
          </div>
          <p
            style={{
              margin: 0,
              fontSize: "0.84rem",
              color: "var(--text-secondary)",
              lineHeight: 1.5,
            }}
          >
            Meta Carousel templates require multi-card component schema parsing and WhatsApp Business Account (WABA) media handles.
            Per Grovastra safety constraints, this template type cannot be saved or submitted as a Standard template.
          </p>
        </div>
      </div>

      {/* Top Action Bar */}
      <div className="editor-top-actions">
        <div className="editor-heading-wrap">
          <h2 className="editor-heading">Carousel Template Specification</h2>
          <span
            className="status-sub-pill"
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              color: "var(--accent-amber)",
              fontSize: "0.75rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "var(--radius-full)",
            }}
          >
            Specification Preview
          </span>
        </div>

        <div className="editor-action-buttons">
          <button type="button" className="btn-secondary" onClick={onExit}>
            <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
            <span>Exit</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled
            data-testid="save-draft-disabled-btn"
            id="save-draft-disabled-btn"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
            title="Cannot save as Standard template. Schema integration pending Meta API endpoint."
          >
            <Lock size={14} style={{ marginRight: "0.35rem" }} />
            <span>Save Disabled (Pending Setup)</span>
          </button>
        </div>
      </div>

      <div className="editor-sections-stack">
        {/* SECTION 1: Meta Technical Rules */}
        <section className="editor-card">
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Layers size={16} style={{ color: "var(--accent-indigo-light)" }} />
            <span>1. Meta Carousel Technical Requirements</span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Card Count</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>2 to 10 Cards</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Meta enforces minimum 2 cards</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Header Media Type</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>Uniform Media</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>All cards must share IMAGE or VIDEO</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Card Buttons</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>Max 2 per Card</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>QUICK_REPLY or URL buttons</div>
            </div>
          </div>
        </section>

        {/* SECTION 2: Carousel Card Structure Layout */}
        <section className="editor-card">
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem" }}>
            2. Multi-Card Architecture Layout
          </h3>
          <div style={{ display: "flex", gap: "1rem", overflowX: "auto", paddingBottom: "0.5rem" }}>
            <div style={{ flex: "0 0 240px", background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "1rem" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>Card 1 (Leader)</div>
              <div style={{ height: "90px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
                [ Image Asset: card_hero_1.jpg ]
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Body: "Summer Collection Hero"</div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "0.3rem", borderRadius: "4px" }}>Button 1: Shop Now (URL)</div>
            </div>
            <div style={{ flex: "0 0 240px", background: "rgba(255,255,255,0.03)", border: "1px dashed var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "1rem" }}>
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.5rem" }}>Card 2</div>
              <div style={{ height: "90px", background: "rgba(255,255,255,0.05)", borderRadius: "4px", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--text-muted)", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
                [ Image Asset: card_hero_2.jpg ]
              </div>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>Body: "Accessories & Footwear"</div>
              <div style={{ fontSize: "0.7rem", color: "var(--text-muted)", background: "rgba(255,255,255,0.04)", padding: "0.3rem", borderRadius: "4px" }}>Button 1: View Catalog (URL)</div>
            </div>
          </div>
        </section>

        {/* SECTION 3: Implementation Roadmap */}
        <section className="editor-card" style={{ borderLeft: "3px solid var(--accent-amber)" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.5rem", color: "var(--accent-amber)" }}>
            3. Pending Implementation Roadmap
          </h3>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <li>Extend Prisma schema and backend DTOs to store <code>CAROUSEL</code> component payloads.</li>
            <li>Implement WhatsApp Cloud API v17+ multi-card serializer with per-card parameter maps.</li>
            <li>Add media upload asset handle resolution for individual carousel cards.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

/* ==============================================================================
   2. COUPON / LTO SHELL
   ============================================================================== */
export const CouponLtoWorkspaceShell: React.FC<ShellProps> = ({ onExit }) => {
  return (
    <div className="template-editor-container" data-testid="coupon-lto-editor-workspace">
      {/* Banner */}
      <div
        className="local-draft-notice-banner"
        style={{
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.85rem",
        }}
        role="status"
      >
        <div
          style={{
            background: "rgba(245, 158, 11, 0.2)",
            color: "var(--accent-amber)",
            padding: "0.4rem",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          <Clock size={18} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
            <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Coupon / Limited-Time Offer (Meta Cloud API)
            </strong>
            <span
              className="status-sub-pill"
              style={{
                background: "rgba(245, 158, 11, 0.18)",
                color: "var(--accent-amber)",
                fontWeight: 600,
                fontSize: "0.68rem",
                padding: "0.15rem 0.5rem",
                borderRadius: "var(--radius-full)",
              }}
            >
              Editor Setup Pending
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Coupon and Limited-Time Offer (LTO) templates require native <code>COPY_CODE</code> button components and expiration timestamps.
            Per Grovastra safety constraints, this template type cannot be saved or submitted as a Standard template.
          </p>
        </div>
      </div>

      {/* Top Action Bar */}
      <div className="editor-top-actions">
        <div className="editor-heading-wrap">
          <h2 className="editor-heading">Coupon & LTO Specification</h2>
          <span
            className="status-sub-pill"
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              color: "var(--accent-amber)",
              fontSize: "0.75rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "var(--radius-full)",
            }}
          >
            Specification Preview
          </span>
        </div>

        <div className="editor-action-buttons">
          <button type="button" className="btn-secondary" onClick={onExit}>
            <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
            <span>Exit</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled
            data-testid="save-draft-disabled-btn"
            id="save-draft-disabled-btn"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
            title="Cannot save as Standard template. Schema integration pending Meta API endpoint."
          >
            <Lock size={14} style={{ marginRight: "0.35rem" }} />
            <span>Save Disabled (Pending Setup)</span>
          </button>
        </div>
      </div>

      <div className="editor-sections-stack">
        <section className="editor-card">
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Tag size={16} style={{ color: "var(--accent-indigo-light)" }} />
            <span>1. Meta Coupon & Offer Rules</span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Category</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>MARKETING Only</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Enforced by Meta policy</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Code Action</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>COPY_CODE Button</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>One-tap clipboard copy</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Expiration Badge</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>Dynamic Countdown</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Auto-expires on recipient device</div>
            </div>
          </div>
        </section>

        <section className="editor-card" style={{ borderLeft: "3px solid var(--accent-amber)" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.5rem", color: "var(--accent-amber)" }}>
            2. Pending Implementation Roadmap
          </h3>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <li>Implement native <code>COPY_CODE</code> button component encoder in template service.</li>
            <li>Add ISO 8601 expiration timestamp generator and timezone offset calculator.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

/* ==============================================================================
   3. AUTHENTICATION SHELL
   ============================================================================== */
export const AuthenticationWorkspaceShell: React.FC<ShellProps> = ({ onExit }) => {
  return (
    <div className="template-editor-container" data-testid="authentication-editor-workspace">
      {/* Banner */}
      <div
        className="local-draft-notice-banner"
        style={{
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.85rem",
        }}
        role="status"
      >
        <div
          style={{
            background: "rgba(245, 158, 11, 0.2)",
            color: "var(--accent-amber)",
            padding: "0.4rem",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          <Clock size={18} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
            <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Authentication / OTP Template (Meta Cloud API)
            </strong>
            <span
              className="status-sub-pill"
              style={{
                background: "rgba(245, 158, 11, 0.18)",
                color: "var(--accent-amber)",
                fontWeight: 600,
                fontSize: "0.68rem",
                padding: "0.15rem 0.5rem",
                borderRadius: "var(--radius-full)",
              }}
            >
              Editor Setup Pending
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            WhatsApp Authentication templates are strictly regulated by automated Meta security bots. Media headers, footers, and marketing text are prohibited.
            Per Grovastra safety constraints, this template type cannot be saved or submitted as a Standard template.
          </p>
        </div>
      </div>

      {/* Top Action Bar */}
      <div className="editor-top-actions">
        <div className="editor-heading-wrap">
          <h2 className="editor-heading">Authentication Template Specification</h2>
          <span
            className="status-sub-pill"
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              color: "var(--accent-amber)",
              fontSize: "0.75rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "var(--radius-full)",
            }}
          >
            Specification Preview
          </span>
        </div>

        <div className="editor-action-buttons">
          <button type="button" className="btn-secondary" onClick={onExit}>
            <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
            <span>Exit</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled
            data-testid="save-draft-disabled-btn"
            id="save-draft-disabled-btn"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
            title="Cannot save as Standard template. Schema integration pending Meta API endpoint."
          >
            <Lock size={14} style={{ marginRight: "0.35rem" }} />
            <span>Save Disabled (Pending Setup)</span>
          </button>
        </div>
      </div>

      <div className="editor-sections-stack">
        <section className="editor-card">
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShieldCheck size={16} style={{ color: "var(--accent-emerald)" }} />
            <span>1. Meta Authentication (OTP) Constraints</span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Header & Footer</div>
              <strong style={{ fontSize: "1rem", color: "var(--accent-rose)" }}>Prohibited</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>No images, videos, or footers</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>OTP Button Type</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>ONE_TAP / COPY_CODE</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>With optional Android app hash</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Code Expiration</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>1 to 90 Minutes</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Configurable expiry window</div>
            </div>
          </div>
        </section>

        <section className="editor-card" style={{ borderLeft: "3px solid var(--accent-amber)" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.5rem", color: "var(--accent-amber)" }}>
            2. Pending Implementation Roadmap
          </h3>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <li>Enforce strict Meta OTP validation rules in backend template verification service.</li>
            <li>Configure Android package signature hash generator for zero-tap autofill.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

/* ==============================================================================
   4. WHATSAPP FLOWS SHELL
   ============================================================================== */
export const FlowsWorkspaceShell: React.FC<ShellProps> = ({ onExit }) => {
  return (
    <div className="template-editor-container" data-testid="flows-editor-workspace">
      {/* Banner */}
      <div
        className="local-draft-notice-banner"
        style={{
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.85rem",
        }}
        role="status"
      >
        <div
          style={{
            background: "rgba(245, 158, 11, 0.2)",
            color: "var(--accent-amber)",
            padding: "0.4rem",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          <Clock size={18} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
            <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
              WhatsApp Flows Template (Meta Cloud API)
            </strong>
            <span
              className="status-sub-pill"
              style={{
                background: "rgba(245, 158, 11, 0.18)",
                color: "var(--accent-amber)",
                fontWeight: 600,
                fontSize: "0.68rem",
                padding: "0.15rem 0.5rem",
                borderRadius: "var(--radius-full)",
              }}
            >
              Editor Setup Pending
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            WhatsApp Flows templates enable interactive native in-app forms and appointment scheduling, requiring a published Meta Flow ID.
            Per Grovastra safety constraints, this template type cannot be saved or submitted as a Standard template.
          </p>
        </div>
      </div>

      {/* Top Action Bar */}
      <div className="editor-top-actions">
        <div className="editor-heading-wrap">
          <h2 className="editor-heading">WhatsApp Flows Specification</h2>
          <span
            className="status-sub-pill"
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              color: "var(--accent-amber)",
              fontSize: "0.75rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "var(--radius-full)",
            }}
          >
            Specification Preview
          </span>
        </div>

        <div className="editor-action-buttons">
          <button type="button" className="btn-secondary" onClick={onExit}>
            <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
            <span>Exit</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled
            data-testid="save-draft-disabled-btn"
            id="save-draft-disabled-btn"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
            title="Cannot save as Standard template. Schema integration pending Meta API endpoint."
          >
            <Lock size={14} style={{ marginRight: "0.35rem" }} />
            <span>Save Disabled (Pending Setup)</span>
          </button>
        </div>
      </div>

      <div className="editor-sections-stack">
        <section className="editor-card">
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Workflow size={16} style={{ color: "var(--accent-indigo-light)" }} />
            <span>1. Meta WhatsApp Flows Configuration</span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Meta Flow ID</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>flow_id Required</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Created in Meta Business Manager</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Flow Action</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>navigate / data_exchange</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Direct screen or dynamic webhook</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>CTA Button</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>FLOW Button Type</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Launches interactive flow canvas</div>
            </div>
          </div>
        </section>

        <section className="editor-card" style={{ borderLeft: "3px solid var(--accent-amber)" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.5rem", color: "var(--accent-amber)" }}>
            2. Pending Implementation Roadmap
          </h3>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <li>Integrate Meta Flows JSON schema v2.1+ validator and asset linker.</li>
            <li>Implement dynamic webhook decryptor for data exchange responses.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

/* ==============================================================================
   5. COMMERCE INTEGRATIONS SHELL
   ============================================================================== */
export const CommerceWorkspaceShell: React.FC<ShellProps> = ({ onExit }) => {
  return (
    <div className="template-editor-container" data-testid="commerce-editor-workspace">
      {/* Banner */}
      <div
        className="local-draft-notice-banner"
        style={{
          background: "rgba(245, 158, 11, 0.08)",
          border: "1px solid rgba(245, 158, 11, 0.3)",
          borderRadius: "var(--radius-md)",
          padding: "1rem 1.25rem",
          marginBottom: "1.5rem",
          display: "flex",
          alignItems: "flex-start",
          gap: "0.85rem",
        }}
        role="status"
      >
        <div
          style={{
            background: "rgba(245, 158, 11, 0.2)",
            color: "var(--accent-amber)",
            padding: "0.4rem",
            borderRadius: "6px",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
            marginTop: "2px",
          }}
        >
          <Clock size={18} />
        </div>
        <div>
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.25rem" }}>
            <strong style={{ fontSize: "0.95rem", color: "var(--text-primary)" }}>
              Commerce Integrations Template (Meta Cloud API)
            </strong>
            <span
              className="status-sub-pill"
              style={{
                background: "rgba(245, 158, 11, 0.18)",
                color: "var(--accent-amber)",
                fontWeight: 600,
                fontSize: "0.68rem",
                padding: "0.15rem 0.5rem",
                borderRadius: "var(--radius-full)",
              }}
            >
              Editor Setup Pending
            </span>
          </div>
          <p style={{ margin: 0, fontSize: "0.84rem", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            Commerce templates require an active Meta Commerce Catalog ID connected to the WhatsApp Business Account.
            Per Grovastra safety constraints, this template type cannot be saved or submitted as a Standard template.
          </p>
        </div>
      </div>

      {/* Top Action Bar */}
      <div className="editor-top-actions">
        <div className="editor-heading-wrap">
          <h2 className="editor-heading">Commerce Template Specification</h2>
          <span
            className="status-sub-pill"
            style={{
              background: "rgba(245, 158, 11, 0.12)",
              color: "var(--accent-amber)",
              fontSize: "0.75rem",
              padding: "0.15rem 0.5rem",
              borderRadius: "var(--radius-full)",
            }}
          >
            Specification Preview
          </span>
        </div>

        <div className="editor-action-buttons">
          <button type="button" className="btn-secondary" onClick={onExit}>
            <ArrowLeft size={14} style={{ marginRight: "0.35rem" }} />
            <span>Exit</span>
          </button>
          <button
            type="button"
            className="btn-primary"
            disabled
            data-testid="save-draft-disabled-btn"
            id="save-draft-disabled-btn"
            style={{ opacity: 0.5, cursor: "not-allowed" }}
            title="Cannot save as Standard template. Schema integration pending Meta API endpoint."
          >
            <Lock size={14} style={{ marginRight: "0.35rem" }} />
            <span>Save Disabled (Pending Setup)</span>
          </button>
        </div>
      </div>

      <div className="editor-sections-stack">
        <section className="editor-card">
          <h3 className="section-title-sm" style={{ marginBottom: "0.75rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <ShoppingBag size={16} style={{ color: "var(--accent-indigo-light)" }} />
            <span>1. Meta Commerce Requirements</span>
          </h3>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: "0.75rem" }}>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Catalog ID</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>catalog_id Required</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Linked in Meta Commerce Manager</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>Supported Formats</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>SPM / MPM</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Single or multi-product messages</div>
            </div>
            <div className="info-stat-card" style={{ background: "rgba(255,255,255,0.02)", border: "1px solid var(--border-subtle)", padding: "0.75rem 1rem", borderRadius: "var(--radius-md)" }}>
              <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginBottom: "0.25rem" }}>CTA Button</div>
              <strong style={{ fontSize: "1rem", color: "var(--text-primary)" }}>CATALOG / VIEW_ITEMS</strong>
              <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", marginTop: "0.2rem" }}>Opens native WhatsApp store</div>
            </div>
          </div>
        </section>

        <section className="editor-card" style={{ borderLeft: "3px solid var(--accent-amber)" }}>
          <h3 className="section-title-sm" style={{ marginBottom: "0.5rem", color: "var(--accent-amber)" }}>
            2. Pending Implementation Roadmap
          </h3>
          <ul style={{ margin: 0, paddingLeft: "1.2rem", fontSize: "0.82rem", color: "var(--text-secondary)", lineHeight: 1.7 }}>
            <li>Integrate Meta Commerce Catalog API product inventory synchronization.</li>
            <li>Add sectioned multi-product message builder and product SKU picker.</li>
          </ul>
        </section>
      </div>
    </div>
  );
};

/* ==============================================================================
   6. ADVANCED TYPE PHONE PREVIEW (COLUMN 2)
   ============================================================================== */
interface AdvancedPreviewProps {
  type: TemplateStudioType;
}

export const AdvancedTypePhonePreview: React.FC<AdvancedPreviewProps> = ({ type }) => {
  const currentOption = TEMPLATE_TYPE_OPTIONS.find((t) => t.id === type);

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
              color: "var(--accent-amber)",
              background: "rgba(245, 158, 11, 0.12)",
              padding: "0.15rem 0.45rem",
              borderRadius: "4px",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              fontWeight: 600,
            }}
          >
            <Clock size={10} /> {currentOption?.label} Mockup
          </span>
        </div>
      </div>

      {/* Realistic Mobile Device Frame */}
      <div className="phone-frame">
        {/* Device Status Bar */}
        <div className="phone-status-bar">
          <span className="status-time">9:41</span>
          <div className="status-notch"></div>
          <div className="status-icons">
            <span style={{ fontSize: "10px" }}>5G</span>
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
        <div className="wa-chat-canvas" style={{ minHeight: "440px" }}>
          <div className="wa-date-pill">TODAY</div>

          {/* CAROUSEL MOCKUP */}
          {type === "CAROUSEL" && (
            <div style={{ width: "100%", display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <div className="wa-message-bubble" style={{ maxWidth: "90%" }}>
                <div style={{ fontSize: "0.85rem", color: "var(--text-primary)" }}>
                  🔥 <strong>Check out our featured picks this week:</strong>
                </div>
              </div>

              {/* Horizontal Scroll Deck */}
              <div style={{ display: "flex", gap: "0.5rem", overflowX: "auto", paddingBottom: "0.4rem" }}>
                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    width: "160px",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="https://images.unsplash.com/photo-1521572267360-ee0c2909d518?w=300&auto=format&fit=crop&q=80"
                    alt="Card 1"
                    style={{ width: "100%", height: "95px", objectFit: "cover" }}
                  />
                  <div style={{ padding: "0.5rem" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)" }}>Linen Summer Tee</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" }}>$39.00 • Breathable</div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "0.35rem 0.5rem", textAlign: "center", fontSize: "0.72rem", color: "#38bdf8", fontWeight: 600 }}>
                    🛍️ Shop Now
                  </div>
                </div>

                <div
                  style={{
                    background: "var(--bg-surface)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "10px",
                    width: "160px",
                    flexShrink: 0,
                    overflow: "hidden",
                  }}
                >
                  <img
                    src="https://images.unsplash.com/photo-1542291026-7eec264c27ff?w=300&auto=format&fit=crop&q=80"
                    alt="Card 2"
                    style={{ width: "100%", height: "95px", objectFit: "cover" }}
                  />
                  <div style={{ padding: "0.5rem" }}>
                    <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)" }}>Sport Sneakers</div>
                    <div style={{ fontSize: "0.7rem", color: "var(--text-secondary)", marginTop: "2px" }}>$79.00 • Lightweight</div>
                  </div>
                  <div style={{ borderTop: "1px solid var(--border-subtle)", padding: "0.35rem 0.5rem", textAlign: "center", fontSize: "0.72rem", color: "#38bdf8", fontWeight: 600 }}>
                    🛍️ Shop Now
                  </div>
                </div>
              </div>
              <div style={{ textAlign: "center", fontSize: "0.68rem", color: "var(--text-muted)" }}>
                ‹ Slide to view cards (1 of 2) ›
              </div>
            </div>
          )}

          {/* COUPON / LTO MOCKUP */}
          {type === "COUPON_LTO" && (
            <div className="wa-message-bubble">
              <div style={{ background: "rgba(245, 158, 11, 0.15)", color: "var(--accent-amber)", padding: "0.35rem 0.5rem", borderRadius: "4px", fontSize: "0.75rem", fontWeight: 700, marginBottom: "0.5rem", textAlign: "center" }}>
                🎁 SPECIAL 25% DISCOUNT OFFER
              </div>
              <div style={{ fontSize: "0.84rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                Flash sale alert! Use this voucher code at checkout to claim 25% off your next purchase.
              </div>
              <div
                style={{
                  margin: "0.75rem 0 0.5rem",
                  background: "rgba(255, 255, 255, 0.04)",
                  border: "1px dashed var(--accent-amber)",
                  borderRadius: "6px",
                  padding: "0.5rem 0.75rem",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "space-between",
                }}
              >
                <div>
                  <div style={{ fontSize: "0.68rem", color: "var(--text-muted)" }}>Coupon Code</div>
                  <strong style={{ fontSize: "0.95rem", letterSpacing: "1px", color: "var(--text-primary)" }}>GROV25OFF</strong>
                </div>
                <span style={{ fontSize: "0.68rem", color: "var(--accent-amber)", background: "rgba(245,158,11,0.12)", padding: "0.15rem 0.4rem", borderRadius: "4px" }}>
                  ⏰ 48h left
                </span>
              </div>
              <div style={{ marginTop: "0.5rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem" }}>
                <div className="wa-bubble-btn" style={{ justifyContent: "center", color: "#38bdf8", fontWeight: 600 }}>
                  <Copy size={13} style={{ marginRight: "0.35rem" }} />
                  <span>Copy Code: GROV25OFF</span>
                </div>
              </div>
            </div>
          )}

          {/* AUTHENTICATION MOCKUP */}
          {type === "AUTHENTICATION" && (
            <div className="wa-message-bubble">
              <div style={{ display: "flex", alignItems: "center", gap: "0.4rem", marginBottom: "0.5rem", color: "var(--accent-emerald)" }}>
                <ShieldCheck size={16} />
                <span style={{ fontSize: "0.75rem", fontWeight: 600 }}>Security Verification</span>
              </div>
              <div style={{ fontSize: "0.85rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                <strong>492-108</strong> is your Grovastra verification code. For your security, do not share this code with anyone.
              </div>
              <div style={{ fontSize: "0.72rem", color: "var(--text-muted)", marginTop: "0.4rem" }}>
                Expires in 10 minutes.
              </div>
              <div style={{ marginTop: "0.6rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem" }}>
                <div className="wa-bubble-btn" style={{ justifyContent: "center", color: "#38bdf8", fontWeight: 600 }}>
                  <Copy size={13} style={{ marginRight: "0.35rem" }} />
                  <span>Copy Code: 492108</span>
                </div>
              </div>
            </div>
          )}

          {/* FLOWS MOCKUP */}
          {type === "FLOWS" && (
            <div className="wa-message-bubble">
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.35rem" }}>
                📋 Appointment Booking
              </div>
              <div style={{ fontSize: "0.84rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                Please tap below to select your service, choose an available date, and confirm your reservation.
              </div>
              <div style={{ marginTop: "0.6rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem" }}>
                <div className="wa-bubble-btn" style={{ justifyContent: "center", color: "#38bdf8", fontWeight: 600 }}>
                  <Workflow size={13} style={{ marginRight: "0.35rem" }} />
                  <span>Book Appointment</span>
                </div>
              </div>
            </div>
          )}

          {/* COMMERCE MOCKUP */}
          {type === "COMMERCE" && (
            <div className="wa-message-bubble">
              <div style={{ fontSize: "0.78rem", fontWeight: 700, color: "var(--text-primary)", marginBottom: "0.35rem" }}>
                🛍️ Featured Product Catalog
              </div>
              <div style={{ fontSize: "0.84rem", color: "var(--text-primary)", lineHeight: 1.5 }}>
                Browse our seasonal inventory directly in WhatsApp. Tap below to view product details and add items to your cart.
              </div>
              <div style={{ marginTop: "0.6rem", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem" }}>
                <div className="wa-bubble-btn" style={{ justifyContent: "center", color: "#38bdf8", fontWeight: 600 }}>
                  <ShoppingBag size={13} style={{ marginRight: "0.35rem" }} />
                  <span>View Items</span>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
