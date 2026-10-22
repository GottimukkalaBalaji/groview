import { Request, Response, NextFunction } from "express";
import { whatsappIntegrationService } from "../services/whatsappIntegration.service.js";
import { sendSuccess } from "../utils/response.js";

export const platformWhatsAppController = {
  /**
   * GET /api/v1/admin/platform/whatsapp/status
   * Platform Administrator: Inspects Grovastra shared WhatsApp account connection status.
   * Restricted to verified platform-level principals via platformAdminMiddleware.
   */
  async getStatus(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = await whatsappIntegrationService.getPlatformConnectionStatus();
      sendSuccess(res, status);
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/whatsapp/connect
   * Platform Administrator: Connects or updates shared platform WhatsApp credentials.
   * Verifies against Meta Graph API and stores encrypted token under the platform anchor.
   */
  async connect(req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const { wabaId, phoneNumberId, accessToken } = req.body;
      const connection = await whatsappIntegrationService.connectPlatformAccount({
        wabaId,
        phoneNumberId,
        accessToken,
      });

      sendSuccess(
        res,
        connection,
        201,
        "Platform WhatsApp Business Account connected and verified successfully."
      );
    } catch (error) {
      next(error);
    }
  },

  /**
   * POST /api/v1/admin/platform/whatsapp/refresh
   * Platform Administrator: Re-verifies stored platform credentials against Meta Graph API.
   */
  async refresh(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const status = await whatsappIntegrationService.refreshPlatformConnection();
      sendSuccess(res, status, 200, "Platform WhatsApp connection refreshed successfully.");
    } catch (error) {
      next(error);
    }
  },

  /**
   * DELETE /api/v1/admin/platform/whatsapp/disconnect
   * Platform Administrator: Disconnects the shared platform WhatsApp account and tombstones credentials.
   */
  async disconnect(_req: Request, res: Response, next: NextFunction): Promise<void> {
    try {
      const result = await whatsappIntegrationService.disconnectPlatformAccount();
      sendSuccess(res, result, 200, result.message);
    } catch (error) {
      next(error);
    }
  },
};
