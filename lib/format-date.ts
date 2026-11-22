/**
 * lib/format-date.ts
 *
 * Canonical date formatting helper for dashboard, profile, and account views.
 * Standard format: "Nov 2, 2026" (en-US short month, numeric day, numeric year).
 */

export function formatDisplayDate(
  value?: string | number | Date | null,
  fallback = "—"
): string {
  if (!value) return fallback;
  const d = typeof value === "object" && value instanceof Date ? value : new Date(value);
  if (isNaN(d.getTime())) return fallback;
  return d.toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}
