import { Router } from "express";
import { templateController } from "../controllers/template.controller.js";
import { tenantContextMiddleware } from "../middleware/tenantContext.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { createTemplateSchema } from "../validators/template.validator.js";

const templateRouter = Router();

// Enforce authenticated organization context on all template endpoints
templateRouter.use(tenantContextMiddleware);

// List templates (with optional cache force refresh via query ?force=true)
templateRouter.get("/", templateController.list);

// Submit a new custom template to Meta WhatsApp Cloud API for review
templateRouter.post(
  "/",
  validateRequest({ body: createTemplateSchema }),
  templateController.create
);

// Explicit manual synchronization endpoint
templateRouter.post("/sync", templateController.sync);

// Single template by name
templateRouter.get("/:name", templateController.getByName);

// Parameter validation
templateRouter.post("/:name/validate", templateController.validate);

export { templateRouter };
