/**
 * Explicit column list for reading `organizers` through PostgREST, not `*`.
 *
 * migration_53 revokes table-wide SELECT on `organizers` from anon/authenticated
 * and re-grants per column, so that tax_id and nonprofit_registration_number are
 * unreachable. `select("*")` expands to every column including those two and
 * fails with a permission error, taking the calling page down. Keep this list
 * in sync with the GRANT in db/migration_53_security_hardening.sql.
 *
 * Service-role reads (lib/receipt.ts, admin panels) are unaffected by grants
 * and may keep selecting whatever they need.
 */
// Single literal, not a concatenation: supabase-js infers the row type from the
// literal string type, and `+` widens it to `string`, which collapses the
// result type to GenericStringError.
// prettier-ignore
export const ORGANIZER_PUBLIC_COLUMNS = "id, user_id, name, bio, photo, banner, slug, org_type, visibility, status, verified_at, website, facebook, twitter, instagram, linkedin, youtube, tiktok, contact_email, average_rating, review_count, follower_offset, events_offset, organization_name, created_at, updated_at, deleted_at" as const;
