import React from "react";
import {
  Plus,
  Search,
  Send,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  Radio,
  FileEdit,
  AlertCircle,
  Copy,
  Trash2,
  Eye,
  RefreshCw,
  Edit3,
  ChevronLeft,
  ChevronRight,
  Ban,
  XCircle,
} from "lucide-react";
import { Campaign, CampaignMetrics, CampaignPagination, CampaignStatus } from "../types/campaign.js";
import { getCustomerCampaignStatus } from "../utils/campaignStatus.js";
import { formatInBusinessTimezone } from "../utils/timezone.js";

interface CampaignListProps {
  campaigns: Campaign[];
  metrics: CampaignMetrics;
  pagination: CampaignPagination;
  onPageChange: (page: number) => void;
  onLimitChange: (limit: number) => void;
  isLoading: boolean;
  error: string | null;
  searchTerm: string;
  onSearchChange: (search: string) => void;
  statusFilter: string;
  onStatusFilterChange: (status: string) => void;
  onRefresh: () => void;
  onCreateCampaign: () => void;
  onEditCampaign: (campaign: Campaign) => void;
  onDuplicateCampaign: (campaign: Campaign) => void;
  onViewDetails: (campaign: Campaign) => void;
  onDeleteCampaign: (campaign: Campaign) => void;
  onLaunchCampaign: (campaign: Campaign) => void;
  onRetryQueue: (campaign: Campaign) => void;
  onCancelCampaign?: (campaign: Campaign) => void;
}

export const CampaignList: React.FC<CampaignListProps> = ({
  campaigns,
  metrics,
  pagination,
  onPageChange,
  onLimitChange,
  isLoading,
  error,
  searchTerm,
  onSearchChange,
  statusFilter,
  onStatusFilterChange,
  onRefresh,
  onCreateCampaign,
  onEditCampaign,
  onDuplicateCampaign,
  onViewDetails,
  onDeleteCampaign,
  onLaunchCampaign,
  onRetryQueue,
  onCancelCampaign,
}) => {
  const getStatusBadge = (statusOrCampaign: CampaignStatus | Campaign) => {
    const item: Campaign =
      typeof statusOrCampaign === "string"
        ? ({ status: statusOrCampaign } as Campaign)
        : statusOrCampaign;
    const statusMeta = getCustomerCampaignStatus(item);

    return (
      <div style={{ display: "inline-flex", flexDirection: "column", gap: "0.2rem" }}>
        <span
          className={`status-pill ${
            item.status === "COMPLETED"
              ? statusMeta.label === "Completed with issues"
                ? "status-pending"
                : statusMeta.label === "Delivery confirmation pending"
                ? "status-pending"
                : statusMeta.label === "Failed"
                ? "status-rejected"
                : "status-approved"
              : item.status === "FAILED" || statusMeta.label === "Failed"
              ? "status-rejected"
              : item.status === "SENDING"
              ? "status-active"
              : item.status === "QUEUED"
              ? "status-queued"
              : item.status === "SCHEDULED"
              ? statusMeta.isOverdue
                ? "status-overdue"
                : "status-pending"
              : item.status === "CANCELLED"
              ? "status-cancelled"
              : "status-draft"
          }`}
          style={
            statusMeta.label === "Completed with issues"
              ? {
                  background: "rgba(249, 115, 22, 0.15)",
                  color: "#fb923c",
                  border: "1px solid rgba(249, 115, 22, 0.35)",
                }
              : statusMeta.label === "Delivery confirmation pending"
              ? {
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                }
              : statusMeta.isOverdue
              ? {
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                }
              : statusMeta.label === "Changes Requested"
              ? {
                  background: "rgba(244, 63, 94, 0.15)",
                  color: "#fb7185",
                  border: "1px solid rgba(244, 63, 94, 0.35)",
                }
              : statusMeta.label === "Pending Admin Approval"
              ? {
                  background: "rgba(245, 158, 11, 0.15)",
                  color: "#fbbf24",
                  border: "1px solid rgba(245, 158, 11, 0.35)",
                }
              : item.status === "CANCELLED"
              ? {
                  background: "rgba(113, 113, 122, 0.15)",
                  color: "#a1a1aa",
                  border: "1px solid rgba(113, 113, 122, 0.35)",
                }
              : undefined
          }
        >
          {statusMeta.label === "Changes Requested" && <XCircle size={12} />}
          {statusMeta.label === "Pending Admin Approval" && <Clock size={12} />}
          {(item.status === "COMPLETED" || item.status === "FAILED") &&
            statusMeta.label !== "Changes Requested" &&
            statusMeta.label !== "Pending Admin Approval" && (
            statusMeta.label === "Completed with issues" ? (
              <AlertCircle size={12} />
            ) : statusMeta.label === "Delivery confirmation pending" ? (
              <Clock size={12} />
            ) : statusMeta.label === "Failed" ? (
              <AlertCircle size={12} />
            ) : (
              <CheckCircle2 size={12} />
            )
          )}
          {item.status === "SENDING" && <Radio size={12} className="pulsing" />}
          {item.status === "QUEUED" && <Clock size={12} />}
          {item.status === "SCHEDULED" && <Clock size={12} />}
          {item.status === "DRAFT" && statusMeta.label !== "Changes Requested" && statusMeta.label !== "Pending Admin Approval" && <FileEdit size={12} />}
          {item.status === "CANCELLED" && <XCircle size={12} />}
          <span>{statusMeta.label}</span>
        </span>
        {item.status === "SCHEDULED" && item.scheduledAt && !statusMeta.isOverdue && (
          <span
            style={{
              fontSize: "0.72rem",
              color: "#a78bfa",
              fontWeight: 500,
              display: "flex",
              alignItems: "center",
              gap: "0.25rem",
            }}
          >
            Scheduled for {formatInBusinessTimezone(item.scheduledAt)}
          </span>
        )}
      </div>
    );
  };

  return (
    <div className="campaign-list-wrapper">
      {/* 1. Header Row */}
      <div className="list-top-bar">
        <div>
          <div className="title-with-badge">
            <h2 className="list-title">WhatsApp Campaigns</h2>
          </div>
          <p className="list-subtitle">
            Create, manage, and inspect WhatsApp marketing drafts and broadcast campaigns.
          </p>
        </div>

        <div className="list-top-actions">
          <button
            type="button"
            className="btn-secondary"
            onClick={onRefresh}
            disabled={isLoading}
            title="Refresh campaigns list"
            aria-label="Refresh campaigns"
          >
            <RefreshCw size={14} className={isLoading ? "spinning" : ""} />
            <span className="btn-text-hide-mobile">Refresh</span>
          </button>

          <button
            type="button"
            className="btn-primary"
            onClick={onCreateCampaign}
            id="campaigns-create-btn"
          >
            <Plus size={16} />
            <span>Create Campaign</span>
          </button>
        </div>
      </div>

      {/* 2. Compact Metrics Bar */}
      <div className="campaign-metrics-row">
        <div className="campaign-metric-box">
          <span className="metric-box-label">Total Campaigns</span>
          <span className="metric-box-val">{metrics.total}</span>
        </div>
        <div className="campaign-metric-box">
          <span className="metric-box-label">Drafts</span>
          <span className="metric-box-val" style={{ color: "var(--accent-amber)" }}>
            {metrics.draft}
          </span>
        </div>
        <div className="campaign-metric-box">
          <span className="metric-box-label">Scheduled</span>
          <span className="metric-box-val" style={{ color: "#38bdf8" }}>
            {metrics.scheduled}
          </span>
        </div>
        <div className="campaign-metric-box">
          <span className="metric-box-label">Sending</span>
          <span className="metric-box-val" style={{ color: "var(--accent-indigo-light)" }}>
            {metrics.sending}
          </span>
        </div>
        <div className="campaign-metric-box">
          <span className="metric-box-label">Completed</span>
          <span className="metric-box-val" style={{ color: "var(--accent-emerald-light)" }}>
            {metrics.completed}
          </span>
        </div>
      </div>

      {/* 3. Search and Status Filter Bar */}
      <div className="filter-controls-bar">
        <div className="search-input-wrap">
          <Search size={16} className="search-icon" />
          <input
            type="text"
            className="search-input"
            placeholder="Search campaigns by name or template..."
            value={searchTerm}
            onChange={(e) => onSearchChange(e.target.value)}
            aria-label="Search campaigns"
          />
        </div>

        <div className="filter-select-group">
          <select
            className="filter-select"
            value={statusFilter}
            onChange={(e) => onStatusFilterChange(e.target.value)}
            aria-label="Filter by campaign status"
          >
            <option value="ALL">All Statuses</option>
            <option value="DRAFT">Draft</option>
            <option value="SCHEDULED">Scheduled</option>
            <option value="QUEUED">Queued</option>
            <option value="SENDING">Sending</option>
            <option value="COMPLETED">Completed</option>
            <option value="FAILED">Failed</option>
          </select>
        </div>
      </div>

      {/* 4. Main Body: Loading, Error, Empty, or Table */}
      {isLoading && (
        <div className="loading-state-card">
          <RefreshCw size={28} className="spinning" color="var(--accent-emerald)" />
          <p>Loading campaigns from workspace database...</p>
        </div>
      )}

      {!isLoading && error && (
        <div className="error-state-card">
          <AlertCircle size={32} color="var(--accent-rose)" />
          <h4>Failed to Load Campaigns</h4>
          <p>{error}</p>
          <button type="button" className="btn-secondary" onClick={onRefresh}>
            <RefreshCw size={14} />
            <span>Try Again</span>
          </button>
        </div>
      )}

      {!isLoading && !error && campaigns.length === 0 && (
        <div className="empty-campaigns-card">
          <Send size={44} color="var(--text-muted)" />
          <h4>No campaigns found</h4>
          <p>
            {searchTerm || statusFilter !== "ALL"
              ? "No campaigns match your current search or status filter. Try clearing filters."
              : "You haven't created any campaigns yet. Start drafting a personalized WhatsApp broadcast using pre-approved templates."}
          </p>
          <button
            type="button"
            className="btn-primary"
            onClick={onCreateCampaign}
            id="empty-create-campaign-btn"
          >
            <Plus size={15} />
            <span>Draft First Campaign</span>
          </button>
        </div>
      )}

      {!isLoading && !error && campaigns.length > 0 && (
        <>
          {/* Desktop Table View (>= 768px) */}
          <div className="campaigns-table-wrapper">
            <table className="campaigns-table">
              <thead>
                <tr>
                  <th scope="col">Campaign Name</th>
                  <th scope="col">Template Snapshot</th>
                  <th scope="col">Audience</th>
                  <th scope="col">Recipients</th>
                  <th scope="col">Status</th>
                  <th scope="col">Created Date</th>
                  <th scope="col" style={{ textAlign: "right" }}>
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody>
                {campaigns.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div className="campaign-name-cell">
                        <Send size={14} className="cell-icon" />
                        <div>
                          <span className="campaign-name-text">{item.name}</span>
                          {item.description && (
                            <span className="campaign-table-desc-sub">{item.description}</span>
                          )}
                        </div>
                      </div>
                    </td>
                    <td>
                      <span className="template-link-text">{item.templateName}</span>
                    </td>
                    <td>
                      <div className="audience-cell-wrap">
                        <span>{item.audienceName}</span>
                        {item.audienceType === "CONTACT_LIST" && (
                          <span
                            className="status-sub-pill"
                            style={{
                              background: "rgba(16, 185, 129, 0.15)",
                              color: "var(--accent-emerald)",
                              fontWeight: 600,
                              fontSize: "0.68rem",
                              padding: "0.15rem 0.45rem",
                              borderRadius: "var(--radius-full)",
                            }}
                          >
                            VERIFIED LIST
                          </span>
                        )}
                      </div>
                    </td>
                    <td>
                      <div className="cell-inline-icon">
                        <Users size={13} />
                        <span className="sent-count-num">{item.totalRecipients.toLocaleString()}</span>
                      </div>
                    </td>
                    <td>{getStatusBadge(item)}</td>
                    <td>
                      <div className="cell-inline-icon text-muted">
                        <Calendar size={13} />
                        <span>{new Date(item.createdAt).toLocaleDateString()}</span>
                      </div>
                    </td>
                    <td>
                      <div className="table-actions-cell">
                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => onViewDetails(item)}
                          title="View campaign details"
                          aria-label={`View details for ${item.name}`}
                        >
                          <Eye size={14} />
                        </button>

                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={() => onDuplicateCampaign(item)}
                          title="Duplicate draft"
                          aria-label={`Duplicate ${item.name}`}
                        >
                          <Copy size={14} />
                        </button>

                        {(item.status === "DRAFT" || item.status === "SCHEDULED") && (
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => onEditCampaign(item)}
                            title={item.status === "SCHEDULED" ? "Edit scheduled campaign" : "Edit draft"}
                            aria-label={`Edit ${item.name}`}
                          >
                            <Edit3 size={14} />
                          </button>
                        )}

                        {item.status === "SCHEDULED" && onCancelCampaign && (
                          <button
                            type="button"
                            className="btn-table-action action-danger"
                            onClick={() => onCancelCampaign(item)}
                            title="Cancel scheduled campaign"
                            aria-label={`Cancel ${item.name}`}
                            id={`cancel-campaign-btn-${item.id}`}
                          >
                            <Ban size={14} />
                          </button>
                        )}

                        {item.status === "DRAFT" && item.approvalStatus !== "PENDING" && item.approvalStatus !== "REJECTED" && (
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => onLaunchCampaign(item)}
                            title="Review & Launch campaign"
                            aria-label={`Launch ${item.name}`}
                            id={`launch-btn-${item.id}`}
                          >
                            <Send size={14} />
                          </button>
                        )}

                        {(item.status === "QUEUED" || item.status === "SENDING") && (
                          <button
                            type="button"
                            className="btn-table-action"
                            onClick={() => onRetryQueue(item)}
                            title="Retry queue"
                            aria-label={`Retry queue for ${item.name}`}
                            id={`retry-queue-btn-${item.id}`}
                          >
                            <RefreshCw size={14} />
                          </button>
                        )}

                        {item.status === "DRAFT" && (
                          <button
                            type="button"
                            className="btn-table-action action-danger"
                            onClick={() => onDeleteCampaign(item)}
                            title="Delete draft"
                            aria-label={`Delete ${item.name}`}
                          >
                            <Trash2 size={14} />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack View (< 768px) */}
          <div className="campaigns-mobile-cards">
            {campaigns.map((item) => (
              <div key={item.id} className="campaign-mobile-card">
                <div className="mobile-card-top">
                  <span className="campaign-mobile-title">{item.name}</span>
                  {getStatusBadge(item)}
                </div>

                {item.description && (
                  <p className="mobile-card-desc">{item.description}</p>
                )}

                <div className="mobile-card-grid">
                  <div className="mobile-meta-item">
                    <span className="meta-k">Template</span>
                    <span className="meta-v template-link-text">{item.templateName}</span>
                  </div>
                  <div className="mobile-meta-item">
                    <span className="meta-k">Audience</span>
                    <span className="meta-v">
                      {item.audienceName}{" "}
                      {item.audienceType === "CONTACT_LIST" && (
                        <span
                          className="status-sub-pill"
                          style={{
                            background: "rgba(16, 185, 129, 0.15)",
                            color: "var(--accent-emerald)",
                            fontWeight: 600,
                            fontSize: "0.68rem",
                            padding: "0.15rem 0.45rem",
                            borderRadius: "var(--radius-full)",
                          }}
                        >
                          VERIFIED
                        </span>
                      )}
                    </span>
                  </div>
                  <div className="mobile-meta-item">
                    <span className="meta-k">Recipients</span>
                    <span className="meta-v sent-count-num">
                      {item.totalRecipients.toLocaleString()} Eligible
                    </span>
                  </div>
                  <div className="mobile-meta-item">
                    <span className="meta-k">Date</span>
                    <span className="meta-v text-muted">
                      {new Date(item.createdAt).toLocaleDateString()}
                    </span>
                  </div>
                </div>

                <div className="mobile-card-actions-row">
                  <button
                    type="button"
                    className="btn-mobile-act"
                    onClick={() => onViewDetails(item)}
                  >
                    <Eye size={13} />
                    <span>View</span>
                  </button>

                  <button
                    type="button"
                    className="btn-mobile-act"
                    onClick={() => onDuplicateCampaign(item)}
                  >
                    <Copy size={13} />
                    <span>Duplicate</span>
                  </button>

                  {(item.status === "DRAFT" || item.status === "SCHEDULED") && (
                    <button
                      type="button"
                      className="btn-mobile-act"
                      onClick={() => onEditCampaign(item)}
                    >
                      <Edit3 size={13} />
                      <span>Edit</span>
                    </button>
                  )}

                  {item.status === "SCHEDULED" && onCancelCampaign && (
                    <button
                      type="button"
                      className="btn-mobile-act act-danger"
                      onClick={() => onCancelCampaign(item)}
                      id={`mobile-cancel-campaign-btn-${item.id}`}
                    >
                      <Ban size={13} />
                      <span>Cancel</span>
                    </button>
                  )}

                  {item.status === "DRAFT" && item.approvalStatus !== "PENDING" && item.approvalStatus !== "REJECTED" && (
                    <button
                      type="button"
                      className="btn-mobile-act"
                      onClick={() => onLaunchCampaign(item)}
                      id={`mobile-launch-btn-${item.id}`}
                    >
                      <Send size={13} />
                      <span>Launch</span>
                    </button>
                  )}

                  {(item.status === "QUEUED" || item.status === "SENDING") && (
                    <button
                      type="button"
                      className="btn-mobile-act"
                      onClick={() => onRetryQueue(item)}
                      id={`mobile-retry-queue-btn-${item.id}`}
                    >
                      <RefreshCw size={13} />
                      <span>Retry Queue</span>
                    </button>
                  )}

                  {item.status === "DRAFT" && (
                    <button
                      type="button"
                      className="btn-mobile-act act-danger"
                      onClick={() => onDeleteCampaign(item)}
                    >
                      <Trash2 size={13} />
                      <span>Delete</span>
                    </button>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* 5. Pagination Controls (Bottom Bar) */}
          {pagination.total > 0 && (
            <div className="campaign-pagination-bar" role="navigation" aria-label="Campaign pagination">
              <div className="pagination-info-col">
                <span className="pagination-range-text">
                  Showing <strong>{(pagination.page - 1) * pagination.limit + 1}</strong>–
                  <strong>{Math.min(pagination.page * pagination.limit, pagination.total)}</strong> of{" "}
                  <strong>{pagination.total}</strong> campaign{pagination.total === 1 ? "" : "s"}
                </span>

                <div className="pagination-page-size">
                  <label htmlFor="page-size-select" className="page-size-label">
                    Per page:
                  </label>
                  <select
                    id="page-size-select"
                    className="page-size-select"
                    value={pagination.limit}
                    onChange={(e) => onLimitChange(Number(e.target.value))}
                    aria-label="Select campaigns per page"
                  >
                    <option value={10}>10</option>
                    <option value={25}>25</option>
                    <option value={50}>50</option>
                  </select>
                </div>
              </div>

              <div className="pagination-nav-col">
                <button
                  type="button"
                  className="btn-pagination-nav"
                  onClick={() => onPageChange(pagination.page - 1)}
                  disabled={!pagination.hasPrevPage || isLoading}
                  aria-label="Go to previous page"
                  id="campaigns-prev-page-btn"
                >
                  <ChevronLeft size={15} />
                  <span>Previous</span>
                </button>

                <span className="pagination-page-indicator">
                  Page <strong>{pagination.page}</strong> of <strong>{pagination.totalPages}</strong>
                </span>

                <button
                  type="button"
                  className="btn-pagination-nav"
                  onClick={() => onPageChange(pagination.page + 1)}
                  disabled={!pagination.hasNextPage || isLoading}
                  aria-label="Go to next page"
                  id="campaigns-next-page-btn"
                >
                  <span>Next</span>
                  <ChevronRight size={15} />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
};
