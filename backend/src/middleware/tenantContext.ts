import { Request, Response, NextFunction } from "express";
import { authService, SanitizedUser } from "../services/auth.service.js";
import { platformAuthService } from "../services/platformAuth.service.js";
import { getPrismaClient } from "../config/prisma.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";

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
 * For DELEGATED_ADMIN users: requires explicit x-scoped-organization-id header, verified
 * against trusted active database assignments via platformAuthService.assertOrganizationAccess.
 */
export async function tenantContextMiddleware(
  req: Request,
  _res: Response,
  next: NextFunction
): Promise<void> {
  try {
    // 1. Strip any client-side injection of organizationId in body or query
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
        let activeOrgId = session.organizationId;
        let activeOrgName = session.organization.name;
        let activeOrgSlug = session.organization.slug;

        // Delegated Admin Scoping: Requires explicit validated x-scoped-organization-id header
        if (session.user.platformRole === "DELEGATED_ADMIN") {
          assignedOrganizationIds = await platformAuthService.resolveAssignedOrganizationIds(
            session.userId
          );

          const rawScopedOrgHeader = req.headers["x-scoped-organization-id"];
          const requestedOrgId =
            typeof rawScopedOrgHeader === "string" ? rawScopedOrgHeader.trim() : null;

          if (!requestedOrgId) {
            throw new ForbiddenError(
              "No target business selected. Delegated administrators must specify an assigned customer organization via x-scoped-organization-id."
            );
          }

          // Temporarily populate req.context so assertOrganizationAccess can evaluate platform principal
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

          // Verify that this requested organization is actively assigned to the delegated administrator
          platformAuthService.assertOrganizationAccess(req, requestedOrgId);

          // Retrieve active customer organization details from database
          const prisma = getPrismaClient();
          const targetOrg = await prisma.organization.findUnique({
            where: { id: requestedOrgId },
            select: {
              id: true,
              name: true,
              slug: true,
              isArchived: true,
              deletedAt: true,
              users: {
                select: {
                  platformRole: true,
                },
              },
            },
          });

          if (!targetOrg || Boolean(targetOrg.isArchived) || Boolean(targetOrg.deletedAt)) {
            throw new ForbiddenError(
              "Access denied: Target organization is inactive, archived, or not found."
            );
          }

          if (targetOrg.users && targetOrg.users.some((u) => u.platformRole === "DELEGATED_ADMIN")) {
            throw new ForbiddenError(
              "Access denied: Internal agency containers cannot be operated as customer businesses."
            );
          }

          activeOrgId = targetOrg.id;
          activeOrgName = targetOrg.name;
          activeOrgSlug = targetOrg.slug;
        }

        req.context = {
          organizationId: activeOrgId,
          organizationName: activeOrgName,
          organizationSlug: activeOrgSlug,
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
    // Note: Do NOT call stripInjectedOrgId(req) here. optionalTenantContextMiddleware is used
    // exclusively on platform administrative routes (/admin/platform/*) where Master Admins
    // legitimately provide target organizationId in request bodies (e.g. creating business assignments).
    // Customer tenant routes remain strictly protected via tenantContextMiddleware.

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
