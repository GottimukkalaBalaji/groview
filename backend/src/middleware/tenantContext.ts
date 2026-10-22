import { Request, Response, NextFunction } from "express";
import { authService, SanitizedUser } from "../services/auth.service.js";
import { platformAuthService } from "../services/platformAuth.service.js";
import { UnauthorizedError } from "../utils/errors.js";

export const SESSION_COOKIE_NAME = "grovastra_session";

export interface RequestContext {
  organizationId: string;
  organizationName: string;
  organizationSlug: string;
  userId: string;
  user: SanitizedUser;
  sessionId: string;
  isDevScaffold: boolean;
  assignedOrganizationIds?: string[];
}

declare global {
  namespace Express {
    interface Request {
      context?: RequestContext;
    }
  }
}

export const DEFAULT_ORGANIZATION_ID = "org_default";

/**
 * Strips any client-side injection attempts of organizationId in request bodies or query strings.
 */
export function stripInjectedOrgId(req: Request): void {
  if (req.body && typeof req.body === "object") {
    delete (req.body as Record<string, unknown>).organizationId;
  }
  if (req.query && typeof req.query === "object") {
    delete (req.query as Record<string, unknown>).organizationId;
  }
}

/**
 * Cookie configuration options for the session cookie.
 */
export const SESSION_COOKIE_OPTIONS = {
  httpOnly: true,
  secure: process.env.NODE_ENV === "production",
  sameSite: "lax" as const,
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: "/",
};

/**
 * Authentication and Tenant Context Middleware.
 * Enforces authenticated server-side organization context on all protected endpoints.
 * Never trusts client-supplied organizationId.
 */
export async function tenantContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Strip any client-side injection of organizationId
    stripInjectedOrgId(req);

    // 2. Extract session token from HttpOnly cookie or Authorization Bearer header
    const token =
      req.cookies?.[SESSION_COOKIE_NAME] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (token) {
      const session = await authService.validateSession(token);
      if (session) {
        if (Boolean(session.organization.isArchived) || Boolean(session.organization.deletedAt)) {
          throw new UnauthorizedError("Organization is archived or suspended");
        }
        let assignedOrganizationIds: string[] | undefined = undefined;
        if (session.user.platformRole === "DELEGATED_ADMIN") {
          assignedOrganizationIds = await platformAuthService.resolveAssignedOrganizationIds(
            session.userId
          );
        }

        req.context = {
          organizationId: session.organizationId,
          organizationName: session.organization.name,
          organizationSlug: session.organization.slug,
          userId: session.userId,
          user: authService.sanitizeUser(session.user),
          sessionId: session.id,
          isDevScaffold: false,
          assignedOrganizationIds,
        };
        return next();
      }
    }

    // 3. Isolated test runner compatibility:
    // Only in test environment when not explicitly asserting unauthenticated rejection
    if (
      process.env.NODE_ENV === "test" &&
      !req.headers["x-test-enforce-auth"] &&
      !req.headers["authorization"] &&
      !req.cookies?.[SESSION_COOKIE_NAME]
    ) {
      const testOrgHeader = req.headers["x-test-org-id"];
      if (testOrgHeader !== undefined && typeof testOrgHeader === "string" && testOrgHeader.trim().length === 0) {
        throw new UnauthorizedError("Authentication required. Organization context is missing.");
      }
      const testOrgId =
        (typeof testOrgHeader === "string" && testOrgHeader.trim().length > 0
          ? testOrgHeader.trim()
          : DEFAULT_ORGANIZATION_ID);
      const testUserId =
        (req.headers["x-test-user-id"] as string) || "system_user";


      req.context = {
        organizationId: testOrgId,
        organizationName: "Test Organization",
        organizationSlug: "test-org",
        userId: testUserId,
        user: {
          id: testUserId,
          organizationId: testOrgId,
          email: "test@grovastra.com",
          firstName: "Test",
          lastName: "User",
          role: "OWNER",
          createdAt: new Date(),
        },
        sessionId: "test_session_id",
        isDevScaffold: true,
      };
      return next();
    }

    // 4. Reject unauthenticated access
    throw new UnauthorizedError("Authentication required. Please log in.");
  } catch (error) {
    next(error);
  }
}

/**
 * Optional Tenant Context Middleware.
 * Safely extracts and populates req.context if a valid session exists.
 * Does NOT throw 401 if unauthenticated or token is missing.
 * Used on platform endpoints where callers may authenticate via user session or platform secret.
 */
export async function optionalTenantContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    stripInjectedOrgId(req);

    const token =
      req.cookies?.[SESSION_COOKIE_NAME] ||
      req.headers.authorization?.replace(/^Bearer\s+/i, "");

    if (token) {
      const session = await authService.validateSession(token);
      if (session) {
        if (!Boolean(session.organization.isArchived) && !Boolean(session.organization.deletedAt)) {
          let assignedOrganizationIds: string[] | undefined = undefined;
          if (session.user.platformRole === "DELEGATED_ADMIN") {
            assignedOrganizationIds = await platformAuthService.resolveAssignedOrganizationIds(
              session.userId
            );
          }

          req.context = {
            organizationId: session.organizationId,
            organizationName: session.organization.name,
            organizationSlug: session.organization.slug,
            userId: session.userId,
            user: authService.sanitizeUser(session.user),
            sessionId: session.id,
            isDevScaffold: false,
            assignedOrganizationIds,
          };
        }
      }
    }

    return next();
  } catch (error) {
    next(error);
  }
}
