import { z } from "zod";

export const createBusinessAssignmentSchema = z.object({
  organizationId: z
    .string({ required_error: "Organization ID is required" })
    .trim()
    .min(1, "Organization ID is required"),
  userId: z
    .string({ required_error: "User ID is required" })
    .trim()
    .min(1, "User ID is required"),
  assignmentReason: z
    .string()
    .trim()
    .max(500, "Assignment reason cannot exceed 500 characters")
    .optional(),
});

export const revokeBusinessAssignmentSchema = z.object({
  revocationReason: z
    .string()
    .trim()
    .max(500, "Revocation reason cannot exceed 500 characters")
    .optional(),
});

export const queryBusinessAssignmentsSchema = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(100).default(10),
  status: z.enum(["ALL", "ACTIVE", "REVOKED"]).default("ALL"),
  search: z.string().trim().optional(),
});

export type CreateBusinessAssignmentInput = z.infer<typeof createBusinessAssignmentSchema>;
export type RevokeBusinessAssignmentInput = z.infer<typeof revokeBusinessAssignmentSchema>;
export type QueryBusinessAssignmentsInput = z.infer<typeof queryBusinessAssignmentsSchema>;
