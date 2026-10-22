import { z } from "zod";

export const queryContactsSchema = z.object({
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  search: z.string().trim().optional(),
  consentStatus: z
    .enum(["OPTED_IN", "OPTED_OUT", "PENDING", "UNKNOWN"])
    .optional(),
  isSuppressed: z
    .enum(["true", "false"])
    .transform((val) => val === "true")
    .optional(),
  listId: z.string().trim().optional(),
});

export type QueryContactsInput = z.infer<typeof queryContactsSchema>;

export const createContactSchema = z.object({
  phoneNumber: z
    .string()
    .trim()
    .min(7, "Phone number is too short")
    .max(20, "Phone number is too long"),
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email("Invalid email address").max(255).optional().or(z.literal("")),
  customAttributes: z.record(z.unknown()).optional(),
  listIds: z.array(z.string().trim()).optional(),
  consentStatus: z
    .enum(["OPTED_IN", "PENDING", "UNKNOWN"])
    .default("PENDING"),
  consentSource: z.string().trim().max(100).optional(),
});

export type CreateContactInput = z.infer<typeof createContactSchema>;

export const updateContactSchema = z.object({
  firstName: z.string().trim().max(100).optional(),
  lastName: z.string().trim().max(100).optional(),
  email: z.string().trim().email("Invalid email address").max(255).optional().or(z.literal("")),
  customAttributes: z.record(z.unknown()).optional(),
});

export type UpdateContactInput = z.infer<typeof updateContactSchema>;

export const updateConsentSchema = z.object({
  eventType: z.enum(["OPT_IN", "OPT_OUT", "SUPPRESS", "UNSUPPRESS"]),
  source: z.string().trim().min(1, "Consent source is required").max(100),
  evidence: z.string().trim().max(500).optional(),
});

export type UpdateConsentInput = z.infer<typeof updateConsentSchema>;

export const createContactListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "List name is required")
    .max(100, "List name cannot exceed 100 characters"),
  description: z.string().trim().max(500).optional(),
});

export type CreateContactListInput = z.infer<typeof createContactListSchema>;

export const updateContactListSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "List name cannot be empty")
    .max(100, "List name cannot exceed 100 characters")
    .optional(),
  description: z.string().trim().max(500).optional(),
});

export type UpdateContactListInput = z.infer<typeof updateContactListSchema>;

export const addListMembersSchema = z.object({
  contactIds: z
    .array(z.string().trim())
    .min(1, "At least one contact ID is required"),
});

export type AddListMembersInput = z.infer<typeof addListMembersSchema>;

export const csvPreviewInputSchema = z.object({
  csvContent: z.string().min(1, "CSV content cannot be empty"),
  fileName: z.string().trim().max(255).optional(),
});

export type CsvPreviewInput = z.infer<typeof csvPreviewInputSchema>;

export const csvExecuteImportSchema = z.object({
  csvContent: z.string().min(1, "CSV content cannot be empty"),
  fileName: z.string().trim().min(1).max(255).default("contacts.csv"),
  clientRequestId: z.string().trim().min(1).max(64),
  listId: z.string().trim().optional(),
  newListName: z.string().trim().max(100).optional(),
  mappings: z.object({
    phoneNumber: z.string().trim().min(1, "Phone column mapping is required"),
    firstName: z.string().trim().optional(),
    lastName: z.string().trim().optional(),
    email: z.string().trim().optional(),
    consentStatus: z.string().trim().optional(),
    customAttributes: z.array(z.string().trim()).optional(),
  }),
  defaultCountryCode: z.string().trim().default("+91"),
  operatorConsentDeclaration: z.string().trim().max(1000).optional(),
});

export type CsvExecuteImportInput = z.infer<typeof csvExecuteImportSchema>;
