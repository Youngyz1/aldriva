/**
 * lib/staff/invite-tokens.ts
 *
 * STAFF ROUND A2: event-team invitation tokens (migration 166).
 *
 * The database stores only the SHA-256 hex of the token (`token_hash`,
 * UNIQUE). The plaintext token exists only inside the emailed accept link
 * and is hashed on arrival before lookup — the same shape as the A1b
 * staff-badge decision. Pure module (no I/O): safe for routes and tests.
 */

import { createHash, randomBytes } from "node:crypto";

/** 64-char hex plaintext token for the emailed accept link. */
export function generateInviteToken(): string {
  return randomBytes(32).toString("hex");
}

/** Lowercase SHA-256 hex digest stored in `event_team_invitations.token_hash`. */
export function hashInviteToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}
