import bcrypt from "bcryptjs";
import crypto from "crypto";

const BCRYPT_SALT_ROUNDS = 12;

/**
 * Hashes a plaintext password using bcrypt with a cost factor of 12.
 */
export async function hashPassword(password: string): Promise<string> {
  return bcrypt.hash(password, BCRYPT_SALT_ROUNDS);
}

/**
 * Compares a candidate plaintext password with an existing bcrypt hash.
 * Constant-time comparison prevents timing attacks.
 */
export async function comparePassword(
  candidate: string,
  hash: string
): Promise<boolean> {
  return bcrypt.compare(candidate, hash);
}

/**
 * Generates a 256-bit cryptographically secure, URL-safe random session token.
 */
export function generateSessionToken(): string {
  return crypto.randomBytes(32).toString("hex");
}

/**
 * Produces a SHA-256 cryptographic hash of a session token for secure database persistence.
 * Prevents active session hijacking if database backups or dumps are ever exposed.
 */
export function hashSessionToken(token: string): string {
  return crypto.createHash("sha256").update(token).digest("hex");
}

