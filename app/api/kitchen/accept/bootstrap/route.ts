import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkRateLimitFailClosed, clientIp } from "@/lib/rate-limit";
import { hashWorkerToken } from "@/lib/kitchen/worker-session";
import { kitchenJson, setInviteCookie } from "@/lib/kitchen/http";

const TOKEN_HEX = /^[0-9a-f]{64}$/i;

export async function GET() {
  return kitchenJson({ error: "Method not allowed" }, 405);
}

export async function POST(request: Request) {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return kitchenJson({ error: "Invalid request" }, 400);
  }

  const token =
    body && typeof body === "object" && "token" in body && typeof body.token === "string"
      ? body.token
      : "";
  if (!TOKEN_HEX.test(token)) {
    return kitchenJson({ error: "This invitation link is invalid or expired." }, 400);
  }

  const tokenHash = hashWorkerToken(token.toLowerCase());
  const ip = clientIp(request);
  const ipLimit = await checkRateLimitFailClosed("kitchenInviteBootstrap", `ip:${ip}`);
  if (!ipLimit.allowed) return kitchenJson({ error: "Too many requests. Try again shortly." }, 429);
  const tokenLimit = await checkRateLimitFailClosed("kitchenInviteBootstrap", `invite:${tokenHash}`);
  if (!tokenLimit.allowed) return kitchenJson({ error: "Too many requests. Try again shortly." }, 429);

  const admin = createSupabaseAdmin();
  const { data: invitation, error: invitationError } = await admin
    .from("business_worker_invitations")
    .select("id, worker_id")
    .eq("token_hash", tokenHash)
    .gt("expires_at", new Date().toISOString())
    .is("token_consumed_at", null)
    .is("revoked_at", null)
    .maybeSingle();

  if (invitationError) return kitchenJson({ error: "Kitchen access is temporarily unavailable." }, 503);
  if (!invitation) return kitchenJson({ error: "This invitation link is invalid or expired." }, 400);

  const { data: worker, error: workerError } = await admin
    .from("business_workers")
    .select("id, role, is_active, deactivated_at")
    .eq("id", invitation.worker_id)
    .maybeSingle();
  if (workerError) return kitchenJson({ error: "Kitchen access is temporarily unavailable." }, 503);
  if (!worker || worker.role !== "cook" || worker.is_active !== true || worker.deactivated_at) {
    return kitchenJson({ error: "This invitation link is invalid or expired." }, 400);
  }

  const response = kitchenJson({ ok: true });
  setInviteCookie(response, token.toLowerCase());
  return response;
}
