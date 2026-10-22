export interface DashboardMetrics {
  totalCampaigns: number;
  activeCampaigns: number;
  messagesSent: number;
  deliveryRate: number; // e.g., 98.4
  audienceSize: number;
  isDemoData: boolean;
}

export type CampaignStatus = "COMPLETED" | "ACTIVE" | "SCHEDULED" | "DRAFT";

export interface RecentCampaignItem {
  id: string;
  name: string;
  templateName: string;
  audienceSize: number;
  sentCount: number;
  status: CampaignStatus;
  lastUpdated: string;
}

export interface WhatsAppStatusInfo {
  isConnected: boolean;
  phoneNumberId: string;
  accountStatus: "SETUP_REQUIRED" | "PENDING_VERIFICATION" | "CONNECTED";
  message: string;
}
