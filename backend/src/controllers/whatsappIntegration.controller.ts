import { Request, Response, NextFunction } from "express";
import { whatsappIntegrationService } from "../services/whatsappIntegration.service.js";
import { sendSuccess } from "../utils/response.js";
import { UnauthorizedError } from "../utils/errors.js";

/**
 * Validates and extracts the trusted authenticated organization ID from request context.
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

export const whatsappIntegrationController = {
  /**
   * GET /api/v1/integrations/whatsapp/status
   * Returns current organization's WhatsApp connection status and safe metadata.
   * Never returns access tokens, ciphertexts, or encryption keys.
   */
  async getStatus(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      const status = await whatsappIntegrationService.getConnectionStatus(organizationId);

      sendSuccess(res, status);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/integrations/whatsapp/connect
   * Validates credentials against Meta Graph API, checks uniqueness, and stores encrypted token.
   */
  async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      const { wabaId, phoneNumberId, accessToken } = req.body;

      const connection = await whatsappIntegrationService.connectAccount(organizationId, {
        wabaId,
        phoneNumberId,
        accessToken,
      });

      sendSuccess(res, connection, 201, "WhatsApp account connected and verified successfully.");
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/integrations/whatsapp/refresh
   * Revalidates current organization's connection using its decrypted token.
   * Updates metadata or marks account TOKEN_EXPIRED if revoked.
   */
  async refresh(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      const status = await whatsappIntegrationService.refreshConnection(organizationId);

      sendSuccess(res, status, 200, "WhatsApp connection refreshed successfully.");
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/v1/integrations/whatsapp/disconnect
   * Disconnects current organization's WhatsApp connection and removes active credentials.
   * Preserves historical messages and webhook audit logs.
   */
  async disconnect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const organizationId = requireOrganizationId(req);
      const result = await whatsappIntegrationService.disconnectAccount(organizationId);

      sendSuccess(res, result, 200, result.message);
    } catch (error) {
      next(error);
    }
  },
};
