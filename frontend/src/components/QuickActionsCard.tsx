import React from "react";
import { FileText, Send, Users, BarChart3, ChevronRight } from "lucide-react";

interface QuickActionsCardProps {
  onNavigate: (view: string) => void;
}

export const QuickActionsCard: React.FC<QuickActionsCardProps> = ({ onNavigate }) => {
  const actions = [
    {
      id: "templates",
      title: "Manage Templates",
      desc: "Customize message templates with real-time phone preview",
      icon: FileText,
      accent: "var(--accent-emerald)",
      badge: "Active",
      isLive: true,
    },
    {
      id: "campaigns",
      title: "Create Campaign",
      desc: "Broadcast personalized WhatsApp templates to targeted audience lists",
      icon: Send,
      accent: "var(--accent-indigo-light)",
      badge: "Active",
      isLive: true,
    },
    {
      id: "contacts",
      title: "Manage Audiences",
      desc: "Import customer contacts, define tags, and build custom segmentations",
      icon: Users,
      accent: "#38bdf8",
      badge: "Phase 4",
      isLive: false,
    },
    {
      id: "analytics",
      title: "View Analytics",
      desc: "Analyze read rates, link click-throughs, and campaign conversion telemetry",
      icon: BarChart3,
      accent: "#fbbf24",
      badge: "Phase 5",
      isLive: false,
    },
  ];

  return (
    <div className="quick-actions-card">
      <div className="card-top-row">
        <div>
          <h4 className="card-heading-sm">Quick Actions</h4>
          <span className="card-sub-label">Direct shortcuts across the platform</span>
        </div>
      </div>

      <div className="actions-vertical-list">
        {actions.map((act) => {
          const Icon = act.icon;
          return (
            <button
              key={act.id}
              type="button"
              className={`action-tile-btn ${act.isLive ? "tile-live" : "tile-upcoming"}`}
              onClick={() => onNavigate(act.id)}
            >
              <div className="action-tile-icon" style={{ color: act.accent }}>
                <Icon size={18} />
              </div>
              <div className="action-tile-text">
                <div className="action-tile-title-row">
                  <span className="action-tile-title">{act.title}</span>
                  <span className={`action-badge ${act.isLive ? "badge-live" : "badge-upcoming"}`}>
                    {act.badge}
                  </span>
                </div>
                <span className="action-tile-desc">{act.desc}</span>
              </div>
              <ChevronRight size={16} className="tile-chevron" />
            </button>
          );
        })}
      </div>
    </div>
  );
};
