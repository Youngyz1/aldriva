/**
 * lib/memories/cover-art-policy.ts
 *
 * Cover hero URL allowlist — Round 5, step 3.
 *
 * Pure module (no imports at all): the fetch helper in
 * lib/invitation-cover-art.ts consumes it, and the hermetic suite
 * requires this file directly (the server-only-marked fetch module
 * cannot be freshly required under the test alias hook).
 */

export const COVER_HERO_FETCH_TIMEOUT_MS = 3000;
export const COVER_HERO_MAX_BYTES = 5 * 1024 * 1024;

function hostOf(raw: string | undefined): string | null {
  if (!raw) return null;
  try {
    return new URL(raw).host;
  } catch {
    return null;
  }
}

/** Hosts a Cover hero may be fetched from. Env-injectable for tests. */
export function isAllowedCoverHeroUrl(
  raw: unknown,
  env: Record<string, string | undefined> = process.env
): boolean {
  if (typeof raw !== "string") return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;

  const supabaseHost = hostOf(env.NEXT_PUBLIC_SUPABASE_URL);
  const mediaHost = hostOf(env.MEDIA_BASE_URL) ?? hostOf(env.NEXT_PUBLIC_MEDIA_BASE_URL);

  if (supabaseHost && url.host === supabaseHost) {
    // Project storage only — never auth/admin paths.
    return url.pathname.startsWith("/storage/v1/object/public/");
  }
  if (mediaHost && url.host === mediaHost) return true;
  return false;
}
