import React from "react";
import {
  Activity,
  CheckCircle2,
  AlertTriangle,
  XCircle,
  Database,
  Cpu,
  Globe,
  Clock,
} from "lucide-react";
import { HealthData, ReadinessData, ConnectionState } from "../types/api.js";

interface HealthStatusCardProps {
  health: HealthData | null;
  readiness: ReadinessData | null;
  state: ConnectionState;
  errorMessage: string | null;
  apiBaseUrl: string;
}

export const HealthStatusCard: React.FC<HealthStatusCardProps> = ({
  health,
  readiness,
  state,
  errorMessage,
  apiBaseUrl,
}) => {
  const renderBadge = () => {
    switch (state) {
      case "loading":
        return (
          <span className="health-status-badge badge-loading">
            <Activity size={14} className="spinning" />
            <span>Connecting to Backend...</span>
          </span>
        );
      case "connected":
        return (
          <span className="health-status-badge badge-healthy">
            <CheckCircle2 size={14} />
            <span>API Active & Healthy</span>
          </span>
        );
      case "degraded":
        return (
          <span className="health-status-badge badge-degraded">
            <AlertTriangle size={14} />
            <span>Degraded (Dependencies Pending)</span>
          </span>
        );
      case "error":
      default:
        return (
          <span className="health-status-badge badge-error">
            <XCircle size={14} />
            <span>Backend Unreachable</span>
          </span>
        );
    }
  };

  return (
    <div className="glass-card" style={{ gridColumn: "span 2" }}>
      <div className="card-header-line">
        <div>
          <h2 className="card-title">Backend API Health & Readiness Probes</h2>
          <p style={{ fontSize: "0.8rem", color: "var(--text-muted)", marginTop: "2px" }}>
            Real-time liveness probe and dependency diagnostic telemetry
          </p>
        </div>
        <div className="card-icon">
          <Activity size={20} color="var(--accent-emerald)" />
        </div>
      </div>

      {renderBadge()}

      {state === "error" && errorMessage && (
        <div
          style={{
            padding: "0.85rem 1rem",
            background: "rgba(244, 63, 94, 0.1)",
            border: "1px solid rgba(244, 63, 94, 0.25)",
            borderRadius: "var(--radius-md)",
            fontSize: "0.85rem",
            color: "#fb7185",
            marginBottom: "1rem",
          }}
        >
          {errorMessage}
        </div>
      )}

      <div className="metrics-list">
        <div className="metric-item">
          <span className="metric-name">
            <Globe size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} />
            API Base URL
          </span>
          <span className="metric-val">{apiBaseUrl}</span>
        </div>

        {health && (
          <>
            <div className="metric-item">
              <span className="metric-name">Service Identifier</span>
              <span className="metric-val">{health.service} v{health.version}</span>
            </div>
            <div className="metric-item">
              <span className="metric-name">
                <Clock size={14} style={{ display: "inline", verticalAlign: "middle", marginRight: "6px" }} />
                Process Uptime
              </span>
              <span className="metric-val">{health.uptime}s</span>
            </div>
            <div className="metric-item">
              <span className="metric-name">Runtime Environment</span>
              <span className="metric-val">{health.environment}</span>
            </div>
          </>
        )}
      </div>

      <div style={{ marginTop: "1.25rem" }}>
        <h3 style={{ fontSize: "0.85rem", color: "var(--text-secondary)", marginBottom: "0.5rem" }}>
          Readiness & Infrastructure Dependencies
        </h3>

        <div className="dependency-item">
          <div className="dependency-info">
            <div className="dependency-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Database size={15} color="var(--accent-indigo-light)" />
              <span>Supabase PostgreSQL (Prisma ORM)</span>
            </div>
            <div className="dependency-detail">
              {readiness?.dependencies.database.message ||
                "Awaiting configuration check. Provide Supabase credentials in backend/.env"}
            </div>
          </div>
          <span className={`state-tag ${readiness?.dependencies.database.status || "not_configured"}`}>
            {readiness?.dependencies.database.status || "Not Configured"}
          </span>
        </div>

        <div className="dependency-item">
          <div className="dependency-info">
            <div className="dependency-title" style={{ display: "flex", alignItems: "center", gap: "6px" }}>
              <Cpu size={15} color="var(--accent-emerald-light)" />
              <span>Upstash Redis (BullMQ Queue)</span>
            </div>
            <div className="dependency-detail">
              {readiness?.dependencies.redis.message ||
                "Awaiting configuration check. Provide Upstash Redis URL in backend/.env"}
            </div>
          </div>
          <span className={`state-tag ${readiness?.dependencies.redis.status || "not_configured"}`}>
            {readiness?.dependencies.redis.status || "Not Configured"}
          </span>
        </div>
      </div>
    </div>
  );
};
