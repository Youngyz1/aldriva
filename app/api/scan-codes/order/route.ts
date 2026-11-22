import "server-only";
import { createHash } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimitFailClosed } from "@/lib/rate-limit";
import { isScanCodesEnabled } from "@/lib/scan-codes/flag";
import { issueScanCode } from "@/lib/scan-codes/issue";
import { trustedEventStaffClientIp } from "@/lib/staff/trusted-client-ip";

const NOT_FOUND = { error: "not_found" };
const INVALID_REQUEST = { error: "invalid_request" };
const SERVICE_UNAVAILABLE = { error: "service_unavailable" };
const TOKEN_RE = /^[A-Za-z0-9_-]{16,128}$/;

function json(body: unknown, status: number, retryAfter?: number) {
  return NextResponse.json(body, {
    status,
    headers: {
      "Cache-Control": "no-store",
      ...(retryAfter ? { "Retry-After": String(Math.max(1, retryAfter)) } : {}),
    },
  });
}

/**
 * Issues (or re-fetches, idempotently) a scan code for an order, resolved
 * from its customer-facing tracking token. The token is read from the JSON
 * body only (never a URL param) and is never logged — only its sha256 hash
 * is used as a rate-limit bucket key.
 */
export async function POST(request: NextRequest) {
  if (!isScanCodesEnabled()) {
    return json(NOT_FOUND, 404);
  }

  const origin = request.headers.get("origin");
  if (!origin || origin !== request.nextUrl.origin) {
    return json(INVALID_REQUEST, 400);
  }

  const body = await request.json().catch(() => null);
  const rawToken = (body as { trackingToken?: unknown } | null)?.trackingToken;
  if (typeof rawToken !== "string") {
    return json(INVALID_REQUEST, 400);
  }
  const trackingToken = rawToken.trim();
  if (!TOKEN_RE.test(trackingToken)) {
    return json(INVALID_REQUEST, 400);
  }

  const isVercel = process.env.VERCEL === "1";
  const isLocalDevelopment = process.env.NODE_ENV === "development";
  const trustedIp = trustedEventStaffClientIp(request.headers, isVercel, isLocalDevelopment);
  if (!trustedIp) {
    return json(SERVICE_UNAVAILABLE, 503);
  }

  const tokenHash = createHash("sha256").update(trackingToken).digest("hex");
  const ipHash = createHash("sha256").update(trustedIp).digest("hex");

  const ipLimit = await checkRateLimitFailClosed("ipScanCodeOrderIssue", `ip:${ipHash}`);
  if (!ipLimit.allowed) {
    return json({ error: "rate_limited" }, 429, ipLimit.retryAfter);
  }
  const tokenLimit = await checkRateLimitFailClosed("scanCodeOrderIssue", `token:${tokenHash}`);
  if (!tokenLimit.allowed) {
    return json({ error: "rate_limited" }, 429, tokenLimit.retryAfter);
  }

  try {
    const admin = createSupabaseAdmin();
    const { data: order, error } = await admin
      .from("orders")
      .select("id")
      .eq("tracking_token", trackingToken)
      .maybeSingle();

    if (error || !order) {
      return json(NOT_FOUND, 404);
    }

    const issued = await issueScanCode(admin, "order", order.id);
    if (!issued) {
      return json(NOT_FOUND, 404);
    }

    return json({ ok: true, code: issued.code, codeType: issued.codeType }, 200);
  } catch {
    return json(SERVICE_UNAVAILABLE, 503);
  }
}
