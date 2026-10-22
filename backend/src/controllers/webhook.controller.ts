import { Request, Response } from "express";
import { validateWebhookConfig } from "../config/env.js";
import {
  verifyMetaSignature,
  WebhookService,
  parseLosslessMetaWebhookPayload,
  MetaWebhookPayload,
} from "../services/webhook.service.js";
import { logger } from "../utils/logger.js";

export class WebhookController {
  /**
   * Handles Meta Webhook Verification Request (GET)
   * Responds with the challenge if the verify token matches.
   */
  public static verifyWebhook(req: Request, res: Response): void {
    const mode = req.query["hub.mode"];
    const token = req.query["hub.verify_token"];
    const challenge = req.query["hub.challenge"];

    let expectedToken: string | undefined;
    try {
      const webhookConfig = validateWebhookConfig();
      expectedToken = webhookConfig.webhookVerifyToken;
    } catch {
      expectedToken = process.env.META_WEBHOOK_VERIFY_TOKEN;
    }

    if (!expectedToken) {
      logger.error("META_WEBHOOK_VERIFY_TOKEN is not configured in server environment");
      res.status(500).json({ error: "Webhook verification token not configured" });
      return;
    }

    if (mode === "subscribe" && token === expectedToken) {
      logger.info("Meta Webhook verification challenge succeeded");
      res.status(200).send(challenge);
      return;
    }

    logger.warn("Meta Webhook verification failed: invalid token or mode", {
      providedMode: mode,
    });
    res.status(403).json({ error: "Verification token mismatch" });
  }

  /**
   * Handles Meta Webhook Event Ingestion (POST)
   * Validates HMAC signature against raw request body before processing.
   */
  public static async handleWebhook(req: Request, res: Response): Promise<void> {
    const signature = req.headers["x-hub-signature-256"] as string | undefined;
    const rawBody = (req as unknown as { rawBody?: Buffer }).rawBody;

    let appSecret: string | undefined;
    try {
      const webhookConfig = validateWebhookConfig();
      appSecret = webhookConfig.appSecret;
    } catch {
      appSecret = process.env.META_APP_SECRET;
    }

    // In production or when appSecret is set, verify cryptographic HMAC
    if (appSecret) {
      const isValid = verifyMetaSignature(rawBody, signature, appSecret);
      if (!isValid) {
        logger.warn("Rejected webhook request: invalid X-Hub-Signature-256 signature");
        res.status(401).json({ error: "Invalid signature" });
        return;
      }
    } else if (process.env.NODE_ENV === "production") {
      logger.error("META_APP_SECRET is not configured in production environment");
      res.status(500).json({ error: "Server security configuration incomplete" });
      return;
    }

    try {
      let payload = req.body as MetaWebhookPayload;
      if (rawBody) {
        try {
          payload = parseLosslessMetaWebhookPayload(rawBody);
        } catch (parseErr: unknown) {
          logger.warn("Failed lossless JSON parsing of webhook rawBody, falling back to express req.body", {
            error: (parseErr as Error)?.message,
          });
          payload = req.body as MetaWebhookPayload;
        }
      }

      if (!payload || payload.object !== "whatsapp_business_account") {
        res.status(200).json({ status: "ignored_non_waba_event" });
        return;
      }

      const result = await WebhookService.ingestWebhookPayload(payload, rawBody);

      // Meta requires immediate HTTP 200 OK
      res.status(200).json({
        status: "received",
        data: result,
      });
    } catch (err: unknown) {
      logger.error("Unexpected error ingesting webhook payload", err);
      // Return 200 to prevent Meta from spamming repeated exponential webhook retries
      res.status(200).json({ status: "error_handled", message: (err as Error)?.message });
    }
  }
}
