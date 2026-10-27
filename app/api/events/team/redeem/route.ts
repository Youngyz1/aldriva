import "server-only";
import { createHash, randomUUID } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { hashInviteToken } from "@/lib/staff/invite-tokens";
import {
  eventStaffSessionCookieName,
  generateEventStaffSessionToken,
  hashEventStaffSessionToken,
} from "@/lib/staff/guest-session";
import { checkRateLimitFailClosed, type FailClosedRateLimitFailure } from "@/lib/rate-limit";
import { checkEventStaffRedemptionLimits, type RedemptionLimitVerdict } from "@/lib/staff/redemption-limits";
import { trustedEventStaffClientIp } from "@/lib/staff/trusted-client-ip";

const GENERIC_REJECTION = "This invitation could not be redeemed. Check the details or request a new invitation.";
const GENERIC_FAILURE = {
  error: "Invitation redemption is temporarily unavailable. Please try again shortly.",
  code: "redemption_unavailable",
};
const MISCONFIGURED = {
  error: "Staff invitation redemption is not configured on this server. Please contact the event organizer.",
  code: "redemption_misconfigured",
};

function logStage(
  requestId: string,
  stage: string,
  outcome: string,
  details: Record<string, string | number | boolean | undefined> = {}
) {
  console.info(JSON.stringify({ event: "event_staff_redemption", requestId, stage, outcome, ...details }));
}

function safeErrorName(error: unknown): string | undefined {
  return error instanceof Error && /^[A-Za-z][A-Za-z0-9]{0,39}$/.test(error.name) ? error.name : undefined;
}

function safeErrorCode(error: unknown): string | undefined {
  const code = (error as { code?: unknown } | null)?.code;
  return typeof code === "string" && /^[A-Za-z0-9_-]{1,32}$/.test(code) ? code : undefined;
}

function failureResponse(requestId: string, misconfigured = false) {
  return json(requestId, misconfigured ? MISCONFIGURED : GENERIC_FAILURE, 503);
}

function json(requestId: string, body: unknown, status: number, retryAfter?: number) {
  const response = NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store, private",
      "Referrer-Policy": "no-referrer",
      "X-Request-ID": requestId,
      ...(retryAfter ? { "Retry-After": String(Math.max(1, retryAfter)) } : {}),
    },
  });
  return response;
}

export async function POST(request: NextRequest) {
  const requestId = randomUUID();
  logStage(requestId, "request", "received");
  const body = await request.json().catch(() => ({}));
  const token = typeof body?.token === "string" ? body.token.trim() : "";
  const invitationHash = /^[a-f0-9]{64}$/i.test(token)
    ? hashInviteToken(token)
    : createHash("sha256").update("invalid-event-staff-invitation-token").digest("hex");
  const isVercel = process.env.VERCEL === "1";
  const isLocalDevelopment = process.env.NODE_ENV === "development";
  const trustedIp = trustedEventStaffClientIp(request.headers, isVercel, isLocalDevelopment);
  logStage(requestId, "trusted_client_ip", trustedIp ? "resolved" : "unavailable", {
    source: trustedIp ? (isVercel ? "vercel_edge" : "local_development_bucket") : "unconfigured",
  });

  // Both buckets run on every request. No caller-controlled address is logged.
  const rateLimitFailures: FailClosedRateLimitFailure[] = [];
  let limits: RedemptionLimitVerdict;
  try {
    limits = await checkEventStaffRedemptionLimits(
      async (name, identifier) => {
        let diagnostic: FailClosedRateLimitFailure | undefined;
        const result = await checkRateLimitFailClosed(name, identifier, (failure) => {
          diagnostic = failure;
          rateLimitFailures.push(failure);
        });
        logStage(requestId, `rate_limit.${name}`, result.unavailable ? "unavailable" : result.allowed ? "allowed" : "limited", {
          ...(diagnostic ? {
            reason: diagnostic.reason,
            errorCode: diagnostic.errorCode,
            errorName: diagnostic.errorName,
            httpStatus: diagnostic.httpStatus,
          } : {}),
        });
        return result;
      },
      `invite:${invitationHash}`,
      `ip:${createHash("sha256").update(trustedIp || "unknown").digest("hex")}`
    );
  } catch (error) {
    logStage(requestId, "rate_limit", "exception", { errorName: safeErrorName(error), errorCode: safeErrorCode(error) });
    return failureResponse(requestId, error instanceof Error && error.message === "Supabase service role is not configured.");
  }
  if (!limits.allowed && limits.reason === "unavailable") {
    const misconfigured = rateLimitFailures.some((failure) => failure.reason === "missing_configuration");
    logStage(requestId, "rate_limit", "denied_unavailable", { reason: misconfigured ? "missing_configuration" : "dependency_unavailable" });
    return failureResponse(requestId, misconfigured);
  }
  if (!limits.allowed) {
    logStage(requestId, "rate_limit", "denied_limited", { retryAfter: limits.retryAfter });
    return json(requestId, { error: "Too many attempts. Please try again later.", code: "rate_limited" }, 429, limits.retryAfter);
  }
  if (!trustedIp) {
    logStage(requestId, "trusted_client_ip", "denied_unavailable", { reason: "trusted_source_not_configured" });
    return failureResponse(requestId, true);
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    logStage(requestId, "request_origin", "rejected");
    return json(requestId, { error: GENERIC_REJECTION, code: "invitation_invalid" }, 400);
  }

  if (!/^[a-f0-9]{64}$/i.test(token)) {
    logStage(requestId, "invitation_token", "rejected", { reason: "invalid_format" });
    return json(requestId, { error: GENERIC_REJECTION, code: "invitation_invalid" }, 400);
  }
  const phoneLast4 = typeof body?.phoneLast4 === "string" ? body.phoneLast4.trim() : null;
  const sessionToken = generateEventStaffSessionToken();
  logStage(requestId, "invitation_rpc", "started");
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc("consume_event_invitation_atomic", {
      p_invitation_token_hash: hashInviteToken(token),
      p_phone_last4: phoneLast4,
      p_session_token_hash: hashEventStaffSessionToken(sessionToken),
    });

    if (error) {
      const errorStatus = (error as unknown as { status?: unknown }).status;
      logStage(requestId, "invitation_rpc", "unavailable", {
        errorCode: safeErrorCode(error),
        httpStatus: typeof errorStatus === "number" ? errorStatus : undefined,
      });
      return failureResponse(requestId);
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row || typeof row !== "object" || typeof row.out_event_id !== "string" || typeof row.out_member_id !== "string") {
      logStage(requestId, "invitation_rpc", "rejected");
      return json(requestId, { error: GENERIC_REJECTION, code: "invitation_invalid" }, 400);
    }

    const expiresAt = Date.parse(typeof row.out_session_expires_at === "string" ? row.out_session_expires_at : "");
    const hardExpiresAt = Date.parse(typeof row.out_session_hard_expires_at === "string" ? row.out_session_hard_expires_at : "");
    const maxAge = Math.floor((hardExpiresAt - Date.now()) / 1000);
    if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()
      || !Number.isFinite(hardExpiresAt) || hardExpiresAt <= expiresAt || maxAge <= 0) {
      logStage(requestId, "session_expiry", "invalid_rpc_result");
      return failureResponse(requestId);
    }

    const response = json(requestId, {
      ok: true,
      workspaceUrl: `/events/${row.out_event_id}/staff-scanner`,
    }, 200);
    response.cookies.set({
      name: eventStaffSessionCookieName(row.out_event_id),
      value: sessionToken,
      httpOnly: true,
      secure: process.env.NODE_ENV === "production",
      sameSite: "strict",
      path: "/",
      maxAge,
    });
    logStage(requestId, "session_cookie", "issued");
    return response;
  } catch (error) {
    const misconfigured = error instanceof Error && error.message === "Supabase service role is not configured.";
    logStage(requestId, "invitation_rpc", "exception", {
      reason: misconfigured ? "missing_configuration" : "dependency_or_runtime_error",
      errorName: safeErrorName(error),
      errorCode: safeErrorCode(error),
    });
    return failureResponse(requestId, misconfigured);
  }
}
