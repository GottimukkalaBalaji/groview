import { z } from "zod";

/**
 * Validation schema for querying multi-tenant platform campaign approvals.
 */
export const queryPlatformCampaignApprovalsSchema = z.object({
  status: z
    .enum(["ALL", "PENDING", "APPROVED", "REJECTED"])
    .default("PENDING")
    .optional(),
  organizationId: z
    .string()
    .trim()
    .min(1, "Organization ID cannot be empty")
    .optional(),
  search: z
    .string()
    .trim()
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
    .enum(["createdAt", "updatedAt", "name", "scheduledAt", "totalRecipients"])
    .default("createdAt")
    .optional(),
  sortOrder: z
    .enum(["asc", "desc"])
    .default("desc")
    .optional(),
});

export type QueryPlatformCampaignApprovalsInput = z.infer<
  typeof queryPlatformCampaignApprovalsSchema
>;
