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
function positiveIntegerEnv(name: string, fallback: number): number {
  const value = process.env[name];
  if (!value || !/^\d+$/.test(value)) return fallback;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed > 0 ? parsed : fallback;
}

export function getPublicMediaRateLimitConfig() {
  return {
    user: {
      limit: positiveIntegerEnv("MEDIA_UPLOAD_USER_LIMIT", 20),
      windowSeconds: positiveIntegerEnv("MEDIA_UPLOAD_USER_WINDOW_SECONDS", 600),
    },
    ip: {
      limit: positiveIntegerEnv("MEDIA_UPLOAD_IP_LIMIT", 60),
      windowSeconds: positiveIntegerEnv("MEDIA_UPLOAD_IP_WINDOW_SECONDS", 600),
    },
  };
}

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

  /**
   * TTS audio synthesis endpoint. Prevents abuse/spam generation calls to NVIDIA.
   */
  articleAudioGenerate: { limit: 10, windowSeconds: 3600 },

  /**
   * Guest order lookup. Requires order ID/QR + buyer email. Tight rate limit
   * to prevent order ID / QR code enumeration or brute-force attacks.
   */
  guestLookup: { limit: 10, windowSeconds: 600 },

  /**
   * Shop digital-asset endpoints (upload-url, asset confirm/manage,
   * downloads). Abuse means billable storage egress. Generous: a creator
   * uploading a multi-file kit plus a buyer fetching each file stays well
   * under budget; enumeration/brute-force does not.
   */
  productAsset: { limit: 30, windowSeconds: 3600 },

  /** Public media API requests per authenticated user: upload-url and finalize. */
  mediaUpload: getPublicMediaRateLimitConfig().user,
  /** Public media API requests per source IP, shared across users. */
  mediaUploadIp: getPublicMediaRateLimitConfig().ip,

  /**
   * AI writing assistant rate limit for authors drafting and polishing articles.
   */
  articleAi: { limit: 30, windowSeconds: 60 },

  /**
   * QA execution-plane poll + ingest. External worker only: 60/min leaves
   * ample headroom for nightly + dispatch runs while bounding credential
   * probing on the ingest endpoint.
   */
  qaIngest: { limit: 60, windowSeconds: 60 },

  /**
   * Stage 10 background-execution plane (claim + heartbeat + ingest + run).
   * External worker only, same posture as qaIngest: 60/min bounds credential
   * probing while leaving headroom for worker cadence + heartbeats.
   */
  execClaim: { limit: 60, windowSeconds: 60 },

  /**
   * AI seating assistant: interprets natural language → SeatingPlanConfig.
   * Tighter than article AI because each call may involve richer model context.
   * A legitimate organizer iterates a handful of times; 15/min leaves ample room.
   */
  seatingAi: { limit: 15, windowSeconds: 60 },

  /**
   * Stage 11 workforce knowledge retrieval test box (admin server action).
   * NEW CONVENTION (Stage 11): first action-level bucket — no Request object
   * exists in a server action, so the caller passes `user:<adminId>` as the
   * identifier directly to checkRateLimit instead of enforceRateLimit.
   * 20/min bounds manual probing; SELECTs only, nothing persisted.
   */
  workforceKnowledgeRetrievalTest: { limit: 20, windowSeconds: 60 },

  /**
   * Stage 15 (pass one) S-6: privileged admin writes get per-user buckets.
   * Same action-level convention as Stage 11 (checkRateLimit with
   * `user:<adminId>`). Generous 30/min: legitimate admin use is bursty but
   * low-volume; the buckets bound session-abuse/CSRF-amplified writes.
   * Fail-open behavior unchanged (see checkRateLimit).
   */
  decideWorkforceApproval: { limit: 30, windowSeconds: 60 },
  createMemoryDirect: { limit: 30, windowSeconds: 60 },

  /**
   * Stage 22 (P4a): Studio chat conversation endpoints (list/create/rename/
   * delete). Per-USER bucket (routes pass the admin id, never IP): 60/min
   * leaves ample room for thread management; conversation I/O is cheap rows,
   * never model calls.
   */
  studioChat: { limit: 60, windowSeconds: 60 },

  /**
   * Stage 15 (pass one) S-10: throttle for worker auth-denial audit rows.
   * 1/min per IP bounds incident noise: every insertSystemEvent opens or
   * bumps an incident, so unauthenticated 401s must not log unthrottled.
   */
  authDenialLog: { limit: 1, windowSeconds: 60 },

  /**
   * Round 3 COMMIT 3: general share-link reads. Anonymous per-IP bucket,
   * 60/min leaves normal forwarding (family group chats) ample room while
   * bounding token-probing. Fail-open like every other limiter.
   */
  invitationShareView: { limit: 60, windowSeconds: 60 },
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
