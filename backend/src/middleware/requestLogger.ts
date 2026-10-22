import { Request, Response, NextFunction } from "express";
import { logger } from "../utils/logger.js";

export function requestLogger(req: Request, res: Response, next: NextFunction): void {
  const startTime = Date.now();

  res.on("finish", () => {
    const duration = Date.now() - startTime;
    const { method, originalUrl, ip } = req;
    const { statusCode } = res;

    // Do not log query params if they contain sensitive keys
    const safeUrl = originalUrl.replace(/(token|secret|password|key)=[^&]*/gi, "$1=[REDACTED]");

    const message = `${method} ${safeUrl} ${statusCode} - ${duration}ms [IP: ${ip}]`;

    if (statusCode >= 500) {
      logger.error(message);
    } else if (statusCode >= 400) {
      logger.warn(message);
    } else {
      logger.info(message);
    }
  });

  next();
}
