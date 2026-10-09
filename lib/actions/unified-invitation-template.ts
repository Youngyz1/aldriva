/**
 * lib/actions/unified-invitation-template.ts
 *
 * Round 5, step 2: one selection writes BOTH invitation variants.
 *
 * Atomicity (owner decision): the two writes live in the
 * set_unified_invitation_template RPC (migration 163) — either both
 * columns land or neither does. A compensating rollback was rejected:
 * the compensation itself can fail, leaving a split state with no
 * recourse but logs. The RPC additionally re-checks kind='invitation'
 * inside the function (defense in depth for any future caller).
 *
 * Published pages: the card reads events.invitation_template_id live,
 * while the page renders the published snapshot — so a template change
 * on a published invitation updates the card immediately and the page on
 * next publish. The action reports needsPublish so the picker shows an
 * explicit "Publish to apply" notice (the hasDraftChanges badge already
 * covers template_id, so the dashboard state stays consistent).
 *
 * Rule 1: invitation-kind events only. Nothing is deleted or rewritten
 * except the two selected columns.
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
  /** True when the page is published and still renders the old design. */
  needsPublish?: boolean;
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
  const [{ data: cardRow }, { data: pageRow }] = await Promise.all([
    admin
      .from("invitation_templates")
      .select("id")
      .eq("slug", pair.cardSlug)
      .eq("is_active", true)
      .maybeSingle(),
    admin
      .from("event_invitation_pages")
      .select("page_status, published_snapshot")
      .eq("event_id", eventId)
      .maybeSingle(),
  ]);

  const cardUuid = (cardRow as { id?: string } | null)?.id;
  if (!cardUuid) {
    return { ok: false, error: "This template's card artwork is unavailable." };
  }

  const page = pageRow as {
    page_status?: string | null;
    published_snapshot?: { template_id?: string | null } | null;
  } | null;
  const needsPublish =
    page?.page_status === "published" &&
    (page?.published_snapshot?.template_id ?? null) !== pair.pageId;

  // Atomic write: both columns land or neither does (migration 163).
  // A missing function means the migration is not applied — fail closed
  // with a generic message (never raw DB text).
  const { error: rpcError } = await admin.rpc("set_unified_invitation_template", {
    p_event_id: eventId,
    p_card_template_id: cardUuid,
    p_page_template_id: pair.pageId,
  });

  if (rpcError) {
    console.error("[setUnifiedInvitationTemplate] RPC failed:", rpcError.message);
    const code = rpcError.message || "";
    if (/NOT_INVITATION_KIND/i.test(code)) {
      return { ok: false, error: "Unified templates are available only for invitation events." };
    }
    if (/EVENT_NOT_FOUND/i.test(code)) {
      return { ok: false, error: "Event not found." };
    }
    if (/UNKNOWN_CARD_TEMPLATE/i.test(code)) {
      return { ok: false, error: "This template's card artwork is unavailable." };
    }
    return { ok: false, error: "Could not apply this template. Try again." };
  }

  revalidatePath(`/dashboard/events/${eventId}/invitation-page`);
  revalidatePath(`/dashboard/events/${eventId}/overview`);
  return { ok: true, cardSlug: pair.cardSlug, pageId: pair.pageId, needsPublish };
}
