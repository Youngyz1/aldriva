const EXACT_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "img.evbuc.com",
  "s1.ticketm.net",
  "seatgeek.com",
  "seatgeekimages.com",
  "images.gofundme.com",
  "d2g8igdw686xgo.cloudfront.net",
  "upload.wikimedia.org",
  "lh3.googleusercontent.com",
]);

const WILDCARD_IMAGE_HOST_SUFFIXES = [
  ".supabase.co",
  ".supabase.in",
  ".googleusercontent.com",
  ".seatgeek.com",
  ".seatgeekimages.com",
];

// Rejects known non-image media files (videos, audio).
const NON_IMAGE_FILE_EXTENSION = /\.(mp4|m4v|mov|webm|mkv|avi|ogv|mp3|wav|m4a|flac)$/i;

type ProxyUnwrapRule = {
  matches: (url: URL) => boolean;
  param: string;
};

export const PROXY_UNWRAP_RULES: ProxyUnwrapRule[] = [
  {
    matches: (url) =>
      url.hostname.startsWith("www.eventbrite.") &&
      url.pathname.endsWith("/_next/image"),
    param: "url",
  },
  {
    matches: (url) =>
      (url.hostname === "google.com" || url.hostname.endsWith(".google.com")) &&
      url.pathname.startsWith("/imgres"),
    param: "imgurl",
  },
  {
    matches: (url) =>
      (url.hostname === "bing.com" || url.hostname.endsWith(".bing.com")) &&
      url.pathname.startsWith("/images/search"),
    param: "mediaurl",
  },
];

function isAllowedImageHost(hostname: string) {
  return (
    EXACT_IMAGE_HOSTS.has(hostname) ||
    WILDCARD_IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix))
  );
}

export function unwrapKnownImageProxy(url: URL): string | null {
  for (const rule of PROXY_UNWRAP_RULES) {
    if (rule.matches(url)) {
      return url.searchParams.get(rule.param);
    }
  }

  return null;
}

/**
 * Returns a valid, allowed, direct image URL string, or null if invalid/missing.
 * Does not substitute remote fallbacks or placeholders.
 */
export function safeImageSrc(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const unwrapped = unwrapKnownImageProxy(url);
    if (unwrapped) {
      return safeImageSrc(decodeURIComponent(unwrapped));
    }

    if (url.protocol !== "https:") return null;
    if (!isAllowedImageHost(url.hostname)) return null;
    if (NON_IMAGE_FILE_EXTENSION.test(url.pathname)) return null;
    return url.toString();
  } catch {
    return null;
  }
}

/**
 * Normalizes an image URL. If fallback is provided, returns fallback when invalid.
 * If fallback is omitted or null, returns null when invalid.
 *
 * Overloaded so callers passing a guaranteed-string fallback (the Events /
 * Articles surfaces, which always render a placeholder image) keep a plain
 * `string` return type, while fundraiser surfaces that migrated to
 * null-means-no-image keep `string | null`.
 */
export function normalizeImageUrl(value: string | null | undefined, fallback: string): string;
export function normalizeImageUrl(
  value: string | null | undefined,
  fallback?: string | null
): string | null;
export function normalizeImageUrl(
  value: string | null | undefined,
  fallback?: string | null
): string | null {
  const safe = safeImageSrc(value);
  if (safe !== null) return safe;
  return fallback ?? null;
}

/**
 * Returns true if the provided value is a valid, allowed, direct image URL.
 */
export function isValidImageUrl(value: string | null | undefined): boolean {
  return safeImageSrc(value) !== null;
}
