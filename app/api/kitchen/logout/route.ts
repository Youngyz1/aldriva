import { kitchenJson, clearSessionCookie } from "@/lib/kitchen/http";
import { KITCHEN_SESSION_COOKIE, readRequestCookie, revokeWorkerSession } from "@/lib/kitchen/worker-session";

export async function POST(request: Request) {
  const token = readRequestCookie(request, KITCHEN_SESSION_COOKIE);
  if (token) await revokeWorkerSession(token);
  const response = kitchenJson({ ok: true });
  clearSessionCookie(response);
  return response;
}

export async function GET() {
  return kitchenJson({ error: "Method not allowed" }, 405);
}
