import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimitFailClosed, clientIp } from "@/lib/rate-limit";
import { COURIER_INVITE_COOKIE, hashWorkerToken } from "@/lib/kitchen/worker-session";
import { courierJson } from "@/lib/courier/http";

const TOKEN_HEX = /^[0-9a-f]{64}$/i;

export async function GET() {
  return courierJson({ error: "Method not allowed" }, 405);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return courierJson({ error: "Invalid request" }, 400);
  }

  const token = body && typeof body === "object" && "token" in body && typeof body.token === "string"
    ? body.token
    : "";
  if (!TOKEN_HEX.test(token)) return courierJson({ error: "This invitation link is invalid or expired." }, 400);

  const inviteHash = hashWorkerToken(token.toLowerCase());
  const [ipLimit, inviteLimit] = await Promise.all([
    checkRateLimitFailClosed("courierInviteBootstrap", `ip:${clientIp(request)}`),
    checkRateLimitFailClosed("courierInviteBootstrap", `invite:${inviteHash}`),
  ]);
  if (!ipLimit.allowed || !inviteLimit.allowed) {
    return courierJson({ error: "Too many requests. Try again shortly." }, 429);
  }

  const admin = createSupabaseAdmin();
  const { data: invitation, error: invitationError } = await admin
    .from("business_worker_invitations")
    .select("id, worker_id")
    .eq("token_hash", inviteHash)
    .gt("expires_at", new Date().toISOString())
    .is("token_consumed_at", null)
    .is("revoked_at", null)
    .maybeSingle();
  if (invitationError) return courierJson({ error: "Courier access is temporarily unavailable." }, 503);
  if (!invitation) return courierJson({ error: "This invitation link is invalid or expired." }, 400);

  const { data: worker, error: workerError } = await admin
    .from("business_workers")
    .select("id, role, is_active, deactivated_at")
    .eq("id", invitation.worker_id)
    .eq("role", "courier")
    .eq("is_active", true)
    .is("deactivated_at", null)
    .maybeSingle();
  if (workerError) return courierJson({ error: "Courier access is temporarily unavailable." }, 503);
  if (!worker) return courierJson({ error: "This invitation link is invalid or expired." }, 400);

  const response = courierJson({ ok: true });
  response.cookies.set(COURIER_INVITE_COOKIE, token.toLowerCase(), {
    httpOnly: true,
    secure: true,
    sameSite: "lax",
    path: "/api/courier/accept",
    maxAge: 10 * 60,
  });
  return response;
}
