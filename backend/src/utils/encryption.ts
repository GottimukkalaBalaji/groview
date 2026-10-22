import crypto from "crypto";

const ALGORITHM = "aes-256-gcm";
const IV_LENGTH_BYTES = 12; // 96 bits recommended by NIST SP 800-38D for GCM
const AUTH_TAG_LENGTH_BYTES = 16; // 128 bits
const KEY_LENGTH_BYTES = 32; // 256 bits

/**
 * Validates and extracts a 32-byte cryptographic key buffer.
 * Accepts:
 * - 64-character hexadecimal string
 * - 32-byte UTF-8 string
 * If no custom key is provided, falls back to process.env.APP_ENCRYPTION_KEY.
 */
export function validateEncryptionKey(customKey?: string): Buffer {
  const keyStr = customKey ?? process.env.APP_ENCRYPTION_KEY;
  if (!keyStr || typeof keyStr !== "string" || keyStr.trim() === "") {
    throw new Error(
      "APP_ENCRYPTION_KEY is required for encryption operations. Please configure a 32-byte key in the environment."
    );
  }

  const trimmed = keyStr.trim();
  if (/^[0-9a-fA-F]{64}$/.test(trimmed)) {
    return Buffer.from(trimmed, "hex");
  }

  if (Buffer.byteLength(trimmed, "utf8") === KEY_LENGTH_BYTES) {
    return Buffer.from(trimmed, "utf8");
  }

  throw new Error(
    "Invalid APP_ENCRYPTION_KEY length: key must be either a 64-character hex string (32 bytes) or a 32-byte UTF-8 string."
  );
}

/**
 * Generates a fresh 256-bit cryptographically secure hex-encoded encryption key.
 * Useful for bootstrapping or rotating keys.
 */
export function generateEncryptionKey(): string {
  return crypto.randomBytes(KEY_LENGTH_BYTES).toString("hex");
}

export interface EncryptedPayload {
  ciphertext: string; // Formatted as `${ivHex}:${authTagHex}:${ciphertextHex}`
  keyId: string;
}

/**
 * Encrypts a plaintext secret using AES-256-GCM authenticated encryption.
 * Output format: `${ivHex}:${authTagHex}:${ciphertextHex}`.
 * Never logs or prints the plaintext secret.
 */
export function encryptSecret(
  plaintext: string,
  options?: { key?: string; keyId?: string }
): EncryptedPayload {
  if (typeof plaintext !== "string" || plaintext.length === 0) {
    throw new Error("Cannot encrypt empty or non-string secret.");
  }

  const keyBuffer = validateEncryptionKey(options?.key);
  const iv = crypto.randomBytes(IV_LENGTH_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });

  const encrypted = Buffer.concat([
    cipher.update(plaintext, "utf8"),
    cipher.final(),
  ]);
  const authTag = cipher.getAuthTag();

  const formattedCiphertext = `${iv.toString("hex")}:${authTag.toString("hex")}:${encrypted.toString("hex")}`;

  return {
    ciphertext: formattedCiphertext,
    keyId: options?.keyId || "v1",
  };
}

/**
 * Decrypts an AES-256-GCM ciphertext payload.
 * Verifies authenticity (auth tag) before returning decrypted string.
 * Throws if tampered, corrupted, or decrypted with wrong key.
 */
export function decryptSecret(
  encryptedString: string,
  options?: { key?: string }
): string {
  if (typeof encryptedString !== "string" || !encryptedString.includes(":")) {
    throw new Error("Invalid ciphertext format: expected iv:authTag:ciphertext");
  }

  const parts = encryptedString.split(":");
  if (parts.length !== 3) {
    throw new Error("Invalid ciphertext structure: expected 3 colon-separated segments.");
  }

  const [ivHex, authTagHex, cipherHex] = parts;
  if (!ivHex || !authTagHex || !cipherHex) {
    throw new Error("Corrupted ciphertext: one or more cryptographic components are empty.");
  }

  const keyBuffer = validateEncryptionKey(options?.key);
  const iv = Buffer.from(ivHex, "hex");
  const authTag = Buffer.from(authTagHex, "hex");
  const ciphertext = Buffer.from(cipherHex, "hex");

  if (iv.length !== IV_LENGTH_BYTES || authTag.length !== AUTH_TAG_LENGTH_BYTES) {
    throw new Error("Cryptographic parameter length mismatch during decryption.");
  }

  const decipher = crypto.createDecipheriv(ALGORITHM, keyBuffer, iv, {
    authTagLength: AUTH_TAG_LENGTH_BYTES,
  });
  decipher.setAuthTag(authTag);

  try {
    const decrypted = Buffer.concat([
      decipher.update(ciphertext),
      decipher.final(),
    ]);
    return decrypted.toString("utf8");
  } catch {
    throw new Error(
      "Failed to decrypt secret: authentication tag mismatch or invalid encryption key."
    );
  }
}
