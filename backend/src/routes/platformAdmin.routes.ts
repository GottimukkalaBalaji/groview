import { Router } from "express";
import { platformAdminController } from "../controllers/platformAdmin.controller.js";
import { platformWhatsAppRouter } from "./platformWhatsApp.routes.js";
import { businessAssignmentRouter } from "./businessAssignment.routes.js";
import { platformAuthService } from "../services/platformAuth.service.js";
import { optionalTenantContextMiddleware } from "../middleware/tenantContext.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createDelegatedAdminSchema } from "../validators/admin.validator.js";
import { platformCampaignApprovalController } from "../controllers/platformCampaignApproval.controller.js";
import { queryPlatformCampaignApprovalsSchema } from "../validators/campaignApproval.validator.js";
import {
  campaignIdParamSchema,
  approveCampaignSchema,
  rejectCampaignSchema,
} from "../validators/campaign.validator.js";

const platformAdminRouter = Router();

// Safely extract authenticated user session if present (via HttpOnly cookies or Bearer token)
platformAdminRouter.use(optionalTenantContextMiddleware);

// Capabilities endpoint: safely queries server-evaluated capabilities without secrets
platformAdminRouter.get("/capabilities", platformAdminController.getCapabilities);

// Protected Master Admin overview endpoint: platform-wide telemetry & metrics
platformAdminRouter.get(
  "/overview",
  platformAuthService.requireMasterAdmin,
  platformAdminController.getOverview
);

// Protected Master Admin organization directory & management
platformAdminRouter.get(
  "/organizations",
  platformAuthService.requireMasterAdmin,
  platformAdminController.getOrganizations
);

platformAdminRouter.get(
  "/organizations/:id",
  platformAuthService.requireMasterAdmin,
  platformAdminController.getOrganizationById
);

platformAdminRouter.post(
  "/organizations/:id/archive",
  platformAuthService.requireMasterAdmin,
  platformAdminController.archiveOrganization
);

platformAdminRouter.post(
  "/organizations/:id/reactivate",
  platformAuthService.requireMasterAdmin,
  platformAdminController.reactivateOrganization
);

// Protected Master Admin platform templates
platformAdminRouter.get(
  "/templates",
  platformAuthService.requireMasterAdmin,
  platformAdminController.getTemplates
);

// Protected Master Admin delegated admin accounts management
platformAdminRouter.get(
  "/admins",
  platformAuthService.requireMasterAdmin,
  platformAdminController.getDelegatedAdmins
);

platformAdminRouter.post(
  "/admins",
  platformAuthService.requireMasterAdmin,
  validateRequest({ body: createDelegatedAdminSchema }),
  platformAdminController.createDelegatedAdmin
);

// Delegated Business Assignments management routes
platformAdminRouter.use("/assignments", businessAssignmentRouter);

// WhatsApp platform management routes (protected by platformAdminMiddleware)
platformAdminRouter.use("/whatsapp", platformWhatsAppRouter);

// Multi-Tenant Platform Campaign Approvals (accessible to Master Admin & Delegated Admin)
platformAdminRouter.get(
  "/campaign-approvals",
  validateRequest({ query: queryPlatformCampaignApprovalsSchema }),
  platformCampaignApprovalController.listApprovals
);

platformAdminRouter.post(
  "/campaign-approvals/:id/approve",
  validateRequest({
    params: campaignIdParamSchema,
    body: approveCampaignSchema,
  }),
  platformCampaignApprovalController.approveApproval
);

platformAdminRouter.post(
  "/campaign-approvals/:id/reject",
  validateRequest({
    params: campaignIdParamSchema,
    body: rejectCampaignSchema,
  }),
  platformCampaignApprovalController.rejectApproval
);

export { platformAdminRouter };

