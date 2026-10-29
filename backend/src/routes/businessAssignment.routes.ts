import { Router } from "express";
import { businessAssignmentController } from "../controllers/businessAssignment.controller.js";
import { platformAuthService } from "../services/platformAuth.service.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  createBusinessAssignmentSchema,
  revokeBusinessAssignmentSchema,
  queryBusinessAssignmentsSchema,
} from "../validators/businessAssignment.validator.js";

const businessAssignmentRouter = Router();

// 1. Authenticated endpoint: returns organizations assigned to authenticated caller (Delegated Admin / Master Admin)
businessAssignmentRouter.get(
  "/my-assigned-organizations",
  businessAssignmentController.getMyAssignedOrganizations
);

// 2. Protected Master Admin endpoint: lists eligible delegated admins for assignment selector
businessAssignmentRouter.get(
  "/delegated-admins",
  platformAuthService.requireMasterAdmin,
  businessAssignmentController.getEligibleDelegatedAdmins
);

// 3. Protected Master Admin endpoint: lists paginated business assignments
businessAssignmentRouter.get(
  "/",
  platformAuthService.requireMasterAdmin,
  validateRequest({ query: queryBusinessAssignmentsSchema }),
  businessAssignmentController.getAssignments
);

// 4. Protected Master Admin endpoint: creates a new business assignment
businessAssignmentRouter.post(
  "/",
  platformAuthService.requireMasterAdmin,
  validateRequest({ body: createBusinessAssignmentSchema }),
  businessAssignmentController.createAssignment
);

// 5. Protected Master Admin endpoint: revokes an active business assignment
businessAssignmentRouter.post(
  "/:id/revoke",
  platformAuthService.requireMasterAdmin,
  validateRequest({ body: revokeBusinessAssignmentSchema }),
  businessAssignmentController.revokeAssignment
);

export { businessAssignmentRouter };
