import { z } from "zod";

/**
 * Validation schema for delegated admin creation by Platform Master Admin.
 * Enforces email normalization, name length constraints, and password complexity rules.
 */
export const createDelegatedAdminSchema = z.object({
  email: z
    .string({ required_error: "Email is required" })
    .trim()
    .toLowerCase()
    .email("Please provide a valid email address")
    .max(255, "Email cannot exceed 255 characters"),

  password: z
    .string({ required_error: "Password is required" })
    .min(8, "Password must be at least 8 characters long")
    .max(128, "Password cannot exceed 128 characters")
    .regex(/[A-Z]/, "Password must contain at least one uppercase letter")
    .regex(/[a-z]/, "Password must contain at least one lowercase letter")
    .regex(/[0-9]/, "Password must contain at least one numeric digit"),

  firstName: z
    .string({ required_error: "First name is required" })
    .trim()
    .min(1, "First name cannot be empty")
    .max(100, "First name cannot exceed 100 characters"),

  lastName: z
    .string()
    .trim()
    .max(100, "Last name cannot exceed 100 characters")
    .optional()
    .nullable(),
});

export type CreateDelegatedAdminInput = z.infer<typeof createDelegatedAdminSchema>;
