/**
 * Safe, memory-bounded RFC 4180 compliant CSV parser and header detector.
 * Supports quoted fields, escaped quotes (""), newlines within quotes, and CRLF / LF linebreaks.
 */

export interface ParsedCsvRow {
  rowNumber: number; // 1-based data row index (row 1 is first row after headers)
  values: Record<string, string>;
  rawValues: string[];
}

export interface CsvPreviewResult {
  headers: string[];
  totalEstimatedRows: number;
  previewRows: Array<Record<string, string>>;
  suggestedMappings: {
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    consentStatus?: string;
  };
}

export interface CsvParseOptions {
  maxRows?: number; // Protection against unbounded memory consumption (default: 10,000)
  delimiter?: string;
}

const DEFAULT_MAX_ROWS = 10000;

/**
 * Parses raw CSV line into array of field strings respecting RFC 4180 quotes.
 */
export function parseCsvLine(line: string, delimiter = ","): string[] {
  const fields: string[] = [];
  let currentField = "";
  let inQuotes = false;
  let i = 0;

  while (i < line.length) {
    const char = line[i];

    if (inQuotes) {
      if (char === '"') {
        // Escaped quote check
        if (i + 1 < line.length && line[i + 1] === '"') {
          currentField += '"';
          i += 2;
          continue;
        } else {
          inQuotes = false;
          i++;
          continue;
        }
      } else {
        currentField += char;
        i++;
        continue;
      }
    } else {
      if (char === '"') {
        inQuotes = true;
        i++;
        continue;
      } else if (char === delimiter) {
        fields.push(currentField.trim());
        currentField = "";
        i++;
        continue;
      } else {
        currentField += char;
        i++;
        continue;
      }
    }
  }

  fields.push(currentField.trim());
  return fields;
}

/**
 * Splits CSV content into logical records handling multiline quoted fields safely.
 */
export function splitCsvRecords(content: string): string[] {
  const records: string[] = [];
  let currentRecord = "";
  let inQuotes = false;
  let i = 0;

  // Strip UTF-8 BOM if present
  const cleanContent = content.charCodeAt(0) === 0xfeff ? content.slice(1) : content;

  while (i < cleanContent.length) {
    const char = cleanContent[i];

    if (char === '"') {
      if (inQuotes && i + 1 < cleanContent.length && cleanContent[i + 1] === '"') {
        currentRecord += '""';
        i += 2;
        continue;
      }
      inQuotes = !inQuotes;
      currentRecord += char;
      i++;
      continue;
    }

    if (!inQuotes && (char === "\n" || (char === "\r" && cleanContent[i + 1] === "\n"))) {
      if (char === "\r") i++; // Skip \r in CRLF
      if (currentRecord.trim().length > 0) {
        records.push(currentRecord);
      }
      currentRecord = "";
      i++;
      continue;
    }

    currentRecord += char;
    i++;
  }

  if (currentRecord.trim().length > 0) {
    records.push(currentRecord);
  }

  return records;
}

/**
 * Detects standard contact field names from raw header strings.
 */
export function suggestHeaderMappings(headers: string[]): {
  phoneNumber?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  consentStatus?: string;
} {
  const suggestions: {
    phoneNumber?: string;
    firstName?: string;
    lastName?: string;
    email?: string;
    consentStatus?: string;
  } = {};

  const clean = (h: string) => h.toLowerCase().replace(/[^a-z0-9]/g, "");

  for (const header of headers) {
    const h = clean(header);

    // Phone / Mobile detection
    if (!suggestions.phoneNumber) {
      if (
        h === "phone" ||
        h === "phonenumber" ||
        h === "mobile" ||
        h === "mobilenumber" ||
        h === "contact" ||
        h === "contactnumber" ||
        h === "whatsapp" ||
        h === "cell"
      ) {
        suggestions.phoneNumber = header;
        continue;
      }
    }

    // First Name detection
    if (!suggestions.firstName) {
      if (
        h === "firstname" ||
        h === "fname" ||
        h === "first" ||
        h === "name" ||
        h === "fullname" ||
        h === "contactname"
      ) {
        suggestions.firstName = header;
        continue;
      }
    }

    // Last Name detection
    if (!suggestions.lastName) {
      if (h === "lastname" || h === "lname" || h === "last" || h === "surname") {
        suggestions.lastName = header;
        continue;
      }
    }

    // Email detection
    if (!suggestions.email) {
      if (h === "email" || h === "emailaddress" || h === "mail") {
        suggestions.email = header;
        continue;
      }
    }

    // Consent Status detection
    if (!suggestions.consentStatus) {
      if (
        h === "consent" ||
        h === "consentstatus" ||
        h === "optin" ||
        h === "optinstatus" ||
        h === "optedin" ||
        h === "optedinstatus" ||
        h === "whatsappconsent" ||
        h === "marketingconsent" ||
        h === "consentstate"
      ) {
        suggestions.consentStatus = header;
        continue;
      }
    }
  }

  return suggestions;
}

/**
 * Generates preview of CSV including headers, row count, sample records, and column mapping suggestions.
 */
export function previewCsvContent(
  csvContent: string,
  previewLimit = 10,
  maxTotalRows = DEFAULT_MAX_ROWS
): CsvPreviewResult {
  const records = splitCsvRecords(csvContent);

  if (records.length === 0) {
    throw new Error("The uploaded CSV file is empty.");
  }

  const rawHeaders = parseCsvLine(records[0]);
  const headers = rawHeaders.map((h, idx) => h.trim() || `column_${idx + 1}`);

  if (headers.length === 0) {
    throw new Error("Could not detect any valid column headers in CSV.");
  }

  const dataRecords = records.slice(1);
  const totalEstimatedRows = dataRecords.length;

  if (totalEstimatedRows > maxTotalRows) {
    throw new Error(
      `File exceeds maximum limit of ${maxTotalRows.toLocaleString()} rows. Found ${totalEstimatedRows.toLocaleString()} rows.`
    );
  }

  const previewRecords = dataRecords.slice(0, previewLimit);
  const previewRows = previewRecords.map((rec) => {
    const fields = parseCsvLine(rec);
    const rowObj: Record<string, string> = {};
    headers.forEach((h, idx) => {
      rowObj[h] = fields[idx] !== undefined ? fields[idx] : "";
    });
    return rowObj;
  });

  return {
    headers,
    totalEstimatedRows,
    previewRows,
    suggestedMappings: suggestHeaderMappings(headers),
  };
}

/**
 * Parses entire CSV safely into memory-bounded structured rows with mapped header keys.
 */
export function parseFullCsv(
  csvContent: string,
  options?: CsvParseOptions
): { headers: string[]; rows: ParsedCsvRow[] } {
  const maxRows = options?.maxRows ?? DEFAULT_MAX_ROWS;
  const records = splitCsvRecords(csvContent);

  if (records.length === 0) {
    return { headers: [], rows: [] };
  }

  const rawHeaders = parseCsvLine(records[0], options?.delimiter);
  const headers = rawHeaders.map((h, idx) => h.trim() || `column_${idx + 1}`);

  const dataRecords = records.slice(1);
  if (dataRecords.length > maxRows) {
    throw new Error(
      `File exceeds maximum allowed rows (${maxRows.toLocaleString()}). Found ${dataRecords.length.toLocaleString()} rows.`
    );
  }

  const rows: ParsedCsvRow[] = [];
  for (let idx = 0; idx < dataRecords.length; idx++) {
    const fields = parseCsvLine(dataRecords[idx], options?.delimiter);
    const values: Record<string, string> = {};

    headers.forEach((h, colIdx) => {
      values[h] = fields[colIdx] !== undefined ? fields[colIdx] : "";
    });

    rows.push({
      rowNumber: idx + 1,
      values,
      rawValues: fields,
    });
  }

  return { headers, rows };
}
