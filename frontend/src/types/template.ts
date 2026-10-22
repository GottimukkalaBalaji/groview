export type TemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type TemplateStatus = "APPROVED" | "PENDING" | "DRAFT" | "REJECTED" | "PAUSED" | "DISABLED";

export type HeaderType = "NONE" | "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO" | "LOCATION";

export type ButtonType = "QUICK_REPLY" | "URL" | "PHONE_NUMBER";

export interface TemplateButton {
  id: string;
  type: ButtonType;
  text: string;
  url?: string;
  phoneNumber?: string;
}

export interface TemplateVariable {
  key: string;
  index?: number;
  component?: "HEADER" | "BODY";
  label?: string;
  suggestedMapping?: string;
  fallbackValue?: string;
  sampleValue?: string;
  required?: boolean;
}

export interface WhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: TemplateCategory;
  status: TemplateStatus;
  isSendable?: boolean;
  parameterFormat?: "POSITIONAL" | "NAMED";
  lastUpdated?: string;
  header: {
    type: HeaderType;
    format?: HeaderType;
    text?: string;
    mediaUrl?: string;
    mediaFilename?: string;
    mediaFilesize?: string;
    mediaIsLocal?: boolean;
    mimeType?: string;
  };
  body: string;
  variables: TemplateVariable[];
  footer?: string;
  buttons: TemplateButton[];
}

export interface TemplateSyncSummary {
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
}

export interface TemplatesListResponseData {
  templates: WhatsAppTemplate[];
  summary: TemplateSyncSummary;
  organizationId?: string;
}
