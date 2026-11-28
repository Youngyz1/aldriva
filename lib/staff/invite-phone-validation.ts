/**
 * lib/staff/invite-phone-validation.ts
 *
 * Client-side E.164 phone validator for the team invite form. Deliberately
 * strict: no auto-prefixing and no default country, so the organizer must
 * type the full international number themselves (matching the server's
 * own normalizeE164Phone check in lib/staff/phone.ts). Pure, zero I/O.
 */

const E164_PATTERN = /^\+[1-9][0-9]{1,14}$/;

/** True only for a trimmed value matching ^\+[1-9][0-9]{1,14}$ exactly. */
export function isValidInvitePhone(value: string): boolean {
  return E164_PATTERN.test(value.trim());
}
