import { z } from "zod";

export const CampaignStatusEnum = z.enum([
  "DRAFT",
  "SCHEDULED",
  "QUEUED",
  "SENDING",
  "COMPLETED",
  "FAILED",
  "CANCELLED",
]);

export const AudienceTypeEnum = z.enum(["MOCK", "CONTACT_LIST", "SEGMENT"]);

/**
 * Validation schema for creating a new Campaign draft
 */
export const createCampaignSchema = z.object({
  name: z
    .string({ required_error: "Campaign name is required" })
    .trim()
    .min(3, "Campaign name must be at least 3 characters")
    .max(100, "Campaign name cannot exceed 100 characters"),
  description: z
    .string()
    .trim()
    .max(500, "Campaign description cannot exceed 500 characters")
    .optional()
    .nullable(),
  templateId: z
    .string({ required_error: "Template ID is required" })
    .trim()
    .min(1, "Template ID cannot be empty"),
  templateName: z
    .string({ required_error: "Template name is required" })
    .trim()
    .min(1, "Template name cannot be empty"),
  templateLanguage: z
    .string()
    .trim()
    .min(2, "Template language must be a valid locale code")
    .default("en_US"),
  templateCategory: z
    .string()
    .trim()
    .default("MARKETING"),
  variablesMapping: z
    .record(
      z.string(),
      z.any()
    )
    .default({})
    .refine(
      (val) => {
        try {
          JSON.stringify(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "variablesMapping must be valid JSON-serializable object" }
    ),
  audienceType: AudienceTypeEnum.default("MOCK"),
  audienceId: z
    .string()
    .trim()
    .optional()
    .nullable(),
  audienceName: z
    .string()
    .trim()
    .max(100, "Audience name cannot exceed 100 characters")
    .default("All Audience"),
  totalRecipients: z
    .number({ invalid_type_error: "totalRecipients must be a number" })
    .int("totalRecipients must be an integer")
    .nonnegative("totalRecipients cannot be negative")
    .default(0),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be a valid ISO-8601 UTC date string" })
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true;
        return new Date(val).getTime() > Date.now();
      },
      { message: "scheduledAt must be a future timestamp" }
    ),
  clientRequestId: z
    .string()
    .trim()
    .max(64, "clientRequestId cannot exceed 64 characters")
    .optional(),
});

/**
 * Validation schema for updating an existing Campaign draft
 */
export const updateCampaignSchema = z.object({
  name: z
    .string()
    .trim()
    .min(3, "Campaign name must be at least 3 characters")
    .max(100, "Campaign name cannot exceed 100 characters")
    .optional(),
  description: z
    .string()
    .trim()
    .max(500, "Campaign description cannot exceed 500 characters")
    .optional()
    .nullable(),
  templateId: z
    .string()
    .trim()
    .min(1, "Template ID cannot be empty")
    .optional(),
  templateName: z
    .string()
    .trim()
    .min(1, "Template name cannot be empty")
    .optional(),
  templateLanguage: z
    .string()
    .trim()
    .min(2, "Template language must be a valid locale code")
    .optional(),
  templateCategory: z
    .string()
    .trim()
    .optional(),
  variablesMapping: z
    .record(
      z.string(),
      z.any()
    )
    .optional()
    .refine(
      (val) => {
        if (val === undefined) return true;
        try {
          JSON.stringify(val);
          return true;
        } catch {
          return false;
        }
      },
      { message: "variablesMapping must be valid JSON-serializable object" }
    ),
  audienceType: AudienceTypeEnum.optional(),
  audienceId: z
    .string()
    .trim()
    .optional()
    .nullable(),
  audienceName: z
    .string()
    .trim()
    .max(100, "Audience name cannot exceed 100 characters")
    .optional(),
  totalRecipients: z
    .number({ invalid_type_error: "totalRecipients must be a number" })
    .int("totalRecipients must be an integer")
    .nonnegative("totalRecipients cannot be negative")
    .optional(),
  scheduledAt: z
    .string()
    .datetime({ message: "scheduledAt must be a valid ISO-8601 UTC date string" })
    .optional()
    .nullable()
    .refine(
      (val) => {
        if (!val) return true;
        return new Date(val).getTime() > Date.now();
      },
      { message: "scheduledAt must be a future timestamp" }
    ),
  clientRequestId: z
    .string()
    .trim()
    .max(64, "clientRequestId cannot exceed 64 characters")
    .optional(),
});

/**
 * Validation schema for query parameters when listing campaigns
 */
export const queryCampaignsSchema = z.object({
  search: z
    .string()
    .trim()
    .optional(),
  status: z
    .enum([
      "ALL",
      "DRAFT",
      "SCHEDULED",
      "QUEUED",
      "SENDING",
      "COMPLETED",
      "FAILED",
      "CANCELLED",
    ])
    .default("ALL")
    .optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().positive().default(1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 10))
    .pipe(z.number().int().min(1).max(100).default(10)),
  sortBy: z
    .enum(["createdAt", "updatedAt", "name", "totalRecipients"])
    .default("createdAt")
    .optional(),
  sortOrder: z
    .enum(["asc", "desc"])
    .default("desc")
    .optional(),
});

/**
 * Validation schema for :id path parameter
 */
export const campaignIdParamSchema = z.object({
  id: z
    .string({ required_error: "Campaign ID path parameter is required" })
    .trim()
    .min(1, "Campaign ID cannot be empty"),
});

/**
 * Validation schema for scheduling a campaign
 */
export const scheduleCampaignSchema = z.object({
  scheduledAt: z
    .string({ required_error: "scheduledAt is required" })
    .datetime({ message: "scheduledAt must be a valid ISO-8601 UTC date string" })
    .refine(
      (val) => new Date(val).getTime() > Date.now(),
      { message: "scheduledAt must be a future timestamp" }
    ),
});

export type CreateCampaignInput = z.infer<typeof createCampaignSchema>;
export type UpdateCampaignInput = z.infer<typeof updateCampaignSchema>;
export type QueryCampaignsInput = z.infer<typeof queryCampaignsSchema>;
export type ScheduleCampaignInput = z.infer<typeof scheduleCampaignSchema>;
