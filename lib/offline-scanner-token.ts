import "server-only";
import crypto from "crypto";

export interface ScannerTokenPayload {
  userId?: string;
  staffMemberId?: string;
  sessionHash?: string;
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
  const secret = process.env.SCANNER_TOKEN_SECRET || process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXTAUTH_SECRET;
  if (!secret || Buffer.byteLength(secret, "utf8") < 32) {
    throw new Error(
      "SCANNER_TOKEN_SECRET, SUPABASE_SERVICE_ROLE_KEY, or NEXTAUTH_SECRET must contain at least 32 bytes"
    );
  }
  return secret;
}

type ScannerTokenIdentity =
  | { userId: string; staffMemberId?: never; sessionHash?: never }
  | { userId?: never; staffMemberId: string; sessionHash: string };

/**
 * Signs an 8-hour event-scoped token for offline scanner authorization.
 */
export function signScannerToken(payload: ScannerTokenIdentity & Omit<ScannerTokenPayload, "issuedAt" | "expiresAt" | "userId" | "staffMemberId" | "sessionHash"> & { durationHours?: number }): { token: string; expiresAt: number } {
  const issuedAt = Date.now();
  const durationHours = payload.durationHours ?? 8;
  const expiresAt = issuedAt + durationHours * 3600 * 1000;

  const fullPayload: ScannerTokenPayload = {
    ...(payload.userId ? { userId: payload.userId } : {}),
    ...(payload.staffMemberId ? { staffMemberId: payload.staffMemberId } : {}),
    ...(payload.sessionHash ? { sessionHash: payload.sessionHash } : {}),
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

  const parts = token.split(".");
  const payloadStr = parts[0];
  const signature = parts[1];
  if (parts.length !== 2 || !payloadStr || !signature) {
    return { valid: false, payload: null, error: "Invalid token format" };
  }

  let expectedHmac: string;
  try {
    expectedHmac = crypto.createHmac("sha256", getSigningSecret()).update(payloadStr).digest("base64url");
  } catch {
    return { valid: false, payload: null, error: "Scanner token signing is not configured" };
  }

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
    if (
      !Number.isFinite(payload.issuedAt) ||
      !Number.isFinite(payload.expiresAt) ||
      payload.expiresAt <= payload.issuedAt ||
      Date.now() > payload.expiresAt
    ) {
      return { valid: false, payload: null, error: "Token expired" };
    }
    const accountIdentity = typeof payload.userId === "string" && payload.userId.length > 0;
    const guestIdentity =
      typeof payload.staffMemberId === "string" &&
      payload.staffMemberId.length > 0 &&
      typeof payload.sessionHash === "string" &&
      /^[0-9a-f]{64}$/.test(payload.sessionHash);
    if (accountIdentity === guestIdentity || typeof payload.eventId !== "string" || typeof payload.role !== "string") {
      return { valid: false, payload: null, error: "Invalid token identity" };
    }
    if (expectedEventId && payload.eventId !== expectedEventId) {
      return { valid: false, payload: null, error: "Event mismatch" };
    }
    return { valid: true, payload };
  } catch {
    return { valid: false, payload: null, error: "Invalid payload JSON" };
  }
}
