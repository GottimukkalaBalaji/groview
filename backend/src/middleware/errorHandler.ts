import { Request, Response, NextFunction } from "express";
import { AppError } from "../utils/errors.js";
import { sendError } from "../utils/response.js";
import { logger } from "../utils/logger.js";

export function errorHandler(
  err: unknown,
  _req: Request,
  res: Response,
  _next: NextFunction
): void {
  const isProduction = process.env.NODE_ENV === "production";

  // Handle known AppError instances
  if (err instanceof AppError) {
    const stack = !isProduction ? err.stack : undefined;
    sendError(res, err.statusCode, err.code, err.message, err.details, stack);
    return;
  }

  // Handle JSON parse syntax errors (e.g., malformed JSON in request body)
  if (err instanceof SyntaxError && "status" in err && err.status === 400 && "body" in err) {
    sendError(res, 400, "INVALID_JSON", "Malformed JSON payload provided in request body");
    return;
  }

  // Handle unexpected unhandled errors
  const errorObj = err instanceof Error ? err : new Error(String(err));
  logger.error("Unhandled exception caught by error middleware", errorObj);

  const message = isProduction
    ? "An unexpected internal server error occurred"
    : errorObj.message;

  const stack = !isProduction ? errorObj.stack : undefined;

  sendError(res, 500, "INTERNAL_SERVER_ERROR", message, undefined, stack);
}
