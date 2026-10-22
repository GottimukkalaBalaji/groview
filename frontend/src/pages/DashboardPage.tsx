import React, { useState, useEffect, useCallback } from "react";
import {
  Send,
  MessageSquare,
  CheckCircle2,
  Users,
  Plus,
  Loader2,
} from "lucide-react";
import { MetricCard } from "../components/MetricCard.js";
import { RecentCampaignsTable } from "../components/RecentCampaignsTable.js";
import { WhatsAppStatusCard } from "../components/WhatsAppStatusCard.js";
import { QuickActionsCard } from "../components/QuickActionsCard.js";
import { apiClient } from "../services/api.js";
import { Campaign, CampaignMetrics } from "../types/campaign.js";
import { SafeConnectionStatus } from "../types/whatsappIntegration.js";
import { RecentCampaignItem } from "../types/dashboard.js";

interface DashboardPageProps {
  onNavigate: (view: string) => void;
}

export const DashboardPage: React.FC<DashboardPageProps> = ({ onNavigate }) => {
  // Authenticated tenant metrics state
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [campaignMetrics, setCampaignMetrics] = useState<CampaignMetrics>({
    total: 0,
    draft: 0,
    scheduled: 0,
    sending: 0,
    completed: 0,
    failed: 0,
    cancelled: 0,
  });
  const [totalContacts, setTotalContacts] = useState<number>(0);
  const [eligibleContacts, setEligibleContacts] = useState<number>(0);
  const [totalMessagesSent, setTotalMessagesSent] = useState<number>(0);
  const [totalDelivered, setTotalDelivered] = useState<number>(0);
  const [whatsAppStatus, setWhatsAppStatus] = useState<SafeConnectionStatus | null>(null);
  const [isLoadingDashboard, setIsLoadingDashboard] = useState<boolean>(true);

  const fetchDashboardData = useCallback(async () => {
    setIsLoadingDashboard(true);

    try {
      const [
        campaignsRes,
        audiencesRes,
        contactsRes,
        whatsAppRes,
      ] = await Promise.allSettled([
        apiClient.listCampaigns({ limit: 5 }),
        apiClient.listAudiences(),
        apiClient.listContacts({ limit: 1 }),
        apiClient.getWhatsAppStatus(),
      ]);

      const isSuccess = (res: any) => Boolean(res && (res.success || res.status === "success" || res.status === "ok"));

      // Real Campaigns & Metrics
      if (campaignsRes.status === "fulfilled" && isSuccess(campaignsRes.value) && campaignsRes.value.data) {
        const items = campaignsRes.value.data.items || [];
        setCampaigns(items);
        setCampaignMetrics(campaignsRes.value.data.metrics || {
          total: items.length,
          draft: items.filter(c => c.status === "DRAFT").length,
          scheduled: items.filter(c => c.status === "SCHEDULED").length,
          sending: items.filter(c => c.status === "SENDING").length,
          completed: items.filter(c => c.status === "COMPLETED").length,
          failed: items.filter(c => c.status === "FAILED").length,
          cancelled: items.filter(c => c.status === "CANCELLED").length,
        });
        const sent = items.reduce((acc, c) => acc + (c.sentCount || 0), 0);
        const delivered = items.reduce((acc, c) => acc + (c.deliveredCount || 0), 0);
        setTotalMessagesSent(sent);
        setTotalDelivered(delivered);
      }

      // Real Audiences & Eligible Contact Counts
      let calculatedEligible = 0;
      let calculatedTotal = 0;
      if (audiencesRes.status === "fulfilled" && isSuccess(audiencesRes.value) && audiencesRes.value.data) {
        const lists = audiencesRes.value.data || [];
        calculatedTotal = lists.reduce((acc, l) => acc + (l.memberCount || 0), 0);
        calculatedEligible = lists.reduce((acc, l) => acc + (l.eligibleMemberCount ?? (l.memberCount || 0)), 0);
        setTotalContacts(calculatedTotal);
        setEligibleContacts(calculatedEligible);
      }

      // Check unique contacts total from contacts API
      if (contactsRes.status === "fulfilled" && isSuccess(contactsRes.value) && contactsRes.value.data) {
        const totalItems = contactsRes.value.data.pagination?.totalItems;
        if (typeof totalItems === "number" && totalItems > 0) {
          setTotalContacts(totalItems);
        }
        // If audiences didn't specify eligible count but contacts list is returned
        if (calculatedEligible === 0 && Array.isArray(contactsRes.value.data.items)) {
          const eligibleInPage = contactsRes.value.data.items.filter(
            (c: any) => c.consentStatus === "OPTED_IN" && !c.isSuppressed
          ).length;
          if (eligibleInPage > 0) {
            setEligibleContacts(eligibleInPage);
          }
        }
      }

      // Real WhatsApp Connection Status
      if (whatsAppRes.status === "fulfilled" && isSuccess(whatsAppRes.value) && whatsAppRes.value.data) {
        setWhatsAppStatus(whatsAppRes.value.data);
      }
    } catch (err) {
      console.warn("Failed to load some dashboard metrics:", err);
    } finally {
      setIsLoadingDashboard(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboardData();
  }, [fetchDashboardData]);

  // Map real campaigns to RecentCampaignItem format
  const realRecentCampaigns: RecentCampaignItem[] = campaigns.map((c) => ({
    id: c.id,
    name: c.name,
    templateName: c.templateName,
    audienceSize: c.totalRecipients || 0,
    sentCount: c.sentCount || 0,
    status: (c.status === "SENDING" ? "ACTIVE" : c.status) as any,
    lastUpdated: c.updatedAt || c.createdAt,
  }));

  const compliancePercent =
    totalContacts > 0 ? Math.round((eligibleContacts / totalContacts) * 100) : 100;

  return (
    <main className="dashboard-view">
      {/* 1. Header Section */}
      <section className="dashboard-welcome-header">
        <div className="welcome-text-col">
          <div className="welcome-title-row">
            <h1 className="dashboard-heading">Dashboard</h1>
            <span className="platform-tag">WhatsApp Marketing</span>
          </div>
          <p className="welcome-subtitle">
            Welcome to Grovastra — manage your WhatsApp marketing, customer communications, and automated campaigns.
          </p>
        </div>

        <div className="header-actions-col">
          {/* Primary Create Campaign Action */}
          <button
            type="button"
            className="btn-primary"
            onClick={() => onNavigate("campaigns")}
            id="dashboard-create-campaign-btn"
          >
            <Plus size={16} />
            <span>Create Campaign</span>
          </button>
        </div>
      </section>

      {/* 2. Four Business Metric Summary Cards */}
      <section className="metrics-grid">
        <MetricCard
          title="Campaigns"
          value={campaignMetrics.total}
          subtitle={
            campaignMetrics.total > 0
              ? `${campaignMetrics.draft} Draft${campaignMetrics.draft === 1 ? "" : "s"} • ${campaignMetrics.sending} Sending • ${campaignMetrics.completed} Completed`
              : "No campaigns created yet"
          }
          icon={Send}
          accentColor="var(--accent-emerald)"
        />

        <MetricCard
          title="Messages Sent"
          value={totalMessagesSent.toLocaleString()}
          subtitle={
            totalDelivered > 0
              ? `${totalDelivered.toLocaleString()} confirmed delivered`
              : totalMessagesSent > 0
              ? "Dispatched volume across live campaigns"
              : "Messages will tally once campaigns are dispatched"
          }
          icon={MessageSquare}
          accentColor="var(--accent-indigo-light)"
        />

        <MetricCard
          title="Total Contacts"
          value={totalContacts.toLocaleString()}
          subtitle={
            totalContacts > 0
              ? `${eligibleContacts.toLocaleString()} Opted-In & Send-Eligible`
              : "Import CSV to add verified contacts"
          }
          icon={Users}
          accentColor="#fbbf24"
        />

        <MetricCard
          title="Opt-in Compliance"
          value={`${compliancePercent}%`}
          subtitle={
            totalContacts > 0
              ? `${eligibleContacts.toLocaleString()} of ${totalContacts.toLocaleString()} contacts verified`
              : "Opt-in consent rate across contacts"
          }
          icon={CheckCircle2}
          accentColor="#38bdf8"
        />
      </section>

      {/* 3. Middle Two-Column Grid: Quick Actions + WhatsApp Integration Status */}
      <section className="dashboard-two-col-grid">
        <QuickActionsCard onNavigate={onNavigate} />
        <WhatsAppStatusCard
          status={whatsAppStatus}
          onConfigure={() => onNavigate("settings")}
        />
      </section>

      {/* 4. Recent Campaigns Section */}
      <section className="dashboard-campaigns-section">
        {isLoadingDashboard ? (
          <div className="glass-panel" style={{ padding: "2.5rem 1.5rem", textAlign: "center" }}>
            <Loader2 size={24} className="spinning" style={{ margin: "0 auto 0.5rem auto", color: "var(--accent-emerald)" }} />
            <span style={{ fontSize: "0.88rem", color: "var(--text-secondary)" }}>
              Loading authenticated campaign workspace...
            </span>
          </div>
        ) : (
          <RecentCampaignsTable
            campaigns={realRecentCampaigns}
            onCreateCampaign={() => onNavigate("campaigns")}
            onViewTemplates={() => onNavigate("templates")}
            onSelectCampaign={() => onNavigate("campaigns")}
          />
        )}
      </section>


    </main>
  );
};
