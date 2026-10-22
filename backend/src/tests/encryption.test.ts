import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import {
  encryptSecret,
  decryptSecret,
  validateEncryptionKey,
  generateEncryptionKey,
} from "../utils/encryption.js";
import { MetaConfigResolver } from "../services/metaConfigResolver.js";
import { getPrismaClient } from "../config/prisma.js";
import { MetaConnectionStatus } from "@prisma/client";
import { AppError } from "../utils/errors.js";

describe("Phase 6A — AES-256-GCM Encryption & Key Validation", () => {
  const TEST_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const ALTERNATE_KEY_HEX = "fedcba9876543210fedcba9876543210fedcba9876543210fedcba9876543210";
  const TEST_KEY_RAW = "12345678901234567890123456789012"; // exactly 32 bytes

  let originalEnvKey: string | undefined;

  beforeEach(() => {
    originalEnvKey = process.env.APP_ENCRYPTION_KEY;
    process.env.APP_ENCRYPTION_KEY = TEST_KEY_HEX;
  });

  afterEach(() => {
    if (originalEnvKey !== undefined) {
      process.env.APP_ENCRYPTION_KEY = originalEnvKey;
    } else {
      delete process.env.APP_ENCRYPTION_KEY;
    }
  });

  describe("Key Validation & Generation", () => {
    it("validates a 64-character hexadecimal key correctly", () => {
      const buffer = validateEncryptionKey(TEST_KEY_HEX);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(32);
      expect(buffer.toString("hex")).toBe(TEST_KEY_HEX);
    });

    it("validates a 32-byte UTF-8 string key correctly", () => {
      const buffer = validateEncryptionKey(TEST_KEY_RAW);
      expect(buffer).toBeInstanceOf(Buffer);
      expect(buffer.length).toBe(32);
    });

    it("throws an error when key is missing from environment and parameter", () => {
      delete process.env.APP_ENCRYPTION_KEY;
      expect(() => validateEncryptionKey()).toThrow(/APP_ENCRYPTION_KEY is required/);
    });

    it("throws an error when key has invalid length or format", () => {
      expect(() => validateEncryptionKey("too-short")).toThrow(/Invalid APP_ENCRYPTION_KEY length/);
      expect(() => validateEncryptionKey("0123456789abcdef")).toThrow(/Invalid APP_ENCRYPTION_KEY length/);
    });

    it("generates a 64-character hexadecimal key that passes validation", () => {
      const newKey = generateEncryptionKey();
      expect(newKey).toHaveLength(64);
      expect(/^[0-9a-f]{64}$/.test(newKey)).toBe(true);
      expect(() => validateEncryptionKey(newKey)).not.toThrow();
    });
  });

  describe("Encryption & Decryption Roundtrip", () => {
    it("encrypts and decrypts sensitive Meta access tokens losslessly", () => {
      const plaintextToken = "EAAGm0PX4ZCpsBAK1234567890abcdefghijklmnopqrstuvwxyz_SECRET_TOKEN";
      const payload = encryptSecret(plaintextToken);

      expect(payload.ciphertext).toBeDefined();
      expect(payload.keyId).toBe("v1");
      expect(payload.ciphertext).not.toContain(plaintextToken);

      // Decrypt
      const decrypted = decryptSecret(payload.ciphertext);
      expect(decrypted).toBe(plaintextToken);
    });

    it("produces distinct ciphertexts for identical plaintexts due to unique IVs", () => {
      const token = "MY_STATIC_SECRET_TOKEN_123";
      const enc1 = encryptSecret(token);
      const enc2 = encryptSecret(token);

      expect(enc1.ciphertext).not.toBe(enc2.ciphertext);
      expect(decryptSecret(enc1.ciphertext)).toBe(token);
      expect(decryptSecret(enc2.ciphertext)).toBe(token);
    });

    it("supports custom key and custom keyId", () => {
      const secret = "token_with_custom_key";
      const payload = encryptSecret(secret, {
        key: ALTERNATE_KEY_HEX,
        keyId: "v2_rotation",
      });

      expect(payload.keyId).toBe("v2_rotation");
      const decrypted = decryptSecret(payload.ciphertext, { key: ALTERNATE_KEY_HEX });
      expect(decrypted).toBe(secret);
    });

    it("rejects encryption of empty strings or non-string values", () => {
      expect(() => encryptSecret("")).toThrow(/Cannot encrypt empty/);
      // @ts-expect-error Testing invalid runtime input
      expect(() => encryptSecret(null)).toThrow(/Cannot encrypt empty/);
    });
  });

  describe("Authentication Tag & Tampering Detection", () => {
    it("fails decryption when ciphertext payload is tampered", () => {
      const secret = "tamper_test_token";
      const { ciphertext } = encryptSecret(secret);
      const parts = ciphertext.split(":");

      // Flip characters in the encrypted payload segment
      const tamperedCipher = parts[2].slice(0, -2) + (parts[2].endsWith("a") ? "b" : "a");
      const tamperedPayload = `${parts[0]}:${parts[1]}:${tamperedCipher}`;

      expect(() => decryptSecret(tamperedPayload)).toThrow(
        /authentication tag mismatch or invalid encryption key/
      );
    });

    it("fails decryption when authentication tag is tampered", () => {
      const secret = "tamper_tag_token";
      const { ciphertext } = encryptSecret(secret);
      const parts = ciphertext.split(":");

      const tamperedTag = "00000000000000000000000000000000";
      const tamperedPayload = `${parts[0]}:${tamperedTag}:${parts[2]}`;

      expect(() => decryptSecret(tamperedPayload)).toThrow(
        /authentication tag mismatch or invalid encryption key/
      );
    });

    it("fails decryption when IV is tampered", () => {
      const secret = "tamper_iv_token";
      const { ciphertext } = encryptSecret(secret);
      const parts = ciphertext.split(":");

      const tamperedIv = "000000000000000000000000";
      const tamperedPayload = `${tamperedIv}:${parts[1]}:${parts[2]}`;

      expect(() => decryptSecret(tamperedPayload)).toThrow(
        /authentication tag mismatch or invalid encryption key/
      );
    });

    it("fails decryption when decrypted with a different key", () => {
      const secret = "wrong_key_token";
      const { ciphertext } = encryptSecret(secret, { key: TEST_KEY_HEX });

      expect(() => decryptSecret(ciphertext, { key: ALTERNATE_KEY_HEX })).toThrow(
        /authentication tag mismatch or invalid encryption key/
      );
    });

    it("rejects invalid ciphertext formatting", () => {
      expect(() => decryptSecret("not-a-valid-ciphertext")).toThrow(/Invalid ciphertext format/);
      expect(() => decryptSecret("a:b")).toThrow(/Invalid ciphertext structure/);
      expect(() => decryptSecret("::")).toThrow(/Corrupted ciphertext/);
    });
  });
});

describe("Phase 6A — MetaConfigResolver Foundation", () => {
  const TEST_KEY_HEX = "0123456789abcdef0123456789abcdef0123456789abcdef0123456789abcdef";
  const TEST_ORG_ID = "cmv7xnkn20000t818segbx7xq";

  beforeEach(() => {
    process.env.APP_ENCRYPTION_KEY = TEST_KEY_HEX;
  });

  it("resolves configuration from database when metaAccount is CONNECTED", async () => {
    const prisma = getPrismaClient();
    const rawToken = "meta_test_token_secret_12345";
    const encrypted = encryptSecret(rawToken);

    // Mock findUnique on prisma.metaAccount
    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
      id: "meta_acc_1",
      organizationId: "custom_org_100",
      wabaId: "waba_custom_100",
      phoneNumberId: "phone_custom_100",
      displayPhoneNumber: "+15551234567",
      verifiedName: "Custom Tenant Brand",
      encryptedAccessToken: encrypted.ciphertext,
      tokenKeyId: "v1",
      tokenExpiresAt: null,
      status: MetaConnectionStatus.CONNECTED,
      verifiedAt: new Date(),
      lastError: null,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const resolved = await MetaConfigResolver.getMetaConfigForOrganization("custom_org_100");

    expect(resolved.source).toBe("DATABASE");
    expect(resolved.organizationId).toBe("custom_org_100");
    expect(resolved.wabaId).toBe("waba_custom_100");
    expect(resolved.phoneNumberId).toBe("phone_custom_100");
    expect(resolved.accessToken).toBe(rawToken);
    expect(resolved.status).toBe(MetaConnectionStatus.CONNECTED);
    expect(resolved.displayPhoneNumber).toBe("+15551234567");
    expect(resolved.verifiedName).toBe("Custom Tenant Brand");
  });

  it("rejects resolution when metaAccount is NOT in CONNECTED status", async () => {
    const prisma = getPrismaClient();
    const encrypted = encryptSecret("some_token");

    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
      id: "meta_acc_2",
      organizationId: "pending_org",
      wabaId: "waba_pending",
      phoneNumberId: "phone_pending",
      displayPhoneNumber: null,
      verifiedName: null,
      encryptedAccessToken: encrypted.ciphertext,
      tokenKeyId: "v1",
      tokenExpiresAt: null,
      status: MetaConnectionStatus.PENDING_VERIFICATION,
      verifiedAt: null,
      lastError: null,
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    await expect(MetaConfigResolver.getMetaConfigForOrganization("pending_org")).rejects.toThrow(
      /is in PENDING_VERIFICATION status/
    );
  });

  it("falls back to backward-compatible .env configuration for Groviews when no DB record exists", async () => {
    const prisma = getPrismaClient();
    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce(null);

    // META_ORGANIZATION_ID is set to TEST_ORG_ID
    const resolved = await MetaConfigResolver.getMetaConfigForOrganization(TEST_ORG_ID);

    expect(resolved.source).toBe("ENV_FALLBACK");
    expect(resolved.organizationId).toBe(TEST_ORG_ID);
    expect(resolved.wabaId).toBe(process.env.META_WABA_ID);
    expect(resolved.phoneNumberId).toBe(process.env.META_PHONE_NUMBER_ID);
    expect(resolved.accessToken).toBe(process.env.META_WHATSAPP_ACCESS_TOKEN);
    expect(resolved.status).toBe(MetaConnectionStatus.CONNECTED);
  });

  it("throws 404 META_CONFIG_UNAVAILABLE when organization has neither DB account nor env fallback", async () => {
    const prisma = getPrismaClient();
    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce(null);

    await expect(
      MetaConfigResolver.getMetaConfigForOrganization("unknown_unconnected_org")
    ).rejects.toThrow(AppError);

    try {
      await MetaConfigResolver.getMetaConfigForOrganization("unknown_unconnected_org");
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(404);
      expect(appErr.code).toBe("META_CONFIG_UNAVAILABLE");
    }
  });

  it("resolves organization for WABA ID from database", async () => {
    const prisma = getPrismaClient();
    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
      id: "meta_acc_3",
      organizationId: "org_waba_test",
      wabaId: "waba_12345",
      phoneNumberId: "phone_12345",
      displayPhoneNumber: null,
      verifiedName: null,
      encryptedAccessToken: "enc",
      tokenKeyId: "v1",
      tokenExpiresAt: null,
      status: MetaConnectionStatus.CONNECTED,
      verifiedAt: null,
      lastError: null,
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await MetaConfigResolver.getOrganizationForWaba("waba_12345");
    expect(result).toEqual({
      organizationId: "org_waba_test",
      source: "DATABASE",
    });
  });

  it("resolves organization for WABA ID via backward-compatible .env fallback", async () => {
    const prisma = getPrismaClient();
    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce(null);

    const configuredWabaId = process.env.META_WABA_ID!;
    const configuredOrgId = process.env.META_ORGANIZATION_ID!;

    const result = await MetaConfigResolver.getOrganizationForWaba(configuredWabaId);
    expect(result).toEqual({
      organizationId: configuredOrgId,
      source: "ENV_FALLBACK",
    });
  });

  it("returns null for untrusted WABA ID not in DB or env", async () => {
    const prisma = getPrismaClient();
    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce(null);

    const result = await MetaConfigResolver.getOrganizationForWaba("foreign_untrusted_waba_88888");
    expect(result).toBeNull();
  });

  it("fails closed with 500 ENCRYPTION_CONFIGURATION_ERROR when DB record exists but decryption fails or key is missing", async () => {
    const prisma = getPrismaClient();

    // Mock a DB record for Groviews (which also has .env fallback configured)
    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
      id: "meta_groviews_corrupted",
      organizationId: TEST_ORG_ID,
      wabaId: "waba_corrupted",
      phoneNumberId: "phone_corrupted",
      displayPhoneNumber: null,
      verifiedName: null,
      encryptedAccessToken: "corrupted_ciphertext_not_valid",
      tokenKeyId: "v1",
      tokenExpiresAt: null,
      status: MetaConnectionStatus.CONNECTED,
      verifiedAt: new Date(),
      lastError: null,
      lastSyncedAt: new Date(),
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    // Must fail closed with 500 error instead of silently falling back to .env!
    try {
      await MetaConfigResolver.getMetaConfigForOrganization(TEST_ORG_ID);
      expect.unreachable("Expected getMetaConfigForOrganization to throw");
    } catch (err) {
      const appErr = err as AppError;
      expect(appErr.statusCode).toBe(500);
      expect(appErr.code).toBe("ENCRYPTION_CONFIGURATION_ERROR");
      expect(appErr.message).toContain("Failed to decrypt stored WhatsApp credentials");
    }
  });

  it("returns null and prevents .env fallback if WABA is claimed in DB under non-connected status", async () => {
    const prisma = getPrismaClient();
    const configuredWabaId = process.env.META_WABA_ID!;

    vi.spyOn(prisma.metaAccount, "findUnique").mockResolvedValueOnce({
      id: "meta_revoked",
      organizationId: "org_revoked",
      wabaId: configuredWabaId,
      phoneNumberId: "phone_revoked",
      displayPhoneNumber: null,
      verifiedName: null,
      encryptedAccessToken: "enc",
      tokenKeyId: "v1",
      tokenExpiresAt: null,
      status: MetaConnectionStatus.REVOKED,
      verifiedAt: null,
      lastError: "Token was revoked",
      lastSyncedAt: null,
      createdAt: new Date(),
      updatedAt: new Date(),
    });

    const result = await MetaConfigResolver.getOrganizationForWaba(configuredWabaId);
    expect(result).toBeNull();
  });
});

