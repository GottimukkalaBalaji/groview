import React from "react";
import { MessageSquare, AlertCircle, ShieldAlert, ShieldCheck, CheckCircle2, Settings } from "lucide-react";
import { WhatsAppStatusInfo } from "../types/dashboard.js";
import { SafeConnectionStatus } from "../types/whatsappIntegration.js";

interface WhatsAppStatusCardProps {
  status?: SafeConnectionStatus | WhatsAppStatusInfo | null;
  onConfigure?: () => void;
}

export const WhatsAppStatusCard: React.FC<WhatsAppStatusCardProps> = ({ status, onConfigure }) => {
  // Determine if we're dealing with SafeConnectionStatus (from backend) or legacy WhatsAppStatusInfo
  const isSafeStatus = status && "status" in status && typeof (status as any).status === "string";
  const isConnected = isSafeStatus
    ? (status as SafeConnectionStatus).connected
    : Boolean(status && (status as WhatsAppStatusInfo).isConnected);

  const safe = isSafeStatus ? (status as SafeConnectionStatus) : null;
  const isShared = safe?.mode === "SHARED_PLATFORM" || safe?.isSharedPlatform || safe?.source === "PLATFORM_SHARED";


  return (
    <div className="whatsapp-status-card">
      <div className="card-top-row">
        <div className="status-title-group">
          <div className="status-avatar-circle">
            <MessageSquare size={18} />
          </div>
          <div>
            <h4 className="card-heading-sm">WhatsApp Cloud API</h4>
            <span className="card-sub-label">
              {isShared
                ? "Grovastra Shared WhatsApp Platform"
                : "Official Meta Messaging Channel"}
            </span>
          </div>
        </div>

        {isConnected ? (
          <span className="integration-badge connected">
            <CheckCircle2 size={13} />
            <span>Connected & Active</span>
          </span>
        ) : (
          <span className="integration-badge setup-required">
            <AlertCircle size={13} />
            <span>Setup Required</span>
          </span>
        )}
      </div>

      <div className={`status-explanation-box ${isConnected ? "status-connected-box" : ""}`}>
        {isConnected ? (
          <ShieldCheck size={16} color="var(--accent-emerald)" className="alert-accent-icon" />
        ) : (
          <ShieldAlert size={16} className="alert-accent-icon" />
        )}
        <p className="status-explanation-text">
          {safe?.sharedNotice ||
            (isConnected
              ? "Connected via Grovastra's shared WhatsApp platform account. Outbound campaigns use Grovastra's verified business number."
              : (status as WhatsAppStatusInfo)?.message ||
                "WhatsApp messaging channel requires configuration before campaign dispatch.")}
        </p>
      </div>

      <div className="integration-details-list">
        <div className="detail-row">
          <span className="detail-label">Channel Status</span>
          <span className={`detail-val ${isConnected ? "text-success" : "text-warning"}`}>
            {isConnected ? "Connected & Ready" : "Not Connected"}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Account Mode</span>
          <span className="detail-val" style={{ color: "var(--accent-emerald-light)", fontWeight: 600 }}>
            {isShared ? "Shared Platform Account" : "Dedicated WhatsApp Business"}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Display Phone Number</span>
          <span className="detail-val text-muted">
            {safe?.displayPhoneNumber || (isConnected ? "+1 (555) 0199" : "Unregistered")}
          </span>
        </div>
        <div className="detail-row">
          <span className="detail-label">Sender Status</span>
          <span className="detail-val" style={{ color: "var(--accent-emerald)", fontWeight: 500 }}>
            {isConnected ? "Verified Business Sender" : "Unverified"}
          </span>
        </div>
      </div>

      <div className="card-bottom-bar">
        <span className="integration-phase-note">
          {isShared ? "Grovastra Platform Sender" : "Connected Business Sender"}
        </span>
        {onConfigure && (
          <button
            type="button"
            className="doc-link-pill"
            onClick={onConfigure}
            style={{ background: "none", border: "none", cursor: "pointer" }}
            title="View WhatsApp Integration in Settings"
          >
            <Settings size={13} />
            <span>Manage in Settings</span>
          </button>
        )}
      </div>
    </div>
  );
};
