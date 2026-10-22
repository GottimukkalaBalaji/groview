export type MetaTemplateCategory = "MARKETING" | "UTILITY" | "AUTHENTICATION";

export type MetaTemplateStatus =
  | "APPROVED"
  | "PENDING"
  | "REJECTED"
  | "PAUSED"
  | "DISABLED"
  | "FLAGGED"
  | (string & {});


export interface MetaTemplateComponent {
  type: "HEADER" | "BODY" | "FOOTER" | "BUTTONS";
  format?: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO" | "LOCATION";
  text?: string;
  buttons?: Array<{
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
    text: string;
    url?: string;
    phone_number?: string;
  }>;
  example?: {
    header_text?: string[];
    body_text?: string[][];
    header_handle?: string[];
  };
}

export interface RawMetaTemplate {
  id: string;
  name: string;
  language: string;
  status: MetaTemplateStatus;
  category: MetaTemplateCategory;
  components: MetaTemplateComponent[];
  parameter_format?: "POSITIONAL" | "NAMED";
  rejected_reason?: string;
}

export interface TemplateVariableSpec {
  key: string;              // e.g. "1", "2", "3"
  index: number;            // 1-based index
  component: "HEADER" | "BODY";
  label: string;            // e.g. "Recipient Name ({{1}})"
  suggestedMapping?: string;// e.g. "firstName"
  exampleValue?: string;    // e.g. "John"
  required: boolean;
}

export interface NormalizedWhatsAppTemplate {
  id: string;
  name: string;
  language: string;
  category: MetaTemplateCategory;
  status: MetaTemplateStatus;
  isSendable: boolean;       // only true if status === "APPROVED"
  parameterFormat: "POSITIONAL" | "NAMED";
  header?: {
    format: "TEXT" | "IMAGE" | "DOCUMENT" | "VIDEO" | "LOCATION" | "NONE";
    text?: string;
  };
  body: string;
  footer?: string;
  buttons: Array<{
    type: "QUICK_REPLY" | "URL" | "PHONE_NUMBER";
    text: string;
    url?: string;
    phoneNumber?: string;
  }>;
  variables: TemplateVariableSpec[];
  rawComponents: MetaTemplateComponent[];
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
