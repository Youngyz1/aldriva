/**
 * lib/staff/role-details-validation.ts
 *
 * Server-side whitelist validator for staff_member_roles.details (jsonb,
 * migration_231 line 323 -- no DB-level shape constraint on the column
 * itself). Deliberately NOT a schema for "licence number" or any other
 * sensitive identifier -- only the 4 fields below may ever be stored here.
 * Pure TS, no I/O, loads in node:test via the same require.extensions[".ts"]
 * harness used elsewhere in lib/staff.
 */

export type RoleDetails = {
  licence_class?: string;
  licence_expiry?: string;
  issuing_country?: string;
  notes?: string;
};

export type RoleDetailsError = { code: string; message: string };

export type RoleDetailsValidationResult =
  | { ok: true; value: RoleDetails }
  | { ok: false; error: RoleDetailsError };

const ALLOWED_KEYS = ["licence_class", "licence_expiry", "issuing_country", "notes"] as const;
const LICENCE_EXPIRY_RE = /^\d{4}-\d{2}-\d{2}$/;

function asTrimmedString(value: unknown): string {
  return String(value).trim();
}

export function validateRoleDetails(input: unknown): RoleDetailsValidationResult {
  if (input === null || input === undefined) {
    return { ok: true, value: {} };
  }
  if (typeof input !== "object" || Array.isArray(input)) {
    return { ok: false, error: { code: "role_details_invalid", message: "Details must be an object." } };
  }

  const record = input as Record<string, unknown>;
  const unknownKey = Object.keys(record).find((key) => !ALLOWED_KEYS.includes(key as (typeof ALLOWED_KEYS)[number]));
  if (unknownKey !== undefined) {
    return { ok: false, error: { code: "role_details_unknown_key", message: `Unknown field: ${unknownKey}.` } };
  }

  const value: RoleDetails = {};

  if (record.licence_class !== undefined && record.licence_class !== null) {
    const licenceClass = asTrimmedString(record.licence_class);
    if (licenceClass.length > 20) {
      return { ok: false, error: { code: "role_details_licence_class_length", message: "Licence class must be 20 characters or fewer." } };
    }
    if (licenceClass) value.licence_class = licenceClass;
  }

  if (record.licence_expiry !== undefined && record.licence_expiry !== null) {
    const licenceExpiry = asTrimmedString(record.licence_expiry);
    if (licenceExpiry && !LICENCE_EXPIRY_RE.test(licenceExpiry)) {
      return { ok: false, error: { code: "role_details_licence_expiry_format", message: "Licence expiry must be in YYYY-MM-DD format." } };
    }
    if (licenceExpiry) value.licence_expiry = licenceExpiry;
  }

  if (record.issuing_country !== undefined && record.issuing_country !== null) {
    const issuingCountry = asTrimmedString(record.issuing_country);
    if (issuingCountry.length > 60) {
      return { ok: false, error: { code: "role_details_issuing_country_length", message: "Issuing country must be 60 characters or fewer." } };
    }
    if (issuingCountry) value.issuing_country = issuingCountry;
  }

  if (record.notes !== undefined && record.notes !== null) {
    const notes = asTrimmedString(record.notes);
    if (notes.length > 200) {
      return { ok: false, error: { code: "role_details_notes_length", message: "Notes must be 200 characters or fewer." } };
    }
    if (notes) value.notes = notes;
  }

  return { ok: true, value };
}
