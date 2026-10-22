import { Redis, RedisOptions } from "ioredis";
import { logger } from "../utils/logger.js";
import { DependencyStatus } from "../types/index.js";

let redisClientInstance: Redis | null = null;

export function isRedisConfigured(): boolean {
  const url = process.env.REDIS_URL;
  if (!url || url.trim() === "") return false;
  if (url.includes("placeholder_token") || url.includes("placeholder.upstash.io")) return false;
  return true;
}

/**
 * Generates Redis options compatible with Upstash Redis and BullMQ.
 * - Upstash uses TLS via rediss://
 * - BullMQ requires maxRetriesPerRequest: null
 * - enableReadyCheck: false is recommended for serverless/cloud Redis
 */
export function getBullMQRedisOptions(): RedisOptions {
  if (!isRedisConfigured()) {
    throw new Error(
      "Cannot initialize Redis options: REDIS_URL is not configured with valid credentials."
    );
  }

  const redisUrl = process.env.REDIS_URL!;
  const isTls = redisUrl.startsWith("rediss://");

  const options: RedisOptions = {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
    lazyConnect: true,
  };

  if (isTls) {
    options.tls = {
      rejectUnauthorized: true,
    };
  }

  return options;
}

/**
 * Creates or retrieves a Redis client for general caching or readiness checking.
 */
export function getRedisClient(): Redis {
  if (!isRedisConfigured()) {
    throw new Error(
      "Cannot instantiate Redis client: REDIS_URL is not configured with valid credentials."
    );
  }

  if (!redisClientInstance) {
    const url = process.env.REDIS_URL!;
    const options = getBullMQRedisOptions();
    redisClientInstance = new Redis(url, options);

    redisClientInstance.on("error", (err) => {
      logger.error("Redis connection error", err);
    });
  }

  return redisClientInstance;
}

export async function disconnectRedis(): Promise<void> {
  if (redisClientInstance) {
    try {
      await redisClientInstance.quit();
      redisClientInstance = null;
      logger.info("Redis client disconnected successfully");
    } catch (err) {
      logger.error("Error disconnecting Redis client", err);
    }
  }
}

/**
 * Checks Redis connectivity for the readiness endpoint.
 * Returns honest status without throwing uncaught exceptions.
 */
export async function checkRedisConnection(): Promise<DependencyStatus> {
  if (!isRedisConfigured()) {
    return {
      status: "not_configured",
      message: "REDIS_URL is not configured or contains placeholder tokens in .env",
    };
  }

  const startTime = Date.now();
  let tempClient: Redis | null = null;
  try {
    const url = process.env.REDIS_URL!;
    const options: RedisOptions = {
      ...getBullMQRedisOptions(),
      connectTimeout: 4000,
      lazyConnect: false,
    };

    tempClient = new Redis(url, options);
    const pong = await tempClient.ping();
    const latencyMs = Date.now() - startTime;

    await tempClient.quit();

    if (pong === "PONG") {
      return {
        status: "connected",
        message: "Upstash Redis reachable",
        latencyMs,
      };
    }

    return {
      status: "error",
      message: `Unexpected Redis response: ${pong}`,
      latencyMs,
    };
  } catch (error) {
    const latencyMs = Date.now() - startTime;
    if (tempClient) {
      try {
        tempClient.disconnect();
      } catch {
        // ignore disconnect cleanup error
      }
    }

    const msg = error instanceof Error ? error.message : "Unknown Redis connection error";
    const cleanMsg = msg.replace(/rediss?:\/\/[^@]+@/g, "rediss://***:***@");
    logger.warn(`Redis connection check failed: ${cleanMsg}`);
    return {
      status: "error",
      message: cleanMsg,
      latencyMs,
    };
  }
}
