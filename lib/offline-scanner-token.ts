import crypto from "crypto";

export interface ScannerTokenPayload {
  userId: string;
  eventId: string;
  role: string;
  entranceId?: string | null;
  issuedAt: number; // Unix timestamp in ms
  expiresAt: number; // Unix timestamp in ms
}

export type VerifyTokenResult =
  | { valid: true; payload: ScannerTokenPayload }
  | { valid: false; payload: null; error: string };

function getSigningSecret(): string {
  const secret = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET || "aldriva-scanner-secret-fallback";
  return secret;
}

/**
 * Signs an 8-hour event-scoped token for offline scanner authorization.
 */
export function signScannerToken(payload: Omit<ScannerTokenPayload, "issuedAt" | "expiresAt"> & { durationHours?: number }): { token: string; expiresAt: number } {
  const issuedAt = Date.now();
  const durationHours = payload.durationHours ?? 8;
  const expiresAt = issuedAt + durationHours * 3600 * 1000;

  const fullPayload: ScannerTokenPayload = {
    userId: payload.userId,
    eventId: payload.eventId,
    role: payload.role,
    entranceId: payload.entranceId ?? null,
    issuedAt,
    expiresAt,
  };

  const payloadStr = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", getSigningSecret()).update(payloadStr).digest("base64url");
  const token = `${payloadStr}.${hmac}`;

  return { token, expiresAt };
}

/**
 * Verifies a signed scanner token and returns the payload if valid and not expired.
 */
export function verifyScannerToken(token: string, expectedEventId?: string): VerifyTokenResult {
  if (!token || typeof token !== "string" || !token.includes(".")) {
    return { valid: false, payload: null, error: "Malformed token" };
  }

  const [payloadStr, signature] = token.split(".");
  if (!payloadStr || !signature) {
    return { valid: false, payload: null, error: "Invalid token format" };
  }

  const expectedHmac = crypto.createHmac("sha256", getSigningSecret()).update(payloadStr).digest("base64url");

  // Constant-time comparison
  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedHmac);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, payload: null, error: "Invalid signature" };
    }
  } catch {
    return { valid: false, payload: null, error: "Signature verification failed" };
  }

  try {
    const payload: ScannerTokenPayload = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8"));
    if (!payload.expiresAt || Date.now() > payload.expiresAt) {
      return { valid: false, payload: null, error: "Token expired" };
    }
    if (expectedEventId && payload.eventId !== expectedEventId) {
      return { valid: false, payload: null, error: "Event mismatch" };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, payload: null, error: "Invalid payload JSON" };
  }
}
