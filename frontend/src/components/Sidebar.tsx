import React from "react";
import {
  LayoutDashboard,
  Send,
  Users,
  FileText,
  BarChart3,
  Settings,
  Sparkles,
  ShieldAlert,
  Palette,
  X,
} from "lucide-react";

interface SidebarProps {
  currentView: string;
  onNavigate: (view: string) => void;
  isOpenMobile?: boolean;
  onCloseMobile?: () => void;
  canAccessMasterAdmin?: boolean;
}

export const Sidebar: React.FC<SidebarProps> = ({
  currentView,
  onNavigate,
  isOpenMobile = false,
  onCloseMobile,
  canAccessMasterAdmin = false,
}) => {
  const navItems = [
    { id: "dashboard", label: "Dashboard", icon: LayoutDashboard },
    { id: "templates", label: "Templates", icon: FileText },
    { id: "poster-editor", label: "Poster Studio", icon: Palette, badge: "New" },
    { id: "campaigns", label: "Campaigns", icon: Send },
    { id: "contacts", label: "Audiences", icon: Users },
    { id: "analytics", label: "Analytics", icon: BarChart3 },
    { id: "settings", label: "Settings", icon: Settings },
    ...(canAccessMasterAdmin
      ? [{ id: "master-admin", label: "Master Admin", icon: ShieldAlert, badge: "Platform" }]
      : []),
  ];

  return (
    <>
      {/* Mobile Backdrop Overlay */}
      {isOpenMobile && (
        <div
          className="sidebar-backdrop"
          onClick={onCloseMobile}
          aria-hidden="true"
        />
      )}

      <aside className={`sidebar ${isOpenMobile ? "sidebar-mobile-open" : ""}`}>
        <div className="sidebar-header">
          <div className="brand-icon-wrap">
            <Sparkles size={20} />
          </div>
          <div style={{ flex: 1 }}>
            <div className="brand-title">Grovastra</div>
            <div className="brand-subtitle">WhatsApp Campaigns</div>
          </div>
          {onCloseMobile && (
            <button
              type="button"
              className="btn-close-sidebar-mobile"
              onClick={onCloseMobile}
              aria-label="Close navigation sidebar"
            >
              <X size={20} />
            </button>
          )}
        </div>

        <nav className="sidebar-nav" aria-label="Main Navigation">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                type="button"
                className={`nav-item ${isActive ? "active" : ""}`}
                onClick={() => {
                  onNavigate(item.id);
                  if (onCloseMobile) onCloseMobile();
                }}
                aria-current={isActive ? "page" : undefined}
              >
                <Icon size={18} />
                <span>{item.label}</span>
                {item.badge && (
                  <span
                    className="nav-badge"
                    style={{
                      background: item.badge === "Active" ? "rgba(16, 185, 129, 0.2)" : undefined,
                      color: item.badge === "Active" ? "var(--accent-emerald-light)" : undefined,
                    }}
                  >
                    {item.badge}
                  </span>
                )}
              </button>
            );
          })}
        </nav>

        <div className="sidebar-footer">
          <div className="environment-tag">
            <Sparkles size={14} color="var(--accent-emerald)" />
            <span>Grovastra Platform</span>
          </div>
        </div>
      </aside>
    </>
  );
};
