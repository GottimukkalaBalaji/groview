import { Router } from "express";
import { platformWhatsAppController } from "../controllers/platformWhatsApp.controller.js";
import { platformAdminMiddleware } from "../middleware/platformAdmin.js";
import { whatsappIntegrationRateLimiter } from "../middleware/rateLimiter.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { connectWhatsAppSchema } from "../validators/whatsappIntegration.validator.js";

const platformWhatsAppRouter = Router();

// Enforce verified platform administrator authorization on all platform endpoints
platformWhatsAppRouter.use(platformAdminMiddleware);

// Inspect platform connection status
platformWhatsAppRouter.get("/status", platformWhatsAppController.getStatus);

// Connect / update platform WhatsApp credentials
platformWhatsAppRouter.post(
  "/connect",
  whatsappIntegrationRateLimiter,
  validateRequest({ body: connectWhatsAppSchema }),
  platformWhatsAppController.connect
);

// Refresh platform connection
platformWhatsAppRouter.post(
  "/refresh",
  whatsappIntegrationRateLimiter,
  platformWhatsAppController.refresh
);

// Disconnect platform WhatsApp account
platformWhatsAppRouter.delete(
  "/disconnect",
  whatsappIntegrationRateLimiter,
  platformWhatsAppController.disconnect
);

export { platformWhatsAppRouter };
