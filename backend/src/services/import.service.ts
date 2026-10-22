import crypto from "crypto";
import { getPrismaClient } from "../config/prisma.js";
import { normalizePhoneNumber } from "../utils/phone.js";
import { parseFullCsv, previewCsvContent, suggestHeaderMappings } from "../utils/csv.js";
import { AppError, NotFoundError } from "../utils/errors.js";
import {
  CsvPreviewInput,
  CsvExecuteImportInput,
} from "../validators/contact.validator.js";
import { Prisma, ConsentStatus } from "@prisma/client";

/**
 * Safely normalizes raw consent strings from CSV.
 * Accepts case-insensitive, trimmed variations of 'OPTED_IN', 'OPT_IN', 'OPTED_OUT', 'OPT_OUT', 'PENDING', 'UNKNOWN'.
 * Rejects arbitrary values like 'Yes', '1', 'true' by returning null (safe default to PENDING).
 */
export function normalizeConsentValue(raw?: string): ConsentStatus | null {
  if (!raw || typeof raw !== "string") return null;
  const clean = raw.trim().toUpperCase().replace(/[\s_-]+/g, "_");
  if (
    clean === "OPTED_IN" ||
    clean === "OPT_IN" ||
    clean === "OPTEDIN" ||
    clean === "OPTIN"
  ) {
    return ConsentStatus.OPTED_IN;
  }
  if (
    clean === "OPTED_OUT" ||
    clean === "OPT_OUT" ||
    clean === "OPTEDOUT" ||
    clean === "OPTOUT"
  ) {
    return ConsentStatus.OPTED_OUT;
  }
  if (clean === "PENDING") return ConsentStatus.PENDING;
  if (clean === "UNKNOWN") return ConsentStatus.UNKNOWN;
  return null;
}

/**
 * Case-insensitive lookup of a column in row values.
 */
function getRowValue(values: Record<string, string>, colName?: string): string | undefined {
  if (!colName) return undefined;
  if (values[colName] !== undefined) return values[colName];
  const target = colName.trim().toLowerCase();
  for (const [k, v] of Object.entries(values)) {
    if (k.trim().toLowerCase() === target) return v;
  }
  return undefined;
}

export interface RowErrorItem {
  rowNumber: number;
  reason: string;
  rawPhone?: string;
}

export class ImportService {
  /**
   * Generates a preview of the CSV content with detected headers and mapping suggestions.
   */
  public async preview(input: CsvPreviewInput) {
    if (!input.csvContent || !input.csvContent.trim()) {
      throw new AppError("CSV content cannot be empty", 400, "EMPTY_CSV");
    }

    try {
      const preview = previewCsvContent(input.csvContent, 10);
      return preview;
    } catch (err) {
      throw new AppError(
        err instanceof Error ? err.message : "Failed to parse CSV file",
        422,
        "INVALID_CSV"
      );
    }
  }

  /**
   * Executes CSV import with row-by-row validation, duplicate detection,
   * consent protection, and list assignment.
   */
  public async executeImport(
    organizationId: string,
    input: CsvExecuteImportInput,
    userId = "system_user"
  ) {
    const prisma = getPrismaClient();

    // 1. Calculate file hash for audit & deduplication
    const fileHash = crypto
      .createHash("sha256")
      .update(input.csvContent)
      .digest("hex");
    const fileSizeBytes = Buffer.byteLength(input.csvContent, "utf8");

    // Check if idempotent import job exists with this clientRequestId
    const existingJob = await prisma.importJob.findFirst({
      where: {
        organizationId,
        clientRequestId: input.clientRequestId,
      },
    });

    if (existingJob && existingJob.status === "COMPLETED") {
      return this.formatJobResponse(existingJob);
    }

    // 2. Parse CSV rows
    let rows: ReturnType<typeof parseFullCsv>["rows"];
    let headers: string[] = [];
    try {
      const parsed = parseFullCsv(input.csvContent);
      rows = parsed.rows;
      headers = parsed.headers;
    } catch (err) {
      throw new AppError(
        err instanceof Error ? err.message : "Failed to parse CSV content",
        422,
        "CSV_PARSE_ERROR"
      );
    }

    if (rows.length === 0) {
      throw new AppError("The CSV file contains no data rows", 422, "EMPTY_CSV_DATA");
    }

    // 3. Resolve destination list if requested
    let targetListId = input.listId || null;
    if (!targetListId && input.newListName && input.newListName.trim()) {
      const trimmedName = input.newListName.trim();
      let list = await prisma.contactList.findFirst({
        where: {
          organizationId,
          name: { equals: trimmedName, mode: "insensitive" },
        },
      });

      if (!list) {
        list = await prisma.contactList.create({
          data: {
            organizationId,
            name: trimmedName,
            description: `Imported from ${input.fileName} on ${new Date().toLocaleDateString()}`,
          },
        });
      }
      targetListId = list.id;
    } else if (targetListId) {
      const list = await prisma.contactList.findFirst({
        where: { id: targetListId, organizationId },
      });
      if (!list) {
        throw new NotFoundError("Target audience list not found");
      }
    }

    // 4. Create or update ImportJob record
    const importJob = await prisma.importJob.create({
      data: {
        organizationId,
        listId: targetListId,
        fileName: input.fileName,
        fileSizeBytes,
        fileHash,
        clientRequestId: input.clientRequestId,
        status: "PROCESSING",
        totalRows: rows.length,
        operatorConsentDeclaration: input.operatorConsentDeclaration || null,
        declaredBy: userId,
        startedAt: new Date(),
      },
    });

    // 5. Execute batch processing
    const detectedMappings = suggestHeaderMappings(headers);
    const phoneCol = input.mappings.phoneNumber;
    const firstNameCol = input.mappings.firstName;
    const lastNameCol = input.mappings.lastName;
    const emailCol = input.mappings.email;
    const consentCol = input.mappings.consentStatus || detectedMappings.consentStatus;
    const customColNames = input.mappings.customAttributes || [];

    const seenPhonesInFile = new Set<string>();
    const rowErrors: RowErrorItem[] = [];

    let createdContacts = 0;
    let updatedContacts = 0;
    let skippedDuplicates = 0;
    let skippedSuppressed = 0;
    let invalidRows = 0;
    let addedToList = 0;

    const contactsToAssignToList: string[] = [];

    // Pre-fetch all existing contacts for this organization to minimize DB roundtrips
    const existingContacts = await prisma.contact.findMany({
      where: { organizationId },
      select: {
        id: true,
        phoneNumber: true,
        consentStatus: true,
        isSuppressed: true,
      },
    });

    const contactMap = new Map<
      string,
      {
        id: string;
        phoneNumber: string;
        consentStatus: string;
        isSuppressed: boolean;
      }
    >();
    for (const c of existingContacts) {
      contactMap.set(c.phoneNumber, c);
    }

    const defaultCc = input.defaultCountryCode || "+91";

    // Process rows
    for (const row of rows) {
      const rawPhone = getRowValue(row.values, phoneCol);

      // Validation: Phone is mandatory
      if (!rawPhone || !rawPhone.trim()) {
        invalidRows++;
        rowErrors.push({
          rowNumber: row.rowNumber,
          reason: `Missing phone number in column '${phoneCol}'`,
        });
        continue;
      }

      // E.164 normalization
      const normalized = normalizePhoneNumber(rawPhone, defaultCc);
      if (!normalized.valid || !normalized.e164) {
        invalidRows++;
        rowErrors.push({
          rowNumber: row.rowNumber,
          reason: normalized.error || "Invalid phone number",
          rawPhone,
        });
        continue;
      }

      const e164 = normalized.e164;

      // Duplicate check within file
      if (seenPhonesInFile.has(e164)) {
        skippedDuplicates++;
        continue;
      }
      seenPhonesInFile.add(e164);

      // Extract names and email using case-insensitive column lookup
      const rawFirstName = firstNameCol ? getRowValue(row.values, firstNameCol)?.trim() : undefined;
      const rawLastName = lastNameCol ? getRowValue(row.values, lastNameCol)?.trim() : undefined;
      const rawEmail = emailCol ? getRowValue(row.values, emailCol)?.trim() : undefined;

      // Extract and normalize consent status from mapped column or detected column
      const rawConsent = getRowValue(row.values, consentCol);
      const normalizedConsent = normalizeConsentValue(rawConsent);

      // Email validation if supplied
      if (rawEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(rawEmail)) {
        invalidRows++;
        rowErrors.push({
          rowNumber: row.rowNumber,
          reason: `Invalid email address '${rawEmail}'`,
          rawPhone,
        });
        continue;
      }

      // Collect custom attributes
      const customAttrs: Record<string, string> = {};
      for (const col of customColNames) {
        const val = getRowValue(row.values, col);
        if (val !== undefined) {
          customAttrs[col] = val;
        }
      }

      // Check against existing database contact
      const existing = contactMap.get(e164);

      if (existing) {
        // CONSENT & SUPPRESSION PROTECTION:
        // If contact is already suppressed or explicitly opted out, do NOT re-opt them in!
        if (existing.isSuppressed || existing.consentStatus === "OPTED_OUT") {
          skippedSuppressed++;
          // Still associate with target list if permitted, but never alter suppression
          contactsToAssignToList.push(existing.id);
          continue;
        }

        // Determine if safe consent upgrade applies:
        // If existing contact is PENDING or UNKNOWN, and CSV row has explicit OPTED_IN,
        // upgrade them to OPTED_IN and record ConsentEvent audit trail.
        // Never downgrade existing OPTED_IN, and never overwrite unsafely.
        const shouldUpgradeConsent =
          normalizedConsent === ConsentStatus.OPTED_IN &&
          existing.consentStatus !== ConsentStatus.OPTED_IN;

        const updateData: Prisma.ContactUpdateInput = {
          firstName: rawFirstName || undefined,
          lastName: rawLastName || undefined,
          email: rawEmail || undefined,
          customAttributes: Object.keys(customAttrs).length > 0
            ? (customAttrs as Prisma.InputJsonValue)
            : undefined,
        };

        if (shouldUpgradeConsent) {
          updateData.consentStatus = ConsentStatus.OPTED_IN;
          updateData.consentSource = `CSV_IMPORT:${input.fileName}`;
          updateData.consentTimestamp = new Date();
        }

        await prisma.contact.update({
          where: { id: existing.id },
          data: updateData,
        });

        if (shouldUpgradeConsent) {
          await prisma.consentEvent.create({
            data: {
              organizationId,
              contactId: existing.id,
              eventType: "OPT_IN",
              source: `CSV_IMPORT:${input.fileName}`,
              evidence:
                input.operatorConsentDeclaration ||
                "Imported via CSV file with explicit opt-in",
              performedBy: userId,
            },
          });
          existing.consentStatus = ConsentStatus.OPTED_IN;
        }

        updatedContacts++;
        contactsToAssignToList.push(existing.id);
      } else {
        // Create new contact (Default is strictly PENDING if consent missing/blank/invalid)
        const initialConsent = normalizedConsent || ConsentStatus.PENDING;

        const newContact = await prisma.contact.create({
          data: {
            organizationId,
            phoneNumber: e164,
            countryCode: normalized.countryCode || defaultCc,
            firstName: rawFirstName || null,
            lastName: rawLastName || null,
            email: rawEmail || null,
            customAttributes: customAttrs as Prisma.InputJsonValue,
            consentStatus: initialConsent,
            consentSource: `CSV_IMPORT:${input.fileName}`,
            consentTimestamp: new Date(),
          },
        });

        // Record auditable consent event
        await prisma.consentEvent.create({
          data: {
            organizationId,
            contactId: newContact.id,
            eventType:
              initialConsent === ConsentStatus.OPTED_OUT
                ? "OPT_OUT"
                : "OPT_IN",
            source: `CSV_IMPORT:${input.fileName}`,
            evidence:
              input.operatorConsentDeclaration ||
              (initialConsent === ConsentStatus.OPTED_IN
                ? "Imported via CSV file with explicit opt-in"
                : "Imported via CSV file"),
            performedBy: userId,
          },
        });

        contactMap.set(e164, {
          id: newContact.id,
          phoneNumber: e164,
          consentStatus: initialConsent,
          isSuppressed: false,
        });

        createdContacts++;
        contactsToAssignToList.push(newContact.id);
      }
    }

    // 6. Bulk attach contacts to destination list if list specified
    if (targetListId && contactsToAssignToList.length > 0) {
      const memberInserts = contactsToAssignToList.map((cid) => ({
        organizationId,
        listId: targetListId,
        contactId: cid,
        source: "CSV_IMPORT",
      }));

      const result = await prisma.contactListMember.createMany({
        data: memberInserts,
        skipDuplicates: true,
      });

      addedToList = result.count;
    }

    // 7. Complete the ImportJob
    const finalStatus =
      rowErrors.length > 0 ? "COMPLETED_WITH_ERRORS" : "COMPLETED";

    const completedJob = await prisma.importJob.update({
      where: { id: importJob.id },
      data: {
        status: finalStatus,
        processedRows: rows.length,
        lastProcessedRow: rows.length,
        createdContacts,
        updatedContacts,
        addedToList,
        skippedDuplicates,
        skippedSuppressed,
        invalidRows,
        rowErrors: (rowErrors.slice(0, 500) as unknown as Prisma.InputJsonValue),
        completedAt: new Date(),
      },
    });

    return this.formatJobResponse(completedJob);
  }

  /**
   * Lists past import jobs for the organization.
   */
  public async listJobs(organizationId: string) {
    const prisma = getPrismaClient();

    const jobs = await prisma.importJob.findMany({
      where: { organizationId },
      orderBy: { createdAt: "desc" },
      take: 20,
      include: {
        list: {
          select: {
            id: true,
            name: true,
          },
        },
      },
    });

    return jobs.map((j) => this.formatJobResponse(j));
  }

  /**
   * Retrieves single import job status and row error log.
   */
  public async getJobById(organizationId: string, id: string) {
    const prisma = getPrismaClient();

    const job = await prisma.importJob.findFirst({
      where: { id, organizationId },
      include: {
        list: true,
      },
    });

    if (!job) {
      throw new NotFoundError("Import job not found");
    }

    return this.formatJobResponse(job);
  }

  private formatJobResponse(job: any) {
    return {
      id: job.id,
      organizationId: job.organizationId,
      listId: job.listId,
      listName: job.list?.name || null,
      fileName: job.fileName,
      fileSizeBytes: job.fileSizeBytes,
      status: job.status,
      totalRows: job.totalRows,
      processedRows: job.processedRows,
      createdContacts: job.createdContacts,
      updatedContacts: job.updatedContacts,
      addedToList: job.addedToList,
      skippedDuplicates: job.skippedDuplicates,
      skippedSuppressed: job.skippedSuppressed,
      invalidRows: job.invalidRows,
      rowErrors: job.rowErrors || [],
      startedAt: job.startedAt,
      completedAt: job.completedAt,
      createdAt: job.createdAt,
    };
  }
}

export const importService = new ImportService();
