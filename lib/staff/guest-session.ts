import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const EVENT_STAFF_SESSION_COOKIE_PREFIX = "aldriva_event_staff_";

export type EventStaffSession = {
  staffMemberId: string;
  role: "event_manager" | "ticket_scanner";
  entranceId: string | null;
  expiresAt: string;
};

export function eventStaffSessionCookieName(eventId: string): string {
  return `${EVENT_STAFF_SESSION_COOKIE_PREFIX}${eventId}`;
}

export function generateEventStaffSessionToken(): string {
  return randomBytes(32).toString("base64url");
}

export function hashEventStaffSessionToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function isEventStaffSessionToken(token: unknown): token is string {
  return typeof token === "string" && /^[A-Za-z0-9_-]{43}$/.test(token);
}

export async function validateEventStaffSession(
  eventId: string,
  token: string
): Promise<EventStaffSession | null> {
  if (!isEventStaffSessionToken(token)) return null;
  return validateEventStaffSessionHash(eventId, hashEventStaffSessionToken(token));
}

export async function validateEventStaffSessionHash(
  eventId: string,
  sessionHash: string
): Promise<EventStaffSession | null> {
  if (!/^[0-9a-f]{64}$/.test(sessionHash)) return null;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("validate_and_renew_event_staff_session", {
    p_event_id: eventId,
    p_session_token_hash: sessionHash,
  });
  if (error) throw error;
  const row = Array.isArray(data) ? data[0] : data;
  if (!row || typeof row !== "object") return null;
  const value = row as Record<string, unknown>;
  if (
    typeof value.out_staff_member_id !== "string" ||
    (value.out_role !== "event_manager" && value.out_role !== "ticket_scanner") ||
    typeof value.out_session_expires_at !== "string"
  ) return null;
  return {
    staffMemberId: value.out_staff_member_id,
    role: value.out_role,
    entranceId: typeof value.out_entrance_id === "string" ? value.out_entrance_id : null,
    expiresAt: value.out_session_expires_at,
  };
}
