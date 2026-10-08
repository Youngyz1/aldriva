/**
 * lib/actions/invitation-sharing.ts
 *
 * General share link for invitation-kind events (Round 3 COMMIT 3).
 *
 * - One link per event, keyed by a 256-bit random token (never the slug,
 *   never a guest token), readable without login.
 * - Works only while the page is published AND share_enabled AND the event
 *   is kind=invitation. Public events can never have one.
 * - Host can enable, disable and regenerate (rotation invalidates the old
 *   token). Default off.
 */

"use server";

import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkInvitationPageAccess } from "@/lib/actions/invitation-page";
import { buildShareUrl } from "@/lib/invitation-url";

export interface ShareLinkState {
  ok: boolean;
  error?: string;
  enabled?: boolean;
  url?: string | null;
  published?: boolean;
  isInvitationKind?: boolean;
}

/** Host view of the share state (drives the dashboard panel). */
export async function getShareLinkState(eventId: string): Promise<ShareLinkState> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage sharing." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await checkInvitationPageAccess(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }

  const admin = createSupabaseAdmin();
  const [{ data: event }, { data: page }] = await Promise.all([
    admin.from("events").select("kind").eq("id", eventId).maybeSingle(),
    admin
      .from("event_invitation_pages")
      .select("page_status, share_token, share_enabled")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);

  const isInvitationKind = (event as { kind?: string | null } | null)?.kind === "invitation";
  const published = (page as { page_status?: string | null } | null)?.page_status === "published";
  const enabled =
    isInvitationKind &&
    published &&
    (page as { share_enabled?: boolean | null } | null)?.share_enabled === true;
  const token = (page as { share_token?: string | null } | null)?.share_token ?? null;
  return {
    ok: true,
    enabled,
    published,
    isInvitationKind,
    url: enabled && token ? buildShareUrl(token) : null,
  };
}

export interface ShareLinkMutation {
  ok: boolean;
  error?: string;
  url?: string | null;
}

/** Enable (mints a token on first enable) or disable. Requires published + invitation kind. */
export async function setShareEnabled(eventId: string, enabled: boolean): Promise<ShareLinkMutation> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage sharing." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await checkInvitationPageAccess(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }

  const admin = createSupabaseAdmin();
  const [{ data: event }, { data: page }] = await Promise.all([
    admin.from("events").select("kind").eq("id", eventId).maybeSingle(),
    admin
      .from("event_invitation_pages")
      .select("page_status, share_token")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);

  if ((event as { kind?: string | null } | null)?.kind !== "invitation") {
    return { ok: false, error: "Share links exist only for invitation events." };
  }
  if ((page as { page_status?: string | null } | null)?.page_status !== "published") {
    return { ok: false, error: "Publish the invitation before sharing it." };
  }

  const token =
    (page as { share_token?: string | null } | null)?.share_token ?? randomBytes(32).toString("hex");
  const { error } = await admin
    .from("event_invitation_pages")
    .update({ share_enabled: enabled, share_token: token })
    .eq("event_id", eventId);
  if (error) return { ok: false, error: "Could not update sharing." };
  return { ok: true, url: enabled ? buildShareUrl(token) : null };
}

/** Rotate the token (old links die immediately). Requires published + invitation kind. */
export async function regenerateShareToken(eventId: string): Promise<ShareLinkMutation> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to manage sharing." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await checkInvitationPageAccess(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }

  const admin = createSupabaseAdmin();
  const [{ data: event }, { data: page }] = await Promise.all([
    admin.from("events").select("kind").eq("id", eventId).maybeSingle(),
    admin.from("event_invitation_pages").select("page_status").eq("event_id", eventId).maybeSingle(),
  ]);

  if ((event as { kind?: string | null } | null)?.kind !== "invitation") {
    return { ok: false, error: "Share links exist only for invitation events." };
  }
  if ((page as { page_status?: string | null } | null)?.page_status !== "published") {
    return { ok: false, error: "Publish the invitation before sharing it." };
  }

  const token = randomBytes(32).toString("hex");
  const { error } = await admin
    .from("event_invitation_pages")
    .update({ share_token: token, share_regenerated_at: new Date().toISOString() })
    .eq("event_id", eventId);
  if (error) return { ok: false, error: "Could not regenerate the link." };
  return { ok: true, url: buildShareUrl(token) };
}
