import "server-only";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimitFailClosed } from "@/lib/rate-limit";
import { trustedEventStaffClientIp } from "@/lib/staff/trusted-client-ip";
import { isScanActionsEnabled } from "@/lib/scan-actions/flag";
import { validateBody } from "@/lib/scan-actions/validate-body";
import { runScanAction } from "@/lib/scan-actions/run";
import { verifyScannerToken } from "@/lib/offline-scanner-token";
import { isScannerTokenRevoked, type RevocationCheck } from "@/lib/staff/scanner-revocations";
import crypto from "node:crypto";

const INVALID_REQUEST = { error: "invalid_request" };
const RATE_LIMITED = { error: "rate_limited" };
const SERVICE_UNAVAILABLE = { error: "service_unavailable" };

function json(body: unknown, status: number, retryAfter?: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfter ? { "Retry-After": String(Math.max(1, retryAfter)) } : {}),
    },
  });
}

interface AuthContextUser {
  kind: "user";
  userId: string;
}

interface AuthContextWorker {
  kind: "worker";
  workerId: string;
  businessId: string;
  workerName: string;
  tokenScope: import("@/lib/offline-scanner-token").ScannerScope;
}

type AuthContext = AuthContextUser | AuthContextWorker;

async function resolveWorkerAuthContext(
  admin: ReturnType<typeof createSupabaseAdmin>,
  token: string,
  requestId: string,
): Promise<{ context: AuthContextWorker } | { error: { status: number; body: unknown } }> {
  const verified = verifyScannerToken(token);
  if (!verified.valid) {
    return { error: { status: 401, body: { error: "unauthorized" } } };
  }

  const p = verified.principal;

  // Only worker tokens (staff_member_id) are accepted for this path.
  // User tokens (user_id) fall through to session auth — no authContext is set.
  if (!p.staffMemberId) {
    return { error: { status: 401, body: { error: "unauthorized" } } };
  }

  // Phase 4: business-scoped worker tokens cannot be reliably revoked across
  // business contexts because revocations are event-scoped. Reject worker tokens
  // whose authorized code types include order or reservation. Ticket-only worker
  // tokens remain subject to existing event-scoped validation and revocation.
  // Mixed ticket/business tokens are rejected rather than allowing business capabilities.
  const codeTypes = Array.isArray(p.codeType) ? p.codeType : [];
  if (codeTypes.includes("order") || codeTypes.includes("reservation")) {
    return { error: { status: 401, body: { error: "unauthorized" } } };
  }

  // Look up the worker: must be active, not deactivated, courier role,
  // and belong to the correct business.
  const { data: worker, error: workerError } = await admin
    .from("business_workers")
    .select("id, business_id, full_name, role, is_active, deactivated_at")
    .eq("id", p.staffMemberId)
    .eq("role", "courier")
    .eq("is_active", true)
    .is("deactivated_at", null)
    .maybeSingle();

  if (workerError || !worker || !worker.full_name || typeof worker.full_name !== "string" || !worker.full_name.trim()) {
    return { error: { status: 401, body: { error: "unauthorized" } } };
  }

  // Revocation lookup FAIL CLOSED for worker tokens.
  let revocation: RevocationCheck;
  try {
    revocation = await isScannerTokenRevoked(
      admin,
      {
        eventId: p.eventId,
        jti: p.jti,
        staffMemberId: p.staffMemberId,
        issuedAt: p.iat,
      },
      requestId,
      true, // failClosed
    );
  } catch {
    return { error: { status: 503, body: SERVICE_UNAVAILABLE } };
  }

  if (revocation.revoked) {
    return { error: { status: 401, body: { error: "unauthorized" } } };
  }

  return {
    context: {
      kind: "worker",
      workerId: worker.id,
      businessId: worker.business_id,
      workerName: worker.full_name.trim(),
      tokenScope: p.scope,
    },
  };
}

export async function POST(request: NextRequest) {
  const requestId = crypto.randomUUID();

  if (!isScanActionsEnabled()) {
    return json({ error: "not_found" }, 404);
  }

  // Resolve authentication context from Bearer token if present.
  let authContext: AuthContext | undefined;

  const authHeader = request.headers.get("authorization");
  if (authHeader && authHeader.startsWith("Bearer ")) {
    const token = authHeader.substring(7).trim();

    // Only scanner-token format (two base64url parts) is accepted as a Bearer token.
    // Non-scanner-token Bearer headers (e.g. Supabase Auth JWTs) are rejected.
    if (token.split(".").length !== 2) {
      return json({ error: "unauthorized" }, 401);
    }

    const admin = createSupabaseAdmin();
    const result = await resolveWorkerAuthContext(admin, token, requestId);
    if ("error" in result) {
      return json(result.error.body, result.error.status);
    }
    authContext = result.context;
  }

  // Origin check is always required.
  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return json(INVALID_REQUEST, 400);
  }

  // Pre-auth IP rate limit.
  const isVercel = process.env.VERCEL === "1";
  const isLocalDevelopment = process.env.NODE_ENV === "development";
  const trustedIp = trustedEventStaffClientIp(request.headers, isVercel, isLocalDevelopment);
  if (!trustedIp) {
    return json(SERVICE_UNAVAILABLE, 503);
  }

  const ipHash = crypto.createHash("sha256").update(trustedIp).digest("hex");
  const ipLimit = await checkRateLimitFailClosed("ipScanAction", `ip:${ipHash}`);
  if (!ipLimit.allowed) {
    return json(RATE_LIMITED, 429, ipLimit.retryAfter);
  }

  // Parse and validate body (hand validation, no zod).
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json(INVALID_REQUEST, 400);
  }

  const parsed = validateBody(body);
  if (!parsed) {
    return json(INVALID_REQUEST, 400);
  }

  const { code, action, clientScanId, clientScannedAt, deviceId, cashCollected } = parsed;

  try {
    const admin = createSupabaseAdmin();
    const result = await runScanAction({
      admin,
      authContext,
      code,
      action,
      clientScanId,
      deviceId,
      cashCollected,
      clientScannedAt,
      requestId,
    });

    if (result.kind === "failure") {
      switch (result.failure) {
        case "unauthorized":
          return json({ error: "unauthorized" }, 401);
        case "not_found":
          return json({ error: "not_found" }, 404);
        case "conflict":
          return json({ error: "conflict", reason: "client_scan_id_reused" }, 409);
        case "rate_limited":
          return json({ error: "rate_limited" }, 429, result.retryAfter);
        case "unavailable":
          return json(SERVICE_UNAVAILABLE, 503);
      }
    }

    // done -> HTTP 200 (including outcome rejected).
    return json({
      ok: true,
      outcome: result.outcome,
      codeType: result.codeType,
      action: result.action,
      fromStatus: result.fromStatus,
      toStatus: result.toStatus,
      eventId: result.eventId,
      reason: result.reason ?? null,
      paymentStatus: result.paymentStatus ?? null,
    }, 200);
  } catch {
    console.error(JSON.stringify({ event: "scan_action_unhandled", requestId }));
    return json(SERVICE_UNAVAILABLE, 503);
  }
}
