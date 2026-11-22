import "server-only";

import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Scanner token revocation checks.
 *
 * Tokens stay reusable for their full 8 hours (offline queues depend on that),
 * so revocation is not replay blocking: a row either names one token (`jti`) or
 * names the subject whose tokens must stop working (a member removed from the
 * event team). Old tokens minted before Phase 0 carry no `jti` and are therefore
 * only subject-revocable, which is the intended rollout behaviour.
 *
 * Subject revocations are time-bounded: only tokens issued at or before the
 * revocation are rejected, so a member who is removed and later re-added can
 * mint a fresh token and scan again.
 */

const MAX_TOKEN_LIFETIME_MS = 8 * 60 * 60 * 1000;

type RevocationClient = Pick<SupabaseClient, "from">;

export type RevocationCheck =
  | { revoked: true; reason: string }
  | { revoked: false };

export async function isScannerTokenRevoked(
  admin: RevocationClient,
  payload: { eventId: string; jti?: string; userId?: string; staffMemberId?: string; issuedAt?: number; iat?: number },
  requestId: string,
  failClosed: boolean = false,
): Promise<RevocationCheck> {
  const issuedAtMs = typeof payload.issuedAt === "number" ? payload.issuedAt : (typeof payload.iat === "number" ? payload.iat * 1000 : 0);
  const subjectFilters: string[] = [];
  if (payload.staffMemberId) subjectFilters.push(`staff_member_id.eq.${payload.staffMemberId}`);
  if (payload.userId) subjectFilters.push(`user_id.eq.${payload.userId}`);

  try {
    // 1. Token-specific revocation: this exact jti is dead, whatever its age.
    if (payload.jti) {
      const { data, error } = await admin
        .from("scanner_token_revocations")
        .select("reason")
        .eq("event_id", payload.eventId)
        .eq("jti", payload.jti)
        .limit(1)
        .maybeSingle();
      if (error) throw error;
      const tokenRow = data as { reason?: string } | null;
      if (tokenRow) return { revoked: true, reason: tokenRow.reason || "revoked" };
    }

    // 2. Subject revocation: only tokens minted at or before the removal.
    if (subjectFilters.length) {
      const { data, error } = await admin
        .from("scanner_token_revocations")
        .select("reason, revoked_at")
        .eq("event_id", payload.eventId)
        .is("jti", null)
        .or(subjectFilters.join(","));
      if (error) throw error;

      const subjectRows = (data as Array<{ reason?: string; revoked_at?: string | null }> | null) ?? [];
      for (const row of subjectRows) {
        const revokedAt = Date.parse(row.revoked_at ?? "");
        // Unknown timestamp: reject rather than let a stale token through.
        if (!Number.isFinite(revokedAt) || issuedAtMs <= revokedAt) {
          return { revoked: true, reason: row.reason || "revoked" };
        }
      }
    }

    return { revoked: false };
  } catch (error) {
    if (failClosed) throw error;
    // The scanner must keep working at a door when this lookup is unavailable
    // (or when migration 208 has not been applied yet). Log and fail open; the
    // 8-hour expiry still bounds the exposure.
    const code =
      error && typeof error === "object" && "code" in error
        ? String((error as { code?: unknown }).code ?? "")
        : "UNKNOWN";
    console.error("[scanner-token-revocations]", {
      requestId,
      stage: "lookup",
      errorCode: code,
    });
    return { revoked: false };
  }
}

export type RevokeSubjectParams = {
  eventId: string;
  staffMemberId?: string | null;
  userId?: string | null;
  reason: string;
};

/**
 * Revoke every live token held by a removed team member. Called after the
 * member row flips to `removed`; failures are logged, never thrown, so member
 * removal itself cannot fail because of the scanner.
 */
export async function revokeScannerTokensForSubject(
  admin: RevocationClient,
  params: RevokeSubjectParams,
  requestId: string,
): Promise<boolean> {
  if (!params.staffMemberId && !params.userId) return false;

  const expiresAt = new Date(Date.now() + MAX_TOKEN_LIFETIME_MS).toISOString();
  const { error } = await admin.from("scanner_token_revocations").insert({
    event_id: params.eventId,
    staff_member_id: params.staffMemberId ?? null,
    user_id: params.userId ?? null,
    reason: params.reason.slice(0, 64),
    expires_at: expiresAt,
  });

  if (!error) return true;

  console.error("[scanner-token-revocations]", {
    requestId,
    stage: "revoke_subject",
    errorCode: error.code || "UNKNOWN",
  });
  return false;
}
