import { checkRateLimitFailClosed, clientIp } from "@/lib/rate-limit";
import { consumeCookInvitation, hashWorkerToken, KITCHEN_INVITE_COOKIE, readRequestCookie } from "@/lib/kitchen/worker-session";
import { clearInviteCookie, kitchenJson, setSessionCookie } from "@/lib/kitchen/http";

export async function GET() {
  return kitchenJson({ error: "Method not allowed" }, 405);
}

export async function POST(request: Request) {
  const inviteToken = readRequestCookie(request, KITCHEN_INVITE_COOKIE);
  if (!inviteToken) return kitchenJson({ error: "This invitation link is invalid or expired." }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return kitchenJson({ error: "Enter the last four digits of your phone number." }, 400);
  }
  const phoneLast4 =
    body && typeof body === "object" && "phoneLast4" in body && typeof body.phoneLast4 === "string"
      ? body.phoneLast4
      : "";
  if (!/^[0-9]{4}$/.test(phoneLast4)) {
    return kitchenJson({ error: "Enter the last four digits of your phone number." }, 400);
  }

  const inviteHash = hashWorkerToken(inviteToken);
  const ipLimit = await checkRateLimitFailClosed("kitchenAccept", `ip:${clientIp(request)}`);
  if (!ipLimit.allowed) return kitchenJson({ error: "Too many requests. Try again shortly." }, 429);
  const inviteLimit = await checkRateLimitFailClosed("kitchenAccept", `invite:${inviteHash}`);
  if (!inviteLimit.allowed) return kitchenJson({ error: "Too many requests. Try again shortly." }, 429);

  const accepted = await consumeCookInvitation(inviteToken, phoneLast4);
  if (!accepted) return kitchenJson({ error: "This invitation link or phone confirmation is invalid." }, 400);

  const response = kitchenJson({ ok: true });
  setSessionCookie(response, accepted.sessionToken, accepted.expiresAt);
  clearInviteCookie(response);
  return response;
}
