import { Router } from "express";
import { healthRoutes } from "./health.routes.js";
import { campaignRouter } from "./campaign.routes.js";
import { authRouter } from "./auth.routes.js";
import { contactRouter } from "./contact.routes.js";
import { audienceRouter } from "./audience.routes.js";
import { templateRouter } from "./template.routes.js";
import { webhookRouter } from "./webhook.routes.js";
import { whatsappIntegrationRouter } from "./whatsappIntegration.routes.js";
import { platformAdminRouter } from "./platformAdmin.routes.js";
import { analyticsRouter } from "./analytics.routes.js";

const apiRouter = Router();

// Root route for versioned API
apiRouter.get("/", (_req, res) => {
  res.json({
    service: "Grovastra API",
    version: "v1",
    message: "Welcome to Grovastra WhatsApp Campaign Management Platform API",
    endpoints: {
      health: "/api/v1/health",
      ready: "/api/v1/ready",
      auth: "/api/v1/auth",
      campaigns: "/api/v1/campaigns",
      contacts: "/api/v1/contacts",
      audiences: "/api/v1/audiences",
      templates: "/api/v1/templates",
      analytics: "/api/v1/analytics",
      webhooks: "/api/v1/webhooks/whatsapp",
      integrations: "/api/v1/integrations/whatsapp",
      platformWhatsApp: "/api/v1/admin/platform/whatsapp",
      platformAdmin: "/api/v1/admin/platform",
    },
  });
});

// Mount modular sub-routes
apiRouter.use("/", healthRoutes);
apiRouter.use("/auth", authRouter);
apiRouter.use("/campaigns", campaignRouter);
apiRouter.use("/contacts", contactRouter);
apiRouter.use("/audiences", audienceRouter);
apiRouter.use("/templates", templateRouter);
apiRouter.use("/analytics", analyticsRouter);
apiRouter.use("/webhooks/whatsapp", webhookRouter);
apiRouter.use("/integrations/whatsapp", whatsappIntegrationRouter);
apiRouter.use("/admin/platform", platformAdminRouter);

export { apiRouter };


