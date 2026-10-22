/**
 * Phone number normalization and E.164 validation utilities for WhatsApp delivery.
 * Ensures consistent canonical formatting: +[countryCode][nationalNumber] with no symbols.
 */

export interface PhoneNormalizationResult {
  valid: boolean;
  e164?: string;
  countryCode?: string;
  nationalNumber?: string;
  error?: string;
}

const E164_REGEX = /^\+[1-9]\d{6,14}$/;

/**
 * Normalizes a raw phone string into canonical E.164 format.
 * Defaults to India (+91) if no international calling code is supplied and the number is 10 digits.
 */
export function normalizePhoneNumber(
  rawInput: string | number | null | undefined,
  defaultCountryCode = "+91"
): PhoneNormalizationResult {
  if (rawInput === null || rawInput === undefined) {
    return { valid: false, error: "Phone number is required" };
  }

  const rawStr = String(rawInput).trim();
  if (!rawStr) {
    return { valid: false, error: "Phone number cannot be empty" };
  }

  // Remove common non-numeric formatting characters (spaces, dashes, parentheses, dots)
  let cleaned = rawStr.replace(/[\s\(\)\-\.]+/g, "");

  // Handle international prefix 00 (e.g. 0091... -> +91...)
  if (cleaned.startsWith("00")) {
    cleaned = "+" + cleaned.slice(2);
  }

  // If already starts with '+', validate digit sequence
  if (cleaned.startsWith("+")) {
    const digitsOnly = cleaned.slice(1);
    if (!/^\d+$/.test(digitsOnly)) {
      return { valid: false, error: "Invalid characters in phone number" };
    }

    if (digitsOnly.length < 7 || digitsOnly.length > 15) {
      return {
        valid: false,
        error: `Invalid phone length (${digitsOnly.length} digits). E.164 requires 7 to 15 digits.`,
      };
    }

    // Check for repetitive/all-zero numbers
    if (/^0+$/.test(digitsOnly) || /^(\d)\1{7,}$/.test(digitsOnly)) {
      return { valid: false, error: "Invalid phone number sequence" };
    }

    const normalizedDefault = defaultCountryCode.replace(/^\+/, "");
    const countryCode = digitsOnly.startsWith(normalizedDefault)
      ? `+${normalizedDefault}`
      : `+${digitsOnly.slice(0, Math.min(3, digitsOnly.length - 7))}`;

    return {
      valid: true,
      e164: cleaned,
      countryCode,
      nationalNumber: digitsOnly.slice(countryCode.length - 1),
    };
  }

  // Strip leading single 0 (domestic trunk prefix) if present
  if (cleaned.startsWith("0") && cleaned.length === 11) {
    cleaned = cleaned.slice(1);
  }

  const digits = cleaned.replace(/\D/g, "");
  if (!digits) {
    return { valid: false, error: "No digits found in phone number" };
  }

  // Standard 10-digit mobile number: prepend defaultCountryCode
  if (digits.length === 10) {
    const cc = defaultCountryCode.startsWith("+")
      ? defaultCountryCode
      : `+${defaultCountryCode}`;
    const e164 = `${cc}${digits}`;

    // Check all zeroes or repeats
    if (/^0+$/.test(digits) || /^(\d)\1{7,}$/.test(digits)) {
      return { valid: false, error: "Invalid dummy phone number" };
    }

    return {
      valid: true,
      e164,
      countryCode: cc,
      nationalNumber: digits,
    };
  }

  // If 11 or 12 digits starting with defaultCountryCode without the leading plus (e.g. 919876543210)
  const ccDigits = defaultCountryCode.replace(/^\+/, "");
  if (digits.startsWith(ccDigits) && digits.length === ccDigits.length + 10) {
    const e164 = `+${digits}`;
    return {
      valid: true,
      e164,
      countryCode: `+${ccDigits}`,
      nationalNumber: digits.slice(ccDigits.length),
    };
  }

  // Fallback E.164 check if prepending '+' directly works
  const candidate = `+${digits}`;
  if (E164_REGEX.test(candidate)) {
    return {
      valid: true,
      e164: candidate,
      countryCode: defaultCountryCode,
      nationalNumber: digits,
    };
  }

  return {
    valid: false,
    error: `Could not parse valid phone number from '${rawStr}'`,
  };
}

/**
 * Fast boolean check for strictly valid E.164 format.
 */
export function isValidE164(phone: string): boolean {
  if (!phone || typeof phone !== "string") return false;
  return E164_REGEX.test(phone.trim());
}
