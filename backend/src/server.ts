import { Server } from "http";
import { app } from "./app.js";
import { env } from "./config/env.js";
import { logger } from "./utils/logger.js";
import { disconnectPrisma } from "./config/prisma.js";
import { disconnectRedis } from "./config/redis.js";
import {
  startWorkerIfEnabled,
  stopWorker,
  getDispatchWorker,
} from "./services/automaticWorker.service.js";
import { campaignSchedulerService } from "./services/campaignScheduler.service.js";

export { startWorkerIfEnabled, stopWorker, getDispatchWorker, campaignSchedulerService };

const PORT = env.PORT;

let server: Server | null = null;

if (process.env.NODE_ENV !== "test") {
  server = app.listen(PORT, () => {
    logger.info(`=======================================================`);
    logger.info(`  Grovastra API Server running on port ${PORT}`);
    logger.info(`  Environment : ${env.NODE_ENV}`);
    logger.info(`  Liveness    : http://localhost:${PORT}/api/v1/health`);
    logger.info(`  Readiness   : http://localhost:${PORT}/api/v1/ready`);
    logger.info(`=======================================================`);

    // Start worker only if explicitly enabled via kill switch
    startWorkerIfEnabled();

    // Start background campaign scheduler loop and execute startup recovery
    campaignSchedulerService.startSchedulerLoop();
  });
}

/**
 * Graceful shutdown sequence
 */
let isShuttingDown = false;

async function gracefulShutdown(signal: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;

  logger.info(`Received ${signal}. Starting graceful shutdown...`);

  // If server is not listening (e.g. in test environment), clean up resources directly
  if (!server) {
    try {
      campaignSchedulerService.stopSchedulerLoop();
      await stopWorker();
      await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
    } catch (cleanupErr) {
      logger.error("Error during resource cleanup", cleanupErr);
    }
    return;
  }

  // Stop accepting new connections
  server.close(async (err) => {
    if (err) {
      logger.error("Error closing HTTP server", err);
      process.exit(1);
    }

    logger.info("HTTP server closed.");

    try {
      // 1. Stop scheduler and close worker before disconnecting Redis and Prisma
      campaignSchedulerService.stopSchedulerLoop();
      await stopWorker();

      // 2. Clean up database and redis connections
      await Promise.allSettled([disconnectPrisma(), disconnectRedis()]);
      logger.info("All resources successfully released. Exiting process.");
      process.exit(0);
    } catch (cleanupErr) {
      logger.error("Error during resource cleanup", cleanupErr);
      process.exit(1);
    }
  });

  // Force close after 10 seconds if graceful shutdown takes too long
  setTimeout(() => {
    logger.error("Graceful shutdown timeout exceeded. Forcing termination.");
    process.exit(1);
  }, 10000).unref();
}

process.on("SIGTERM", () => gracefulShutdown("SIGTERM"));
process.on("SIGINT", () => gracefulShutdown("SIGINT"));

process.on("unhandledRejection", (reason) => {
  logger.error("Unhandled Rejection detected", reason);
});

process.on("uncaughtException", (error) => {
  logger.error("Uncaught Exception detected", error);
  process.exit(1);
});

export { server };
