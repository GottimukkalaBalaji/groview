import React, { useState, useEffect, useCallback, useId } from "react";
import {
  BarChart3,
  TrendingUp,
  Clock,
  AlertTriangle,
  CheckCircle2,
  AlertCircle,
  Eye,
  Send,
  RefreshCw,
  Search,
  ShieldCheck,
  Calendar,
  Check,
  ChevronLeft,
  ChevronRight,
  Info,
  Layers,
  ArrowUpRight,
  XCircle,
  Database,
  Radio,
} from "lucide-react";
import { apiClient } from "../services/api.js";
import {
  AnalyticsOverview,
  DeliveryReportResponse,
} from "../types/analytics.js";
import { Campaign } from "../types/campaign.js";

interface AnalyticsPageProps {
  onNavigate?: (view: string) => void;
}

export const AnalyticsPage: React.FC<AnalyticsPageProps> = () => {
  // Filters & State
  const [timeRange, setTimeRange] = useState<"7d" | "30d" | "90d" | "all">("30d");
  const [selectedCampaignId, setSelectedCampaignId] = useState<string>("");
  const [campaignOptions, setCampaignOptions] = useState<Campaign[]>([]);

  // Overview Data State
  const [overview, setOverview] = useState<AnalyticsOverview | null>(null);
  const [isOverviewLoading, setIsOverviewLoading] = useState<boolean>(true);
  const [overviewError, setOverviewError] = useState<string | null>(null);

  // Delivery Report State
  const [reportData, setReportData] = useState<DeliveryReportResponse | null>(null);
  const [isReportLoading, setIsReportLoading] = useState<boolean>(true);
  const [reportError, setReportError] = useState<string | null>(null);
  const [reportSearch, setReportSearch] = useState<string>("");
  const [reportStatus, setReportStatus] = useState<string>("ALL");
  const [reportPage, setReportPage] = useState<number>(1);
  const reportLimit = 15;

  // Active sub-tab / view section (optional accordion or scroll anchors)
  const [activeTab, setActiveTab] = useState<"overview" | "trends" | "scheduling" | "messages">("overview");

  // Load campaign list for filter dropdown
  useEffect(() => {
    let isMounted = true;
    apiClient
      .listCampaigns({ limit: 100 })
      .then((res) => {
        if (isMounted && res.data?.items) {
          setCampaignOptions(res.data.items as Campaign[]);
        }
      })
      .catch(() => {
        // Non-blocking fallback
      });
    return () => {
      isMounted = false;
    };
  }, []);

  // Fetch Overview Data
  const fetchOverview = useCallback(async () => {
    setIsOverviewLoading(true);
    setOverviewError(null);
    try {
      const res = await apiClient.getAnalyticsOverview({
        timeRange,
        campaignId: selectedCampaignId || undefined,
      });
      if (res.data) {
        setOverview(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load campaign analytics";
      setOverviewError(msg);
    } finally {
      setIsOverviewLoading(false);
    }
  }, [timeRange, selectedCampaignId]);

  // Fetch Delivery Report Data
  const fetchReport = useCallback(async () => {
    setIsReportLoading(true);
    setReportError(null);
    try {
      const res = await apiClient.getDeliveryReport({
        campaignId: selectedCampaignId || undefined,
        status: reportStatus !== "ALL" ? reportStatus : undefined,
        search: reportSearch.trim() || undefined,
        page: reportPage,
        limit: reportLimit,
      });
      if (res.data) {
        setReportData(res.data);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : "Failed to load recipient delivery records";
      setReportError(msg);
    } finally {
      setIsReportLoading(false);
    }
  }, [selectedCampaignId, reportStatus, reportSearch, reportPage]);

  // Initial and reactive fetch triggers
  useEffect(() => {
    fetchOverview();
  }, [fetchOverview]);

  useEffect(() => {
    fetchReport();
  }, [fetchReport]);

  // Refresh all data
  const handleRefreshAll = () => {
    fetchOverview();
    fetchReport();
  };

  // Status badge styling helper
  const renderStatusBadge = (status: string) => {
    switch (status) {
      case "READ":
        return (
          <span
            className="status-badge"
            style={{
              background: "rgba(2, 132, 199, 0.15)",
              color: "#38bdf8",
              border: "1px solid rgba(2, 132, 199, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            <Eye size={12} /> READ
          </span>
        );
      case "DELIVERED":
        return (
          <span
            className="status-badge"
            style={{
              background: "rgba(16, 185, 129, 0.15)",
              color: "#34d399",
              border: "1px solid rgba(16, 185, 129, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            <Check size={12} /> DELIVERED
          </span>
        );
      case "SENT":
      case "ACCEPTED":
        return (
          <span
            className="status-badge"
            style={{
              background: "rgba(99, 102, 241, 0.15)",
              color: "#a5b4fc",
              border: "1px solid rgba(99, 102, 241, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            <Send size={12} /> {status}
          </span>
        );
      case "QUEUED":
      case "SENDING":
      case "SUBMITTED_UNCONFIRMED":
        return (
          <span
            className="status-badge"
            style={{
              background: "rgba(245, 158, 11, 0.15)",
              color: "#fbbf24",
              border: "1px solid rgba(245, 158, 11, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            <Clock size={12} /> {status}
          </span>
        );
      case "FAILED":
        return (
          <span
            className="status-badge"
            style={{
              background: "rgba(244, 63, 94, 0.15)",
              color: "#fb7185",
              border: "1px solid rgba(244, 63, 94, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "0.75rem",
              fontWeight: 600,
            }}
          >
            <XCircle size={12} /> FAILED
          </span>
        );
      default:
        return (
          <span
            className="status-badge"
            style={{
              background: "rgba(148, 163, 184, 0.15)",
              color: "#cbd5e1",
              border: "1px solid rgba(148, 163, 184, 0.3)",
              display: "inline-flex",
              alignItems: "center",
              gap: "4px",
              padding: "2px 8px",
              borderRadius: "4px",
              fontSize: "0.75rem",
            }}
          >
            {status}
          </span>
        );
    }
  };

  const summary = overview?.summary;
  const rates = overview?.rates;
  const scheduling = overview?.scheduling;
  const trends = overview?.trends;
  const deliveryGradId = useId();

  return (
    <div className="analytics-container" data-testid="analytics-page">
      {/* Header Bar */}
      <div className="analytics-header-section">
        <div className="analytics-title-group">
          <h2>
            <BarChart3 size={28} color="var(--accent-emerald)" />
            Customer Campaign Analytics
          </h2>
          <p>
            Real-time delivery verification, engagement rates, and scheduling telemetry across WhatsApp broadcasts
          </p>
        </div>

        <div className="analytics-controls-bar">
          {/* Time Range Pills */}
          <div className="analytics-pill-tabs" role="tablist">
            <button
              className={`analytics-pill-tab ${timeRange === "7d" ? "active" : ""}`}
              onClick={() => setTimeRange("7d")}
              type="button"
            >
              7 Days
            </button>
            <button
              className={`analytics-pill-tab ${timeRange === "30d" ? "active" : ""}`}
              onClick={() => setTimeRange("30d")}
              type="button"
            >
              30 Days
            </button>
            <button
              className={`analytics-pill-tab ${timeRange === "90d" ? "active" : ""}`}
              onClick={() => setTimeRange("90d")}
              type="button"
            >
              90 Days
            </button>
            <button
              className={`analytics-pill-tab ${timeRange === "all" ? "active" : ""}`}
              onClick={() => setTimeRange("all")}
              type="button"
            >
              All Time
            </button>
          </div>

          {/* Campaign Selector Filter */}
          <select
            className="analytics-select"
            value={selectedCampaignId}
            onChange={(e) => {
              setSelectedCampaignId(e.target.value);
              setReportPage(1);
            }}
            aria-label="Filter by campaign"
          >
            <option value="">All Campaigns</option>
            {campaignOptions.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>

          {/* Refresh Action */}
          <button
            className="analytics-btn-refresh"
            onClick={handleRefreshAll}
            disabled={isOverviewLoading || isReportLoading}
            type="button"
          >
            <RefreshCw
              size={14}
              className={isOverviewLoading || isReportLoading ? "spinning" : ""}
            />
            Refresh
          </button>
        </div>
      </div>

      {/* Navigation Sub-Tabs */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: "1rem",
          borderBottom: "1px solid var(--border-subtle)",
          paddingBottom: "0.5rem",
        }}
      >
        <button
          onClick={() => setActiveTab("overview")}
          style={{
            padding: "0.5rem 0.75rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "overview" ? "var(--accent-emerald)" : "var(--text-secondary)",
            borderBottom: activeTab === "overview" ? "2px solid var(--accent-emerald)" : "none",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <Layers size={16} /> Summary & Rates
        </button>
        <button
          onClick={() => setActiveTab("trends")}
          style={{
            padding: "0.5rem 0.75rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "trends" ? "var(--accent-emerald)" : "var(--text-secondary)",
            borderBottom: activeTab === "trends" ? "2px solid var(--accent-emerald)" : "none",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <TrendingUp size={16} /> Trends & Charts
        </button>
        <button
          onClick={() => setActiveTab("scheduling")}
          style={{
            padding: "0.5rem 0.75rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "scheduling" ? "var(--accent-emerald)" : "var(--text-secondary)",
            borderBottom: activeTab === "scheduling" ? "2px solid var(--accent-emerald)" : "none",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <Clock size={16} /> Scheduling & Recovery
        </button>
        <button
          onClick={() => setActiveTab("messages")}
          style={{
            padding: "0.5rem 0.75rem",
            fontSize: "0.9rem",
            fontWeight: 600,
            color: activeTab === "messages" ? "var(--accent-emerald)" : "var(--text-secondary)",
            borderBottom: activeTab === "messages" ? "2px solid var(--accent-emerald)" : "none",
            display: "flex",
            alignItems: "center",
            gap: "0.4rem",
          }}
        >
          <Radio size={16} /> Delivery Report
        </button>
      </div>

      {/* Global Error Banner */}
      {overviewError && (
        <div
          style={{
            padding: "1rem 1.25rem",
            background: "rgba(244, 63, 94, 0.1)",
            border: "1px solid rgba(244, 63, 94, 0.3)",
            borderRadius: "var(--radius-md)",
            color: "#fca5a5",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <AlertCircle size={20} color="var(--accent-rose)" />
            <span>{overviewError}</span>
          </div>
          <button
            onClick={fetchOverview}
            style={{
              padding: "0.35rem 0.75rem",
              background: "rgba(244, 63, 94, 0.2)",
              color: "#fff",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.8rem",
            }}
          >
            Retry
          </button>
        </div>
      )}

      {/* SECTION 1: Performance Rates & Hero Cards */}
      {(activeTab === "overview" || activeTab === "trends") && (
        <>
          <div className="analytics-rates-grid">
            {/* Delivery Rate Card */}
            <div className="analytics-rate-card" data-testid="delivery-rate-card">
              <div className="analytics-rate-card-header">
                <span className="analytics-rate-card-title">Delivery Rate</span>
                <div
                  className="analytics-rate-card-icon"
                  style={{
                    background: "rgba(16, 185, 129, 0.15)",
                    color: "var(--accent-emerald)",
                  }}
                >
                  <CheckCircle2 size={20} />
                </div>
              </div>
              <div>
                <div className="analytics-rate-val" style={{ color: "var(--accent-emerald)" }}>
                  {rates ? `${rates.deliveryRate.rate.toFixed(1)}%` : "0.0%"}
                </div>
                <div className="analytics-rate-meta">
                  <span>
                    {rates ? `${rates.deliveryRate.numerator} / ${rates.deliveryRate.denominator} confirmed` : "0 / 0"}
                  </span>
                  <span title={rates?.deliveryRate.formula}>
                    <Info size={14} style={{ verticalAlign: "middle" }} /> (Delivered+Read)/Dispatched
                  </span>
                </div>
              </div>
              <div className="analytics-rate-bar-track">
                <div
                  className="analytics-rate-bar-fill"
                  style={{
                    width: `${Math.min(100, rates?.deliveryRate.rate || 0)}%`,
                    background: "var(--accent-emerald)",
                  }}
                />
              </div>
            </div>

            {/* Read Rate Card */}
            <div className="analytics-rate-card" data-testid="read-rate-card">
              <div className="analytics-rate-card-header">
                <span className="analytics-rate-card-title">Read Rate</span>
                <div
                  className="analytics-rate-card-icon"
                  style={{
                    background: "rgba(2, 132, 199, 0.15)",
                    color: "#38bdf8",
                  }}
                >
                  <Eye size={20} />
                </div>
              </div>
              <div>
                <div className="analytics-rate-val" style={{ color: "#38bdf8" }}>
                  {rates ? `${rates.readRate.rate.toFixed(1)}%` : "0.0%"}
                </div>
                <div className="analytics-rate-meta">
                  <span>
                    {rates ? `${rates.readRate.numerator} / ${rates.readRate.denominator} read` : "0 / 0"}
                  </span>
                  <span title={rates?.readRate.formula}>
                    <Info size={14} style={{ verticalAlign: "middle" }} /> Read/(Delivered+Read)
                  </span>
                </div>
              </div>
              <div className="analytics-rate-bar-track">
                <div
                  className="analytics-rate-bar-fill"
                  style={{
                    width: `${Math.min(100, rates?.readRate.rate || 0)}%`,
                    background: "#0284c7",
                  }}
                />
              </div>
            </div>

            {/* Failure Rate Card */}
            <div className="analytics-rate-card" data-testid="failure-rate-card">
              <div className="analytics-rate-card-header">
                <span className="analytics-rate-card-title">Failure Rate</span>
                <div
                  className="analytics-rate-card-icon"
                  style={{
                    background: "rgba(244, 63, 94, 0.15)",
                    color: "var(--accent-rose)",
                  }}
                >
                  <AlertTriangle size={20} />
                </div>
              </div>
              <div>
                <div className="analytics-rate-val" style={{ color: "var(--accent-rose)" }}>
                  {rates ? `${rates.failureRate.rate.toFixed(1)}%` : "0.0%"}
                </div>
                <div className="analytics-rate-meta">
                  <span>
                    {rates ? `${rates.failureRate.numerator} / ${rates.failureRate.denominator} failed` : "0 / 0"}
                  </span>
                  <span title={rates?.failureRate.formula}>
                    <Info size={14} style={{ verticalAlign: "middle" }} /> Failed/Attempted
                  </span>
                </div>
              </div>
              <div className="analytics-rate-bar-track">
                <div
                  className="analytics-rate-bar-fill"
                  style={{
                    width: `${Math.min(100, rates?.failureRate.rate || 0)}%`,
                    background: "var(--accent-rose)",
                  }}
                />
              </div>
            </div>

            {/* In-Flight & Intended Volume Card */}
            <div className="analytics-rate-card" data-testid="intended-volume-card">
              <div className="analytics-rate-card-header">
                <span className="analytics-rate-card-title">Intended Recipients</span>
                <div
                  className="analytics-rate-card-icon"
                  style={{
                    background: "rgba(99, 102, 241, 0.15)",
                    color: "var(--accent-indigo)",
                  }}
                >
                  <Send size={20} />
                </div>
              </div>
              <div>
                <div className="analytics-rate-val" style={{ color: "var(--text-primary)" }}>
                  {summary ? summary.totalIntendedRecipients.toLocaleString() : "0"}
                </div>
                <div className="analytics-rate-meta">
                  <span>Pending confirmation:</span>
                  <span style={{ color: "#fbbf24", fontWeight: 600 }}>
                    {summary ? summary.deliveryConfirmationPendingMessages.toLocaleString() : "0"}
                  </span>
                </div>
              </div>
              <div className="analytics-rate-bar-track">
                <div
                  className="analytics-rate-bar-fill"
                  style={{
                    width: `${
                      summary && summary.totalMessages > 0
                        ? Math.min(
                            100,
                            (summary.deliveryConfirmationPendingMessages / summary.totalMessages) * 100
                          )
                        : 0
                    }%`,
                    background: "#f59e0b",
                  }}
                />
              </div>
            </div>
          </div>
        </>
      )}

      {/* SECTION 2: 17 Analytics Summary Cards */}
      {activeTab === "overview" && (
        <div style={{ display: "flex", flexDirection: "column", gap: "2rem" }}>
          {/* Campaign Lifecycle Statuses (9 Metrics) */}
          <div>
            <h3 className="analytics-section-title">
              <Layers size={18} color="var(--accent-emerald)" />
              Campaign Lifecycle Statuses
            </h3>
            <div className="analytics-summary-grid">
              <div className="analytics-metric-card" data-testid="metric-total-campaigns">
                <span className="analytics-metric-label">Total Campaigns</span>
                <span className="analytics-metric-num">{summary?.totalCampaigns ?? 0}</span>
                <span className="analytics-metric-subtext">All campaigns created</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-draft-campaigns">
                <span className="analytics-metric-label">Draft Campaigns</span>
                <span className="analytics-metric-num" style={{ color: "var(--text-secondary)" }}>
                  {summary?.draftCampaigns ?? 0}
                </span>
                <span className="analytics-metric-subtext">Unpublished drafts</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-scheduled-campaigns">
                <span className="analytics-metric-label">Scheduled Campaigns</span>
                <span className="analytics-metric-num" style={{ color: "#38bdf8" }}>
                  {summary?.scheduledCampaigns ?? 0}
                </span>
                <span className="analytics-metric-subtext">Queued for future run</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-queued-campaigns">
                <span className="analytics-metric-label">Queued Campaigns</span>
                <span className="analytics-metric-num" style={{ color: "#fbbf24" }}>
                  {summary?.queuedCampaigns ?? 0}
                </span>
                <span className="analytics-metric-subtext">Awaiting dispatch worker</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-sending-campaigns">
                <span className="analytics-metric-label">Sending Campaigns</span>
                <span className="analytics-metric-num" style={{ color: "#a5b4fc" }}>
                  {summary?.sendingCampaigns ?? 0}
                </span>
                <span className="analytics-metric-subtext">Active message pipeline</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-completed-campaigns">
                <span className="analytics-metric-label">Completed Campaigns</span>
                <span className="analytics-metric-num" style={{ color: "var(--accent-emerald)" }}>
                  {summary?.completedCampaigns ?? 0}
                </span>
                <span className="analytics-metric-subtext">All messages delivered/read</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-completed-issues">
                <span className="analytics-metric-label">Completed with issues</span>
                <span className="analytics-metric-num" style={{ color: "#f59e0b" }}>
                  {summary?.completedWithIssuesCampaigns ?? 0}
                </span>
                <span className="analytics-metric-subtext">Finished with failed messages</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-failed-campaigns">
                <span className="analytics-metric-label">Failed Campaigns</span>
                <span className="analytics-metric-num" style={{ color: "var(--accent-rose)" }}>
                  {summary?.failedCampaigns ?? 0}
                </span>
                <span className="analytics-metric-subtext">Encountered pipeline abort</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-cancelled-campaigns">
                <span className="analytics-metric-label">Cancelled Campaigns</span>
                <span className="analytics-metric-num" style={{ color: "var(--text-muted)" }}>
                  {summary?.cancelledCampaigns ?? 0}
                </span>
                <span className="analytics-metric-subtext">Revoked before run</span>
              </div>
            </div>
          </div>

          {/* Message Delivery Stages (8 Metrics) */}
          <div>
            <h3 className="analytics-section-title">
              <Radio size={18} color="var(--accent-emerald)" />
              Message Delivery Stages & Webhook States
            </h3>
            <div className="analytics-summary-grid">
              <div className="analytics-metric-card" data-testid="metric-intended-recipients">
                <span className="analytics-metric-label">Total Intended Recipients</span>
                <span className="analytics-metric-num">
                  {summary?.totalIntendedRecipients.toLocaleString() ?? 0}
                </span>
                <span className="analytics-metric-subtext">Planned target contacts</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-queued-messages">
                <span className="analytics-metric-label">Queued Messages</span>
                <span className="analytics-metric-num" style={{ color: "var(--text-secondary)" }}>
                  {summary?.queuedMessages.toLocaleString() ?? 0}
                </span>
                <span className="analytics-metric-subtext">Enqueued in worker</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-accepted-messages">
                <span className="analytics-metric-label">Accepted by WhatsApp</span>
                <span className="analytics-metric-num" style={{ color: "#a5b4fc" }}>
                  {summary?.acceptedMessages.toLocaleString() ?? 0}
                </span>
                <span className="analytics-metric-subtext">Meta API accepted WAMID</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-sent-messages">
                <span className="analytics-metric-label">Sent Messages</span>
                <span className="analytics-metric-num" style={{ color: "#60a5fa" }}>
                  {summary?.sentMessages.toLocaleString() ?? 0}
                </span>
                <span className="analytics-metric-subtext">Dispatched to gateway</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-delivered-messages">
                <span className="analytics-metric-label">Delivered Messages</span>
                <span className="analytics-metric-num" style={{ color: "var(--accent-emerald)" }}>
                  {summary?.deliveredMessages.toLocaleString() ?? 0}
                </span>
                <span className="analytics-metric-subtext">Confirmed by handset webhook</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-read-messages">
                <span className="analytics-metric-label">Read Messages</span>
                <span className="analytics-metric-num" style={{ color: "#38bdf8" }}>
                  {summary?.readMessages.toLocaleString() ?? 0}
                </span>
                <span className="analytics-metric-subtext">Opened & read by recipient</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-failed-messages">
                <span className="analytics-metric-label">Failed Messages</span>
                <span className="analytics-metric-num" style={{ color: "var(--accent-rose)" }}>
                  {summary?.failedMessages.toLocaleString() ?? 0}
                </span>
                <span className="analytics-metric-subtext">Rejected or undeliverable</span>
              </div>
              <div className="analytics-metric-card" data-testid="metric-pending-confirmation">
                <span className="analytics-metric-label">Delivery Confirmation Pending</span>
                <span className="analytics-metric-num" style={{ color: "#fbbf24" }}>
                  {summary?.deliveryConfirmationPendingMessages.toLocaleString() ?? 0}
                </span>
                <span className="analytics-metric-subtext">Awaiting final webhook delivery</span>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* SECTION 3: Charts and Visual Trends */}
      {activeTab === "trends" && (
        <div className="analytics-charts-grid">
          {/* Chart 1: Messages Sent vs Delivered vs Read vs Failed Over Time */}
          <div className="analytics-chart-panel" data-testid="chart-message-volume">
            <div className="analytics-chart-header">
              <span className="analytics-chart-title">Message Volume & Delivery Trajectory</span>
              <div className="analytics-chart-legend">
                <span>
                  <span className="analytics-legend-dot" style={{ background: "#60a5fa" }} /> Sent
                </span>
                <span>
                  <span className="analytics-legend-dot" style={{ background: "var(--accent-emerald)" }} /> Delivered
                </span>
                <span>
                  <span className="analytics-legend-dot" style={{ background: "#38bdf8" }} /> Read
                </span>
                <span>
                  <span className="analytics-legend-dot" style={{ background: "var(--accent-rose)" }} /> Failed
                </span>
              </div>
            </div>

            {trends && trends.messageVolumeOverTime.length > 0 && trends.messageVolumeOverTime.some((d) => d.sent + d.delivered + d.read + d.failed > 0) ? (
              <div style={{ height: "240px", width: "100%", position: "relative" }}>
                {/* SVG Area / Bar Visualization */}
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${trends.messageVolumeOverTime.length * 40 + 40} 220`}
                  preserveAspectRatio="none"
                  style={{ overflow: "visible" }}
                >
                  <defs>
                    <linearGradient id={deliveryGradId} x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="var(--accent-emerald)" stopOpacity="0.3" />
                      <stop offset="100%" stopColor="var(--accent-emerald)" stopOpacity="0.0" />
                    </linearGradient>
                  </defs>

                  {/* Horizontal grid lines */}
                  <line x1="0" y1="40" x2="100%" y2="40" stroke="rgba(255,255,255,0.05)" />
                  <line x1="0" y1="100" x2="100%" y2="100" stroke="rgba(255,255,255,0.05)" />
                  <line x1="0" y1="160" x2="100%" y2="160" stroke="rgba(255,255,255,0.05)" />

                  {/* Daily bars */}
                  {(() => {
                    const maxVal = Math.max(
                      1,
                      ...trends.messageVolumeOverTime.map((d) => Math.max(d.sent, d.delivered, d.read, d.failed))
                    );
                    return trends.messageVolumeOverTime.map((item, idx) => {
                      const x = idx * 40 + 20;
                      const hDeliv = Math.round((item.delivered / maxVal) * 150);
                      const hRead = Math.round((item.read / maxVal) * 150);
                      const hFailed = Math.round((item.failed / maxVal) * 150);
                      const hSent = Math.round((item.sent / maxVal) * 150);

                      return (
                        <g key={item.date} className="chart-bar-group">
                          {/* Delivered bar */}
                          <rect
                            x={x}
                            y={190 - hDeliv}
                            width="8"
                            height={hDeliv}
                            fill="var(--accent-emerald)"
                            rx="2"
                            opacity="0.85"
                          />
                          {/* Read bar */}
                          <rect
                            x={x + 9}
                            y={190 - hRead}
                            width="8"
                            height={hRead}
                            fill="#38bdf8"
                            rx="2"
                            opacity="0.9"
                          />
                          {/* Sent bar */}
                          <rect
                            x={x - 9}
                            y={190 - hSent}
                            width="8"
                            height={hSent}
                            fill="#60a5fa"
                            rx="2"
                            opacity="0.5"
                          />
                          {/* Failed bar */}
                          {item.failed > 0 && (
                            <rect
                              x={x + 18}
                              y={190 - hFailed}
                              width="6"
                              height={hFailed}
                              fill="var(--accent-rose)"
                              rx="2"
                            />
                          )}
                          {/* Date label */}
                          {idx % Math.ceil(trends.messageVolumeOverTime.length / 8) === 0 && (
                            <text
                              x={x}
                              y="210"
                              fill="var(--text-muted)"
                              fontSize="10"
                              textAnchor="middle"
                            >
                              {item.date.slice(5)}
                            </text>
                          )}
                        </g>
                      );
                    });
                  })()}
                </svg>
              </div>
            ) : (
              <div className="analytics-empty-state">
                <BarChart3 size={32} className="analytics-empty-state-icon" />
                <p>No message dispatches recorded in this date range</p>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Select "All Time" or launch a campaign to populate timeline metrics
                </span>
              </div>
            )}
          </div>

          {/* Chart 2: Delivery & Read Rates Over Time */}
          <div className="analytics-chart-panel" data-testid="chart-rates-trend">
            <div className="analytics-chart-header">
              <span className="analytics-chart-title">Delivery & Read Rates Trend</span>
              <div className="analytics-chart-legend">
                <span>
                  <span className="analytics-legend-dot" style={{ background: "var(--accent-emerald)" }} /> Delivery %
                </span>
                <span>
                  <span className="analytics-legend-dot" style={{ background: "#38bdf8" }} /> Read %
                </span>
              </div>
            </div>

            {trends && trends.ratesOverTime.length > 0 && trends.ratesOverTime.some((r) => r.deliveryRate > 0 || r.readRate > 0) ? (
              <div style={{ height: "240px", width: "100%", position: "relative" }}>
                <svg
                  width="100%"
                  height="100%"
                  viewBox={`0 0 ${trends.ratesOverTime.length * 40 + 40} 220`}
                  preserveAspectRatio="none"
                  style={{ overflow: "visible" }}
                >
                  {/* Grid Lines */}
                  <line x1="0" y1="20" x2="100%" y2="20" stroke="rgba(255,255,255,0.05)" />
                  <text x="5" y="24" fill="var(--text-muted)" fontSize="9">100%</text>
                  <line x1="0" y1="105" x2="100%" y2="105" stroke="rgba(255,255,255,0.05)" />
                  <text x="5" y="109" fill="var(--text-muted)" fontSize="9">50%</text>
                  <line x1="0" y1="190" x2="100%" y2="190" stroke="rgba(255,255,255,0.05)" />
                  <text x="5" y="194" fill="var(--text-muted)" fontSize="9">0%</text>

                  {/* Delivery Rate Path */}
                  {(() => {
                    const points = trends.ratesOverTime.map((d, i) => {
                      const x = i * 40 + 20;
                      const y = 190 - (d.deliveryRate / 100) * 170;
                      return `${x},${y}`;
                    });
                    const readPoints = trends.ratesOverTime.map((d, i) => {
                      const x = i * 40 + 20;
                      const y = 190 - (d.readRate / 100) * 170;
                      return `${x},${y}`;
                    });

                    return (
                      <>
                        <polyline
                          fill="none"
                          stroke="var(--accent-emerald)"
                          strokeWidth="2.5"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={points.join(" ")}
                        />
                        <polyline
                          fill="none"
                          stroke="#38bdf8"
                          strokeWidth="2"
                          strokeDasharray="4 4"
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          points={readPoints.join(" ")}
                        />
                      </>
                    );
                  })()}
                </svg>
              </div>
            ) : (
              <div className="analytics-empty-state">
                <TrendingUp size={32} className="analytics-empty-state-icon" />
                <p>No rate trends available for this period</p>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  Confirmed webhooks will automatically calculate conversion curves
                </span>
              </div>
            )}
          </div>

          {/* Chart 3: Campaign Status Distribution */}
          <div className="analytics-chart-panel" data-testid="chart-status-distribution">
            <div className="analytics-chart-header">
              <span className="analytics-chart-title">Campaign Status Distribution</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Total: {summary?.totalCampaigns ?? 0}
              </span>
            </div>

            {trends && trends.campaignStatusDistribution.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>
                {trends.campaignStatusDistribution.map((item) => (
                  <div key={item.status} style={{ display: "flex", flexDirection: "column", gap: "0.3rem" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: "0.85rem" }}>
                      <span style={{ color: "var(--text-secondary)" }}>{item.label}</span>
                      <span style={{ fontWeight: 600, color: "var(--text-primary)" }}>
                        {item.count} ({item.percentage}%)
                      </span>
                    </div>
                    <div
                      style={{
                        height: "6px",
                        background: "rgba(255, 255, 255, 0.08)",
                        borderRadius: "var(--radius-full)",
                        overflow: "hidden",
                      }}
                    >
                      <div
                        style={{
                          height: "100%",
                          width: `${item.percentage}%`,
                          background:
                            item.status === "COMPLETED"
                              ? "var(--accent-emerald)"
                              : item.status === "COMPLETED_WITH_ISSUES"
                              ? "#f59e0b"
                              : item.status === "FAILED"
                              ? "var(--accent-rose)"
                              : item.status === "SCHEDULED"
                              ? "#38bdf8"
                              : "var(--accent-indigo)",
                          borderRadius: "var(--radius-full)",
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="analytics-empty-state">
                <Layers size={32} className="analytics-empty-state-icon" />
                <p>No campaigns found</p>
              </div>
            )}
          </div>

          {/* Chart 4: Failure Reasons Breakdown */}
          <div className="analytics-chart-panel" data-testid="chart-failure-reasons">
            <div className="analytics-chart-header">
              <span className="analytics-chart-title">Top Delivery Failure Reasons</span>
              <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Sanitized Diagnostics
              </span>
            </div>

            {trends && trends.failureReasonsDistribution.length > 0 ? (
              <div style={{ display: "flex", flexDirection: "column", gap: "0.85rem", marginTop: "0.5rem" }}>
                {trends.failureReasonsDistribution.map((item) => (
                  <div
                    key={`${item.code}-${item.reason}`}
                    style={{
                      padding: "0.75rem",
                      background: "rgba(244, 63, 94, 0.05)",
                      border: "1px solid rgba(244, 63, 94, 0.2)",
                      borderRadius: "var(--radius-sm)",
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        alignItems: "center",
                        justifyContent: "space-between",
                        marginBottom: "0.35rem",
                      }}
                    >
                      <span
                        style={{
                          fontSize: "0.8rem",
                          fontWeight: 700,
                          color: "var(--accent-rose)",
                          fontFamily: "monospace",
                        }}
                      >
                        Code: {item.code}
                      </span>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        {item.count} occurrences ({item.percentage}%)
                      </span>
                    </div>
                    <div style={{ fontSize: "0.8rem", color: "var(--text-secondary)" }}>
                      {item.reason}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="analytics-empty-state">
                <CheckCircle2 size={32} color="var(--accent-emerald)" className="analytics-empty-state-icon" />
                <p style={{ color: "var(--accent-emerald)" }}>Zero Delivery Failures</p>
                <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                  No error codes or terminal bounces detected in this range
                </span>
              </div>
            )}
          </div>
        </div>
      )}

      {/* SECTION 4: Scheduling & Restart-Recovery Analytics */}
      {activeTab === "scheduling" && (
        <div className="analytics-scheduling-panel" data-testid="scheduling-panel">
          <div>
            <h3 className="analytics-section-title">
              <Clock size={20} color="#38bdf8" />
              Scheduling Dispatch & Temporal Integrity
            </h3>
            <p style={{ fontSize: "0.85rem", color: "var(--text-secondary)" }}>
              Monitoring scheduled broadcast triggers, queue dispatch latencies, and backend reconciliation
            </p>
          </div>

          <div className="analytics-scheduling-grid">
            {/* Upcoming Schedules */}
            <div className="analytics-sched-card">
              <h4>
                <Calendar size={16} color="#38bdf8" />
                Upcoming Scheduled Campaigns ({scheduling?.upcomingCount ?? 0})
              </h4>
              {scheduling && scheduling.upcomingCampaigns.length > 0 ? (
                <div className="analytics-sched-list">
                  {scheduling.upcomingCampaigns.map((c) => (
                    <div key={c.id} className="analytics-sched-item">
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Recipients: {c.totalRecipients.toLocaleString()}
                        </div>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#38bdf8", fontWeight: 500 }}>
                        {new Date(c.scheduledAt).toLocaleString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "1rem 0" }}>
                  No upcoming scheduled campaigns waiting for future dispatch.
                </div>
              )}
            </div>

            {/* Overdue Schedules */}
            <div className="analytics-sched-card">
              <h4>
                <AlertTriangle size={16} color="#f59e0b" />
                Overdue Scheduled Campaigns ({scheduling?.overdueCount ?? 0})
              </h4>
              {scheduling && scheduling.overdueCampaigns.length > 0 ? (
                <div className="analytics-sched-list">
                  {scheduling.overdueCampaigns.map((c) => (
                    <div key={c.id} className="analytics-sched-item" style={{ borderColor: "rgba(245, 158, 11, 0.3)" }}>
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "#fbbf24" }}>
                          Overdue by {c.delayMinutes} min
                        </div>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                        Due: {new Date(c.scheduledAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "1rem 0" }}>
                  All scheduled broadcasts have been dispatched on time. Zero overdue campaigns.
                </div>
              )}
            </div>

            {/* Dispatched Late */}
            <div className="analytics-sched-card">
              <h4>
                <ArrowUpRight size={16} color="var(--accent-indigo)" />
                Dispatched Late ({scheduling?.dispatchedLateCount ?? 0})
              </h4>
              {scheduling && scheduling.dispatchedLateCampaigns.length > 0 ? (
                <div className="analytics-sched-list">
                  {scheduling.dispatchedLateCampaigns.map((c) => (
                    <div key={c.id} className="analytics-sched-item">
                      <div>
                        <div style={{ fontWeight: 600, color: "var(--text-primary)" }}>{c.name}</div>
                        <div style={{ fontSize: "0.75rem", color: "var(--text-muted)" }}>
                          Started {c.latencySeconds}s after scheduled time
                        </div>
                      </div>
                      <span style={{ fontSize: "0.75rem", color: "#a5b4fc" }}>
                        {new Date(c.startedAt).toLocaleTimeString()}
                      </span>
                    </div>
                  ))}
                </div>
              ) : (
                <div style={{ fontSize: "0.85rem", color: "var(--text-muted)", padding: "1rem 0" }}>
                  Zero campaigns dispatched with significant schedule deviation (&gt;2m).
                </div>
              )}
            </div>
          </div>

          {/* Schedule Comparisons Table */}
          {scheduling && scheduling.comparisons.length > 0 && (
            <div style={{ marginTop: "1rem" }}>
              <h4 style={{ fontSize: "0.95rem", fontWeight: 600, marginBottom: "0.75rem" }}>
                Scheduled vs Actual Dispatch Comparison
              </h4>
              <div className="analytics-table-container">
                <table className="analytics-report-table">
                  <thead>
                    <tr>
                      <th>Campaign</th>
                      <th>Status</th>
                      <th>Scheduled Time</th>
                      <th>Actual Dispatch Time</th>
                      <th>Latency</th>
                    </tr>
                  </thead>
                  <tbody>
                    {scheduling.comparisons.map((c) => (
                      <tr key={c.id}>
                        <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>{c.name}</td>
                        <td>{renderStatusBadge(c.status)}</td>
                        <td>{new Date(c.scheduledAt).toLocaleString()}</td>
                        <td>
                          {c.startedAt ? (
                            new Date(c.startedAt).toLocaleString()
                          ) : (
                            <span style={{ color: "var(--text-muted)" }}>Not started</span>
                          )}
                        </td>
                        <td>
                          {c.latencySeconds !== null ? (
                            <span
                              style={{
                                color:
                                  c.latencySeconds > 120
                                    ? "var(--accent-rose)"
                                    : c.latencySeconds > 30
                                    ? "#fbbf24"
                                    : "var(--accent-emerald)",
                                fontWeight: 600,
                              }}
                            >
                              {c.latencySeconds > 0 ? `+${c.latencySeconds}s` : `${c.latencySeconds}s`}
                            </span>
                          ) : (
                            "—"
                          )}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {/* Honest Restart-Recovery Disclosure Banner */}
          <div className="analytics-recovery-banner" data-testid="recovery-telemetry-box">
            <div className="analytics-recovery-title">
              <Database size={18} />
              Backend Restart-Recovery Telemetry: Status Unavailable (Logged to Runtime Stdout Only)
            </div>
            <div className="analytics-recovery-desc">
              {scheduling?.restartRecovery.reason ||
                "Historical process restarts and in-flight job reconciliation events are currently logged as ephemeral operational events in application stdout/runtime logs and are not persisted as database event records."}
            </div>
            <div style={{ fontSize: "0.8rem", fontWeight: 600, color: "var(--text-secondary)", marginTop: "0.25rem" }}>
              Additive Telemetry Architecture Proposal:
            </div>
            <div className="analytics-recovery-proposal">
              {scheduling?.restartRecovery.additiveDesignProposal}
            </div>
          </div>
        </div>
      )}

      {/* SECTION 5: Recipient-Level Delivery Report */}
      {activeTab === "messages" && (
        <div className="analytics-table-wrapper" data-testid="delivery-report-section">
          <div className="analytics-filter-row">
            <div>
              <h3 className="analytics-section-title" style={{ marginBottom: "0.25rem" }}>
                <ShieldCheck size={20} color="var(--accent-emerald)" />
                Recipient-Level Message Delivery Report
              </h3>
              <p style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                Audited message states, webhook confirmations, and privacy-shielded recipient numbers
              </p>
            </div>

            <div style={{ display: "flex", flexWrap: "wrap", alignItems: "center", gap: "0.75rem" }}>
              {/* Search by phone or campaign */}
              <div style={{ position: "relative" }}>
                <Search
                  size={14}
                  style={{
                    position: "absolute",
                    left: "10px",
                    top: "50%",
                    transform: "translateY(-50%)",
                    color: "var(--text-muted)",
                  }}
                />
                <input
                  type="text"
                  className="analytics-search-input"
                  style={{ paddingLeft: "30px" }}
                  placeholder="Search recipient phone or campaign..."
                  value={reportSearch}
                  onChange={(e) => {
                    setReportSearch(e.target.value);
                    setReportPage(1);
                  }}
                />
              </div>

              {/* Status Filter */}
              <select
                className="analytics-select"
                value={reportStatus}
                onChange={(e) => {
                  setReportStatus(e.target.value);
                  setReportPage(1);
                }}
                aria-label="Filter report by message status"
              >
                <option value="ALL">All Statuses</option>
                <option value="READ">Read</option>
                <option value="DELIVERED">Delivered</option>
                <option value="SENT">Sent</option>
                <option value="ACCEPTED">Accepted</option>
                <option value="QUEUED">Queued</option>
                <option value="SENDING">Sending</option>
                <option value="FAILED">Failed</option>
              </select>
            </div>
          </div>

          {/* Privacy Notice Badge */}
          <div
            style={{
              display: "inline-flex",
              alignItems: "center",
              gap: "6px",
              padding: "4px 10px",
              background: "rgba(16, 185, 129, 0.08)",
              border: "1px solid rgba(16, 185, 129, 0.2)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              color: "var(--accent-emerald-light)",
              width: "fit-content",
            }}
          >
            <ShieldCheck size={14} />
            <span>End-user privacy enforced: Recipient phone numbers are masked by default.</span>
          </div>

          {reportError && (
            <div
              style={{
                padding: "0.75rem 1rem",
                background: "rgba(244, 63, 94, 0.1)",
                border: "1px solid rgba(244, 63, 94, 0.3)",
                borderRadius: "var(--radius-sm)",
                color: "#fca5a5",
                fontSize: "0.85rem",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <AlertCircle size={16} color="var(--accent-rose)" />
              <span>{reportError}</span>
            </div>
          )}

          {/* Report Data Table */}
          <div className="analytics-table-container">
            <table className="analytics-report-table">
              <thead>
                <tr>
                  <th>Campaign</th>
                  <th>Recipient Phone</th>
                  <th>Template</th>
                  <th>Status</th>
                  <th>Dispatched</th>
                  <th>Delivered / Read</th>
                  <th>Attempts</th>
                  <th>Diagnostics</th>
                </tr>
              </thead>
              <tbody>
                {isReportLoading ? (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "2.5rem 0" }}>
                      <RefreshCw size={24} className="spinning" style={{ margin: "0 auto", color: "var(--accent-emerald)" }} />
                      <div style={{ marginTop: "0.5rem", color: "var(--text-muted)" }}>
                        Loading message delivery records...
                      </div>
                    </td>
                  </tr>
                ) : reportData && reportData.items.length > 0 ? (
                  reportData.items.map((item) => (
                    <tr key={item.id}>
                      <td style={{ fontWeight: 500, color: "var(--text-primary)" }}>
                        {item.campaignName}
                      </td>
                      <td style={{ fontFamily: "monospace", letterSpacing: "0.05em" }}>
                        {item.recipientPhoneMasked}
                      </td>
                      <td>
                        <span style={{ color: "var(--text-secondary)" }}>{item.templateName}</span>
                        <span style={{ fontSize: "0.7rem", color: "var(--text-muted)", marginLeft: "4px" }}>
                          ({item.templateLanguage})
                        </span>
                      </td>
                      <td>{renderStatusBadge(item.status)}</td>
                      <td>
                        {item.dispatchedAt ? (
                          new Date(item.dispatchedAt).toLocaleTimeString()
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>—</span>
                        )}
                      </td>
                      <td>
                        {item.readAt ? (
                          <span style={{ color: "#38bdf8" }}>
                            Read {new Date(item.readAt).toLocaleTimeString()}
                          </span>
                        ) : item.deliveredAt ? (
                          <span style={{ color: "var(--accent-emerald)" }}>
                            Deliv {new Date(item.deliveredAt).toLocaleTimeString()}
                          </span>
                        ) : (
                          <span style={{ color: "var(--text-muted)" }}>Pending</span>
                        )}
                      </td>
                      <td style={{ textAlign: "center" }}>{item.attemptCount}</td>
                      <td>
                        {item.status === "FAILED" ? (
                          <div style={{ fontSize: "0.75rem", color: "var(--accent-rose)", maxWidth: "260px" }}>
                            <strong>{item.errorCode || "FAILURE"}:</strong> {item.errorMessage}
                          </div>
                        ) : (
                          <span style={{ color: "var(--text-muted)", fontSize: "0.75rem" }}>None</span>
                        )}
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td colSpan={8} style={{ textAlign: "center", padding: "3rem 0" }}>
                      <div className="analytics-empty-state">
                        <Radio size={28} className="analytics-empty-state-icon" />
                        <p>No recipient message records found</p>
                        <span style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}>
                          Try adjusting search terms, campaign filters, or status options
                        </span>
                      </div>
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>

          {/* Pagination Controls */}
          {reportData && reportData.totalPages > 1 && (
            <div className="analytics-pagination-bar">
              <span>
                Showing page {reportData.page} of {reportData.totalPages} ({reportData.total} total records)
              </span>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                <button
                  className="analytics-pagination-btn"
                  onClick={() => setReportPage((p) => Math.max(1, p - 1))}
                  disabled={reportPage <= 1 || isReportLoading}
                >
                  <ChevronLeft size={14} style={{ verticalAlign: "middle" }} /> Prev
                </button>
                <button
                  className="analytics-pagination-btn"
                  onClick={() => setReportPage((p) => Math.min(reportData.totalPages, p + 1))}
                  disabled={reportPage >= reportData.totalPages || isReportLoading}
                >
                  Next <ChevronRight size={14} style={{ verticalAlign: "middle" }} />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
};
