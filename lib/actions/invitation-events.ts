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
import { checkInvitationPageAccess, saveInvitationPageDraft } from "@/lib/actions/invitation-page";
import { InvitationPageDraftSchema, type InvitationPageDraftInput } from "@/lib/invitation-page-schema";
import { sanitizeDraftForTemplate } from "@/lib/invitation-template-sanitize";
import {
  EVENT_KIND_INVITATION,
  EVENT_KIND_PUBLIC,
  INVITATION_DRAFT_TITLE,
  buildInvitationDraftSlug,
} from "@/lib/invitation-events";
import { isUniqueViolation } from "@/lib/event-slug";
import { shouldSkipPromotion, resolvePromotionTemplateId, isPromotableTitle } from "@/lib/invitation-promotion-core";

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
  // Return the existing row after verifying it belongs to this user, so a
  // double submit creates exactly one draft. The draft slug is key-derived
  // (stable per intent) rather than title-derived, and shared-slug
  // violation detection keeps this in sync with the public flow.
  if (error && isUniqueViolation(error)) {
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

/**
 * Phase 6: owner + kind check for an eventId, independent of the richer
 * manager/organizer-role check in checkInvitationPageAccess — used by the
 * client promotion orchestrator to verify a cached "already promoted"
 * localStorage marker still points at a real row this user actually owns
 * before trusting it (handoff-design.md v3 §3 step "a").
 */
export async function confirmOwnedInvitationEvent(eventId: string): Promise<boolean> {
  const user = await getCurrentUser();
  if (!user || !eventId) return false;
  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("events")
    .select("user_id, kind")
    .eq("id", eventId)
    .maybeSingle();
  return Boolean(data && data.user_id === user.id && data.kind === EVENT_KIND_INVITATION);
}

export interface PromoteLocalDraftInput {
  draftId: string;
  templateId: string;
  title: string;
  eventDate: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  builderDraft: Record<string, unknown>;
}

export interface PromoteLocalDraftResult {
  ok: boolean;
  eventId?: string;
  skipped?: boolean;
  /** True when the basics step was intentionally skipped (blank/placeholder title) rather than failed. */
  basicsSkipped?: boolean;
  step?: "auth" | "event" | "basics" | "draft";
  error?: string;
}

/**
 * Phase 6: promotes a local (anonymous) invitation draft into a real event,
 * owned by the now-authenticated caller. Owner is always this server's own
 * supabase.auth.getUser() result (via getCurrentUser(), the same
 * React-cache()-memoized server call every other action in this file
 * already uses) — any client-supplied user id is ignored, there isn't even
 * a parameter for one.
 *
 * Reuses createInvitationDraft / updateInvitationEventFields /
 * saveInvitationPageDraft unchanged — this function only orchestrates them
 * and adds the skip-guard + server-side template_id re-resolution.
 */
export async function promoteLocalInvitationDraftServer(
  input: PromoteLocalDraftInput
): Promise<PromoteLocalDraftResult> {
  const user = await getCurrentUser();
  if (!user) return { ok: false, step: "auth", error: "Sign in to publish your invitation." };
  if (!isValidDraftKey(input.draftId)) return { ok: false, step: "auth", error: "Invalid draft id." };

  // 1. Sanitize and validate draft content BEFORE creating any event in the database.
  // This guarantees that validation failures never leave a half-created or orphaned event.
  const resolvedTemplateId = resolvePromotionTemplateId(input.templateId);
  const sanitizedDraft = sanitizeDraftForTemplate(input.builderDraft, resolvedTemplateId);
  const draftInput = {
    ...sanitizedDraft,
    template_id: resolvedTemplateId,
  } as InvitationPageDraftInput;

  const validation = InvitationPageDraftSchema.safeParse(draftInput);
  if (!validation.success) {
    const readableMessages = validation.error.issues.map((i) => {
      if (i.path.includes("effects")) return "Selected template does not support one or more chosen animation effects.";
      if (i.path.includes("layout_blocks")) return "Selected template does not support one or more content sections.";
      if (i.path.includes("gallery")) return "All gallery photos must be uploaded before publishing.";
      return i.message;
    });
    const uniqueError = Array.from(new Set(readableMessages)).join(" ");
    return { ok: false, step: "draft", error: uniqueError || "Invitation draft validation failed." };
  }

  const admin = createSupabaseAdmin();
  const slug = buildInvitationDraftSlug(input.draftId);

  // 2. Idempotent check / reuse on retry: if an event was already created for this
  // draftId by this user (e.g. earlier failed save attempt or double click), reuse it!
  let eventId: string;
  const { data: existingEvent } = await admin
    .from("events")
    .select("id")
    .eq("slug", slug)
    .eq("user_id", user.id)
    .maybeSingle();

  if (existingEvent) {
    const { data: existingPage } = await admin
      .from("event_invitation_pages")
      .select("template_id")
      .eq("event_id", existingEvent.id)
      .maybeSingle();
    if (shouldSkipPromotion(existingPage)) {
      return { ok: true, eventId: existingEvent.id, skipped: true };
    }
    // Content save was incomplete from a prior attempt: reuse this event row idempotently.
    eventId = existingEvent.id;
  } else {
    const created = await createInvitationDraft(input.draftId);
    if (!created.ok || !created.eventId) {
      return { ok: false, step: "event", error: created.error ?? "Could not create the invitation." };
    }
    eventId = created.eventId;
  }

  let basicsSkipped = false;
  if (isPromotableTitle(input.title)) {
    const basics = await updateInvitationEventFields(eventId, {
      title: input.title,
      event_date: input.eventDate,
      venue: input.venue,
      city: input.city,
    });
    if (!basics.ok) {
      return { ok: false, step: "basics", error: basics.error ?? "Could not save event details." };
    }
  } else {
    basicsSkipped = true;
  }

  const saved = await saveInvitationPageDraft(eventId, draftInput);
  if (!saved.ok) {
    return { ok: false, step: "draft", error: saved.error ?? "Could not save invitation content." };
  }

  return { ok: true, eventId, skipped: false, basicsSkipped };
}
