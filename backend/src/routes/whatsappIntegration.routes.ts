import { Router } from "express";
import { whatsappIntegrationController } from "../controllers/whatsappIntegration.controller.js";
import { tenantContextMiddleware } from "../middleware/tenantContext.js";
import { whatsappIntegrationRateLimiter } from "../middleware/rateLimiter.js";
import { validateRequest } from "../middleware/validateRequest.js";
import { connectWhatsAppSchema } from "../validators/whatsappIntegration.validator.js";

const whatsappIntegrationRouter = Router();

// Enforce authenticated organization context on all WhatsApp integration endpoints
whatsappIntegrationRouter.use(tenantContextMiddleware);

// Inspect connection status
whatsappIntegrationRouter.get("/status", whatsappIntegrationController.getStatus);

// Connect / verify new credentials
whatsappIntegrationRouter.post(
  "/connect",
  whatsappIntegrationRateLimiter,
  validateRequest({ body: connectWhatsAppSchema }),
  whatsappIntegrationController.connect
);

// Refresh existing connection
whatsappIntegrationRouter.post(
  "/refresh",
  whatsappIntegrationRateLimiter,
  whatsappIntegrationController.refresh
);

// Disconnect WhatsApp account
whatsappIntegrationRouter.delete(
  "/disconnect",
  whatsappIntegrationRateLimiter,
  whatsappIntegrationController.disconnect
);

export { whatsappIntegrationRouter };
