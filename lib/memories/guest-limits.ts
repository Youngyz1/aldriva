import "server-only";
/**
 * lib/memories/guest-limits.ts
 *
 * Fail-open rate-limit helper for anonymous guest endpoints — Round 4.
 * Same posture as the shared-invitation page: a limiter outage never
 * blocks genuine guests (checkRateLimit itself is already fail-open;
 * the try/catch here covers import/shape surprises).
 */

import { checkRateLimit, clientIp, type RateLimitName } from "@/lib/rate-limit";

/** True when the request must be answered 429. */
export async function isRateLimited(
  request: Request,
  name: RateLimitName,
  extraKey?: string
): Promise<boolean> {
  try {
    const ip = clientIp(request);
    const gate = await checkRateLimit(name, `ip:${ip}`);
    if (!gate.allowed) return true;
    if (extraKey) {
      const scoped = await checkRateLimit(name, extraKey);
      if (!scoped.allowed) return true;
    }
    return false;
  } catch {
    return false;
  }
}

export function rateLimitedResponse(): Response {
  return Response.json(
    { error: "Too many requests. Please wait a moment and try again." },
    { status: 429 }
  );
}
