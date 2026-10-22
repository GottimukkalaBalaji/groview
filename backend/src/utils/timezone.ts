/**
 * Timezone and Date Utility for Grovastra
 * Standard business timezone: Asia/Kolkata (IST · UTC+05:30)
 */

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Kolkata";
export const DEFAULT_TIMEZONE_OFFSET_HOURS = 5.5; // +05:30

/**
 * Formats a UTC date or ISO string into the business timezone for customer display.
 * Example output: "Oct 18, 2026, 06:30 PM (IST)"
 */
export function formatInBusinessTimezone(
  date: Date | string | null | undefined,
  timeZone = DEFAULT_BUSINESS_TIMEZONE
): string {
  if (!date) return "—";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "Invalid Date";

  const formatted = new Intl.DateTimeFormat("en-IN", {
    timeZone,
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hour12: true,
  }).format(d);

  return `${formatted} (${timeZone === "Asia/Kolkata" ? "IST" : timeZone})`;
}

/**
 * Parses separate date (YYYY-MM-DD) and time (HH:mm) strings in the business timezone (Asia/Kolkata)
 * into a standard UTC Date object.
 *
 * Example:
 * date: "2026-10-18", time: "18:30" in Asia/Kolkata (+05:30)
 * returns Date representing 2026-10-18T13:00:00.000Z
 */
export function parseScheduleToUTC(
  dateStr: string,
  timeStr: string
): Date {
  // Validate format
  const dateMatch = dateStr.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  const timeMatch = timeStr.match(/^(\d{2}):(\d{2})$/);

  if (!dateMatch || !timeMatch) {
    throw new Error("Invalid date or time format. Expected YYYY-MM-DD and HH:mm");
  }

  // Construct ISO-8601 with +05:30 offset
  const isoWithOffset = `${dateStr}T${timeStr}:00+05:30`;
  const parsed = new Date(isoWithOffset);

  if (isNaN(parsed.getTime())) {
    throw new Error("Failed to parse date string into valid UTC timestamp");
  }

  return parsed;
}

/**
 * Checks whether an ISO string or Date is strictly in the future.
 */
export function isValidFutureSchedule(
  date: Date | string,
  minLeadSeconds = 30
): boolean {
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return false;
  return d.getTime() > Date.now() + minLeadSeconds * 1000;
}
