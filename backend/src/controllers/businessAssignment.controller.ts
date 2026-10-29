import { Request, Response, NextFunction } from "express";
import { businessAssignmentService } from "../services/businessAssignment.service.js";
import {
  CreateBusinessAssignmentInput,
  RevokeBusinessAssignmentInput,
  QueryBusinessAssignmentsInput,
} from "../validators/businessAssignment.validator.js";
import { sendSuccess } from "../utils/response.js";
import { UnauthorizedError, ForbiddenError } from "../utils/errors.js";
import { platformAuthService } from "../services/platformAuth.service.js";

export const businessAssignmentController = {
  /**
   * GET /api/v1/admin/platform/assignments
   * Protected Master Admin endpoint: lists paginated business assignments.
   */
  async getAssignments(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const query = (req.query || {}) as unknown as QueryBusinessAssignmentsInput;
      const result = await businessAssignmentService.getAssignments(query);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/assignments
   * Protected Master Admin endpoint: assigns an organization to a DELEGATED_ADMIN.
   */
  async createAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as CreateBusinessAssignmentInput;
      const assignedById = req.context?.userId || null;
      const result = await businessAssignmentService.createAssignment({
        ...body,
        assignedById,
      });
      sendSuccess(res, result, 201, "Business assignment created successfully");
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/assignments/:id/revoke
   * Protected Master Admin endpoint: revokes an active business assignment.
   */
  async revokeAssignment(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const id = req.params.id;
      const body = (req.body || {}) as RevokeBusinessAssignmentInput;
      const revokedById = req.context?.userId || null;
      const result = await businessAssignmentService.revokeAssignment(id, {
        ...body,
        revokedById,
      });
      sendSuccess(res, result, 200, "Business assignment revoked successfully");
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/platform/assignments/delegated-admins
   * Protected Master Admin endpoint: lists eligible DELEGATED_ADMIN users.
   */
  async getEligibleDelegatedAdmins(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await businessAssignmentService.getEligibleDelegatedAdmins();
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/platform/assignments/my-assigned-organizations
   * Authenticated endpoint: returns organizations assigned to the caller.
   * - Master Admin: returns all active organizations.
   * - Delegated Admin: returns organizations assigned via active BusinessAssignment records.
   * - Customer Tenant Roles: denied with HTTP 403 Forbidden.
   */
  async getMyAssignedOrganizations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const principal = platformAuthService.getPlatformPrincipal(req);

      if (principal.platformRole === "PLATFORM_MASTER_ADMIN") {
        const result = await businessAssignmentService.getMyAssignedOrganizations("", true);
        sendSuccess(res, result);
        return;
      }

      if (principal.platformRole === "DELEGATED_ADMIN" && req.context?.userId) {
        const result = await businessAssignmentService.getMyAssignedOrganizations(
          req.context.userId,
          false
        );
        sendSuccess(res, result);
        return;
      }

      // Customer roles or unauthenticated callers are denied
      if (!req.context?.user) {
        throw new UnauthorizedError("Authentication required. Please log in.");
      }

      throw new ForbiddenError(
        "Platform administrator authorization required. Access denied."
      );
    } catch (error) {
      next(error);
    }
  },
};
