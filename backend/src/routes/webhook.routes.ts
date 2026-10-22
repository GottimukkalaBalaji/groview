import { Router } from "express";
import { WebhookController } from "../controllers/webhook.controller.js";

const webhookRouter = Router();

// Meta Webhook Verification (GET)
webhookRouter.get("/", WebhookController.verifyWebhook);

// Meta Webhook Event Notification (POST)
webhookRouter.post("/", WebhookController.handleWebhook);

export { webhookRouter };
