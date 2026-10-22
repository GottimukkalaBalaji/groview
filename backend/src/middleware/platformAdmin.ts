import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { ForbiddenError, AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";

declare global {
  namespace Express {
    interface Request {
      isPlatformAdmin?: boolean;
    }
  }
}

/**
 * Resolves the trusted platform admin secret from server environment.
 * In test environment, provides a fallback test secret if not explicitly configured.
 * In production, fails closed if PLATFORM_ADMIN_SECRET is missing.
 */
export function getPlatformAdminSecret(): string {
  const configuredSecret = process.env.PLATFORM_ADMIN_SECRET;
  if (configuredSecret && configuredSecret.trim().length > 0) {
    return configuredSecret.trim();
  }

  // Safe fallback strictly in test environment to avoid breaking test harnesses
  if (process.env.NODE_ENV === "test") {
    return "test_platform_admin_secret_super_secure_key_123456";
  }

  throw new AppError(
    "Platform administrator secret is unconfigured on the server.",
    503,
    "PLATFORM_ADMIN_UNCONFIGURED"
  );
}

/**
 * Constant-time comparison of two secret strings using SHA-256 hashing.
 * Prevents timing side-channel attacks during platform administrator authentication.
 */
export function timingSafeCompare(provided: string, expected: string): boolean {
  if (typeof provided !== "string" || typeof expected !== "string") {
    return false;
  }
  const hashProvided = crypto.createHash("sha256").update(provided).digest();
  const hashExpected = crypto.createHash("sha256").update(expected).digest();
  return crypto.timingSafeEqual(hashProvided, hashExpected);
}

/**
 * Platform Administrator Authorization Middleware.
 * Restricts platform-wide operations (such as managing shared WhatsApp credentials)
 * to verified platform-level principals.
 *
 * Rules:
 * 1. Customer OWNER, ADMIN, and MEMBER roles are tenant-scoped and NEVER grant platform-level access.
 * 2. Client-supplied role headers or organization IDs are completely ignored.
 * 3. Access requires a valid platform secret supplied via `x-platform-admin-secret`
 *    or `Authorization: Bearer <secret>`.
 * 4. Fails closed with HTTP 403 Forbidden if the platform credential is missing, invalid, or mismatched.
 */
export function platformAdminMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): void {
  try {
    // 1. If already verified by previous middleware or authenticated as PLATFORM_MASTER_ADMIN via session
    if (req.isPlatformAdmin || req.context?.user?.platformRole === "PLATFORM_MASTER_ADMIN") {
      req.isPlatformAdmin = true;
      return next();
    }

    let expectedSecret: string;
    try {
      expectedSecret = getPlatformAdminSecret();
    } catch (configErr) {
      logger.error(
        `[platformAdminMiddleware] Configuration error: ${(configErr as Error)?.message}`
      );
      throw configErr;
    }

    // Extract secret from dedicated header or Bearer authorization
    const headerSecret = req.headers["x-platform-admin-secret"];
    const authHeader = req.headers.authorization;
    let providedSecret: string | null = null;

    if (typeof headerSecret === "string" && headerSecret.trim().length > 0) {
      providedSecret = headerSecret.trim();
    } else if (typeof authHeader === "string" && /^Bearer\s+/i.test(authHeader)) {
      providedSecret = authHeader.replace(/^Bearer\s+/i, "").trim();
    }

    if (!providedSecret || !timingSafeCompare(providedSecret, expectedSecret)) {
      logger.warn(
        `[platformAdminMiddleware] Unauthorized platform admin attempt rejected from IP ${req.ip} (Path: ${req.originalUrl})`
      );
      throw new ForbiddenError(
        "Platform administrator authorization required. Access denied."
      );
    }

    // Mark request as verified platform admin
    req.isPlatformAdmin = true;
    next();
  } catch (error) {
    next(error);
  }
}
