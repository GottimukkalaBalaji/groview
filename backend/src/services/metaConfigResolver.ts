import { getPrismaClient } from "../config/prisma.js";
import { validateMetaConfig } from "../config/env.js";
import { decryptSecret } from "../utils/encryption.js";
import { AppError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { MetaConnectionStatus } from "@prisma/client";

export type MetaAccountSource =
  | "DATABASE"
  | "ENV_FALLBACK"
  | "PLATFORM_DATABASE"
  | "PLATFORM_ENV_FALLBACK";

export type WhatsAppAccountMode = "SHARED_PLATFORM" | "DEDICATED";

export interface ResolvedMetaConfig {
  source: MetaAccountSource;
  mode?: WhatsAppAccountMode;
  isPlatform?: boolean;
  organizationId: string;
  platformOrganizationId?: string;
  wabaId: string;
  phoneNumberId: string;
  accessToken: string; // In-memory decrypted plaintext token
  graphApiVersion: string;
  status: MetaConnectionStatus;
  verifiedName?: string | null;
  displayPhoneNumber?: string | null;
}

export interface ResolveMetaConfigOptions {
  mode?: WhatsAppAccountMode;
}

export class MetaConfigResolver {
  /**
   * Resolves the current WhatsApp operating mode.
   * Default: "SHARED_PLATFORM".
   * Can be set to "DEDICATED" to enable dedicated customer accounts.
   */
  public static getAccountMode(): WhatsAppAccountMode {
    const configuredMode = process.env.WHATSAPP_ACCOUNT_MODE?.toUpperCase().trim();
    if (configuredMode === "DEDICATED") {
      return "DEDICATED";
    }
    return "SHARED_PLATFORM";
  }

  /**
   * Resolves the configured platform organization anchor ID.
   * Checks PLATFORM_ORGANIZATION_ID first, falling back to META_ORGANIZATION_ID.
   */
  public static getPlatformOrganizationId(): string | null {
    const platformOrgId =
      process.env.PLATFORM_ORGANIZATION_ID || process.env.META_ORGANIZATION_ID;
    if (platformOrgId && typeof platformOrgId === "string" && platformOrgId.trim().length > 0) {
      return platformOrgId.trim();
    }
    return null;
  }

  /**
   * Resolves the Grovastra-managed shared platform WhatsApp Business Account credentials.
   *
   * Resolution hierarchy:
   * 1. Database: checks meta_accounts table for the designated platform organization anchor.
   *    - Must be CONNECTED, unexpired, and successfully decrypted.
   *    - FAIL-CLOSED: if a platform database account exists but is DISCONNECTED, EXPIRED,
   *      or fails decryption, it throws an error immediately and NEVER falls back to .env.
   * 2. Environment Fallback: if no database account exists, checks validated .env credentials.
   * 3. Fail-Closed Error: throws AppError 503 (PLATFORM_ACCOUNT_UNAVAILABLE) if neither is configured.
   */
  public static async getPlatformMetaConfig(): Promise<ResolvedMetaConfig> {
    const prisma = getPrismaClient();
    const platformOrgId = this.getPlatformOrganizationId();

    let metaAccount = null;

    if (platformOrgId) {
      try {
        metaAccount = await prisma.metaAccount.findUnique({
          where: { organizationId: platformOrgId },
        });
      } catch (dbErr: unknown) {
        if (dbErr instanceof AppError) {
          throw dbErr;
        }
        logger.warn(
          `[MetaConfigResolver] Database lookup for platform organization ${platformOrgId} unfulfilled: ${(dbErr as Error)?.message}`
        );
      }
    }

    // 1. Strict database evaluation for platform account
    if (metaAccount) {
      if (metaAccount.status !== MetaConnectionStatus.CONNECTED) {
        logger.warn(
          `[MetaConfigResolver] Platform WhatsApp Business Account is in ${metaAccount.status} status. Refusing send.`
        );
        throw new AppError(
          `Platform WhatsApp Business Account is in ${metaAccount.status} status and cannot be used for sending.`,
          400,
          "META_ACCOUNT_NOT_CONNECTED"
        );
      }

      if (metaAccount.tokenExpiresAt && metaAccount.tokenExpiresAt.getTime() <= Date.now()) {
        logger.warn(
          `[MetaConfigResolver] Platform WhatsApp Business Account access token has expired at ${metaAccount.tokenExpiresAt.toISOString()}`
        );
        throw new AppError(
          "Platform WhatsApp Business Account access token has expired. Please refresh credentials in Platform Admin Settings.",
          401,
          "META_TOKEN_EXPIRED"
        );
      }

      // FAIL-CLOSED: Decryption requires a valid APP_ENCRYPTION_KEY.
      // Must throw an explicit configuration error and NEVER silently fall back to .env
      try {
        const decryptedToken = decryptSecret(metaAccount.encryptedAccessToken);

        return {
          source: "DATABASE",
          mode: "SHARED_PLATFORM",
          isPlatform: true,
          organizationId: metaAccount.organizationId,
          platformOrganizationId: metaAccount.organizationId,
          wabaId: metaAccount.wabaId,
          phoneNumberId: metaAccount.phoneNumberId,
          accessToken: decryptedToken,
          graphApiVersion: process.env.META_GRAPH_API_VERSION || "v22.0",
          status: metaAccount.status,
          verifiedName: metaAccount.verifiedName || "Grovastra Platform",
          displayPhoneNumber: metaAccount.displayPhoneNumber,
        };
      } catch (decryptErr: unknown) {
        logger.error(
          `[MetaConfigResolver] Decryption failure for platform organization ${platformOrgId}: ${(decryptErr as Error)?.message}`
        );
        throw new AppError(
          "Failed to decrypt stored platform WhatsApp credentials. Ensure APP_ENCRYPTION_KEY is properly configured.",
          500,
          "ENCRYPTION_CONFIGURATION_ERROR"
        );
      }
    }

    // 2. Fallback to server environment variables if no database account exists
    try {
      const envConfig = validateMetaConfig();
      logger.info(
        `[MetaConfigResolver] Utilizing verified platform .env Meta configuration (WABA: ***${envConfig.wabaId.slice(-4)})`
      );

      return {
        source: "ENV_FALLBACK",
        mode: "SHARED_PLATFORM",
        isPlatform: true,
        organizationId: platformOrgId || "platform",
        platformOrganizationId: platformOrgId || undefined,
        wabaId: envConfig.wabaId,
        phoneNumberId: envConfig.phoneNumberId,
        accessToken: envConfig.accessToken,
        graphApiVersion: envConfig.graphApiVersion,
        status: MetaConnectionStatus.CONNECTED,
        verifiedName: "Grovastra Platform (Env Fallback)",
      };
    } catch (envErr: unknown) {
      logger.error(
        `[MetaConfigResolver] Platform Meta configuration unavailable: ${(envErr as Error)?.message}`
      );
      throw new AppError(
        "Platform WhatsApp Cloud API credentials are not configured. Please contact platform administration.",
        503,
        "PLATFORM_ACCOUNT_UNAVAILABLE"
      );
    }
  }

  /**
   * Resolves a dedicated customer-owned MetaAccount.
   * Strictly evaluates the tenant's own database account and fails closed if absent or invalid.
   * Kept available for future dedicated-account mode without silent fallbacks.
   */
  public static async getDedicatedMetaConfigForOrganization(
    organizationId: string
  ): Promise<ResolvedMetaConfig> {
    if (!organizationId || typeof organizationId !== "string") {
      throw new AppError(
        "Invalid organizationId provided for Meta configuration resolution",
        400,
        "INVALID_ORGANIZATION_ID"
      );
    }

    const prisma = getPrismaClient();

    let metaAccount = null;
    try {
      metaAccount = await prisma.metaAccount.findUnique({
        where: { organizationId },
      });
    } catch (dbErr: unknown) {
      if (dbErr instanceof AppError) throw dbErr;
      logger.warn(
        `[MetaConfigResolver] Database lookup for organization ${organizationId} unfulfilled: ${(dbErr as Error)?.message}`
      );
    }

    if (!metaAccount) {
      throw new AppError(
        "WhatsApp Cloud API is not connected for this organization. Please connect a WhatsApp Business Account in Settings.",
        404,
        "META_CONFIG_UNAVAILABLE"
      );
    }

    if (metaAccount.status !== MetaConnectionStatus.CONNECTED) {
      throw new AppError(
        `WhatsApp Business Account is in ${metaAccount.status} status and cannot be used for sending.`,
        400,
        "META_ACCOUNT_NOT_CONNECTED"
      );
    }

    if (metaAccount.tokenExpiresAt && metaAccount.tokenExpiresAt.getTime() <= Date.now()) {
      throw new AppError(
        "WhatsApp Business Account access token has expired. Please refresh your token in Settings.",
        401,
        "META_TOKEN_EXPIRED"
      );
    }

    try {
      const decryptedToken = decryptSecret(metaAccount.encryptedAccessToken);
      return {
        source: "DATABASE",
        mode: "DEDICATED",
        isPlatform: false,
        organizationId: metaAccount.organizationId,
        wabaId: metaAccount.wabaId,
        phoneNumberId: metaAccount.phoneNumberId,
        accessToken: decryptedToken,
        graphApiVersion: process.env.META_GRAPH_API_VERSION || "v22.0",
        status: metaAccount.status,
        verifiedName: metaAccount.verifiedName,
        displayPhoneNumber: metaAccount.displayPhoneNumber,
      };
    } catch (decryptErr: unknown) {
      logger.error(
        `[MetaConfigResolver] Decryption failure for organization ${organizationId}: ${(decryptErr as Error)?.message}`
      );
      throw new AppError(
        "Failed to decrypt stored WhatsApp credentials. Ensure APP_ENCRYPTION_KEY is properly configured.",
        500,
        "ENCRYPTION_CONFIGURATION_ERROR"
      );
    }
  }

  /**
   * Resolves effective outbound WhatsApp configuration for dispatch and message sending.
   *
   * In SHARED_PLATFORM mode:
   * - Outbound messages use the configured platform WhatsApp account.
   * - Preserves the caller's organizationId on the returned configuration for logging and tenant isolation.
   * - Customer-owned MetaAccount records CANNOT override the platform account in shared mode.
   * - Fails closed if the platform account is absent, disconnected, expired, or invalid.
   *
   * In DEDICATED mode:
   * - Resolves the tenant's own dedicated MetaAccount.
   */
  public static async resolveOutboundConfig(
    organizationId: string
  ): Promise<ResolvedMetaConfig> {
    if (!organizationId || typeof organizationId !== "string") {
      throw new AppError(
        "Invalid organizationId provided for outbound configuration resolution",
        400,
        "INVALID_ORGANIZATION_ID"
      );
    }

    const mode = this.getAccountMode();

    if (mode === "SHARED_PLATFORM") {
      const platformConfig = await this.getPlatformMetaConfig();
      return {
        ...platformConfig,
        organizationId, // Preserve caller organization context
        source:
          platformConfig.source === "DATABASE"
            ? "PLATFORM_DATABASE"
            : "PLATFORM_ENV_FALLBACK",
        mode: "SHARED_PLATFORM",
        isPlatform: true,
      };
    }

    return this.getMetaConfigForOrganization(organizationId);
  }

  /**
   * Resolves Meta WhatsApp Cloud API credentials for a specific organization.
   *
   * When options.mode === "SHARED_PLATFORM" is specified, delegates to resolveOutboundConfig.
   * Otherwise (default), evaluates tenant-specific dedicated credentials with legacy .env fallback:
   * 1. Database: meta_accounts table for organizationId with status CONNECTED.
   * 2. Fallback: Environment variables if organizationId matches process.env.META_ORGANIZATION_ID.
   * 3. Error: Throws AppError 404 (META_CONFIG_UNAVAILABLE).
   */
  public static async getMetaConfigForOrganization(
    organizationId: string,
    options?: ResolveMetaConfigOptions
  ): Promise<ResolvedMetaConfig> {
    if (!organizationId || typeof organizationId !== "string") {
      throw new AppError(
        "Invalid organizationId provided for Meta configuration resolution",
        400,
        "INVALID_ORGANIZATION_ID"
      );
    }

    if (options?.mode === "SHARED_PLATFORM") {
      return this.resolveOutboundConfig(organizationId);
    }

    const prisma = getPrismaClient();

    // 1. Check database for tenant-specific MetaAccount
    let metaAccount = null;
    try {
      metaAccount = await prisma.metaAccount.findUnique({
        where: { organizationId },
      });
    } catch (dbErr: unknown) {
      if (dbErr instanceof AppError) {
        throw dbErr;
      }
      logger.warn(
        `[MetaConfigResolver] Database lookup for organization ${organizationId} unfulfilled: ${(dbErr as Error)?.message}`
      );
    }

    // When an organization has a database MetaAccount record, it must be evaluated strictly
    if (metaAccount) {
      if (metaAccount.status !== MetaConnectionStatus.CONNECTED) {
        throw new AppError(
          `WhatsApp Business Account is in ${metaAccount.status} status and cannot be used for sending.`,
          400,
          "META_ACCOUNT_NOT_CONNECTED"
        );
      }

      if (metaAccount.tokenExpiresAt && metaAccount.tokenExpiresAt.getTime() <= Date.now()) {
        throw new AppError(
          "WhatsApp Business Account access token has expired. Please refresh your token in Settings.",
          401,
          "META_TOKEN_EXPIRED"
        );
      }

      // FAIL-CLOSED: Decryption requires a valid APP_ENCRYPTION_KEY.
      // Must throw an explicit configuration error and NEVER silently fall back to .env
      try {
        const decryptedToken = decryptSecret(metaAccount.encryptedAccessToken);

        return {
          source: "DATABASE",
          mode: "DEDICATED",
          isPlatform: false,
          organizationId: metaAccount.organizationId,
          wabaId: metaAccount.wabaId,
          phoneNumberId: metaAccount.phoneNumberId,
          accessToken: decryptedToken,
          graphApiVersion: process.env.META_GRAPH_API_VERSION || "v22.0",
          status: metaAccount.status,
          verifiedName: metaAccount.verifiedName,
          displayPhoneNumber: metaAccount.displayPhoneNumber,
        };
      } catch (decryptErr: unknown) {
        logger.error(
          `[MetaConfigResolver] Decryption failure for organization ${organizationId}: ${(decryptErr as Error)?.message}`
        );
        throw new AppError(
          "Failed to decrypt stored WhatsApp credentials. Ensure APP_ENCRYPTION_KEY is properly configured.",
          500,
          "ENCRYPTION_CONFIGURATION_ERROR"
        );
      }
    }

    // 2. Backward-compatible environment fallback for existing Groviews setup
    const fallbackOrgId = process.env.META_ORGANIZATION_ID;
    if (fallbackOrgId && fallbackOrgId === organizationId) {
      try {
        const envConfig = validateMetaConfig();
        logger.info(
          `[MetaConfigResolver] Utilizing backward-compatible .env Meta configuration for organization ${organizationId}`
        );

        return {
          source: "ENV_FALLBACK",
          mode: "DEDICATED",
          isPlatform: false,
          organizationId,
          wabaId: envConfig.wabaId,
          phoneNumberId: envConfig.phoneNumberId,
          accessToken: envConfig.accessToken,
          graphApiVersion: envConfig.graphApiVersion,
          status: MetaConnectionStatus.CONNECTED,
          verifiedName: "Groviews (Env Fallback)",
        };
      } catch (envErr: unknown) {
        logger.error(
          `[MetaConfigResolver] Fallback .env Meta configuration incomplete: ${(envErr as Error)?.message}`
        );
      }
    }

    throw new AppError(
      "WhatsApp Cloud API is not connected for this organization. Please connect a WhatsApp Business Account in Settings.",
      404,
      "META_CONFIG_UNAVAILABLE"
    );
  }

  /**
   * Resolves which organization owns a given WABA ID.
   * Checks database first, then backward-compatible environment variable.
   */
  public static async getOrganizationForWaba(
    wabaId: string
  ): Promise<{ organizationId: string; source: "DATABASE" | "ENV_FALLBACK" } | null> {
    if (!wabaId || typeof wabaId !== "string") {
      return null;
    }

    const prisma = getPrismaClient();

    let metaAccount = null;
    try {
      metaAccount = await prisma.metaAccount.findUnique({
        where: { wabaId },
        select: { organizationId: true, status: true },
      });
    } catch (err: unknown) {
      logger.warn(
        `[MetaConfigResolver] DB lookup for WABA ${wabaId} unfulfilled: ${(err as Error)?.message}`
      );
    }

    if (metaAccount) {
      if (metaAccount.status === MetaConnectionStatus.CONNECTED) {
        return {
          organizationId: metaAccount.organizationId,
          source: "DATABASE",
        };
      }
      // If the WABA is claimed in the database but not active, do not fall back to .env
      return null;
    }

    // Fallback: Check static env ONLY if no DB account claimed this WABA
    const configuredWabaId = process.env.META_WABA_ID;
    const platformOrgId = this.getPlatformOrganizationId();
    if (configuredWabaId && platformOrgId && wabaId === configuredWabaId) {
      return {
        organizationId: platformOrgId,
        source: "ENV_FALLBACK",
      };
    }

    return null;
  }
}
