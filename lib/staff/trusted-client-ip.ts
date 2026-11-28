import { isIP } from "node:net";

/**
 * Resolve a rate-limit identity without trusting caller-controlled forwarding
 * headers. Vercel overwrites x-vercel-forwarded-for at its edge. Local
 * development has no trusted socket address in the Web Request API, so all
 * local requests deliberately share one loopback bucket; forged XFF values
 * cannot create fresh identities or evade the limit. Other deployments fail
 * closed until their trusted proxy is explicitly integrated.
 */
export function trustedEventStaffClientIp(
  headers: Headers,
  isVercel: boolean,
  isLocalDevelopment = false
): string | null {
  if (isVercel) {
    const value = headers.get("x-vercel-forwarded-for")?.split(",", 1)[0]?.trim();
    return value && isIP(value) ? value : null;
  }

  if (isLocalDevelopment) return "127.0.0.1";
  return null;
}
