/**
 * lib/staff/phone-validation.ts
 *
 * Contact-phone validation for business staff_members (migration 231).
 * Deliberately separate from lib/staff/phone.ts's normalizeE164Phone, which
 * is a stricter E.164-only normalizer for the unrelated event-staff/WhatsApp
 * invite flow -- this is a plain "is this a sane phone number" check for a
 * free-text contact field, not a deep-link target.
 *
 * Plain TS, no server-only imports, so both lib/actions/staff-members.ts
 * (server) and StaffFormDialog.tsx (client) import this one function
 * instead of duplicating the rule, and it loads in node:test directly.
 *
 * Returns { code, message } so the UI can translate by code (Workforce
 * namespace, errPhoneInvalid) and fall back to the English message when a
 * translation is missing. Both character-set and digit-count failures share
 * one code, "phone_invalid" -- the owner's call was two codes total for
 * authorization failures (not_allowed / not_found_or_denied); for
 * validation failures each rule gets its own code except this one, which
 * stays a single phone_invalid code covering both failure shapes.
 */

const PHONE_ALLOWED_CHARS_RE = /^[0-9 +\-()]+$/;
const PHONE_INVALID_CODE = "phone_invalid";

/** Returns { code, message }, or null if the phone is valid (or empty/absent -- phone is optional). */
export function validateStaffPhone(phone: string | null | undefined): { code: string; message: string } | null {
  if (!phone) return null;
  const trimmed = phone.trim();
  if (!trimmed) return null;
  if (!PHONE_ALLOWED_CHARS_RE.test(trimmed)) {
    return { code: PHONE_INVALID_CODE, message: "Phone can only contain digits, spaces, +, - and ( )." };
  }
  const digitCount = (trimmed.match(/[0-9]/g) ?? []).length;
  if (digitCount < 7 || digitCount > 20) {
    return { code: PHONE_INVALID_CODE, message: "Phone must have 7 to 20 digits." };
  }
  return null;
}
