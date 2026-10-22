import { getPrismaClient } from "../config/prisma.js";
import {
  hashPassword,
  comparePassword,
  generateSessionToken,
  hashSessionToken,
} from "../utils/crypto.js";
import { AppError, UnauthorizedError } from "../utils/errors.js";
import { SignupInput, LoginInput } from "../validators/auth.validator.js";
import { PlatformRole } from "../types/platform.js";
import crypto from "crypto";

export interface SanitizedUser {
  id: string;
  organizationId: string;
  email: string;
  firstName: string;
  lastName: string | null;
  role: string;
  platformRole?: PlatformRole;
  createdAt: Date;
}

export interface SanitizedOrganization {
  id: string;
  name: string;
  slug: string;
}

export interface AuthSessionResult {
  user: SanitizedUser;
  organization: SanitizedOrganization;
  token: string;
  expiresAt: Date;
}

export interface RequestMetadata {
  userAgent?: string;
  ipAddress?: string;
}

const SESSION_DURATION_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

export class AuthService {
  /**
   * Sanitizes a user record to prevent leaking sensitive fields (e.g. passwordHash).
   */
  public sanitizeUser(user: {
    id: string;
    organizationId: string;
    email: string;
    firstName: string;
    lastName: string | null;
    role: string;
    platformRole?: string;
    createdAt: Date;
  }): SanitizedUser {
    return {
      id: user.id,
      organizationId: user.organizationId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      platformRole: (user.platformRole as PlatformRole) || "NONE",
      createdAt: user.createdAt,
    };
  }

  /**
   * Generates a URL-safe unique organization slug from company name.
   */
  private generateSlug(name: string): string {
    const base = name
      .toLowerCase()
      .trim()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "");
    const randomSuffix = crypto.randomBytes(3).toString("hex");
    return `${base || "org"}-${randomSuffix}`;
  }

  /**
   * Registers a new customer account, provisions their tenant organization,
   * and creates their initial authenticated session atomically.
   */
  public async signup(
    input: SignupInput,
    meta?: RequestMetadata
  ): Promise<AuthSessionResult> {
    const prisma = getPrismaClient();
    const normalizedEmail = input.email.trim().toLowerCase();

    // Check for existing user with identical email (case-insensitive)
    const existingUser = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
    });

    if (existingUser) {
      throw new AppError(
        "An account with this email address already exists. Please sign in instead.",
        409,
        "EMAIL_ALREADY_EXISTS"
      );
    }

    const passwordHash = await hashPassword(input.password);
    const orgSlug = this.generateSlug(input.organizationName);
    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    // Atomically create Organization, User, and Session
    const result = await prisma.$transaction(async (tx) => {
      const organization = await tx.organization.create({
        data: {
          name: input.organizationName.trim(),
          slug: orgSlug,
        },
      });

      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: normalizedEmail,
          passwordHash,
          firstName: input.firstName.trim(),
          lastName: input.lastName?.trim() || null,
          role: "OWNER",
        },
      });

      await tx.session.create({
        data: {
          userId: user.id,
          organizationId: organization.id,
          tokenHash,
          expiresAt,
          userAgent: meta?.userAgent?.slice(0, 500) || null,
          ipAddress: meta?.ipAddress?.slice(0, 45) || null,
        },
      });

      return { organization, user };
    });

    return {
      user: this.sanitizeUser(result.user),
      organization: {
        id: result.organization.id,
        name: result.organization.name,
        slug: result.organization.slug,
      },
      token: sessionToken,
      expiresAt,
    };
  }

  /**
   * Authenticates a customer with email and password.
   * Returns generic error messages on any failure to prevent account enumeration.
   */
  public async login(
    input: LoginInput,
    meta?: RequestMetadata
  ): Promise<AuthSessionResult> {
    const prisma = getPrismaClient();
    const normalizedEmail = input.email.trim().toLowerCase();

    const user = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
      include: {
        organization: true,
      },
    });

    // Timing-safe fallback comparison even if user does not exist
    if (!user) {
      await comparePassword(
        input.password,
        "$2a$12$e80yq9O4NfWqP2M4O2Jpce2P18H6aWzN.FkF5cM1rK3L7B0vKx.Gy"
      );
      throw new UnauthorizedError("Invalid email or password");
    }

    const isPasswordValid = await comparePassword(input.password, user.passwordHash);
    if (!isPasswordValid) {
      throw new UnauthorizedError("Invalid email or password");
    }

    if (Boolean(user.organization.isArchived) || Boolean(user.organization.deletedAt)) {
      throw new UnauthorizedError("Organization is archived or suspended");
    }

    const sessionToken = generateSessionToken();
    const tokenHash = hashSessionToken(sessionToken);
    const expiresAt = new Date(Date.now() + SESSION_DURATION_MS);

    await prisma.session.create({
      data: {
        userId: user.id,
        organizationId: user.organizationId,
        tokenHash,
        expiresAt,
        userAgent: meta?.userAgent?.slice(0, 500) || null,
        ipAddress: meta?.ipAddress?.slice(0, 45) || null,
      },
    });

    return {
      user: this.sanitizeUser(user),
      organization: {
        id: user.organization.id,
        name: user.organization.name,
        slug: user.organization.slug,
      },
      token: sessionToken,
      expiresAt,
    };
  }

  /**
   * Validates a session token, returning associated user and organization context.
   * Compares the SHA-256 hash of the client token against database storage.
   * Cleans up expired sessions automatically.
   */
  public async validateSession(rawToken: string) {
    if (!rawToken || rawToken.trim() === "") return null;

    const tokenHash = hashSessionToken(rawToken);
    const prisma = getPrismaClient();
    const session = await prisma.session.findUnique({
      where: { tokenHash },
      include: {
        user: true,
        organization: true,
      },
    });

    if (!session) return null;

    if (session.expiresAt.getTime() <= Date.now()) {
      // Session has expired; clean up asynchronously
      prisma.session
        .delete({ where: { id: session.id } })
        .catch(() => {});
      return null;
    }

    if (Boolean(session.organization.isArchived) || Boolean(session.organization.deletedAt)) {
      return null;
    }

    return session;
  }

  /**
   * Terminates an active session by token hash.
   */
  public async logout(rawToken: string): Promise<void> {
    if (!rawToken || rawToken.trim() === "") return;
    const tokenHash = hashSessionToken(rawToken);
    const prisma = getPrismaClient();
    await prisma.session.deleteMany({
      where: { tokenHash },
    });
  }

  /**
   * Retrieves the current user profile from a valid session token.
   */
  public async getCurrentUser(token: string): Promise<{
    user: SanitizedUser;
    organization: SanitizedOrganization;
  }> {
    const session = await this.validateSession(token);
    if (!session) {
      throw new UnauthorizedError("No active or valid session found");
    }

    return {
      user: this.sanitizeUser(session.user),
      organization: {
        id: session.organization.id,
        name: session.organization.name,
        slug: session.organization.slug,
      },
    };
  }
}

export const authService = new AuthService();
