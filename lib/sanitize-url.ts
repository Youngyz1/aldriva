/**
 * Strict allowlist-based URL sanitizer for href and src attributes.
 * Kept independent of HTML parsing so URL-only callers do not load jsdom.
 * Allows: http:, https:, mailto:, tel:, and relative paths (/, #, ?, ./, ../).
 * Strips dangerous schemes like javascript:, data:, vbscript:.
 * Always returns a safe URL string or the fallback string (default: "").
 */
export function sanitizeUrl(url: unknown, fallback = ""): string {
  if (typeof url !== "string") return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;

  // Relative URLs and anchor targets are safe
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("?") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    // Extra safety: block protocol-relative //evil.com if not intended or sanitize
    if (trimmed.startsWith("//")) {
      return fallback;
    }
    // Browsers normalize backslashes as slashes in special-scheme URLs, so a
    // value like /\\evil.example would otherwise become protocol-relative.
    try {
      if (new URL(trimmed, "https://aldriva.invalid").origin !== "https://aldriva.invalid") {
        return fallback;
      }
    } catch {
      return fallback;
    }
    return trimmed;
  }

  // Absolute URLs must start with allowed protocols
  const isAllowedScheme = /^(https?:|mailto:|tel:)/i.test(trimmed);
  if (!isAllowedScheme) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed);
    const proto = parsed.protocol.toLowerCase();
    if (proto === "http:" || proto === "https:" || proto === "mailto:" || proto === "tel:") {
      return trimmed;
    }
  } catch {
    return fallback;
  }

  return fallback;
}
