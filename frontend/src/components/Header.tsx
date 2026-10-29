import React from "react";
import { Menu, LogOut, Building2 } from "lucide-react";
import { useAuth } from "../context/AuthContext.js";

interface HeaderProps {
  title?: string;
  badge?: string;
  onRefresh?: () => void;
  isLoading?: boolean;
  isConnected?: boolean;
  onToggleMobileMenu?: () => void;
}

export const Header: React.FC<HeaderProps> = ({
  title = "Platform Overview",
  badge,
  onToggleMobileMenu,
}) => {
  const {
    user,
    organization,
    platformCapabilities,
    assignedOrganizations,
    activeAssignedOrgId,
    setActiveAssignedOrgId,
    logout,
  } = useAuth();

  const isDelegatedAdmin = platformCapabilities?.platformRole === "DELEGATED_ADMIN";
  const activeOrg = assignedOrganizations?.find((o) => o.id === activeAssignedOrgId);

  return (
    <header className="top-header">
      <div className="header-left">
        {onToggleMobileMenu && (
          <button
            type="button"
            className="btn-hamburger-mobile"
            onClick={onToggleMobileMenu}
            aria-label="Toggle navigation menu"
          >
            <Menu size={20} />
          </button>
        )}
        <h1 className="header-title">{title}</h1>
        {badge && <span className="phase-pill">{badge}</span>}
      </div>

      <div className="header-right">
        {/* For DELEGATED_ADMIN only: Accessible Active Company Selector */}
        {isDelegatedAdmin && (
          <div
            className="delegated-admin-company-selector"
            data-testid="delegated-admin-company-selector"
          >
            <label htmlFor="assigned-company-select" className="company-select-label">
              <Building2 size={15} className="company-icon" />
              <span className="company-label-text">Active Company:</span>
            </label>
            {assignedOrganizations && assignedOrganizations.length > 0 ? (
              <select
                id="assigned-company-select"
                data-testid="assigned-company-select"
                className="company-select-dropdown"
                value={activeAssignedOrgId || ""}
                onChange={(e) => setActiveAssignedOrgId?.(e.target.value || null)}
                aria-label="Select active assigned customer business"
              >
                {assignedOrganizations.map((org) => (
                  <option key={org.id} value={org.id}>
                    {org.name}
                  </option>
                ))}
              </select>
            ) : (
              <span className="no-assigned-badge" data-testid="no-assigned-badge">
                No Businesses Assigned
              </span>
            )}
          </div>
        )}

        {user && (
          <div className="auth-profile-badge">
            <div className="auth-user-avatar" title={user.email}>
              {user.firstName.charAt(0).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {user.firstName} {user.lastName || ""}
              </span>
              <span
                style={{
                  fontSize: "0.7rem",
                  color: isDelegatedAdmin ? "var(--accent-emerald)" : "var(--text-muted)",
                }}
              >
                {isDelegatedAdmin
                  ? activeOrg
                    ? `Managing: ${activeOrg.name}`
                    : `${organization?.name || "Agency"} (Delegated Admin)`
                  : organization?.name || "Organization"}
              </span>
            </div>
            <button
              type="button"
              className="btn-signout"
              onClick={() => logout()}
              title="Sign Out of Grovastra"
              aria-label="Sign Out of Grovastra"
            >
              <LogOut size={14} />
              <span className="btn-text-hide-mobile">Sign Out</span>
            </button>
          </div>
        )}
      </div>
    </header>
  );
};

