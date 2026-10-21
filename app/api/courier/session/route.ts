import { checkRateLimitFailClosed, clientIp } from "@/lib/rate-limit";
import { courierJson, validateCourierRequestSession } from "@/lib/courier/http";
import { clearCourierSessionCookie, setCourierSessionCookie } from "@/lib/kitchen/http";

export async function GET(request: Request) {
  const limit = await checkRateLimitFailClosed("courierSession", `ip:${clientIp(request)}`);
  if (!limit.allowed) return courierJson({ error: "Too many requests. Try again shortly." }, 429);

  const { token, session } = await validateCourierRequestSession(request);
  if (!session || !token) {
    const response = courierJson({ error: "Courier session is no longer valid." }, 401);
    clearCourierSessionCookie(response);
    return response;
  }

  const response = courierJson({ ok: true, role: "courier" });
  setCourierSessionCookie(response, token, session.expiresAt);
  return response;
}
