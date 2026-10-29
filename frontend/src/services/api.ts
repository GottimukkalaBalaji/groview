import { ApiResponse, HealthData, ReadinessData } from "../types/api.js";
import {
  Campaign,
  CampaignListResponse,
  CreateCampaignPayload,
  UpdateCampaignPayload,
  QueryCampaignsParams,
  LaunchCampaignSummary,
  CampaignQueueRecoverySummary,
  CampaignMessagesResponse,
  SchedulerStatusResponse,
  ApproveCampaignPayload,
  RejectCampaignPayload,
} from "../types/campaign.js";
import { AuthResponse, SignupPayload, LoginPayload } from "../types/auth.js";
import {
  SafeConnectionStatus,
  ConnectWhatsAppPayload,
  DisconnectWhatsAppResponse,
} from "../types/whatsappIntegration.js";
import {
  PlatformCapabilities,
  PlatformOverview,
  PlatformOrganizationsResponse,
  PlatformOrganizationDetail,
  PlatformOrganizationSummary,
  PlatformWhatsAppStatus,
  PlatformTemplateResponse,
  ConnectPlatformWhatsAppPayload,
  DisconnectPlatformWhatsAppResponse,
  BusinessAssignmentSummary,
  BusinessAssignmentsListResponse,
  CreateBusinessAssignmentPayload,
  RevokeBusinessAssignmentPayload,
  EligibleDelegatedAdmin,
  AssignedOrganizationSummary,
  DelegatedAdminItem,
  CreateDelegatedAdminPayload,
} from "../types/platform.js";
import {
  AnalyticsOverview,
  DeliveryReportResponse,
  QueryAnalyticsOverviewParams,
  QueryDeliveryReportParams,
} from "../types/analytics.js";

export interface ApiErrorDetail {
  field?: string;
  message: string;
}

export class ApiClientError extends Error {
  public readonly statusCode: number;
  public readonly code: string;
  public readonly details?: ApiErrorDetail[];

  constructor(
    message: string,
    statusCode: number,
    code = "UNKNOWN_ERROR",
    details?: ApiErrorDetail[]
  ) {
    super(message);
    this.name = "ApiClientError";
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

/**
 * Sanitizes error messages by redacting sensitive tokens, credentials, or keys.
 */
export function sanitizeErrorMessage(message: string): string {
  if (!message || typeof message !== "string") return message;
  return message
    .replace(/EAA[a-zA-Z0-9_\-.~]+/g, "[REDACTED_ACCESS_TOKEN]")
    .replace(/(bearer\s+)[a-zA-Z0-9_\-.~]+/gi, "$1[REDACTED]")
    .replace(/((?:access_token|secret|password|key)=)[^&\s]+/gi, "$1[REDACTED]")
    .replace(/postgresql:\/\/[^@]+@/g, "postgresql://***:***@");
}

/**
 * Resolves the API base URL based on environment and browser context.
 * For local development, defaults to configured VITE_API_BASE_URL or http://localhost:5000/api/v1.
 * When accessed over HTTPS or on external hostnames (e.g. ngrok tunnel, LAN IP) where an insecure
 * localhost endpoint would be blocked as Mixed Content or unreachable, it falls back to relative '/api/v1'
 * to route through the dev-server / reverse proxy.
 */
export function resolveApiBaseUrl(): string {
  const envUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined)?.replace(/\/+$/, "");

  if (typeof window !== "undefined" && window.location) {
    const isHttps = window.location.protocol === "https:";
    const isNonLocalhost =
      window.location.hostname !== "localhost" && window.location.hostname !== "127.0.0.1";

    if (
      (isHttps || isNonLocalhost) &&
      (!envUrl || envUrl.startsWith("http://localhost") || envUrl.startsWith("http://127.0.0.1"))
    ) {
      return "/api/v1";
    }
  }

  return envUrl || "http://localhost:5000/api/v1";
}

export const API_BASE_URL = resolveApiBaseUrl();

export class ApiClient {
  private baseUrl: string;
  private scopedOrganizationId: string | null = null;

  constructor(baseUrl: string) {
    this.baseUrl = baseUrl;
  }

  public getBaseUrl(): string {
    return this.baseUrl;
  }

  public setScopedOrganizationId(orgId: string | null): void {
    this.scopedOrganizationId = orgId ? orgId.trim() : null;
  }

  public getScopedOrganizationId(): string | null {
    return this.scopedOrganizationId;
  }

  private async request<T>(endpoint: string, options?: RequestInit): Promise<T> {
    const url = `${this.baseUrl}${endpoint.startsWith("/") ? endpoint : `/${endpoint}`}`;

    const defaultHeaders: Record<string, string> = {
      "Content-Type": "application/json",
      Accept: "application/json",
    };

    if (this.scopedOrganizationId) {
      defaultHeaders["x-scoped-organization-id"] = this.scopedOrganizationId;
    }

    const config: RequestInit = {
      credentials: "include",
      ...options,
      headers: {
        ...defaultHeaders,
        ...options?.headers,
      },
    };

    try {
      const response = await fetch(url, config);
      const data = await response.json();

      if (!response.ok) {
        const rawMsg = data?.error?.message || `Request failed with HTTP status ${response.status}`;
        const errorMsg = sanitizeErrorMessage(rawMsg);
        const errorCode = data?.error?.code || `HTTP_${response.status}`;
        const errorDetails = Array.isArray(data?.error?.details)
          ? data.error.details.map((d: ApiErrorDetail) => ({
              ...d,
              message: sanitizeErrorMessage(d.message),
            }))
          : undefined;
        throw new ApiClientError(errorMsg, response.status, errorCode, errorDetails);
      }

      return data as T;
    } catch (err) {
      if (err instanceof ApiClientError) {
        throw err;
      }
      if (err instanceof TypeError && err.message.includes("Failed to fetch")) {
        throw new ApiClientError(
          `Unable to connect to Grovastra backend at ${this.baseUrl}. Please verify the server is running on port 5000.`,
          0,
          "NETWORK_ERROR"
        );
      }
      const rawMsg = err instanceof Error ? err.message : String(err);
      throw new ApiClientError(
        sanitizeErrorMessage(rawMsg) || "An unexpected network or communication error occurred.",
        0,
        "UNEXPECTED_ERROR"
      );
    }
  }

  /**
   * Fetches the backend liveness probe
   */
  public async getHealth(): Promise<ApiResponse<HealthData>> {
    return this.request<ApiResponse<HealthData>>("/health");
  }

  /**
   * Fetches the backend readiness probe
   */
  public async getReadiness(): Promise<ApiResponse<ReadinessData>> {
    return this.request<ApiResponse<ReadinessData>>("/ready");
  }

  /**
   * Fetches campaigns with search, status filtering, and pagination
   */
  public async listCampaigns(
    params?: QueryCampaignsParams
  ): Promise<ApiResponse<CampaignListResponse>> {
    const query = new URLSearchParams();
    if (params?.search) query.append("search", params.search);
    if (params?.status && params.status !== "ALL") query.append("status", params.status);
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.sortBy) query.append("sortBy", params.sortBy);
    if (params?.sortOrder) query.append("sortOrder", params.sortOrder);

    const queryString = query.toString();
    const endpoint = queryString ? `/campaigns?${queryString}` : "/campaigns";
    return this.request<ApiResponse<CampaignListResponse>>(endpoint);
  }

  /**
   * Fetches single campaign details by ID
   */
  public async getCampaign(id: string): Promise<ApiResponse<Campaign>> {
    return this.request<ApiResponse<Campaign>>(`/campaigns/${id}`);
  }

  /**
   * Creates a new campaign draft
   */
  public async createCampaign(
    payload: CreateCampaignPayload
  ): Promise<ApiResponse<Campaign>> {
    return this.request<ApiResponse<Campaign>>("/campaigns", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Updates an existing campaign draft
   */
  public async updateCampaign(
    id: string,
    payload: UpdateCampaignPayload
  ): Promise<ApiResponse<Campaign>> {
    return this.request<ApiResponse<Campaign>>(`/campaigns/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Duplicates an existing campaign into an independent draft
   */
  public async duplicateCampaign(id: string): Promise<ApiResponse<Campaign>> {
    return this.request<ApiResponse<Campaign>>(`/campaigns/${id}/duplicate`, {
      method: "POST",
    });
  }

  /**
   * Deletes a draft campaign
   */
  public async deleteCampaign(
    id: string
  ): Promise<ApiResponse<{ id: string; deleted: boolean }>> {
    return this.request<ApiResponse<{ id: string; deleted: boolean }>>(
      `/campaigns/${id}`,
      {
        method: "DELETE",
      }
    );
  }

  /**
   * Launches an approved draft campaign, creates message records, and queues jobs for dispatch
   */
  public async sendCampaign(
    id: string
  ): Promise<ApiResponse<LaunchCampaignSummary>> {
    return this.request<ApiResponse<LaunchCampaignSummary>>(
      `/campaigns/${id}/send`,
      {
        method: "POST",
      }
    );
  }

  /**
   * Retries enqueuing messages that remain in QUEUED status without duplicating jobs
   */
  public async retryCampaignQueue(
    id: string
  ): Promise<ApiResponse<CampaignQueueRecoverySummary>> {
    return this.request<ApiResponse<CampaignQueueRecoverySummary>>(
      `/campaigns/${id}/retry-queue`,
      {
        method: "POST",
      }
    );
  }

  /**
   * Retrieves paginated per-message delivery records for a campaign
   */
  public async getCampaignMessages(
    id: string,
    params?: { page?: number; limit?: number; status?: string }
  ): Promise<ApiResponse<CampaignMessagesResponse>> {
    const query = new URLSearchParams();
    if (params?.page) query.set("page", String(params.page));
    if (params?.limit) query.set("limit", String(params.limit));
    if (params?.status) query.set("status", params.status);
    const qs = query.toString() ? `?${query.toString()}` : "";
    return this.request<ApiResponse<CampaignMessagesResponse>>(
      `/campaigns/${id}/messages${qs}`,
      {
        method: "GET",
      }
    );
  }

  /**
   * Schedules a draft or existing campaign for automatic dispatch at a future time
   */
  public async scheduleCampaign(
    id: string,
    scheduledAt: string
  ): Promise<ApiResponse<Campaign>> {
    return this.request<ApiResponse<Campaign>>(`/campaigns/${id}/schedule`, {
      method: "POST",
      body: JSON.stringify({ scheduledAt }),
    });
  }

  /**
   * Cancels a scheduled or draft campaign before dispatch begins
   */
  public async cancelCampaign(
    id: string
  ): Promise<ApiResponse<Campaign>> {
    return this.request<ApiResponse<Campaign>>(`/campaigns/${id}/cancel`, {
      method: "POST",
    });
  }

  /**
   * Approves a scheduled campaign for dispatch (Delegated Admin / Master Admin)
   */
  public async approveCampaign(
    id: string,
    notes?: string
  ): Promise<ApiResponse<Campaign>> {
    const payload: ApproveCampaignPayload = { notes };
    return this.request<ApiResponse<Campaign>>(`/campaigns/${id}/approve`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Rejects a scheduled campaign with a required reason (Delegated Admin / Master Admin)
   */
  public async rejectCampaign(
    id: string,
    reason: string
  ): Promise<ApiResponse<Campaign>> {
    const payload: RejectCampaignPayload = { reason };
    return this.request<ApiResponse<Campaign>>(`/campaigns/${id}/reject`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Retrieves the operational status of the campaign scheduler and dispatch worker
   */
  public async getSchedulerStatus(): Promise<ApiResponse<SchedulerStatusResponse>> {
    return this.request<ApiResponse<SchedulerStatusResponse>>("/campaigns/scheduler/status", {
      method: "GET",
    });
  }

  /**
   * Registers a new customer account and organization
   */
  public async signup(
    payload: SignupPayload
  ): Promise<ApiResponse<AuthResponse>> {
    return this.request<ApiResponse<AuthResponse>>("/auth/signup", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Authenticates customer with email and password
   */
  public async login(
    payload: LoginPayload
  ): Promise<ApiResponse<AuthResponse>> {
    return this.request<ApiResponse<AuthResponse>>("/auth/login", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Revokes current session and logs out
   */
  public async logout(): Promise<ApiResponse<{ loggedOut: boolean }>> {
    return this.request<ApiResponse<{ loggedOut: boolean }>>("/auth/logout", {
      method: "POST",
    });
  }

  /**
   * Fetches current authenticated user profile and organization
   */
  public async getCurrentUser(): Promise<ApiResponse<AuthResponse>> {
    return this.request<ApiResponse<AuthResponse>>("/auth/me");
  }

  // ============================================================================
  // Contacts & Audience Management API Methods
  // ============================================================================

  /**
   * Fetches contacts list with search, filter, and pagination
   */
  public async listContacts(
    params?: import("../types/contact.js").QueryContactsParams
  ): Promise<ApiResponse<import("../types/contact.js").ContactsListResponse>> {
    const query = new URLSearchParams();
    if (params?.page) query.append("page", params.page.toString());
    if (params?.limit) query.append("limit", params.limit.toString());
    if (params?.search) query.append("search", params.search);
    if (params?.consentStatus) query.append("consentStatus", params.consentStatus);
    if (params?.isSuppressed !== undefined) query.append("isSuppressed", params.isSuppressed.toString());
    if (params?.listId) query.append("listId", params.listId);

    const queryString = query.toString();
    const endpoint = queryString ? `/contacts?${queryString}` : "/contacts";
    return this.request<ApiResponse<import("../types/contact.js").ContactsListResponse>>(endpoint);
  }

  /**
   * Fetches single contact details
   */
  public async getContact(id: string): Promise<ApiResponse<import("../types/contact.js").Contact>> {
    return this.request<ApiResponse<import("../types/contact.js").Contact>>(`/contacts/${id}`);
  }

  /**
   * Creates a new contact
   */
  public async createContact(
    payload: import("../types/contact.js").CreateContactPayload
  ): Promise<ApiResponse<import("../types/contact.js").Contact>> {
    return this.request<ApiResponse<import("../types/contact.js").Contact>>("/contacts", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Updates an existing contact
   */
  public async updateContact(
    id: string,
    payload: import("../types/contact.js").UpdateContactPayload
  ): Promise<ApiResponse<import("../types/contact.js").Contact>> {
    return this.request<ApiResponse<import("../types/contact.js").Contact>>(`/contacts/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Records a consent or suppression event for a contact
   */
  public async recordContactConsent(
    id: string,
    payload: import("../types/contact.js").UpdateConsentPayload
  ): Promise<ApiResponse<import("../types/contact.js").Contact>> {
    return this.request<ApiResponse<import("../types/contact.js").Contact>>(`/contacts/${id}/consent`, {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Deletes a contact
   */
  public async deleteContact(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<ApiResponse<{ deleted: boolean }>>(`/contacts/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Lists audience contact lists for the organization
   */
  public async listAudiences(): Promise<ApiResponse<import("../types/contact.js").ContactList[]>> {
    return this.request<ApiResponse<import("../types/contact.js").ContactList[]>>("/audiences");
  }

  /**
   * Fetches single audience list details with members
   */
  public async getAudience(
    id: string,
    page = 1,
    limit = 20
  ): Promise<ApiResponse<import("../types/contact.js").ContactListDetails>> {
    return this.request<ApiResponse<import("../types/contact.js").ContactListDetails>>(
      `/audiences/${id}?page=${page}&limit=${limit}`
    );
  }

  /**
   * Creates a new audience list
   */
  public async createAudience(
    payload: import("../types/contact.js").CreateAudiencePayload
  ): Promise<ApiResponse<import("../types/contact.js").ContactList>> {
    return this.request<ApiResponse<import("../types/contact.js").ContactList>>("/audiences", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Updates an audience list name or description
   */
  public async updateAudience(
    id: string,
    payload: import("../types/contact.js").UpdateAudiencePayload
  ): Promise<ApiResponse<import("../types/contact.js").ContactList>> {
    return this.request<ApiResponse<import("../types/contact.js").ContactList>>(`/audiences/${id}`, {
      method: "PUT",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Deletes an audience list
   */
  public async deleteAudience(id: string): Promise<ApiResponse<{ deleted: boolean }>> {
    return this.request<ApiResponse<{ deleted: boolean }>>(`/audiences/${id}`, {
      method: "DELETE",
    });
  }

  /**
   * Previews CSV content and returns detected headers with mapping suggestions
   */
  public async previewCsv(
    csvContent: string,
    fileName?: string
  ): Promise<ApiResponse<import("../types/contact.js").CsvPreviewData>> {
    return this.request<ApiResponse<import("../types/contact.js").CsvPreviewData>>(
      "/contacts/import/preview",
      {
        method: "POST",
        body: JSON.stringify({ csvContent, fileName }),
      }
    );
  }

  /**
   * Executes CSV import
   */
  public async importCsv(
    payload: import("../types/contact.js").CsvImportPayload
  ): Promise<ApiResponse<import("../types/contact.js").ImportJob>> {
    return this.request<ApiResponse<import("../types/contact.js").ImportJob>>(
      "/contacts/import",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Lists past import jobs
   */
  public async listImportJobs(): Promise<ApiResponse<import("../types/contact.js").ImportJob[]>> {
    return this.request<ApiResponse<import("../types/contact.js").ImportJob[]>>("/contacts/import-jobs");
  }

  /**
   * Fetches single import job status and diagnostic row errors
   */
  public async getImportJob(id: string): Promise<ApiResponse<import("../types/contact.js").ImportJob>> {
    return this.request<ApiResponse<import("../types/contact.js").ImportJob>>(`/contacts/import-jobs/${id}`);
  }

  /**
   * Lists WhatsApp message templates synchronized from the connected Meta WABA
   */
  public async listTemplates(
    forceSync = false,
    approvedOnly = false
  ): Promise<ApiResponse<import("../types/template.js").TemplatesListResponseData>> {
    const params = new URLSearchParams();
    if (forceSync) params.set("force", "true");
    if (approvedOnly) params.set("approvedOnly", "true");
    const query = params.toString() ? `?${params.toString()}` : "";
    return this.request<ApiResponse<import("../types/template.js").TemplatesListResponseData>>(`/templates${query}`);
  }

  /**
   * Forces synchronization of templates directly from Meta WhatsApp Business Account
   */
  public async syncTemplates(): Promise<ApiResponse<import("../types/template.js").TemplatesListResponseData>> {
    return this.request<ApiResponse<import("../types/template.js").TemplatesListResponseData>>("/templates/sync", {
      method: "POST",
    });
  }

  /**
   * Validates parameter mappings against a template's required variables
   */
  public async validateTemplateParameters(
    name: string,
    variables: Record<string, string>
  ): Promise<ApiResponse<{ templateName: string; isValid: boolean; errors: Record<string, string> }>> {
    return this.request<ApiResponse<{ templateName: string; isValid: boolean; errors: Record<string, string> }>>(
      `/templates/${encodeURIComponent(name)}/validate`,
      {
        method: "POST",
        body: JSON.stringify({ variables }),
      }
    );
  }

  /**
   * Submits a new custom template to Meta WhatsApp Cloud API for review
   */
  public async createTemplate(
    payload: import("../types/template.js").SubmitTemplatePayload
  ): Promise<ApiResponse<import("../types/template.js").SubmittedTemplateResponse>> {
    return this.request<ApiResponse<import("../types/template.js").SubmittedTemplateResponse>>("/templates", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }


  // ============================================================================
  // Phase 6D: WhatsApp Channel Integration Management API Methods
  // ============================================================================

  /**
   * Fetches current organization's WhatsApp connection status and safe metadata.
   * Safe metadata never includes access tokens, ciphertexts, or encryption keys.
   */
  public async getWhatsAppStatus(): Promise<ApiResponse<SafeConnectionStatus>> {
    return this.request<ApiResponse<SafeConnectionStatus>>("/integrations/whatsapp/status");
  }

  /**
   * Connects and verifies a WhatsApp Business Account (WABA) using Meta credentials.
   * Securely transmits credentials over HTTPS/cookie session without local persistence.
   */
  public async connectWhatsApp(
    payload: ConnectWhatsAppPayload
  ): Promise<ApiResponse<SafeConnectionStatus>> {
    return this.request<ApiResponse<SafeConnectionStatus>>("/integrations/whatsapp/connect", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Revalidates current organization's connection using its server-stored encrypted token.
   */
  public async refreshWhatsApp(): Promise<ApiResponse<SafeConnectionStatus>> {
    return this.request<ApiResponse<SafeConnectionStatus>>("/integrations/whatsapp/refresh", {
      method: "POST",
    });
  }

  /**
   * Disconnects current organization's WhatsApp connection and removes active credentials.
   * Preserves historical messages, campaigns, contacts, and webhook audit logs.
   */
  public async disconnectWhatsApp(): Promise<ApiResponse<DisconnectWhatsAppResponse>> {
    return this.request<ApiResponse<DisconnectWhatsAppResponse>>("/integrations/whatsapp/disconnect", {
      method: "DELETE",
    });
  }

  /**
   * Queries server-side evaluated platform capabilities.
   * Completely unprivileged by default; only returns isPlatformAdmin: true
   * if caller has verified platform-level credentials on the server.
   */
  public async getPlatformCapabilities(): Promise<ApiResponse<PlatformCapabilities>> {
    return this.request<ApiResponse<PlatformCapabilities>>("/admin/platform/capabilities");
  }

  /**
   * Fetches real-time Master Admin platform telemetry and counts.
   */
  public async getPlatformOverview(): Promise<ApiResponse<PlatformOverview>> {
    return this.request<ApiResponse<PlatformOverview>>("/admin/platform/overview");
  }

  /**
   * Fetches paginated customer organizations for the Master Admin directory.
   */
  public async getPlatformOrganizations(params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<PlatformOrganizationsResponse>> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status && params.status !== "all") searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));

    const queryString = searchParams.toString();
    const endpoint = `/admin/platform/organizations${queryString ? `?${queryString}` : ""}`;
    return this.request<ApiResponse<PlatformOrganizationsResponse>>(endpoint);
  }

  /**
   * Fetches detailed information for a single customer organization.
   */
  public async getPlatformOrganization(id: string): Promise<ApiResponse<PlatformOrganizationDetail>> {
    return this.request<ApiResponse<PlatformOrganizationDetail>>(`/admin/platform/organizations/${id}`);
  }

  /**
   * Deactivates/archives a customer organization.
   */
  public async archivePlatformOrganization(id: string): Promise<ApiResponse<PlatformOrganizationSummary>> {
    return this.request<ApiResponse<PlatformOrganizationSummary>>(`/admin/platform/organizations/${id}/archive`, {
      method: "POST",
    });
  }

  /**
   * Reactivates an archived customer organization.
   */
  public async reactivatePlatformOrganization(id: string): Promise<ApiResponse<PlatformOrganizationSummary>> {
    return this.request<ApiResponse<PlatformOrganizationSummary>>(`/admin/platform/organizations/${id}/reactivate`, {
      method: "POST",
    });
  }

  /**
   * Inspects safe Shared WhatsApp Platform connection status.
   */
  public async getPlatformWhatsAppStatus(): Promise<ApiResponse<PlatformWhatsAppStatus>> {
    return this.request<ApiResponse<PlatformWhatsAppStatus>>("/admin/platform/whatsapp/status");
  }

  /**
   * Connects or updates shared platform WhatsApp credentials.
   * Transmits credentials over HTTPS session cookies to the platform admin endpoint.
   * Never stores or logs plain text tokens in frontend logs.
   */
  public async connectPlatformWhatsApp(
    payload: ConnectPlatformWhatsAppPayload
  ): Promise<ApiResponse<PlatformWhatsAppStatus>> {
    return this.request<ApiResponse<PlatformWhatsAppStatus>>(
      "/admin/platform/whatsapp/connect",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Re-verifies stored platform WhatsApp credentials against Meta Graph API.
   */
  public async refreshPlatformWhatsApp(): Promise<ApiResponse<PlatformWhatsAppStatus>> {
    return this.request<ApiResponse<PlatformWhatsAppStatus>>(
      "/admin/platform/whatsapp/refresh",
      {
        method: "POST",
      }
    );
  }

  /**
   * Disconnects the shared platform WhatsApp account and tombstones credentials.
   */
  public async disconnectPlatformWhatsApp(): Promise<ApiResponse<DisconnectPlatformWhatsAppResponse>> {
    return this.request<ApiResponse<DisconnectPlatformWhatsAppResponse>>(
      "/admin/platform/whatsapp/disconnect",
      {
        method: "DELETE",
      }
    );
  }

  /**
   * Fetches templates for the shared platform WABA.
   */
  public async getPlatformTemplates(forceRefresh = false): Promise<ApiResponse<PlatformTemplateResponse>> {
    return this.request<ApiResponse<PlatformTemplateResponse>>(
      `/admin/platform/templates${forceRefresh ? "?force=true" : ""}`
    );
  }

  // ============================================================================
  // Step 4: Delegated Business Assignment Management API Methods
  // ============================================================================

  /**
   * Fetches paginated business assignments with status filtering and text search.
   */
  public async getPlatformAssignments(params?: {
    search?: string;
    status?: string;
    page?: number;
    limit?: number;
  }): Promise<ApiResponse<BusinessAssignmentsListResponse>> {
    const searchParams = new URLSearchParams();
    if (params?.search) searchParams.set("search", params.search);
    if (params?.status && params.status !== "ALL") searchParams.set("status", params.status);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));

    const queryString = searchParams.toString();
    const endpoint = `/admin/platform/assignments${queryString ? `?${queryString}` : ""}`;
    return this.request<ApiResponse<BusinessAssignmentsListResponse>>(endpoint);
  }

  /**
   * Creates a business assignment delegating an organization to a DELEGATED_ADMIN user.
   */
  public async createPlatformAssignment(
    payload: CreateBusinessAssignmentPayload
  ): Promise<ApiResponse<BusinessAssignmentSummary>> {
    return this.request<ApiResponse<BusinessAssignmentSummary>>("/admin/platform/assignments", {
      method: "POST",
      body: JSON.stringify(payload),
    });
  }

  /**
   * Revokes an active business assignment safely.
   */
  public async revokePlatformAssignment(
    id: string,
    payload?: RevokeBusinessAssignmentPayload
  ): Promise<ApiResponse<BusinessAssignmentSummary>> {
    return this.request<ApiResponse<BusinessAssignmentSummary>>(
      `/admin/platform/assignments/${id}/revoke`,
      {
        method: "POST",
        body: JSON.stringify(payload || {}),
      }
    );
  }

  /**
   * Fetches eligible users with DELEGATED_ADMIN role for assignment dropdown.
   */
  public async getEligibleDelegatedAdmins(): Promise<ApiResponse<EligibleDelegatedAdmin[]>> {
    return this.request<ApiResponse<EligibleDelegatedAdmin[]>>(
      "/admin/platform/assignments/delegated-admins"
    );
  }

  /**
   * Fetches organizations assigned to the currently authenticated administrator.
   */
  public async getMyAssignedOrganizations(): Promise<ApiResponse<AssignedOrganizationSummary[]>> {
    return this.request<ApiResponse<AssignedOrganizationSummary[]>>(
      "/admin/platform/assignments/my-assigned-organizations"
    );
  }

  /**
   * Fetches all delegated administrators for the Master Admin Admins tab.
   */
  public async getDelegatedAdmins(): Promise<ApiResponse<DelegatedAdminItem[]>> {
    return this.request<ApiResponse<DelegatedAdminItem[]>>(
      "/admin/platform/admins"
    );
  }

  /**
   * Creates a new delegated administrator with chosen credentials.
   */
  public async createDelegatedAdmin(
    payload: CreateDelegatedAdminPayload
  ): Promise<ApiResponse<DelegatedAdminItem>> {
    return this.request<ApiResponse<DelegatedAdminItem>>(
      "/admin/platform/admins",
      {
        method: "POST",
        body: JSON.stringify(payload),
      }
    );
  }

  /**
   * Fetches tenant-scoped analytics overview (summary metrics, rates, trends, scheduling).
   */
  public async getAnalyticsOverview(
    params?: QueryAnalyticsOverviewParams
  ): Promise<ApiResponse<AnalyticsOverview>> {
    const searchParams = new URLSearchParams();
    if (params?.campaignId) searchParams.set("campaignId", params.campaignId);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);
    if (params?.timeRange) searchParams.set("timeRange", params.timeRange);

    const queryString = searchParams.toString();
    const endpoint = `/analytics/overview${queryString ? `?${queryString}` : ""}`;
    return this.request<ApiResponse<AnalyticsOverview>>(endpoint);
  }

  /**
   * Fetches searchable, paginated recipient-level delivery report.
   */
  public async getDeliveryReport(
    params?: QueryDeliveryReportParams
  ): Promise<ApiResponse<DeliveryReportResponse>> {
    const searchParams = new URLSearchParams();
    if (params?.campaignId) searchParams.set("campaignId", params.campaignId);
    if (params?.status && params.status !== "ALL") searchParams.set("status", params.status);
    if (params?.templateName) searchParams.set("templateName", params.templateName);
    if (params?.search) searchParams.set("search", params.search);
    if (params?.startDate) searchParams.set("startDate", params.startDate);
    if (params?.endDate) searchParams.set("endDate", params.endDate);
    if (params?.page) searchParams.set("page", String(params.page));
    if (params?.limit) searchParams.set("limit", String(params.limit));
    if (params?.sortBy) searchParams.set("sortBy", params.sortBy);
    if (params?.sortOrder) searchParams.set("sortOrder", params.sortOrder);

    const queryString = searchParams.toString();
    const endpoint = `/analytics/messages${queryString ? `?${queryString}` : ""}`;
    return this.request<ApiResponse<DeliveryReportResponse>>(endpoint);
  }
}

export const apiClient = new ApiClient(API_BASE_URL);

