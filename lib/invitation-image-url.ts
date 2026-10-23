/** Shared URL checks for invitation imagery. */
export function isValidStorageImageUrl(url: string | null | undefined): boolean {
  if (!url || typeof url !== "string") return false;
  const trimmed = url.trim();
  return (
    trimmed.includes("/storage/v1/object/public/cms-media/") ||
    trimmed.includes("/storage/v1/object/public/event-banners/") ||
    trimmed.startsWith("/images/") ||
    trimmed.startsWith("http://") ||
    trimmed.startsWith("https://")
  );
}

/** Evergreen photo slots accept only HTTPS public objects from cms-media. */
export function isValidCmsMediaPublicImageUrl(url: string | null | undefined): boolean {
  if (!isValidStorageImageUrl(url) || !url) return false;
  try {
    const parsed = new URL(url.trim());
    return parsed.protocol === "https:"
      && (parsed.hostname === "supabase.co" || parsed.hostname.endsWith(".supabase.co"))
      && !parsed.username
      && !parsed.password
      && /^\/storage\/v1\/object\/public\/cms-media\/[^/]+/i.test(parsed.pathname);
  } catch {
    return false;
  }
}
