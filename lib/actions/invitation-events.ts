/**
 * lib/actions/invitation-events.ts
 *
 * Server actions for first-class invitation events (Round 3 COMMIT 1).
 *
 * - createInvitationDraft: invitation WITHOUT a prior event — inserts the
 *   event row (kind=invitation, visibility=private, status=draft,
 *   placeholder title) and returns it for an immediate builder redirect.
 *   Idempotent via the client-supplied draft key: same key → same slug →
 *   UNIQUE(events.slug) turns a double submit/refresh into fetch-existing.
 * - updateInvitationEventFields: title/date/venue/city collected in the
 *   builder's Basics section for invitation-kind events.
 * - convertToInvitationEvent: removal-from-discovery path for a public event
 *   that already has an invitation page. Blocked when tickets were sold.
 */

"use server";

import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkInvitationPageAccess } from "@/lib/actions/invitation-page";
import {
  EVENT_KIND_INVITATION,
  EVENT_KIND_PUBLIC,
  INVITATION_DRAFT_TITLE,
  buildInvitationDraftSlug,
} from "@/lib/invitation-events";

export interface InvitationDraftResult {
  ok: boolean;
  eventId?: string;
  error?: string;
}

/** Draft keys are client-generated idempotency tokens (uuid hex). */
function isValidDraftKey(key: unknown): key is string {
  return typeof key === "string" && /^[a-zA-Z0-9-]{8,64}$/.test(key);
}

export async function createInvitationDraft(draftKey: string): Promise<InvitationDraftResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to create an invitation." };
  if (!isValidDraftKey(draftKey)) return { ok: false, error: "Invalid draft key." };

  const slug = buildInvitationDraftSlug(draftKey);
  const admin = createSupabaseAdmin();

  // No ticket tiers, no event form: the builder collects everything.
  const { data, error } = await admin
    .from("events")
    .insert({
      title: INVITATION_DRAFT_TITLE,
      slug,
      kind: EVENT_KIND_INVITATION,
      visibility: "private",
      status: "draft",
      user_id: user.id,
    })
    .select("id")
    .single();

  if (!error && data) return { ok: true, eventId: data.id };

  // Idempotency: UNIQUE(events.slug) fired → the first submit already won.
  // Return the existing row after verifying it belongs to this user.
  if (error && (error.code === "23505" || /duplicate|unique/i.test(error.message))) {
    const { data: existing } = await admin
      .from("events")
      .select("id, user_id, kind")
      .eq("slug", slug)
      .maybeSingle();
    if (existing && existing.user_id === user.id && existing.kind === EVENT_KIND_INVITATION) {
      return { ok: true, eventId: existing.id };
    }
  }

  return { ok: false, error: "Could not create the invitation draft." };
}

export interface UpdateEventFieldsResult {
  ok: boolean;
  error?: string;
}

const MAX_TITLE = 140;
const MAX_VENUE = 200;
const MAX_CITY = 120;

/**
 * Basics-section save for invitation-kind events. Real values only —
 * placeholders are rejected so they can never reach guest pages.
 */
export async function updateInvitationEventFields(
  eventId: string,
  fields: { title?: string; event_date?: string | null; venue?: string | null; city?: string | null }
): Promise<UpdateEventFieldsResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to edit this invitation." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await checkInvitationPageAccess(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this invitation." };
  }

  const patch: Record<string, string | null> = {};
  if (fields.title !== undefined) {
    const title = fields.title.trim();
    if (!title) return { ok: false, error: "Give your invitation a real title." };
    if (title === INVITATION_DRAFT_TITLE) {
      return { ok: false, error: "Give your invitation a real title." };
    }
    if (title.length > MAX_TITLE) return { ok: false, error: "Title is too long." };
    patch.title = title;
  }
  if (fields.event_date !== undefined) {
    if (fields.event_date === null || fields.event_date === "") {
      patch.event_date = null;
    } else {
      const at = new Date(fields.event_date);
      if (Number.isNaN(at.getTime())) return { ok: false, error: "Invalid date." };
      patch.event_date = at.toISOString();
    }
  }
  if (fields.venue !== undefined) {
    const venue = (fields.venue ?? "").trim();
    if (venue.length > MAX_VENUE) return { ok: false, error: "Venue is too long." };
    patch.venue = venue || null;
  }
  if (fields.city !== undefined) {
    const city = (fields.city ?? "").trim();
    if (city.length > MAX_CITY) return { ok: false, error: "City is too long." };
    patch.city = city || null;
  }
  if (Object.keys(patch).length === 0) return { ok: true };

  // Invitation-kind only: public events keep their ticket-first edit flow.
  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("events")
    .update(patch)
    .eq("id", eventId)
    .eq("kind", EVENT_KIND_INVITATION);
  if (error) return { ok: false, error: "Could not save event details." };
  return { ok: true };
}

export interface ConvertEventResult {
  ok: boolean;
  error?: string;
  ticketsSold?: number;
}

/**
 * Removal-from-discovery path: a public event WITH an invitation page
 * becomes kind=invitation (visibility forced private by the DB CHECK in the
 * same atomic update). Blocked when tickets were sold — paid history stays
 * purchasable/refundable on the public event.
 */
export async function convertToInvitationEvent(eventId: string): Promise<ConvertEventResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, error: "Sign in to convert this event." };
  if (!eventId) return { ok: false, error: "Missing event." };
  if (!(await checkInvitationPageAccess(user.id, eventId))) {
    return { ok: false, error: "You do not have access to this event." };
  }

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, kind, visibility")
    .eq("id", eventId)
    .maybeSingle();
  if (!event) return { ok: false, error: "Event not found." };
  if (event.kind === EVENT_KIND_INVITATION) return { ok: true };

  const { data: page } = await admin
    .from("event_invitation_pages")
    .select("event_id")
    .eq("event_id", eventId)
    .maybeSingle();
  if (!page) return { ok: false, error: "Only events with an invitation page can be converted." };

  const { count } = await admin
    .from("ticket_orders")
    .select("id", { count: "exact", head: true })
    .eq("event_id", eventId)
    .eq("status", "valid");
  if ((count ?? 0) > 0) {
    return {
      ok: false,
      ticketsSold: count ?? 0,
      error: `Tickets have been sold (${count}). Conversion is blocked to preserve purchase history.`,
    };
  }

  // Atomic: kind + visibility together satisfy events_invitation_private_check.
  const { error } = await admin
    .from("events")
    .update({ kind: EVENT_KIND_INVITATION, visibility: "private" })
    .eq("id", eventId)
    .eq("kind", EVENT_KIND_PUBLIC);
  if (error) return { ok: false, error: "Could not convert this event." };
  return { ok: true };
}
