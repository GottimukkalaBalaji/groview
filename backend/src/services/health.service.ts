import { HealthCheckResponse, ReadinessCheckResponse } from "../types/index.js";
import { checkDatabaseConnection } from "../config/prisma.js";
import { checkRedisConnection } from "../config/redis.js";

const SERVICE_NAME = "grovastra-backend";
const SERVICE_VERSION = "0.1.0";

export class HealthService {
  /**
   * Liveness probe: checks if the Node.js Express process is responsive.
   * Does NOT depend on external infrastructure (Database, Redis, Meta API).
   */
  public getHealth(): HealthCheckResponse {
    return {
      status: "healthy",
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      uptime: Math.floor(process.uptime()),
      environment: process.env.NODE_ENV || "development",
      timestamp: new Date().toISOString(),
    };
  }

  /**
   * Readiness probe: checks if the application's required dependencies
   * (Supabase PostgreSQL, Upstash Redis) are configured and reachable.
   */
  public async getReadiness(): Promise<ReadinessCheckResponse> {
    const [databaseStatus, redisStatus] = await Promise.all([
      checkDatabaseConnection(),
      checkRedisConnection(),
    ]);

    const isDbReady = databaseStatus.status === "connected";
    const isRedisReady = redisStatus.status === "connected";

    let overallStatus: ReadinessCheckResponse["status"] = "not_ready";

    if (isDbReady && isRedisReady) {
      overallStatus = "ready";
    } else if (
      databaseStatus.status === "not_configured" ||
      redisStatus.status === "not_configured"
    ) {
      // In development / Phase 1 setup, dependencies may not be fully configured yet
      overallStatus = "degraded";
    }

    return {
      status: overallStatus,
      service: SERVICE_NAME,
      version: SERVICE_VERSION,
      dependencies: {
        database: databaseStatus,
        redis: redisStatus,
      },
      timestamp: new Date().toISOString(),
    };
  }
}

export const healthService = new HealthService();
