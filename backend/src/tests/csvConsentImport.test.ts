import { describe, it, expect, beforeEach, vi } from "vitest";
import request from "supertest";
import { app } from "../app.js";
import { normalizeConsentValue } from "../services/import.service.js";
import { suggestHeaderMappings } from "../utils/csv.js";

// In-memory mock data
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

let mockContacts: MockContact[] = [];
let mockEvents: MockConsentEvent[] = [];

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
              return true;
            }).length;
          }),
          findMany: vi.fn().mockImplementation(async ({ where }) => {
            return mockContacts.filter((c) => {
              if (c.organizationId !== where.organizationId) return false;
              return true;
            }).map((c) => ({
              ...c,
              listMemberships: [],
            }));
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
        },
        consentEvent: {
          create: vi.fn().mockImplementation(async ({ data }) => {
            const evt: MockConsentEvent = {
              id: `ce_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
              organizationId: data.organizationId,
              contactId: data.contactId,
              eventType: data.eventType,
              source: data.source,
              evidence: data.evidence || null,
              performedBy: data.performedBy || "system_user",
              createdAt: new Date(),
            };
            mockEvents.push(evt);
            return evt;
          }),
        },
        importJob: {
          findFirst: vi.fn().mockImplementation(async () => null),
          create: vi.fn().mockImplementation(async ({ data }) => ({
            id: `job_${Date.now()}`,
            ...data,
            attemptNumber: 1,
            leaseVersion: 0,
            createdAt: new Date(),
          })),
          update: vi.fn().mockImplementation(async ({ where, data }) => ({
            id: where.id,
            ...data,
          })),
        },
        contactList: {
          create: vi.fn().mockImplementation(async ({ data }) => ({
            id: `lst_${Date.now()}`,
            ...data,
            createdAt: new Date(),
            updatedAt: new Date(),
          })),
        },
        contactListMember: {
          createMany: vi.fn().mockImplementation(async ({ data }) => ({
            count: data.length,
          })),
        },
      };
      return client;
    },
  };
});

describe("CSV Consent Status Normalization & Import Fix", () => {
  beforeEach(() => {
    mockContacts = [];
    mockEvents = [];
    vi.clearAllMocks();
  });

  describe("Unit: normalizeConsentValue", () => {
    it("should normalize valid OPTED_IN with case, whitespace, hyphen, and underscore variations", () => {
      expect(normalizeConsentValue("OPTED_IN")).toBe("OPTED_IN");
      expect(normalizeConsentValue("opted_in")).toBe("OPTED_IN");
      expect(normalizeConsentValue("  OPTED_IN  ")).toBe("OPTED_IN");
      expect(normalizeConsentValue(" Opted_In ")).toBe("OPTED_IN");
      expect(normalizeConsentValue("OPT_IN")).toBe("OPTED_IN");
      expect(normalizeConsentValue("opt-in")).toBe("OPTED_IN");
      expect(normalizeConsentValue("OPTED IN")).toBe("OPTED_IN");
      expect(normalizeConsentValue("optin")).toBe("OPTED_IN");
      expect(normalizeConsentValue("optedin")).toBe("OPTED_IN");
    });

    it("should normalize OPTED_OUT and PENDING correctly across variations", () => {
      expect(normalizeConsentValue("OPTED_OUT")).toBe("OPTED_OUT");
      expect(normalizeConsentValue("opted_out ")).toBe("OPTED_OUT");
      expect(normalizeConsentValue("opt_out")).toBe("OPTED_OUT");
      expect(normalizeConsentValue("OPT-OUT")).toBe("OPTED_OUT");
      expect(normalizeConsentValue("PENDING")).toBe("PENDING");
      expect(normalizeConsentValue("pending")).toBe("PENDING");
      expect(normalizeConsentValue("  pending  ")).toBe("PENDING");
      expect(normalizeConsentValue("UNKNOWN")).toBe("UNKNOWN");
    });

    it("should safely return null for arbitrary values (Yes, 1, true, invalid)", () => {
      expect(normalizeConsentValue("Yes")).toBeNull();
      expect(normalizeConsentValue("1")).toBeNull();
      expect(normalizeConsentValue("true")).toBeNull();
      expect(normalizeConsentValue("Y")).toBeNull();
      expect(normalizeConsentValue("random_string")).toBeNull();
      expect(normalizeConsentValue("")).toBeNull();
      expect(normalizeConsentValue("   ")).toBeNull();
      expect(normalizeConsentValue(undefined)).toBeNull();
    });
  });

  describe("Unit: suggestHeaderMappings for Consent Headers", () => {
    it("should auto-detect various consent column headers case-insensitively", () => {
      expect(suggestHeaderMappings(["phone", "name", "consent"]).consentStatus).toBe("consent");
      expect(suggestHeaderMappings(["Mobile", "Consent Status", "Email"]).consentStatus).toBe("Consent Status");
      expect(suggestHeaderMappings(["Phone", "consent_status", "Email"]).consentStatus).toBe("consent_status");
      expect(suggestHeaderMappings(["Phone", "consentStatus", "Email"]).consentStatus).toBe("consentStatus");
      expect(suggestHeaderMappings(["Phone", "Opt-In", "First Name"]).consentStatus).toBe("Opt-In");
      expect(suggestHeaderMappings(["Phone", "optin", "First Name"]).consentStatus).toBe("optin");
      expect(suggestHeaderMappings(["Phone", "optinstatus", "First Name"]).consentStatus).toBe("optinstatus");
      expect(suggestHeaderMappings(["Phone", "opted_in", "First Name"]).consentStatus).toBe("opted_in");
      expect(suggestHeaderMappings(["Phone", "whatsapp_consent"]).consentStatus).toBe("whatsapp_consent");
      expect(suggestHeaderMappings(["Phone", "whatsappconsent"]).consentStatus).toBe("whatsappconsent");
      expect(suggestHeaderMappings(["Phone", "marketingconsent"]).consentStatus).toBe("marketingconsent");
      expect(suggestHeaderMappings(["Phone", "marketing_consent"]).consentStatus).toBe("marketing_consent");
    });
  });

  describe("Integration: CSV Import with Consent Column", () => {
    it("should preview CSV and detect consent column mapping", async () => {
      const csv = `Phone,Full Name,Consent\n9876543210,Diya Reddy,OPTED_IN`;
      const res = await request(app)
        .post("/api/v1/contacts/import/preview")
        .set("x-test-org-id", "org_consent_test")
        .send({ csvContent: csv, fileName: "test.csv" });

      expect(res.status).toBe(200);
      expect(res.body.data.suggestedMappings.consentStatus).toBe("Consent");
    });

    it("should import contact with OPTED_IN and persist as OPTED_IN with ConsentEvent", async () => {
      const csv = `phone,name,email,consent
9876543210,Diya Reddy,diya@example.com,OPTED_IN`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "diya_optin.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "name",
            email: "email",
            consentStatus: "consent",
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.createdContacts).toBe(1);

      const contact = mockContacts.find((c) => c.phoneNumber === "+919876543210");
      expect(contact).toBeDefined();
      expect(contact?.firstName).toBe("Diya Reddy");
      expect(contact?.consentStatus).toBe("OPTED_IN");
      expect(contact?.consentSource).toBe("CSV_IMPORT:diya_optin.csv");

      const event = mockEvents.find((e) => e.contactId === contact?.id);
      expect(event).toBeDefined();
      expect(event?.eventType).toBe("OPT_IN");
      expect(event?.source).toBe("CSV_IMPORT:diya_optin.csv");
    });

    it("should auto-detect consent column when mappings.consentStatus is omitted", async () => {
      const csv = `phone,name,email,consent_status
9876543299,Auto Detect User,autodetect@example.com,OPTED_IN`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "autodetect.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "name",
            email: "email",
            // consentStatus omitted intentionally
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.createdContacts).toBe(1);

      const contact = mockContacts.find((c) => c.phoneNumber === "+919876543299");
      expect(contact).toBeDefined();
      expect(contact?.consentStatus).toBe("OPTED_IN");
    });

    it("should match column names case-insensitively", async () => {
      // CSV has uppercase 'CONSENT', mapping passes lowercase 'consent'
      const csv = `PHONE,NAME,CONSENT
9876543298,Case Test User,OPT_IN`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "case_test.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "name",
            consentStatus: "consent",
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.createdContacts).toBe(1);

      const contact = mockContacts.find((c) => c.phoneNumber === "+919876543298");
      expect(contact?.consentStatus).toBe("OPTED_IN");
    });

    it("should default missing or blank consent to PENDING", async () => {
      const csv = `phone,name,email,consent
9876543211,Blank Consent User,blank@example.com,
9876543212,No Consent User,none@example.com,`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "pending_batch.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "name",
            email: "email",
            consentStatus: "consent",
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.createdContacts).toBe(2);

      const c1 = mockContacts.find((c) => c.phoneNumber === "+919876543211");
      const c2 = mockContacts.find((c) => c.phoneNumber === "+919876543212");
      expect(c1?.consentStatus).toBe("PENDING");
      expect(c2?.consentStatus).toBe("PENDING");
    });

    it("should fail safely to PENDING when consent value is invalid (e.g. Yes or 1)", async () => {
      const csv = `phone,name,consent
9876543213,Arbitrary Yes User,Yes
9876543214,Numeric 1 User,1
9876543215,Random String User,GRANTED`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "arbitrary_consent.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "name",
            consentStatus: "consent",
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.createdContacts).toBe(3);

      const c1 = mockContacts.find((c) => c.phoneNumber === "+919876543213");
      const c2 = mockContacts.find((c) => c.phoneNumber === "+919876543214");
      const c3 = mockContacts.find((c) => c.phoneNumber === "+919876543215");

      // All arbitrary values must fail safely to PENDING
      expect(c1?.consentStatus).toBe("PENDING");
      expect(c2?.consentStatus).toBe("PENDING");
      expect(c3?.consentStatus).toBe("PENDING");
    });

    it("should import explicit OPTED_OUT as OPTED_OUT", async () => {
      const csv = `phone,name,consent
9876543216,Opted Out Contact,OPTED_OUT`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "optout.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "name",
            consentStatus: "consent",
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.createdContacts).toBe(1);

      const contact = mockContacts.find((c) => c.phoneNumber === "+919876543216");
      expect(contact?.consentStatus).toBe("OPTED_OUT");

      const evt = mockEvents.find((e) => e.contactId === contact?.id);
      expect(evt?.eventType).toBe("OPT_OUT");
    });

    it("should NEVER convert suppressed or OPTED_OUT contacts into OPTED_IN", async () => {
      // Seed existing suppressed contact
      mockContacts.push({
        id: "cnt_suppressed_1",
        organizationId: "org_consent_test",
        phoneNumber: "+919876543220",
        countryCode: "+91",
        firstName: "Suppressed Contact",
        lastName: null,
        email: "sup@example.com",
        customAttributes: {},
        consentStatus: "OPTED_OUT",
        consentSource: "PREVIOUS_OPT_OUT",
        consentTimestamp: new Date(),
        isSuppressed: true,
        suppressedAt: new Date(),
        suppressionReason: "Customer requested STOP",
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // Seed existing non-suppressed but OPTED_OUT contact
      mockContacts.push({
        id: "cnt_optout_1",
        organizationId: "org_consent_test",
        phoneNumber: "+919876543221",
        countryCode: "+91",
        firstName: "Opted Out Contact",
        lastName: null,
        email: "optout@example.com",
        customAttributes: {},
        consentStatus: "OPTED_OUT",
        consentSource: "PREVIOUS_OPT_OUT",
        consentTimestamp: new Date(),
        isSuppressed: false,
        suppressedAt: null,
        suppressionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      // CSV attempts to mark both as OPTED_IN
      const csv = `phone,name,consent
9876543220,Suppressed Contact,OPTED_IN
9876543221,Opted Out Contact,OPTED_IN`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "illegal_reoptin.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "name",
            consentStatus: "consent",
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.skippedSuppressed).toBe(2);
      expect(res.body.data.updatedContacts).toBe(0);

      // Verify neither contact was updated to OPTED_IN
      const c1 = mockContacts.find((c) => c.phoneNumber === "+919876543220");
      const c2 = mockContacts.find((c) => c.phoneNumber === "+919876543221");
      expect(c1?.isSuppressed).toBe(true);
      expect(c1?.consentStatus).toBe("OPTED_OUT");
      expect(c2?.consentStatus).toBe("OPTED_OUT");
    });

    it("should safely upgrade existing PENDING contact to OPTED_IN and not duplicate", async () => {
      // Seed existing contact with PENDING consent
      mockContacts.push({
        id: "cnt_diya_reddy",
        organizationId: "org_consent_test",
        phoneNumber: "+919876543230",
        countryCode: "+91",
        firstName: "Diya",
        lastName: "Reddy",
        email: "diya@example.com",
        customAttributes: {},
        consentStatus: "PENDING",
        consentSource: "CSV_IMPORT:old_file.csv",
        consentTimestamp: new Date(),
        isSuppressed: false,
        suppressedAt: null,
        suppressionReason: null,
        createdAt: new Date(),
        updatedAt: new Date(),
      });

      const initialCount = mockContacts.length;

      const csv = `phone,first_name,last_name,email,consent
9876543230,Diya,Reddy,diya@example.com,OPTED_IN`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "reimport_diya.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "first_name",
            lastName: "last_name",
            email: "email",
            consentStatus: "consent",
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.createdContacts).toBe(0);
      expect(res.body.data.updatedContacts).toBe(1);
      // No duplicate contact added to database
      expect(mockContacts.length).toBe(initialCount);

      const contact = mockContacts.find((c) => c.phoneNumber === "+919876543230");
      expect(contact?.consentStatus).toBe("OPTED_IN");
      expect(contact?.consentSource).toBe("CSV_IMPORT:reimport_diya.csv");

      // Verify audit event was logged
      const evt = mockEvents.find((e) => e.contactId === "cnt_diya_reddy");
      expect(evt).toBeDefined();
      expect(evt?.eventType).toBe("OPT_IN");

      // Query audience list to verify API returns the updated consent status
      const getRes = await request(app)
        .get("/api/v1/contacts")
        .set("x-test-org-id", "org_consent_test");

      expect(getRes.status).toBe(200);
      const returnedContact = getRes.body.data.items.find((c: any) => c.phoneNumber === "+919876543230");
      expect(returnedContact.consentStatus).toBe("OPTED_IN");
    });

    it("should NOT downgrade existing OPTED_IN contact if CSV has missing, blank, or invalid consent", async () => {
      // Seed existing contact with OPTED_IN
      mockContacts.push({
        id: "cnt_opted_in_user",
        organizationId: "org_consent_test",
        phoneNumber: "+919876543240",
        countryCode: "+91",
        firstName: "VIP Customer",
        lastName: null,
        email: "vip@example.com",
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

      // CSV with blank consent column
      const csv = `phone,first_name,consent\n9876543240,VIP Customer Updated,`;

      const res = await request(app)
        .post("/api/v1/contacts/import")
        .set("x-test-org-id", "org_consent_test")
        .send({
          csvContent: csv,
          fileName: "update_vip.csv",
          clientRequestId: `req_${Date.now()}`,
          mappings: {
            phoneNumber: "phone",
            firstName: "first_name",
            consentStatus: "consent",
          },
          defaultCountryCode: "+91",
        });

      expect(res.status).toBe(200);
      expect(res.body.data.updatedContacts).toBe(1);

      const contact = mockContacts.find((c) => c.phoneNumber === "+919876543240");
      expect(contact?.firstName).toBe("VIP Customer Updated");
      // Consent status MUST remain OPTED_IN
      expect(contact?.consentStatus).toBe("OPTED_IN");
      expect(contact?.consentSource).toBe("WEB_FORM");
    });
  });
});
