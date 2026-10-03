/**
 * lib/exec/tokens.ts — Stage 10.2 worker credential primitives (pure).
 *
 * Mirrors the QA two-layer construction (lib/qa/tokens.ts) for generic
 * background execution — same timing-safe comparisons, same fail-closed
 * posture, no new cryptography:
 *
 * Layer 1 (worker token): long-lived shared secret
 * (`EXEC_WORKER_TOKEN` / `EXEC_WORKER_TOKEN_PREV` for rotation overlap).
 * Authorizes claim-requests, heartbeats, and recovery reads ONLY — never
 * result ingest, never arbitrary execution.
 * Layer 2 (claim token): 256-bit random per-claim secret, bounded TTL, stored
 * as SHA-256 hash on the claimed job. Required for heartbeat/ingest on that
 * job ONLY, and consumed (cleared) on terminal ingest.
 *
 * Pure module: env is read by the routes, never here. Hermetically tested.
 */

import { createHash, timingSafeEqual, randomBytes } from 'node:crypto';

export const EXEC_CLAIM_TTL_MS = 15 * 60 * 1000;
export const EXEC_MAX_LEASE_MS = 2 * 60 * 60 * 1000;

export function sha256Hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}

/** Mint a per-claim token. Plaintext is returned ONCE to the claimer. */
export function mintExecClaimToken(
  nowMs: number = Date.now(),
  ttlMs: number = EXEC_CLAIM_TTL_MS
): { token: string; hash: string; expiresAtIso: string } {
  const ttl = Math.min(Math.max(ttlMs, 60_000), EXEC_MAX_LEASE_MS);
  const token = randomBytes(32).toString('hex');
  return {
    token,
    hash: sha256Hex(token),
    expiresAtIso: new Date(nowMs + ttl).toISOString(),
  };
}

/** Verify a presented claim token against the stored hash + expiry. */
export function verifyExecClaimToken(
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

/**
 * Layer-1 worker check: fail-closed when secrets are unset. Accepts the
 * rotation overlap (PREV) so rotation never breaks in-flight workers.
 */
export function isAuthorizedWorkerRequest(
  authHeader: string | null,
  secret: string | undefined | null,
  prevSecret: string | undefined | null = null
): boolean {
  if (!authHeader) return false;
  const provided = createHash('sha256').update(authHeader).digest();
  for (const s of [secret, prevSecret]) {
    if (!s) continue;
    const expected = createHash('sha256').update(`Bearer ${s}`).digest();
    if (provided.length === expected.length && timingSafeEqual(provided, expected)) return true;
  }
  return false;
}
