import React from "react";
import { LucideIcon } from "lucide-react";

interface MetricCardProps {
  title: string;
  value: string | number;
  subtitle: string;
  icon: LucideIcon;
  accentColor?: string;
  isDemo?: boolean;
}

export const MetricCard: React.FC<MetricCardProps> = ({
  title,
  value,
  subtitle,
  icon: Icon,
  accentColor = "var(--accent-emerald)",
  isDemo = false,
}) => {
  return (
    <div className="metric-summary-card">
      <div className="metric-header-row">
        <span className="metric-title-label">{title}</span>
        <div className="metric-icon-bubble" style={{ color: accentColor }}>
          <Icon size={18} />
        </div>
      </div>

      <div className="metric-main-value">
        <span className="metric-number">{value}</span>
        {isDemo && <span className="demo-data-badge">Demo Data</span>}
      </div>

      <p className="metric-subtitle-text">{subtitle}</p>
    </div>
  );
};
