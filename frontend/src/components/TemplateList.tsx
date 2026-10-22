import React, { useState } from "react";
import {
  Search,
  Filter,
  Eye,
  CheckCircle2,
  Clock,
  AlertCircle,
  FileText,
  RefreshCw,
  Sparkles,
  Info,
  Plus,
} from "lucide-react";
import { WhatsAppTemplate, TemplateSyncSummary } from "../types/template.js";
import { isAllowedTestTemplate, getFriendlyTemplateName } from "../constants/templateAllowlist.js";

interface TemplateListProps {
  templates: WhatsAppTemplate[];
  onSelectTemplate: (template: WhatsAppTemplate) => void;
  summary?: TemplateSyncSummary | null;
  onSync?: () => Promise<void>;
  isSyncing?: boolean;
  isLoading?: boolean;
  loadError?: string | null;
  onRetry?: () => void;
  canCreateTemplate?: boolean;
  onCreateNew?: () => void;
  onDuplicate?: (template: WhatsAppTemplate) => void;
}

export const TemplateList: React.FC<TemplateListProps> = ({
  templates,
  onSelectTemplate,
  summary,
  onSync,
  isSyncing = false,
  isLoading = false,
  loadError = null,
  onRetry,
  canCreateTemplate = false,
  onCreateNew,
}) => {
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategory, setSelectedCategory] = useState<string>("ALL");
  const [selectedStatus, setSelectedStatus] = useState<string>("ALL");

  const allowlistedTemplates = templates.filter((tpl) => isAllowedTestTemplate(tpl.name));

  const filtered = allowlistedTemplates.filter((tpl) => {
    const matchesSearch =
      tpl.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      tpl.body.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesCategory = selectedCategory === "ALL" || tpl.category === selectedCategory;
    const matchesStatus =
      selectedStatus === "ALL" ||
      (selectedStatus === "SENDABLE"
        ? tpl.status === "APPROVED" && tpl.isSendable !== false
        : tpl.status === selectedStatus);
    return matchesSearch && matchesCategory && matchesStatus;
  });

  const getStatusBadge = (tpl: WhatsAppTemplate) => {
    switch (tpl.status) {
      case "APPROVED":
        return (
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="status-pill status-approved">
              <CheckCircle2 size={12} />
              <span>Approved</span>
            </span>
            {tpl.isSendable ? (
              <span
                className="status-sub-pill"
                style={{
                  background: "rgba(16, 185, 129, 0.15)",
                  color: "var(--accent-emerald)",
                  fontWeight: 600,
                  fontSize: "0.68rem",
                  padding: "0.15rem 0.45rem",
                  borderRadius: "var(--radius-full)",
                }}
              >
                Sendable
              </span>
            ) : (
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
            )}
          </div>
        );
      case "PENDING":
        return (
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="status-pill status-pending">
              <Clock size={12} />
              <span>In Review</span>
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
        );
      case "DRAFT":
        return (
          <span className="status-pill status-draft">
            <FileText size={12} />
            <span>Draft</span>
          </span>
        );
      case "REJECTED":
      default:
        return (
          <div style={{ display: "flex", gap: "0.35rem", alignItems: "center", flexWrap: "wrap" }}>
            <span className="status-pill status-rejected">
              <AlertCircle size={12} />
              <span>{tpl.status || "Rejected"}</span>
            </span>
            <span
              className="status-sub-pill"
              style={{
                background: "rgba(244, 63, 94, 0.15)",
                color: "var(--accent-rose)",
                fontWeight: 600,
                fontSize: "0.68rem",
                padding: "0.15rem 0.45rem",
                borderRadius: "var(--radius-full)",
              }}
            >
              Unavailable
            </span>
          </div>
        );
    }
  };

  return (
    <div className="template-list-container">
      {/* Top Action Bar */}
      <div className="list-top-bar">
        <div>
          <h2 className="list-title">WhatsApp Message Templates</h2>
          <p className="list-subtitle">
            Synchronized and verified message templates from your connected Meta WhatsApp Business Account.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.75rem", alignItems: "center", flexWrap: "wrap" }}>
          {onSync && (
            <button
              type="button"
              className={canCreateTemplate && onCreateNew ? "btn-secondary" : "btn-primary"}
              onClick={onSync}
              disabled={isSyncing || isLoading}
              id="sync-meta-templates-btn"
              title="Synchronize templates from Meta Cloud API"
            >
              <RefreshCw size={15} className={isSyncing ? "spinning" : ""} />
              <span>{isSyncing ? "Syncing..." : "Sync with Meta"}</span>
            </button>
          )}

          {canCreateTemplate && onCreateNew ? (
            <button
              type="button"
              className="btn-primary"
              onClick={onCreateNew}
              id="create-new-template-btn"
              title="Create New WhatsApp Template Draft"
            >
              <Plus size={15} />
              <span>Create New Template</span>
            </button>
          ) : (
            <div
              className="meta-badge-note"
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                fontSize: "0.78rem",
                color: "var(--text-secondary)",
                background: "rgba(255, 255, 255, 0.04)",
                padding: "0.45rem 0.75rem",
                borderRadius: "var(--radius-sm)",
                border: "1px solid var(--border-subtle)",
              }}
            >
              <Info size={13} color="var(--accent-indigo-light)" />
              <span>Managed in Meta Business Manager</span>
            </div>
          )}
        </div>
      </div>

      {/* Meta Connection & Sync Status Banner */}
      {summary && (
        <div
          className="sync-status-bar glass-panel"
          style={{
            marginBottom: "1.25rem",
            padding: "0.75rem 1rem",
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            flexWrap: "wrap",
            gap: "0.5rem",
            border: "1px solid var(--border-subtle)",
            borderRadius: "var(--radius-md)",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <Sparkles size={16} color="var(--accent-emerald)" />
            <span>
              <strong>Verified WhatsApp Templates:</strong> {allowlistedTemplates.length} campaign template{allowlistedTemplates.length === 1 ? "" : "s"} ready for broadcast.
            </span>
          </div>
          <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
            Last synchronized: {new Date(summary.syncedAt).toLocaleTimeString()}
          </span>
        </div>
      )}

      {/* Error Banner */}
      {loadError && (
        <div
          className="wizard-error-banner"
          style={{ marginBottom: "1.25rem", display: "flex", justifyContent: "space-between", alignItems: "center" }}
          role="alert"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            <AlertCircle size={16} />
            <span>{loadError}</span>
          </div>
          {onRetry && (
            <button
              type="button"
              className="btn-secondary"
              onClick={onRetry}
              style={{ fontSize: "0.78rem", padding: "0.25rem 0.6rem" }}
            >
              Retry
            </button>
          )}
        </div>
      )}

      {/* Filter and Search Bar */}
      <div className="filter-controls-bar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search templates by name or content..."
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            aria-label="Search templates"
          />
        </div>

        <div className="filter-dropdowns-wrap">
          <div className="select-wrap">
            <Filter size={14} className="filter-icon" />
            <select
              className="filter-select"
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              aria-label="Filter by category"
            >
              <option value="ALL">All Categories</option>
              <option value="MARKETING">Marketing</option>
              <option value="UTILITY">Utility</option>
              <option value="AUTHENTICATION">Authentication</option>
            </select>
          </div>

          <div className="select-wrap">
            <select
              className="filter-select"
              value={selectedStatus}
              onChange={(e) => setSelectedStatus(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="ALL">All Statuses</option>
              <option value="SENDABLE">Approved & Sendable</option>
              <option value="APPROVED">Approved on Meta</option>
              <option value="PENDING">In Review</option>
              <option value="REJECTED">Rejected</option>
            </select>
          </div>
        </div>
      </div>

      {/* Templates Grid / Cards / Empty States */}
      {isLoading ? (
        <div style={{ textAlign: "center", padding: "4rem 1.5rem", color: "var(--text-secondary)" }}>
          <RefreshCw size={28} className="spinning" style={{ margin: "0 auto 1rem auto", color: "var(--accent-emerald)" }} />
          <h4>Loading WhatsApp Templates...</h4>
          <p style={{ fontSize: "0.85rem", color: "var(--text-muted)", marginTop: "0.25rem" }}>
            Synchronizing authorized templates from Meta Cloud API
          </p>
        </div>
      ) : templates.length === 0 ? (
        <div className="empty-templates-card" style={{ padding: "3.5rem 1.5rem", textAlign: "center" }}>
          <FileText size={44} color="var(--text-muted)" style={{ margin: "0 auto 1rem auto" }} />
          <h3>No approved WhatsApp templates available</h3>
          <p style={{ maxWidth: "520px", margin: "0 auto 1.5rem auto", color: "var(--text-secondary)", lineHeight: 1.5 }}>
            No approved templates were found on your connected Meta WhatsApp Business Account. Templates must be submitted and approved in Meta Business Manager before they can be synchronized for campaigns in Grovastra.
          </p>
          {onSync && (
            <button type="button" className="btn-primary" onClick={onSync} disabled={isSyncing}>
              <RefreshCw size={15} className={isSyncing ? "spinning" : ""} />
              <span>{isSyncing ? "Syncing..." : "Sync with Meta"}</span>
            </button>
          )}
        </div>
      ) : filtered.length === 0 ? (
        <div className="empty-templates-card">
          <FileText size={40} color="var(--text-muted)" />
          <h3>No templates matched your filters</h3>
          <p>Try searching for a different keyword or resetting your filters.</p>
          <button
            type="button"
            className="btn-secondary"
            onClick={() => {
              setSearchTerm("");
              setSelectedCategory("ALL");
              setSelectedStatus("ALL");
            }}
          >
            Clear Filters
          </button>
        </div>
      ) : (
        <div className="templates-grid">
          {filtered.map((template) => {
            const isNonSendable = template.status !== "APPROVED" || template.isSendable === false;

            return (
              <div
                key={template.id}
                className={`template-card ${isNonSendable ? "template-card-non-sendable" : ""}`}
                style={isNonSendable ? { opacity: 0.88, borderColor: "rgba(255, 255, 255, 0.08)" } : undefined}
                onClick={() => onSelectTemplate(template)}
                tabIndex={0}
                role="button"
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    onSelectTemplate(template);
                  }
                }}
              >
                <div className="template-card-header">
                  <div>
                    <div
                      className="template-name-row"
                      style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}
                    >
                      <span className="template-name">{getFriendlyTemplateName(template.name)}</span>
                      <span className="lang-tag">{template.language}</span>
                    </div>
                    <div style={{ display: "flex", gap: "0.5rem", alignItems: "center", marginTop: "0.25rem" }}>
                      <code style={{ fontSize: "0.72rem", color: "var(--text-muted)", background: "rgba(255, 255, 255, 0.04)", padding: "0.1rem 0.35rem", borderRadius: "4px" }}>
                        {template.name}
                      </code>
                      <span className="category-tag">{template.category}</span>
                    </div>
                  </div>
                  {getStatusBadge(template)}
                </div>

                {/* Message Snippet */}
                <div className="template-card-body">
                  <p className="template-snippet">{template.body}</p>
                </div>

                {/* Card Meta & Buttons */}
                <div className="template-card-footer">
                  <span className="template-date">
                    {template.lastUpdated
                      ? `Updated ${new Date(template.lastUpdated).toLocaleDateString()}`
                      : "Active on Meta WABA"}
                  </span>

                  <div className="card-actions" onClick={(e) => e.stopPropagation()}>
                    <button
                      type="button"
                      className="btn-card-action btn-action-edit"
                      onClick={() => onSelectTemplate(template)}
                      title="Inspect Template & Live Phone Preview"
                      aria-label={`View ${template.name}`}
                    >
                      <Eye size={14} />
                      <span>View & Preview</span>
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
