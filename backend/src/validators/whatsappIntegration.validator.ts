import { z } from "zod";

/**
 * Validation schema for connecting a tenant-specific WhatsApp Business Account (WABA).
 * Accepts alphanumeric/underscore WABA and Phone IDs (up to 64 chars) and System User Access Token.
 */
export const connectWhatsAppSchema = z.object({
  wabaId: z
    .string({ required_error: "wabaId is required" })
    .trim()
    .min(1, "wabaId cannot be empty")
    .max(64, "wabaId cannot exceed 64 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "wabaId must be a valid Meta identifier"),

  phoneNumberId: z
    .string({ required_error: "phoneNumberId is required" })
    .trim()
    .min(1, "phoneNumberId cannot be empty")
    .max(64, "phoneNumberId cannot exceed 64 characters")
    .regex(/^[a-zA-Z0-9_-]+$/, "phoneNumberId must be a valid Meta identifier"),

  accessToken: z
    .string({ required_error: "accessToken is required" })
    .trim()
    .min(10, "accessToken must be at least 10 characters")
    .max(2000, "accessToken exceeds maximum permitted length"),
});

export type ConnectWhatsAppInput = z.infer<typeof connectWhatsAppSchema>;
