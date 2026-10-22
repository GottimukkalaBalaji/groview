import React, { useEffect, useRef } from "react";
import { Send, AlertTriangle, X, Loader2, Users, FileText, CheckCircle2, ShieldAlert, Clock, Calendar } from "lucide-react";
import { Campaign } from "../types/campaign.js";
import { getFriendlyTemplateName } from "../constants/templateAllowlist.js";
import { formatInBusinessTimezone, BUSINESS_TIMEZONE_LABEL } from "../utils/timezone.js";

export interface LaunchConfirmationModalProps {
  isOpen: boolean;
  campaign: Campaign | null;
  isLaunching: boolean;
  launchError?: string | null;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
  eligibleCount?: number | null;
  scheduledAt?: string | null;
}

export const LaunchConfirmationModal: React.FC<LaunchConfirmationModalProps> = ({
  isOpen,
  campaign,
  isLaunching,
  launchError,
  onConfirm,
  onCancel,
  eligibleCount,
  scheduledAt: propScheduledAt,
}) => {
  const scheduledAt = propScheduledAt || campaign?.scheduledAt;
  // Synchronous lock to prevent accidental double clicks before React state updates
  const inFlightLockRef = useRef<boolean>(false);

  useEffect(() => {
    if (!isLaunching) {
      inFlightLockRef.current = false;
    }
  }, [isLaunching]);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isOpen && !isLaunching) {
        onCancel();
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [isOpen, isLaunching, onCancel]);

  if (!isOpen || !campaign) return null;

  const handleConfirmClick = () => {
    if (isLaunching || inFlightLockRef.current) return;
    inFlightLockRef.current = true;
    onConfirm();
  };

  // Determine recipient display
  const recipientDisplay =
    eligibleCount !== undefined && eligibleCount !== null
      ? `${eligibleCount.toLocaleString()} verified opted-in contacts`
      : campaign.totalRecipients > 0
      ? `${campaign.totalRecipients.toLocaleString()} estimated contacts`
      : "Unavailable (calculated at launch)";

  return (
    <div
      className="modal-backdrop"
      onClick={!isLaunching ? onCancel : undefined}
      data-testid="launch-confirm-backdrop"
    >
      <div
        className="modal-card confirm-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="launch-dialog-title"
        aria-describedby="launch-dialog-desc"
        style={{ maxWidth: "520px" }}
      >
        {/* Modal Header */}
        <div className="modal-header">
          <div className="modal-icon-brand">
            {scheduledAt ? <Clock size={18} /> : <Send size={18} />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <h3 id="launch-dialog-title" className="modal-title">
              {scheduledAt ? "Confirm Scheduled Campaign" : "Confirm Campaign Launch"}
            </h3>
            <span className="modal-sub">
              {scheduledAt
                ? `Scheduled for automatic dispatch on ${formatInBusinessTimezone(scheduledAt)}`
                : "Queue WhatsApp message broadcast for dispatch"}
            </span>
          </div>
          <button
            type="button"
            className="btn-icon-close"
            onClick={onCancel}
            disabled={isLaunching}
            aria-label="Close launch confirmation"
          >
            <X size={18} />
          </button>
        </div>

        {/* Modal Body */}
        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <p id="launch-dialog-desc" className="modal-text" style={{ margin: 0 }}>
            {scheduledAt ? (
              <>
                You are about to schedule campaign <strong>"{campaign.name}"</strong> for automatic sending. Please review before confirming:
              </>
            ) : (
              <>
                You are about to launch campaign <strong>"{campaign.name}"</strong>. Please review the campaign parameters before queueing:
              </>
            )}
          </p>

          {/* Key Details Summary Box */}
          <div
            style={{
              background: "rgba(255, 255, 255, 0.03)",
              border: "1px solid var(--border-subtle)",
              borderRadius: "var(--radius-md)",
              padding: "0.85rem 1rem",
              display: "flex",
              flexDirection: "column",
              gap: "0.5rem",
              fontSize: "0.85rem",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <FileText size={14} /> Template
              </span>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                  {getFriendlyTemplateName(campaign.templateName)}
                </div>
                <div style={{ fontSize: "0.75rem", color: "var(--text-secondary)", fontFamily: "monospace" }}>
                  {campaign.templateName} ({campaign.templateLanguage || "en_US"})
                </div>
              </div>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <Users size={14} /> Target Audience
              </span>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {campaign.audienceName}
              </span>
            </div>

            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                <CheckCircle2 size={14} /> Eligible Recipients
              </span>
              <span
                style={{ fontWeight: 700, color: "var(--accent-emerald-light)" }}
                id="launch-modal-recipient-count"
              >
                {recipientDisplay}
              </span>
            </div>

            {scheduledAt && (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid var(--border-subtle)", paddingTop: "0.5rem", marginTop: "0.25rem" }}>
                <span style={{ color: "var(--text-muted)", display: "flex", alignItems: "center", gap: "0.35rem" }}>
                  <Calendar size={14} /> Scheduled Dispatch
                </span>
                <span
                  style={{ fontWeight: 700, color: "#a78bfa" }}
                  id="launch-modal-scheduled-time"
                >
                  {formatInBusinessTimezone(scheduledAt)} ({BUSINESS_TIMEZONE_LABEL})
                </span>
              </div>
            )}
          </div>

          {/* Mandatory Consequences Callout */}
          <div
            style={{
              background: scheduledAt ? "rgba(167, 139, 250, 0.08)" : "rgba(245, 158, 11, 0.08)",
              border: scheduledAt ? "1px solid rgba(167, 139, 250, 0.25)" : "1px solid rgba(245, 158, 11, 0.25)",
              borderRadius: "var(--radius-md)",
              padding: "0.75rem 1rem",
              fontSize: "0.8rem",
              color: "var(--text-secondary)",
              lineHeight: 1.45,
            }}
          >
            <strong style={{ color: scheduledAt ? "#c4b5fd" : "#fbbf24", display: "flex", alignItems: "center", gap: "0.35rem", marginBottom: "0.35rem" }}>
              <AlertTriangle size={14} /> What happens when you confirm:
            </strong>
            {scheduledAt ? (
              <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <li>The campaign will be durably saved with status <strong>SCHEDULED</strong>.</li>
                <li>At <strong>{formatInBusinessTimezone(scheduledAt)}</strong>, the automated scheduler will safely verify recipients and enqueue messages.</li>
                <li>Consent, suppression, and template approval will be rechecked prior to message transmission.</li>
                <li>You can cancel or edit this campaign anytime before dispatch starts.</li>
              </ul>
            ) : (
              <ul style={{ margin: 0, paddingLeft: "1.2rem", display: "flex", flexDirection: "column", gap: "0.25rem" }}>
                <li>Individual message records will be prepared in the campaign workspace with status <strong>QUEUED</strong>.</li>
                <li>Only contacts with verified <code>OPTED_IN</code> consent and no active suppression will receive messages.</li>
                <li>Broadcast jobs are registered into the delivery queue with deduplication protection.</li>
                <li>The campaign status will transition to <strong>QUEUED</strong> and cannot be reverted to draft.</li>
              </ul>
            )}
          </div>

          {/* Error Banner (e.g. parameter validation error, Redis down, etc.) */}
          {launchError && (
            <div
              className="wizard-error-banner"
              role="alert"
              style={{ margin: 0, fontSize: "0.82rem" }}
            >
              <ShieldAlert size={16} />
              <span>{launchError}</span>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <div className="modal-footer">
          <button
            type="button"
            className="btn-secondary"
            onClick={onCancel}
            disabled={isLaunching}
            id="cancel-launch-btn"
          >
            Cancel
          </button>
          <button
            type="button"
            className="btn-primary"
            onClick={handleConfirmClick}
            disabled={isLaunching}
            id="confirm-launch-btn"
            style={{ minWidth: "180px" }}
          >
            {isLaunching ? (
              <>
                <Loader2 size={15} className="spinning" />
                <span>{scheduledAt ? "Scheduling Campaign..." : "Queueing Messages..."}</span>
              </>
            ) : scheduledAt ? (
              <>
                <Clock size={15} />
                <span>Confirm & Schedule Campaign</span>
              </>
            ) : (
              <>
                <Send size={15} />
                <span>Confirm & Queue Dispatch</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
};
