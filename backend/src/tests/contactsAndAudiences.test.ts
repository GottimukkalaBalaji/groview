import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";

// In-memory mock models for isolated test execution
interface MockContact {
  id: string;
  organizationId: string;
  phoneNumber: string;
  countryCode: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  customAttributes: Record<string, unknown>;
  consentStatus: "OPTED_IN" | "OPTED_OUT" | "PENDING" | "UNKNOWN";
  consentSource: string | null;
  consentTimestamp: Date | null;
  isSuppressed: boolean;
  suppressedAt: Date | null;
  suppressionReason: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockContactList {
  id: string;
  organizationId: string;
  name: string;
  description: string | null;
  createdAt: Date;
  updatedAt: Date;
}

interface MockContactListMember {
  id: string;
  organizationId: string;
  listId: string;
  contactId: string;
  addedAt: Date;
  source: string | null;
}

interface MockConsentEvent {
  id: string;
  organizationId: string;
  contactId: string;
  eventType: "OPT_IN" | "OPT_OUT" | "SUPPRESS" | "UNSUPPRESS";
  source: string;
  evidence: string | null;
  performedBy: string | null;
  createdAt: Date;
}

interface MockImportJob {
  id: string;
  organizationId: string;
  listId: string | null;
  fileName: string;
  fileSizeBytes: number;
  fileHash: string;
  clientRequestId: string;
  attemptNumber: number;
  status: "PENDING" | "PROCESSING" | "COMPLETED" | "COMPLETED_WITH_ERRORS" | "FAILED";
  totalRows: number;
  processedRows: number;
  lastProcessedRow: number;
  createdContacts: number;
  updatedContacts: number;
  addedToList: number;
  skippedDuplicates: number;
  skippedSuppressed: number;
  invalidRows: number;
  rowErrors: any[];
  operatorConsentDeclaration: string | null;
  declaredBy: string | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}

let mockContacts: MockContact[] = [];
let mockLists: MockContactList[] = [];
let mockMembers: MockContactListMember[] = [];
let mockEvents: MockConsentEvent[] = [];
let mockJobs: MockImportJob[] = [];

vi.mock("../config/prisma.js", () => {
  return {
    isDatabaseConfigured: () => true,
    getPrismaClient: () => {
      const client = {
        $transaction: vi.fn().mockImplementation(async (cb) => cb(client)),
        contact: {
          count: vi.fn().mockImplementation(async ({ where }) => {
            return mockContacts.filter((c) => {
              if (c.organizationId !== where.organizationId) return false;
              if (where.consentStatus && c.consentStatus !== where.consentStatus) return false;
              if (where.isSuppressed !== undefined && c.isSuppressed !== where.isSuppressed) return false;
              if (where.listMemberships?.some?.listId) {
                const targetListId = where.listMemberships.some.listId;
                const isMember = mockMembers.some((m) => m.listId === targetListId && m.contactId === c.id);
                if (!isMember) return false;
              }
              return true;
            }).length;
          }),
          findMany: vi.fn().mockImplementation(async ({ where, skip = 0, take = 20 }) => {
            let res = mockContacts.filter((c) => {
              if (c.organizationId !== where.organizationId) return false;
              if (where.consentStatus && c.consentStatus !== where.consentStatus) return false;
              if (where.isSuppressed !== undefined && c.isSuppressed !== where.isSuppressed) return false;
              if (where.listMemberships?.some?.listId) {
                const targetListId = where.listMemberships.some.listId;
                const isMember = mockMembers.some((m) => m.listId === targetListId && m.contactId === c.id);
                if (!isMember) return false;
              }
              if (where.OR) {
                const matches = where.OR.some((cond: any) => {
                  if (cond.phoneNumber && c.phoneNumber.includes(cond.phoneNumber.contains)) return true;
                  if (cond.firstName && c.firstName?.toLowerCase().includes(cond.firstName.contains.toLowerCase())) return true;
                  return false;
                });
                if (!matches) return false;
              }
              return true;
            });
            return res.slice(skip, skip + take).map((c) => ({
              ...c,
              listMemberships: mockMembers
                .filter((m) => m.contactId === c.id)
                .map((m) => ({
                  ...m,
                  list: mockLists.find((l) => l.id === m.listId) || { id: m.listId, name: "List" },
                })),
            }));
          }),
          findUnique: vi.fn().mockImplementation(async ({ where }) => {
            if (where.organizationId_phoneNumber) {
              return mockContacts.find(
                (c) =>
                  c.organizationId === where.organizationId_phoneNumber.organizationId &&
                  c.phoneNumber === where.organizationId_phoneNumber.phoneNumber
              ) || null;
            }
            if (where.id) {
              return mockContacts.find((c) => c.id === where.id) || null;
            }
            return null;
          }),
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            return mockContacts.find((c) => {
              if (where.organizationId && c.organizationId !== where.organizationId) return false;
              if (where.id && c.id !== where.id) return false;
              return true;
            }) || null;
          }),
          create: vi.fn().mockImplementation(async ({ data }) => {
            const item: MockContact = {
              id: `cnt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              organizationId: data.organizationId,
              phoneNumber: data.phoneNumber,
              countryCode: data.countryCode || "+91",
              firstName: data.firstName || null,
              lastName: data.lastName || null,
              email: data.email || null,
              customAttributes: data.customAttributes || {},
              consentStatus: data.consentStatus || "PENDING",
              consentSource: data.consentSource || null,
              consentTimestamp: data.consentTimestamp || new Date(),
              isSuppressed: false,
              suppressedAt: null,
              suppressionReason: null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockContacts.push(item);
            return item;
          }),
          update: vi.fn().mockImplementation(async ({ where, data }) => {
            const idx = mockContacts.findIndex((c) => c.id === where.id);
            if (idx === -1) throw new Error("Contact not found");
            mockContacts[idx] = {
              ...mockContacts[idx],
              ...data,
              updatedAt: new Date(),
            };
            return mockContacts[idx];
          }),
          delete: vi.fn().mockImplementation(async ({ where }) => {
            const idx = mockContacts.findIndex((c) => c.id === where.id);
            if (idx !== -1) mockContacts.splice(idx, 1);
            return { id: where.id };
          }),
        },
        contactList: {
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            return mockLists
              .filter((l) => l.organizationId === where.organizationId)
              .map((l) => ({
                ...l,
                _count: {
                  members: mockMembers.filter((m) => m.listId === l.id).length,
                },
              }));
          }),
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            return mockLists.find((l) => {
              if (where.organizationId && l.organizationId !== where.organizationId) return false;
              if (where.id && l.id !== where.id) return false;
              if (where.name?.equals) {
                if (l.name.toLowerCase() !== where.name.equals.toLowerCase()) return false;
              }
              return true;
            }) || null;
          }),
          create: vi.fn().mockImplementation(async ({ data }) => {
            const list: MockContactList = {
              id: `lst_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              organizationId: data.organizationId,
              name: data.name,
              description: data.description || null,
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockLists.push(list);
            return list;
          }),
          update: vi.fn().mockImplementation(async ({ where, data }) => {
            const idx = mockLists.findIndex((l) => l.id === where.id);
            if (idx === -1) throw new Error("List not found");
            mockLists[idx] = { ...mockLists[idx], ...data, updatedAt: new Date() };
            return {
              ...mockLists[idx],
              _count: {
                members: mockMembers.filter((m) => m.listId === mockLists[idx].id).length,
              },
            };
          }),
          delete: vi.fn().mockImplementation(async ({ where }) => {
            const idx = mockLists.findIndex((l) => l.id === where.id);
            if (idx !== -1) mockLists.splice(idx, 1);
            mockMembers = mockMembers.filter((m) => m.listId !== where.id);
            return { id: where.id };
          }),
        },
        contactListMember: {
          count: vi.fn().mockImplementation(async ({ where }) => {
            return mockMembers.filter((m) => m.organizationId === where.organizationId && m.listId === where.listId).length;
          }),
          findMany: vi.fn().mockImplementation(async ({ where, skip = 0, take = 20 }) => {
            const filtered = mockMembers.filter((m) => m.organizationId === where.organizationId && m.listId === where.listId);
            return filtered.slice(skip, skip + take).map((m) => ({
              ...m,
              contact: mockContacts.find((c) => c.id === m.contactId) || { id: m.contactId },
            }));
          }),
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            return mockMembers.find((m) => m.organizationId === where.organizationId && m.listId === where.listId && m.contactId === where.contactId) || null;
          }),
          create: vi.fn().mockImplementation(async ({ data }) => {
            const member: MockContactListMember = {
              id: `clm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              ...data,
              addedAt: new Date(),
            };
            mockMembers.push(member);
            return member;
          }),
          createMany: vi.fn().mockImplementation(async ({ data }) => {
            let count = 0;
            for (const item of data) {
              const exists = mockMembers.some((m) => m.listId === item.listId && m.contactId === item.contactId);
              if (!exists) {
                mockMembers.push({
                  id: `clm_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
                  ...item,
                  addedAt: new Date(),
                });
                count++;
              }
            }
            return { count };
          }),
          delete: vi.fn().mockImplementation(async ({ where }) => {
            mockMembers = mockMembers.filter((m) => m.id !== where.id);
            return { id: where.id };
          }),
        },
        consentEvent: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            const evt: MockConsentEvent = {
              id: `evt_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              ...data,
              createdAt: new Date(),
            };
            mockEvents.push(evt);
            return evt;
          }),
          deleteMany: vi.fn().mockImplementation(async ({ where }) => {
            mockEvents = mockEvents.filter((e) => e.contactId !== where.contactId);
            return { count: 1 };
          }),
        },
        importJob: {
          findFirst: vi.fn().mockImplementation(async ({ where }) => {
            return mockJobs.find((j) => {
              if (where.organizationId && j.organizationId !== where.organizationId) return false;
              if (where.clientRequestId && j.clientRequestId !== where.clientRequestId) return false;
              if (where.id && j.id !== where.id) return false;
              return true;
            }) || null;
          }),
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            return mockJobs.filter((j) => j.organizationId === where.organizationId);
          }),
          create: vi.fn().mockImplementation(async ({ data }) => {
            const job: MockImportJob = {
              id: `job_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              ...data,
              attemptNumber: 1,
              processedRows: 0,
              lastProcessedRow: 0,
              createdContacts: 0,
              updatedContacts: 0,
              addedToList: 0,
              skippedDuplicates: 0,
              skippedSuppressed: 0,
              invalidRows: 0,
              rowErrors: [],
              createdAt: new Date(),
              updatedAt: new Date(),
            };
            mockJobs.push(job);
            return job;
          }),
          update: vi.fn().mockImplementation(async ({ where, data }) => {
            const idx = mockJobs.findIndex((j) => j.id === where.id);
            if (idx === -1) throw new Error("Job not found");
            mockJobs[idx] = { ...mockJobs[idx], ...data, updatedAt: new Date() };
            return mockJobs[idx];
          }),
        },
      };
      return client;
    },
  };
});

describe("Contacts & Audiences Management API (/api/v1/contacts & /api/v1/audiences)", () => {
  beforeEach(() => {
    mockContacts = [];
    mockLists = [];
    mockMembers = [];
    mockEvents = [];
    mockJobs = [];
  });

  describe("Authentication & Tenant Boundary Protection", () => {
    it("should reject unauthenticated access when auth is strictly enforced", async () => {
      const res = await request(app)
        .get("/api/v1/contacts")
        .set("x-test-enforce-auth", "true");

      expect(res.status).toBe(401);
      expect(res.body.success).toBe(false);
    });

    it("should isolate contacts between different organizations", async () => {
      // Seed contact in org_alpha
      mockContacts.push({
        id: "cnt_alpha_1",
        organizationId: "org_alpha",
        phoneNumber: "+919876543210",
        countryCode: "+91",
        firstName: "Alpha",
        lastName: "User",
        email: "alpha@example.com",
        customAttributes: {},
        consentStatus: "OPTED_IN",
        consentSource: "WEB_FORM",
        consentTimestamp: new Date(),
        isSuppressed: false,
        suppressedAt: null,
        suppressionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // org_beta tries to fetch contacts
      const resBeta = await request(app)
        .get("/api/v1/contacts")
        .set("x-test-org-id", "org_beta");

      expect(resBeta.status).toBe(200);
      expect(resBeta.body.data.items.length).toBe(0);

      // org_alpha fetches contacts
      const resAlpha = await request(app)
        .get("/api/v1/contacts")
        .set("x-test-org-id", "org_alpha");

      expect(resAlpha.status).toBe(200);
      expect(resAlpha.body.data.items.length).toBe(1);
      expect(resAlpha.body.data.items[0].phoneNumber).toBe("+919876543210");
    });
  });

  describe("Contacts CRUD Operations", () => {
    it("should create contact with E.164 normalization and default PENDING consent", async () => {
      const res = await request(app)
        .post("/api/v1/contacts")
        .set("x-test-org-id", "org_test")
        .send({
          phoneNumber: "9876543210", // 10-digit without country code
          firstName: "Ramesh",
          lastName: "Kumar",
          email: "ramesh@example.com",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.phoneNumber).toBe("+919876543210");
      expect(res.body.data.consentStatus).toBe("PENDING");
      expect(mockEvents.length).toBe(1);
    });

    it("should reject creating duplicate phone number within the same organization", async () => {
      mockContacts.push({
        id: "cnt_existing",
        organizationId: "org_test",
        phoneNumber: "+919876543210",
        countryCode: "+91",
        firstName: "Existing",
        lastName: "Contact",
        email: "existing@example.com",
        customAttributes: {},
        consentStatus: "OPTED_IN",
        consentSource: "DIRECT",
        consentTimestamp: new Date(),
        isSuppressed: false,
        suppressedAt: null,
        suppressionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/contacts")
        .set("x-test-org-id", "org_test")
        .send({
          phoneNumber: "+919876543210",
          firstName: "Duplicate",
        });

      expect(res.status).toBe(409);
      expect(res.body.error.code).toBe("CONTACT_ALREADY_EXISTS");
    });

    it("should record consent event and update suppression status", async () => {
      mockContacts.push({
        id: "cnt_suppress_target",
        organizationId: "org_test",
        phoneNumber: "+919876543210",
        countryCode: "+91",
        firstName: "Target",
        lastName: "User",
        email: "target@example.com",
        customAttributes: {},
        consentStatus: "OPTED_IN",
        consentSource: "DIRECT",
        consentTimestamp: new Date(),
        isSuppressed: false,
        suppressedAt: null,
        suppressionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const res = await request(app)
        .post("/api/v1/contacts/cnt_suppress_target/consent")
        .set("x-test-org-id", "org_test")
        .send({
          eventType: "SUPPRESS",
          source: "USER_COMPLAINT",
          evidence: "Customer requested complete marketing suppression",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.isSuppressed).toBe(true);
      expect(res.body.data.suppressionReason).toContain("Customer requested");
      expect(mockEvents.length).toBe(1);
    });
  });

  describe("Audience Lists & Membership API", () => {
    it("should create audience list with unique name per organization", async () => {
      const res = await request(app)
        .post("/api/v1/audiences")
        .set("x-test-org-id", "org_test")
        .send({
          name: "Diwali VIP Shoppers",
          description: "Targeted festival shoppers list",
        });

      expect(res.status).toBe(201);
      expect(res.body.data.name).toBe("Diwali VIP Shoppers");
      expect(res.body.data.memberCount).toBe(0);

      // Duplicate name should fail
      const dupRes = await request(app)
        .post("/api/v1/audiences")
        .set("x-test-org-id", "org_test")
        .send({
          name: "Diwali VIP Shoppers",
        });

      expect(dupRes.status).toBe(409);
      expect(dupRes.body.error.code).toBe("LIST_ALREADY_EXISTS");
    });

    it("should add members to list without duplicate membership", async () => {
      const listId = "lst_festival";
      mockLists.push({
        id: listId,
        organizationId: "org_test",
        name: "Festival List",
        description: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      mockContacts.push(
        {
          id: "cnt_1",
          organizationId: "org_test",
          phoneNumber: "+919876543210",
          countryCode: "+91",
          firstName: "User1",
          lastName: null,
          email: null,
          customAttributes: {},
          consentStatus: "OPTED_IN",
          consentSource: null,
          consentTimestamp: null,
          isSuppressed: false,
          suppressedAt: null,
          suppressionReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        },
        {
          id: "cnt_2",
          organizationId: "org_test",
          phoneNumber: "+919876543211",
          countryCode: "+91",
          firstName: "User2",
          lastName: null,
          email: null,
          customAttributes: {},
          consentStatus: "PENDING",
          consentSource: null,
          consentTimestamp: null,
          isSuppressed: false,
          suppressedAt: null,
          suppressionReason: null,
          createdAt: new Date(),
          updatedAt: new Date(),
        }
      );

      const res = await request(app)
        .post(`/api/v1/audiences/${listId}/members`)
        .set("x-test-org-id", "org_test")
        .send({
          contactIds: ["cnt_1", "cnt_2"],
        });

      expect(res.status).toBe(200);
      expect(res.body.data.totalMembers).toBe(2);

      // Adding duplicate should not duplicate
      const resDup = await request(app)
        .post(`/api/v1/audiences/${listId}/members`)
        .set("x-test-org-id", "org_test")
        .send({
          contactIds: ["cnt_1"],
        });

      expect(resDup.status).toBe(200);
      expect(resDup.body.data.totalMembers).toBe(2);
    });
  });

  describe("CSV Import Engine & Consent Protection", () => {
    it("should generate preview with header detection and sample rows", async () => {
      const csv = `Phone,First Name,Email\n9876543210,Aarav,aarav@example.com\n9876543211,Diya,diya@example.com`;

      const res = await request(app)
        .post("/api/v1/contacts/import/preview")
        .set("x-test-org-id", "org_test")
        .send({ csvContent: csv, fileName: "customers.csv" });

      expect(res.status).toBe(200);
      expect(res.body.data.headers).toEqual(["Phone", "First Name", "Email"]);
      expect(res.body.data.totalEstimatedRows).toBe(2);
      expect(res.body.data.suggestedMappings.phoneNumber).toBe("Phone");
      expect(res.body.data.suggestedMappings.firstName).toBe("First Name");
    });

    it("should execute import with duplicate detection, E.164 normalization, and consent protection", async () => {
      // Seed existing suppressed contact
      mockContacts.push({
        id: "cnt_suppressed_contact",
        organizationId: "org_test",
        phoneNumber: "+919876543210",
        countryCode: "+91",
        firstName: "Suppressed",
        lastName: "User",
        email: "suppressed@example.com",
        customAttributes: {},
        consentStatus: "OPTED_OUT",
        consentSource: "PREVIOUS_OPT_OUT",
        consentTimestamp: new Date(),
        isSuppressed: true,
        suppressedAt: new Date(),
        suppressionReason: "DND Requested",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // CSV with:
      // Row 1: Valid new contact
      // Row 2: In-file duplicate of Row 1
      // Row 3: Target of existing suppressed contact
      // Row 4: Invalid phone number
      const csv = `phone,name,email
9876543222,New Contact,new@example.com
9876543222,New Contact Dup,new@example.com
9876543210,Suppressed Reopt Attempt,suppressed@example.com
invalid_phone,Bad Row,bad@example.com`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_test")
        .send({
          csvContent: csv,
          fileName: "test_batch.csv",
          clientRequestId: `req_${Date.now()}`,
          newListName: "Imported Batch List",
          mappings: {
            phoneNumber: "phone",
            firstName: "name",
            email: "email",
          },
          defaultCountryCode: "+91",
          operatorConsentDeclaration: "Bulk import test with consent verification",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.totalRows).toBe(4);
      expect(res.body.data.createdContacts).toBe(1); // 9876543222 created
      expect(res.body.data.skippedDuplicates).toBe(1); // 2nd 9876543222 skipped
      expect(res.body.data.skippedSuppressed).toBe(1); // 9876543210 suppressed preserved
      expect(res.body.data.invalidRows).toBe(1); // invalid_phone failed
      expect(res.body.data.rowErrors.length).toBe(1);

      // Verify suppressed contact was NOT re-opted in
      const suppressedContact = mockContacts.find((c) => c.phoneNumber === "+919876543210");
      expect(suppressedContact?.isSuppressed).toBe(true);
      expect(suppressedContact?.consentStatus).toBe("OPTED_OUT");
    });
  });
});
