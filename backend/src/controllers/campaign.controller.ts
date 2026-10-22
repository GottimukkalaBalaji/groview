import { Request, Response, NextFunction } from "express";
import { campaignService } from "../services/campaign.service.js";
import { sendSuccess } from "../utils/response.js";
import { DEFAULT_ORGANIZATION_ID } from "../middleware/tenantContext.js";
import { UnauthorizedError } from "../utils/errors.js";
import { campaignSchedulerService } from "../services/campaignScheduler.service.js";
import {
  CreateCampaignInput,
  UpdateCampaignInput,
  QueryCampaignsInput,
  ScheduleCampaignInput,
} from "../validators/campaign.validator.js";

export class CampaignController {
  private getOrganizationId(req: Request): string {
    const orgId = req.context?.organizationId;
    if (!orgId) {
      if (process.env.NODE_ENV === "test") {
        return DEFAULT_ORGANIZATION_ID;
      }
      throw new UnauthorizedError("Authentication required. Organization context is missing.");
    }
    return orgId;
  }

  private getUserId(req: Request): string {
    return req.context?.userId || "system_user";
  }

  public list = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const query = req.query as unknown as QueryCampaignsInput;
      const result = await campaignService.listCampaigns(orgId, query);
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  public create = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const userId = this.getUserId(req);
      const body = req.body as CreateCampaignInput;
      const campaign = await campaignService.createCampaign(orgId, body, userId);
      sendSuccess(res, campaign, 201, "Campaign draft created successfully");
    } catch (error) {
      next(error);
    }
  };

  public getById = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const { id } = req.params;
      const campaign = await campaignService.getCampaignById(orgId, id);
      sendSuccess(res, campaign);
    } catch (error) {
      next(error);
    }
  };

  public getMessages = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const { id } = req.params;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 50;
      const status = req.query.status as any;

      const result = await campaignService.getCampaignMessages(orgId, id, {
        page,
        limit,
        status,
      });
      sendSuccess(res, result);
    } catch (error) {
      next(error);
    }
  };

  public update = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const { id } = req.params;
      const body = req.body as UpdateCampaignInput;
      const updated = await campaignService.updateCampaign(orgId, id, body);
      sendSuccess(res, updated, 200, "Campaign draft updated successfully");
    } catch (error) {
      next(error);
    }
  };

  public duplicate = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const userId = this.getUserId(req);
      const { id } = req.params;
      const duplicated = await campaignService.duplicateCampaign(orgId, id, userId);
      sendSuccess(res, duplicated, 201, "Campaign draft duplicated successfully");
    } catch (error) {
      next(error);
    }
  };

  public delete = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const { id } = req.params;
      const result = await campaignService.deleteCampaign(orgId, id);
      sendSuccess(res, result, 200, "Campaign draft deleted successfully");
    } catch (error) {
      next(error);
    }
  };

  public send = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const { id } = req.params;
      const summary = await campaignService.launchCampaign(orgId, id);
      sendSuccess(res, summary, 200, "Campaign prepared and queued for dispatch successfully");
    } catch (error) {
      next(error);
    }
  };

  public retryQueue = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const { id } = req.params;
      const summary = await campaignService.recoverCampaignQueue(orgId, id);
      sendSuccess(res, summary, 200, "Campaign queue recovery completed successfully");
    } catch (error) {
      next(error);
    }
  };

  public schedule = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const { id } = req.params;
      const { scheduledAt } = req.body as ScheduleCampaignInput;
      const scheduled = await campaignService.scheduleCampaign(orgId, id, scheduledAt);
      sendSuccess(res, scheduled, 200, "Campaign scheduled successfully");
    } catch (error) {
      next(error);
    }
  };

  public cancel = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const orgId = this.getOrganizationId(req);
      const { id } = req.params;
      const cancelled = await campaignService.cancelCampaign(orgId, id);
      sendSuccess(res, cancelled, 200, "Campaign cancelled successfully");
    } catch (error) {
      next(error);
    }
  };

  public getSchedulerStatus = async (
    _req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const status = await campaignSchedulerService.getSchedulerStatus();
      sendSuccess(res, status);
    } catch (error) {
      next(error);
    }
  };
}

export const campaignController = new CampaignController();
