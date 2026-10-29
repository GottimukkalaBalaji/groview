import { Request, Response, NextFunction } from "express";
import { platformAuthService } from "../services/platformAuth.service.js";
import { platformAdminService } from "../services/platformAdmin.service.js";
import { sendSuccess } from "../utils/response.js";
import { CreateDelegatedAdminInput } from "../validators/admin.validator.js";

export const platformAdminController = {
  /**
   * GET /api/v1/admin/platform/capabilities
   * Returns server-side evaluated platform capabilities for the caller.
   * Completely ignores client-supplied headers and derives capabilities from authenticated server context.
   */
  getCapabilities(req: Request, res: Response, next: NextFunction): void {
    try {
      const capabilities = platformAuthService.getCapabilities(req);
      sendSuccess(res, capabilities);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/platform/overview
   * Protected Master Admin endpoint: provides platform-wide telemetry, counts, and platform status.
   * Strictly gated by platformAuthService.requireMasterAdmin.
   */
  async getOverview(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const overview = await platformAdminService.getOverview();
      sendSuccess(res, overview);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/platform/organizations
   * Protected Master Admin endpoint: retrieves paginated customer organizations list.
   */
  async getOrganizations(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const search = typeof req.query.search === "string" ? req.query.search : undefined;
      const statusParam = typeof req.query.status === "string" ? req.query.status.toLowerCase() : undefined;
      const status =
        statusParam === "active" || statusParam === "archived" || statusParam === "all"
          ? (statusParam as "all" | "active" | "archived")
          : undefined;
      const page = req.query.page ? parseInt(String(req.query.page), 10) : 1;
      const limit = req.query.limit ? parseInt(String(req.query.limit), 10) : 10;

      const result = await platformAdminService.getOrganizations({
        search,
        status,
        page,
        limit,
      });

      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/platform/organizations/:id
   * Protected Master Admin endpoint: retrieves detailed info for a single customer organization.
   */
  async getOrganizationById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const organization = await platformAdminService.getOrganizationById(id);
      sendSuccess(res, organization);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/organizations/:id/archive
   * Protected Master Admin endpoint: deactivates/archives an organization.
   */
  async archiveOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const operatorOrgId = req.context?.organizationId;
      const archived = await platformAdminService.archiveOrganization(id, operatorOrgId);
      sendSuccess(res, archived, 200, "Organization deactivated and archived successfully.");
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/organizations/:id/reactivate
   * Protected Master Admin endpoint: reactivates an archived organization.
   */
  async reactivateOrganization(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const reactivated = await platformAdminService.reactivateOrganization(id);
      sendSuccess(res, reactivated, 200, "Organization reactivated successfully.");
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/platform/templates
   * Protected Master Admin endpoint: retrieves WhatsApp templates for the platform WABA.
   */
  async getTemplates(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const forceRefresh = req.query.force === "true";
      const data = await platformAdminService.getPlatformTemplates(forceRefresh);
      sendSuccess(res, data);
    } catch (error) {
      next(error);
    }
  },

  /**
   * GET /api/v1/admin/platform/admins
   * Protected Master Admin endpoint: retrieves all delegated administrator accounts.
   */
  async getDelegatedAdmins(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const admins = await platformAdminService.getDelegatedAdminsList();
      sendSuccess(res, admins);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/admins
   * Protected Master Admin endpoint: creates a new delegated administrator with chosen credentials.
   */
  async createDelegatedAdmin(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const body = req.body as CreateDelegatedAdminInput;
      const createdAdmin = await platformAdminService.createDelegatedAdmin(body);
      sendSuccess(res, createdAdmin, 201, "Delegated administrator created successfully.");
    } catch (error) {
      next(error);
    }
  },
};
