import { describe, it, expect } from "vitest";
import { normalizePhoneNumber, isValidE164 } from "../utils/phone.js";
import {
  parseCsvLine,
  splitCsvRecords,
  suggestHeaderMappings,
  previewCsvContent,
  parseFullCsv,
} from "../utils/csv.js";

describe("Phone Normalization & E.164 Utilities", () => {
  it("should normalize clean 10-digit Indian numbers with default country code +91", () => {
    const res = normalizePhoneNumber("9876543210");
    expect(res.valid).toBe(true);
    expect(res.e164).toBe("+919876543210");
    expect(res.countryCode).toBe("+91");
    expect(res.nationalNumber).toBe("9876543210");
  });

  it("should strip spaces, dashes, dots, and parentheses", () => {
    const res = normalizePhoneNumber("+91 (987) 654-3210");
    expect(res.valid).toBe(true);
    expect(res.e164).toBe("+919876543210");
  });

  it("should handle leading trunk 0 on 11-digit numbers", () => {
    const res = normalizePhoneNumber("09876543210");
    expect(res.valid).toBe(true);
    expect(res.e164).toBe("+919876543210");
  });

  it("should handle international 00 prefix", () => {
    const res = normalizePhoneNumber("00919876543210");
    expect(res.valid).toBe(true);
    expect(res.e164).toBe("+919876543210");
  });

  it("should accept valid non-Indian E.164 numbers", () => {
    const resUS = normalizePhoneNumber("+14155552671");
    expect(resUS.valid).toBe(true);
    expect(resUS.e164).toBe("+14155552671");

    const resUK = normalizePhoneNumber("+447911123456");
    expect(resUK.valid).toBe(true);
    expect(resUK.e164).toBe("+447911123456");
  });

  it("should reject dummy numbers like all zeroes", () => {
    const res = normalizePhoneNumber("0000000000");
    expect(res.valid).toBe(false);
  });

  it("should reject numbers that are too short or too long", () => {
    expect(normalizePhoneNumber("12345").valid).toBe(false);
    expect(normalizePhoneNumber("+91123456789012345678").valid).toBe(false);
  });

  it("should validate strictly via isValidE164", () => {
    expect(isValidE164("+919876543210")).toBe(true);
    expect(isValidE164("+14155552671")).toBe(true);
    expect(isValidE164("9876543210")).toBe(false);
    expect(isValidE164("+0123456789")).toBe(false);
    expect(isValidE164("")).toBe(false);
  });
});

describe("RFC 4180 CSV Parsing & Header Suggestion Utilities", () => {
  it("should parse standard comma-delimited line", () => {
    const line = "John,Doe,john@example.com,9876543210";
    const fields = parseCsvLine(line);
    expect(fields).toEqual(["John", "Doe", "john@example.com", "9876543210"]);
  });

  it("should handle quoted fields containing commas", () => {
    const line = '"Doe, John",john@example.com,"VIP, Customer",9876543210';
    const fields = parseCsvLine(line);
    expect(fields).toEqual(["Doe, John", "john@example.com", "VIP, Customer", "9876543210"]);
  });

  it("should handle escaped quotes inside quoted fields", () => {
    const line = '"John ""Johnny"" Doe",john@example.com,9876543210';
    const fields = parseCsvLine(line);
    expect(fields).toEqual(['John "Johnny" Doe', "john@example.com", "9876543210"]);
  });

  it("should split multiline CSV content with CRLF linebreaks", () => {
    const content = 'Header1,Header2\r\nVal1,Val2\r\nVal3,"Val\r\n4"';
    const records = splitCsvRecords(content);
    expect(records.length).toBe(3);
    expect(records[0]).toBe("Header1,Header2");
    expect(records[1]).toBe("Val1,Val2");
    expect(records[2]).toContain('Val\r\n4');
  });

  it("should correctly suggest header mappings for various common column names", () => {
    const headers = ["Mobile Number", "First Name", "Last Name", "Email Address", "City"];
    const suggestions = suggestHeaderMappings(headers);
    expect(suggestions.phoneNumber).toBe("Mobile Number");
    expect(suggestions.firstName).toBe("First Name");
    expect(suggestions.lastName).toBe("Last Name");
    expect(suggestions.email).toBe("Email Address");
  });

  it("should generate structured preview with row count and sample data", () => {
    const csv = `phone,name,email\n9876543210,Rahul Sharma,rahul@example.com\n9876543211,Priya Patel,priya@example.com`;
    const preview = previewCsvContent(csv, 5);

    expect(preview.headers).toEqual(["phone", "name", "email"]);
    expect(preview.totalEstimatedRows).toBe(2);
    expect(preview.previewRows.length).toBe(2);
    expect(preview.previewRows[0].phone).toBe("9876543210");
    expect(preview.suggestedMappings.phoneNumber).toBe("phone");
    expect(preview.suggestedMappings.firstName).toBe("name");
  });

  it("should enforce maximum allowed rows limit", () => {
    const csv = `phone,name\n` + Array.from({ length: 50 }, (_, i) => `98765432${i.toString().padStart(2, "0")},User ${i}`).join("\n");
    expect(() => parseFullCsv(csv, { maxRows: 10 })).toThrow("File exceeds maximum allowed rows");
  });
});
