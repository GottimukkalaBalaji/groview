import React, { useState, useEffect, useCallback } from "react";
import {
  MessageSquare,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  Unlink,
  Lock,
  Eye,
  EyeOff,
  Copy,
  Check,
  Building,
  Phone,
  Shield,
  ShieldCheck,
  ExternalLink,
  Loader2,
  KeyRound,
  FileText,
  Server,
  Info,
} from "lucide-react";
import { apiClient, ApiClientError } from "../services/api.js";
import { useAuth } from "../context/AuthContext.js";
import {
  SafeConnectionStatus,
  MetaConnectionStatus,
} from "../types/whatsappIntegration.js";

interface ToastNotification {
  type: "success" | "error" | "info";
  message: string;
}

export const SettingsPage: React.FC = () => {
  const { organization } = useAuth();

  // Status state
  const [status, setStatus] = useState<SafeConnectionStatus | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);
  const [statusError, setStatusError] = useState<string | null>(null);

  // Connect form state
  const [wabaId, setWabaId] = useState<string>("");
  const [phoneNumberId, setPhoneNumberId] = useState<string>("");
  const [accessToken, setAccessToken] = useState<string>("");
  const [showToken, setShowToken] = useState<boolean>(false);
  const [isSubmittingConnect, setIsSubmittingConnect] = useState<boolean>(false);
  const [connectError, setConnectError] = useState<string | null>(null);
  const [showConnectForm, setShowConnectForm] = useState<boolean>(false);

  // Refresh & Disconnect action states
  const [isRefreshing, setIsRefreshing] = useState<boolean>(false);
  const [isDisconnectModalOpen, setIsDisconnectModalOpen] = useState<boolean>(false);
  const [isDisconnecting, setIsDisconnecting] = useState<boolean>(false);

  // Feedback & Copy states
  const [toast, setToast] = useState<ToastNotification | null>(null);
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const showToast = useCallback((message: string, type: "success" | "error" | "info" = "success") => {
    setToast({ message, type });
  }, []);

  // Auto-dismiss toast after 5s
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => {
      setToast(null);
    }, 5000);
    return () => clearTimeout(timer);
  }, [toast]);

  // Fetch connection status
  const fetchStatus = useCallback(async (isSilent = false) => {
    if (!isSilent) {
      setIsLoadingStatus(true);
      setStatusError(null);
    }
    try {
      const res = await apiClient.getWhatsAppStatus();
      if (res?.success && res?.data) {
        setStatus(res.data);
        setStatusError(null);
        if (res.data.wabaId) {
          setWabaId((prev) => prev || res.data.wabaId || "");
        }
        if (res.data.phoneNumberId) {
          setPhoneNumberId((prev) => prev || res.data.phoneNumberId || "");
        }
      } else {
        setStatusError("Failed to retrieve WhatsApp connection details.");
      }
    } catch (err: unknown) {
      const message =
        err instanceof ApiClientError
          ? err.message
          : err instanceof Error
          ? err.message
          : "Unable to load WhatsApp connection status.";
      setStatusError(message);
    } finally {
      if (!isSilent) setIsLoadingStatus(false);
    }
  }, []);

  useEffect(() => {
    fetchStatus();
  }, [fetchStatus]);

  // Safe Copy Action
  const handleCopy = async (text: string, key: string) => {
    try {
      if (navigator?.clipboard?.writeText) {
        await navigator.clipboard.writeText(text);
      } else {
        // Fallback for older browsers
        const textarea = document.createElement("textarea");
        textarea.value = text;
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand("copy");
        document.body.removeChild(textarea);
      }
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    } catch {
      showToast("Unable to copy to clipboard.", "error");
    }
  };

  // Connect WhatsApp Account Submission
  const handleConnectSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // Prevent duplicate submission while in progress
    if (isSubmittingConnect) return;

    const trimmedWaba = wabaId.trim();
    const trimmedPhoneId = phoneNumberId.trim();
    const trimmedToken = accessToken.trim();

    if (!trimmedWaba) {
      setConnectError("WhatsApp Business Account ID (WABA ID) is required.");
      return;
    }
    if (!trimmedPhoneId) {
      setConnectError("Phone Number ID is required.");
      return;
    }
    if (!trimmedToken) {
      setConnectError("Meta System User Access Token is required.");
      return;
    }

    setIsSubmittingConnect(true);
    setConnectError(null);

    try {
      const res = await apiClient.connectWhatsApp({
        wabaId: trimmedWaba,
        phoneNumberId: trimmedPhoneId,
        accessToken: trimmedToken,
      });

      if (res.success && res.data) {
        setStatus(res.data);
        setShowConnectForm(false);
        showToast("WhatsApp Business Account connected and verified successfully!", "success");
      } else {
        setConnectError("Meta rejected connection verification. Please verify your credentials.");
      }
    } catch (err: unknown) {
      if (err instanceof ApiClientError) {
        if (err.statusCode === 401) {
          setConnectError("The provided Meta access token is invalid, expired, or has been revoked.");
        } else if (err.statusCode === 403) {
          setConnectError(
            "Insufficient Meta permissions. Ensure your System User has 'whatsapp_business_messaging' and 'whatsapp_business_management' permissions."
          );
        } else if (err.statusCode === 409) {
          setConnectError("This WhatsApp Business Account or Phone Number is already linked to another organization.");
        } else {
          setConnectError(err.message || "Failed to connect WhatsApp account.");
        }
      } else if (err instanceof Error) {
        setConnectError(err.message);
      } else {
        setConnectError("An unexpected error occurred while verifying Meta credentials.");
      }
    } finally {
      // CRITICAL REQUIREMENT: Clear the sensitive access token field immediately, whether request succeeds or fails
      setAccessToken("");
      setIsSubmittingConnect(false);
    }
  };

  // Refresh Connection Handler
  const handleRefresh = async () => {
    if (isRefreshing) return;
    setIsRefreshing(true);
    try {
      const res = await apiClient.refreshWhatsApp();
      if (res.success && res.data) {
        setStatus(res.data);
        if (res.data.status === "TOKEN_EXPIRED") {
          showToast("Meta token has expired or was revoked. Please reconnect.", "error");
        } else {
          showToast("WhatsApp connection details refreshed and verified.", "success");
        }
      } else {
        showToast("Unable to refresh connection status.", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to refresh WhatsApp connection.";
      showToast(msg, "error");
      // Silently sync latest status from database in case state transitioned
      await fetchStatus(true);
    } finally {
      setIsRefreshing(false);
    }
  };

  // Disconnect Confirmation Handler
  const handleDisconnectConfirm = async () => {
    if (isDisconnecting) return;
    setIsDisconnecting(true);
    try {
      const res = await apiClient.disconnectWhatsApp();
      if (res.success) {
        setIsDisconnectModalOpen(false);
        showToast(res.message || "WhatsApp account successfully disconnected.", "info");
        await fetchStatus(true);
      } else {
        showToast("Backend rejected disconnect request.", "error");
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to disconnect WhatsApp account.";
      showToast(msg, "error");
    } finally {
      setIsDisconnecting(false);
    }
  };

  // Format date helper
  const formatDate = (isoString?: string | null) => {
    if (!isoString) return "Never";
    try {
      return new Date(isoString).toLocaleString(undefined, {
        dateStyle: "medium",
        timeStyle: "short",
      });
    } catch {
      return isoString;
    }
  };

  // Determine badge styling by status
  const getStatusBadge = (st: MetaConnectionStatus) => {
    switch (st) {
      case "CONNECTED":
        return {
          label: "Connected & Verified",
          className: "status-badge-connected",
          icon: CheckCircle2,
          color: "var(--accent-emerald)",
        };
      case "TOKEN_EXPIRED":
        return {
          label: "Token Expired",
          className: "status-badge-expired",
          icon: AlertTriangle,
          color: "var(--accent-amber)",
        };
      case "REVOKED":
        return {
          label: "Access Revoked",
          className: "status-badge-revoked",
          icon: AlertCircle,
          color: "var(--accent-rose)",
        };
      case "DISCONNECTED":
        return {
          label: "Disconnected",
          className: "status-badge-disconnected",
          icon: Unlink,
          color: "var(--text-muted)",
        };
      case "PENDING_VERIFICATION":
        return {
          label: "Pending Verification",
          className: "status-badge-pending",
          icon: RefreshCw,
          color: "var(--accent-indigo)",
        };
      case "NOT_CONNECTED":
      default:
        return {
          label: "Not Connected",
          className: "status-badge-not-connected",
          icon: AlertCircle,
          color: "var(--text-secondary)",
        };
    }
  };

  const isConnected = status?.connected === true && status.status === "CONNECTED";
  const hasAccountRecord =
    status &&
    (status.status === "CONNECTED" ||
      status.status === "TOKEN_EXPIRED" ||
      status.status === "REVOKED" ||
      (status.status === "DISCONNECTED" && Boolean(status.wabaId)));

  return (
    <div className="settings-page-wrapper">
      {/* Toast Notification */}
      {toast && (
        <div
          className={`toast-notification toast-${toast.type}`}
          role="status"
          aria-live="polite"
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
            {toast.type === "success" && <CheckCircle2 size={16} />}
            {toast.type === "error" && <AlertCircle size={16} />}
            {toast.type === "info" && <Info size={16} />}
            <span>{toast.message}</span>
          </div>
          <button
            type="button"
            className="toast-close-btn"
            onClick={() => setToast(null)}
            aria-label="Close notification"
          >
            ×
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="settings-header-banner">
        <div className="settings-header-content">
          <div className="settings-icon-circle">
            <MessageSquare size={26} />
          </div>
          <div>
            <div className="settings-title-row">
              <h1 className="settings-page-title">WhatsApp Integration Settings</h1>
              {status && (
                <span className={`connection-status-pill ${getStatusBadge(status.status).className}`}>
                  {React.createElement(getStatusBadge(status.status).icon, { size: 13 })}
                  <span>{getStatusBadge(status.status).label}</span>
                </span>
              )}
            </div>
            <p className="settings-page-subtitle">
              Configure and monitor official Meta WhatsApp Cloud API credentials for multi-tenant broadcasts and template synchronization.
            </p>
          </div>
        </div>

        <div className="settings-org-badge">
          <Building size={14} color="var(--accent-emerald)" />
          <span className="org-label">Organization:</span>
          <span className="org-name">{organization?.name || "Grovastra Workspace"}</span>
        </div>
      </div>

      {/* Main Grid: Status Card + Credentials Form */}
      <div className="settings-grid">
        {/* =================================================================== */}
        {/* Section A: Current Connection Status Card */}
        {/* =================================================================== */}
        <div className="settings-card glass-panel status-overview-card">
          <div className="card-header-bar">
            <div className="header-title-wrap">
              <ShieldCheck size={20} color="var(--accent-emerald)" />
              <div>
                <h2 className="card-section-title">Connection Status</h2>
                <span className="card-section-sub">Meta WhatsApp Business Account Health</span>
              </div>
            </div>

            {/* Quick Action: Refresh */}
            {hasAccountRecord && (
              <button
                type="button"
                className="btn-refresh-status"
                onClick={handleRefresh}
                disabled={isRefreshing || isLoadingStatus}
                title="Revalidate connection with Meta Graph API"
                aria-label="Refresh WhatsApp connection status"
              >
                <RefreshCw size={14} className={isRefreshing ? "spinning" : ""} />
                <span>{isRefreshing ? "Checking..." : "Revalidate"}</span>
              </button>
            )}
          </div>

          {isLoadingStatus ? (
            <div className="status-loading-skeleton">
              <Loader2 size={24} className="spinning" color="var(--accent-emerald)" />
              <p>Inspecting Meta Cloud API credentials...</p>
            </div>
          ) : statusError ? (
            <div className="status-error-box" role="alert">
              <AlertCircle size={20} color="var(--accent-rose)" />
              <div style={{ flex: 1 }}>
                <h4 style={{ fontWeight: 600, color: "var(--accent-rose)" }}>Failed to Load Status</h4>
                <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "2px" }}>
                  {statusError}
                </p>
              </div>
              <button
                type="button"
                className="btn-secondary"
                onClick={() => fetchStatus()}
                style={{ padding: "0.4rem 0.8rem", fontSize: "0.8rem" }}
              >
                <RefreshCw size={13} />
                <span>Retry</span>
              </button>
            </div>
          ) : status && isConnected ? (
            /* Connected State */
            <div className="connection-details-view">
              <div className="verified-business-strip">
                <div className="business-avatar">
                  <MessageSquare size={22} color="#ffffff" />
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                    <h3 className="verified-business-name">
                      {status.verifiedName || "Verified WhatsApp Business"}
                    </h3>
                    <span className="verified-check-pill" title="Verified by Meta">
                      <Check size={12} />
                      <span>Verified</span>
                    </span>
                  </div>
                  <div className="phone-display-row">
                    <Phone size={14} color="var(--text-muted)" />
                    <span className="phone-number-text">
                      {status.displayPhoneNumber || "Phone Number Active"}
                    </span>
                  </div>
                </div>

                <div className="source-tag">
                  <Server size={13} />
                  <span>
                    {status.source === "PLATFORM_SHARED"
                      ? "Shared Platform"
                      : status.source === "DATABASE"
                      ? "Custom Business Account"
                      : "Connected Business Account"}
                  </span>
                </div>
              </div>

              {/* Safe Metadata Grid */}
              <div className="meta-info-grid">
                <div className="meta-info-tile">
                  <span className="meta-tile-label">WhatsApp Business Account ID</span>
                  <div className="meta-tile-val-row">
                    <code className="safe-id-code">{status.wabaId || "—"}</code>
                    {status.wabaId && (
                      <button
                        type="button"
                        className="btn-copy-id"
                        onClick={() => handleCopy(status.wabaId!, "wabaId")}
                        title="Copy WABA ID"
                        aria-label="Copy WABA ID"
                      >
                        {copiedKey === "wabaId" ? (
                          <Check size={13} color="var(--accent-emerald)" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="meta-info-tile">
                  <span className="meta-tile-label">Phone Number ID</span>
                  <div className="meta-tile-val-row">
                    <code className="safe-id-code">{status.phoneNumberId || "—"}</code>
                    {status.phoneNumberId && (
                      <button
                        type="button"
                        className="btn-copy-id"
                        onClick={() => handleCopy(status.phoneNumberId!, "phoneNumberId")}
                        title="Copy Phone Number ID"
                        aria-label="Copy Phone Number ID"
                      >
                        {copiedKey === "phoneNumberId" ? (
                          <Check size={13} color="var(--accent-emerald)" />
                        ) : (
                          <Copy size={13} />
                        )}
                      </button>
                    )}
                  </div>
                </div>

                <div className="meta-info-tile">
                  <span className="meta-tile-label">Last Verified / Synced</span>
                  <div className="meta-tile-val-row">
                    <span className="safe-text-val">
                      {formatDate(status.lastSyncedAt || status.verifiedAt)}
                    </span>
                  </div>
                </div>

                <div className="meta-info-tile">
                  <span className="meta-tile-label">Token Expiration</span>
                  <div className="meta-tile-val-row">
                    <span className="safe-text-val">
                      {status.tokenExpiresAt
                        ? formatDate(status.tokenExpiresAt)
                        : "Permanent System User Token"}
                    </span>
                  </div>
                </div>
              </div>

              {/* Status Actions / Shared Platform Notice */}
              {status.canManageCredentials === false ? (
                <div
                  className="shared-platform-notice-box"
                  style={{
                    marginTop: "1.25rem",
                    padding: "0.85rem 1rem",
                    borderRadius: "8px",
                    background: "rgba(16, 185, 129, 0.08)",
                    border: "1px solid rgba(16, 185, 129, 0.2)",
                    display: "flex",
                    alignItems: "flex-start",
                    gap: "0.75rem",
                    color: "var(--text-secondary)",
                    fontSize: "0.875rem",
                    lineHeight: 1.5,
                  }}
                >
                  <ShieldCheck
                    size={18}
                    color="var(--accent-emerald)"
                    style={{ flexShrink: 0, marginTop: "2px" }}
                  />
                  <div>
                    <strong
                      style={{
                        color: "var(--text-primary)",
                        display: "block",
                        marginBottom: "2px",
                      }}
                    >
                      Grovastra Shared WhatsApp Platform
                    </strong>
                    <span>
                      {status.sharedNotice ||
                        "Outbound campaigns use Grovastra's shared WhatsApp business identity. Individual customer credentials are not required or manageable."}
                    </span>
                  </div>
                </div>
              ) : (
                <div className="status-action-row">
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => setShowConnectForm(!showConnectForm)}
                    aria-expanded={showConnectForm}
                  >
                    <KeyRound size={15} />
                    <span>
                      {showConnectForm ? "Hide Credentials Form" : "Rotate / Update Credentials"}
                    </span>
                  </button>

                  {status.source === "DATABASE" && (
                    <button
                      type="button"
                      className="btn-danger-outline"
                      onClick={() => setIsDisconnectModalOpen(true)}
                    >
                      <Unlink size={15} />
                      <span>Disconnect Account</span>
                    </button>
                  )}
                </div>
              )}
            </div>
          ) : status && status.status === "TOKEN_EXPIRED" ? (
            /* Token Expired State */
            <div className="expired-status-view">
              <div className="alert-banner-expired" role="alert">
                <AlertTriangle size={20} color="var(--accent-amber)" />
                <div>
                  <h4 style={{ fontWeight: 600, color: "var(--accent-amber)" }}>
                    Meta System User Token Expired or Revoked
                  </h4>
                  <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginTop: "4px" }}>
                    The access token linked to WABA ID{" "}
                    <code>{status.wabaId || "Linked Account"}</code> has expired or permissions were modified in Meta Business Manager. Please re-enter your credentials below to restore messaging.
                  </p>
                  {status.lastError && (
                    <div className="last-error-snippet">
                      <span>Reason:</span> {status.lastError}
                    </div>
                  )}
                </div>
              </div>

              <div className="status-action-row" style={{ marginTop: "1rem" }}>
                <button
                  type="button"
                  className="btn-primary"
                  onClick={() => setShowConnectForm(true)}
                >
                  <KeyRound size={15} />
                  <span>Reconnect Account Now</span>
                </button>

                {status.source === "DATABASE" && (
                  <button
                    type="button"
                    className="btn-danger-outline"
                    onClick={() => setIsDisconnectModalOpen(true)}
                  >
                    <Unlink size={15} />
                    <span>Disconnect</span>
                  </button>
                )}
              </div>
            </div>
          ) : status && status.status === "DISCONNECTED" ? (
            /* Disconnected State */
            <div className="empty-status-view">
              <div className="empty-status-icon-wrap" style={{ borderColor: "rgba(148, 163, 184, 0.2)" }}>
                <Unlink size={28} color="var(--text-muted)" />
              </div>
              <h3 className="empty-status-title">WhatsApp Account Disconnected</h3>
              <p className="empty-status-desc">
                Your previous WhatsApp Business Account was disconnected. Outbound messaging is paused, but all past campaigns, contact audiences, and message audit records remain safely preserved.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowConnectForm(true)}
                style={{ marginTop: "1rem" }}
              >
                <KeyRound size={15} />
                <span>Connect WhatsApp Account</span>
              </button>
            </div>
          ) : (
            /* Empty / Not Connected State */
            <div className="empty-status-view">
              <div className="empty-status-icon-wrap">
                <MessageSquare size={32} color="var(--accent-emerald)" />
              </div>
              <h3 className="empty-status-title">No WhatsApp Account Connected</h3>
              <p className="empty-status-desc">
                Connect your Meta WhatsApp Cloud API credentials to start broadcasting personalized marketing campaigns, importing pre-approved templates, and receiving real-time delivery status webhooks.
              </p>
              <button
                type="button"
                className="btn-primary"
                onClick={() => setShowConnectForm(true)}
                style={{ marginTop: "1.25rem" }}
              >
                <KeyRound size={15} />
                <span>Connect Account Now</span>
              </button>
            </div>
          )}
        </div>

        {/* =================================================================== */}
        {/* Section B: Connect WhatsApp Account Form */}
        {/* =================================================================== */}
        {(!isConnected || showConnectForm) && status?.canManageCredentials !== false && (
          <div className="settings-card glass-panel connect-form-card" id="connect-whatsapp-card">
            <div className="card-header-bar">
              <div className="header-title-wrap">
                <KeyRound size={20} color="var(--accent-indigo-light)" />
                <div>
                  <h2 className="card-section-title">
                    {isConnected ? "Update WhatsApp Credentials" : "Connect WhatsApp Account"}
                  </h2>
                  <span className="card-section-sub">
                    Direct Meta Graph API integration with AES-256-GCM encrypted credential storage
                  </span>
                </div>
              </div>
            </div>

            {/* Security Notice Callout */}
            <div className="security-notice-callout">
              <div className="security-notice-icon">
                <Shield size={18} color="var(--accent-emerald-light)" />
              </div>
              <div className="security-notice-text">
                <h4 className="security-notice-title">Enterprise Credential Security</h4>
                <p>
                  Your System User Access Token is encrypted server-side with AES-256-GCM before database persistence. It is never logged, never exposed in client API responses, and never stored in browser localStorage or sessionStorage.
                </p>
                <div className="required-permissions-strip">
                  <span className="permission-pill">whatsapp_business_messaging</span>
                  <span className="permission-pill">whatsapp_business_management</span>
                </div>
              </div>
            </div>

            {/* Form Validation / API Error Banner */}
            {connectError && (
              <div className="auth-error-banner" role="alert" style={{ marginBottom: "1.25rem" }}>
                <AlertCircle size={18} style={{ flexShrink: 0, marginTop: "2px" }} />
                <div>{connectError}</div>
              </div>
            )}

            {/* Credentials Form */}
            <form onSubmit={handleConnectSubmit} className="whatsapp-connect-form" noValidate>
              <div className="form-group-custom">
                <label htmlFor="waba-id-input" className="form-label-custom">
                  WhatsApp Business Account ID (WABA ID){" "}
                  <span style={{ color: "var(--accent-rose)" }}>*</span>
                </label>
                <input
                  id="waba-id-input"
                  type="text"
                  className="auth-input"
                  placeholder="e.g. 109823485729182"
                  value={wabaId}
                  onChange={(e) => setWabaId(e.target.value)}
                  disabled={isSubmittingConnect}
                  required
                  autoComplete="off"
                />
                <span className="form-helper-text">
                  Found in Meta Business Manager under WhatsApp Accounts → Settings.
                </span>
              </div>

              <div className="form-group-custom">
                <label htmlFor="phone-id-input" className="form-label-custom">
                  Phone Number ID <span style={{ color: "var(--accent-rose)" }}>*</span>
                </label>
                <input
                  id="phone-id-input"
                  type="text"
                  className="auth-input"
                  placeholder="e.g. 108374928174829"
                  value={phoneNumberId}
                  onChange={(e) => setPhoneNumberId(e.target.value)}
                  disabled={isSubmittingConnect}
                  required
                  autoComplete="off"
                />
                <span className="form-helper-text">
                  Found in Meta App Dashboard under WhatsApp → API Setup.
                </span>
              </div>

              <div className="form-group-custom">
                <label htmlFor="access-token-input" className="form-label-custom">
                  System User Access Token <span style={{ color: "var(--accent-rose)" }}>*</span>
                </label>
                <div className="auth-input-wrapper">
                  <input
                    id="access-token-input"
                    type={showToken ? "text" : "password"}
                    className="auth-input"
                    placeholder="EAAG..."
                    value={accessToken}
                    onChange={(e) => setAccessToken(e.target.value)}
                    disabled={isSubmittingConnect}
                    required
                    autoComplete="off"
                    style={{ paddingRight: "2.8rem" }}
                  />
                  <button
                    type="button"
                    className="auth-password-toggle"
                    onClick={() => setShowToken(!showToken)}
                    aria-label={showToken ? "Hide access token" : "Show access token"}
                    tabIndex={0}
                  >
                    {showToken ? <EyeOff size={16} /> : <Eye size={16} />}
                  </button>
                </div>
                <span className="form-helper-text">
                  Permanent token generated from Meta Business Settings → System Users with full WhatsApp permissions. Cleared immediately from memory upon submit.
                </span>
              </div>

              {/* Form Buttons */}
              <div className="form-buttons-row">
                {isConnected && (
                  <button
                    type="button"
                    className="btn-secondary"
                    onClick={() => {
                      setShowConnectForm(false);
                      setConnectError(null);
                      setAccessToken("");
                    }}
                    disabled={isSubmittingConnect}
                  >
                    Cancel
                  </button>
                )}

                <button
                  type="submit"
                  className="btn-primary-connect"
                  disabled={isSubmittingConnect || !wabaId.trim() || !phoneNumberId.trim() || !accessToken.trim()}
                >
                  {isSubmittingConnect ? (
                    <>
                      <Loader2 size={16} className="spinning" />
                      <span>Verifying with Meta Graph API...</span>
                    </>
                  ) : (
                    <>
                      <Lock size={15} />
                      <span>{isConnected ? "Update & Revalidate Account" : "Verify & Connect WhatsApp"}</span>
                    </>
                  )}
                </button>
              </div>
            </form>
          </div>
        )}

        {/* =================================================================== */}
        {/* Setup Guide / Meta Reference Card */}
        {/* =================================================================== */}
        <div className="settings-card glass-panel guide-card">
          <div className="card-header-bar">
            <div className="header-title-wrap">
              <FileText size={18} color="var(--accent-indigo-light)" />
              <div>
                <h3 className="card-section-title" style={{ fontSize: "1rem" }}>
                  Meta Setup Prerequisites
                </h3>
                <span className="card-section-sub">Required steps in Meta Business Manager</span>
              </div>
            </div>
            <a
              href="https://developers.facebook.com/docs/whatsapp/cloud-api/get-started"
              target="_blank"
              rel="noreferrer noopener"
              className="meta-docs-link"
            >
              <span>Meta Docs</span>
              <ExternalLink size={13} />
            </a>
          </div>

          <div className="guide-steps-list">
            <div className="guide-step-item">
              <span className="step-number">1</span>
              <div>
                <strong>Create System User</strong>
                <p>In Business Settings → Users → System Users, create an Admin System User.</p>
              </div>
            </div>

            <div className="guide-step-item">
              <span className="step-number">2</span>
              <div>
                <strong>Assign WhatsApp Asset</strong>
                <p>Assign your WhatsApp Business Account to the System User with Full Control.</p>
              </div>
            </div>

            <div className="guide-step-item">
              <span className="step-number">3</span>
              <div>
                <strong>Generate Permanent Token</strong>
                <p>
                  Generate a token with <code>whatsapp_business_messaging</code> and{" "}
                  <code>whatsapp_business_management</code> scopes.
                </p>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* =================================================================== */}
      {/* Section D: Disconnect Confirmation Modal */}
      {/* =================================================================== */}
      {isDisconnectModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => !isDisconnecting && setIsDisconnectModalOpen(false)}
          role="presentation"
        >
          <div
            className="modal-card confirm-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="disconnect-modal-title"
          >
            <div className="modal-header">
              <div className="modal-icon-danger">
                <AlertTriangle size={20} color="var(--accent-rose)" />
              </div>
              <div style={{ flex: 1 }}>
                <h3 id="disconnect-modal-title" className="modal-title">
                  Disconnect WhatsApp Account?
                </h3>
                <span className="modal-sub">Confirm channel disconnection</span>
              </div>
              <button
                type="button"
                className="btn-icon-close"
                onClick={() => !isDisconnecting && setIsDisconnectModalOpen(false)}
                disabled={isDisconnecting}
                aria-label="Close dialog"
              >
                ×
              </button>
            </div>

            <div className="modal-body">
              <p className="modal-text">
                Are you sure you want to disconnect the WhatsApp Business Account for{" "}
                <strong>{organization?.name || "your organization"}</strong>?
              </p>

              <div className="disconnect-impact-box">
                <h5 className="disconnect-impact-title">What happens when you disconnect:</h5>
                <ul className="disconnect-impact-list">
                  <li>Future WhatsApp campaign dispatches and broadcast jobs will be disabled.</li>
                  <li>Template synchronization from Meta Graph API will be paused.</li>
                  <li>
                    <strong>Safe data retention:</strong> All historical campaigns, contact audiences, messages, and webhook logs are safely preserved.
                  </li>
                  <li>You can reconnect the account at any time with new or updated credentials.</li>
                </ul>
              </div>
            </div>

            <div className="modal-footer">
              <button
                type="button"
                className="btn-secondary"
                onClick={() => setIsDisconnectModalOpen(false)}
                disabled={isDisconnecting}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn-danger"
                onClick={handleDisconnectConfirm}
                disabled={isDisconnecting}
              >
                {isDisconnecting ? (
                  <>
                    <Loader2 size={15} className="spinning" />
                    <span>Disconnecting...</span>
                  </>
                ) : (
                  <>
                    <Unlink size={15} />
                    <span>Disconnect Account</span>
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
