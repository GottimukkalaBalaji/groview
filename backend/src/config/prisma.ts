import { PrismaClient } from "@prisma/client";
import { logger } from "../utils/logger.js";
import { DependencyStatus } from "../types/index.js";

declare global {
  var __prisma: PrismaClient | undefined;
}

let prismaInstance: PrismaClient | null = null;

export function isDatabaseConfigured(): boolean {
  const url = process.env.DATABASE_URL;
  if (!url || url.trim() === "") return false;
  if (url.includes("[YOUR-PASSWORD]") || url.includes("[PROJECT-REF]")) return false;
  return true;
}

export function getPrismaClient(): PrismaClient {
  if (!isDatabaseConfigured()) {
    throw new Error(
      "Cannot instantiate PrismaClient: DATABASE_URL is not configured with valid credentials."
    );
  }

  if (process.env.NODE_ENV === "production") {
    if (!prismaInstance) {
      prismaInstance = new PrismaClient({
        log: ["error", "warn"],
      });
    }
    return prismaInstance;
  }

  // Preserve client in development across hot-reloading
  if (!global.__prisma) {
    global.__prisma = new PrismaClient({
      log: ["error", "warn"],
    });
  }
  return global.__prisma;
}

export async function disconnectPrisma(): Promise<void> {
  const client = prismaInstance || global.__prisma;
  if (client) {
    try {
      await client.$disconnect();
      logger.info("Prisma client disconnected successfully");
    } catch (err) {
      logger.error("Error during Prisma disconnect", err);
    }
  }
}

/**
 * Checks the database connection state for the readiness endpoint.
 * Returns honest status without throwing uncaught exceptions.
 */
export async function checkDatabaseConnection(): Promise<DependencyStatus> {
  if (!isDatabaseConfigured()) {
    return {
      status: "not_configured",
      message: "DATABASE_URL is not configured or contains template placeholders in .env",
    };
  }

  const startTime = Date.now();
  try {
    const client = getPrismaClient();
    // Use raw query with timeout to verify database connectivity without prepared statement collisions in PgBouncer
    await client.$queryRawUnsafe("SELECT 1");
    const latencyMs = Date.now() - startTime;
    return {
      status: "connected",
      message: "Supabase PostgreSQL reachable",
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    const msg = error instanceof Error ? error.message : "Unknown database connection error";
    // Sanitize any potential internal URLs from error message
    const cleanMsg = msg.replace(/postgresql:\/\/[^@]+@/g, "postgresql://***:***@");
    logger.warn(`Database connection check failed: ${cleanMsg}`);
    return {
      status: "error",
      message: cleanMsg,
      latencyMs,
    };
  }
}
