/**
 * Grovastra Frontend Timezone Utilities
 *
 * Enforces Asia/Kolkata (IST, UTC+5:30) as the business timezone for campaign scheduling
 * while rendering clear, customer-friendly dates and times.
 */

export const DEFAULT_BUSINESS_TIMEZONE = "Asia/Kolkata";
export const BUSINESS_TIMEZONE_LABEL = "IST (UTC+05:30)";

/**
 * Format an ISO string or Date into user-friendly Asia/Kolkata string
 * Example: "18 Oct 2026, 06:00 PM IST"
 */
export function formatInBusinessTimezone(
  dateInput: Date | string | null | undefined,
  includeTime: boolean = true
): string {
  if (!dateInput) return "—";

  const date = typeof dateInput === "string" ? new Date(dateInput) : dateInput;
  if (isNaN(date.getTime())) return "—";

  const options: Intl.DateTimeFormatOptions = {
    timeZone: DEFAULT_BUSINESS_TIMEZONE,
    day: "numeric",
    month: "short",
    year: "numeric",
  };

  if (includeTime) {
    options.hour = "2-digit";
    options.minute = "2-digit";
    options.hour12 = true;
  }

  const formatted = new Intl.DateTimeFormat("en-IN", options).format(date);
  return includeTime ? `${formatted} IST` : formatted;
}

/**
 * Parse date string (YYYY-MM-DD) and time string (HH:mm in 24hr or 12hr)
 * in Asia/Kolkata timezone to a UTC ISO string.
 */
export function parseScheduleToUTC(dateStr: string, timeStr: string): string {
  if (!dateStr || !timeStr) {
    throw new Error("Both date and time must be provided");
  }

  // Combine into YYYY-MM-DDTHH:mm:00
  // Note: Asia/Kolkata is fixed UTC+05:30 (no daylight saving time)
  const [hours, minutes] = timeStr.split(":").map((v) => parseInt(v, 10));
  if (isNaN(hours) || isNaN(minutes) || hours < 0 || hours > 23 || minutes < 0 || minutes > 59) {
    throw new Error("Invalid time format. Please provide HH:mm");
  }

  const paddedHours = String(hours).padStart(2, "0");
  const paddedMinutes = String(minutes).padStart(2, "0");

  // Construct ISO string with +05:30 offset
  const istString = `${dateStr}T${paddedHours}:${paddedMinutes}:00+05:30`;
  const parsed = new Date(istString);

  if (isNaN(parsed.getTime())) {
    throw new Error("Invalid date and time combination");
  }

  return parsed.toISOString();
}

/**
 * Validate whether a date/time combination in Asia/Kolkata is strictly in the future
 */
export function isValidFutureSchedule(isoString: string): boolean {
  if (!isoString) return false;
  const target = new Date(isoString);
  if (isNaN(target.getTime())) return false;
  return target.getTime() > Date.now();
}

/**
 * Get default scheduling date (today or tomorrow) and time (next hour rounded) in Asia/Kolkata
 */
export function getDefaultScheduleInputs(): { date: string; time: string; minDate: string } {
  const now = new Date();
  
  // Format current date in Asia/Kolkata to YYYY-MM-DD
  const istDateParts = new Intl.DateTimeFormat("en-CA", {
    timeZone: DEFAULT_BUSINESS_TIMEZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(now);

  // Get current hour in IST
  const istHours = parseInt(
    new Intl.DateTimeFormat("en-US", {
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
      hour: "numeric",
      hour12: false,
    }).format(now),
    10
  );

  // Default to 1 hour from now or tomorrow 10:00 AM
  let defaultDate = istDateParts;
  let defaultHour = (istHours + 1) % 24;
  let defaultMinute = 0;

  if (istHours >= 22) {
    // Late night in IST, suggest tomorrow 10:00 AM
    const tomorrow = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    defaultDate = new Intl.DateTimeFormat("en-CA", {
      timeZone: DEFAULT_BUSINESS_TIMEZONE,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(tomorrow);
    defaultHour = 10;
  }

  const paddedHour = String(defaultHour).padStart(2, "0");
  const paddedMinute = String(defaultMinute).padStart(2, "0");

  return {
    date: defaultDate,
    time: `${paddedHour}:${paddedMinute}`,
    minDate: istDateParts,
  };
}
