import "server-only";

import { courierJson } from "@/lib/kitchen/http";
import {
  COURIER_SESSION_COOKIE,
  readRequestCookie,
  validateAndRenewWorkerSession,
  type WorkerSession,
} from "@/lib/kitchen/worker-session";

export { courierJson };

export async function validateCourierRequestSession(request: Request): Promise<{
  token: string | null;
  session: WorkerSession | null;
}> {
  const token = readRequestCookie(request, COURIER_SESSION_COOKIE);
  const session = token ? await validateAndRenewWorkerSession(token, "courier") : null;
  return { token, session };
}

export function validCourierOrderId(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value);
}
