/**
 * Grovastra Phase 6D: WhatsApp Integration TypeScript Definitions
 */

export type MetaConnectionStatus =
  | "NOT_CONNECTED"
  | "PENDING_VERIFICATION"
  | "CONNECTED"
  | "TOKEN_EXPIRED"
  | "DISCONNECTED"
  | "REVOKED";

export type MetaConnectionSource = "DATABASE" | "ENV_FALLBACK" | "PLATFORM_SHARED" | "NONE";

export interface SafeConnectionStatus {
  connected: boolean;
  status: MetaConnectionStatus;
  source: MetaConnectionSource;
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

export interface ConnectWhatsAppPayload {
  wabaId: string;
  phoneNumberId: string;
  accessToken: string;
}

export interface DisconnectWhatsAppResponse {
  success: boolean;
  message: string;
  status: MetaConnectionStatus;
}
