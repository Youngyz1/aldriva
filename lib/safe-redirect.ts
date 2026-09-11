/**
 * lib/safe-redirect.ts
 *
 * Same-origin post-login redirect resolution (P2 F-06).
 *
 * Pure module — zero imports — safe for route handlers and tests.
 * Rejects protocol-relative (`//evil.com`), backslash (`/\evil.com`), and
 * absolute URLs by parsing against the request origin and comparing origins;
 * returns only path+query+fragment, falling back to "/".
 */
export function resolveSafeNextPath(next: string | null, origin: string): string {
  if (!next || !next.startsWith("/") || next.startsWith("//") || next.startsWith("/\\")) {
    return "/";
  }
  try {
    const resolved = new URL(next, origin);
    if (resolved.origin !== origin) {
      return "/";
    }
    return `${resolved.pathname}${resolved.search}${resolved.hash}`;
  } catch {
    return "/";
  }
}
