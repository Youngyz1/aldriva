// Pure builders for staff-invitation links. No base URL here: the caller
// prepends getSiteUrl(). A token that is not a uuid never reaches a link.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

// The token travels in the URL FRAGMENT: browsers never send it to the server,
// so it stays out of request logs, analytics and the Referer header.
export const INVITE_ACCEPT_PATH = "/staff/accept";
export const INVITE_STORAGE_KEY = "staff-invite-token";

export function buildInviteAcceptPath(token: unknown): string | null {
  if (!isInviteToken(token)) return null;
  return INVITE_ACCEPT_PATH + "#" + token.trim();
}

// Reads location.hash ("#<uuid>" or "<uuid>"). Anything else returns null.
export function parseInviteFragment(hash: unknown): string | null {
  if (typeof hash !== "string") return null;
  const v = hash.startsWith("#") ? hash.slice(1) : hash;
  return isInviteToken(v) ? v.trim() : null;
}

// For visitors with no session. Carries NO token: the page keeps it in
// sessionStorage across the login round trip.
export function buildInviteLoginPath(): string {
  return "/login?redirect=" + encodeURIComponent(INVITE_ACCEPT_PATH);
}
