import { zonedTimeToUtc } from "@/lib/reservation-slots";

export type ReadyTimeResolution =
  | { success: true; estimatedReadyAt: string | null }
  | { success: false; message: string };

/**
 * Resolves optional dashboard date/time fields in the business timezone.
 * A time without a date means today at that business; a partial date is an
 * error so the UI can never silently turn it into an empty estimate.
 */
export function resolveBusinessReadyTime(
  dateValue: unknown,
  timeValue: unknown,
  timeZone: string,
  now: Date = new Date()
): ReadyTimeResolution {
  if (
    (dateValue !== undefined && dateValue !== null && typeof dateValue !== "string") ||
    (timeValue !== undefined && timeValue !== null && typeof timeValue !== "string")
  ) {
    return { success: false, message: "Enter a valid date and time in the business timezone." };
  }
  const date = typeof dateValue === "string" ? dateValue.trim() : "";
  const time = typeof timeValue === "string" ? timeValue.trim() : "";

  if (!date && !time) return { success: true, estimatedReadyAt: null };
  if (date && !time) {
    return {
      success: false,
      message: "Enter a ready time for that date, or clear the date to leave the estimate empty.",
    };
  }

  let targetDate = date;
  if (!targetDate) {
    try {
      const parts = new Intl.DateTimeFormat("en-CA", {
        timeZone,
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
      }).formatToParts(now);
      const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
      targetDate = `${values.year}-${values.month}-${values.day}`;
    } catch {
      return {
        success: false,
        message: "The business timezone is invalid. Set a valid timezone before entering a ready time.",
      };
    }
  }

  const targetMs = zonedTimeToUtc(targetDate, time, timeZone);
  if (targetMs === null) {
    return {
      success: false,
      message: "Enter a valid date and time in the business timezone.",
    };
  }
  if (targetMs <= now.getTime()) {
    return {
      success: false,
      message: date
        ? "Estimated ready time must be in the future."
        : "That time has already passed today in the business timezone. Choose a future time or select tomorrow.",
    };
  }

  return { success: true, estimatedReadyAt: new Date(targetMs).toISOString() };
}
