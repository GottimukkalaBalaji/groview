export type CampaignStatus =
  | "DRAFT"
  | "SCHEDULED"
  | "QUEUED"
  | "SENDING"
  | "COMPLETED"
  | "FAILED"
  | "CANCELLED";

export type AudienceType = "MOCK" | "CONTACT_LIST" | "SEGMENT";

export interface Campaign {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  templateId: string;
  templateName: string;
  templateLanguage: string;
  templateCategory: string;
  variablesMapping: Record<string, string | number | boolean>;
  audienceType: AudienceType;
  audienceId: string | null;
  audienceName: string;
  totalRecipients: number;
  sentCount?: number;
  deliveredCount?: number;
  readCount?: number;
  failedCount?: number;
  scheduledAt: string | null;
  startedAt: string | null;
  completedAt: string | null;
  createdBy: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface CampaignPagination {
  page: number;
  limit: number;
  total: number;
  totalPages: number;
  hasNextPage: boolean;
  hasPrevPage: boolean;
}

export interface CampaignMetrics {
  total: number;
  draft: number;
  scheduled: number;
  sending: number;
  completed: number;
  failed: number;
  cancelled: number;
}

export interface CampaignListResponse {
  items: Campaign[];
  pagination: CampaignPagination;
  metrics: CampaignMetrics;
}

export interface CreateCampaignPayload {
  name: string;
  description?: string | null;
  templateId: string;
  templateName: string;
  templateLanguage?: string;
  templateCategory?: string;
  variablesMapping?: Record<string, string | number | boolean>;
  audienceType?: AudienceType;
  audienceId?: string | null;
  audienceName?: string;
  totalRecipients?: number;
  scheduledAt?: string | null;
  clientRequestId?: string;
}

export interface UpdateCampaignPayload {
  name?: string;
  description?: string | null;
  templateId?: string;
  templateName?: string;
  templateLanguage?: string;
  templateCategory?: string;
  variablesMapping?: Record<string, string | number | boolean>;
  audienceType?: AudienceType;
  audienceId?: string | null;
  audienceName?: string;
  totalRecipients?: number;
  scheduledAt?: string | null;
}

export interface QueryCampaignsParams {
  search?: string;
  status?: string;
  page?: number;
  limit?: number;
  sortBy?: "createdAt" | "updatedAt" | "name" | "totalRecipients";
  sortOrder?: "asc" | "desc";
}

export interface LaunchCampaignSummary {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  totalAudienceCount: number;
  eligibleCount: number;
  queuedCount: number;
  alreadyPreparedCount: number;
  enqueueSuccessCount: number;
  enqueueFailureCount: number;
  excludedCount: {
    consentRequired: number;
    suppressed: number;
    invalidPhone: number;
    missingVariables: number;
  };
  sampleExclusions: Array<{
    contactId: string;
    phone?: string;
    reason: string;
  }>;
}

export interface CampaignQueueRecoverySummary {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  totalPersistedMessages: number;
  eligibleQueuedCount: number;
  enqueuedSuccessCount: number;
  requeuedCount?: number;
  alreadyEnqueuedCount: number;
  enqueueFailureCount: number;
  ambiguousCount?: number;
  terminalCount: number;
  inFlightCount: number;
}

export interface CampaignMessageItem {
  id: string;
  recipientPhoneMasked: string;
  status: string;
  attemptCount: number;
  wamidMasked: string | null;
  sentAt: string | null;
  deliveredAt: string | null;
  readAt: string | null;
  failedAt: string | null;
  errorMessage: string | null;
  createdAt: string;
}

export interface CampaignMessagesResponse {
  items: CampaignMessageItem[];
  total: number;
  page: number;
  limit: number;
  totalPages: number;
}

export interface SchedulerStatusResponse {
  isRunning: boolean;
  workerActive: boolean;
  isReconciling: boolean;
  intervalMs: number;
  maxLatenessHours: number;
  timestamp: string;
}


