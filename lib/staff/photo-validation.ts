/**
 * lib/staff/photo-validation.ts
 *
 * Validates staff_members.photo_url on create/update. Accepts null, or an
 * https:// URL of at most 500 characters whose host matches the Supabase
 * project this app is configured for -- the same host
 * hooks/use-image-upload.ts -> lib/uploadImage.ts -> lib/uploads.ts's
 * supabase.storage.from(bucket).getPublicUrl(path) actually produces.
 *
 * The allowed host is derived from NEXT_PUBLIC_SUPABASE_URL at runtime
 * rather than hardcoded, so it always matches whichever Supabase project
 * the app is actually pointed at (I could not read .env.local directly --
 * denied by this session's permission settings -- so I did not hardcode a
 * literal host guessed from conversation context; deriving it at runtime
 * is also the structurally correct choice regardless).
 *
 * Plain TS, no server-only imports, so both lib/actions/staff-members.ts
 * (server) and StaffFormDialog.tsx (client, pre-upload-URL is never
 * client-supplied here anyway -- this exists for server-side defense in
 * depth) could import this; currently only the server action does.
 */

const MAX_PHOTO_URL_LENGTH = 500;
const PHOTO_INVALID: { code: string; message: string } = {
  code: "photo_invalid",
  message: "Please upload a photo using the upload button.",
};

export function getAllowedPhotoHost(): string | null {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  if (!supabaseUrl) return null;
  try {
    return new URL(supabaseUrl).host;
  } catch {
    return null;
  }
}

/** Returns { code, message }, or null if photoUrl is null/undefined/valid. */
export function validateStaffPhotoUrl(
  photoUrl: string | null | undefined,
  allowedHost: string | null = getAllowedPhotoHost()
): { code: string; message: string } | null {
  if (photoUrl === null || photoUrl === undefined) return null;
  if (photoUrl.length > MAX_PHOTO_URL_LENGTH) return PHOTO_INVALID;

  let parsed: URL;
  try {
    parsed = new URL(photoUrl);
  } catch {
    return PHOTO_INVALID;
  }

  if (parsed.protocol !== "https:") return PHOTO_INVALID;
  if (allowedHost && parsed.host !== allowedHost) return PHOTO_INVALID;
  return null;
}
