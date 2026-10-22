import { Router } from "express";
import { campaignController } from "../controllers/campaign.controller.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { tenantContextMiddleware } from "../middleware/tenantContext.js";
import {
  createCampaignSchema,
  updateCampaignSchema,
  queryCampaignsSchema,
  campaignIdParamSchema,
  scheduleCampaignSchema,
} from "../validators/campaign.validator.js";

const campaignRouter = Router();

// Enforce tenant organization boundary on all campaign operations
campaignRouter.use(tenantContextMiddleware);

// Scheduler status and health
campaignRouter.get(
  "/scheduler/status",
  campaignController.getSchedulerStatus
);

// List campaigns with search, status filtering, and pagination
campaignRouter.get(
  "/",
  validateRequest({ query: queryCampaignsSchema }),
  campaignController.list
);

// Create a new campaign draft
campaignRouter.post(
  "/",
  validateRequest({ body: createCampaignSchema }),
  campaignController.create
);

// Fetch a single campaign by ID
campaignRouter.get(
  "/:id",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.getById
);

// Fetch paginated per-message delivery records for a campaign (tenant-scoped)
campaignRouter.get(
  "/:id/messages",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.getMessages
);

// Update an existing campaign draft
campaignRouter.put(
  "/:id",
  validateRequest({
    params: campaignIdParamSchema,
    body: updateCampaignSchema,
  }),
  campaignController.update
);

// Duplicate a campaign into an independent draft
campaignRouter.post(
  "/:id/duplicate",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.duplicate
);

// Delete a campaign draft
campaignRouter.delete(
  "/:id",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.delete
);

// Prepare and launch campaign for dispatch (idempotent queue preparation)
campaignRouter.post(
  "/:id/send",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.send
);

// Launch alias for send endpoint
campaignRouter.post(
  "/:id/launch",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.send
);

// Explicit queue recovery for campaigns with stranded QUEUED messages
campaignRouter.post(
  "/:id/retry-queue",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.retryQueue
);

// Recover-queue alias
campaignRouter.post(
  "/:id/recover-queue",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.retryQueue
);

// Schedule a campaign for future dispatch
campaignRouter.post(
  "/:id/schedule",
  validateRequest({
    params: campaignIdParamSchema,
    body: scheduleCampaignSchema,
  }),
  campaignController.schedule
);

// Cancel a scheduled or draft campaign before dispatch
campaignRouter.post(
  "/:id/cancel",
  validateRequest({ params: campaignIdParamSchema }),
  campaignController.cancel
);

export { campaignRouter };
