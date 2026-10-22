import { Router } from "express";
import { analyticsController } from "../controllers/analytics.controller.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { tenantContextMiddleware } from "../middleware/tenantContext.js";
import {
  queryAnalyticsOverviewSchema,
  queryDeliveryReportSchema,
} from "../validators/analytics.validator.js";

const analyticsRouter = Router();

// Enforce tenant organization boundary on all analytics operations
analyticsRouter.use(tenantContextMiddleware);

// Get tenant-scoped analytics overview (summary metrics, rates, trends, scheduling)
analyticsRouter.get(
  "/overview",
  validateRequest({ query: queryAnalyticsOverviewSchema }),
  analyticsController.getOverview
);

// Get searchable, paginated recipient-level delivery report
analyticsRouter.get(
  "/messages",
  validateRequest({ query: queryDeliveryReportSchema }),
  analyticsController.getDeliveryReport
);

export { analyticsRouter };
