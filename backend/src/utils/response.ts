import { Response } from "express";
import { ApiResponse, ApiErrorResponse, ApiErrorDetail } from "../types/index.js";

export function sendSuccess<T>(
  res: Response,
  data: T,
  statusCode = 200,
  message?: string
): Response<ApiResponse<T>> {
  const payload: ApiResponse<T> = {
    success: true,
    data,
    timestamp: new Date().toISOString(),
  };

  if (message) {
    payload.message = message;
  }

  return res.status(statusCode).json(payload);
}

export function sendError(
  res: Response,
  statusCode = 500,
  code = "INTERNAL_SERVER_ERROR",
  message = "An unexpected error occurred",
  details?: ApiErrorDetail[],
  stack?: string
): Response<ApiErrorResponse> {
  const payload: ApiErrorResponse = {
    success: false,
    error: {
      code,
      message,
    },
    timestamp: new Date().toISOString(),
  };

  if (details && details.length > 0) {
    payload.error.details = details;
  }

  if (stack) {
    payload.error.stack = stack;
  }

  return res.status(statusCode).json(payload);
}
