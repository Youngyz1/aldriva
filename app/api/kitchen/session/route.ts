import { checkRateLimitFailClosed, clientIp } from "@/lib/rate-limit";
import { kitchenJson, clearSessionCookie, setSessionCookie } from "@/lib/kitchen/http";
import { KITCHEN_SESSION_COOKIE, readRequestCookie, validateAndRenewWorkerSession } from "@/lib/kitchen/worker-session";

export async function GET(request: Request) {
  const ipLimit = await checkRateLimitFailClosed("kitchenSession", `ip:${clientIp(request)}`);
  if (!ipLimit.allowed) return kitchenJson({ error: "Too many requests. Try again shortly." }, 429);

  const token = readRequestCookie(request, KITCHEN_SESSION_COOKIE);
  const session = token ? await validateAndRenewWorkerSession(token) : null;
  if (!session) {
    const response = kitchenJson({ error: "Kitchen session is no longer valid." }, 401);
    clearSessionCookie(response);
    return response;
  }

  const response = kitchenJson({ ok: true, role: session.role });
  // Refresh the browser cookie to match the database's current sliding expiry.
  setSessionCookie(response, token!, session.expiresAt);
  return response;
}
