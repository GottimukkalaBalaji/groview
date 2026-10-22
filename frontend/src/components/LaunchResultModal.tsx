import React from "react";
import {
  CheckCircle2,
  AlertTriangle,
  X,
  RefreshCw,
  Clock,
  ShieldCheck,
  UserX,
  PhoneOff,
  AlertCircle,
  HelpCircle,
  Loader2,
} from "lucide-react";
import {
  CampaignQueueRecoverySummary,
  LaunchCampaignSummary,
} from "../types/campaign.js";

export interface LaunchResultModalProps {
  isOpen: boolean;
  onClose: () => void;
  launchSummary?: LaunchCampaignSummary | null;
  recoverySummary?: CampaignQueueRecoverySummary | null;
  onRetryQueue?: () => void | Promise<void>;
  isRetryingQueue?: boolean;
}

export const LaunchResultModal: React.FC<LaunchResultModalProps> = ({
  isOpen,
  onClose,
  launchSummary,
  recoverySummary,
  onRetryQueue,
  isRetryingQueue = false,
}) => {
  if (!isOpen || (!launchSummary && !recoverySummary)) return null;

  const isRecoveryMode = Boolean(recoverySummary && !launchSummary);
  const title = isRecoveryMode ? "Queue Recovery Result" : "Campaign Launch Result";

  // Check for partial enqueue failure
  const hasEnqueueFailures =
    (launchSummary && launchSummary.enqueueFailureCount > 0) ||
    (recoverySummary && recoverySummary.enqueueFailureCount > 0);

  return (
    <div className="modal-backdrop" onClick={onClose} data-testid="launch-result-backdrop">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-result-title"
        style={{ maxWidth: "620px", maxHeight: "90vh", overflowY: "auto" }}
      >
        {/* Header */}
        <div className="modal-header">
          <div
            className={hasEnqueueFailures ? "modal-icon-danger" : "modal-icon-brand"}
            style={
              hasEnqueueFailures
                ? { background: "rgba(245, 158, 11, 0.15)", borderColor: "rgba(245, 158, 11, 0.3)" }
                : undefined
            }
          >
            {hasEnqueueFailures ? (
              <AlertTriangle size={18} color="#fbbf24" />
            ) : (
              <CheckCircle2 size={18} />
            )}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="launch-result-title" className="modal-title">
              {title}
            </h3>
            <span className="modal-sub">
              {launchSummary?.campaignName || recoverySummary?.campaignName || "Campaign Dispatch"}
            </span>
          </div>
          <button
            type="button"
            className="btn-icon-close"
            onClick={onClose}
            aria-label="Close result dialog"
          >
            <X size={18} />
          </button>
        </div>

        {/* Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          {/* Status Banner */}
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
              padding: "0.85rem 1rem",
              borderRadius: "var(--radius-md)",
              background: hasEnqueueFailures
                ? "rgba(245, 158, 11, 0.1)"
                : "rgba(16, 185, 129, 0.1)",
              border: `1px solid ${hasEnqueueFailures ? "rgba(245, 158, 11, 0.3)" : "rgba(16, 185, 129, 0.3)"}`,
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: "0.6rem" }}>
              <Clock size={16} color={hasEnqueueFailures ? "#fbbf24" : "var(--accent-emerald-light)"} />
              <span style={{ fontSize: "0.88rem", fontWeight: 600, color: "var(--text-primary)" }}>
                Current Campaign Status:
              </span>
            </div>
            <span
              className="status-pill status-queued"
              style={{
                background: "rgba(245, 158, 11, 0.15)",
                color: "#fbbf24",
                border: "1px solid rgba(245, 158, 11, 0.3)",
                fontSize: "0.78rem",
              }}
              id="result-campaign-status"
            >
              {launchSummary?.status || recoverySummary?.status || "QUEUED"}
            </span>
          </div>

          {/* Alert Message */}
          {hasEnqueueFailures ? (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-md)",
                background: "rgba(245, 158, 11, 0.08)",
                border: "1px solid rgba(245, 158, 11, 0.25)",
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
              role="alert"
            >
              <AlertTriangle size={18} color="#fbbf24" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ color: "#fbbf24", display: "block", marginBottom: "0.2rem" }}>
                  Partial Queue Failure Detected
                </strong>
                <span>
                  All message records were safely registered in the campaign workspace with status <code>QUEUED</code>. However, some messages could not be dispatched to the delivery queue. Click <strong>Retry Queue</strong> below to retry queueing the remaining messages safely.
                </span>
              </div>
            </div>
          ) : (
            <div
              style={{
                display: "flex",
                alignItems: "flex-start",
                gap: "0.75rem",
                padding: "0.85rem 1rem",
                borderRadius: "var(--radius-md)",
                background: "rgba(16, 185, 129, 0.08)",
                border: "1px solid rgba(16, 185, 129, 0.25)",
                fontSize: "0.82rem",
                color: "var(--text-secondary)",
                lineHeight: 1.45,
              }}
            >
              <ShieldCheck size={18} color="var(--accent-emerald)" style={{ flexShrink: 0, marginTop: "2px" }} />
              <div>
                <strong style={{ color: "var(--accent-emerald-light)", display: "block", marginBottom: "0.2rem" }}>
                  {isRecoveryMode ? "Queue Recovery Completed" : "Preparation and Queueing Successful"}
                </strong>
                <span>
                  All eligible messages have been safely registered into the dispatch queue. <em>Note: Messages are currently queued for dispatch; delivery confirmation occurs asynchronously as messages are delivered.</em>
                </span>
              </div>
            </div>
          )}

          {/* Counts Grid (Launch Summary) */}
          {launchSummary && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Queue Dispatch Metrics
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "0.6rem",
                }}
              >
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Total Audience</span>
                  <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>{launchSummary.totalAudienceCount.toLocaleString()}</span>
                </div>
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Eligible Contacts</span>
                  <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--accent-emerald-light)" }}>{launchSummary.eligibleCount.toLocaleString()}</span>
                </div>
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Messages Queued</span>
                  <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>{launchSummary.queuedCount.toLocaleString()}</span>
                </div>
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Enqueued for Dispatch</span>
                  <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--accent-emerald-light)" }}>{launchSummary.enqueueSuccessCount.toLocaleString()}</span>
                </div>
                {launchSummary.alreadyPreparedCount > 0 && (
                  <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Already Prepared</span>
                    <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>{launchSummary.alreadyPreparedCount.toLocaleString()}</span>
                  </div>
                )}
                {launchSummary.enqueueFailureCount > 0 && (
                  <div style={{ background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.3)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "#fb7185", display: "block" }}>Enqueue Failed</span>
                    <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "#fb7185" }}>{launchSummary.enqueueFailureCount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Counts Grid (Recovery Summary) */}
          {recoverySummary && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Queue Recovery Audit
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "0.6rem",
                }}
              >
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Eligible QUEUED</span>
                  <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>{recoverySummary.eligibleQueuedCount.toLocaleString()}</span>
                </div>
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Newly Enqueued</span>
                  <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--accent-emerald-light)" }}>{recoverySummary.enqueuedSuccessCount.toLocaleString()}</span>
                </div>
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>Already in Queue</span>
                  <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>{recoverySummary.alreadyEnqueuedCount.toLocaleString()}</span>
                </div>
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                  <span style={{ fontSize: "0.72rem", color: "var(--text-muted)", display: "block" }}>In-Flight / Terminal</span>
                  <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "var(--text-primary)" }}>{(recoverySummary.inFlightCount + recoverySummary.terminalCount).toLocaleString()}</span>
                </div>
                {recoverySummary.enqueueFailureCount > 0 && (
                  <div style={{ background: "rgba(244, 63, 94, 0.08)", border: "1px solid rgba(244, 63, 94, 0.3)", borderRadius: "var(--radius-md)", padding: "0.65rem 0.85rem" }}>
                    <span style={{ fontSize: "0.72rem", color: "#fb7185", display: "block" }}>Enqueue Failed</span>
                    <span style={{ fontSize: "1.15rem", fontWeight: 700, color: "#fb7185" }}>{recoverySummary.enqueueFailureCount.toLocaleString()}</span>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Exclusions Breakdown (if any) */}
          {launchSummary && (
            <div style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
              <span style={{ fontSize: "0.75rem", fontWeight: 600, color: "var(--text-muted)", textTransform: "uppercase" }}>
                Excluded Contacts (Not Send-Eligible)
              </span>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "repeat(auto-fit, minmax(130px, 1fr))",
                  gap: "0.6rem",
                }}
              >
                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.6rem 0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <UserX size={15} color="var(--text-muted)" />
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>Consent Required</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>{launchSummary.excludedCount.consentRequired}</span>
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.6rem 0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <AlertCircle size={15} color="var(--text-muted)" />
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>Suppressed</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>{launchSummary.excludedCount.suppressed}</span>
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.6rem 0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <PhoneOff size={15} color="var(--text-muted)" />
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>Invalid Phone</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>{launchSummary.excludedCount.invalidPhone}</span>
                  </div>
                </div>

                <div style={{ background: "rgba(255, 255, 255, 0.02)", border: "1px solid var(--border-subtle)", borderRadius: "var(--radius-md)", padding: "0.6rem 0.85rem", display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <HelpCircle size={15} color="var(--text-muted)" />
                  <div>
                    <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", display: "block" }}>Missing Variables</span>
                    <span style={{ fontSize: "0.95rem", fontWeight: 600, color: "var(--text-primary)" }}>{launchSummary.excludedCount.missingVariables}</span>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Educational Disclaimer */}
          <div
            style={{
              padding: "0.75rem 1rem",
              background: "rgba(255, 255, 255, 0.02)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              fontSize: "0.76rem",
              color: "var(--text-muted)",
              lineHeight: 1.4,
            }}
          >
            <strong>Dispatch vs Delivery Distinction:</strong> The counts above reflect messages queued for dispatch. A status of <code>COMPLETED</code> indicates dispatch processing finished, while confirmed delivery updates as recipients receive the message.
          </div>
        </div>

        {/* Footer */}
        <div className="modal-footer">
          {hasEnqueueFailures && onRetryQueue && (
            <button
              type="button"
              className="btn-primary"
              onClick={onRetryQueue}
              disabled={isRetryingQueue}
              id="result-retry-queue-btn"
              style={{ background: "linear-gradient(135deg, #d97706, #b45309)" }}
            >
              {isRetryingQueue ? (
                <>
                  <Loader2 size={15} className="spinning" />
                  <span>Retrying Queue...</span>
                </>
              ) : (
                <>
                  <RefreshCw size={15} />
                  <span>Retry Queue ({launchSummary?.enqueueFailureCount || recoverySummary?.enqueueFailureCount})</span>
                </>
              )}
            </button>
          )}

          <button
            type="button"
            className="btn-secondary"
            onClick={onClose}
            id="result-close-btn"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
};
