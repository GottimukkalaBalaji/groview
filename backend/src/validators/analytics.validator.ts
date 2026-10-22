import { z } from "zod";

export const queryAnalyticsOverviewSchema = z.object({
  campaignId: z.string().trim().optional(),
  startDate: z
    .string()
    .datetime({ message: "startDate must be a valid ISO-8601 UTC date string" })
    .optional(),
  endDate: z
    .string()
    .datetime({ message: "endDate must be a valid ISO-8601 UTC date string" })
    .optional(),
  timeRange: z
    .enum(["7d", "30d", "90d", "all"])
    .default("30d")
    .optional(),
});

export const queryDeliveryReportSchema = z.object({
  campaignId: z.string().trim().optional(),
  status: z
    .enum([
      "ALL",
      "QUEUED",
      "SENDING",
      "SUBMITTED_UNCONFIRMED",
      "ACCEPTED",
      "SENT",
      "DELIVERED",
      "READ",
      "FAILED",
    ])
    .default("ALL")
    .optional(),
  templateName: z.string().trim().optional(),
  search: z.string().trim().optional(),
  startDate: z
    .string()
    .datetime({ message: "startDate must be a valid ISO-8601 UTC date string" })
    .optional(),
  endDate: z
    .string()
    .datetime({ message: "endDate must be a valid ISO-8601 UTC date string" })
    .optional(),
  page: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 1))
    .pipe(z.number().int().positive().default(1)),
  limit: z
    .string()
    .optional()
    .transform((val) => (val ? parseInt(val, 10) : 20))
    .pipe(z.number().int().min(1).max(100).default(20)),
  sortBy: z
    .enum(["createdAt", "sentAt", "deliveredAt", "readAt", "status", "attemptCount"])
    .default("createdAt")
    .optional(),
  sortOrder: z
    .enum(["asc", "desc"])
    .default("desc")
    .optional(),
});

export type QueryAnalyticsOverviewInput = z.infer<typeof queryAnalyticsOverviewSchema>;
export type QueryDeliveryReportInput = z.infer<typeof queryDeliveryReportSchema>;
