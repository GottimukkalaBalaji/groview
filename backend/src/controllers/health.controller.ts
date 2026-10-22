import { Request, Response } from "express";
import { healthService } from "../services/health.service.js";
import { sendSuccess } from "../utils/response.js";

export class HealthController {
  public getHealth = (_req: Request, res: Response): void => {
    const health = healthService.getHealth();
    sendSuccess(res, health, 200, "Service is healthy and active");
  };

  public getReadiness = async (_req: Request, res: Response): Promise<void> => {
    const readiness = await healthService.getReadiness();
    // Return 200 if ready or degraded (in development), or 503 if not ready in strict environments
    const statusCode = readiness.status === "not_ready" ? 503 : 200;
    sendSuccess(
      res,
      readiness,
      statusCode,
      readiness.status === "ready"
        ? "All dependencies are healthy and connected"
        : "Dependencies check completed (some services unconfigured or unreachable)"
    );
  };
}

export const healthController = new HealthController();
