const INVITATION_TOKEN_PATTERN = /^[a-f0-9]{64}$/i;

/** Read a bearer token from a URL fragment without accepting malformed values. */
export function invitationTokenFromFragment(hash: string): string | null {
  const token = new URLSearchParams(hash.startsWith("#") ? hash.slice(1) : hash).get("token");
  return token && INVITATION_TOKEN_PATTERN.test(token) ? token : null;
}

/** Keep the current route/search while removing a secret fragment from history. */
export function invitationUrlWithoutFragment(pathname: string, search: string): string {
  return `${pathname}${search}`;
}
