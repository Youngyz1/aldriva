/**
 * lib/qa/tokens.ts — Stage 7 two-layer credential primitives (pure).
 *
 * Layer 1 (poll token): long-lived shared secret, compared timing-safe
 * against SHA-256, fail-closed when unset — same construction as
 * lib/cron-auth.ts. Authorizes poll + claim-request ONLY, never ingest.
 * Layer 2 (claim token): 256-bit random per-run secret, 2h TTL, stored as
 * SHA-256 hash. Required for ingest on that run ONLY.
 */

import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';

export const CLAIM_TTL_MS = 2 * 60 * 60 * 1000;

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Mint a per-run claim token. Plaintext is returned ONCE to the claimer. */
export function mintClaimToken(nowMs: number = Date.now()): { token: string; hash: string; expiresAtIso: string } {
  const token = randomBytes(32).toString('hex');
  return {
    token,
    hash: sha256Hex(token),
    expiresAtIso: new Date(nowMs + CLAIM_TTL_MS).toISOString(),
  };
}

/** Verify a presented claim token against the stored hash + expiry. */
export function verifyClaimToken(
  presented: string,
  storedHash: string | null,
  expiresAtIso: string | null,
  nowIso: string = new Date().toISOString()
): boolean {
  if (!presented || !storedHash || !expiresAtIso) return false;
  if (expiresAtIso <= nowIso) return false;
  const a = Buffer.from(sha256Hex(presented), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  if (a.length !== b.length) return false;
  return timingSafeEqual(a, b);
}

/** Layer-1 poll token check: fail-closed when the secret is unset. */
export function isAuthorizedPollRequest(authHeader: string | null, secret: string | undefined | null): boolean {
  if (!secret) return false;
  if (!authHeader) return false;
  const provided = createHash('sha256').update(authHeader).digest();
  const expected = createHash('sha256').update(`Bearer ${secret}`).digest();
  return timingSafeEqual(provided, expected);
}
