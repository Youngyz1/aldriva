import "server-only";
import crypto from "crypto";

export type CodeType = "ticket" | "order" | "reservation";
export type ScanAction = "check_in" | "pick_up" | "deliver" | "refund" | "seat" | "no_show";

export const CODE_TYPES: readonly CodeType[] = ["ticket", "order", "reservation"];
export const SCAN_ACTIONS: readonly ScanAction[] = ["check_in", "pick_up", "deliver", "refund", "seat", "no_show"];

export const ALLOWED_ACTIONS: Record<CodeType, readonly ScanAction[]> = {
  ticket: ["check_in"],
  order: ["pick_up", "deliver", "refund"],
  reservation: ["seat", "no_show"],
};

export interface ScannerScope {
  event_id: string;
  tenant_id?: string;
  business_id?: string;
  branch_id?: string;
}

export interface ScannerActor {
  user_id?: string;
  staff_member_id?: string;
  role: string;
  session_hash?: string;
}

export interface ScannerTokenPayloadV1 {
  userId?: string;
  staffMemberId?: string;
  sessionHash?: string;
  eventId: string;
  role: string;
  entranceId?: string | null;
  jti?: string;
  issuedAt: number;
  expiresAt: number;
}

export interface ScannerTokenPayloadV2 {
  v: 2;
  typ: "scan";
  code_type: CodeType[];
  scope: ScannerScope;
  actor: ScannerActor;
  actions: ScanAction[];
  iat: number;
  exp: number;
  jti: string;
  entranceId?: string | null;
  role?: string;
}

export type ScannerTokenPayload = ScannerTokenPayloadV1 | ScannerTokenPayloadV2;

export interface ScannerPrincipal {
  version: 1 | 2;
  userId?: string;
  staffMemberId?: string;
  sessionHash?: string;
  eventId: string;
  role: string;
  entranceId?: string | null;
  jti?: string;
  codeType: CodeType[];
  actions: ScanAction[];
  scope: ScannerScope;
  iat: number;
  exp: number;
}

const JTI_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const MAX_PAYLOAD_BYTES = 4096;

export type VerifyTokenResult =
  | { valid: true; payload: ScannerTokenPayload; principal: ScannerPrincipal }
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

function isV2(p: any): p is ScannerTokenPayloadV2 {
  return p && typeof p === "object" && p.v === 2 && p.typ === "scan";
}

function normalizeV1(payload: ScannerTokenPayloadV1): ScannerPrincipal {
  return {
    version: 1,
    userId: payload.userId,
    staffMemberId: payload.staffMemberId,
    sessionHash: payload.sessionHash,
    eventId: payload.eventId,
    role: payload.role,
    entranceId: payload.entranceId ?? null,
    jti: payload.jti,
    codeType: ["ticket"],
    actions: ["check_in"],
    scope: { event_id: payload.eventId },
    iat: payload.issuedAt,
    exp: payload.expiresAt,
  };
}

function validateV2(p: any, now: number): { ok: true; principal: ScannerPrincipal } | { ok: false; error: string } {
  if (!p || typeof p !== "object") return { ok: false, error: "Invalid payload JSON" };
  if (p.v !== 2) return { ok: false, error: "Unknown token version" };
  if (p.typ !== "scan") return { ok: false, error: "Invalid token type" };
  if (!Array.isArray(p.code_type) || p.code_type.length === 0 || p.code_type.length > 3) return { ok: false, error: "Invalid code_type" };
  if (new Set(p.code_type).size !== p.code_type.length) return { ok: false, error: "Duplicate code_type" };
  for (const ct of p.code_type) {
    if (!CODE_TYPES.includes(ct)) return { ok: false, error: "Unknown code_type" };
  }
  if (!Array.isArray(p.actions) || p.actions.length === 0 || p.actions.length > 6) return { ok: false, error: "Invalid actions" };
  if (new Set(p.actions).size !== p.actions.length) return { ok: false, error: "Duplicate actions" };
  for (const a of p.actions) {
    if (!SCAN_ACTIONS.includes(a)) return { ok: false, error: "Unknown action" };
  }
  // action must be allowed for at least one code type present
  const allowed = new Set(p.code_type.flatMap((ct: CodeType) => ALLOWED_ACTIONS[ct]));
  for (const a of p.actions) {
    if (!allowed.has(a)) return { ok: false, error: "Action not allowed for code type" };
  }
  if (!p.scope || typeof p.scope !== "object" || typeof p.scope.event_id !== "string") return { ok: false, error: "Invalid scope" };
  if (p.scope.tenant_id !== undefined && typeof p.scope.tenant_id !== "string") return { ok: false, error: "Invalid tenant_id" };
  if (p.scope.business_id !== undefined && typeof p.scope.business_id !== "string") return { ok: false, error: "Invalid business_id" };
  if (p.scope.branch_id !== undefined && typeof p.scope.branch_id !== "string") return { ok: false, error: "Invalid branch_id" };
  if (!p.actor || typeof p.actor !== "object") return { ok: false, error: "Invalid actor" };
  if (typeof p.actor.role !== "string") return { ok: false, error: "Invalid actor role" };
  const hasUser = typeof p.actor.user_id === "string" && p.actor.user_id.length > 0;
  const hasStaff = typeof p.actor.staff_member_id === "string" && p.actor.staff_member_id.length > 0;
  if (hasUser === hasStaff) return { ok: false, error: "Invalid actor identity" };
  if (p.actor.session_hash !== undefined && (typeof p.actor.session_hash !== "string" || !/^[0-9a-f]{64}$/.test(p.actor.session_hash))) return { ok: false, error: "Invalid session_hash" };
  if (typeof p.iat !== "number" || !Number.isFinite(p.iat)) return { ok: false, error: "Invalid iat" };
  if (typeof p.exp !== "number" || !Number.isFinite(p.exp)) return { ok: false, error: "Invalid exp" };
  if (typeof p.jti !== "string" || !JTI_RE.test(p.jti)) return { ok: false, error: "Missing token id" };
  const iatMs = p.iat * 1000;
  const expMs = p.exp * 1000;
  if (expMs <= iatMs) return { ok: false, error: "Token expired" };
  if (now > expMs) return { ok: false, error: "Token expired" };
  if (iatMs - now > 5 * 60 * 1000) return { ok: false, error: "iat in future" };
  if (expMs - iatMs > 12 * 3600 * 1000) return { ok: false, error: "Expiry too far" };
  const principal: ScannerPrincipal = {
    version: 2,
    userId: p.actor.user_id,
    staffMemberId: p.actor.staff_member_id,
    sessionHash: p.actor.session_hash,
    eventId: p.scope.event_id,
    role: p.actor.role,
    entranceId: p.entranceId ?? null,
    jti: p.jti,
    codeType: p.code_type,
    actions: p.actions,
    scope: p.scope,
    iat: iatMs,
    exp: expMs,
  };
  return { ok: true, principal };
}

export function signScannerToken(payload: ScannerTokenIdentity & Omit<ScannerTokenPayloadV1, "issuedAt" | "expiresAt" | "userId" | "staffMemberId" | "sessionHash"> & { durationHours?: number }): { token: string; expiresAt: number };
export function signScannerToken(payload: any): { token: string; expiresAt: number } {
  const issuedAt = Date.now();
  const durationHours = payload.durationHours ?? 8;
  const expiresAt = issuedAt + durationHours * 3600 * 1000;

  const fullPayload: ScannerTokenPayloadV1 = {
    ...(payload.userId ? { userId: payload.userId } : {}),
    ...(payload.staffMemberId ? { staffMemberId: payload.staffMemberId } : {}),
    ...(payload.sessionHash ? { sessionHash: payload.sessionHash } : {}),
    eventId: payload.eventId,
    role: payload.role,
    entranceId: payload.entranceId ?? null,
    jti: crypto.randomUUID(),
    issuedAt,
    expiresAt,
  };

  const payloadStr = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", getSigningSecret()).update(payloadStr).digest("base64url");
  const token = `${payloadStr}.${hmac}`;

  return { token, expiresAt };
}

export function signScannerTokenV2(params: {
  codeType: CodeType[];
  scope: ScannerScope;
  actor: ScannerActor;
  actions: ScanAction[];
  entranceId?: string | null;
  durationHours?: number;
}): { token: string; expiresAt: number } {
  const issuedAt = Date.now();
  const durationHours = params.durationHours ?? 8;
  const expiresAt = issuedAt + durationHours * 3600 * 1000;
  const fullPayload: ScannerTokenPayloadV2 = {
    v: 2,
    typ: "scan",
    code_type: params.codeType,
    scope: params.scope,
    actor: params.actor,
    actions: params.actions,
    iat: Math.floor(issuedAt / 1000),
    exp: Math.floor(expiresAt / 1000),
    jti: crypto.randomUUID(),
    entranceId: params.entranceId ?? null,
  };
  const payloadStr = Buffer.from(JSON.stringify(fullPayload)).toString("base64url");
  const hmac = crypto.createHmac("sha256", getSigningSecret()).update(payloadStr).digest("base64url");
  return { token: `${payloadStr}.${hmac}`, expiresAt };
}

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

  if (Buffer.byteLength(payloadStr, "utf8") > MAX_PAYLOAD_BYTES) {
    // still verify signature? reject size
  }

  let expectedHmac: string;
  try {
    expectedHmac = crypto.createHmac("sha256", getSigningSecret()).update(payloadStr).digest("base64url");
  } catch {
    return { valid: false, payload: null, error: "Scanner token signing is not configured" };
  }

  try {
    const sigBuf = Buffer.from(signature);
    const expBuf = Buffer.from(expectedHmac);
    if (sigBuf.length !== expBuf.length || !crypto.timingSafeEqual(sigBuf, expBuf)) {
      return { valid: false, payload: null, error: "Invalid signature" };
    }
  } catch {
    return { valid: false, payload: null, error: "Signature verification failed" };
  }

  if (Buffer.byteLength(payloadStr, "utf8") > MAX_PAYLOAD_BYTES) {
    return { valid: false, payload: null, error: "Payload too large" };
  }

  try {
    const raw = JSON.parse(Buffer.from(payloadStr, "base64url").toString("utf-8"));
    const now = Date.now();

    // v2
    if (raw && typeof raw === "object" && (raw.v === 2 || raw.v === 1 || raw.v === undefined)) {
      if (isV2(raw)) {
        const v = validateV2(raw, now);
        if (!v.ok) return { valid: false, payload: null, error: v.error };
        const principal = v.principal;
        if (expectedEventId && principal.eventId !== expectedEventId) {
          return { valid: false, payload: null, error: "Event mismatch" };
        }
        return { valid: true, payload: raw as ScannerTokenPayload, principal };
      }
    }

    // v1 (no v field)
    const payload: ScannerTokenPayloadV1 = raw;
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
    if (payload.jti !== undefined && (typeof payload.jti !== "string" || !JTI_RE.test(payload.jti))) {
      return { valid: false, payload: null, error: "Invalid token id" };
    }
    // reject unknown version values (3, 0, etc.) that are not 2 and not absent
    if (raw && typeof raw === "object" && raw.v !== undefined && raw.v !== 1 && raw.v !== 2) {
      return { valid: false, payload: null, error: "Unknown token version" };
    }
    // downgrade protection: a v2 payload relabelled as v1 still has v:2 in signed bytes, so signature mismatch already; but if v field present as 1 on a v2-shaped payload, reject
    return { valid: true, payload, principal: normalizeV1(payload) };
  } catch {
    return { valid: false, payload: null, error: "Invalid payload JSON" };
  }
}
