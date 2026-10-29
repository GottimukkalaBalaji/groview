import { CampaignStatus, AudienceType, Prisma, ConsentStatus, MessageDeliveryStatus } from "@prisma/client";
import { getPrismaClient } from "../config/prisma.js";
import { NotFoundError, BadRequestError, AppError, ForbiddenError, ConflictError } from "../utils/errors.js";

export type CampaignApprovalStatus = "NOT_REQUIRED" | "PENDING" | "APPROVED" | "REJECTED";
export const CampaignApprovalStatus = {
  NOT_REQUIRED: "NOT_REQUIRED" as const,
  PENDING: "PENDING" as const,
  APPROVED: "APPROVED" as const,
  REJECTED: "REJECTED" as const,
};
import { whatsappTemplateService } from "./whatsappTemplate.service.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import {
  resolveContactTemplateParameters,
  validateCampaignTemplateMapping,
} from "./templateParameterMapping.js";
import {
  enqueueWhatsAppDispatchJob,
  inspectAndRecoverDispatchJob,
  removeWhatsAppDispatchJob,
} from "../queue/whatsapp.queue.js";
import { isRedisConfigured } from "../config/redis.js";
import { CampaignLifecycleService } from "./campaignLifecycle.service.js";
import { logger } from "../utils/logger.js";
import {
  CreateCampaignInput,
  UpdateCampaignInput,
  QueryCampaignsInput,
  MIN_SCHEDULE_LEAD_MS,
} from "../validators/campaign.validator.js";
export { MIN_SCHEDULE_LEAD_MS };
import { QueryPlatformCampaignApprovalsInput } from "../validators/campaignApproval.validator.js";
import { isAllowedTestTemplate, getAllowedTestTemplates } from "../constants/templateAllowlist.js";

export interface PlatformCampaignApprovalItem {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  status: CampaignStatus;
  approvalStatus: CampaignApprovalStatus;
  scheduledAt: Date | null;
  totalRecipients: number;
  templateId: string;
  templateName: string;
  templateCategory: string;
  templateLanguage: string;
  audienceType: AudienceType;
  audienceName: string;
  createdBy: string | null;
  approvedAt: Date | null;
  approvedBy: string | null;
  approvalNotes: string | null;
  rejectedAt: Date | null;
  rejectedBy: string | null;
  rejectionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
  organization: {
    id: string;
    name: string;
    slug: string;
  };
}

export interface PlatformCampaignApprovalsResult {
  items: PlatformCampaignApprovalItem[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  counts: {
    pending: number;
    approved: number;
    rejected: number;
    total: number;
  };
}

export interface CampaignDispatchSummary {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  totalAudienceCount: number;
  eligibleCount: number;
  queuedCount: number;
  alreadyPreparedCount: number;
  enqueueSuccessCount: number;
  enqueueFailureCount: number;
  excludedCount: {
    consentRequired: number;
    suppressed: number;
    invalidPhone: number;
    missingVariables: number;
  };
  sampleExclusions: Array<{
    contactId: string;
    reason: string;
  }>;
}

export interface CampaignQueueRecoverySummary {
  campaignId: string;
  campaignName: string;
  status: CampaignStatus;
  totalPersistedMessages: number;
  eligibleQueuedCount: number;
  enqueuedSuccessCount: number;
  requeuedCount?: number;
  alreadyEnqueuedCount: number;
  enqueueFailureCount: number;
  ambiguousCount?: number;
  terminalCount: number;
  inFlightCount: number;
}

export interface PaginatedResult<T> {
  items: T[];
  pagination: {
    page: number;
    limit: number;
    total: number;
    totalPages: number;
    hasNextPage: boolean;
    hasPrevPage: boolean;
  };
  metrics: {
    total: number;
    draft: number;
    scheduled: number;
    sending: number;
    completed: number;
    failed: number;
    cancelled: number;
  };
}

interface IdempotencyRecord {
  campaign: unknown;
  timestamp: number;
}

export class CampaignService {
  private static idempotencyStore = new Map<string, IdempotencyRecord>();

  /**
   * Helper to clear idempotency store during automated tests
   */
  public static clearIdempotencyStore(): void {
    CampaignService.idempotencyStore.clear();
  }

  private static pruneIdempotencyStore(): void {
    const cutoff = Date.now() - 15 * 60 * 1000;
    for (const [key, record] of CampaignService.idempotencyStore.entries()) {
      if (record.timestamp < cutoff) {
        CampaignService.idempotencyStore.delete(key);
      }
    }
  }

  /**
   * Helper to ensure the organization exists in database before creating campaigns.
   */
  private async ensureOrganizationExists(organizationId: string): Promise<void> {
    const prisma = getPrismaClient();
    const existing = await prisma.organization.findUnique({
      where: { id: organizationId },
    });

    if (!existing) {
      await prisma.organization.create({
        data: {
          id: organizationId,
          name: "Default Organization",
          slug: `org-${organizationId.toLowerCase()}`,
        },
      });
    }
  }

  /**
   * Lists campaigns scoped to the tenant organization with search, filtering, and pagination.
   */
  public async listCampaigns(
    organizationId: string,
    query: QueryCampaignsInput
  ): Promise<PaginatedResult<unknown>> {
    const prisma = getPrismaClient();
    const {
      search,
      status,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = query;

    // Build scoped where filter
    const where: Prisma.CampaignWhereInput = {
      organizationId,
    };

    if (status && status !== "ALL") {
      where.status = status as CampaignStatus;
    }

    if (search && search.trim() !== "") {
      const searchTrimmed = search.trim();
      where.OR = [
        { name: { contains: searchTrimmed, mode: "insensitive" } },
        { templateName: { contains: searchTrimmed, mode: "insensitive" } },
      ];
    }

    const skip = (page - 1) * limit;

    // Run parallel queries: items, total filtered count, and status breakdown metrics
    const [rawItems, total, statusCounts] = await Promise.all([
      prisma.campaign.findMany({
        where,
        skip,
        take: limit,
        orderBy: {
          [sortBy]: sortOrder,
        },
      }),
      prisma.campaign.count({ where }),
      prisma.campaign.groupBy({
        by: ["status"],
        where: { organizationId },
        _count: { _all: true },
      }),
    ]);

    // Attach tenant-scoped delivery status metrics to each campaign item if messages exist
    let items = rawItems;
    if (
      rawItems.length > 0 &&
      "whatsAppMessage" in prisma &&
      typeof (prisma as any).whatsAppMessage?.groupBy === "function"
    ) {
      try {
        const campaignIds = rawItems.map((c) => c.id);
        const messageStatusCounts = await (prisma as any).whatsAppMessage.groupBy({
          by: ["campaignId", "status"],
          where: {
            organizationId,
            campaignId: { in: campaignIds },
          },
          _count: { _all: true },
        });

        const metricsByCampaign = new Map<
          string,
          { sentCount: number; deliveredCount: number; readCount: number; failedCount: number }
        >();

        for (const group of messageStatusCounts) {
          if (!group.campaignId) continue;
          let entry = metricsByCampaign.get(group.campaignId);
          if (!entry) {
            entry = { sentCount: 0, deliveredCount: 0, readCount: 0, failedCount: 0 };
            metricsByCampaign.set(group.campaignId, entry);
          }
          const count = group._count._all;
          switch (group.status) {
            case MessageDeliveryStatus.READ:
              entry.readCount += count;
              break;
            case MessageDeliveryStatus.DELIVERED:
              entry.deliveredCount += count;
              break;
            case MessageDeliveryStatus.SENT:
            case MessageDeliveryStatus.ACCEPTED:
              entry.sentCount += count;
              break;
            case MessageDeliveryStatus.FAILED:
              entry.failedCount += count;
              break;
          }
        }

        items = rawItems.map((item) => {
          const metrics = metricsByCampaign.get(item.id);
          return {
            ...item,
            sentCount: metrics?.sentCount ?? 0,
            deliveredCount: metrics?.deliveredCount ?? 0,
            readCount: metrics?.readCount ?? 0,
            failedCount: metrics?.failedCount ?? 0,
          } as typeof item;
        });
      } catch {
        // Fallback to raw items if groupBy fails
      }
    }

    // Aggregate metrics summary for the tenant
    const metrics = {
      total: 0,
      draft: 0,
      scheduled: 0,
      sending: 0,
      completed: 0,
      failed: 0,
      cancelled: 0,
    };

    for (const group of statusCounts) {
      const count = group._count._all;
      metrics.total += count;
      switch (group.status) {
        case CampaignStatus.DRAFT:
          metrics.draft = count;
          break;
        case CampaignStatus.SCHEDULED:
          metrics.scheduled = count;
          break;
        case CampaignStatus.SENDING:
        case CampaignStatus.QUEUED:
          metrics.sending += count;
          break;
        case CampaignStatus.COMPLETED:
          metrics.completed = count;
          break;
        case CampaignStatus.FAILED:
          metrics.failed = count;
          break;
        case CampaignStatus.CANCELLED:
          metrics.cancelled = count;
          break;
      }
    }

    const totalPages = Math.ceil(total / limit) || 1;

    return {
      items,
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      metrics,
    };
  }

  /**
   * Creates a new campaign draft scoped to the tenant organization.
   * Protects against duplicate submissions and validates audience / template eligibility.
   */
  public async createCampaign(
    organizationId: string,
    input: CreateCampaignInput,
    userId = "system_user"
  ): Promise<unknown> {
    const prisma = getPrismaClient();
    await this.ensureOrganizationExists(organizationId);

    const { clientRequestId } = input;
    const idempotencyKey = clientRequestId ? `${organizationId}:${clientRequestId}` : null;

    if (idempotencyKey) {
      const cached = CampaignService.idempotencyStore.get(idempotencyKey);
      if (cached && Date.now() - cached.timestamp < 15 * 60 * 1000) {
        return cached.campaign;
      }
    } else {
      // Fallback safeguard for requests without clientRequestId: Check if an identical draft was created within 5 seconds
      const recentDuplicate = await prisma.campaign.findFirst({
        where: {
          organizationId,
          name: input.name,
          templateId: input.templateId,
          status: CampaignStatus.DRAFT,
          createdAt: {
            gte: new Date(Date.now() - 5000),
          },
        },
      });

      if (recentDuplicate) {
        return recentDuplicate;
      }
    }

    // 1. Audience validation & eligible recipient calculation
    let calculatedRecipients = input.totalRecipients || 0;
    if (input.audienceType === "CONTACT_LIST" && input.audienceId) {
      if ("contactList" in prisma && typeof (prisma as any).contactList?.findFirst === "function") {
        const audienceList = await (prisma as any).contactList.findFirst({
          where: { id: input.audienceId, organizationId },
        });
        if (!audienceList) {
          throw new NotFoundError(
            `Audience contact list with ID '${input.audienceId}' not found for this organization.`
          );
        }

        // Count only eligible contacts (OPTED_IN and not suppressed)
        if ("contactListMember" in prisma && typeof (prisma as any).contactListMember?.count === "function") {
          try {
            calculatedRecipients = await (prisma as any).contactListMember.count({
              where: {
                organizationId,
                listId: input.audienceId,
                contact: {
                  consentStatus: "OPTED_IN",
                  isSuppressed: false,
                },
              },
            });
          } catch {
            // Keep calculatedRecipients as provided in unit tests
          }
        }
      }
    }

    // 2. Template sendability and variable parameter validation
    if (input.templateName) {
      if (!isAllowedTestTemplate(input.templateName)) {
        throw new BadRequestError(
          `Template '${input.templateName}' is not in the testing allowlist. Allowed templates: ${getAllowedTestTemplates().join(", ")}`
        );
      }
      try {
        const template = await whatsappTemplateService.getTemplateByName(
          input.templateName,
          organizationId
        );
        if (template) {
          if (!template.isSendable) {
            throw new BadRequestError(
              `Template '${input.templateName}' is in ${template.status} status on Meta and cannot be selected. Only APPROVED templates can be used for campaign drafts.`
            );
          }

          if (input.variablesMapping && Object.keys(input.variablesMapping).length > 0) {
            const validation = whatsappTemplateService.validateTemplateVariables(
              template,
              input.variablesMapping as Record<string, string>
            );
            if (!validation.isValid) {
              const errMsgs = Object.values(validation.errors).join("; ");
              throw new BadRequestError(
                `Template parameter validation failed for '${input.templateName}': ${errMsgs}`
              );
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof BadRequestError) throw err;
      }
    }

    // Convert variablesMapping to JSON
    const variablesMapping = (input.variablesMapping || {}) as Prisma.InputJsonValue;

    const scheduledDate = input.scheduledAt ? new Date(input.scheduledAt) : null;
    if (scheduledDate && scheduledDate.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      throw new BadRequestError("Scheduled time must be a future timestamp at least 5 minutes ahead.");
    }
    const approvalStatus = scheduledDate
      ? CampaignApprovalStatus.PENDING
      : CampaignApprovalStatus.NOT_REQUIRED;

    const campaign = await prisma.campaign.create({
      data: {
        organizationId,
        name: input.name,
        description: input.description || null,
        status: CampaignStatus.DRAFT,
        approvalStatus: approvalStatus as any,
        dispatchRun: 1,
        templateId: input.templateId,
        templateName: input.templateName,
        templateLanguage: input.templateLanguage || "en_US",
        templateCategory: input.templateCategory || "MARKETING",
        variablesMapping,
        audienceType: input.audienceType as AudienceType,
        audienceId: input.audienceId || null,
        audienceName: input.audienceName || "All Audience",
        totalRecipients: calculatedRecipients,
        scheduledAt: scheduledDate,
        createdBy: userId,
      },
    });

    if (idempotencyKey) {
      CampaignService.idempotencyStore.set(idempotencyKey, {
        campaign,
        timestamp: Date.now(),
      });
      CampaignService.pruneIdempotencyStore();
    }

    return campaign;
  }

  /**
   * Retrieves a single campaign by ID scoped to the tenant organization.
   * Aggregates message delivery metrics from WhatsAppMessage records for this campaign and organization.
   *
   * Status Mappings (strictly non-overlapping to avoid double counting):
   * - readCount: Messages with status READ (verified opened by recipient)
   * - deliveredCount: Messages with status DELIVERED (verified received on device)
   * - sentCount: Messages with status SENT or ACCEPTED (in transit or accepted by WhatsApp gateway)
   * - failedCount: Messages with status FAILED (terminal or rejection failures)
   */
  public async getCampaignById(
    organizationId: string,
    id: string
  ): Promise<unknown> {
    const prisma = getPrismaClient();
    const campaign = await prisma.campaign.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    // Tenant-scoped aggregation of WhatsAppMessage delivery statuses
    const deliveryMetrics = {
      sentCount: 0,
      deliveredCount: 0,
      readCount: 0,
      failedCount: 0,
    };

    if ("whatsAppMessage" in prisma && typeof (prisma as any).whatsAppMessage?.groupBy === "function") {
      try {
        const messageStatusCounts = await (prisma as any).whatsAppMessage.groupBy({
          by: ["status"],
          where: {
            campaignId: id,
            organizationId,
          },
          _count: { _all: true },
        });

        for (const group of messageStatusCounts) {
          const count = group._count._all;
          switch (group.status) {
            case MessageDeliveryStatus.READ:
              deliveryMetrics.readCount += count;
              break;
            case MessageDeliveryStatus.DELIVERED:
              deliveryMetrics.deliveredCount += count;
              break;
            case MessageDeliveryStatus.SENT:
            case MessageDeliveryStatus.ACCEPTED:
              deliveryMetrics.sentCount += count;
              break;
            case MessageDeliveryStatus.FAILED:
              deliveryMetrics.failedCount += count;
              break;
          }
        }
      } catch {
        // Fallback or empty if table/mock query fails
      }
    }

    return {
      ...campaign,
      sentCount: deliveryMetrics.sentCount,
      deliveredCount: deliveryMetrics.deliveredCount,
      readCount: deliveryMetrics.readCount,
      failedCount: deliveryMetrics.failedCount,
    };
  }

  /**
   * Retrieves paginated per-message delivery records for a specific campaign,
   * strictly scoped to the tenant organization. Masks recipient phone numbers for privacy.
   */
  public async getCampaignMessages(
    organizationId: string,
    campaignId: string,
    options?: { page?: number; limit?: number; status?: MessageDeliveryStatus }
  ): Promise<{
    items: Array<{
      id: string;
      recipientPhoneMasked: string;
      status: MessageDeliveryStatus;
      attemptCount: number;
      wamidMasked: string | null;
      sentAt: Date | null;
      deliveredAt: Date | null;
      readAt: Date | null;
      failedAt: Date | null;
      errorMessage: string | null;
      createdAt: Date;
    }>;
    total: number;
    page: number;
    limit: number;
    totalPages: number;
  }> {
    const prisma = getPrismaClient();

    // 1. Verify campaign existence and tenant ownership
    const campaign = await prisma.campaign.findFirst({
      where: {
        id: campaignId,
        organizationId,
      },
    });

    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${campaignId}' not found`);
    }

    const page = Math.max(1, options?.page ?? 1);
    const limit = Math.min(100, Math.max(1, options?.limit ?? 50));
    const skip = (page - 1) * limit;

    const where: Prisma.WhatsAppMessageWhereInput = {
      campaignId,
      organizationId,
      ...(options?.status ? { status: options.status } : {}),
    };

    const [total, messages] = await Promise.all([
      prisma.whatsAppMessage.count({ where }),
      prisma.whatsAppMessage.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip,
        take: limit,
        select: {
          id: true,
          recipientPhone: true,
          status: true,
          attemptCount: true,
          wamid: true,
          sentAt: true,
          deliveredAt: true,
          readAt: true,
          failedAt: true,
          errorMessage: true,
          createdAt: true,
        },
      }),
    ]);

    const items = messages.map((m) => {
      const p = m.recipientPhone || "";
      const recipientPhoneMasked =
        p.length > 5 ? `${p.slice(0, 5)}***${p.slice(-2)}` : "***";
      const wamidMasked =
        m.wamid && m.wamid.length > 15
          ? `${m.wamid.slice(0, 15)}...${m.wamid.slice(-6)}`
          : m.wamid;

      return {
        id: m.id,
        recipientPhoneMasked,
        status: m.status,
        attemptCount: m.attemptCount,
        wamidMasked,
        sentAt: m.sentAt,
        deliveredAt: m.deliveredAt,
        readAt: m.readAt,
        failedAt: m.failedAt,
        errorMessage: m.errorMessage,
        createdAt: m.createdAt,
      };
    });

    return {
      items,
      total,
      page,
      limit,
      totalPages: Math.ceil(total / limit) || 1,
    };
  }

  /**
   * Updates an existing campaign draft.
   * Enforces that only campaigns in DRAFT status can be modified.
   */
  public async updateCampaign(
    organizationId: string,
    id: string,
    input: UpdateCampaignInput
  ): Promise<unknown> {
    const prisma = getPrismaClient();

    // Verify campaign existence and tenant ownership
    const existing = await prisma.campaign.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    // Safeguard: Only DRAFT or SCHEDULED campaigns can be modified
    if (
      existing.status !== CampaignStatus.DRAFT &&
      existing.status !== CampaignStatus.SCHEDULED
    ) {
      throw new BadRequestError(
        `Campaign with status '${existing.status}' cannot be modified. Only DRAFT campaigns can be edited (or SCHEDULED campaigns before dispatch).`
      );
    }

    // 1. Audience validation & eligible recipient recalculation
    const audType = input.audienceType ?? existing.audienceType;
    const audId = input.audienceId !== undefined ? input.audienceId : existing.audienceId;
    let totalRecipients = input.totalRecipients !== undefined ? input.totalRecipients : existing.totalRecipients;

    if (audType === "CONTACT_LIST" && audId) {
      if ("contactList" in prisma && typeof (prisma as any).contactList?.findFirst === "function") {
        const audienceList = await (prisma as any).contactList.findFirst({
          where: { id: audId, organizationId },
        });
        if (!audienceList) {
          throw new NotFoundError(
            `Audience contact list with ID '${audId}' not found for this organization.`
          );
        }

        if ("contactListMember" in prisma && typeof (prisma as any).contactListMember?.count === "function") {
          try {
            totalRecipients = await (prisma as any).contactListMember.count({
              where: {
                organizationId,
                listId: audId,
                contact: {
                  consentStatus: "OPTED_IN",
                  isSuppressed: false,
                },
              },
            });
          } catch {
            // Keep existing/input totalRecipients in tests
          }
        }
      }
    }

    // 2. Template sendability and variable parameter validation
    const tplName = input.templateName ?? existing.templateName;
    if (tplName) {
      if (!isAllowedTestTemplate(tplName)) {
        throw new BadRequestError(
          `Template '${tplName}' is not in the testing allowlist. Allowed templates: ${getAllowedTestTemplates().join(", ")}`
        );
      }
      try {
        const template = await whatsappTemplateService.getTemplateByName(
          tplName,
          organizationId
        );
        if (template) {
          if (!template.isSendable) {
            throw new BadRequestError(
              `Template '${tplName}' is in ${template.status} status on Meta and cannot be selected. Only APPROVED templates can be used for campaign drafts.`
            );
          }

          const vars = input.variablesMapping ?? (existing.variablesMapping as Record<string, unknown>);
          if (vars && Object.keys(vars).length > 0) {
            const validation = whatsappTemplateService.validateTemplateVariables(
              template,
              vars as Record<string, string>
            );
            if (!validation.isValid) {
              const errMsgs = Object.values(validation.errors).join("; ");
              throw new BadRequestError(
                `Template parameter validation failed for '${tplName}': ${errMsgs}`
              );
            }
          }
        }
      } catch (err: unknown) {
        if (err instanceof BadRequestError) throw err;
      }
    }

    // Schedule-clear barrier:
    // A campaign in PENDING or REJECTED cannot have scheduledAt set to null to convert to Send Now
    const existingApproval = (existing as any).approvalStatus || CampaignApprovalStatus.NOT_REQUIRED;
    const isPendingOrRejected =
      existingApproval === CampaignApprovalStatus.PENDING ||
      existingApproval === CampaignApprovalStatus.REJECTED;

    if (isPendingOrRejected && input.scheduledAt === null) {
      throw new BadRequestError(
        "Scheduled campaigns in pending review or rejected status cannot be converted to Send Now. Please submit a valid future schedule."
      );
    }

    // If resubmitting a rejected campaign:
    const isResubmittingRejected = existingApproval === CampaignApprovalStatus.REJECTED;
    if (isResubmittingRejected) {
      const targetSchedule = input.scheduledAt !== undefined ? input.scheduledAt : (existing.scheduledAt ? existing.scheduledAt.toISOString() : null);
      if (!targetSchedule || new Date(targetSchedule).getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
        throw new BadRequestError(
          "Resubmitting a rejected campaign requires a valid future scheduled timestamp (at least 5 minutes ahead)."
        );
      }
    }

    // Check for material changes on an APPROVED campaign:
    const isCurrentlyApproved = existingApproval === CampaignApprovalStatus.APPROVED;
    let isMaterialChange = false;

    if (input.templateName !== undefined && input.templateName !== existing.templateName) isMaterialChange = true;
    if (input.templateId !== undefined && input.templateId !== existing.templateId) isMaterialChange = true;
    if (input.templateLanguage !== undefined && input.templateLanguage !== existing.templateLanguage) isMaterialChange = true;
    if (input.audienceId !== undefined && input.audienceId !== existing.audienceId) isMaterialChange = true;
    if (input.audienceType !== undefined && input.audienceType !== existing.audienceType) isMaterialChange = true;
    if (input.variablesMapping !== undefined && JSON.stringify(input.variablesMapping) !== JSON.stringify(existing.variablesMapping)) isMaterialChange = true;
    if (input.scheduledAt !== undefined) {
      const oldTime = existing.scheduledAt ? new Date(existing.scheduledAt).getTime() : null;
      const newTime = input.scheduledAt ? new Date(input.scheduledAt).getTime() : null;
      if (oldTime !== newTime) isMaterialChange = true;
    }

    const data: Prisma.CampaignUpdateInput = {};

    if (input.name !== undefined) data.name = input.name;
    if (input.description !== undefined) data.description = input.description;
    if (input.templateId !== undefined) data.templateId = input.templateId;
    if (input.templateName !== undefined) data.templateName = input.templateName;
    if (input.templateLanguage !== undefined) data.templateLanguage = input.templateLanguage;
    if (input.templateCategory !== undefined) data.templateCategory = input.templateCategory;
    if (input.variablesMapping !== undefined) {
      data.variablesMapping = input.variablesMapping as Prisma.InputJsonValue;
    }
    if (input.audienceType !== undefined) {
      data.audienceType = input.audienceType as AudienceType;
    }
    if (input.audienceId !== undefined) data.audienceId = input.audienceId;
    if (input.audienceName !== undefined) data.audienceName = input.audienceName;
    data.totalRecipients = totalRecipients;

    if (input.scheduledAt !== undefined) {
      if (input.scheduledAt) {
        const scheduledDate = new Date(input.scheduledAt);
        if (scheduledDate.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
          throw new BadRequestError("Scheduled time must be a future timestamp at least 5 minutes ahead.");
        }
        data.scheduledAt = scheduledDate;
        if (!isCurrentlyApproved || isMaterialChange) {
          data.status = CampaignStatus.DRAFT;
          (data as any).approvalStatus = CampaignApprovalStatus.PENDING;
        }
      } else {
        data.scheduledAt = null;
        data.status = CampaignStatus.DRAFT;
      }
    }

    if (isResubmittingRejected) {
      data.status = CampaignStatus.DRAFT;
      (data as any).approvalStatus = CampaignApprovalStatus.PENDING;
      (data as any).rejectionReason = null;
      (data as any).rejectedAt = null;
      (data as any).rejectedBy = null;
      (data as any).dispatchRun = ((existing as any).dispatchRun || 1) + 1;
      await this.cleanupObsoleteCampaignJobs(organizationId, id, "CAMPAIGN_RESUBMITTED");
    } else if (isCurrentlyApproved && isMaterialChange) {
      data.status = CampaignStatus.DRAFT;
      (data as any).approvalStatus = CampaignApprovalStatus.PENDING;
      (data as any).approvedAt = null;
      (data as any).approvedBy = null;
      (data as any).approvalNotes = null;
      (data as any).dispatchRun = ((existing as any).dispatchRun || 1) + 1;
      await this.cleanupObsoleteCampaignJobs(organizationId, id, "CAMPAIGN_REVISED");
    }

    const updated = await prisma.campaign.update({
      where: { id },
      data,
    });

    return updated;
  }

  /**
   * Schedules an existing campaign draft for future dispatch.
   */
  public async scheduleCampaign(
    organizationId: string,
    id: string,
    scheduledAt: string
  ): Promise<unknown> {
    const prisma = getPrismaClient();

    if (!scheduledAt) {
      throw new BadRequestError("scheduledAt timestamp is required to schedule a campaign");
    }

    const scheduledDate = new Date(scheduledAt);
    if (isNaN(scheduledDate.getTime())) {
      throw new BadRequestError("Invalid scheduledAt timestamp format. Expected ISO-8601 string.");
    }

    if (scheduledDate.getTime() < Date.now() + MIN_SCHEDULE_LEAD_MS) {
      throw new BadRequestError("Scheduled time must be a future timestamp at least 5 minutes ahead.");
    }

    const existing = await prisma.campaign.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    if (
      existing.status !== CampaignStatus.DRAFT &&
      existing.status !== CampaignStatus.SCHEDULED
    ) {
      throw new BadRequestError(
        `Cannot schedule campaign with status '${existing.status}'. Only DRAFT or SCHEDULED campaigns can be scheduled.`
      );
    }

    // Revalidate template sendability
    if (!isAllowedTestTemplate(existing.templateName)) {
      throw new BadRequestError(`Template '${existing.templateName}' is not in the testing allowlist.`);
    }

    const template = await whatsappTemplateService.getTemplateByName(existing.templateName, organizationId);
    if (!template || !template.isSendable) {
      throw new BadRequestError(`Template '${existing.templateName}' is not APPROVED on Meta.`);
    }

    // Revalidate audience
    if (existing.audienceType === "MOCK" || !existing.audienceId) {
      throw new BadRequestError("Cannot schedule campaign with simulated demo audience. Attach a verified contact list.");
    }

    // Clean up any previously queued messages/jobs if campaign was previously approved/queued
    await this.cleanupObsoleteCampaignJobs(organizationId, id, "CAMPAIGN_RESCHEDULED");

    const updated = await prisma.campaign.update({
      where: { id },
      data: {
        scheduledAt: scheduledDate,
        status: CampaignStatus.DRAFT,
        approvalStatus: CampaignApprovalStatus.PENDING as any,
        approvedAt: null,
        approvedBy: null,
        approvalNotes: null,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null,
        dispatchRun: ((existing as any).dispatchRun || 1) + 1,
      },
    });

    return updated;
  }

  /**
   * Helper to clean up any obsolete queued WhatsApp messages and BullMQ delayed jobs
   * when a campaign is revised, rejected, or approval is invalidated.
   */
  public async cleanupObsoleteCampaignJobs(
    organizationId: string,
    campaignId: string,
    reason: string
  ): Promise<void> {
    const prisma = getPrismaClient();
    try {
      if ("whatsAppMessage" in prisma && typeof (prisma as any).whatsAppMessage?.updateMany === "function") {
        await (prisma as any).whatsAppMessage.updateMany({
          where: {
            campaignId,
            organizationId,
            status: MessageDeliveryStatus.QUEUED,
          },
          data: {
            status: MessageDeliveryStatus.FAILED,
            errorCode: reason,
            errorMessage: `Dispatch cancelled: ${reason}`,
            isTerminalFailure: true,
            failedAt: new Date(),
          },
        });
      }

      if (isRedisConfigured() && "whatsAppMessage" in prisma && typeof (prisma as any).whatsAppMessage?.findMany === "function") {
        const queuedMessages = await (prisma as any).whatsAppMessage.findMany({
          where: { campaignId, organizationId },
          select: { id: true },
        });
        for (const msg of queuedMessages) {
          await removeWhatsAppDispatchJob(msg.id);
        }
      }
    } catch (cleanupErr) {
      logger.warn(
        `[JobCleanup] Warning cleaning up jobs for campaign ${campaignId}: ${(cleanupErr as Error)?.message}`
      );
    }
  }

  /**
   * Approves a scheduled campaign for dispatch.
   * Requires Delegated Admin assigned to the organization, or Master Admin override.
   */
  public async approveCampaign(
    organizationId: string,
    id: string,
    reviewerId: string,
    notes?: string | null
  ): Promise<unknown> {
    const prisma = getPrismaClient();

    const existing = await prisma.campaign.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    if ((existing as any).approvalStatus === CampaignApprovalStatus.APPROVED) {
      return existing; // idempotent
    }

    if ((existing as any).approvalStatus !== CampaignApprovalStatus.PENDING) {
      throw new BadRequestError(
        `Cannot approve campaign with approval status '${(existing as any).approvalStatus}'. Only PENDING campaigns can be approved.`
      );
    }

    if (!existing.scheduledAt) {
      throw new BadRequestError("Cannot approve a campaign that does not have a scheduled dispatch timestamp.");
    }

    // Schedule-time check: Must still be strictly in the future
    const scheduledTime = new Date(existing.scheduledAt).getTime();
    if (scheduledTime <= Date.now() + 30000) {
      throw new BadRequestError(
        "Scheduled dispatch time has already passed or is within 30 seconds. The customer must choose a new future schedule before approval."
      );
    }

    // Validate template is still sendable / APPROVED on Meta
    const template = await whatsappTemplateService.getTemplateByName(
      existing.templateName,
      organizationId
    );
    if (!template || !template.isSendable) {
      throw new BadRequestError(
        `Template '${existing.templateName}' is not APPROVED on Meta. Campaign cannot be approved.`
      );
    }

    // Atomic CAS transition: only update if still PENDING
    const result = await prisma.campaign.updateMany({
      where: {
        id,
        organizationId,
        approvalStatus: CampaignApprovalStatus.PENDING as any,
      },
      data: {
        approvalStatus: CampaignApprovalStatus.APPROVED as any,
        status: CampaignStatus.SCHEDULED,
        approvedAt: new Date(),
        approvedBy: reviewerId,
        approvalNotes: notes || null,
        rejectionReason: null,
        rejectedAt: null,
        rejectedBy: null,
      },
    });

    if (result.count === 0) {
      throw new ConflictError("Campaign state changed concurrently. Please reload and try again.");
    }

    logger.info(
      `[CampaignApproval] Campaign ${id} (${existing.name}) approved by ${reviewerId} for org ${organizationId}`
    );

    return await prisma.campaign.findFirst({ where: { id, organizationId } });
  }

  /**
   * Rejects a scheduled campaign with mandatory reason.
   */
  public async rejectCampaign(
    organizationId: string,
    id: string,
    reviewerId: string,
    reason: string
  ): Promise<unknown> {
    const prisma = getPrismaClient();

    if (!reason || reason.trim().length < 3) {
      throw new BadRequestError("A meaningful rejection reason (minimum 3 characters) is required.");
    }

    const existing = await prisma.campaign.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    if (
      existing.status === CampaignStatus.SENDING ||
      existing.status === CampaignStatus.COMPLETED
    ) {
      throw new BadRequestError(
        `Cannot reject campaign with status '${existing.status}'. Dispatch has already begun or completed.`
      );
    }

    // Atomic CAS transition: only update if PENDING or APPROVED
    const result = await prisma.campaign.updateMany({
      where: {
        id,
        organizationId,
        approvalStatus: {
          in: [CampaignApprovalStatus.PENDING, CampaignApprovalStatus.APPROVED] as any,
        },
      },
      data: {
        approvalStatus: CampaignApprovalStatus.REJECTED as any,
        status: CampaignStatus.DRAFT,
        rejectedAt: new Date(),
        rejectedBy: reviewerId,
        rejectionReason: reason.trim(),
      },
    });

    if (result.count === 0) {
      if ((existing as any).approvalStatus === CampaignApprovalStatus.REJECTED) {
        return existing; // idempotent
      }
      throw new ConflictError("Campaign state changed concurrently. Please reload and try again.");
    }

    // Clean up any pre-enqueued messages/jobs if it was previously approved
    await this.cleanupObsoleteCampaignJobs(organizationId, id, "CAMPAIGN_REJECTED");

    logger.info(
      `[CampaignRejection] Campaign ${id} (${existing.name}) rejected by ${reviewerId} for org ${organizationId}: ${reason.trim()}`
    );

    return await prisma.campaign.findFirst({ where: { id, organizationId } });
  }

  /**
   * Cancels a scheduled or draft campaign before dispatch begins.
   */
  public async cancelCampaign(
    organizationId: string,
    id: string
  ): Promise<unknown> {
    const prisma = getPrismaClient();

    const existing = await prisma.campaign.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    if (existing.status === CampaignStatus.CANCELLED) {
      return existing; // idempotent
    }

    if (
      existing.status === CampaignStatus.SENDING ||
      existing.status === CampaignStatus.COMPLETED
    ) {
      throw new BadRequestError(
        `Cannot cancel campaign with status '${existing.status}'. Dispatch has already started or completed.`
      );
    }

    // If campaign is QUEUED: only allow cancellation if it was pre-enqueued and scheduled dispatch time has not arrived
    if (existing.status === CampaignStatus.QUEUED) {
      const now = Date.now();
      const isPreEnqueuedScheduled =
        existing.scheduledAt && new Date(existing.scheduledAt).getTime() > now;

      if (!isPreEnqueuedScheduled) {
        throw new BadRequestError(
          `Cannot cancel campaign with status '${existing.status}'. Dispatch has already started or completed.`
        );
      }
    }

    // Atomic CAS transition: only cancel if campaign is still in DRAFT, SCHEDULED, or QUEUED
    const updateResult = await prisma.campaign.updateMany({
      where: {
        id,
        organizationId,
        status: {
          in: [CampaignStatus.DRAFT, CampaignStatus.SCHEDULED, CampaignStatus.QUEUED],
        },
      },
      data: {
        status: CampaignStatus.CANCELLED,
        completedAt: new Date(),
      },
    });

    if (updateResult.count === 0) {
      throw new BadRequestError(
        `Cannot cancel campaign with status '${existing.status}'. Dispatch has already started or completed.`
      );
    }

    // Clean up any pre-enqueued messages and remove delayed BullMQ jobs
    try {
      if ("whatsAppMessage" in prisma && typeof (prisma as any).whatsAppMessage?.updateMany === "function") {
        await (prisma as any).whatsAppMessage.updateMany({
          where: {
            campaignId: id,
            organizationId,
            status: {
              in: [MessageDeliveryStatus.QUEUED, MessageDeliveryStatus.SENDING],
            },
          },
          data: {
            status: MessageDeliveryStatus.FAILED,
            errorCode: "CAMPAIGN_CANCELLED",
            errorMessage: "Campaign was cancelled before scheduled dispatch",
            isTerminalFailure: true,
            failedAt: new Date(),
          },
        });
      }

      if (isRedisConfigured() && "whatsAppMessage" in prisma && typeof (prisma as any).whatsAppMessage?.findMany === "function") {
        const queuedMessages = await (prisma as any).whatsAppMessage.findMany({
          where: { campaignId: id, organizationId },
          select: { id: true },
        });
        for (const msg of queuedMessages) {
          await removeWhatsAppDispatchJob(msg.id);
        }
      }
    } catch (cleanupErr) {
      logger.warn(
        `[CampaignCancel] Cleanup warning for cancelled campaign ${id}: ${(cleanupErr as Error)?.message}`
      );
    }

    const updated = await prisma.campaign.findFirst({
      where: { id, organizationId },
    });

    return updated || existing;
  }

  /**
   * Duplicates an existing campaign into an independent new DRAFT record.
   */
  public async duplicateCampaign(
    organizationId: string,
    id: string,
    userId = "system_user"
  ): Promise<unknown> {
    const prisma = getPrismaClient();

    const original = await prisma.campaign.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!original) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    // Append copy identifier to name
    const duplicatedName = `${original.name} (Copy)`.slice(0, 100);

    const duplicated = await prisma.campaign.create({
      data: {
        organizationId,
        name: duplicatedName,
        description: original.description,
        status: CampaignStatus.DRAFT,
        templateId: original.templateId,
        templateName: original.templateName,
        templateLanguage: original.templateLanguage,
        templateCategory: original.templateCategory,
        variablesMapping: original.variablesMapping as Prisma.InputJsonValue,
        audienceType: original.audienceType,
        audienceId: original.audienceId,
        audienceName: original.audienceName,
        totalRecipients: original.totalRecipients,
        scheduledAt: null, // Clear schedule on duplicated draft
        startedAt: null,
        completedAt: null,
        createdBy: userId,
      },
    });

    return duplicated;
  }

  /**
   * Deletes a campaign draft.
   * Enforces that only DRAFT campaigns can be deleted.
   */
  public async deleteCampaign(
    organizationId: string,
    id: string
  ): Promise<{ id: string; name: string; deleted: true }> {
    const prisma = getPrismaClient();

    const existing = await prisma.campaign.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!existing) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    // Safeguard: Only DRAFT campaigns can be deleted
    if (existing.status !== CampaignStatus.DRAFT) {
      throw new BadRequestError(
        `Campaign with status '${existing.status}' cannot be deleted. Only DRAFT campaigns can be removed.`
      );
    }

    await prisma.campaign.delete({
      where: { id },
    });

    return {
      id,
      name: existing.name,
      deleted: true,
    };
  }

  /**
   * Prepares and dispatches a campaign to its eligible audience members.
   * - Enforces tenant isolation and validates campaign status (DRAFT or SCHEDULED).
   * - Verifies that the template is currently APPROVED and sendable on Meta.
   * - Queries audience contacts, filtering for consentStatus = OPTED_IN and isSuppressed = false.
   * - Normalizes and validates E.164 phone numbers.
   * - Resolves dynamic template variables per contact (excluding contacts missing required fields).
   * - Idempotently creates WhatsAppMessage records with status QUEUED and stable clientRequestId.
   * - Enqueues dispatch jobs into BullMQ with deterministic job IDs (msg_${id}).
   * - Transitions campaign status to QUEUED and sets startedAt.
   */
  public async launchCampaign(
    organizationId: string,
    id: string
  ): Promise<CampaignDispatchSummary> {
    const prisma = getPrismaClient();

    // 1. Verify campaign existence and tenant ownership
    const campaign = await prisma.campaign.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    // 2. Validate campaign source status & approval gate
    if (
      campaign.status === CampaignStatus.COMPLETED ||
      campaign.status === CampaignStatus.CANCELLED ||
      campaign.status === CampaignStatus.FAILED
    ) {
      throw new BadRequestError(
        `Cannot launch campaign with status '${campaign.status}'. Only DRAFT, SCHEDULED, or active campaigns can be launched.`
      );
    }

    // Approval gate:
    // Only scheduled campaigns require approval; legitimate Send Now campaigns are approval-exempt.
    const isApprovalExempt =
      !campaign.scheduledAt &&
      ((campaign as any).approvalStatus === CampaignApprovalStatus.NOT_REQUIRED ||
        !(campaign as any).approvalStatus);

    if (!isApprovalExempt) {
      if ((campaign as any).approvalStatus !== CampaignApprovalStatus.APPROVED) {
        throw new ForbiddenError(
          `Cannot launch campaign '${campaign.name}'. Scheduled campaigns require Delegated Admin approval prior to launch (current approval status: ${(campaign as any).approvalStatus || "PENDING"}).`
        );
      }
    }

    // 3. Verify template is in testing allowlist, exists, and is APPROVED / sendable on Meta
    if (!isAllowedTestTemplate(campaign.templateName)) {
      throw new BadRequestError(
        `Template '${campaign.templateName}' is not in the testing allowlist. Allowed templates: ${getAllowedTestTemplates().join(", ")}`
      );
    }

    const template = await whatsappTemplateService.getTemplateByName(
      campaign.templateName,
      organizationId
    );

    if (!template) {
      throw new BadRequestError(
        `Template '${campaign.templateName}' not found or inaccessible for this organization.`
      );
    }

    if (!template.isSendable) {
      throw new BadRequestError(
        `Template '${campaign.templateName}' is in ${template.status} status on Meta. Only APPROVED templates can be launched.`
      );
    }

    // 3b. Strictly validate mapped parameters against Meta template contract before querying audience or creating messages
    const mappingValidation = validateCampaignTemplateMapping(
      template,
      campaign.variablesMapping as Record<string, unknown>
    );

    if (!mappingValidation.valid) {
      throw new BadRequestError(
        mappingValidation.error ||
          "Template parameter mapping failed validation against Meta template contract"
      );
    }

    // 4. Verify audience configuration
    if (campaign.audienceType === "MOCK" || !campaign.audienceId) {
      throw new BadRequestError(
        "Cannot launch campaign with simulated demo audience. Attach a verified contact list to send."
      );
    }

    const members = await prisma.contactListMember.findMany({
      where: {
        organizationId,
        listId: campaign.audienceId,
      },
      include: {
        contact: true,
      },
      orderBy: { addedAt: "asc" },
    });

    if (members.length === 0) {
      throw new BadRequestError(
        "Target contact list has no members. Add contacts to the audience list before launching."
      );
    }

    // 5. Query existing message records for this campaign run to guarantee idempotency
    const dispatchRun = (campaign as any).dispatchRun || 1;
    const existingMessages = await prisma.whatsAppMessage.findMany({
      where: {
        organizationId,
        campaignId: campaign.id,
        dispatchRun,
      },
      select: {
        id: true,
        contactId: true,
        status: true,
        recipientPhone: true,
        templateName: true,
        templateLanguage: true,
        parameters: true,
      },
    });

    const existingByContactId = new Map(
      existingMessages.filter((m) => m.contactId).map((m) => [m.contactId!, m])
    );

    let eligibleCount = 0;
    let queuedCount = 0;
    let alreadyPreparedCount = 0;
    let excludedConsentCount = 0;
    let excludedSuppressedCount = 0;
    let excludedPhoneCount = 0;
    let excludedVariablesCount = 0;
    const sampleExclusions: Array<{ contactId: string; reason: string }> = [];

    const messagesToEnqueue: Array<{
      id: string;
      recipientPhone: string;
      templateName: string;
      templateLanguage: string;
      parameters: Record<string, unknown>;
      contactId: string | null;
    }> = [];

    // 6. Process audience members with strict eligibility and parameter validation
    for (const member of members) {
      const contact = member.contact;
      if (!contact) continue;

      // Check opt-in consent
      if (contact.consentStatus !== ConsentStatus.OPTED_IN) {
        excludedConsentCount++;
        if (sampleExclusions.length < 10) {
          sampleExclusions.push({
            contactId: contact.id,
            reason: `Consent status is '${contact.consentStatus}'; must be OPTED_IN`,
          });
        }
        continue;
      }

      // Check suppression
      if (contact.isSuppressed) {
        excludedSuppressedCount++;
        if (sampleExclusions.length < 10) {
          sampleExclusions.push({
            contactId: contact.id,
            reason: `Suppressed: ${contact.suppressionReason || "Recipient opt-out / suppression list"}`,
          });
        }
        continue;
      }

      // Validate E.164 phone formatting
      const phoneNorm = normalizePhoneNumber(contact.phoneNumber);
      if (!phoneNorm.valid || !phoneNorm.e164) {
        excludedPhoneCount++;
        if (sampleExclusions.length < 10) {
          sampleExclusions.push({
            contactId: contact.id,
            reason: `Invalid phone number format: ${phoneNorm.error || "Must be valid E.164"}`,
          });
        }
        continue;
      }

      // Resolve contact-specific template parameters
      const paramResult = resolveContactTemplateParameters(
        campaign.templateName,
        campaign.variablesMapping as Record<string, unknown>,
        contact
      );

      if (!paramResult.success || !paramResult.parameters) {
        excludedVariablesCount++;
        if (sampleExclusions.length < 10) {
          sampleExclusions.push({
            contactId: contact.id,
            reason: paramResult.error || "Failed to resolve required template variables",
          });
        }
        continue;
      }

      // Contact is fully eligible
      eligibleCount++;

      // Check if message was already created in a previous launch run
      const existing = existingByContactId.get(contact.id);
      if (existing) {
        alreadyPreparedCount++;
        if (existing.status === MessageDeliveryStatus.QUEUED) {
          messagesToEnqueue.push({
            id: existing.id,
            recipientPhone: existing.recipientPhone,
            templateName: existing.templateName,
            templateLanguage: existing.templateLanguage,
            parameters: existing.parameters as Record<string, unknown>,
            contactId: existing.contactId,
          });
        }
        continue;
      }

      // Create new message record with deterministic clientRequestId
      const clientRequestId = `camp_${campaign.id}_cnt_${contact.id}_r${dispatchRun}`.slice(0, 64);

      try {
        const created = await prisma.whatsAppMessage.create({
          data: {
            organizationId,
            campaignId: campaign.id,
            campaignNameSnapshot: campaign.name,
            contactId: contact.id,
            dispatchRun,
            clientRequestId,
            recipientPhone: phoneNorm.e164,
            templateName: campaign.templateName,
            templateLanguage: campaign.templateLanguage || "en_US",
            parameters: paramResult.parameters,
            status: MessageDeliveryStatus.QUEUED,
          },
        });

        queuedCount++;
        messagesToEnqueue.push({
          id: created.id,
          recipientPhone: created.recipientPhone,
          templateName: created.templateName,
          templateLanguage: created.templateLanguage,
          parameters: created.parameters as Record<string, unknown>,
          contactId: created.contactId,
        });
      } catch (createErr: any) {
        // Handle concurrent database unique constraint violation gracefully (P2002)
        if (createErr?.code === "P2002") {
          alreadyPreparedCount++;
          const raced = await prisma.whatsAppMessage.findFirst({
            where: {
              campaignId: campaign.id,
              contactId: contact.id,
              dispatchRun,
            },
          });
          if (raced && raced.status === MessageDeliveryStatus.QUEUED) {
            messagesToEnqueue.push({
              id: raced.id,
              recipientPhone: raced.recipientPhone,
              templateName: raced.templateName,
              templateLanguage: raced.templateLanguage,
              parameters: raced.parameters as Record<string, unknown>,
              contactId: raced.contactId,
            });
          }
        } else {
          throw createErr;
        }
      }
    }

    // 7. If zero eligible recipients remain, reject fail-closed without mutating campaign
    if (eligibleCount === 0) {
      const details: Array<{ field?: string; message: string }> = [];
      if (excludedConsentCount > 0) {
        details.push({
          field: "consent",
          message: `${excludedConsentCount} contact(s) excluded due to non-opted-in consent status (must be OPTED_IN)`,
        });
      }
      if (excludedSuppressedCount > 0) {
        details.push({
          field: "suppression",
          message: `${excludedSuppressedCount} contact(s) excluded because they are suppressed / opted out`,
        });
      }
      if (excludedPhoneCount > 0) {
        details.push({
          field: "phone",
          message: `${excludedPhoneCount} contact(s) excluded due to invalid E.164 phone number`,
        });
      }
      if (excludedVariablesCount > 0) {
        const sampleReason = sampleExclusions.find(
          (s) =>
            s.reason.includes("parameter") ||
            s.reason.includes("attribute") ||
            s.reason.includes("variable")
        )?.reason;
        details.push({
          field: "templateVariables",
          message: `${excludedVariablesCount} contact(s) excluded due to unresolvable template parameters${
            sampleReason ? `: ${sampleReason}` : ""
          }`,
        });
      }

      logger.warn(
        `[CampaignLaunch] Zero eligible recipients for campaign ${campaign.id} (${campaign.name}). Total audience: ${members.length}. Exclusions: consent=${excludedConsentCount}, suppressed=${excludedSuppressedCount}, phone=${excludedPhoneCount}, variables=${excludedVariablesCount}`
      );

      throw new BadRequestError(
        "No eligible recipients found in audience list. All contacts were excluded due to consent, suppression, invalid phone numbers, or missing template parameters.",
        details
      );
    }

    // 8. Safely enqueue messages into BullMQ queue if Redis is configured
    let enqueueSuccessCount = 0;
    let enqueueFailureCount = 0;

    if (isRedisConfigured()) {
      const nowMs = Date.now();
      const targetTime = campaign.scheduledAt ? new Date(campaign.scheduledAt).getTime() : nowMs;
      const delayMs = Math.max(0, targetTime - nowMs);

      for (const msg of messagesToEnqueue) {
        try {
          const result = await enqueueWhatsAppDispatchJob(
            {
              messageId: msg.id,
              organizationId,
              recipientPhone: msg.recipientPhone,
              templateName: msg.templateName,
              templateLanguage: msg.templateLanguage,
              parameters: msg.parameters,
              campaignId: campaign.id,
              contactId: msg.contactId,
              dispatchRun,
              scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
            },
            delayMs > 0 ? { delay: delayMs } : undefined
          );
          if (result.alreadyExisted) {
            alreadyPreparedCount++;
          } else {
            enqueueSuccessCount++;
          }
        } catch (queueErr) {
          logger.warn(
            `[CampaignLaunch] Failed to enqueue message ${msg.id} into Redis: ${(queueErr as Error)?.message}`
          );
          enqueueFailureCount++;
        }
      }
    } else {
      logger.info(
        `[CampaignLaunch] Redis not configured or worker dormant. ${messagesToEnqueue.length} messages prepared in database with status QUEUED.`
      );
    }

    // 9. Update campaign status to QUEUED (startedAt is set when worker claims the first message)
    const updated = await prisma.campaign.update({
      where: { id: campaign.id },
      data: {
        status: CampaignStatus.QUEUED,
        startedAt: campaign.startedAt || null,
        totalRecipients: eligibleCount,
      },
    });

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: updated.status,
      totalAudienceCount: members.length,
      eligibleCount,
      queuedCount,
      alreadyPreparedCount,
      enqueueSuccessCount,
      enqueueFailureCount,
      excludedCount: {
        consentRequired: excludedConsentCount,
        suppressed: excludedSuppressedCount,
        invalidPhone: excludedPhoneCount,
        missingVariables: excludedVariablesCount,
      },
      sampleExclusions,
    };
  }

  /**
   * Explicit queue recovery for campaigns in QUEUED or SENDING status.
   * Scans for messages whose persisted status is still QUEUED, and re-attempts BullMQ enqueue
   * using deterministic job IDs (jobId = msg_${id}).
   *
   * Safety guarantees:
   * 1. Never creates new message records or modifies dispatchRun.
   * 2. Never resets SENDING, SUBMITTED_UNCONFIRMED, ACCEPTED, SENT, DELIVERED, READ, or FAILED messages to QUEUED.
   * 3. If Redis is unavailable, returns a clear 503 error and preserves all database records.
   * 4. Idempotently queries BullMQ; already-enqueued jobs are accurately reported and not duplicated.
   * 5. Documented: this recovery is explicitly triggered via API/UI, not an automatic background outbox sweeper.
   */
  public async recoverCampaignQueue(
    organizationId: string,
    id: string
  ): Promise<CampaignQueueRecoverySummary> {
    const prisma = getPrismaClient();

    // 1. Verify campaign existence and tenant isolation
    const campaign = await prisma.campaign.findFirst({
      where: {
        id,
        organizationId,
      },
    });

    if (!campaign) {
      throw new NotFoundError(`Campaign with ID '${id}' not found`);
    }

    if (
      campaign.status === CampaignStatus.DRAFT ||
      campaign.status === CampaignStatus.COMPLETED ||
      campaign.status === CampaignStatus.CANCELLED ||
      campaign.status === CampaignStatus.FAILED
    ) {
      throw new BadRequestError(
        `Cannot perform queue recovery on campaign with status '${campaign.status}'. Recovery is only applicable for campaigns in QUEUED or SENDING status.`
      );
    }

    // 2. Fail closed with recoverable error if Redis is unconfigured
    if (!isRedisConfigured()) {
      throw new AppError(
        "Redis dispatch queue is not configured or unreachable. All message records remain safely preserved in PostgreSQL with status QUEUED.",
        503,
        "REDIS_UNAVAILABLE"
      );
    }

    // 3. Query all messages for this campaign
    const messages = await prisma.whatsAppMessage.findMany({
      where: {
        organizationId,
        campaignId: campaign.id,
      },
      select: {
        id: true,
        contactId: true,
        status: true,
        wamid: true,
        attemptCount: true,
        leaseExpiresAt: true,
        recipientPhone: true,
        templateName: true,
        templateLanguage: true,
        parameters: true,
        dispatchRun: true,
      },
    });

    if (messages.length === 0) {
      if (campaign.status === CampaignStatus.QUEUED) {
        logger.info(
          `[CampaignRecovery] Campaign ${campaign.id} (${campaign.name}) is in QUEUED status with 0 message records (crash window recovery). Executing campaign launch to prepare and enqueue messages.`
        );
        try {
          const launchResult = await this.launchCampaign(organizationId, id);
          return {
            campaignId: campaign.id,
            campaignName: campaign.name,
            status: CampaignStatus.QUEUED,
            totalPersistedMessages: launchResult.queuedCount,
            eligibleQueuedCount: launchResult.eligibleCount,
            enqueuedSuccessCount: launchResult.enqueueSuccessCount,
            requeuedCount: 0,
            alreadyEnqueuedCount: launchResult.alreadyPreparedCount,
            enqueueFailureCount: launchResult.enqueueFailureCount,
            ambiguousCount: 0,
            inFlightCount: 0,
            terminalCount: 0,
          };
        } catch (launchErr) {
          logger.error(
            `[CampaignRecovery] Failed to recover 0-message QUEUED campaign ${campaign.id}: ${(launchErr as Error)?.message}. Transitioning campaign to FAILED.`
          );
          await prisma.campaign.updateMany({
            where: { id: campaign.id, status: CampaignStatus.QUEUED },
            data: {
              status: CampaignStatus.FAILED,
              completedAt: new Date(),
            },
          });
          throw launchErr;
        }
      }

      throw new BadRequestError("No messages exist for this campaign. Launch the campaign first.");
    }

    // 4. Filter only messages whose persisted status is still QUEUED
    const queuedMessages = messages.filter((m) => m.status === MessageDeliveryStatus.QUEUED);
    const inFlightCount = messages.filter(
      (m) =>
        m.status === MessageDeliveryStatus.SENDING ||
        m.status === MessageDeliveryStatus.SUBMITTED_UNCONFIRMED
    ).length;
    const terminalCount = messages.filter(
      (m) =>
        m.status === MessageDeliveryStatus.SENT ||
        m.status === MessageDeliveryStatus.DELIVERED ||
        m.status === MessageDeliveryStatus.READ ||
        m.status === MessageDeliveryStatus.FAILED ||
        m.status === MessageDeliveryStatus.ACCEPTED
    ).length;

    let enqueuedSuccessCount = 0;
    let requeuedCount = 0;
    let alreadyEnqueuedCount = 0;
    let enqueueFailureCount = 0;
    let ambiguousCount = 0;

    // 5. Attempt safe queue recovery for each eligible QUEUED message
    for (const msg of queuedMessages) {
      try {
        const recoveryResult = await inspectAndRecoverDispatchJob({
          jobData: {
            messageId: msg.id,
            organizationId,
            recipientPhone: msg.recipientPhone,
            templateName: msg.templateName,
            templateLanguage: msg.templateLanguage,
            parameters: msg.parameters as Record<string, unknown>,
            campaignId: campaign.id,
            contactId: msg.contactId,
            dispatchRun: msg.dispatchRun,
            scheduledAt: campaign.scheduledAt ? campaign.scheduledAt.toISOString() : null,
          },
          dbMessage: {
            id: msg.id,
            status: msg.status,
            wamid: msg.wamid,
            attemptCount: msg.attemptCount,
            leaseExpiresAt: msg.leaseExpiresAt,
          },
        });

        switch (recoveryResult.status) {
          case "newly_enqueued":
            enqueuedSuccessCount++;
            break;
          case "retried_failed":
            enqueuedSuccessCount++;
            requeuedCount++;
            break;
          case "already_waiting":
          case "already_active":
          case "already_completed":
            alreadyEnqueuedCount++;
            break;
          case "ambiguous":
            ambiguousCount++;
            break;
          case "ineligible_status":
            break;
        }
      } catch (queueErr) {
        logger.warn(
          `[CampaignRecovery] Failed to recover job for message ${msg.id}: ${(queueErr as Error)?.message}`
        );
        enqueueFailureCount++;
      }
    }

    // 6. If zero messages remain in QUEUED/SENDING and all are terminal, evaluate lifecycle
    if (queuedMessages.length === 0 && inFlightCount === 0) {
      await CampaignLifecycleService.evaluateCampaignLifecycle(campaign.id);
    }

    return {
      campaignId: campaign.id,
      campaignName: campaign.name,
      status: campaign.status,
      totalPersistedMessages: messages.length,
      eligibleQueuedCount: queuedMessages.length,
      enqueuedSuccessCount,
      requeuedCount,
      alreadyEnqueuedCount,
      enqueueFailureCount,
      ambiguousCount,
      terminalCount,
      inFlightCount,
    };
  }

  /**
   * Internal lookup to retrieve a campaign across organizations for platform administrators.
   * Returns null if not found.
   */
  public async getCampaignByIdAcrossOrgs(id: string): Promise<any | null> {
    const prisma = getPrismaClient();
    return prisma.campaign.findFirst({
      where: { id },
      include: {
        organization: {
          select: {
            id: true,
            name: true,
            slug: true,
            isArchived: true,
            deletedAt: true,
          },
        },
      },
    });
  }

  /**
   * Lists campaigns subject to the administrative approval workflow across assigned customer organizations.
   * - Super Admin (allowedOrganizationIds === "ALL"): Queries across all active organizations.
   * - Delegated Admin (allowedOrganizationIds is string[]): Queries only organizations in allowedOrganizationIds.
   *   If organizationId is requested and outside allowedOrganizationIds, throws ForbiddenError.
   */
  public async listApprovalRequests(params: {
    allowedOrganizationIds: string[] | "ALL";
    query: QueryPlatformCampaignApprovalsInput;
  }): Promise<PlatformCampaignApprovalsResult> {
    const prisma = getPrismaClient();
    const {
      status = "PENDING",
      organizationId,
      search,
      page = 1,
      limit = 10,
      sortBy = "createdAt",
      sortOrder = "desc",
    } = params.query;

    // 1. Organization boundary enforcement
    let orgFilter: Prisma.StringFilter | string | undefined;

    if (params.allowedOrganizationIds === "ALL") {
      if (organizationId) {
        orgFilter = organizationId;
      }
    } else {
      if (params.allowedOrganizationIds.length === 0) {
        return {
          items: [],
          pagination: {
            page: 1,
            limit,
            total: 0,
            totalPages: 0,
            hasNextPage: false,
            hasPrevPage: false,
          },
          counts: { pending: 0, approved: 0, rejected: 0, total: 0 },
        };
      }

      if (organizationId) {
        if (!params.allowedOrganizationIds.includes(organizationId)) {
          throw new ForbiddenError(
            "Access denied: You are not assigned to manage this customer organization."
          );
        }
        orgFilter = organizationId;
      } else {
        orgFilter = { in: params.allowedOrganizationIds };
      }
    }

    // 2. Base where condition
    const baseWhere: Prisma.CampaignWhereInput = {
      organization: {
        isArchived: false,
        deletedAt: null,
      },
    };

    if (orgFilter) {
      baseWhere.organizationId = orgFilter;
    }

    if (search && search.trim() !== "") {
      const searchTrimmed = search.trim();
      baseWhere.OR = [
        { name: { contains: searchTrimmed, mode: "insensitive" } },
        { templateName: { contains: searchTrimmed, mode: "insensitive" } },
      ];
    }

    // 3. Status filter for items
    const where: Prisma.CampaignWhereInput = { ...baseWhere };
    if (status === "ALL") {
      where.approvalStatus = {
        in: [
          CampaignApprovalStatus.PENDING,
          CampaignApprovalStatus.APPROVED,
          CampaignApprovalStatus.REJECTED,
        ],
      };
    } else {
      where.approvalStatus = status as CampaignApprovalStatus;
    }

    const skip = (page - 1) * limit;

    // 4. Parallel execution of items query, filtered count, and status counts
    const [rawItems, total, pendingCount, approvedCount, rejectedCount] =
      await Promise.all([
        prisma.campaign.findMany({
          where,
          skip,
          take: limit,
          orderBy: {
            [sortBy]: sortOrder,
          },
          include: {
            organization: {
              select: {
                id: true,
                name: true,
                slug: true,
              },
            },
          },
        }),
        prisma.campaign.count({ where }),
        prisma.campaign.count({
          where: {
            ...baseWhere,
            approvalStatus: CampaignApprovalStatus.PENDING,
          },
        }),
        prisma.campaign.count({
          where: {
            ...baseWhere,
            approvalStatus: CampaignApprovalStatus.APPROVED,
          },
        }),
        prisma.campaign.count({
          where: {
            ...baseWhere,
            approvalStatus: CampaignApprovalStatus.REJECTED,
          },
        }),
      ]);

    const totalPages = Math.ceil(total / limit);

    return {
      items: rawItems as unknown as PlatformCampaignApprovalItem[],
      pagination: {
        page,
        limit,
        total,
        totalPages,
        hasNextPage: page < totalPages,
        hasPrevPage: page > 1,
      },
      counts: {
        pending: pendingCount,
        approved: approvedCount,
        rejected: rejectedCount,
        total: pendingCount + approvedCount + rejectedCount,
      },
    };
  }
}

export const campaignService = new CampaignService();
