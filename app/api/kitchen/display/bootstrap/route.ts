import { checkRateLimitFailClosed, clientIp } from "@/lib/rate-limit";
import { hashWorkerToken, validateKitchenDisplayToken } from "@/lib/kitchen/worker-session";
import { kitchenJson, setDisplayCookie } from "@/lib/kitchen/http";

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
  if (!TOKEN_HEX.test(token)) return kitchenJson({ error: "This display link is invalid or revoked." }, 400);

  const tokenHash = hashWorkerToken(token.toLowerCase());
  const ipLimit = await checkRateLimitFailClosed("kitchenDisplayBootstrap", `ip:${clientIp(request)}`);
  if (!ipLimit.allowed) return kitchenJson({ error: "Too many requests. Try again shortly." }, 429);
  const tokenLimit = await checkRateLimitFailClosed("kitchenDisplayBootstrap", `link:${tokenHash}`);
  if (!tokenLimit.allowed) return kitchenJson({ error: "Too many requests. Try again shortly." }, 429);

  const scope = await validateKitchenDisplayToken(token.toLowerCase());
  if (!scope) return kitchenJson({ error: "This display link is invalid or revoked." }, 400);

  const response = kitchenJson({ ok: true });
  setDisplayCookie(response, token.toLowerCase());
  return response;
}
