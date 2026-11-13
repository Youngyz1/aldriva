/**
 * Entrance attribution helpers.
 *
 * The scanner UI lets staff type a gate name ("Main Gate") while the database
 * stores `entrance_id` as a uuid. A free-text label must never be written into
 * that column: the insert would fail and the check-in would be lost. These
 * helpers split a raw value into a valid uuid and/or a display label so callers
 * can write each into its own column (label requires migration 208).
 */

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const ENTRANCE_LABEL_MAX_LENGTH = 120;

export type NormalizedEntrance = {
  /** A uuid safe for `entrance_id`, or null when the value was free text. */
  id: string | null;
  /** A trimmed human label safe for `entrance_label`, or null. */
  label: string | null;
};

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function normalizeEntrance(value: unknown): NormalizedEntrance {
  if (typeof value !== "string") return { id: null, label: null };
  const trimmed = value.trim();
  if (!trimmed) return { id: null, label: null };
  if (UUID_RE.test(trimmed)) {
    return { id: trimmed.toLowerCase(), label: null };
  }
  return { id: null, label: trimmed.slice(0, ENTRANCE_LABEL_MAX_LENGTH) };
}

/**
 * PostgREST surfaces a missing column as 42703 / PGRST204 depending on path.
 * Used to retry a write without the optional `entrance_label` column before
 * migration 208 has been applied.
 */
export function isMissingEntranceLabelError(error: {
  code?: string | null;
  message?: string | null;
}): boolean {
  if (!error) return false;
  if (error.code === "42703" || error.code === "PGRST204") {
    return (error.message || "").includes("entrance_label");
  }
  return (error.message || "").includes("entrance_label");
}
