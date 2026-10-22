import React from "react";
import { Menu, LogOut } from "lucide-react";
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
  const { user, organization, logout } = useAuth();

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
        {user && (
          <div className="auth-profile-badge">
            <div className="auth-user-avatar" title={user.email}>
              {user.firstName.charAt(0).toUpperCase()}
            </div>
            <div style={{ display: "flex", flexDirection: "column", lineHeight: 1.2 }}>
              <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                {user.firstName} {user.lastName || ""}
              </span>
              <span style={{ fontSize: "0.7rem", color: "var(--text-muted)" }}>
                {organization?.name || "Organization"}
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

