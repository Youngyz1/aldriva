import { courierJson, validateCourierRequestSession } from "@/lib/courier/http";
import { clearCourierSessionCookie } from "@/lib/kitchen/http";
import { revokeWorkerSession } from "@/lib/kitchen/worker-session";

export async function POST(request: Request) {
  const { token, session } = await validateCourierRequestSession(request);
  if (session && token) await revokeWorkerSession(token);
  const response = courierJson({ ok: true });
  clearCourierSessionCookie(response);
  return response;
}

export async function GET() {
  return courierJson({ error: "Method not allowed" }, 405);
}
