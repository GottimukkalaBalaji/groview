export interface AnalyticsRate {
  rate: number;
  numerator: number;
  denominator: number;
  definition: string;
  formula: string;
}

export interface AnalyticsSummary {
  totalCampaigns: number;
  draftCampaigns: number;
  scheduledCampaigns: number;
  queuedCampaigns: number;
  sendingCampaigns: number;
  completedCampaigns: number;
  completedWithIssuesCampaigns: number;
  failedCampaigns: number;
  cancelledCampaigns: number;
  totalIntendedRecipients: number;
  queuedMessages: number;
  acceptedMessages: number;
  sentMessages: number;
  deliveredMessages: number;
  readMessages: number;
  failedMessages: number;
  deliveryConfirmationPendingMessages: number;
  totalMessages: number;
}

export interface CampaignVolumePoint {
  date: string;
  total: number;
  completed: number;
  failed: number;
  scheduled: number;
}

export interface MessageVolumePoint {
  date: string;
  sent: number;
  delivered: number;
  read: number;
  failed: number;
  queued: number;
}

export interface RateTrendPoint {
  date: string;
  deliveryRate: number;
  readRate: number;
  failureRate: number;
}

export interface CampaignStatusDistributionItem {
  status: string;
  label: string;
  count: number;
  percentage: number;
}

export interface FailureReasonDistributionItem {
  code: string;
  reason: string;
  count: number;
  percentage: number;
}

export interface UpcomingCampaignItem {
  id: string;
  name: string;
  scheduledAt: string;
  totalRecipients: number;
}

export interface OverdueCampaignItem {
  id: string;
  name: string;
  scheduledAt: string;
  delayMinutes: number;
}

export interface DispatchedLateCampaignItem {
  id: string;
  name: string;
  scheduledAt: string;
  startedAt: string;
  latencySeconds: number;
}

export interface ScheduleComparisonItem {
  id: string;
  name: string;
  scheduledAt: string;
  startedAt: string | null;
  status: string;
  latencySeconds: number | null;
}

export interface RestartRecoveryTelemetry {
  isAvailable: boolean;
  historicalCount: number | null;
  status: string;
  reason: string;
  additiveDesignProposal: string;
}

export interface SchedulingAnalytics {
  upcomingCount: number;
  overdueCount: number;
  dispatchedLateCount: number;
  cancelledExpiredCount: number;
  upcomingCampaigns: UpcomingCampaignItem[];
  overdueCampaigns: OverdueCampaignItem[];
  dispatchedLateCampaigns: DispatchedLateCampaignItem[];
  comparisons: ScheduleComparisonItem[];
  restartRecovery: RestartRecoveryTelemetry;
}

export interface AnalyticsOverview {
  dateRange: {
    startDate: string;
    endDate: string;
    timeRange: string;
  };
  summary: AnalyticsSummary;
  rates: {
    deliveryRate: AnalyticsRate;
    readRate: AnalyticsRate;
    failureRate: AnalyticsRate;
  };
  trends: {
    campaignVolumeOverTime: CampaignVolumePoint[];
    messageVolumeOverTime: MessageVolumePoint[];
    ratesOverTime: RateTrendPoint[];
    campaignStatusDistribution: CampaignStatusDistributionItem[];
    failureReasonsDistribution: FailureReasonDistributionItem[];
  };
  scheduling: SchedulingAnalytics;
}

export interface DeliveryReportItem {
  id: string;
  campaignId: string | null;
  campaignName: string;
  recipientPhoneMasked: string;
  templateName: string;
  templateLanguage: string;
  status: string;
  attemptCount: number;
  errorCode: string | null;
  errorMessage: string | null;
  dispatchedAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  createdAt: string;
}

export interface DeliveryReportResponse {
  items: DeliveryReportItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface QueryAnalyticsOverviewParams {
  campaignId?: string;
  startDate?: string;
  endDate?: string;
  timeRange?: "7d" | "30d" | "90d" | "all";
}

export interface QueryDeliveryReportParams {
  campaignId?: string;
  status?: string;
  templateName?: string;
  search?: string;
  startDate?: string;
  endDate?: string;
  page?: number;
  limit?: number;
  sortBy?: string;
  sortOrder?: "asc" | "desc";
}
