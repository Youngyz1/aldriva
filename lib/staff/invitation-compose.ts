// Composes the full invitation link. The base URL comes from the server
// (getSiteUrl is server-only); only an http(s) origin is accepted, and the
// token must be a uuid. The token goes in the URL fragment.
import { buildInviteAcceptPath } from "./invitation-link";

export function composeInviteLink(baseUrl: unknown, token: unknown): string | null {
  if (typeof baseUrl !== "string") return null;
  let origin: string;
  try {
    const u = new URL(baseUrl.trim());
    if (u.protocol !== "https:" && u.protocol !== "http:") return null;
    origin = u.origin;
  } catch {
    return null;
  }
  const accept = buildInviteAcceptPath(token);
  if (accept === null) return null;
  return origin + accept;
}
