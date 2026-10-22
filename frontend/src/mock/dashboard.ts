import { DashboardMetrics, RecentCampaignItem, WhatsAppStatusInfo } from "../types/dashboard.js";

export const DEMO_DASHBOARD_METRICS: DashboardMetrics = {
  totalCampaigns: 14,
  activeCampaigns: 3,
  messagesSent: 28450,
  deliveryRate: 98.6,
  audienceSize: 4820,
  isDemoData: true,
};

export const EMPTY_DASHBOARD_METRICS: DashboardMetrics = {
  totalCampaigns: 0,
  activeCampaigns: 0,
  messagesSent: 0,
  deliveryRate: 0,
  audienceSize: 0,
  isDemoData: false,
};

export const DEMO_RECENT_CAMPAIGNS: RecentCampaignItem[] = [
  {
    id: "cmp-001",
    name: "Diwali Mega Flash Sale",
    templateName: "festive_mega_savings",
    audienceSize: 1850,
    sentCount: 1850,
    status: "COMPLETED",
    lastUpdated: "2026-10-12T14:30:00.000Z",
  },
  {
    id: "cmp-002",
    name: "Weekend Cart Recovery",
    templateName: "cart_recovery_reminder",
    audienceSize: 620,
    sentCount: 620,
    status: "ACTIVE",
    lastUpdated: "2026-10-13T09:15:00.000Z",
  },
  {
    id: "cmp-003",
    name: "VIP Tier Reward Announcement",
    templateName: "vip_loyalty_unlocked",
    audienceSize: 1250,
    sentCount: 0,
    status: "SCHEDULED",
    lastUpdated: "2026-10-14T04:00:00.000Z",
  },
  {
    id: "cmp-004",
    name: "Post-Purchase Order Dispatch",
    templateName: "order_dispatched_alert",
    audienceSize: 480,
    sentCount: 0,
    status: "DRAFT",
    lastUpdated: "2026-10-13T11:45:00.000Z",
  },
];

export const INITIAL_WHATSAPP_STATUS: WhatsAppStatusInfo = {
  isConnected: false,
  phoneNumberId: "Unregistered",
  accountStatus: "SETUP_REQUIRED",
  message: "Official WhatsApp Cloud API account is not linked. Message delivery and webhook processing will be activated in Phase 7.",
};
