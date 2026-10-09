/**
 * lib/memories/retention-policy.ts
 *
 * Pure retention policy math — Round 4. No imports: safe for the hermetic
 * test suite. The job runner lives in lib/memories/retention.ts.
 */

export const MEMORY_RETENTION_MONTHS = 12;
export const MEMORY_RETENTION_NOTICE_30D_DAYS = 30;
export const MEMORY_RETENTION_NOTICE_7D_DAYS = 7;

/** Env flag that arms live deletion (default off). Never default on. */
export const MEMORY_RETENTION_LIVE_DELETE_ENV = "ENABLE_MEMORY_RETENTION_DELETE";

export function isLiveMemoryRetentionDeleteEnabled(
  env: Record<string, string | undefined> = process.env
): boolean {
  return env[MEMORY_RETENTION_LIVE_DELETE_ENV] === "1";
}

function addMonths(date: Date, months: number): Date {
  const out = new Date(date);
  out.setMonth(out.getMonth() + months);
  return out;
}

/**
 * Event cutoff = (end_date ?? event_date ?? newest photo upload) + 12mo.
 * Null when nothing anchors the event (job skips such events).
 */
export function computeRetentionCutoff(args: {
  endDate: string | null;
  eventDate: string | null;
  newestUploadAt: string | null;
}): Date | null {
  const anchor = args.endDate ?? args.eventDate ?? args.newestUploadAt;
  if (!anchor) return null;
  const parsed = new Date(anchor);
  if (Number.isNaN(parsed.getTime())) return null;
  return addMonths(parsed, MEMORY_RETENTION_MONTHS);
}

/**
 * Which notice (if any) is due for an event `daysOut` days from cutoff.
 * The 7d notice supersedes the 30d one: once inside the 7-day window (or
 * once the 7d notice went out), a stale unsent 30d notice must never send
 * — "30 days left" would be factually wrong days before deletion.
 */
export function dueNoticeKind(
  daysToCutoff: number,
  sent30d: boolean,
  sent7d: boolean
): "30d" | "7d" | null {
  if (daysToCutoff <= MEMORY_RETENTION_NOTICE_7D_DAYS) {
    return sent7d ? null : "7d";
  }
  if (daysToCutoff <= MEMORY_RETENTION_NOTICE_30D_DAYS) {
    return sent30d ? null : "30d";
  }
  return null;
}
