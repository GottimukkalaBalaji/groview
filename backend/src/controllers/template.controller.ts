import { Request, Response, NextFunction } from "express";
import { whatsappTemplateService } from "../services/whatsappTemplate.service.js";
import { sendSuccess } from "../utils/response.js";
import { NotFoundError, UnauthorizedError } from "../utils/errors.js";
import { isAllowedTestTemplate, ALLOWED_TEST_TEMPLATE_NAMES, getAllowedTestTemplates } from "../constants/templateAllowlist.js";

/**
 * Validates and extracts the trusted authenticated organization ID from the request context.
 * Rejects requests with HTTP 401 Unauthorized if organization context is missing or invalid.
 * Never falls back to default or unauthenticated organizations.
 */
function requireOrganizationId(req: Request): string {
  const organizationId = req.context?.organizationId;
  if (!organizationId || typeof organizationId !== "string" || organizationId.trim().length === 0) {
    throw new UnauthorizedError("Authentication required. Organization context is missing.");
  }
  return organizationId.trim();
}

export const templateController = {
  /**
   * Lists all message templates from the connected Meta WABA for the authenticated organization.
   * During the testing phase, restricts customer-facing templates to the exact testing allowlist.
   */
  async list(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      const forceRefresh = req.query.force === "true" || req.query.sync === "true";
      const approvedOnly = req.query.approvedOnly === "true" || req.query.sendable === "true";
      let { templates, summary } = await whatsappTemplateService.fetchWabaTemplates(
        organizationId,
        forceRefresh
      );

      // Restrict to testing allowlist
      templates = templates.filter((t) => isAllowedTestTemplate(t.name));

      if (approvedOnly) {
        templates = templates.filter((t) => t.status === "APPROVED" && t.isSendable);
      }

      const filteredSummary = {
        ...summary,
        totalOnMeta: templates.length,
        approvedCount: templates.filter((t) => t.status === "APPROVED").length,
        pendingCount: templates.filter((t) => t.status === "PENDING").length,
        rejectedCount: templates.filter((t) => t.status === "REJECTED").length,
      };

      sendSuccess(res, {
        templates,
        summary: filteredSummary,
        organizationId,
      });
    } catch (error) {
      next(error);
    }
  },

  /**
   * Submits a new custom template to Meta WhatsApp Cloud API for review.
   */
  async create(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      const result = await whatsappTemplateService.createTemplate(organizationId, req.body);
      sendSuccess(res, result, 201, "Template successfully submitted to Meta for review");
    } catch (error) {
      next(error);
    }
  },


  /**
   * Forces an immediate synchronization of templates from Meta WABA for the authenticated organization.
   * Restricts synchronized output to the exact testing allowlist.
   */
  async sync(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      let { templates, summary } = await whatsappTemplateService.fetchWabaTemplates(
        organizationId,
        true
      );

      // Restrict to testing allowlist
      templates = templates.filter((t) => isAllowedTestTemplate(t.name));

      const filteredSummary = {
        ...summary,
        totalOnMeta: templates.length,
        approvedCount: templates.filter((t) => t.status === "APPROVED").length,
        pendingCount: templates.filter((t) => t.status === "PENDING").length,
        rejectedCount: templates.filter((t) => t.status === "REJECTED").length,
      };

      sendSuccess(
        res,
        {
          templates,
          summary: filteredSummary,
          organizationId,
        },
        200,
        "Templates successfully synchronized from Meta WhatsApp Business Account"
      );
    } catch (error) {
      next(error);
    }
  },

  /**
   * Retrieves a single template by its unique name for the authenticated organization.
   * Enforces that only allowlisted templates can be retrieved during the testing phase.
   */
  async getByName(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      const { name } = req.params;

      if (!isAllowedTestTemplate(name)) {
        throw new NotFoundError(
          `WhatsApp template "${name}" not found on connected WABA (restricted to testing allowlist: ${ALLOWED_TEST_TEMPLATE_NAMES.join(", ")})`
        );
      }

      const template = await whatsappTemplateService.getTemplateByName(name, organizationId);

      if (!template) {
        throw new NotFoundError(`WhatsApp template "${name}" not found on connected WABA`);
      }

      sendSuccess(res, template);
    } catch (error) {
      next(error);
    }
  },

  /**
   * Validates parameter mappings against a template's required variables for the authenticated organization
   */
  async validate(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      const { name } = req.params;
      const { variables } = req.body as { variables?: Record<string, string> };

      if (!isAllowedTestTemplate(name)) {
        throw new NotFoundError(
          `WhatsApp template "${name}" not found on connected WABA (restricted to testing allowlist: ${getAllowedTestTemplates().join(", ")})`
        );
      }

      const template = await whatsappTemplateService.getTemplateByName(name, organizationId);
      if (!template) {
        throw new NotFoundError(`WhatsApp template "${name}" not found on connected WABA`);
      }

      const result = whatsappTemplateService.validateTemplateVariables(template, variables);

      sendSuccess(res, {
        templateName: template.name,
        isValid: result.isValid,
        errors: result.errors,
      });
    } catch (error) {
      next(error);
    }
  },
};
