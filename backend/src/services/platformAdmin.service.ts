import { getPrismaClient } from "../config/prisma.js";
import { AppError, ConflictError } from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import { hashPassword } from "../utils/crypto.js";
import { MetaConfigResolver } from "./metaConfigResolver.js";
import { whatsappIntegrationService } from "./whatsappIntegration.service.js";
import { whatsappTemplateService } from "./whatsappTemplate.service.js";
import {
  PlatformOverview,
  PlatformOrganizationsResponse,
  PlatformOrganizationDetail,
  PlatformOrganizationSummary,
  DelegatedAdminSummary,
} from "../types/platform.js";
import { NormalizedWhatsAppTemplate, TemplateSyncSummary } from "../types/template.js";
import { CreateDelegatedAdminInput } from "../validators/admin.validator.js";
import crypto from "crypto";

export class PlatformAdminService {
  /**
   * Returns aggregated platform telemetry and counts for the Master Admin dashboard.
   */
  public async getOverview(): Promise<PlatformOverview> {
    const prisma = getPrismaClient();

    // Aggregated organization counts (excluding internal agency containers directly associated with DELEGATED_ADMIN)
    const agencyContainerFilter = {
      users: {
        none: {
          platformRole: "DELEGATED_ADMIN" as const,
        },
      },
    };

    const [
      totalOrgs,
      activeOrgs,
      archivedOrgs,
      totalUsers,
      masterAdmins,
      delegatedAdmins,
      regularUsers,
      connectedMetaAccounts,
    ] = await Promise.all([
      prisma.organization.count({
        where: agencyContainerFilter,
      }),
      prisma.organization.count({
        where: {
          isArchived: false,
          deletedAt: null,
          ...agencyContainerFilter,
        },
      }),
      prisma.organization.count({
        where: {
          OR: [{ isArchived: true }, { deletedAt: { not: null } }],
          ...agencyContainerFilter,
        },
      }),
      prisma.user.count(),
      prisma.user.count({ where: { platformRole: "PLATFORM_MASTER_ADMIN" } }),
      prisma.user.count({ where: { platformRole: "DELEGATED_ADMIN" } }),
      prisma.user.count({ where: { platformRole: "NONE" } }),
      prisma.metaAccount.count({ where: { status: "CONNECTED" } }),
    ]);

    // Platform WhatsApp connection status
    let whatsappStatus: PlatformOverview["whatsapp"] = {
      connected: false,
      status: "NOT_CONNECTED",
      mode: MetaConfigResolver.getAccountMode(),
      source: "NONE",
      wabaId: null,
      phoneNumberId: null,
      displayPhoneNumber: null,
      verifiedName: null,
      tokenExpiresAt: null,
      lastSyncedAt: null,
      lastError: null,
      organizationsWithConnectedAccount: connectedMetaAccounts,
    };

    try {
      const platformStatus = await whatsappIntegrationService.getPlatformConnectionStatus();
      whatsappStatus = {
        connected: platformStatus.connected,
        status: platformStatus.status,
        mode: platformStatus.mode || MetaConfigResolver.getAccountMode(),
        source: platformStatus.source,
        wabaId: platformStatus.wabaId,
        phoneNumberId: platformStatus.phoneNumberId,
        displayPhoneNumber: platformStatus.displayPhoneNumber,
        verifiedName: platformStatus.verifiedName,
        tokenExpiresAt: platformStatus.tokenExpiresAt,
        lastSyncedAt: platformStatus.lastSyncedAt,
        lastError: platformStatus.lastError,
        organizationsWithConnectedAccount: connectedMetaAccounts,
      };
    } catch (err: unknown) {
      logger.warn(
        `[PlatformAdminService] Failed to get platform WhatsApp status: ${(err as Error)?.message}`
      );
    }

    return {
      platformStatus: "OPERATIONAL",
      mode: MetaConfigResolver.getAccountMode(),
      organizations: {
        total: totalOrgs,
        active: activeOrgs,
        archived: archivedOrgs,
      },
      users: {
        total: totalUsers,
        masterAdmins,
        delegatedAdmins,
        regularUsers,
      },
      whatsapp: whatsappStatus,
    };
  }

  /**
   * Retrieves a paginated list of customer organizations with optional search and status filtering.
   */
  public async getOrganizations(params: {
    search?: string;
    status?: "all" | "active" | "archived";
    page?: number;
    limit?: number;
  }): Promise<PlatformOrganizationsResponse> {
    const prisma = getPrismaClient();
    const page = Math.max(1, params.page || 1);
    const limit = Math.min(50, Math.max(1, params.limit || 10));
    const skip = (page - 1) * limit;

    // Exclude internal agency containers directly associated with DELEGATED_ADMIN users
    const where: any = {
      users: {
        none: {
          platformRole: "DELEGATED_ADMIN",
        },
      },
    };

    if (params.status === "active") {
      where.isArchived = false;
      where.deletedAt = null;
    } else if (params.status === "archived") {
      where.OR = [{ isArchived: true }, { deletedAt: { not: null } }];
    }

    if (params.search && params.search.trim().length > 0) {
      const searchTerm = params.search.trim();
      const searchCondition = [
        { name: { contains: searchTerm, mode: "insensitive" } },
        { slug: { contains: searchTerm, mode: "insensitive" } },
        { id: { contains: searchTerm, mode: "insensitive" } },
      ];

      if (where.OR) {
        where.AND = [{ OR: where.OR }, { OR: searchCondition }];
        delete where.OR;
      } else {
        where.OR = searchCondition;
      }
    }

    const [total, orgs] = await Promise.all([
      prisma.organization.count({ where }),
      prisma.organization.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          _count: {
            select: { users: true },
          },
          metaAccount: {
            select: { id: true, status: true },
          },
        },
      }),
    ]);

    const organizations: PlatformOrganizationSummary[] = orgs.map((org) => {
      const isArchived = org.isArchived || org.deletedAt !== null;
      return {
        id: org.id,
        name: org.name,
        slug: org.slug,
        status: isArchived ? "ARCHIVED" : "ACTIVE",
        isArchived: org.isArchived,
        deletedAt: org.deletedAt,
        createdAt: org.createdAt,
        updatedAt: org.updatedAt,
        userCount: org._count.users,
        hasMetaAccount: org.metaAccount?.status === "CONNECTED",
      };
    });

    return {
      organizations,
      pagination: {
        total,
        page,
        limit,
        totalPages: Math.ceil(total / limit) || 1,
      },
    };
  }

  /**
   * Retrieves detailed information about an organization including users, tenant roles, and resource counts.
   */
  public async getOrganizationById(id: string): Promise<PlatformOrganizationDetail> {
    const prisma = getPrismaClient();
    const org = await prisma.organization.findUnique({
      where: { id },
      include: {
        users: {
          select: {
            id: true,
            email: true,
            firstName: true,
            lastName: true,
            role: true,
            platformRole: true,
            createdAt: true,
            updatedAt: true,
          },
          orderBy: { createdAt: "asc" },
        },
        metaAccount: {
          select: {
            status: true,
            wabaId: true,
            phoneNumberId: true,
            verifiedName: true,
            displayPhoneNumber: true,
            lastSyncedAt: true,
            lastError: true,
            tokenExpiresAt: true,
          },
        },
        _count: {
          select: {
            campaigns: true,
            contacts: true,
            contactLists: true,
            users: true,
          },
        },
      },
    });

    if (!org) {
      throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
    }

    const isArchived = org.isArchived || org.deletedAt !== null;

    return {
      id: org.id,
      name: org.name,
      slug: org.slug,
      status: isArchived ? "ARCHIVED" : "ACTIVE",
      isArchived: org.isArchived,
      deletedAt: org.deletedAt,
      createdAt: org.createdAt,
      updatedAt: org.updatedAt,
      users: org.users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        role: u.role,
        platformRole: u.platformRole,
        createdAt: u.createdAt,
        updatedAt: u.updatedAt,
      })),
      counts: {
        campaigns: org._count.campaigns,
        contacts: org._count.contacts,
        contactLists: org._count.contactLists,
        users: org._count.users,
      },
      metaAccount: org.metaAccount
        ? {
            status: org.metaAccount.status,
            wabaId: org.metaAccount.wabaId,
            phoneNumberId: org.metaAccount.phoneNumberId,
            verifiedName: org.metaAccount.verifiedName,
            displayPhoneNumber: org.metaAccount.displayPhoneNumber,
            lastSyncedAt: org.metaAccount.lastSyncedAt,
            lastError: org.metaAccount.lastError,
            tokenExpiresAt: org.metaAccount.tokenExpiresAt,
          }
        : null,
    };
  }

  /**
   * Safely deactivates/archives an organization, invalidating active sessions.
   * Safety invariant: Cannot archive the platform anchor or operator's own organization.
   */
  public async archiveOrganization(
    id: string,
    operatorOrganizationId?: string
  ): Promise<PlatformOrganizationSummary> {
    const prisma = getPrismaClient();
    const platformOrgId = MetaConfigResolver.getPlatformOrganizationId();

    if (platformOrgId && id === platformOrgId) {
      throw new AppError(
        "Cannot archive the root platform organization",
        400,
        "PLATFORM_ORGANIZATION_IMMUTABLE"
      );
    }

    if (operatorOrganizationId && id === operatorOrganizationId) {
      throw new AppError(
        "Cannot archive your own active Master Admin organization",
        400,
        "SELF_ORGANIZATION_ARCHIVE_DENIED"
      );
    }

    const org = await prisma.organization.findUnique({
      where: { id },
    });

    if (!org) {
      throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
    }

    if (org.isArchived) {
      throw new AppError("Organization is already archived", 400, "ALREADY_ARCHIVED");
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: {
        isArchived: true,
        deletedAt: new Date(),
      },
      include: {
        _count: { select: { users: true } },
        metaAccount: { select: { id: true, status: true } },
      },
    });

    // Invalidate active sessions for all users of this organization
    await prisma.session.deleteMany({
      where: { organizationId: id },
    });

    logger.info(
      `[PlatformAdminService] Organization archived: ${updated.name} (${updated.id}) by operator`
    );

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      status: "ARCHIVED",
      isArchived: updated.isArchived,
      deletedAt: updated.deletedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      userCount: updated._count.users,
      hasMetaAccount: updated.metaAccount?.status === "CONNECTED",
    };
  }

  /**
   * Reactivates an archived organization.
   */
  public async reactivateOrganization(id: string): Promise<PlatformOrganizationSummary> {
    const prisma = getPrismaClient();

    const org = await prisma.organization.findUnique({
      where: { id },
    });

    if (!org) {
      throw new AppError("Organization not found", 404, "ORGANIZATION_NOT_FOUND");
    }

    if (!org.isArchived && !org.deletedAt) {
      throw new AppError("Organization is already active", 400, "ALREADY_ACTIVE");
    }

    const updated = await prisma.organization.update({
      where: { id },
      data: {
        isArchived: false,
        deletedAt: null,
      },
      include: {
        _count: { select: { users: true } },
        metaAccount: { select: { id: true, status: true } },
      },
    });

    logger.info(
      `[PlatformAdminService] Organization reactivated: ${updated.name} (${updated.id})`
    );

    return {
      id: updated.id,
      name: updated.name,
      slug: updated.slug,
      status: "ACTIVE",
      isArchived: updated.isArchived,
      deletedAt: updated.deletedAt,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
      userCount: updated._count.users,
      hasMetaAccount: updated.metaAccount?.status === "CONNECTED",
    };
  }

  /**
   * Retrieves templates for the shared platform WABA.
   */
  public async getPlatformTemplates(
    forceRefresh = false
  ): Promise<{ templates: NormalizedWhatsAppTemplate[]; summary: TemplateSyncSummary }> {
    const platformOrgId = MetaConfigResolver.getPlatformOrganizationId();

    const emptySummary: TemplateSyncSummary = {
      totalOnMeta: 0,
      approvedCount: 0,
      pendingCount: 0,
      rejectedCount: 0,
      wabaIdMasked: "***",
      syncedAt: new Date().toISOString(),
      requestedTemplatesFound: {
        hello_world: false,
        jaspers_market_plain_text_v1: false,
        jaspers_market_order_confirmation_v1: false,
      },
    };

    if (!platformOrgId) {
      return {
        templates: [],
        summary: emptySummary,
      };
    }

    try {
      return await whatsappTemplateService.fetchWabaTemplates(platformOrgId, forceRefresh);
    } catch (err: unknown) {
      logger.warn(
        `[PlatformAdminService] Failed to fetch platform templates: ${(err as Error)?.message}`
      );
      return {
        templates: [],
        summary: emptySummary,
      };
    }
  }

  /**
   * Retrieves all users holding the DELEGATED_ADMIN platform role with their active assignment counts.
   * Never selects or returns passwordHash or sensitive credentials.
   */
  public async getDelegatedAdminsList(): Promise<DelegatedAdminSummary[]> {
    const prisma = getPrismaClient();

    const admins = await prisma.user.findMany({
      where: { platformRole: "DELEGATED_ADMIN" },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformRole: true,
        organizationId: true,
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
          },
        },
        createdAt: true,
        delegatedAssignments: {
          where: { status: "ACTIVE" },
          select: {
            id: true,
            organizationId: true,
            organization: {
              select: {
                id: true,
                name: true,
              },
            },
          },
        },
      },
      orderBy: { createdAt: "desc" },
    });

    return admins.map((admin) => ({
      id: admin.id,
      email: admin.email,
      firstName: admin.firstName,
      lastName: admin.lastName,
      platformRole: admin.platformRole,
      organizationId: admin.organizationId,
      organizationName: admin.organization?.name,
      createdAt: admin.createdAt,
      activeAssignmentsCount: admin.delegatedAssignments.length,
      assignedOrganizations: admin.delegatedAssignments.map((a) => ({
        id: a.organizationId,
        name: a.organization.name,
      })),
    }));
  }

  /**
   * Creates a new delegated admin account with an isolated administrative container organization.
   * Enforces server-side DELEGATED_ADMIN role, hashes password via bcrypt (12 rounds),
   * and prevents duplicate emails atomically within a database transaction.
   */
  public async createDelegatedAdmin(
    input: CreateDelegatedAdminInput
  ): Promise<DelegatedAdminSummary> {
    const prisma = getPrismaClient();
    const normalizedEmail = input.email.trim().toLowerCase();

    // 1. Check for existing user with identical email (case-insensitive)
    const existing = await prisma.user.findFirst({
      where: {
        email: {
          equals: normalizedEmail,
          mode: "insensitive",
        },
      },
    });

    if (existing) {
      throw new ConflictError(
        "An account with this email address already exists. Please choose a different email."
      );
    }

    // 2. Hash the chosen password using the existing bcrypt 12-round helper
    const passwordHash = await hashPassword(input.password);

    // 3. Generate safe unique organization name & slug for isolated administrative container
    const cleanFirstName = input.firstName.trim();
    const cleanLastName = input.lastName?.trim() || "";
    const fullName = `${cleanFirstName}${cleanLastName ? ` ${cleanLastName}` : ""}`;
    const orgName = `${fullName}'s Agency`.slice(0, 100);
    const orgSlug = `agency-${crypto.randomBytes(4).toString("hex")}`;

    // 4. Atomically provision the isolated container and the delegated admin user
    const result = await prisma.$transaction(async (tx) => {
      // Create isolated administrative organization container
      const organization = await tx.organization.create({
        data: {
          name: orgName,
          slug: orgSlug,
        },
      });

      // Create User with server-enforced DELEGATED_ADMIN platform role
      const user = await tx.user.create({
        data: {
          organizationId: organization.id,
          email: normalizedEmail,
          passwordHash,
          firstName: cleanFirstName,
          lastName: cleanLastName || null,
          role: "ADMIN",
          platformRole: "DELEGATED_ADMIN",
        },
      });

      return { user, organization };
    });

    return {
      id: result.user.id,
      email: result.user.email,
      firstName: result.user.firstName,
      lastName: result.user.lastName,
      platformRole: result.user.platformRole,
      organizationId: result.organization.id,
      organizationName: result.organization.name,
      activeAssignmentsCount: 0,
      assignedOrganizations: [],
      createdAt: result.user.createdAt,
    };
  }
}

export const platformAdminService = new PlatformAdminService();
