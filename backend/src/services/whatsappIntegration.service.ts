import { getPrismaClient } from "../config/prisma.js";
import { validateMetaConfig } from "../config/env.js";
import { encryptSecret, decryptSecret } from "../utils/encryption.js";
import {
  AppError,
  BadRequestError,
  ConflictError,
  NotFoundError,
  UnauthorizedError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { MetaConnectionStatus } from "@prisma/client";
import { whatsappTemplateService } from "./whatsappTemplate.service.js";
import { ConnectWhatsAppInput } from "../validators/whatsappIntegration.validator.js";
import { MetaConfigResolver } from "./metaConfigResolver.js";

export interface SafeConnectionStatus {
  connected: boolean;
  status: MetaConnectionStatus;
  source: "DATABASE" | "ENV_FALLBACK" | "PLATFORM_SHARED" | "NONE";
  mode?: "SHARED_PLATFORM" | "DEDICATED";
  canManageCredentials?: boolean;
  isSharedPlatform?: boolean;
  sharedNotice?: string;
  wabaId: string | null;
  phoneNumberId: string | null;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  tokenExpiresAt: string | null;
  verifiedAt: string | null;
  lastSyncedAt: string | null;
  lastError: string | null;
}

export interface VerifiedMetaDetails {
  wabaId: string;
  phoneNumberId: string;
  displayPhoneNumber: string | null;
  verifiedName: string | null;
  tokenExpiresAt: Date | null;
}

export class WhatsAppIntegrationService {
  /**
   * Verifies access token, phone number ID, and WABA ID against Meta Graph API.
   * Confirms phone number actually belongs to the specified WABA and token has required access.
   * Never logs access token.
   */
  public async verifyMetaCredentials(
    wabaId: string,
    phoneNumberId: string,
    accessToken: string
  ): Promise<VerifiedMetaDetails> {
    const version = process.env.META_GRAPH_API_VERSION || "v22.0";
    const maskedWaba = wabaId.length > 4 ? `***${wabaId.slice(-4)}` : "***";
    const maskedPhone = phoneNumberId.length > 4 ? `***${phoneNumberId.slice(-4)}` : "***";

    logger.info(
      `[WhatsAppIntegrationService] Verifying Meta credentials for WABA ${maskedWaba} and Phone ${maskedPhone} (Graph API: ${version})`
    );

    // 1. Verify Phone Number ID & WABA association
    const phoneUrl = `https://graph.facebook.com/${version}/${phoneNumberId}?fields=verified_name,display_phone_number,whatsapp_business_account,code_verification_status`;
    const phoneController = new AbortController();
    const phoneTimeout = setTimeout(() => phoneController.abort(), 10000);

    let phoneResponse: Response;
    try {
      phoneResponse = await fetch(phoneUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: phoneController.signal,
      });
    } catch (err: unknown) {
      clearTimeout(phoneTimeout);
      const isAbort = (err as Error)?.name === "AbortError";
      logger.error(
        `[WhatsAppIntegrationService] Network error during phone verification: ${(err as Error)?.message}`
      );
      throw new AppError(
        isAbort
          ? "Meta Cloud API phone verification timed out after 10 seconds."
          : "Failed to communicate with Meta Cloud API. Please check your network connection.",
        isAbort ? 504 : 502,
        isAbort ? "META_TIMEOUT" : "META_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(phoneTimeout);
    }

    const phoneData = (await phoneResponse.json()) as {
      verified_name?: string;
      display_phone_number?: string;
      whatsapp_business_account?: { id?: string };
      error?: {
        message?: string;
        code?: number;
        error_subcode?: number;
        type?: string;
      };
    };

    if (!phoneResponse.ok) {
      const errCode = phoneData.error?.code;
      const errMsg = phoneData.error?.message || `HTTP ${phoneResponse.status} from Meta`;

      logger.warn(
        `[WhatsAppIntegrationService] Phone verification rejected by Meta [Code: ${errCode}]: ${errMsg}`
      );

      if (errCode === 190 || phoneResponse.status === 401) {
        throw new AppError(
          "The provided Meta access token is invalid, expired, or has been revoked.",
          401,
          "META_AUTH_INVALID"
        );
      }
      if (errCode === 10 || errCode === 200 || phoneResponse.status === 403) {
        throw new AppError(
          `Insufficient permissions for this Meta token or phone number: ${errMsg}`,
          403,
          "META_PERMISSION_DENIED"
        );
      }
      if (errCode === 80007 || phoneResponse.status === 429) {
        throw new AppError(
          "Meta API rate limit reached. Please wait a moment before trying again.",
          429,
          "META_RATE_LIMITED"
        );
      }

      throw new BadRequestError(`Meta rejected phone number verification: ${errMsg}`);
    }

    // Verify phone number actually belongs to the supplied WABA
    const actualWabaId = phoneData.whatsapp_business_account?.id;
    if (!actualWabaId || actualWabaId !== wabaId) {
      logger.warn(
        `[WhatsAppIntegrationService] WABA and Phone mismatch: Phone belongs to ${actualWabaId || "unknown"}, caller claimed ${wabaId}`
      );
      throw new AppError(
        "The supplied Phone Number ID does not belong to the specified WhatsApp Business Account (WABA).",
        400,
        "WABA_PHONE_MISMATCH"
      );
    }

    // 2. Verify WABA accessibility with supplied token
    const wabaUrl = `https://graph.facebook.com/${version}/${wabaId}?fields=id,name,timezone_id`;
    const wabaController = new AbortController();
    const wabaTimeout = setTimeout(() => wabaController.abort(), 10000);

    let wabaResponse: Response;
    try {
      wabaResponse = await fetch(wabaUrl, {
        method: "GET",
        headers: {
          Authorization: `Bearer ${accessToken}`,
          Accept: "application/json",
        },
        signal: wabaController.signal,
      });
    } catch (err: unknown) {
      clearTimeout(wabaTimeout);
      const isAbort = (err as Error)?.name === "AbortError";
      logger.error(
        `[WhatsAppIntegrationService] Network error during WABA verification: ${(err as Error)?.message}`
      );
      throw new AppError(
        isAbort
          ? "Meta Cloud API WABA verification timed out after 10 seconds."
          : "Failed to communicate with Meta Cloud API. Please check your network connection.",
        isAbort ? 504 : 502,
        isAbort ? "META_TIMEOUT" : "META_NETWORK_ERROR"
      );
    } finally {
      clearTimeout(wabaTimeout);
    }

    const wabaData = (await wabaResponse.json()) as {
      id?: string;
      name?: string;
      error?: {
        message?: string;
        code?: number;
      };
    };

    if (!wabaResponse.ok) {
      const errCode = wabaData.error?.code;
      const errMsg = wabaData.error?.message || `HTTP ${wabaResponse.status} from Meta`;

      logger.warn(
        `[WhatsAppIntegrationService] WABA verification rejected by Meta [Code: ${errCode}]: ${errMsg}`
      );

      if (errCode === 190 || wabaResponse.status === 401) {
        throw new AppError(
          "The provided Meta access token is invalid, expired, or has been revoked.",
          401,
          "META_AUTH_INVALID"
        );
      }
      if (errCode === 10 || errCode === 200 || wabaResponse.status === 403) {
        throw new AppError(
          `Insufficient permissions to access the specified WhatsApp Business Account: ${errMsg}`,
          403,
          "META_PERMISSION_DENIED"
        );
      }

      throw new BadRequestError(`Meta rejected WhatsApp Business Account verification: ${errMsg}`);
    }

    // 3. Optional/Best-effort token debug for expiry inspection
    let tokenExpiresAt: Date | null = null;
    try {
      const debugUrl = `https://graph.facebook.com/${version}/debug_token?input_token=${encodeURIComponent(accessToken)}&access_token=${encodeURIComponent(accessToken)}`;
      const debugController = new AbortController();
      const debugTimeout = setTimeout(() => debugController.abort(), 5000);

      const debugRes = await fetch(debugUrl, {
        method: "GET",
        signal: debugController.signal,
      });
      clearTimeout(debugTimeout);

      if (debugRes.ok) {
        const debugData = (await debugRes.json()) as {
          data?: {
            expires_at?: number;
            is_valid?: boolean;
          };
        };

        if (debugData.data?.is_valid === false) {
          throw new AppError(
            "Meta access token is reported as invalid by debug endpoint.",
            401,
            "META_AUTH_INVALID"
          );
        }

        if (typeof debugData.data?.expires_at === "number" && debugData.data.expires_at > 0) {
          tokenExpiresAt = new Date(debugData.data.expires_at * 1000);
        }
      }
    } catch (debugErr: unknown) {
      if (debugErr instanceof AppError && debugErr.statusCode === 401) {
        throw debugErr;
      }
      // System User tokens frequently cannot debug themselves without app secret; safe to ignore
    }

    return {
      wabaId,
      phoneNumberId,
      displayPhoneNumber: phoneData.display_phone_number || null,
      verifiedName: phoneData.verified_name || wabaData.name || null,
      tokenExpiresAt,
    };
  }

  /**
   * Returns whether the server is operating in shared platform WhatsApp mode.
   */
  public isSharedPlatformMode(): boolean {
    return MetaConfigResolver.getAccountMode() === "SHARED_PLATFORM";
  }

  /**
   * Retrieves sanitized WhatsApp connection status for an organization.
   *
   * In SHARED_PLATFORM mode:
   * - Customers see sanitized shared-channel status without platform identifiers or credentials.
   * - wabaId and phoneNumberId are redacted (null).
   * - canManageCredentials is false.
   * - Displays shared business name and verified phone number.
   *
   * In DEDICATED mode:
   * - Evaluates tenant-specific credentials.
   *
   * Never returns access tokens, ciphertexts, or encryption keys.
   */
  public async getConnectionStatus(organizationId: string): Promise<SafeConnectionStatus> {
    if (this.isSharedPlatformMode()) {
      const platformStatus = await this.getPlatformConnectionStatus();

      if (platformStatus.connected) {
        return {
          connected: true,
          status: platformStatus.status,
          source: "PLATFORM_SHARED",
          mode: "SHARED_PLATFORM",
          canManageCredentials: false,
          isSharedPlatform: true,
          sharedNotice:
            "Outbound campaigns use Grovastra's shared WhatsApp business identity. Individual customer credentials are not required or manageable in shared mode.",
          wabaId: null, // Redacted for customer tenant
          phoneNumberId: null, // Redacted for customer tenant
          displayPhoneNumber: platformStatus.displayPhoneNumber,
          verifiedName: platformStatus.verifiedName || "Grovastra Platform",
          tokenExpiresAt: null,
          verifiedAt: platformStatus.verifiedAt,
          lastSyncedAt: platformStatus.lastSyncedAt,
          lastError: null,
        };
      }

      return {
        connected: false,
        status: platformStatus.status || MetaConnectionStatus.NOT_CONNECTED,
        source: "PLATFORM_SHARED",
        mode: "SHARED_PLATFORM",
        canManageCredentials: false,
        isSharedPlatform: true,
        sharedNotice:
          "Outbound campaigns use Grovastra's shared WhatsApp business identity. Platform account is currently disconnected.",
        wabaId: null,
        phoneNumberId: null,
        displayPhoneNumber: null,
        verifiedName: null,
        tokenExpiresAt: null,
        verifiedAt: null,
        lastSyncedAt: null,
        lastError: null,
      };
    }

    const prisma = getPrismaClient();

    let metaAccount = null;
    try {
      metaAccount = await prisma.metaAccount.findUnique({
        where: { organizationId },
      });
    } catch (err: unknown) {
      logger.warn(
        `[WhatsAppIntegrationService] Database lookup failed for organization ${organizationId}: ${(err as Error)?.message}`
      );
    }

    if (metaAccount) {
      const isExpired = metaAccount.tokenExpiresAt
        ? metaAccount.tokenExpiresAt.getTime() <= Date.now()
        : false;

      let effectiveStatus = metaAccount.status;
      if (metaAccount.status === MetaConnectionStatus.CONNECTED && isExpired) {
        effectiveStatus = MetaConnectionStatus.TOKEN_EXPIRED;
      }

      return {
        connected: effectiveStatus === MetaConnectionStatus.CONNECTED,
        status: effectiveStatus,
        source: "DATABASE",
        mode: "DEDICATED",
        canManageCredentials: true,
        isSharedPlatform: false,
        wabaId: metaAccount.wabaId,
        phoneNumberId: metaAccount.phoneNumberId,
        displayPhoneNumber: metaAccount.displayPhoneNumber,
        verifiedName: metaAccount.verifiedName,
        tokenExpiresAt: metaAccount.tokenExpiresAt?.toISOString() || null,
        verifiedAt: metaAccount.verifiedAt?.toISOString() || null,
        lastSyncedAt: metaAccount.lastSyncedAt?.toISOString() || null,
        lastError: metaAccount.lastError || null,
      };
    }

    // Check backward-compatible environment fallback for existing Groviews
    const fallbackOrgId = process.env.META_ORGANIZATION_ID;
    if (fallbackOrgId && fallbackOrgId === organizationId) {
      try {
        const envConfig = validateMetaConfig();
        return {
          connected: true,
          status: MetaConnectionStatus.CONNECTED,
          source: "ENV_FALLBACK",
          mode: "DEDICATED",
          canManageCredentials: true,
          isSharedPlatform: false,
          wabaId: envConfig.wabaId,
          phoneNumberId: envConfig.phoneNumberId,
          displayPhoneNumber: null,
          verifiedName: "Groviews (Env Fallback)",
          tokenExpiresAt: null,
          verifiedAt: null,
          lastSyncedAt: null,
          lastError: null,
        };
      } catch {
        // Fallback env configuration incomplete
      }
    }

    return {
      connected: false,
      status: MetaConnectionStatus.NOT_CONNECTED,
      source: "NONE",
      mode: "DEDICATED",
      canManageCredentials: true,
      isSharedPlatform: false,
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
      verifiedName: null,
      tokenExpiresAt: null,
      verifiedAt: null,
      lastSyncedAt: null,
      lastError: null,
    };
  }

  /**
   * Connects a tenant's WhatsApp Business Account:
   * 1. Validates organization is active.
   * 2. Checks WABA ID and Phone Number ID ownership across other organizations (409 Conflict).
   * 3. Verifies credentials against Meta Graph API.
   * 4. Stores encrypted token with AES-256-GCM.
   * 5. Invalidates template cache.
   */
  public async connectAccount(
    organizationId: string,
    input: ConnectWhatsAppInput
  ): Promise<SafeConnectionStatus> {
    if (this.isSharedPlatformMode()) {
      throw new AppError(
        "Grovastra is operating in shared WhatsApp platform mode. Customer organizations cannot configure or modify shared platform credentials.",
        403,
        "SHARED_PLATFORM_READ_ONLY"
      );
    }

    const prisma = getPrismaClient();

    // 1. Verify organization exists and is active
    const organization = await prisma.organization.findUnique({
      where: { id: organizationId },
    });
    if (!organization || organization.isArchived || organization.deletedAt) {
      throw new UnauthorizedError("Organization is archived, suspended, or does not exist.");
    }

    // 2. Prevent duplicate WABA ID or Phone Number ID ownership across tenants
    const existingWabaOwner = await prisma.metaAccount.findFirst({
      where: {
        wabaId: input.wabaId,
        organizationId: { not: organizationId },
      },
      select: { id: true },
    });
    if (existingWabaOwner) {
      throw new ConflictError(
        "This WhatsApp Business Account ID is already linked to another organization."
      );
    }

    const existingPhoneOwner = await prisma.metaAccount.findFirst({
      where: {
        phoneNumberId: input.phoneNumberId,
        organizationId: { not: organizationId },
      },
      select: { id: true },
    });
    if (existingPhoneOwner) {
      throw new ConflictError(
        "This Phone Number ID is already linked to another organization."
      );
    }

    // 3. Verify credentials against Meta Graph API
    const verifiedDetails = await this.verifyMetaCredentials(
      input.wabaId,
      input.phoneNumberId,
      input.accessToken
    );

    // 4. Encrypt token using AES-256-GCM
    let encrypted;
    try {
      encrypted = encryptSecret(input.accessToken);
    } catch (encryptErr: unknown) {
      logger.error(
        `[WhatsAppIntegrationService] Failed to encrypt access token for organization ${organizationId}: ${(encryptErr as Error)?.message}`
      );
      throw new AppError(
        "Failed to encrypt WhatsApp credentials. Please verify server APP_ENCRYPTION_KEY configuration.",
        500,
        "ENCRYPTION_CONFIGURATION_ERROR"
      );
    }

    // 5. Atomic Upsert into database
    const now = new Date();
    let metaAccount;
    try {
      metaAccount = await prisma.metaAccount.upsert({
        where: { organizationId },
        create: {
          organizationId,
          wabaId: verifiedDetails.wabaId,
          phoneNumberId: verifiedDetails.phoneNumberId,
          displayPhoneNumber: verifiedDetails.displayPhoneNumber,
          verifiedName: verifiedDetails.verifiedName,
          encryptedAccessToken: encrypted.ciphertext,
          tokenKeyId: encrypted.keyId,
          tokenExpiresAt: verifiedDetails.tokenExpiresAt,
          status: MetaConnectionStatus.CONNECTED,
          verifiedAt: now,
          lastSyncedAt: now,
          lastError: null,
        },
        update: {
          wabaId: verifiedDetails.wabaId,
          phoneNumberId: verifiedDetails.phoneNumberId,
          displayPhoneNumber: verifiedDetails.displayPhoneNumber,
          verifiedName: verifiedDetails.verifiedName,
          encryptedAccessToken: encrypted.ciphertext,
          tokenKeyId: encrypted.keyId,
          tokenExpiresAt: verifiedDetails.tokenExpiresAt,
          status: MetaConnectionStatus.CONNECTED,
          verifiedAt: now,
          lastSyncedAt: now,
          lastError: null,
        },
      });
    } catch (dbErr: any) {
      if (dbErr?.code === "P2002") {
        throw new ConflictError(
          "This WhatsApp Business Account ID or Phone Number ID is already linked to another organization."
        );
      }
      throw dbErr;
    }

    // 6. Invalidate template cache for this tenant
    whatsappTemplateService.invalidateCache(organizationId);


    const maskedWaba = input.wabaId.length > 4 ? `***${input.wabaId.slice(-4)}` : "***";
    logger.info(
      `[WhatsAppIntegrationService] Successfully connected WhatsApp Business Account for organization ${organizationId} (WABA: ${maskedWaba})`
    );

    return {
      connected: true,
      status: metaAccount.status,
      source: "DATABASE",
      wabaId: metaAccount.wabaId,
      phoneNumberId: metaAccount.phoneNumberId,
      displayPhoneNumber: metaAccount.displayPhoneNumber,
      verifiedName: metaAccount.verifiedName,
      tokenExpiresAt: metaAccount.tokenExpiresAt?.toISOString() || null,
      verifiedAt: metaAccount.verifiedAt?.toISOString() || null,
      lastSyncedAt: metaAccount.lastSyncedAt?.toISOString() || null,
      lastError: null,
    };
  }

  /**
   * Refreshes and revalidates an organization's existing WhatsApp connection using its own stored token.
   * Never falls back to another organization's credentials.
   */
  public async refreshConnection(organizationId: string): Promise<SafeConnectionStatus> {
    if (this.isSharedPlatformMode()) {
      throw new AppError(
        "Grovastra is operating in shared WhatsApp platform mode. Credential refresh is managed by the platform operator.",
        403,
        "SHARED_PLATFORM_READ_ONLY"
      );
    }

    const prisma = getPrismaClient();

    const metaAccount = await prisma.metaAccount.findUnique({
      where: { organizationId },
    });

    if (!metaAccount) {
      // Check legacy .env fallback for Groviews
      const fallbackOrgId = process.env.META_ORGANIZATION_ID;
      if (fallbackOrgId && fallbackOrgId === organizationId) {
        return this.getConnectionStatus(organizationId);
      }

      throw new NotFoundError("No WhatsApp connection found for this organization.");
    }

    // Fail closed if the account is already disconnected
    if (metaAccount.status === MetaConnectionStatus.DISCONNECTED) {
      throw new AppError(
        "WhatsApp account is disconnected. Please reconnect your account with new credentials.",
        400,
        "ACCOUNT_DISCONNECTED"
      );
    }

    // Decrypt saved access token
    let decryptedToken: string;
    try {
      decryptedToken = decryptSecret(metaAccount.encryptedAccessToken);
    } catch (decryptErr: unknown) {
      logger.error(
        `[WhatsAppIntegrationService] Decryption failure during refresh for organization ${organizationId}: ${(decryptErr as Error)?.message}`
      );
      throw new AppError(
        "Failed to decrypt stored WhatsApp credentials. Ensure APP_ENCRYPTION_KEY is properly configured.",
        500,
        "ENCRYPTION_CONFIGURATION_ERROR"
      );
    }

    try {
      const verifiedDetails = await this.verifyMetaCredentials(
        metaAccount.wabaId,
        metaAccount.phoneNumberId,
        decryptedToken
      );

      const now = new Date();
      const updatedAccount = await prisma.metaAccount.update({
        where: { organizationId },
        data: {
          displayPhoneNumber: verifiedDetails.displayPhoneNumber || metaAccount.displayPhoneNumber,
          verifiedName: verifiedDetails.verifiedName || metaAccount.verifiedName,
          tokenExpiresAt: verifiedDetails.tokenExpiresAt,
          status: MetaConnectionStatus.CONNECTED,
          verifiedAt: now,
          lastSyncedAt: now,
          lastError: null,
        },
      });

      whatsappTemplateService.invalidateCache(organizationId);

      return {
        connected: true,
        status: updatedAccount.status,
        source: "DATABASE",
        wabaId: updatedAccount.wabaId,
        phoneNumberId: updatedAccount.phoneNumberId,
        displayPhoneNumber: updatedAccount.displayPhoneNumber,
        verifiedName: updatedAccount.verifiedName,
        tokenExpiresAt: updatedAccount.tokenExpiresAt?.toISOString() || null,
        verifiedAt: updatedAccount.verifiedAt?.toISOString() || null,
        lastSyncedAt: updatedAccount.lastSyncedAt?.toISOString() || null,
        lastError: null,
      };
    } catch (verifyErr: unknown) {
      const isAuthError =
        (verifyErr instanceof AppError && verifyErr.code === "META_AUTH_INVALID") ||
        (verifyErr instanceof AppError && verifyErr.statusCode === 401);

      if (isAuthError) {
        // Mark account as TOKEN_EXPIRED or REVOKED in database
        const now = new Date();
        const updated = await prisma.metaAccount.update({
          where: { organizationId },
          data: {
            status: MetaConnectionStatus.TOKEN_EXPIRED,
            lastError: (verifyErr as Error).message || "Access token expired or revoked by Meta",
            lastSyncedAt: now,
          },
        });

        whatsappTemplateService.invalidateCache(organizationId);

        return {
          connected: false,
          status: updated.status,
          source: "DATABASE",
          wabaId: updated.wabaId,
          phoneNumberId: updated.phoneNumberId,
          displayPhoneNumber: updated.displayPhoneNumber,
          verifiedName: updated.verifiedName,
          tokenExpiresAt: updated.tokenExpiresAt?.toISOString() || null,
          verifiedAt: updated.verifiedAt?.toISOString() || null,
          lastSyncedAt: updated.lastSyncedAt?.toISOString() || null,
          lastError: updated.lastError,
        };
      }

      // If it was a network timeout or transient error, log and persist error but do not change connection status
      const now = new Date();
      await prisma.metaAccount.update({
        where: { organizationId },
        data: {
          lastError: (verifyErr as Error).message,
          lastSyncedAt: now,
        },
      }).catch(() => {});

      throw verifyErr;
    }
  }

  /**
   * Disconnects an organization's WhatsApp connection:
   * 1. Marks status DISCONNECTED.
   * 2. Tombstones encrypted credentials so they cannot be reused.
   * 3. Invalidates template cache.
   * 4. Preserves historical messages and webhook audit logs.
   */
  public async disconnectAccount(organizationId: string): Promise<{
    success: boolean;
    message: string;
    status: MetaConnectionStatus;
  }> {
    if (this.isSharedPlatformMode()) {
      throw new AppError(
        "Grovastra is operating in shared WhatsApp platform mode. Customer organizations cannot disconnect the platform WhatsApp account.",
        403,
        "SHARED_PLATFORM_READ_ONLY"
      );
    }

    const prisma = getPrismaClient();

    const metaAccount = await prisma.metaAccount.findUnique({
      where: { organizationId },
    });

    if (!metaAccount) {
      const fallbackOrgId = process.env.META_ORGANIZATION_ID;
      if (fallbackOrgId && fallbackOrgId === organizationId) {
        throw new BadRequestError(
          "The legacy environment fallback WhatsApp connection cannot be disconnected via API."
        );
      }

      throw new NotFoundError("No WhatsApp connection found for this organization.");
    }

    let tombstoneCiphertext = "DISCONNECTED";
    try {
      tombstoneCiphertext = encryptSecret(`DISCONNECTED_TOMBSTONE_${Date.now()}`).ciphertext;
    } catch {
      // Fallback tombstone string if encryption key is unavailable
    }

    const now = new Date();
    await prisma.metaAccount.update({
      where: { organizationId },
      data: {
        status: MetaConnectionStatus.DISCONNECTED,
        encryptedAccessToken: tombstoneCiphertext,
        tokenExpiresAt: null,
        lastError: "Disconnected by user",
        lastSyncedAt: now,
      },
    });

    whatsappTemplateService.invalidateCache(organizationId);

    logger.info(
      `[WhatsAppIntegrationService] Disconnected WhatsApp connection for organization ${organizationId}`
    );

    return {
      success: true,
      message: "WhatsApp connection successfully disconnected.",
      status: MetaConnectionStatus.DISCONNECTED,
    };
  }

  /**
   * Platform Administrator: Retrieves un-redacted platform WhatsApp connection status.
   * Never returns access tokens, ciphertexts, or encryption keys.
   */
  public async getPlatformConnectionStatus(): Promise<SafeConnectionStatus> {
    const prisma = getPrismaClient();
    const platformOrgId = MetaConfigResolver.getPlatformOrganizationId();

    let metaAccount = null;
    if (platformOrgId) {
      try {
        metaAccount = await prisma.metaAccount.findUnique({
          where: { organizationId: platformOrgId },
        });
      } catch (err: unknown) {
        logger.warn(
          `[WhatsAppIntegrationService] Database lookup failed for platform org ${platformOrgId}: ${(err as Error)?.message}`
        );
      }
    }

    if (metaAccount) {
      const isExpired = metaAccount.tokenExpiresAt
        ? metaAccount.tokenExpiresAt.getTime() <= Date.now()
        : false;

      let effectiveStatus = metaAccount.status;
      if (metaAccount.status === MetaConnectionStatus.CONNECTED && isExpired) {
        effectiveStatus = MetaConnectionStatus.TOKEN_EXPIRED;
      }

      return {
        connected: effectiveStatus === MetaConnectionStatus.CONNECTED,
        status: effectiveStatus,
        source: "DATABASE",
        mode: "SHARED_PLATFORM",
        canManageCredentials: true,
        isSharedPlatform: true,
        wabaId: metaAccount.wabaId,
        phoneNumberId: metaAccount.phoneNumberId,
        displayPhoneNumber: metaAccount.displayPhoneNumber,
        verifiedName: metaAccount.verifiedName || "Grovastra Platform",
        tokenExpiresAt: metaAccount.tokenExpiresAt?.toISOString() || null,
        verifiedAt: metaAccount.verifiedAt?.toISOString() || null,
        lastSyncedAt: metaAccount.lastSyncedAt?.toISOString() || null,
        lastError: metaAccount.lastError || null,
      };
    }

    // Check environment configuration fallback
    try {
      const envConfig = validateMetaConfig();
      return {
        connected: true,
        status: MetaConnectionStatus.CONNECTED,
        source: "ENV_FALLBACK",
        mode: "SHARED_PLATFORM",
        canManageCredentials: true,
        isSharedPlatform: true,
        wabaId: envConfig.wabaId,
        phoneNumberId: envConfig.phoneNumberId,
        displayPhoneNumber: null,
        verifiedName: "Grovastra Platform (Env Fallback)",
        tokenExpiresAt: null,
        verifiedAt: null,
        lastSyncedAt: null,
        lastError: null,
      };
    } catch {
      // Env configuration incomplete
    }

    return {
      connected: false,
      status: MetaConnectionStatus.NOT_CONNECTED,
      source: "NONE",
      mode: "SHARED_PLATFORM",
      canManageCredentials: true,
      isSharedPlatform: true,
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
      verifiedName: null,
      tokenExpiresAt: null,
      verifiedAt: null,
      lastSyncedAt: null,
      lastError: null,
    };
  }

  /**
   * Platform Administrator: Connects or updates the Grovastra shared platform WhatsApp account.
   */
  public async connectPlatformAccount(
    input: ConnectWhatsAppInput
  ): Promise<SafeConnectionStatus> {
    const prisma = getPrismaClient();
    const platformOrgId = MetaConfigResolver.getPlatformOrganizationId();

    if (!platformOrgId) {
      throw new AppError(
        "Platform organization anchor is unconfigured on the server.",
        500,
        "PLATFORM_ORG_UNCONFIGURED"
      );
    }

    // 1. Verify platform organization exists and is active
    const platformOrg = await prisma.organization.findUnique({
      where: { id: platformOrgId },
    });
    if (!platformOrg || platformOrg.isArchived || platformOrg.deletedAt) {
      throw new AppError(
        "Platform organization anchor does not exist, is archived, or is suspended.",
        500,
        "PLATFORM_ORG_INVALID"
      );
    }

    // 2. Prevent duplicate WABA ID or Phone Number ID ownership across other organizations
    const existingWabaOwner = await prisma.metaAccount.findFirst({
      where: {
        wabaId: input.wabaId,
        organizationId: { not: platformOrgId },
      },
      select: { id: true },
    });
    if (existingWabaOwner) {
      throw new ConflictError(
        "This WhatsApp Business Account ID is already linked to another organization."
      );
    }

    const existingPhoneOwner = await prisma.metaAccount.findFirst({
      where: {
        phoneNumberId: input.phoneNumberId,
        organizationId: { not: platformOrgId },
      },
      select: { id: true },
    });
    if (existingPhoneOwner) {
      throw new ConflictError(
        "This Phone Number ID is already linked to another organization."
      );
    }

    // 3. Verify credentials against Meta Graph API
    const verifiedDetails = await this.verifyMetaCredentials(
      input.wabaId,
      input.phoneNumberId,
      input.accessToken
    );

    // 4. Encrypt token using AES-256-GCM
    let encrypted;
    try {
      encrypted = encryptSecret(input.accessToken);
    } catch (encryptErr: unknown) {
      logger.error(
        `[WhatsAppIntegrationService] Failed to encrypt access token for platform organization: ${(encryptErr as Error)?.message}`
      );
      throw new AppError(
        "Failed to encrypt platform WhatsApp credentials. Please verify server APP_ENCRYPTION_KEY configuration.",
        500,
        "ENCRYPTION_CONFIGURATION_ERROR"
      );
    }

    // 5. Atomic Upsert into database
    const now = new Date();
    const metaAccount = await prisma.metaAccount.upsert({
      where: { organizationId: platformOrgId },
      create: {
        organizationId: platformOrgId,
        wabaId: verifiedDetails.wabaId,
        phoneNumberId: verifiedDetails.phoneNumberId,
        displayPhoneNumber: verifiedDetails.displayPhoneNumber,
        verifiedName: verifiedDetails.verifiedName,
        encryptedAccessToken: encrypted.ciphertext,
        tokenKeyId: encrypted.keyId,
        tokenExpiresAt: verifiedDetails.tokenExpiresAt,
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: now,
        lastSyncedAt: now,
        lastError: null,
      },
      update: {
        wabaId: verifiedDetails.wabaId,
        phoneNumberId: verifiedDetails.phoneNumberId,
        displayPhoneNumber: verifiedDetails.displayPhoneNumber,
        verifiedName: verifiedDetails.verifiedName,
        encryptedAccessToken: encrypted.ciphertext,
        tokenKeyId: encrypted.keyId,
        tokenExpiresAt: verifiedDetails.tokenExpiresAt,
        status: MetaConnectionStatus.CONNECTED,
        verifiedAt: now,
        lastSyncedAt: now,
        lastError: null,
      },
    });

    // 6. Invalidate template cache across organizations
    whatsappTemplateService.clearCache();

    const maskedWaba = input.wabaId.length > 4 ? `***${input.wabaId.slice(-4)}` : "***";
    logger.info(
      `[WhatsAppIntegrationService] Successfully connected platform WhatsApp Business Account (WABA: ${maskedWaba})`
    );

    return {
      connected: true,
      status: metaAccount.status,
      source: "DATABASE",
      mode: "SHARED_PLATFORM",
      canManageCredentials: true,
      isSharedPlatform: true,
      wabaId: metaAccount.wabaId,
      phoneNumberId: metaAccount.phoneNumberId,
      displayPhoneNumber: metaAccount.displayPhoneNumber,
      verifiedName: metaAccount.verifiedName,
      tokenExpiresAt: metaAccount.tokenExpiresAt?.toISOString() || null,
      verifiedAt: metaAccount.verifiedAt?.toISOString() || null,
      lastSyncedAt: metaAccount.lastSyncedAt?.toISOString() || null,
      lastError: null,
    };
  }

  /**
   * Platform Administrator: Re-validates the platform WhatsApp account with Meta Graph API.
   */
  public async refreshPlatformConnection(): Promise<SafeConnectionStatus> {
    const prisma = getPrismaClient();
    const platformOrgId = MetaConfigResolver.getPlatformOrganizationId();

    if (!platformOrgId) {
      throw new AppError(
        "Platform organization anchor is unconfigured on the server.",
        500,
        "PLATFORM_ORG_UNCONFIGURED"
      );
    }

    const metaAccount = await prisma.metaAccount.findUnique({
      where: { organizationId: platformOrgId },
    });

    if (!metaAccount) {
      // If running on env fallback, return status
      try {
        validateMetaConfig();
        return this.getPlatformConnectionStatus();
      } catch {
        throw new NotFoundError("No platform WhatsApp connection found to refresh.");
      }
    }

    if (metaAccount.status === MetaConnectionStatus.DISCONNECTED) {
      throw new AppError(
        "Platform WhatsApp account is disconnected. Please reconnect with new credentials.",
        400,
        "ACCOUNT_DISCONNECTED"
      );
    }

    let decryptedToken: string;
    try {
      decryptedToken = decryptSecret(metaAccount.encryptedAccessToken);
    } catch (decryptErr: unknown) {
      logger.error(
        `[WhatsAppIntegrationService] Decryption failure during platform refresh: ${(decryptErr as Error)?.message}`
      );
      throw new AppError(
        "Failed to decrypt stored platform WhatsApp credentials. Ensure APP_ENCRYPTION_KEY is properly configured.",
        500,
        "ENCRYPTION_CONFIGURATION_ERROR"
      );
    }

    try {
      const verifiedDetails = await this.verifyMetaCredentials(
        metaAccount.wabaId,
        metaAccount.phoneNumberId,
        decryptedToken
      );

      const now = new Date();
      const updatedAccount = await prisma.metaAccount.update({
        where: { organizationId: platformOrgId },
        data: {
          displayPhoneNumber: verifiedDetails.displayPhoneNumber || metaAccount.displayPhoneNumber,
          verifiedName: verifiedDetails.verifiedName || metaAccount.verifiedName,
          tokenExpiresAt: verifiedDetails.tokenExpiresAt,
          status: MetaConnectionStatus.CONNECTED,
          verifiedAt: now,
          lastSyncedAt: now,
          lastError: null,
        },
      });

      whatsappTemplateService.clearCache();

      return {
        connected: true,
        status: updatedAccount.status,
        source: "DATABASE",
        mode: "SHARED_PLATFORM",
        canManageCredentials: true,
        isSharedPlatform: true,
        wabaId: updatedAccount.wabaId,
        phoneNumberId: updatedAccount.phoneNumberId,
        displayPhoneNumber: updatedAccount.displayPhoneNumber,
        verifiedName: updatedAccount.verifiedName,
        tokenExpiresAt: updatedAccount.tokenExpiresAt?.toISOString() || null,
        verifiedAt: updatedAccount.verifiedAt?.toISOString() || null,
        lastSyncedAt: updatedAccount.lastSyncedAt?.toISOString() || null,
        lastError: null,
      };
    } catch (verifyErr: unknown) {
      const isAuthError =
        (verifyErr instanceof AppError && verifyErr.code === "META_AUTH_INVALID") ||
        (verifyErr instanceof AppError && verifyErr.statusCode === 401);

      if (isAuthError) {
        const now = new Date();
        const updated = await prisma.metaAccount.update({
          where: { organizationId: platformOrgId },
          data: {
            status: MetaConnectionStatus.TOKEN_EXPIRED,
            lastError: (verifyErr as Error).message || "Platform token expired or revoked by Meta",
            lastSyncedAt: now,
          },
        });

        whatsappTemplateService.clearCache();

        return {
          connected: false,
          status: updated.status,
          source: "DATABASE",
          mode: "SHARED_PLATFORM",
          canManageCredentials: true,
          isSharedPlatform: true,
          wabaId: updated.wabaId,
          phoneNumberId: updated.phoneNumberId,
          displayPhoneNumber: updated.displayPhoneNumber,
          verifiedName: updated.verifiedName,
          tokenExpiresAt: updated.tokenExpiresAt?.toISOString() || null,
          verifiedAt: updated.verifiedAt?.toISOString() || null,
          lastSyncedAt: updated.lastSyncedAt?.toISOString() || null,
          lastError: updated.lastError,
        };
      }

      throw verifyErr;
    }
  }

  /**
   * Platform Administrator: Disconnects the platform WhatsApp account and tombstones credentials.
   */
  public async disconnectPlatformAccount(): Promise<{
    success: boolean;
    message: string;
    status: MetaConnectionStatus;
  }> {
    const prisma = getPrismaClient();
    const platformOrgId = MetaConfigResolver.getPlatformOrganizationId();

    if (!platformOrgId) {
      throw new AppError(
        "Platform organization anchor is unconfigured on the server.",
        500,
        "PLATFORM_ORG_UNCONFIGURED"
      );
    }

    const metaAccount = await prisma.metaAccount.findUnique({
      where: { organizationId: platformOrgId },
    });

    if (!metaAccount) {
      try {
        validateMetaConfig();
        throw new BadRequestError(
          "The legacy environment fallback WhatsApp connection cannot be disconnected via API."
        );
      } catch (err: unknown) {
        if (err instanceof BadRequestError) throw err;
        throw new NotFoundError("No platform WhatsApp connection found to disconnect.");
      }
    }

    let tombstoneCiphertext = "DISCONNECTED";
    try {
      tombstoneCiphertext = encryptSecret(`PLATFORM_DISCONNECTED_TOMBSTONE_${Date.now()}`).ciphertext;
    } catch {
      // Fallback tombstone string if encryption key is unavailable
    }

    const now = new Date();
    await prisma.metaAccount.update({
      where: { organizationId: platformOrgId },
      data: {
        status: MetaConnectionStatus.DISCONNECTED,
        encryptedAccessToken: tombstoneCiphertext,
        tokenExpiresAt: null,
        lastError: "Disconnected by platform administrator",
        lastSyncedAt: now,
      },
    });

    whatsappTemplateService.clearCache();

    logger.info(
      `[WhatsAppIntegrationService] Disconnected platform WhatsApp connection for organization ${platformOrgId}`
    );

    return {
      success: true,
      message: "Platform WhatsApp connection successfully disconnected.",
      status: MetaConnectionStatus.DISCONNECTED,
    };
  }
}

export const whatsappIntegrationService = new WhatsAppIntegrationService();
