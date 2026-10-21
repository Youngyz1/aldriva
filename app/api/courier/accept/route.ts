import { checkRateLimitFailClosed, clientIp } from "@/lib/rate-limit";
import { consumeCourierInvitation, COURIER_INVITE_COOKIE, hashWorkerToken, readRequestCookie } from "@/lib/kitchen/worker-session";
import { clearCourierInviteCookie, courierJson, setCourierSessionCookie } from "@/lib/kitchen/http";

export async function GET() {
  return courierJson({ error: "Method not allowed" }, 405);
}

export async function POST(request: Request) {
  const inviteToken = readRequestCookie(request, COURIER_INVITE_COOKIE);
  if (!inviteToken) return courierJson({ error: "This invitation link is invalid or expired." }, 400);

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return courierJson({ error: "Enter the last four digits of your phone number." }, 400);
  }
  const phoneLast4 = body && typeof body === "object" && "phoneLast4" in body && typeof body.phoneLast4 === "string"
    ? body.phoneLast4
    : "";
  if (!/^[0-9]{4}$/.test(phoneLast4)) {
    return courierJson({ error: "Enter the last four digits of your phone number." }, 400);
  }

  const inviteHash = hashWorkerToken(inviteToken);
  const [ipLimit, inviteLimit] = await Promise.all([
    checkRateLimitFailClosed("courierAccept", `ip:${clientIp(request)}`),
    checkRateLimitFailClosed("courierAccept", `invite:${inviteHash}`),
  ]);
  if (!ipLimit.allowed || !inviteLimit.allowed) {
    return courierJson({ error: "Too many requests. Try again shortly." }, 429);
  }

  const accepted = await consumeCourierInvitation(inviteToken, phoneLast4);
  if (!accepted) return courierJson({ error: "This invitation link or phone confirmation is invalid." }, 400);

  const response = courierJson({ ok: true });
  setCourierSessionCookie(response, accepted.sessionToken, accepted.expiresAt);
  clearCourierInviteCookie(response);
  return response;
}
