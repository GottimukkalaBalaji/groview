import { getPrismaClient } from "../config/prisma.js";
import { AppError, NotFoundError } from "../utils/errors.js";
import {
  CreateContactListInput,
  UpdateContactListInput,
  AddListMembersInput,
} from "../validators/contact.validator.js";

export class AudienceService {
  /**
   * Lists all contact lists (audiences) with member count for the organization.
   */
  public async list(organizationId: string) {
    const prisma = getPrismaClient();

    const lists = await prisma.contactList.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    const eligibleCounts = await Promise.all(
      lists.map(async (l) => {
        try {
          return await prisma.contactListMember.count({
            where: {
              organizationId,
              listId: l.id,
              contact: {
                consentStatus: "OPTED_IN",
                isSuppressed: false,
              },
            },
          });
        } catch {
          return l._count?.members || 0;
        }
      })
    );

    return lists.map((l, idx) => ({
      id: l.id,
      name: l.name,
      description: l.description,
      memberCount: l._count?.members || 0,
      eligibleMemberCount: eligibleCounts[idx] ?? l._count?.members ?? 0,
      createdAt: l.createdAt,
      updatedAt: l.updatedAt,
    }));
  }

  /**
   * Retrieves single contact list with member pagination and stats.
   */
  public async getById(
    organizationId: string,
    id: string,
    page = 1,
    limit = 20
  ) {
    const prisma = getPrismaClient();

    const list = await prisma.contactList.findFirst({
      where: { id, organizationId },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    if (!list) {
      throw new NotFoundError("Contact list not found");
    }

    const skip = (page - 1) * limit;

    const [totalMembers, eligibleMembers, members] = await Promise.all([
      prisma.contactListMember.count({
        where: { organizationId, listId: id },
      }),
      prisma.contactListMember
        .count({
          where: {
            organizationId,
            listId: id,
            contact: {
              consentStatus: "OPTED_IN",
              isSuppressed: false,
            },
          },
        })
        .catch(() => 0),
      prisma.contactListMember.findMany({
        where: { organizationId, listId: id },
        skip,
        take: limit,
        orderBy: { addedAt: "desc" },
        include: {
          contact: true,
        },
      }),
    ]);

    return {
      id: list.id,
      name: list.name,
      description: list.description,
      memberCount: list._count?.members || 0,
      eligibleMemberCount: eligibleMembers,
      createdAt: list.createdAt,
      updatedAt: list.updatedAt,
      members: members.map((m) => ({
        ...m.contact,
        addedAt: m.addedAt,
        source: m.source,
      })),
      pagination: {
        page,
        limit,
        totalItems: totalMembers,
        totalPages: Math.ceil(totalMembers / limit),
      },
    };
  }

  /**
   * Creates a new audience contact list with uniqueness check.
   */
  public async create(organizationId: string, input: CreateContactListInput) {
    const prisma = getPrismaClient();
    const name = input.name.trim();

    const existing = await prisma.contactList.findFirst({
      where: {
        organizationId,
        name: { equals: name, mode: "insensitive" },
      },
    });

    if (existing) {
      throw new AppError(
        `A contact list named '${name}' already exists in your organization`,
        409,
        "LIST_ALREADY_EXISTS"
      );
    }

    const list = await prisma.contactList.create({
      data: {
        organizationId,
        name,
        description: input.description?.trim() || null,
      },
    });

    return {
      ...list,
      memberCount: 0,
    };
  }

  /**
   * Updates contact list details.
   */
  public async update(
    organizationId: string,
    id: string,
    input: UpdateContactListInput
  ) {
    const prisma = getPrismaClient();

    const list = await prisma.contactList.findFirst({
      where: { id, organizationId },
    });

    if (!list) {
      throw new NotFoundError("Contact list not found");
    }

    if (input.name && input.name.trim() !== list.name) {
      const existing = await prisma.contactList.findFirst({
        where: {
          organizationId,
          name: { equals: input.name.trim(), mode: "insensitive" },
          id: { not: id },
        },
      });

      if (existing) {
        throw new AppError(
          `A contact list named '${input.name.trim()}' already exists`,
          409,
          "LIST_ALREADY_EXISTS"
        );
      }
    }

    const updated = await prisma.contactList.update({
      where: { id },
      data: {
        name: input.name?.trim() || undefined,
        description: input.description !== undefined ? input.description.trim() || null : undefined,
      },
      include: {
        _count: {
          select: { members: true },
        },
      },
    });

    return {
      id: updated.id,
      name: updated.name,
      description: updated.description,
      memberCount: updated._count.members,
      createdAt: updated.createdAt,
      updatedAt: updated.updatedAt,
    };
  }

  /**
   * Deletes a contact list without deleting the underlying contacts.
   */
  public async delete(organizationId: string, id: string) {
    const prisma = getPrismaClient();

    const list = await prisma.contactList.findFirst({
      where: { id, organizationId },
    });

    if (!list) {
      throw new NotFoundError("Contact list not found");
    }

    // Cascade deletes list members; contact records remain intact
    await prisma.contactList.delete({
      where: { id },
    });

    return { success: true };
  }

  /**
   * Adds contacts to a list with tenant isolation and duplicate avoidance.
   */
  public async addMembers(
    organizationId: string,
    listId: string,
    input: AddListMembersInput
  ) {
    const prisma = getPrismaClient();

    const list = await prisma.contactList.findFirst({
      where: { id: listId, organizationId },
    });

    if (!list) {
      throw new NotFoundError("Contact list not found");
    }

    // Verify contacts belong to the same organization
    const validContacts = await prisma.contact.findMany({
      where: {
        organizationId,
        id: { in: input.contactIds },
      },
      select: { id: true },
    });

    const validContactIds = validContacts.map((c) => c.id);

    // Create memberships with skipDuplicates
    const createData = validContactIds.map((contactId) => ({
      organizationId,
      listId,
      contactId,
      source: "MANUAL_ADD",
    }));

    if (createData.length > 0) {
      await prisma.contactListMember.createMany({
        data: createData,
        skipDuplicates: true,
      });
    }

    const count = await prisma.contactListMember.count({
      where: { organizationId, listId },
    });

    return {
      listId,
      addedCount: validContactIds.length,
      totalMembers: count,
    };
  }

  /**
   * Removes a contact from a list.
   */
  public async removeMember(
    organizationId: string,
    listId: string,
    contactId: string
  ) {
    const prisma = getPrismaClient();

    const member = await prisma.contactListMember.findFirst({
      where: {
        organizationId,
        listId,
        contactId,
      },
    });

    if (!member) {
      throw new NotFoundError("Contact membership not found in this list");
    }

    await prisma.contactListMember.delete({
      where: { id: member.id },
    });

    return { success: true };
  }
}

export const audienceService = new AudienceService();
