// Pure builders for staff-invitation links. No base URL here: the caller
// prepends getSiteUrl(). A token that is not a uuid never reaches a link.

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isInviteToken(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

export function buildInviteAcceptPath(token: unknown): string | null {
  if (!isInviteToken(token)) return null;
  return "/staff/accept?token=" + encodeURIComponent(token.trim());
}

// For visitors with no session: the WHOLE accept path is encoded so the
// token survives the first "?" when the login page reads ?redirect=.
export function buildInviteLoginPath(token: unknown): string | null {
  const accept = buildInviteAcceptPath(token);
  if (accept === null) return null;
  return "/login?redirect=" + encodeURIComponent(accept);
}
