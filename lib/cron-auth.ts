import { createHash, timingSafeEqual } from "node:crypto";

/**
 * Shared bearer-token check for the Vercel cron routes.
 *
 * Two things this guards against that the previous inline check did not:
 *
 * 1. **Fail closed when the secret is unset.** The old form compared against
 *    `` `Bearer ${process.env.CRON_SECRET}` ``. With the variable missing that
 *    template collapses to the literal string "Bearer undefined", which any
 *    caller can send. A preview/staging environment created without the var
 *    would therefore have had wide-open cron endpoints.
 *
 * 2. **Constant-time comparison.** `!==` on strings short-circuits at the first
 *    differing byte, which leaks the secret a character at a time to an
 *    attacker who can measure response latency.
 *
 * Both sides are SHA-256'd before comparison so `timingSafeEqual` always gets
 * equal-length buffers — it throws on a length mismatch, and comparing raw
 * lengths first would leak the secret's length.
 */
export function isAuthorizedCronRequest(request: Request): boolean {
  const secret = process.env.CRON_SECRET;
  if (!secret) return false;

  const header = request.headers.get("authorization");
  if (!header) return false;

  const provided = createHash("sha256").update(header).digest();
  const expected = createHash("sha256").update(`Bearer ${secret}`).digest();

  return timingSafeEqual(provided, expected);
}
