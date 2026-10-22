import { Request, Response, NextFunction } from "express";
import { sendError } from "../utils/response.js";

interface AttemptRecord {
  count: number;
  firstAttempt: number;
}

const loginAttempts = new Map<string, AttemptRecord>();
const integrationAttempts = new Map<string, AttemptRecord>();

const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

const INTEGRATION_MAX_ATTEMPTS = 20;
const INTEGRATION_WINDOW_MS = 60 * 1000; // 1 minute

function getClientKey(req: Request): string {
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "127.0.0.1";
  const email = (req.body?.email as string)?.trim().toLowerCase() || "";
  return `${ip}:${email}`;
}

function getIntegrationClientKey(req: Request): string {
  const orgId = req.context?.organizationId || "anon";
  const ip =
    (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() ||
    req.socket.remoteAddress ||
    "127.0.0.1";
  return `${orgId}:${ip}`;
}

/**
 * Express middleware for login rate limiting.
 * Prevents brute-force credential stuffing attacks.
 */
export function loginRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const key = getClientKey(req);
  const now = Date.now();
  const record = loginAttempts.get(key);

  if (record) {
    if (now - record.firstAttempt > WINDOW_MS) {
      // Window expired; reset counter
      loginAttempts.set(key, { count: 1, firstAttempt: now });
      return next();
    }

    if (record.count >= MAX_ATTEMPTS) {
      const waitMinutes = Math.ceil((record.firstAttempt + WINDOW_MS - now) / 60000);
      sendError(
        res,
        429,
        "RATE_LIMITED",
        `Too many login attempts. Please try again in ${waitMinutes} minute${waitMinutes > 1 ? "s" : ""}.`
      );
      return;
    }

    record.count += 1;
  } else {
    loginAttempts.set(key, { count: 1, firstAttempt: now });
  }

  next();
}

/**
 * Rate limiter for WhatsApp integration operations (connect, refresh, disconnect).
 * Protects against excessive Graph API verification calls and brute force testing.
 */
export function whatsappIntegrationRateLimiter(
  req: Request,
  res: Response,
  next: NextFunction
): void {
  const key = getIntegrationClientKey(req);
  const now = Date.now();
  const record = integrationAttempts.get(key);

  if (record) {
    if (now - record.firstAttempt > INTEGRATION_WINDOW_MS) {
      integrationAttempts.set(key, { count: 1, firstAttempt: now });
      return next();
    }

    if (record.count >= INTEGRATION_MAX_ATTEMPTS) {
      sendError(
        res,
        429,
        "RATE_LIMITED",
        "Too many WhatsApp integration requests. Please slow down and try again shortly."
      );
      return;
    }

    record.count += 1;
  } else {
    integrationAttempts.set(key, { count: 1, firstAttempt: now });
  }

  next();
}

/**
 * Resets rate limit for a client upon successful authentication.
 */
export function recordSuccessfulLogin(req: Request): void {
  const key = getClientKey(req);
  loginAttempts.delete(key);
}

/**
 * Helper to clear rate limit store during automated testing.
 */
export function clearRateLimitStore(): void {
  loginAttempts.clear();
  integrationAttempts.clear();
}

