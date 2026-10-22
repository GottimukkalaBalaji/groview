import { getPrismaClient } from "../config/prisma.js";
import {
  BadRequestError,
  ConflictError,
  NotFoundError,
  AppError,
} from "../utils/errors.js";
import { logger } from "../utils/logger.js";
import type {
  BusinessAssignmentSummary,
  BusinessAssignmentsListResponse,
  EligibleDelegatedAdmin,
  AssignedOrganizationSummary,
} from "../types/platform.js";
import type {
  CreateBusinessAssignmentInput,
  RevokeBusinessAssignmentInput,
  QueryBusinessAssignmentsInput,
} from "../validators/businessAssignment.validator.js";

/**
 * Detects whether a database error is due to the unapplied business_assignments table.
 */
export function isTableMissingError(error: unknown): boolean {
  if (!error || typeof error !== "object") return false;
  const e = error as { code?: string; message?: string };
  return (
    e.code === "P2021" ||
    (typeof e.message === "string" &&
      (e.message.includes("business_assignments") ||
        e.message.includes("does not exist in the current database") ||
        (e.message.includes("relation") && e.message.includes("does not exist"))))
  );
}

export class BusinessAssignmentService {
  /**
   * Retrieves paginated business assignments with status filtering and text search.
   * Gracefully returns tableDeployed: false when migration has not been applied.
   */
  public async getAssignments(
    query: QueryBusinessAssignmentsInput
  ): Promise<BusinessAssignmentsListResponse> {
    const prisma = getPrismaClient();
    const page = Math.max(1, query.page || 1);
    const limit = Math.max(1, Math.min(100, query.limit || 10));
    const skip = (page - 1) * limit;

    try {
      const whereClause: Record<string, unknown> = {};

      if (query.status && query.status !== "ALL") {
        whereClause.status = query.status;
      }

      if (query.search && query.search.trim().length > 0) {
        const searchTerm = query.search.trim();
        whereClause.OR = [
          { organization: { name: { contains: searchTerm, mode: "insensitive" } } },
          { organization: { slug: { contains: searchTerm, mode: "insensitive" } } },
          { user: { email: { contains: searchTerm, mode: "insensitive" } } },
          { user: { firstName: { contains: searchTerm, mode: "insensitive" } } },
          { user: { lastName: { contains: searchTerm, mode: "insensitive" } } },
        ];
      }

      const [total, records] = await Promise.all([
        prisma.businessAssignment.count({ where: whereClause }),
        prisma.businessAssignment.findMany({
          where: whereClause,
          skip,
          take: limit,
          orderBy: { assignedAt: "desc" },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                isArchived: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                platformRole: true,
              },
            },
            assignedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        }),
      ]);

      const assignments: BusinessAssignmentSummary[] = records.map((r) => ({
        id: r.id,
        organizationId: r.organizationId,
        organization: r.organization,
        userId: r.userId,
        user: r.user,
        assignedById: r.assignedById,
        assignedBy: r.assignedBy,
        status: r.status as "ACTIVE" | "REVOKED",
        assignedAt: r.assignedAt,
        revokedAt: r.revokedAt,
        assignmentReason: r.assignmentReason,
        revocationReason: r.revocationReason,
        metadata: r.metadata as Record<string, unknown> | null,
        createdAt: r.createdAt,
        updatedAt: r.updatedAt,
      }));

      return {
        assignments,
        pagination: {
          total,
          page,
          limit,
          totalPages: Math.ceil(total / limit) || 1,
        },
        tableDeployed: true,
      };
    } catch (error) {
      if (isTableMissingError(error)) {
        logger.warn(
          "[BusinessAssignmentService] business_assignments table does not exist in database. Returning unmigrated state."
        );
        return {
          assignments: [],
          pagination: {
            total: 0,
            page,
            limit,
            totalPages: 0,
          },
          tableDeployed: false,
          message:
            "Business assignments table is pending database migration deployment. Contact administrator to apply pending schema migrations.",
        };
      }
      logger.error("[BusinessAssignmentService] Error retrieving assignments:", error);
      throw error;
    }
  }

  /**
   * Assigns an organization to an eligible DELEGATED_ADMIN user.
   * Enforces:
   * 1. Target organization exists and is active (not archived or deleted).
   * 2. Target user exists and has platformRole === 'DELEGATED_ADMIN'.
   * 3. Target organization does not already have an ACTIVE assignment (Conflict 409).
   */
  public async createAssignment(
    input: CreateBusinessAssignmentInput & { assignedById?: string | null }
  ): Promise<BusinessAssignmentSummary> {
    const prisma = getPrismaClient();

    // 1. Verify organization exists and is not archived
    const org = await prisma.organization.findUnique({
      where: { id: input.organizationId },
      select: { id: true, name: true, isArchived: true, deletedAt: true },
    });

    if (!org) {
      throw new NotFoundError(`Organization '${input.organizationId}' not found.`);
    }

    if (org.isArchived || org.deletedAt) {
      throw new BadRequestError(
        `Cannot assign archived or suspended organization '${org.name}'.`
      );
    }

    // 2. Verify target user exists and is a DELEGATED_ADMIN
    const targetUser = await prisma.user.findUnique({
      where: { id: input.userId },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        platformRole: true,
      },
    });

    if (!targetUser) {
      throw new NotFoundError(`User '${input.userId}' not found.`);
    }

    if (targetUser.platformRole !== "DELEGATED_ADMIN") {
      throw new BadRequestError(
        `User '${targetUser.email}' has platformRole '${targetUser.platformRole}'. Only users with DELEGATED_ADMIN platform role are eligible for business assignments.`
      );
    }

    // 3. Atomically check for active assignment collision and create
    try {
      return await prisma.$transaction(async (tx) => {
        const existingActive = await tx.businessAssignment.findFirst({
          where: {
            organizationId: input.organizationId,
            status: "ACTIVE",
          },
          select: {
            id: true,
            userId: true,
            user: { select: { email: true, firstName: true } },
          },
        });

        if (existingActive) {
          throw new ConflictError(
            `Organization '${org.name}' already has an active delegated administrator assignment (${existingActive.user.email}). Revoke the existing assignment before creating a new one.`
          );
        }

        const created = await tx.businessAssignment.create({
          data: {
            organizationId: input.organizationId,
            userId: input.userId,
            assignedById: input.assignedById || null,
            status: "ACTIVE",
            assignmentReason: input.assignmentReason?.trim() || null,
          },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
                isArchived: true,
              },
            },
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                platformRole: true,
              },
            },
            assignedBy: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
              },
            },
          },
        });

        logger.info(
          `[BusinessAssignmentService] Assigned org '${org.name}' (${org.id}) to delegated admin '${targetUser.email}' (${targetUser.id}) by '${input.assignedById || "secret"}'`
        );

        return {
          id: created.id,
          organizationId: created.organizationId,
          organization: created.organization,
          userId: created.userId,
          user: created.user,
          assignedById: created.assignedById,
          assignedBy: created.assignedBy,
          status: created.status as "ACTIVE" | "REVOKED",
          assignedAt: created.assignedAt,
          revokedAt: created.revokedAt,
          assignmentReason: created.assignmentReason,
          revocationReason: created.revocationReason,
          metadata: created.metadata as Record<string, unknown> | null,
          createdAt: created.createdAt,
          updatedAt: created.updatedAt,
        };
      });
    } catch (error) {
      if (isTableMissingError(error)) {
        throw new AppError(
          "Business assignments feature is temporarily unavailable because the database migration has not been deployed.",
          503,
          "FEATURE_UNAVAILABLE"
        );
      }
      throw error;
    }
  }

  /**
   * Revokes an existing active business assignment.
   */
  public async revokeAssignment(
    id: string,
    input: RevokeBusinessAssignmentInput & { revokedById?: string | null }
  ): Promise<BusinessAssignmentSummary> {
    const prisma = getPrismaClient();

    try {
      const assignment = await prisma.businessAssignment.findUnique({
        where: { id },
        include: {
          organization: { select: { id: true, name: true } },
          user: { select: { id: true, email: true } },
        },
      });

      if (!assignment) {
        throw new NotFoundError(`Business assignment '${id}' not found.`);
      }

      if (assignment.status === "REVOKED") {
        throw new BadRequestError("Business assignment is already revoked.");
      }

      const updated = await prisma.businessAssignment.update({
        where: { id },
        data: {
          status: "REVOKED",
          revokedAt: new Date(),
          revocationReason: input.revocationReason?.trim() || null,
        },
        include: {
          organization: {
            select: {
              id: true,
              name: true,
              slug: true,
              isArchived: true,
            },
          },
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              platformRole: true,
            },
          },
          assignedBy: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
            },
          },
        },
      });

      logger.info(
        `[BusinessAssignmentService] Revoked assignment '${id}' for org '${assignment.organization.name}' and user '${assignment.user.email}' by '${input.revokedById || "secret"}'`
      );

      return {
        id: updated.id,
        organizationId: updated.organizationId,
        organization: updated.organization,
        userId: updated.userId,
        user: updated.user,
        assignedById: updated.assignedById,
        assignedBy: updated.assignedBy,
        status: updated.status as "ACTIVE" | "REVOKED",
        assignedAt: updated.assignedAt,
        revokedAt: updated.revokedAt,
        assignmentReason: updated.assignmentReason,
        revocationReason: updated.revocationReason,
        metadata: updated.metadata as Record<string, unknown> | null,
        createdAt: updated.createdAt,
        updatedAt: updated.updatedAt,
      };
    } catch (error) {
      if (isTableMissingError(error)) {
        throw new AppError(
          "Business assignment cannot be revoked because the database migration has not been deployed.",
          503,
          "FEATURE_UNAVAILABLE"
        );
      }
      throw error;
    }
  }

  /**
   * Retrieves all users holding the DELEGATED_ADMIN platform role to populate the assignment selector.
   */
  public async getEligibleDelegatedAdmins(): Promise<EligibleDelegatedAdmin[]> {
    const prisma = getPrismaClient();

    try {
      const users = await prisma.user.findMany({
        where: { platformRole: "DELEGATED_ADMIN" },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
          platformRole: true,
          organizationId: true,
          organization: { select: { name: true } },
        },
        orderBy: { email: "asc" },
      });

      return users.map((u) => ({
        id: u.id,
        email: u.email,
        firstName: u.firstName,
        lastName: u.lastName,
        platformRole: u.platformRole,
        organizationId: u.organizationId,
        organizationName: u.organization?.name,
      }));
    } catch (error) {
      logger.error("[BusinessAssignmentService] Error retrieving eligible delegated admins:", error);
      throw error;
    }
  }

  /**
   * Resolves list of organizations assigned to the authenticated user.
   * If caller is Master Admin, returns all active organizations.
   * If caller is Delegated Admin, returns active assigned organizations.
   */
  public async getMyAssignedOrganizations(
    userId: string,
    isMasterAdmin: boolean
  ): Promise<AssignedOrganizationSummary[]> {
    const prisma = getPrismaClient();

    if (isMasterAdmin) {
      const orgs = await prisma.organization.findMany({
        where: { isArchived: false, deletedAt: null },
        select: { id: true, name: true, slug: true },
        orderBy: { name: "asc" },
      });
      return orgs;
    }

    try {
      const assignments = await prisma.businessAssignment.findMany({
        where: {
          userId,
          status: "ACTIVE",
          organization: { isArchived: false, deletedAt: null },
        },
        select: {
          organization: {
            select: { id: true, name: true, slug: true },
          },
        },
        orderBy: { organization: { name: "asc" } },
      });

      return assignments.map((a) => a.organization);
    } catch (error) {
      if (isTableMissingError(error)) {
        return [];
      }
      throw error;
    }
  }
}

export const businessAssignmentService = new BusinessAssignmentService();
