/**
 * Grovastra Platform Administrator & Multi-Tenant Role Architecture Types
 */

export type PlatformRole = "PLATFORM_MASTER_ADMIN" | "DELEGATED_ADMIN" | "NONE";

export interface PlatformCapabilities {
  isPlatformAdmin: boolean;
  platformRole: PlatformRole;
  canManagePlatformWhatsApp: boolean;
  canManageAllOrganizations: boolean;
  canAssignBusinesses: boolean;
  assignedOrganizationIds?: string[];
}

export interface PlatformOverview {
  platformStatus: string;
  mode: string;
  organizations: {
    total: number;
    active: number;
    archived: number;
  };
  users: {
    total: number;
    masterAdmins: number;
    delegatedAdmins: number;
    regularUsers: number;
  };
  whatsapp: {
    connected: boolean;
    status: string;
    mode: string;
    source: string;
    wabaId: string | null;
    phoneNumberId: string | null;
    displayPhoneNumber: string | null;
    verifiedName: string | null;
    tokenExpiresAt: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
    organizationsWithConnectedAccount: number;
  };
}

export interface PlatformOrganizationSummary {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "ARCHIVED";
  isArchived: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  userCount: number;
  hasMetaAccount: boolean;
}

export interface PlatformOrganizationUser {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: string;
  platformRole: PlatformRole;
  createdAt: string;
  updatedAt: string;
}

export interface PlatformOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "ARCHIVED";
  isArchived: boolean;
  deletedAt: string | null;
  createdAt: string;
  updatedAt: string;
  users: PlatformOrganizationUser[];
  counts: {
    campaigns: number;
    contacts: number;
    contactLists: number;
    users: number;
  };
  metaAccount: {
    status: string;
    wabaId: string;
    phoneNumberId: string;
    verifiedName: string | null;
    displayPhoneNumber: string | null;
    lastSyncedAt: string | null;
    lastError: string | null;
    tokenExpiresAt: string | null;
  } | null;
}

export interface PlatformOrganizationsResponse {
  organizations: PlatformOrganizationSummary[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
}

export interface PlatformWhatsAppStatus {
  connected: boolean;
  status: string;
  source: string;
  mode: string;
  canManageCredentials: boolean;
  isSharedPlatform: boolean;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  tokenExpiresAt: string | null;
  verifiedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface ConnectPlatformWhatsAppPayload {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

export interface DisconnectPlatformWhatsAppResponse {
  success: boolean;
  message: string;
  status: string;
}

export interface PlatformTemplateItem {
  id: string;
  name: string;
  language: string;
  category: string;
  status: string;
  isSendable: boolean;
  parameterFormat: string;
  body: string;
  header?: {
    format: string;
    text?: string;
  };
  footer?: string;
}

export interface PlatformTemplateResponse {
  templates: PlatformTemplateItem[];
  summary: {
    totalOnMeta: number;
    approvedCount: number;
    pendingCount: number;
    rejectedCount: number;
    wabaIdMasked: string;
    syncedAt: string;
    requestedTemplatesFound: {
      hello_world: boolean;
      jaspers_market_plain_text_v1: boolean;
      jaspers_market_order_confirmation_v1: boolean;
    };
  };
}

export interface BusinessAssignmentSummary {
  id: string;
  organizationId: string;
  organization: {
    id: string;
    name: string;
    slug: string;
    isArchived: boolean;
  };
  userId: string;
  user: {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
    platformRole: PlatformRole;
  };
  assignedById: string | null;
  assignedBy?: {
    id: string;
    email: string;
    firstName: string;
    lastName: string | null;
  } | null;
  status: "ACTIVE" | "REVOKED";
  assignedAt: string;
  revokedAt: string | null;
  assignmentReason: string | null;
  revocationReason: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: string;
  updatedAt: string;
}

export interface BusinessAssignmentsListResponse {
  assignments: BusinessAssignmentSummary[];
  pagination: {
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  };
  tableDeployed: boolean;
  message?: string;
}

export interface CreateBusinessAssignmentPayload {
  organizationId: string;
  userId: string;
  assignmentReason?: string;
}

export interface RevokeBusinessAssignmentPayload {
  revocationReason?: string;
}

export interface EligibleDelegatedAdmin {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  platformRole: PlatformRole;
  organizationId: string;
  organizationName?: string;
}

export interface AssignedOrganizationSummary {
  id: string;
  name: string;
  slug: string;
}

