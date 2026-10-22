import dotenv from "dotenv";
import { z } from "zod";

// Load environment variables from .env file
dotenv.config();

// Base server environment schema
const baseEnvSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  PORT: z
    .string()
    .default("5000")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0 && val < 65536, {
      message: "PORT must be a valid port number between 1 and 65535",
    }),
  FRONTEND_ORIGIN: z.string().default("http://localhost:5173"),

  // Optional integration variables (checked lazily when services initialize)
  DATABASE_URL: z.string().optional(),
  DIRECT_URL: z.string().optional(),
  REDIS_URL: z.string().optional(),
  META_WHATSAPP_ACCESS_TOKEN: z.string().optional(),
  META_PHONE_NUMBER_ID: z.string().optional(),
  META_WABA_ID: z.string().optional(),
  META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
  META_APP_SECRET: z.string().optional(),
  META_GRAPH_API_VERSION: z.string().default("v22.0"),
  META_TEST_RECIPIENT_PHONE: z.string().optional(),
  APP_ENCRYPTION_KEY: z.string().optional(),
  ENABLE_AUTOMATIC_WORKER: z
    .string()
    .optional()
    .default("false")
    .transform((val) => val.toLowerCase() === "true"),
  MAX_SCHEDULE_LATENESS_HOURS: z
    .string()
    .optional()
    .default("24")
    .transform((val) => parseInt(val, 10))
    .refine((val) => !isNaN(val) && val > 0, {
      message: "MAX_SCHEDULE_LATENESS_HOURS must be a positive integer",
    }),
});

const parsedEnv = baseEnvSchema.safeParse(process.env);

if (!parsedEnv.success) {
  const issues = parsedEnv.error.issues.map((i) => ` - ${i.path.join(".")}: ${i.message}`).join("\n");
  console.error("Configuration Error: Invalid server environment variables:\n" + issues);
  process.exit(1);
}

export const env = parsedEnv.data;

/**
 * Validates database environment configuration when Prisma is engaged.
 */
export function validateDatabaseConfig(): { databaseUrl: string; directUrl?: string } {
  const dbSchema = z.object({
    DATABASE_URL: z
      .string({ required_error: "DATABASE_URL is required to initialize database connection" })
      .min(1, "DATABASE_URL cannot be empty")
      .refine(
        (val) => !val.includes("[YOUR-PASSWORD]") && !val.includes("[PROJECT-REF]"),
        { message: "DATABASE_URL contains unpopulated placeholder tokens" }
      ),
    DIRECT_URL: z.string().optional(),
  });

  const result = dbSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Database configuration incomplete: ${errorDetails}`);
  }

  return {
    databaseUrl: result.data.DATABASE_URL,
    directUrl: result.data.DIRECT_URL,
  };
}

/**
 * Validates Redis environment configuration when BullMQ is engaged.
 */
export function validateRedisConfig(): { redisUrl: string } {
  const redisSchema = z.object({
    REDIS_URL: z
      .string({ required_error: "REDIS_URL is required to initialize Redis queue" })
      .min(1, "REDIS_URL cannot be empty")
      .refine(
        (val) => !val.includes("placeholder_token") && !val.includes("placeholder.upstash.io"),
        { message: "REDIS_URL contains unpopulated placeholder tokens" }
      ),
  });

  const result = redisSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Redis configuration incomplete: ${errorDetails}`);
  }

  return {
    redisUrl: result.data.REDIS_URL,
  };
}

/**
 * Validates Meta WhatsApp Cloud API configuration for future phases.
 */
export function validateMetaConfig(): {
  accessToken: string;
  phoneNumberId: string;
  wabaId: string;
  graphApiVersion: string;
  testRecipientPhone?: string;
  webhookVerifyToken?: string;
  appSecret?: string;
} {
  const metaSchema = z.object({
    META_WHATSAPP_ACCESS_TOKEN: z
      .string({ required_error: "META_WHATSAPP_ACCESS_TOKEN is required" })
      .min(1, "META_WHATSAPP_ACCESS_TOKEN cannot be empty"),
    META_PHONE_NUMBER_ID: z
      .string({ required_error: "META_PHONE_NUMBER_ID is required" })
      .min(1, "META_PHONE_NUMBER_ID cannot be empty"),
    META_WABA_ID: z
      .string({ required_error: "META_WABA_ID is required" })
      .min(1, "META_WABA_ID cannot be empty"),
    META_GRAPH_API_VERSION: z.string().default("v22.0"),
    META_TEST_RECIPIENT_PHONE: z.string().optional(),
    META_WEBHOOK_VERIFY_TOKEN: z.string().optional(),
    META_APP_SECRET: z.string().optional(),
  });

  const result = metaSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Meta WhatsApp configuration incomplete: ${errorDetails}`);
  }

  return {
    accessToken: result.data.META_WHATSAPP_ACCESS_TOKEN,
    phoneNumberId: result.data.META_PHONE_NUMBER_ID,
    wabaId: result.data.META_WABA_ID,
    graphApiVersion: result.data.META_GRAPH_API_VERSION,
    testRecipientPhone: result.data.META_TEST_RECIPIENT_PHONE,
    webhookVerifyToken: result.data.META_WEBHOOK_VERIFY_TOKEN,
    appSecret: result.data.META_APP_SECRET,
  };
}

/**
 * Validates Meta Webhook environment configuration for GET verification and POST signature validation.
 */
export function validateWebhookConfig(): {
  webhookVerifyToken?: string;
  appSecret?: string;
} {
  const webhookSchema = z.object({
    META_WEBHOOK_VERIFY_TOKEN: z.string().min(1, "META_WEBHOOK_VERIFY_TOKEN cannot be empty").optional(),
    META_APP_SECRET: z.string().min(1, "META_APP_SECRET cannot be empty").optional(),
  });

  const result = webhookSchema.safeParse(process.env);
  if (!result.success) {
    const errorDetails = result.error.issues.map((i) => i.message).join(", ");
    throw new Error(`Meta Webhook configuration incomplete: ${errorDetails}`);
  }

  return {
    webhookVerifyToken: result.data.META_WEBHOOK_VERIFY_TOKEN,
    appSecret: result.data.META_APP_SECRET,
  };
}

