import { Request, Response, NextFunction } from "express";
import { campaignService } from "../services/campaign.service.js";
import { platformAuthService } from "../services/platformAuth.service.js";
import { sendSuccess } from "../utils/response.js";
import { ForbiddenError, NotFoundError } from "../utils/errors.js";
import { QueryPlatformCampaignApprovalsInput } from "../validators/campaignApproval.validator.js";
import { ApproveCampaignInput, RejectCampaignInput } from "../validators/campaign.validator.js";

export const platformCampaignApprovalController = {
  /**
   * GET /api/v1/admin/platform/campaign-approvals
   * Multi-tenant campaign approval requests queue.
   * - Master Admin: Platform-wide across all customer organizations.
   * - Delegated Admin: Strictly scoped to assigned customer organizations.
   * - Customer Tenant Roles: Denied with HTTP 403 Forbidden.
   */
  async listApprovals(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const principal = await platformAuthService.resolvePlatformPrincipal(req);

      if (principal.platformRole === "NONE") {
        throw new ForbiddenError(
          "Platform administrator authorization required. Access denied."
        );
      }

      const allowedOrganizationIds: string[] | "ALL" =
        principal.platformRole === "PLATFORM_MASTER_ADMIN"
          ? "ALL"
          : principal.assignedOrganizationIds;

      const query = (req.query || {}) as unknown as QueryPlatformCampaignApprovalsInput;

      const result = await campaignService.listApprovalRequests({
        allowedOrganizationIds,
        query,
      });

      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/campaign-approvals/:id/approve
   * Approves a scheduled campaign draft across assigned customer organizations.
   */
  async approveApproval(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = (req.body || {}) as ApproveCampaignInput;

      // 1. Retrieve target campaign across organizations
      const campaign = await campaignService.getCampaignByIdAcrossOrgs(id);
      if (!campaign) {
        throw new NotFoundError(`Campaign with ID '${id}' not found`);
      }

      // 2. Enforce platform role & assignment boundaries server-side
      platformAuthService.assertCampaignApprovalPrivilege(req, campaign.organizationId);

      const reviewerUserId =
        req.context?.userId ||
        (req.isPlatformAdmin ? "platform_master_admin" : "system_admin");

      // 3. Delegate to existing CAS approval workflow with worker/queue safety fencing
      const updated = await campaignService.approveCampaign(
        campaign.organizationId,
        id,
        reviewerUserId,
        body.notes || null
      );

      sendSuccess(res, updated, 200, "Campaign approved successfully");
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/campaign-approvals/:id/reject
   * Rejects a scheduled campaign draft across assigned customer organizations with audit reason.
   */
  async rejectApproval(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { id } = req.params;
      const body = req.body as RejectCampaignInput;

      // 1. Retrieve target campaign across organizations
      const campaign = await campaignService.getCampaignByIdAcrossOrgs(id);
      if (!campaign) {
        throw new NotFoundError(`Campaign with ID '${id}' not found`);
      }

      // 2. Enforce platform role & assignment boundaries server-side
      platformAuthService.assertCampaignApprovalPrivilege(req, campaign.organizationId);

      const reviewerUserId =
        req.context?.userId ||
        (req.isPlatformAdmin ? "platform_master_admin" : "system_admin");

      // 3. Delegate to existing CAS rejection workflow with BullMQ queue removal & safety fencing
      const updated = await campaignService.rejectCampaign(
        campaign.organizationId,
        id,
        reviewerUserId,
        body.reason
      );

      sendSuccess(res, updated, 200, "Campaign rejected successfully");
    } catch (error) {
      next(error);
    }
  },
};
