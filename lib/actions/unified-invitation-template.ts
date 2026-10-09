/**
 * lib/actions/unified-invitation-template.ts
 *
 * Round 5, step 1: one selection writes BOTH invitation variants.
 *
 * - Card: events.invitation_template_id (UUID, resolved from the pair's
 *   card slug against active invitation_templates rows).
 * - Page: event_invitation_pages.template_id (upsert — creates the draft
 *   row with column defaults when the event has no page row yet, e.g.
 *   older card-only drafts).
 *
 * Rule 1: invitation-kind events only (assertInvitationKindEvent), same
 * access bar as the page builder (checkInvitationPageAccess). Nothing is
 * ever deleted or rewritten except the two selected columns.
 */

"use server";

import { revalidatePath } from "next/cache";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  assertInvitationKindEvent,
  checkInvitationPageAccess,
} from "@/lib/actions/invitation-page";
import { getUnifiedTemplate } from "@/lib/unified-invitation-templates";

export interface SetUnifiedTemplateResult {
  ok: boolean;
  error?: string;
  cardSlug?: string;
  pageId?: string;
}

export async function setUnifiedInvitationTemplate(
  eventId: string,
  unifiedId: string
): Promise<SetUnifiedTemplateResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized. Please log in." };
  }
  if (!eventId || !unifiedId) {
    return { ok: false, error: "Missing event or template." };
  }

  const hasAccess = await checkInvitationPageAccess(user.id, eventId);
  if (!hasAccess) {
    return { ok: false, error: "Forbidden. You do not have permission to manage this event." };
  }

  // Round 5 Rule 1: unified selection serves invitation-kind events only.
  if (!(await assertInvitationKindEvent(eventId))) {
    return { ok: false, error: "Unified templates are available only for invitation events." };
  }

  const pair = getUnifiedTemplate(unifiedId);
  if (!pair) {
    return { ok: false, error: "Unknown template." };
  }

  const admin = createSupabaseAdmin();
  const { data: cardRow } = await admin
    .from("invitation_templates")
    .select("id")
    .eq("slug", pair.cardSlug)
    .eq("is_active", true)
    .maybeSingle();
  const cardUuid = (cardRow as { id?: string } | null)?.id;
  if (!cardUuid) {
    return { ok: false, error: "This template's card artwork is unavailable." };
  }

  const { error: cardError } = await admin
    .from("events")
    .update({ invitation_template_id: cardUuid })
    .eq("id", eventId);
  if (cardError) {
    console.error("[setUnifiedInvitationTemplate] card write failed:", cardError.message);
    return { ok: false, error: "Could not save the card template. Try again." };
  }

  const { error: pageError } = await admin
    .from("event_invitation_pages")
    .upsert({ event_id: eventId, template_id: pair.pageId }, { onConflict: "event_id" });
  if (pageError) {
    console.error("[setUnifiedInvitationTemplate] page write failed:", pageError.message);
    return { ok: false, error: "Card saved, but the page template could not be saved. Try again." };
  }

  revalidatePath(`/dashboard/events/${eventId}/invitation-page`);
  revalidatePath(`/dashboard/events/${eventId}/overview`);
  return { ok: true, cardSlug: pair.cardSlug, pageId: pair.pageId };
}
