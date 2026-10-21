import "server-only";

import { createHash, randomBytes } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const KITCHEN_INVITE_COOKIE = "aldriva_kitchen_invite";
export const KITCHEN_SESSION_COOKIE = "aldriva_kitchen_session";
export const COURIER_INVITE_COOKIE = "aldriva_courier_invite";
export const COURIER_SESSION_COOKIE = "aldriva_courier_session";
export const KITCHEN_DISPLAY_COOKIE = "aldriva_kitchen_display";
export const KITCHEN_INVITE_COOKIE_PATH = "/api/kitchen/accept";
export const COURIER_INVITE_COOKIE_PATH = "/api/courier/accept";

const TOKEN_HEX = /^[0-9a-f]{64}$/i;

export function generateWorkerToken(): string {
  return randomBytes(32).toString("hex");
}

export function hashWorkerToken(token: string): string {
  return createHash("sha256").update(token, "utf8").digest("hex");
}

export function readRequestCookie(request: Request, name: string): string | null {
  const cookieHeader = request.headers.get("cookie");
  if (!cookieHeader) return null;
  for (const part of cookieHeader.split(";")) {
    const separator = part.indexOf("=");
    if (separator < 0 || part.slice(0, separator).trim() !== name) continue;
    return part.slice(separator + 1).trim() || null;
  }
  return null;
}

type ConsumedWorkerSession = {
  sessionToken: string;
  workerId: string;
  businessId: string;
  kitchenId: string | null;
  expiresAt: string;
};

export type ConsumedCookSession = ConsumedWorkerSession & { kitchenId: string };
export type ConsumedCourierSession = ConsumedWorkerSession & { kitchenId: null };

/** The SECURITY DEFINER RPC atomically consumes and creates the session. */
export async function consumeCookInvitation(
  invitationToken: string,
  phoneLast4: string
): Promise<ConsumedCookSession | null> {
  if (!TOKEN_HEX.test(invitationToken) || !/^[0-9]{4}$/.test(phoneLast4)) return null;

  const sessionToken = generateWorkerToken();
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("consume_business_worker_invitation", {
    p_invitation_token_hash: hashWorkerToken(invitationToken.toLowerCase()),
    p_phone_last4: phoneLast4,
    p_session_token_hash: hashWorkerToken(sessionToken),
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row?.out_worker_id ||
    !row?.out_business_id ||
    !row?.out_kitchen_id ||
    row?.out_role !== "cook" ||
    !row?.out_session_expires_at
  ) return null;

  return {
    sessionToken,
    workerId: String(row.out_worker_id),
    businessId: String(row.out_business_id),
    kitchenId: String(row.out_kitchen_id),
    expiresAt: String(row.out_session_expires_at),
  };
}

/** The same atomic consume RPC, but only a role=courier invitation is accepted. */
export async function consumeCourierInvitation(
  invitationToken: string,
  phoneLast4: string
): Promise<ConsumedCourierSession | null> {
  if (!TOKEN_HEX.test(invitationToken) || !/^[0-9]{4}$/.test(phoneLast4)) return null;

  const sessionToken = generateWorkerToken();
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("consume_business_worker_invitation", {
    p_invitation_token_hash: hashWorkerToken(invitationToken.toLowerCase()),
    p_phone_last4: phoneLast4,
    p_session_token_hash: hashWorkerToken(sessionToken),
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  if (
    !row?.out_worker_id ||
    !row?.out_business_id ||
    row?.out_kitchen_id != null ||
    row?.out_role !== "courier" ||
    !row?.out_session_expires_at
  ) return null;

  return {
    sessionToken,
    workerId: String(row.out_worker_id),
    businessId: String(row.out_business_id),
    kitchenId: null,
    expiresAt: String(row.out_session_expires_at),
  };
}

export type WorkerSession = {
  workerId: string;
  businessId: string;
  kitchenId: string | null;
  role: "cook" | "courier";
  expiresAt: string;
};

/**
 * Call only from a Route Handler or Server Action. The database function
 * checks session, active worker and invitation state and renews after 24h.
 */
export async function validateAndRenewWorkerSession(
  token: string,
  expectedRole: "cook" | "courier"
): Promise<WorkerSession | null> {
  if (!TOKEN_HEX.test(token)) return null;
  const admin = createSupabaseAdmin();
  const { data, error } = await admin.rpc("validate_and_renew_business_worker_session", {
    p_session_token_hash: hashWorkerToken(token.toLowerCase()),
  });
  if (error) return null;

  const row = Array.isArray(data) ? data[0] : data;
  const kitchenId = row?.out_kitchen_id == null ? null : String(row.out_kitchen_id);
  if (
    !row?.out_worker_id ||
    !row?.out_business_id ||
    row?.out_role !== expectedRole ||
    (expectedRole === "cook" && !kitchenId) ||
    !row?.out_session_expires_at
  ) return null;

  return {
    workerId: String(row.out_worker_id),
    businessId: String(row.out_business_id),
    kitchenId,
    role: expectedRole,
    expiresAt: String(row.out_session_expires_at),
  };
}

export async function revokeWorkerSession(token: string): Promise<void> {
  if (!TOKEN_HEX.test(token)) return;
  const admin = createSupabaseAdmin();
  await admin
    .from("business_worker_sessions")
    .update({ revoked_at: new Date().toISOString(), updated_at: new Date().toISOString() })
    .eq("token_hash", hashWorkerToken(token.toLowerCase()))
    .is("revoked_at", null);
}

/** Re-check a display cookie against the current link hash on each display request. */
export async function validateKitchenDisplayToken(token: string): Promise<{ kitchenId: string; businessId: string } | null> {
  if (!TOKEN_HEX.test(token)) return null;
  const admin = createSupabaseAdmin();
  const { data: link, error: linkError } = await admin
    .from("business_kitchen_display_links")
    .select("id, kitchen_id")
    .eq("token_hash", hashWorkerToken(token.toLowerCase()))
    .is("revoked_at", null)
    .maybeSingle();
  if (linkError || !link) return null;

  const { data: kitchen, error: kitchenError } = await admin
    .from("business_kitchens")
    .select("id, business_id")
    .eq("id", link.kitchen_id)
    .maybeSingle();
  if (kitchenError || !kitchen) return null;
  return { kitchenId: String(kitchen.id), businessId: String(kitchen.business_id) };
}
