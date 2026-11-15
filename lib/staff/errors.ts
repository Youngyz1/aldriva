/**
 * lib/staff/errors.ts
 *
 * Maps raw Postgres/PostgREST errors from staff_members writes (migration
 * 231) to a plain, user-facing English message AND a stable code the UI
 * translates via next-intl ("Workforce" namespace, err* keys), falling back
 * to the English message when a translation is missing. Never surfaces raw
 * DB text. Plain TS, no "use server" and no server-only imports, so this
 * loads in node:test via the same require.extensions[".ts"] harness used
 * elsewhere in lib/staff.
 *
 * Source evidence (db/migration_231_staff_management.sql, as applied and
 * frozen on staging):
 * - line 1158-1159: RAISE EXCEPTION 'Staff can only update their own phone,
 *   email and photo' USING ERRCODE = '42501' (staff_members_guard_self_edit).
 *   This single message also covers "branch manager tries to move self to
 *   another branch" -- branch_id is in the same protected-column list
 *   (line 1148), so there is no separate message for that case.
 * - line 1319-1320: RAISE EXCEPTION 'Only head office can assign the % role'
 *   USING ERRCODE = '42501' (staff_guard_privileged_role). Not reachable from
 *   any Part B staff_members write (role assignment is Slice C), kept here
 *   for completeness since it shares the staff error surface.
 * - line 299-301: uq_staff_members_business_auth_user, a partial UNIQUE
 *   index (business_id, auth_user_id) WHERE auth_user_id IS NOT NULL ->
 *   generic Postgres unique-violation, SQLSTATE 23505. Not reachable from
 *   Part B either (no auth_user_id/login field in these forms), kept for
 *   completeness.
 * - line 278-281: staff_members_branch_business_fk, a composite FOREIGN KEY
 *   (branch_id, business_id) REFERENCES business_branches (id, business_id)
 *   -> generic Postgres foreign-key-violation, SQLSTATE 23503. Reachable:
 *   this is what rejects a branch_id that doesn't exist or belongs to a
 *   different business.
 * - Plain RLS violations (USING/WITH CHECK clauses on staff_members'
 *   policies, not a RAISE) also surface as SQLSTATE 42501, with Postgres's
 *   own generic message ('new row violates row-level security policy for
 *   table "staff_members"') rather than one of the two custom RAISE
 *   messages above. This is the catch-all case: "branch manager sees/edits
 *   only own branch", "cannot create staff with no branch", "cannot touch
 *   another branch" are all enforced this way, with no custom message text
 *   to match on. Mapped to the same "not_allowed" code as an app-level gate
 *   rejection (owner's call: two codes total, not three -- see
 *   not_found_or_denied below for the other one).
 *
 * RLS gotcha (not an error path at all): an UPDATE or DELETE whose row is
 * excluded by a USING clause returns zero affected rows, not a thrown
 * error -- callers must check for an empty result themselves and treat it
 * as "not allowed or not found" (code "not_found_or_denied", distinct from
 * "not_allowed" per the owner's call). This module only maps errors that
 * Postgres actually throws; NOT_FOUND_OR_DENIED below is exported for
 * callers to use directly for that zero-rows case.
 */

export type StaffDbError = {
  code?: string | null;
  message?: string | null;
};

export type StaffError = {
  code: string;
  message: string;
};

const SELF_EDIT_MESSAGE = "Staff can only update their own phone, email and photo";
const PRIVILEGED_ROLE_MESSAGE_PREFIX = "Only head office can assign the";

export const NOT_FOUND_OR_DENIED: StaffError = {
  code: "not_found_or_denied",
  message: "You don't have permission to do that, or this staff member no longer exists.",
};

export function mapStaffError(error: StaffDbError): StaffError {
  const message = error.message ?? "";
  const code = error.code ?? "";

  if (message.includes(SELF_EDIT_MESSAGE)) {
    return { code: "self_edit_only", message: "You can only update your own phone, email and photo." };
  }
  if (message.includes(PRIVILEGED_ROLE_MESSAGE_PREFIX)) {
    return { code: "privileged_role_denied", message: "Only head office can assign that role." };
  }
  if (code === "23505") {
    return { code: "duplicate_login", message: "This login is already linked to another staff member in this business." };
  }
  if (code === "23503") {
    return { code: "branch_mismatch", message: "That branch doesn't belong to this business." };
  }
  if (code === "42501") {
    return { code: "not_allowed", message: "You don't have permission to do that." };
  }
  return { code: "generic_error", message: "Something went wrong. Please try again." };
}
