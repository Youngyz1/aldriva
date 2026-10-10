/**
 * lib/staff/staff-labels.ts
 *
 * STAFF ROUND A2: organizer free-text labels (role name, position) and the
 * staff display name. Pure module (no I/O): safe to import from routes,
 * client components, and the hermetic test suite.
 *
 * Labels are display-only. They are NEVER read by authorization checks —
 * the permission level comes solely from the fixed `role` enum
 * ('event_manager' | 'ticket_scanner'), validated separately in the routes.
 */

export const STAFF_ROLE_LABEL_MAX = 80;
export const STAFF_POSITION_LABEL_MAX = 80;
export const STAFF_NAME_MAX = 120;

// Strip ASCII control characters (code points below 32, plus DEL at 127)
// that would break dashboard rows, emails, or QR payloads. Unicode text
// is kept. Written as a code-point loop so no regex escapes are needed.
function stripControls(input: string): string {
  let out = "";
  for (const ch of input) {
    const code = ch.codePointAt(0) ?? 0;
    if (code < 32 || code === 127) continue;
    out += ch;
  }
  return out;
}

export type LabelResult = { ok: true; value: string | null } | { ok: false };

/**
 * Trims, strips control characters, and bounds an optional free-text
 * field. Empty (or whitespace-only) input becomes null — the field is
 * optional everywhere it is accepted.
 */
export function sanitizeOptionalLabel(value: unknown, max: number): LabelResult {
  if (value === undefined || value === null) return { ok: true, value: null };
  if (typeof value !== "string") return { ok: false };
  const cleaned = stripControls(value).trim();
  if (cleaned.length === 0) return { ok: true, value: null };
  if (cleaned.length > max) return { ok: false };
  return { ok: true, value: cleaned };
}
