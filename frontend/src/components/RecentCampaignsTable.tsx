import React from "react";
import {
  Send,
  Calendar,
  Users,
  CheckCircle2,
  Clock,
  FileEdit,
  Radio,
  Plus,
  AlertCircle,
  ExternalLink,
} from "lucide-react";
import { RecentCampaignItem, CampaignStatus } from "../types/dashboard.js";

interface RecentCampaignsTableProps {
  campaigns: RecentCampaignItem[];
  onCreateCampaign: () => void;
  onViewTemplates: () => void;
  onSelectCampaign?: (campaign: RecentCampaignItem) => void;
}

export const RecentCampaignsTable: React.FC<RecentCampaignsTableProps> = ({
  campaigns,
  onCreateCampaign,
  onViewTemplates,
  onSelectCampaign,
}) => {
  const getStatusBadge = (status: CampaignStatus | string) => {
    switch (status) {
      case "COMPLETED":
        return (
          <span className="status-pill status-approved">
            <CheckCircle2 size={12} />
            <span>Completed</span>
          </span>
        );
      case "ACTIVE":
      case "SENDING":
        return (
          <span className="status-pill status-active">
            <Radio size={12} className="pulsing" />
            <span>Sending</span>
          </span>
        );
      case "SCHEDULED":
      case "QUEUED":
        return (
          <span className="status-pill status-pending">
            <Clock size={12} />
            <span>{status === "QUEUED" ? "Queued" : "Scheduled"}</span>
          </span>
        );
      case "DRAFT":
        return (
          <span className="status-pill status-draft">
            <FileEdit size={12} />
            <span>Draft</span>
          </span>
        );
      case "FAILED":
      case "CANCELLED":
        return (
          <span className="status-pill status-rejected">
            <AlertCircle size={12} />
            <span>{status === "FAILED" ? "Failed" : "Cancelled"}</span>
          </span>
        );
      default:
        return (
          <span className="status-pill status-draft">
            <FileEdit size={12} />
            <span>{status}</span>
          </span>
        );
    }
  };

  return (
    <div className="recent-campaigns-section">
      <div className="section-title-bar">
        <div>
          <div className="title-with-badge">
            <h3 className="section-main-heading">Recent Campaigns</h3>
          </div>
          <p className="section-sub-desc">
            Live overview of your WhatsApp campaign drafts and broadcast automations.
          </p>
        </div>

        <button
          type="button"
          className="btn-primary"
          onClick={onCreateCampaign}
          id="recent-campaigns-create-btn"
        >
          <Plus size={16} />
          <span>Create Campaign</span>
        </button>
      </div>

      {campaigns.length === 0 ? (
        <div className="empty-campaigns-card">
          <Send size={40} color="var(--text-muted)" />
          <h4>No campaigns created yet</h4>
          <p>
            Launch high-converting WhatsApp broadcasts to your customer audience using pre-approved message templates.
          </p>
          <div className="empty-actions-row">
            <button type="button" className="btn-primary" onClick={onCreateCampaign}>
              <Plus size={15} />
              <span>Draft First Campaign</span>
            </button>
            <button type="button" className="btn-secondary" onClick={onViewTemplates}>
              Browse Templates
            </button>
          </div>
        </div>
      ) : (
        <>
          {/* Desktop & Tablet Table View */}
          <div className="campaigns-table-wrapper" style={{ overflowX: "auto" }}>
            <table className="campaigns-table" style={{ width: "100%", minWidth: "640px" }}>
              <thead>
                <tr>
                  <th scope="col">Campaign Name</th>
                  <th scope="col">Template Used</th>
                  <th scope="col">Audience Size</th>
                  <th scope="col">Status</th>
                  <th scope="col">Messages Dispatched</th>
                  <th scope="col">Last Activity</th>
                  {onSelectCampaign && <th scope="col" style={{ textAlign: "right" }}>Action</th>}
                </tr>
              </thead>
              <tbody>
                {campaigns.map((item) => (
                  <tr
                    key={item.id}
                    onClick={() => onSelectCampaign?.(item)}
                    style={{ cursor: onSelectCampaign ? "pointer" : "default" }}
                  >
                    <td>
                      <div className="campaign-name-cell">
                        <Send size={14} className="cell-icon" />
                        <span className="campaign-name-text">{item.name}</span>
                      </div>
                    </td>
                    <td>
                      <span className="template-link-text">{item.templateName}</span>
                    </td>
                    <td>
                      <div className="cell-inline-icon">
                        <Users size={13} />
                        <span>{item.audienceSize.toLocaleString()}</span>
                      </div>
                    </td>
                    <td>{getStatusBadge(item.status)}</td>
                    <td>
                      <span className="sent-count-num">
                        {item.sentCount > 0 ? item.sentCount.toLocaleString() : "—"}
                      </span>
                    </td>
                    <td>
                      <div className="cell-inline-icon text-muted">
                        <Calendar size={13} />
                        <span>{new Date(item.lastUpdated).toLocaleDateString()}</span>
                      </div>
                    </td>
                    {onSelectCampaign && (
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn-table-action"
                          onClick={(e) => {
                            e.stopPropagation();
                            onSelectCampaign(item);
                          }}
                          title="Open Campaign"
                        >
                          <ExternalLink size={13} />
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Mobile Card Stack View (< 640px) */}
          <div className="campaigns-mobile-cards">
            {campaigns.map((item) => (
              <div
                key={item.id}
                className="campaign-mobile-card"
                onClick={() => onSelectCampaign?.(item)}
                style={{ cursor: onSelectCampaign ? "pointer" : "default" }}
              >
                <div className="mobile-card-top">
                  <span className="campaign-mobile-title">{item.name}</span>
                  {getStatusBadge(item.status)}
                </div>

                <div className="mobile-card-grid">
                  <div className="mobile-meta-item">
                    <span className="meta-k">Template</span>
                    <span className="meta-v template-link-text">{item.templateName}</span>
                  </div>
                  <div className="mobile-meta-item">
                    <span className="meta-k">Audience</span>
                    <span className="meta-v">{item.audienceSize.toLocaleString()} Contacts</span>
                  </div>
                  <div className="mobile-meta-item">
                    <span className="meta-k">Dispatched</span>
                    <span className="meta-v sent-count-num">
                      {item.sentCount > 0 ? item.sentCount.toLocaleString() : "—"}
                    </span>
                  </div>
                  <div className="mobile-meta-item">
                    <span className="meta-k">Date</span>
                    <span className="meta-v text-muted">{new Date(item.lastUpdated).toLocaleDateString()}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
};
