import { Request, Response, NextFunction } from "express";
import { ForbiddenError } from "../utils/errors.js";
import type { PlatformCapabilities, PlatformPrincipal } from "../types/platform.js";
import { logger } from "../utils/logger.js";
import { getPrismaClient } from "../config/prisma.js";

import { getPlatformAdminSecret, timingSafeCompare } from "../middleware/platformAdmin.js";

/**
 * Strips untrusted client-supplied platform injection headers.
 * Platform roles and capabilities must ALWAYS be derived from authenticated server context.
 */
export function stripInjectedPlatformHeaders(req: Request): void {
  delete req.headers["x-is-platform-admin"];
  delete req.headers["x-platform-role"];
  delete req.headers["x-assigned-orgs"];
}

export class PlatformAuthService {
  /**
   * Resolves active assigned organization IDs from database records for a delegated admin.
   * Denies access by default (returns []) if table does not exist, query fails, or no assignments exist.
   */
  public async resolveAssignedOrganizationIds(userId: string): Promise<string[]> {
    try {
      const prisma = getPrismaClient();
      const assignments = await prisma.businessAssignment.findMany({
        where: {
          userId,
          status: "ACTIVE",
          organization: {
            isArchived: false,
            deletedAt: null,
          },
        },
        select: {
          organizationId: true,
        },
      });
      return assignments.map((a) => a.organizationId);
    } catch (error: any) {
      logger.warn(
        `[PlatformAuthService] Unable to resolve assignments for user ${userId} (${error?.code || error?.message}). Denying access by default (assignedOrganizationIds: []).`
      );
      return [];
    }
  }

  /**
   * Evaluates the platform principal from the authenticated server context.
   *
   * SECURITY INVARIANT:
   * 1. Customer OWNER, ADMIN, and MEMBER roles are strictly tenant-scoped and
   *    NEVER grant platform-wide access or access to other customer organizations.
   * 2. Client headers claiming platform role are stripped and ignored.
   * 3. Secret-based platform callers (via platformAdminMiddleware or valid secret) evaluate as PLATFORM_MASTER_ADMIN.
   * 4. DELEGATED_ADMIN roles are strictly scoped to organizations resolved from trusted database records.
   *    If assignment lookup fails or no active assignments exist, scope fails closed to [].
   */
  public getPlatformPrincipal(req: Request): PlatformPrincipal {
    stripInjectedPlatformHeaders(req);

    // 1. Verified platform secret caller (from platformAdminMiddleware)
    if (req.isPlatformAdmin) {
      return {
        isPlatformAdmin: true,
        platformRole: "PLATFORM_MASTER_ADMIN",
        assignedOrganizationIds: [], // Empty means unrestricted / all organizations
      };
    }

    // Check if valid platform admin secret is presented in headers
    try {
      const expectedSecret = getPlatformAdminSecret();
      const headerSecret = req.headers["x-platform-admin-secret"];
      const authHeader = req.headers.authorization;
      let providedSecret: string | null = null;

      if (typeof headerSecret === "string" && headerSecret.trim().length > 0) {
        providedSecret = headerSecret.trim();
      } else if (typeof authHeader === "string" && /^Bearer\s+/i.test(authHeader)) {
        providedSecret = authHeader.replace(/^Bearer\s+/i, "").trim();
      }

      if (providedSecret && timingSafeCompare(providedSecret, expectedSecret)) {
        req.isPlatformAdmin = true;
        return {
          isPlatformAdmin: true,
          platformRole: "PLATFORM_MASTER_ADMIN",
          assignedOrganizationIds: [],
        };
      }
    } catch {
      // Platform admin secret unconfigured; safely fall through
    }

    // 2. Authenticated user session (from tenantContextMiddleware)
    if (req.context?.user) {
      const userPlatformRole = req.context.user.platformRole;

      // Authenticated database user with verified PLATFORM_MASTER_ADMIN role
      if (userPlatformRole === "PLATFORM_MASTER_ADMIN") {
        return {
          isPlatformAdmin: true,
          platformRole: "PLATFORM_MASTER_ADMIN",
          userId: req.context.userId,
          organizationId: req.context.organizationId,
          assignedOrganizationIds: [], // Unrestricted across all organizations
        };
      }

      // DELEGATED_ADMIN: Access is strictly scoped to database-assigned organizations
      // Fails closed to [] by default if not assigned or not yet resolved
      if (userPlatformRole === "DELEGATED_ADMIN") {
        return {
          isPlatformAdmin: false, // Denied global platform operations
          platformRole: "DELEGATED_ADMIN",
          userId: req.context.userId,
          organizationId: req.context.organizationId,
          assignedOrganizationIds: Array.isArray(req.context.assignedOrganizationIds)
            ? req.context.assignedOrganizationIds
            : [],
        };
      }

      // Tenant-scoped customer roles (OWNER, ADMIN, MEMBER) NEVER grant platform privileges
      return {
        isPlatformAdmin: false,
        platformRole: "NONE",
        userId: req.context.userId,
        organizationId: req.context.organizationId,
        assignedOrganizationIds: [req.context.organizationId], // Strictly limited to their own tenant
      };
    }

    // 3. Unauthenticated / anonymous
    return {
      isPlatformAdmin: false,
      platformRole: "NONE",
      assignedOrganizationIds: [],
    };
  }

  /**
   * Resolves platform capabilities for the authenticated principal.
   */
  public getCapabilities(req: Request): PlatformCapabilities {
    const principal = this.getPlatformPrincipal(req);

    if (principal.platformRole === "PLATFORM_MASTER_ADMIN") {
      return {
        isPlatformAdmin: true,
        platformRole: "PLATFORM_MASTER_ADMIN",
        canManagePlatformWhatsApp: true,
        canManageAllOrganizations: true,
        canAssignBusinesses: true,
      };
    }

    if (principal.platformRole === "DELEGATED_ADMIN") {
      return {
        isPlatformAdmin: false, // Denied global platform admin until scoped assignments are verified in Phase 9C
        platformRole: "DELEGATED_ADMIN",
        canManagePlatformWhatsApp: false,
        canManageAllOrganizations: false,
        canAssignBusinesses: false,
        assignedOrganizationIds: principal.assignedOrganizationIds,
      };
    }

    // Default: Regular customer tenant user (OWNER, ADMIN, MEMBER)
    return {
      isPlatformAdmin: false,
      platformRole: "NONE",
      canManagePlatformWhatsApp: false,
      canManageAllOrganizations: false,
      canAssignBusinesses: false,
    };
  }

  /**
   * Express middleware enforcing Platform Master Admin authorization.
   * Fails closed with HTTP 403 Forbidden for any non-master-admin caller.
   */
  public requireMasterAdmin = (
    req: Request,
    _res: Response,
    next: NextFunction
  ): void => {
    const principal = this.getPlatformPrincipal(req);

    if (!principal.isPlatformAdmin || principal.platformRole !== "PLATFORM_MASTER_ADMIN") {
      logger.warn(
        `[PlatformAuthService] Rejected non-platform principal (User: ${req.context?.userId || "anon"}, Org: ${req.context?.organizationId || "none"}) from ${req.originalUrl}`
      );
      throw new ForbiddenError(
        "Platform Master Administrator authorization required. Access denied."
      );
    }

    next();
  };

  /**
   * Express middleware checking whether principal has access to a target organization.
   * - Master Admin: Can access any organization.
   * - Customer OWNER/ADMIN/MEMBER: Can ONLY access their own authenticated organization.
   */
  public assertOrganizationAccess(
    req: Request,
    targetOrganizationId: string
  ): void {
    const principal = this.getPlatformPrincipal(req);

    if (principal.platformRole === "PLATFORM_MASTER_ADMIN") {
      return; // Full access
    }

    if (principal.platformRole === "DELEGATED_ADMIN") {
      if (!principal.assignedOrganizationIds.includes(targetOrganizationId)) {
        throw new ForbiddenError(
          "Access denied: Organization is not assigned to this delegated administrator."
        );
      }
      return;
    }

    // Regular tenant principal
    if (principal.organizationId !== targetOrganizationId) {
      throw new ForbiddenError(
        "Cross-tenant access forbidden. You do not have permission to access this organization."
      );
    }
  }

  /**
   * Express helper checking whether principal has administrative authority to approve or reject campaigns.
   * - Master Admin: Can approve/reject across any organization.
   * - Delegated Admin: Can approve/reject ONLY if the targetOrganizationId is in their active assignedOrganizationIds.
   * - Customer OWNER / ADMIN / MEMBER: Denied (HTTP 403 Forbidden). Customers cannot approve their own campaigns.
   */
  public assertCampaignApprovalPrivilege(
    req: Request,
    targetOrganizationId: string
  ): void {
    const principal = this.getPlatformPrincipal(req);

    if (principal.platformRole === "PLATFORM_MASTER_ADMIN") {
      return; // Global master override permitted
    }

    if (principal.platformRole === "DELEGATED_ADMIN") {
      if (!principal.assignedOrganizationIds.includes(targetOrganizationId)) {
        throw new ForbiddenError(
          "Access denied: You are not assigned to manage this customer organization."
        );
      }
      return; // Authorized assigned delegated admin
    }

    // Customer OWNER, ADMIN, MEMBER, or unauthenticated
    throw new ForbiddenError(
      "Unauthorized: Campaign approval and rejection requires Delegated Administrator authorization."
    );
  }

  /**
   * Asynchronously resolves platform principal, populating assignedOrganizationIds
   * from database if caller is DELEGATED_ADMIN and assignments haven't been resolved yet.
   */
  public async resolvePlatformPrincipal(req: Request): Promise<PlatformPrincipal> {
    const principal = this.getPlatformPrincipal(req);

    if (
      principal.platformRole === "DELEGATED_ADMIN" &&
      principal.userId &&
      (!req.context?.assignedOrganizationIds || req.context.assignedOrganizationIds.length === 0)
    ) {
      const resolvedIds = await this.resolveAssignedOrganizationIds(principal.userId);
      if (req.context) {
        req.context.assignedOrganizationIds = resolvedIds;
      }
      return {
        ...principal,
        assignedOrganizationIds: resolvedIds,
      };
    }

    return principal;
  }

  /**
   * Asynchronous organization access check that ensures delegated admin assignments
   * are freshly resolved from database records if not already populated.
   */
  public async assertOrganizationAccessAsync(
    req: Request,
    targetOrganizationId: string
  ): Promise<void> {
    const principal = await this.resolvePlatformPrincipal(req);

    if (principal.platformRole === "PLATFORM_MASTER_ADMIN") {
      return;
    }

    if (principal.platformRole === "DELEGATED_ADMIN") {
      if (!principal.assignedOrganizationIds.includes(targetOrganizationId)) {
        throw new ForbiddenError(
          "Access denied: Organization is not assigned to this delegated administrator."
        );
      }
      return;
    }

    if (principal.organizationId !== targetOrganizationId) {
      throw new ForbiddenError(
        "Cross-tenant access forbidden. You do not have permission to access this organization."
      );
    }
  }
}

export const platformAuthService = new PlatformAuthService();

