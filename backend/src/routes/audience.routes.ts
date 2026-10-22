import { Router } from "express";
import { audienceController } from "../controllers/audience.controller.js";
import { tenantContextMiddleware } from "../middleware/tenantContext.js";
import { validateRequest } from "../middleware/validateRequest.js";
import {
  createContactListSchema,
  updateContactListSchema,
  addListMembersSchema,
} from "../validators/contact.validator.js";

const audienceRouter = Router();

// Enforce tenant boundary on all audience operations
audienceRouter.use(tenantContextMiddleware);

// Audience lists CRUD
audienceRouter.get("/", audienceController.list);

audienceRouter.post(
  "/",
  validateRequest({ body: createContactListSchema }),
  audienceController.create
);

audienceRouter.get("/:id", audienceController.getById);

audienceRouter.put(
  "/:id",
  validateRequest({ body: updateContactListSchema }),
  audienceController.update
);

audienceRouter.delete("/:id", audienceController.delete);

// Membership operations
audienceRouter.post(
  "/:id/members",
  validateRequest({ body: addListMembersSchema }),
  audienceController.addMembers
);

audienceRouter.delete("/:id/members/:contactId", audienceController.removeMember);

export { audienceRouter };
