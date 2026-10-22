import React from "react";
import { LucideIcon } from "lucide-react";

interface DashboardSummaryCardProps {
  title: string;
  category: string;
  description: string;
  statusBadge: string;
  icon: LucideIcon;
  accentColor?: string;
}

export const DashboardSummaryCard: React.FC<DashboardSummaryCardProps> = ({
  title,
  category,
  description,
  statusBadge,
  icon: Icon,
  accentColor = "var(--accent-emerald)",
}) => {
  return (
    <div className="glass-card">
      <div className="card-header-line">
        <span className="placeholder-badge">{category}</span>
        <div className="card-icon" style={{ color: accentColor }}>
          <Icon size={18} />
        </div>
      </div>

      <h3 className="card-title" style={{ marginBottom: "0.4rem" }}>
        {title}
      </h3>

      <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)", flex: 1, marginBottom: "1rem" }}>
        {description}
      </p>

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", borderTop: "1px solid rgba(255, 255, 255, 0.05)", paddingTop: "0.75rem" }}>
        <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Architecture Phase</span>
        <span
          style={{
            fontSize: "0.75rem",
            fontWeight: 600,
            color: accentColor,
            background: "rgba(255, 255, 255, 0.04)",
            padding: "0.15rem 0.5rem",
            borderRadius: "var(--radius-sm)",
          }}
        >
          {statusBadge}
        </span>
      </div>
    </div>
  );
};
