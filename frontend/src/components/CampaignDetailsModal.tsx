import React, { useEffect, useState, useCallback } from "react";
import {
  X,
  Send,
  Copy,
  Edit3,
  CheckCircle2,
  Clock,
  Radio,
  FileEdit,
  AlertCircle,
  RefreshCw,
  Loader2,
  XCircle,
} from "lucide-react";
import { Campaign, CampaignStatus, CampaignMessageItem } from "../types/campaign.js";
import { WhatsAppPhonePreview } from "./WhatsAppPhonePreview.js";
import { WhatsAppTemplate } from "../types/template.js";
import { apiClient } from "../services/api.js";
import { getCustomerCampaignStatus } from "../utils/campaignStatus.js";
import { formatInBusinessTimezone } from "../utils/timezone.js";
import { useAutoPolling } from "../utils/useAutoPolling.js";

export const getCustomerFriendlyStatus = (status: string): string => {
  switch (status) {
    case "ACCEPTED":
      return "Accepted by WhatsApp";
    case "SENT":
      return "Sent";
    case "DELIVERED":
      return "Delivered";
    case "READ":
      return "Read";
    case "FAILED":
      return "Failed";
    case "SUBMITTED_UNCONFIRMED":
      return "Delivery confirmation pending";
    case "QUEUED":
      return "Queued";
    default:
      return status;
  }
};

export const getMessageStatusDescription = (status: string): string => {
  switch (status) {
    case "ACCEPTED":
      return "WhatsApp accepted the message request; delivery confirmation pending.";
    case "SENT":
      return "WhatsApp reports that the message was sent.";
    case "DELIVERED":
      return "Delivery confirmed on recipient device.";
    case "READ":
      return "Read receipt confirmed by recipient.";
    case "FAILED":
      return "Message delivery failed.";
    case "SUBMITTED_UNCONFIRMED":
      return "Delivery confirmation pending webhook verification.";
    default:
      return status;
  }
};

interface CampaignDetailsModalProps {
  isOpen: boolean;
  campaign: Campaign | null;
  onClose: () => void;
  onEdit?: (campaign: Campaign) => void;
  onDuplicate?: (campaign: Campaign) => void;
  onLaunch?: (campaign: Campaign) => void;
  onRetryQueue?: (campaign: Campaign) => void;
  onCampaignUpdated?: (updatedCampaign: Campaign) => void;
}

export const CampaignDetailsModal: React.FC<CampaignDetailsModalProps> = ({
  isOpen,
  campaign,
  onClose,
  onEdit,
  onDuplicate,
  onLaunch,
  onRetryQueue,
  onCampaignUpdated,
}) => {
  const [currentCampaign, setCurrentCampaign] = useState<Campaign | null>(campaign);
  const [messages, setMessages] = useState<CampaignMessageItem[]>([]);
  const [isLoadingMessages, setIsLoadingMessages] = useState<boolean>(false);
  const [messagesError, setMessagesError] = useState<string | null>(null);
  const [liveTemplate, setLiveTemplate] = useState<WhatsAppTemplate | null>(null);

  // Synchronize internal campaign state whenever the prop changes
  useEffect(() => {
    setCurrentCampaign(campaign);
  }, [campaign]);

  const activeCampaign = currentCampaign || campaign;

  const fetchCampaignAndMessages = useCallback(
    async (campId: string, isBackground: boolean = false) => {
      if (!isBackground) {
        setIsLoadingMessages(true);
        setMessagesError(null);
      }
      try {
        const [campRes, msgRes] = await Promise.allSettled([
          apiClient.getCampaign(campId),
          apiClient.getCampaignMessages(campId),
        ]);

        if (campRes.status === "fulfilled" && campRes.value.success && campRes.value.data) {
          setCurrentCampaign(campRes.value.data);
          onCampaignUpdated?.(campRes.value.data);
        }

        if (msgRes.status === "fulfilled" && msgRes.value.success && msgRes.value.data) {
          setMessages(msgRes.value.data.items);
          setMessagesError(null);
        } else if (msgRes.status === "rejected" && !isBackground) {
          const err = msgRes.reason;
          setMessagesError(err instanceof Error ? err.message : "Failed to load message statuses");
        }
      } catch (err: unknown) {
        if (!isBackground) {
          setMessagesError(err instanceof Error ? err.message : "Failed to load message statuses");
        }
      } finally {
        if (!isBackground) {
          setIsLoadingMessages(false);
        }
      }
    },
    [onCampaignUpdated]
  );

  // Background auto-polling: 5-second interval while modal is open, pausing on hidden tab
  useAutoPolling({
    intervalMs: 5000,
    enabled: isOpen && !!activeCampaign && activeCampaign.status !== "DRAFT",
    onPoll: async () => {
      if (activeCampaign?.id) {
        await fetchCampaignAndMessages(activeCampaign.id, true);
      }
    },
    pollOnResume: true,
  });

  useEffect(() => {
    let isMounted = true;
    if (isOpen && campaign) {
      if (campaign.status !== "DRAFT") {
        fetchCampaignAndMessages(campaign.id, false);
      } else {
        setMessages([]);
        setMessagesError(null);
      }

      // Fetch live template definition for accurate phone preview
      Promise.resolve(apiClient.listTemplates ? apiClient.listTemplates() : null)
        .then((res: any) => {
          if (isMounted && res.data?.templates) {
            const found = res.data.templates.find(
              (t: any) => t.id === campaign.templateId || t.name === campaign.templateName
            );
            if (found) {
              setLiveTemplate({
                id: found.id,
                name: found.name,
                language: found.language,
                category: found.category,
                status: found.status,
                isSendable: found.isSendable,
                lastUpdated: found.lastUpdated,
                header: {
                  type: found.header?.format || found.header?.type || "NONE",
                  text: found.header?.text,
                },
                body: found.body,
                variables: (found.variables || []).map((v: any) => ({
                  key: v.key,
                  fallbackValue: v.fallbackValue,
                  sampleValue: String(campaign.variablesMapping?.[v.key] ?? v.sampleValue ?? v.label ?? ""),
                })),
                buttons: found.buttons || [],
              });
            }
          }
        })
        .catch(() => {
          // Keep synthesized template fallback
        });
    } else {
      setMessages([]);
      setMessagesError(null);
      setLiveTemplate(null);
    }

    return () => {
      isMounted = false;
    };
  }, [isOpen, campaign, fetchCampaignAndMessages]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen) {
        onClose();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, onClose]);

  if (!isOpen || !activeCampaign) return null;

  // Synthesize preview template from live Meta template or campaign snapshot
  const previewTemplate: WhatsAppTemplate = liveTemplate || {
    id: activeCampaign.templateId,
    name: activeCampaign.templateName,
    language: activeCampaign.templateLanguage,
    category: (activeCampaign.templateCategory as any) || "MARKETING",
    status: "APPROVED",
    isSendable: true,
    lastUpdated: activeCampaign.updatedAt,
    header: { type: "NONE" },
    body: `Template: *${activeCampaign.templateName}*\n\n` +
      (Object.keys(activeCampaign.variablesMapping || {}).length > 0
        ? Object.entries(activeCampaign.variablesMapping)
            .map(([k, v]) => `• {{${k}}}: ${v}`)
            .join("\n")
        : "Static template message dispatched to verified recipients."),
    variables: Object.entries(activeCampaign.variablesMapping || {}).map(([k, v]) => ({
      key: k,
      fallbackValue: String(v),
      sampleValue: String(v),
    })),
    buttons: [],
  };

  const getStatusBadge = (statusOrCampaign: CampaignStatus | Campaign) => {
    const item: Campaign =
      typeof statusOrCampaign === "string"
        ? ({ status: statusOrCampaign } as Campaign)
        : statusOrCampaign;
    const statusMeta = getCustomerCampaignStatus(item);

    return (
      <span
        className={`status-pill ${
          item.status === "COMPLETED"
            ? statusMeta.label === "Completed with issues"
              ? "status-pending"
              : statusMeta.label === "Delivery confirmation pending"
              ? "status-pending"
              : statusMeta.label === "Failed"
              ? "status-rejected"
              : "status-approved"
            : item.status === "FAILED" || statusMeta.label === "Failed"
            ? "status-rejected"
            : item.status === "SENDING"
            ? "status-active"
            : item.status === "QUEUED"
            ? "status-queued"
            : item.status === "SCHEDULED"
            ? statusMeta.isOverdue
              ? "status-overdue"
              : "status-pending"
            : item.status === "CANCELLED"
            ? "status-cancelled"
            : "status-draft"
        }`}
        style={
          statusMeta.label === "Completed with issues"
            ? {
                background: "rgba(249, 115, 22, 0.15)",
                color: "#fb923c",
                border: "1px solid rgba(249, 115, 22, 0.35)",
              }
            : statusMeta.label === "Delivery confirmation pending"
            ? {
                background: "rgba(245, 158, 11, 0.15)",
                color: "#fbbf24",
                border: "1px solid rgba(245, 158, 11, 0.35)",
              }
            : statusMeta.isOverdue
            ? {
                background: "rgba(245, 158, 11, 0.15)",
                color: "#fbbf24",
                border: "1px solid rgba(245, 158, 11, 0.35)",
              }
            : item.status === "CANCELLED"
            ? {
                background: "rgba(113, 113, 122, 0.15)",
                color: "#a1a1aa",
                border: "1px solid rgba(113, 113, 122, 0.35)",
              }
            : undefined
        }
      >
        {(item.status === "COMPLETED" || item.status === "FAILED") && (
          statusMeta.label === "Completed with issues" ? (
            <AlertCircle size={12} />
          ) : statusMeta.label === "Delivery confirmation pending" ? (
            <Clock size={12} />
          ) : statusMeta.label === "Failed" ? (
            <AlertCircle size={12} />
          ) : (
            <CheckCircle2 size={12} />
          )
        )}
        {item.status === "SENDING" && <Radio size={12} className="pulsing" />}
        {item.status === "QUEUED" && <Clock size={12} />}
        {item.status === "SCHEDULED" && <Clock size={12} />}
        {item.status === "DRAFT" && <FileEdit size={12} />}
        {item.status === "CANCELLED" && <XCircle size={12} />}
        <span>{statusMeta.label}</span>
      </span>
    );
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal-card campaign-details-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="details-dialog-title"
      >
        <div className="modal-header">
          <div className="modal-icon-brand">
            <Send size={18} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="details-header-title-row">
              <h3 id="details-dialog-title" className="modal-title">
                {activeCampaign.name}
              </h3>
              {getStatusBadge(activeCampaign)}
            </div>
            <span className="modal-sub">
              Created {new Date(activeCampaign.createdAt).toLocaleDateString()}
            </span>
          </div>
          <button
            type="button"
            className="btn-icon-close"
            onClick={onClose}
            aria-label="Close details"
          >
            <X size={18} />
          </button>
        </div>

        <div className="modal-body details-grid">
          {/* Left Column: Metadata */}
          <div className="details-meta-col">
            {activeCampaign.description && (
              <div className="details-section">
                <span className="details-section-label">Description</span>
                <p className="details-desc-text">{activeCampaign.description}</p>
              </div>
            )}

            <div className="details-section">
              <span className="details-section-label">Template Details</span>
              <div className="details-kv-card">
                <div className="kv-row">
                  <span className="kv-k">Template Name</span>
                  <span className="kv-v template-link-text">{activeCampaign.templateName}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-k">Category</span>
                  <span className="kv-v">{activeCampaign.templateCategory}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-k">Language</span>
                  <span className="kv-v">{activeCampaign.templateLanguage}</span>
                </div>
              </div>
            </div>

            <div className="details-section">
              <span className="details-section-label">Target Audience</span>
              <div className="details-kv-card">
                <div className="kv-row">
                  <span className="kv-k">Audience Name</span>
                  <span className="kv-v">{activeCampaign.audienceName}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-k">Classification</span>
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
                    VERIFIED CONTACT LIST
                  </span>
                </div>
                <div className="kv-row">
                  <span className="kv-k">Target Recipients</span>
                  <span className="kv-v sent-count-num">
                    {activeCampaign.totalRecipients.toLocaleString()} contacts
                  </span>
                </div>
              </div>
            </div>

            <div className="details-section">
              <span className="details-section-label">Dispatch & Delivery Tracking</span>
              <div className="details-kv-card">
                <div className="kv-row">
                  <span className="kv-k">Campaign Status</span>
                  <span className="kv-v">{activeCampaign.status}</span>
                </div>
                <div className="kv-row">
                  <span className="kv-k">Total Recipients</span>
                  <span className="kv-v">{activeCampaign.totalRecipients.toLocaleString()}</span>
                </div>
                {activeCampaign.scheduledAt && (
                  <div className="kv-row">
                    <span className="kv-k">Scheduled Dispatch</span>
                    <span className="kv-v" style={{ color: "#a78bfa", fontWeight: 600 }}>
                      {formatInBusinessTimezone(activeCampaign.scheduledAt)}
                    </span>
                  </div>
                )}
                {activeCampaign.startedAt && (
                  <div className="kv-row">
                    <span className="kv-k">Dispatch Started</span>
                    <span className="kv-v">
                      {formatInBusinessTimezone(activeCampaign.startedAt)}
                    </span>
                  </div>
                )}
                {activeCampaign.completedAt && (
                  <div className="kv-row">
                    <span className="kv-k">Completed At</span>
                    <span className="kv-v">
                      {formatInBusinessTimezone(activeCampaign.completedAt)}
                    </span>
                  </div>
                )}
                {activeCampaign.sentCount !== undefined && (
                  <div className="kv-row">
                    <span className="kv-k">Dispatched / In Transit</span>
                    <span className="kv-v" style={{ color: "var(--accent-emerald-light)" }}>
                      {activeCampaign.sentCount.toLocaleString()}
                    </span>
                  </div>
                )}
                {activeCampaign.deliveredCount !== undefined && (
                  <div className="kv-row">
                    <span className="kv-k">Delivered (Device Confirmed)</span>
                    <span className="kv-v" style={{ color: "var(--accent-emerald-light)" }}>
                      {activeCampaign.deliveredCount.toLocaleString()}
                    </span>
                  </div>
                )}
                {activeCampaign.readCount !== undefined && (
                  <div className="kv-row">
                    <span className="kv-k">Read (Recipient Opened)</span>
                    <span className="kv-v" style={{ color: "#38bdf8" }}>
                      {activeCampaign.readCount.toLocaleString()}
                    </span>
                  </div>
                )}
                {activeCampaign.failedCount !== undefined && (
                  <div className="kv-row">
                    <span className="kv-k">Failed</span>
                    <span className="kv-v" style={{ color: "var(--accent-rose)" }}>
                      {activeCampaign.failedCount.toLocaleString()}
                    </span>
                  </div>
                )}
                <div style={{ fontSize: "0.75rem", color: "var(--text-muted)", marginTop: "0.5rem", lineHeight: 1.45, borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem" }}>
                  {activeCampaign.status === "SCHEDULED" &&
                    (getCustomerCampaignStatus(activeCampaign).isOverdue
                      ? "Scheduled time missed — waiting for dispatch. Once the dispatch worker is active, overdue work will be safely resumed."
                      : `Campaign is scheduled for automated dispatch at ${formatInBusinessTimezone(activeCampaign.scheduledAt)}. Recipients and consent will be revalidated prior to enqueueing.`)}
                  {activeCampaign.status === "QUEUED" && "Messages are registered in queue awaiting worker dispatch."}
                  {activeCampaign.status === "SENDING" && "Worker is actively claiming and transmitting messages to Meta Cloud API."}
                  {activeCampaign.status === "COMPLETED" && (
                    getCustomerCampaignStatus(activeCampaign).label === "Completed with issues"
                      ? "Dispatch processing finished with one or more delivery issues. Review recipient message details below."
                      : getCustomerCampaignStatus(activeCampaign).label === "Delivery confirmation pending"
                      ? "Messages dispatched to WhatsApp; awaiting delivery confirmation from recipient devices."
                      : "All intended recipient messages confirmed delivered."
                  )}
                  {activeCampaign.status === "FAILED" && "All message dispatch attempts resulted in failures."}
                  {activeCampaign.status === "CANCELLED" && "Campaign was cancelled before dispatch began."}
                  {activeCampaign.status === "DRAFT" && "Campaign is a draft and has not been queued for dispatch."}
                </div>
              </div>
            </div>

            {activeCampaign.status !== "DRAFT" && (
              <div className="details-section" data-testid="per-message-status-section">
                <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.5rem" }}>
                  <span className="details-section-label" style={{ margin: 0 }}>
                    Recipient Message Records ({messages.length})
                  </span>
                  <button
                    type="button"
                    onClick={() => fetchCampaignAndMessages(activeCampaign.id, false)}
                    disabled={isLoadingMessages}
                    style={{
                      background: "none",
                      border: "none",
                      color: "#10b981",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: "0.25rem",
                      fontSize: "0.75rem",
                    }}
                    title="Refresh message statuses"
                  >
                    <RefreshCw size={12} className={isLoadingMessages ? "pulsing" : undefined} />
                    <span>Refresh</span>
                  </button>
                </div>

                {/* Delivery Status Guide */}
                <div
                  style={{
                    background: "rgba(255, 255, 255, 0.03)",
                    border: "1px solid var(--border-subtle)",
                    borderRadius: "var(--radius-sm)",
                    padding: "0.6rem 0.75rem",
                    marginBottom: "0.6rem",
                    fontSize: "0.72rem",
                    lineHeight: 1.45,
                  }}
                >
                  <strong style={{ display: "block", marginBottom: "0.3rem", color: "var(--text-secondary)" }}>
                    WhatsApp Message Delivery Statuses:
                  </strong>
                  <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "0.35rem" }}>
                    <div>
                      <span className="status-pill status-active" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>Accepted by WhatsApp</span>{" "}
                      <span style={{ color: "var(--text-muted)" }}>Accepted by WhatsApp; delivery pending</span>
                    </div>
                    <div>
                      <span className="status-pill status-active" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>Sent</span>{" "}
                      <span style={{ color: "var(--text-muted)" }}>Dispatched by WhatsApp</span>
                    </div>
                    <div>
                      <span className="status-pill status-approved" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>Delivered</span>{" "}
                      <span style={{ color: "var(--text-muted)" }}>Confirmed delivered to recipient</span>
                    </div>
                    <div>
                      <span className="status-pill status-read" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>Read</span>{" "}
                      <span style={{ color: "var(--text-muted)" }}>Read receipt confirmed</span>
                    </div>
                    <div>
                      <span className="status-pill status-rejected" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>Failed</span>{" "}
                      <span style={{ color: "var(--text-muted)" }}>Delivery failed</span>
                    </div>
                    <div>
                      <span className="status-pill status-pending" style={{ fontSize: "0.65rem", padding: "0.1rem 0.35rem" }}>Delivery confirmation pending</span>{" "}
                      <span style={{ color: "var(--text-muted)" }}>Status pending webhook confirmation</span>
                    </div>
                  </div>
                </div>

                {isLoadingMessages && messages.length === 0 ? (
                  <div style={{ padding: "1rem", textAlign: "center", color: "var(--text-muted)", fontSize: "0.85rem" }}>
                    <Loader2 size={16} className="btn-spinner" style={{ display: "inline-block", marginRight: "0.5rem" }} />
                    Loading message statuses...
                  </div>
                ) : messagesError ? (
                  <div style={{ padding: "0.75rem", background: "rgba(244, 63, 94, 0.1)", color: "var(--accent-rose)", borderRadius: "var(--radius-sm)", fontSize: "0.8rem" }}>
                    {messagesError}
                  </div>
                ) : messages.length === 0 ? (
                  <div style={{ padding: "0.75rem", color: "var(--text-muted)", fontSize: "0.8rem", textAlign: "center" }}>
                    No message records registered yet.
                  </div>
                ) : (
                  <div
                    style={{
                      maxHeight: "220px",
                      overflowY: "auto",
                      border: "1px solid var(--border-subtle)",
                      borderRadius: "var(--radius-md)",
                      background: "rgba(0, 0, 0, 0.2)",
                    }}
                  >
                    {messages.map((m) => {

                      return (
                        <div
                          key={m.id}
                          style={{
                            display: "flex",
                            alignItems: "center",
                            justifyContent: "space-between",
                            padding: "0.6rem 0.85rem",
                            borderBottom: "1px solid var(--border-subtle)",
                            fontSize: "0.8rem",
                          }}
                        >
                          <div style={{ display: "flex", flexDirection: "column", gap: "0.15rem" }}>
                            <span style={{ fontWeight: 500, fontFamily: "monospace" }}>
                              {m.recipientPhoneMasked}
                            </span>
                            <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                              {m.deliveredAt
                                ? `Delivered: ${new Date(m.deliveredAt).toLocaleTimeString()}`
                                : m.sentAt
                                ? `Sent: ${new Date(m.sentAt).toLocaleTimeString()}`
                                : `Dispatched: ${new Date(m.createdAt).toLocaleTimeString()}`}
                            </span>
                            {m.errorMessage && (
                              <span style={{ fontSize: "0.7rem", color: "var(--accent-rose)" }}>
                                {m.errorMessage}
                              </span>
                            )}
                          </div>
                          <span
                            className={`status-pill ${
                              m.status === "READ"
                                ? "status-read"
                                : m.status === "DELIVERED"
                                ? "status-approved"
                                : m.status === "ACCEPTED" || m.status === "SENT"
                                ? "status-active"
                                : m.status === "FAILED"
                                ? "status-rejected"
                                : m.status === "SUBMITTED_UNCONFIRMED"
                                ? "status-pending"
                                : "status-queued"
                            }`}
                            style={{ fontSize: "0.7rem", padding: "0.2rem 0.5rem" }}
                            title={getMessageStatusDescription(m.status)}
                          >
                            {getCustomerFriendlyStatus(m.status)}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                )}
              </div>
            )}

            {activeCampaign?.variablesMapping && Object.keys(activeCampaign.variablesMapping).length > 0 && (
              <div className="details-section">
                <span className="details-section-label">Variable Mappings</span>
                <div className="details-vars-card">
                  {Object.entries(activeCampaign.variablesMapping).map(([key, val]) => (
                    <div key={key} className="var-mapping-pill">
                      <span className="var-key">&#123;&#123;{key}&#125;&#125;</span>
                      <span className="var-eq">→</span>
                      <span className="var-val">"{String(val)}"</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          {/* Right Column: Live WhatsApp Preview */}
          <div className="details-preview-col">
            <span className="details-section-label">Message Preview</span>
            <div className="details-phone-wrap">
              <WhatsAppPhonePreview template={previewTemplate} />
            </div>
          </div>
        </div>

        <div className="modal-footer">
          {onDuplicate && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onClose();
                onDuplicate(activeCampaign);
              }}
            >
              <Copy size={15} />
              <span>Duplicate</span>
            </button>
          )}

          {activeCampaign.status === "DRAFT" && onEdit && (
            <button
              type="button"
              className="btn-secondary"
              onClick={() => {
                onClose();
                onEdit(activeCampaign);
              }}
            >
              <Edit3 size={15} />
              <span>Edit Draft</span>
            </button>
          )}

          {activeCampaign.status === "DRAFT" && onLaunch && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onClose();
                onLaunch(activeCampaign);
              }}
              id="details-launch-btn"
            >
              <Send size={15} />
              <span>Review & Launch</span>
            </button>
          )}

          {(activeCampaign.status === "QUEUED" || activeCampaign.status === "SENDING") && onRetryQueue && (
            <button
              type="button"
              className="btn-primary"
              onClick={() => {
                onClose();
                onRetryQueue(activeCampaign);
              }}
              id="details-retry-queue-btn"
              style={{ background: "linear-gradient(135deg, #d97706, #b45309)" }}
            >
              <RefreshCw size={15} />
              <span>Retry Queue</span>
            </button>
          )}

          <button type="button" className="btn-secondary" onClick={onClose}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
