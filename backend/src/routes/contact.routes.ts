import { Router } from "express";
import { contactController } from "../controllers/contact.controller.js";
import { tenantContextMiddleware } from "../middleware/tenantContext.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  queryContactsSchema,
  createContactSchema,
  updateContactSchema,
  updateConsentSchema,
  csvPreviewInputSchema,
  csvExecuteImportSchema,
} from "../validators/contact.validator.js";

const contactRouter = Router();

// Enforce tenant boundary on all contact operations
contactRouter.use(tenantContextMiddleware);

// CSV Import operations (must come before /:id routes to avoid collision)
contactRouter.post(
  "/import/preview",
  validateRequest({ body: csvPreviewInputSchema }),
  contactController.previewImport
);

contactRouter.post(
  "/import",
  validateRequest({ body: csvExecuteImportSchema }),
  contactController.executeImport
);

contactRouter.get("/import-jobs", contactController.listImportJobs);

contactRouter.get("/import-jobs/:id", contactController.getImportJobById);

// Contacts CRUD
contactRouter.get(
  "/",
  validateRequest({ query: queryContactsSchema }),
  contactController.list
);

contactRouter.post(
  "/",
  validateRequest({ body: createContactSchema }),
  contactController.create
);

contactRouter.get("/:id", contactController.getById);

contactRouter.put(
  "/:id",
  validateRequest({ body: updateContactSchema }),
  contactController.update
);

contactRouter.post(
  "/:id/consent",
  validateRequest({ body: updateConsentSchema }),
  contactController.recordConsent
);

contactRouter.delete("/:id", contactController.delete);

export { contactRouter };
