export type ConsentStatus = "OPTED_IN" | "OPTED_OUT" | "PENDING" | "UNKNOWN";
export type ConsentEventType = "OPT_IN" | "OPT_OUT" | "SUPPRESS" | "UNSUPPRESS";
export type ImportJobStatus =
  | "PENDING"
  | "PROCESSING"
  | "COMPLETED"
  | "COMPLETED_WITH_ERRORS"
  | "FAILED";

export interface ContactListRef {
  id: string;
  name: string;
}

export interface Contact {
  id: string;
  organizationId: string;
  phoneNumber: string;
  countryCode: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  customAttributes: Record<string, unknown>;
  consentStatus: ConsentStatus;
  consentSource: string | null;
  consentTimestamp: string | null;
  isSuppressed: boolean;
  suppressedAt: string | null;
  suppressionReason: string | null;
  createdAt: string;
  updatedAt: string;
  lists: ContactListRef[];
}

export interface ContactList {
  id: string;
  name: string;
  description: string | null;
  memberCount: number;
  eligibleMemberCount?: number;
  createdAt: string;
  updatedAt: string;
}

export interface ContactListDetails extends ContactList {
  members: Array<Contact & { addedAt: string; source: string | null }>;
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
  };
}

export interface QueryContactsParams {
  page?: number;
  limit?: number;
  search?: string;
  consentStatus?: ConsentStatus;
  isSuppressed?: boolean;
  listId?: string;
}

export interface ContactsListResponse {
  items: Contact[];
  pagination: {
    page: number;
    limit: number;
    totalItems: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
}

export interface CreateContactPayload {
  phoneNumber: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  consentStatus?: "OPTED_IN" | "PENDING" | "UNKNOWN";
  consentSource?: string;
  customAttributes?: Record<string, unknown>;
  listIds?: string[];
}

export interface UpdateContactPayload {
  firstName?: string;
  lastName?: string;
  email?: string;
  customAttributes?: Record<string, unknown>;
}

export interface UpdateConsentPayload {
  eventType: ConsentEventType;
  source: string;
  evidence?: string;
}

export interface CreateAudiencePayload {
  name: string;
  description?: string;
}

export interface UpdateAudiencePayload {
  name?: string;
  description?: string;
}

export interface CsvPreviewData {
  headers: string[];
  totalEstimatedRows: number;
  previewRows: Array<Record<string, string>>;
  suggestedMappings: {
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    consentStatus?: string;
  };
}

export interface CsvImportPayload {
  csvContent: string;
  fileName: string;
  clientRequestId: string;
  listId?: string;
  newListName?: string;
  mappings: {
    phoneNumber: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    consentStatus?: string;
    customAttributes?: string[];
  };
  defaultCountryCode?: string;
  operatorConsentDeclaration?: string;
}

export interface RowErrorItem {
  rowNumber: number;
  reason: string;
  rawPhone?: string;
}

export interface ImportJob {
  id: string;
  organizationId: string;
  listId: string | null;
  listName: string | null;
  fileName: string;
  fileSizeBytes: number;
  status: ImportJobStatus;
  totalRows: number;
  processedRows: number;
  createdContacts: number;
  updatedContacts: number;
  addedToList: number;
  skippedDuplicates: number;
  skippedSuppressed: number;
  invalidRows: number;
  rowErrors: RowErrorItem[];
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
}
