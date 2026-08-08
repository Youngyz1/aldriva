import { NextResponse } from "next/server";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Application-level rate limiting, backed by Postgres (migration_54).
 *
 * Why not in-memory: on Vercel each serverless instance would hold its own
 * counter and cold starts would reset it, so the effective limit is
 * (limit x instances) — no limit at all under load.
 *
 * Why not a new service: Supabase is already a hard dependency of every one of
 * these routes, so this adds no new infrastructure, credentials or vendor.
 */

/** Per-endpoint budgets. Tuned to be far above real usage — see RATIONALE. */
export const RATE_LIMITS = {
  /**
   * Sends email through Resend. Tightest budget on the platform: a legitimate
   * organizer invites a handful of beneficiaries, never dozens. Stacks on top
   * of the 5-minute per-beneficiary cooldown in the invite route itself.
   */
  beneficiaryInvite: { limit: 5, windowSeconds: 3600 },

  /**
   * Creates a Stripe customer AND a PaymentIntent. Abuse means card testing and
   * billable Stripe calls. A real donor retries a failed card a few times; 10
   * in 10 minutes leaves ample room for that.
   */
  paymentIntent: { limit: 10, windowSeconds: 600 },

  /** Outbound HTTP fetch of an arbitrary page. Amplification + egress cost. */
  importUrl: { limit: 20, windowSeconds: 3600 },

  /**
   * DB writes plus a notification insert. Generous because liking several
   * comments while reading a campaign is normal behaviour.
   */
  commentLike: { limit: 60, windowSeconds: 3600 },
} as const;

export type RateLimitName = keyof typeof RATE_LIMITS;

/**
 * Best-effort client IP.
 *
 * On Vercel `x-real-ip` and the first `x-forwarded-for` entry are set by the
 * platform edge, which overwrites any value a client tries to supply. Off
 * Vercel neither header is trustworthy, which is why authenticated routes key
 * on the user id instead — see identifierFor().
 */
export function clientIp(request: Request): string {
  const realIp = request.headers.get("x-real-ip");
  if (realIp) return realIp.trim();

  const forwarded = request.headers.get("x-forwarded-for");
  if (forwarded) {
    const first = forwarded.split(",")[0]?.trim();
    if (first) return first;
  }

  // No usable address: bucket all such requests together rather than letting
  // them through unmetered.
  return "unknown";
}

/**
 * Preferred bucket identity.
 *
 * A signed-in user is keyed on their own id, so people sharing an office or
 * mobile-carrier NAT are not throttled as one. Anonymous callers fall back to
 * IP, which is the only signal available.
 */
export function identifierFor(request: Request, userId?: string | null): string {
  return userId ? `user:${userId}` : `ip:${clientIp(request)}`;
}

export interface RateLimitResult {
  allowed: boolean;
  remaining: number;
  retryAfter: number;
}

/**
 * Counts one request against `name` for `identifier`.
 *
 * Fails OPEN. If the limiter itself is unavailable the request proceeds, on the
 * grounds that a database hiccup must not stop donations. The trade-off is
 * explicit: an attacker who can break the limiter regains an unmetered
 * endpoint. The alternative — failing closed — converts any Supabase blip into
 * a site-wide payment outage, which is the worse failure for this application.
 */
export async function checkRateLimit(
  name: RateLimitName,
  identifier: string
): Promise<RateLimitResult> {
  const { limit, windowSeconds } = RATE_LIMITS[name];

  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.rpc("check_rate_limit", {
      p_key: `${name}:${identifier}`,
      p_limit: limit,
      p_window_seconds: windowSeconds,
    });

    if (error) {
      console.error(`[rate-limit] ${name} check failed:`, error.message);
      return { allowed: true, remaining: limit, retryAfter: 0 };
    }

    const row = Array.isArray(data) ? data[0] : data;
    if (!row) return { allowed: true, remaining: limit, retryAfter: 0 };

    return {
      allowed: Boolean(row.allowed),
      remaining: Number(row.remaining ?? 0),
      retryAfter: Number(row.retry_after ?? 0),
    };
  } catch (err) {
    console.error(
      `[rate-limit] ${name} check threw:`,
      err instanceof Error ? err.message : String(err)
    );
    return { allowed: true, remaining: limit, retryAfter: 0 };
  }
}

/**
 * Standard 429. Deliberately says nothing about the backing store, the key, or
 * how close the caller is to any other limit.
 */
export function rateLimitResponse(retryAfter: number): NextResponse {
  return NextResponse.json(
    { error: "Too many requests. Please try again shortly." },
    {
      status: 429,
      headers: {
        "Retry-After": String(Math.max(1, retryAfter)),
        "Cache-Control": "no-store",
      },
    }
  );
}

/** Convenience wrapper: returns a 429 response, or null when allowed. */
export async function enforceRateLimit(
  name: RateLimitName,
  request: Request,
  userId?: string | null
): Promise<NextResponse | null> {
  const result = await checkRateLimit(name, identifierFor(request, userId));
  return result.allowed ? null : rateLimitResponse(result.retryAfter);
}
