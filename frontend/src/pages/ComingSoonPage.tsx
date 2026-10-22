import React from "react";
import {
  Send,
  Users,
  BarChart3,
  Settings,
  ArrowLeft,
  Clock,
  Layers,
  Sparkles,
  TrendingUp,
  CheckCircle,
  Eye,
  AlertTriangle,
} from "lucide-react";

interface ComingSoonPageProps {
  view: string;
  onNavigate: (view: string) => void;
}

export const ComingSoonPage: React.FC<ComingSoonPageProps> = ({ view, onNavigate }) => {
  if (view === "analytics") {
    return (
      <div className="coming-soon-container" style={{ maxWidth: "1000px", margin: "0 auto", padding: "1.5rem" }}>
        {/* Analytics Top Stats Banner */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(200px, 1fr))", gap: "1rem", marginBottom: "1.5rem", width: "100%" }}>
          <div className="metric-card glass-panel" style={{ padding: "1.25rem", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>Total Dispatches</span>
              <TrendingUp size={16} color="var(--accent-primary)" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>0</div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Across all active campaigns</span>
          </div>

          <div className="metric-card glass-panel" style={{ padding: "1.25rem", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>Delivered Confirmation</span>
              <CheckCircle size={16} color="var(--accent-emerald)" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>0%</div>
            <span style={{ fontSize: "0.75rem", color: "var(--accent-emerald)" }}>Awaiting live dispatches</span>
          </div>

          <div className="metric-card glass-panel" style={{ padding: "1.25rem", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>Read Rate</span>
              <Eye size={16} color="var(--accent-indigo)" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>0%</div>
            <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>Read confirmation receipts</span>
          </div>

          <div className="metric-card glass-panel" style={{ padding: "1.25rem", borderRadius: "10px" }}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "0.5rem" }}>
              <span style={{ fontSize: "0.82rem", color: "var(--text-secondary)", fontWeight: 500 }}>Delivery Exceptions</span>
              <AlertTriangle size={16} color="var(--accent-amber)" />
            </div>
            <div style={{ fontSize: "1.75rem", fontWeight: 700, color: "var(--text-primary)" }}>0</div>
            <span style={{ fontSize: "0.75rem", color: "var(--accent-emerald)" }}>0 failed messages</span>
          </div>
        </div>

        {/* Analytics Information Card */}
        <div className="coming-soon-card" style={{ width: "100%" }}>
          <div className="coming-soon-header">
            <div className="coming-soon-icon-wrap" style={{ color: "#fbbf24" }}>
              <BarChart3 size={32} />
            </div>
            <div>
              <span className="coming-soon-phase-tag" style={{ background: "rgba(251, 191, 36, 0.15)", color: "#fbbf24" }}>
                Campaign Telemetry
              </span>
              <h2 className="coming-soon-title">Delivery & Engagement Analytics</h2>
            </div>
          </div>

          <p className="coming-soon-description">
            Comprehensive campaign telemetry tracks delivery confirmations, read receipts, and audience engagement automatically via real-time WhatsApp callbacks.
          </p>

          <div className="roadmap-box">
            <div className="roadmap-box-title">
              <Layers size={15} color="var(--accent-emerald-light)" />
              <span>Upcoming Capabilities</span>
            </div>
            <ul className="roadmap-list">
              <li className="roadmap-item">
                <Clock size={13} className="roadmap-clock" />
                <span>Real-time delivery status tracking (Accepted, Sent, Delivered, Read, Failed)</span>
              </li>
              <li className="roadmap-item">
                <Clock size={13} className="roadmap-clock" />
                <span>Audience segment engagement and conversion rate comparisons</span>
              </li>
              <li className="roadmap-item">
                <Clock size={13} className="roadmap-clock" />
                <span>Exportable CSV delivery audit logs for compliance</span>
              </li>
              <li className="roadmap-item">
                <Clock size={13} className="roadmap-clock" />
                <span>Automated delivery exception analysis and retry recommendations</span>
              </li>
            </ul>
          </div>

          <div className="coming-soon-footer-actions">
            <button
              type="button"
              className="btn-secondary"
              onClick={() => onNavigate("dashboard")}
            >
              <ArrowLeft size={15} />
              <span>Back to Dashboard</span>
            </button>

            <button
              type="button"
              className="btn-primary"
              onClick={() => onNavigate("campaigns")}
            >
              <Send size={15} />
              <span>Create Campaign</span>
            </button>
          </div>
        </div>
      </div>
    );
  }

  const getFeatureDetails = () => {
    switch (view) {
      case "campaigns":
        return {
          title: "WhatsApp Campaign Orchestrator",
          tag: "Campaign Orchestrator",
          icon: Send,
          accent: "var(--accent-indigo-light)",
          desc: "Create, schedule, and dispatch bulk WhatsApp messages to targeted segments using pre-approved templates and high-throughput background dispatch.",
          capabilities: [
            "Campaign creation wizard with audience picker",
            "Template selection & sample parameter population",
            "Broadcast scheduling with timezone dispatch",
            "Automated delivery confirmation and webhook processing",
          ],
        };
      case "contacts":
        return {
          title: "Audience Management & Segmentation",
          tag: "Audience Segmentation",
          icon: Users,
          accent: "#38bdf8",
          desc: "Import customer contacts, organize audiences into dynamic tags, and maintain opt-out compliance for WhatsApp broadcast campaigns.",
          capabilities: [
            "CSV bulk contact importer with automatic consent column mapping",
            "Custom tag definition (e.g., VIP, High Value, Inactive)",
            "Audience segmentation filters and count calculations",
            "Opt-out and unconsented contact exclusion protection",
          ],
        };
      case "settings":
      default:
        return {
          title: "Business & Channel Settings",
          tag: "Organization Settings",
          icon: Settings,
          accent: "var(--text-secondary)",
          desc: "Configure multi-business workspaces, team access permissions, and WhatsApp Business API credentials.",
          capabilities: [
            "Business profile configuration and team members",
            "WhatsApp Business credentials & webhook signing tokens",
            "Role-based access control (Admin, Editor, Viewer)",
            "Data retention and enterprise security policies",
          ],
        };
    }
  };

  const feature = getFeatureDetails();
  const Icon = feature.icon;

  return (
    <div className="coming-soon-container">
      <div className="coming-soon-card">
        <div className="coming-soon-header">
          <div className="coming-soon-icon-wrap" style={{ color: feature.accent }}>
            <Icon size={32} />
          </div>
          <div>
            <span className="coming-soon-phase-tag">{feature.tag}</span>
            <h2 className="coming-soon-title">{feature.title}</h2>
          </div>
        </div>

        <p className="coming-soon-description">{feature.desc}</p>

        <div className="roadmap-box">
          <div className="roadmap-box-title">
            <Layers size={15} color="var(--accent-emerald-light)" />
            <span>Upcoming Capabilities</span>
          </div>
          <ul className="roadmap-list">
            {feature.capabilities.map((item, idx) => (
              <li key={idx} className="roadmap-item">
                <Clock size={13} className="roadmap-clock" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="coming-soon-footer-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={() => onNavigate("dashboard")}
          >
            <ArrowLeft size={15} />
            <span>Back to Dashboard</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate("templates")}
          >
            <Sparkles size={15} />
            <span>Explore Templates</span>
          </button>
        </div>
      </div>
    </div>
  );
};
