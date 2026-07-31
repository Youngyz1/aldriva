const EXACT_IMAGE_HOSTS = new Set([
  "images.unsplash.com",
  "img.evbuc.com",
  "s1.ticketm.net",
  "seatgeek.com",
  "seatgeekimages.com",
  "images.gofundme.com",
  "d2g8igdw686xgo.cloudfront.net",
  "lh3.googleusercontent.com",
]);

const WILDCARD_IMAGE_HOST_SUFFIXES = [
  ".supabase.co",
  ".supabase.in",
  ".googleusercontent.com",
  ".seatgeek.com",
  ".seatgeekimages.com",
];

const BLOCKED_HOSTS = new Set([
  "images.google.com",
  "www.google.com",
  "bing.com",
  "www.bing.com",
  "pinterest.com",
  "www.pinterest.com",
  "yahoo.com",
  "www.yahoo.com",
]);

// A URL can sit on an allowed host yet not be an image at all — e.g. a campaign
// whose `banner` column holds a video file. next/image would try to optimize it
// and fail (SSRF guard / decode error), so reject known non-image file types.
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
];

function isAllowedImageHost(hostname: string) {
  return (
    !BLOCKED_HOSTS.has(hostname) &&
    (EXACT_IMAGE_HOSTS.has(hostname) ||
      WILDCARD_IMAGE_HOST_SUFFIXES.some((suffix) => hostname.endsWith(suffix)))
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

export function normalizeImageUrl(
  value: string | null | undefined,
  fallback: string
) {
  const trimmed = value?.trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const unwrapped = unwrapKnownImageProxy(url);
    if (unwrapped) {
      return normalizeImageUrl(decodeURIComponent(unwrapped), fallback);
    }

    if (url.protocol !== "https:") return fallback;
    if (!isAllowedImageHost(url.hostname)) return fallback;
    if (NON_IMAGE_FILE_EXTENSION.test(url.pathname)) return fallback;
    return url.toString();
  } catch {
    return fallback;
  }
}

export function safeImageSrc(value: string | null | undefined): string | null {
  const normalized = normalizeImageUrl(value, "INVALID");
  return normalized === "INVALID" ? null : normalized;
}
