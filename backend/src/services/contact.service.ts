import { getPrismaClient } from "../config/prisma.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { AppError, NotFoundError } from "../utils/errors.js";
import {
  QueryContactsInput,
  CreateContactInput,
  UpdateContactInput,
  UpdateConsentInput,
} from "../validators/contact.validator.js";
import { Prisma } from "@prisma/client";

export class ContactService {
  /**
   * Lists contacts with tenant isolation, search, filtering, and pagination.
   */
  public async list(organizationId: string, query: QueryContactsInput) {
    const prisma = getPrismaClient();
    const page = Math.max(1, query.page || 1);
    const limit = Math.min(100, Math.max(1, query.limit || 20));
    const skip = (page - 1) * limit;

    const where: Prisma.ContactWhereInput = {
      organizationId,
    };

    if (query.consentStatus) {
      where.consentStatus = query.consentStatus;
    }

    if (query.isSuppressed !== undefined) {
      where.isSuppressed = query.isSuppressed;
    }

    if (query.listId) {
      where.listMemberships = {
        some: {
          listId: query.listId,
        },
      };
    }

    if (query.search && query.search.trim()) {
      const search = query.search.trim();
      where.OR = [
        { phoneNumber: { contains: search } },
        { firstName: { contains: search, mode: "insensitive" } },
        { lastName: { contains: search, mode: "insensitive" } },
        { email: { contains: search, mode: "insensitive" } },
      ];
    }

    const [total, contacts] = await Promise.all([
      prisma.contact.count({ where }),
      prisma.contact.findMany({
        where,
        skip,
        take: limit,
        orderBy: { createdAt: "desc" },
        include: {
          listMemberships: {
            include: {
              list: {
                select: {
                  id: true,
                  name: true,
                },
              },
            },
          },
        },
      }),
    ]);

    const items = contacts.map((c) => ({
      id: c.id,
      organizationId: c.organizationId,
      phoneNumber: c.phoneNumber,
      countryCode: c.countryCode,
      firstName: c.firstName,
      lastName: c.lastName,
      email: c.email,
      customAttributes: c.customAttributes,
      consentStatus: c.consentStatus,
      consentSource: c.consentSource,
      consentTimestamp: c.consentTimestamp,
      isSuppressed: c.isSuppressed,
      suppressedAt: c.suppressedAt,
      suppressionReason: c.suppressionReason,
      createdAt: c.createdAt,
      updatedAt: c.updatedAt,
      lists: c.listMemberships.map((m) => m.list),
    }));

    return {
      items,
      pagination: {
        page,
        limit,
        totalItems: total,
        totalPages: Math.ceil(total / limit),
        hasNextPage: skip + limit < total,
        hasPrevPage: page > 1,
      },
    };
  }

  /**
   * Retrieves single contact details scoped to tenant organization.
   */
  public async getById(organizationId: string, id: string) {
    const prisma = getPrismaClient();
    const contact = await prisma.contact.findFirst({
      where: {
        id,
        organizationId,
      },
      include: {
        listMemberships: {
          include: {
            list: true,
          },
        },
        consentEvents: {
          orderBy: { createdAt: "desc" },
          take: 20,
        },
      },
    });

    if (!contact) {
      throw new NotFoundError("Contact not found");
    }

    return {
      ...contact,
      lists: contact.listMemberships.map((m) => m.list),
    };
  }

  /**
   * Creates a new contact with phone normalization and tenant isolation.
   */
  public async create(
    organizationId: string,
    input: CreateContactInput,
    userId = "system_user"
  ) {
    const prisma = getPrismaClient();

    const normalized = normalizePhoneNumber(input.phoneNumber);
    if (!normalized.valid || !normalized.e164) {
      throw new AppError(
        normalized.error || "Invalid phone number format",
        422,
        "INVALID_PHONE_NUMBER"
      );
    }

    const existing = await prisma.contact.findUnique({
      where: {
        organizationId_phoneNumber: {
          organizationId,
          phoneNumber: normalized.e164,
        },
      },
    });

    if (existing) {
      throw new AppError(
        `Contact with phone number ${normalized.e164} already exists in your organization`,
        409,
        "CONTACT_ALREADY_EXISTS"
      );
    }

    return prisma.$transaction(async (tx) => {
      const contact = await tx.contact.create({
        data: {
          organizationId,
          phoneNumber: normalized.e164!,
          countryCode: normalized.countryCode || "+91",
          firstName: input.firstName?.trim() || null,
          lastName: input.lastName?.trim() || null,
          email: input.email?.trim() || null,
          customAttributes: (input.customAttributes as Prisma.InputJsonValue) || {},
          consentStatus: input.consentStatus || "PENDING",
          consentSource: input.consentSource || "MANUAL_ENTRY",
          consentTimestamp: new Date(),
        },
      });

      // Record initial audit event
      await tx.consentEvent.create({
        data: {
          organizationId,
          contactId: contact.id,
          eventType:
            input.consentStatus === "OPTED_IN" ? "OPT_IN" : "OPT_OUT",
          source: input.consentSource || "MANUAL_ENTRY",
          performedBy: userId,
        },
      });

      // Add to lists if specified
      if (input.listIds && input.listIds.length > 0) {
        for (const listId of input.listIds) {
          await tx.contactListMember.create({
            data: {
              organizationId,
              listId,
              contactId: contact.id,
              source: "MANUAL_ASSIGNMENT",
            },
          });
        }
      }

      return contact;
    });
  }

  /**
   * Updates basic contact details (names, email, custom attributes).
   */
  public async update(
    organizationId: string,
    id: string,
    input: UpdateContactInput
  ) {
    const prisma = getPrismaClient();

    // Verify contact exists and belongs to this organization
    const existing = await prisma.contact.findFirst({
      where: { id, organizationId },
    });

    if (!existing) {
      throw new NotFoundError("Contact not found");
    }

    const updated = await prisma.contact.update({
      where: { id: existing.id },
      data: {
        firstName: input.firstName !== undefined ? input.firstName.trim() || null : undefined,
        lastName: input.lastName !== undefined ? input.lastName.trim() || null : undefined,
        email: input.email !== undefined ? input.email.trim() || null : undefined,
        customAttributes:
          input.customAttributes !== undefined
            ? (input.customAttributes as Prisma.InputJsonValue)
            : undefined,
      },
    });

    return updated;
  }

  /**
   * Updates contact consent / suppression state with immutable audit trail.
   */
  public async recordConsentEvent(
    organizationId: string,
    id: string,
    input: UpdateConsentInput,
    userId = "system_user"
  ) {
    const prisma = getPrismaClient();

    const contact = await prisma.contact.findFirst({
      where: { id, organizationId },
    });

    if (!contact) {
      throw new NotFoundError("Contact not found");
    }

    return prisma.$transaction(async (tx) => {
      // Create immutable audit record
      await tx.consentEvent.create({
        data: {
          organizationId,
          contactId: contact.id,
          eventType: input.eventType,
          source: input.source,
          evidence: input.evidence || null,
          performedBy: userId,
        },
      });

      // Update contact fast-query status
      let newConsentStatus = contact.consentStatus;
      let isSuppressed = contact.isSuppressed;
      let suppressedAt = contact.suppressedAt;
      let suppressionReason = contact.suppressionReason;

      switch (input.eventType) {
        case "OPT_IN":
          newConsentStatus = "OPTED_IN";
          break;
        case "OPT_OUT":
          newConsentStatus = "OPTED_OUT";
          break;
        case "SUPPRESS":
          isSuppressed = true;
          suppressedAt = new Date();
          suppressionReason = input.evidence || "Manually suppressed by operator";
          break;
        case "UNSUPPRESS":
          isSuppressed = false;
          suppressedAt = null;
          suppressionReason = null;
          break;
      }

      return tx.contact.update({
        where: { id: contact.id },
        data: {
          consentStatus: newConsentStatus,
          isSuppressed,
          suppressedAt,
          suppressionReason,
          consentTimestamp: new Date(),
          consentSource: input.source,
        },
      });
    });
  }

  /**
   * Deletes a contact within organization boundary.
   */
  public async delete(organizationId: string, id: string) {
    const prisma = getPrismaClient();

    const contact = await prisma.contact.findFirst({
      where: { id, organizationId },
    });

    if (!contact) {
      throw new NotFoundError("Contact not found");
    }

    // Cascade delete handles memberships; consentEvents are restricted in schema
    // Delete consent events first if deleting contact completely
    await prisma.$transaction(async (tx) => {
      await tx.consentEvent.deleteMany({
        where: { organizationId, contactId: contact.id },
      });
      await tx.contact.delete({
        where: { id: contact.id },
      });
    });

    return { success: true };
  }
}

export const contactService = new ContactService();
