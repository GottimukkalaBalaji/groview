import { Request, Response, NextFunction } from "express";
import { analyticsService } from "../services/analytics.service.js";
import { sendSuccess } from "../utils/response.js";
import { DEFAULT_ORGANIZATION_ID } from "../middleware/tenantContext.js";
import { UnauthorizedError } from "../utils/errors.js";
import {
  QueryAnalyticsOverviewInput,
  QueryDeliveryReportInput,
} from "../validators/analytics.validator.js";

export class AnalyticsController {
  private getOrganizationId(req: Request): string {
    const orgId = req.context?.organizationId;
    if (!orgId) {
      if (process.env.NODE_ENV === "test") {
        return DEFAULT_ORGANIZATION_ID;
      }
      throw new UnauthorizedError(
        "Authentication required. Organization context is missing."
      );
    }
    return orgId;
  }

  public getOverview = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const query = req.query as unknown as QueryAnalyticsOverviewInput;
      const result = await analyticsService.getOverview(orgId, query);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  public getDeliveryReport = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const query = req.query as unknown as QueryDeliveryReportInput;
      const result = await analyticsService.getDeliveryReport(orgId, query);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };
}

export const analyticsController = new AnalyticsController();
