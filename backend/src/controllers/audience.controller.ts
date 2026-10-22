import { Request, Response, NextFunction } from "express";
import { audienceService } from "../services/audience.service.js";
import { sendSuccess } from "../utils/response.js";
import {
  CreateContactListInput,
  UpdateContactListInput,
  AddListMembersInput,
} from "../validators/contact.validator.js";

export class AudienceController {
  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const lists = await audienceService.list(orgId);
      sendSuccess(res, lists, 200, "Contact lists retrieved successfully");
    } catch (err) {
      next(err);
    }
  }

  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const page = req.query.page ? parseInt(req.query.page as string, 10) : 1;
      const limit = req.query.limit ? parseInt(req.query.limit as string, 10) : 20;
      const list = await audienceService.getById(orgId, req.params.id, page, limit);
      sendSuccess(res, list, 200, "Contact list retrieved successfully");
    } catch (err) {
      next(err);
    }
  }

  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const input = req.body as CreateContactListInput;
      const list = await audienceService.create(orgId, input);
      sendSuccess(res, list, 201, "Contact list created successfully");
    } catch (err) {
      next(err);
    }
  }

  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const input = req.body as UpdateContactListInput;
      const list = await audienceService.update(orgId, req.params.id, input);
      sendSuccess(res, list, 200, "Contact list updated successfully");
    } catch (err) {
      next(err);
    }
  }

  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      await audienceService.delete(orgId, req.params.id);
      sendSuccess(res, { deleted: true }, 200, "Contact list deleted successfully");
    } catch (err) {
      next(err);
    }
  }

  public async addMembers(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const input = req.body as AddListMembersInput;
      const result = await audienceService.addMembers(orgId, req.params.id, input);
      sendSuccess(res, result, 200, "Members added to list successfully");
    } catch (err) {
      next(err);
    }
  }

  public async removeMember(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      await audienceService.removeMember(orgId, req.params.id, req.params.contactId);
      sendSuccess(res, { removed: true }, 200, "Member removed from list successfully");
    } catch (err) {
      next(err);
    }
  }
}

export const audienceController = new AudienceController();
