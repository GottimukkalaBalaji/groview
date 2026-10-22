import { Request, Response, NextFunction } from "express";
import { contactService } from "../services/contact.service.js";
import { importService } from "../services/import.service.js";
import { sendSuccess } from "../utils/response.js";
import {
  QueryContactsInput,
  CreateContactInput,
  UpdateContactInput,
  UpdateConsentInput,
  CsvPreviewInput,
  CsvExecuteImportInput,
} from "../validators/contact.validator.js";

export class ContactController {
  public async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const query = req.query as unknown as QueryContactsInput;
      const result = await contactService.list(orgId, query);
      sendSuccess(res, result, 200, "Contacts retrieved successfully");
    } catch (err) {
      next(err);
    }
  }

  public async getById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const contact = await contactService.getById(orgId, req.params.id);
      sendSuccess(res, contact, 200, "Contact retrieved successfully");
    } catch (err) {
      next(err);
    }
  }

  public async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const userId = req.context!.userId;
      const input = req.body as CreateContactInput;
      const contact = await contactService.create(orgId, input, userId);
      sendSuccess(res, contact, 201, "Contact created successfully");
    } catch (err) {
      next(err);
    }
  }

  public async update(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const input = req.body as UpdateContactInput;
      const contact = await contactService.update(orgId, req.params.id, input);
      sendSuccess(res, contact, 200, "Contact updated successfully");
    } catch (err) {
      next(err);
    }
  }

  public async recordConsent(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const userId = req.context!.userId;
      const input = req.body as UpdateConsentInput;
      const contact = await contactService.recordConsentEvent(
        orgId,
        req.params.id,
        input,
        userId
      );
      sendSuccess(res, contact, 200, "Consent record updated successfully");
    } catch (err) {
      next(err);
    }
  }

  public async delete(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      await contactService.delete(orgId, req.params.id);
      sendSuccess(res, { deleted: true }, 200, "Contact deleted successfully");
    } catch (err) {
      next(err);
    }
  }

  public async previewImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const input = req.body as CsvPreviewInput;
      const preview = await importService.preview(input);
      sendSuccess(res, preview, 200, "CSV preview generated successfully");
    } catch (err) {
      next(err);
    }
  }

  public async executeImport(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const userId = req.context!.userId;
      const input = req.body as CsvExecuteImportInput;
      const result = await importService.executeImport(orgId, input, userId);
      sendSuccess(res, result, 200, "CSV import completed");
    } catch (err) {
      next(err);
    }
  }

  public async listImportJobs(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const jobs = await importService.listJobs(orgId);
      sendSuccess(res, jobs, 200, "Import jobs retrieved successfully");
    } catch (err) {
      next(err);
    }
  }

  public async getImportJobById(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const orgId = req.context!.organizationId;
      const job = await importService.getJobById(orgId, req.params.id);
      sendSuccess(res, job, 200, "Import job details retrieved successfully");
    } catch (err) {
      next(err);
    }
  }
}

export const contactController = new ContactController();
