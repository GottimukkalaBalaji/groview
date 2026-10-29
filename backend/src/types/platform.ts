/**
 * Grovastra Platform Administrator & Multi-Tenant Role Architecture Types
 *
 * Defines the strict separation between:
 * 1. Platform Master Admin (Global system governance, WhatsApp platform config, all tenants)
 * 2. Delegated Admin (Assigned subset of customer businesses)
 * 3. Organization OWNER (Single tenant root owner)
 * 4. Organization ADMIN (Single tenant operator)
 * 5. Organization MEMBER (Single tenant contributor)
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

export interface PlatformPrincipal {
  isPlatformAdmin: boolean;
  platformRole: PlatformRole;
  userId?: string;
  organizationId?: string;
  assignedOrganizationIds: string[];
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
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
  createdAt: Date;
  updatedAt: Date;
}

export interface PlatformOrganizationDetail {
  id: string;
  name: string;
  slug: string;
  status: "ACTIVE" | "ARCHIVED";
  isArchived: boolean;
  deletedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
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
    lastSyncedAt: Date | null;
    lastError: string | null;
    tokenExpiresAt: Date | null;
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
  assignedAt: Date | string;
  revokedAt: Date | string | null;
  assignmentReason: string | null;
  revocationReason: string | null;
  metadata?: Record<string, unknown> | null;
  createdAt: Date | string;
  updatedAt: Date | string;
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

export interface DelegatedAdminSummary {
  id: string;
  email: string;
  firstName: string;
  lastName: string | null;
  platformRole: PlatformRole;
  organizationId: string;
  organizationName?: string;
  activeAssignmentsCount: number;
  assignedOrganizations?: Array<{ id: string; name: string }>;
  createdAt: Date | string;
}

