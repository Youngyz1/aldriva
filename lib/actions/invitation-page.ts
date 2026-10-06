/**
 * lib/actions/invitation-page.ts
 *
 * Server actions and data loaders for Invitation Pages.
 *
 * Security:
 * - Every mutative server action begins by validating user identity and calling
 *   `hasEventOrOrganizerAccess(user.id, eventId, ['event_manager'])`.
 * - Guest-facing reads use service-role queries in server components to read published snapshots.
 * - Snapshots strictly contain page-content; live event fields and guest PII are never persisted in snapshots.
 */

"use server";

import { randomBytes } from "node:crypto";
import { getCurrentUser } from "@/lib/auth";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import {
  InvitationPageDraftSchema,
  validateForPublish,
  type InvitationPageDraftInput,
  type ValidationErrorItem,
} from "@/lib/invitation-page-schema";
import type {
  InvitationPageSnapshot,
  EventInvitationPageRow,
  EventLiveFields,
  InvitationLocale,
} from "@/lib/types/invitation-page-snapshot";
import { cleanupOrphanInvitationAudio } from "@/lib/uploadAudio";

export interface SaveDraftResult {
  ok: boolean;
  error?: string;
  errors?: ValidationErrorItem[];
}

export interface PublishResult {
  ok: boolean;
  error?: string;
  errors?: ValidationErrorItem[];
  publishedAt?: string;
}

export interface PreviewTokenResult {
  ok: boolean;
  error?: string;
  token?: string;
  expiresAt?: string;
}

/**
 * Saves or updates an in-progress draft for an event's invitation page.
 */
export async function saveInvitationPageDraft(
  eventId: string,
  draftInput: InvitationPageDraftInput
): Promise<SaveDraftResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized. Please log in." };
  }

  const hasAccess = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!hasAccess) {
    return { ok: false, error: "Forbidden. You do not have permission to manage this event." };
  }

  const parsed = InvitationPageDraftSchema.safeParse(draftInput);
  if (!parsed.success) {
    const errors: ValidationErrorItem[] = parsed.error.issues.map((i) => ({
      field: i.path.join("."),
      message: i.message,
    }));
    return { ok: false, error: "Validation failed", errors };
  }

  const valid = parsed.data;
  const admin = createSupabaseAdmin();

  const payload = {
    event_id: eventId,
    template_id: valid.template_id,
    locale: valid.locale,

    display_title: valid.display_title || null,
    eyebrow: valid.eyebrow || null,
    host_names: valid.host_names || null,
    story_headline: valid.story_headline || null,
    story_text: valid.story_text || null,
    story_image_url: valid.story_image_url || null,

    hero_image_url: valid.hero_image_url || null,
    hero_image_alt: valid.hero_image_alt || null,
    hero_image_focus_x: valid.hero_image_focus_x ?? 50,
    hero_image_focus_y: valid.hero_image_focus_y ?? 50,
    scroll_prompt: valid.scroll_prompt || null,

    venue_name: valid.venue_name || null,
    address: valid.address || null,
    parking_notes: valid.parking_notes || null,
    timezone: valid.timezone || null,

    dress_code: valid.dress_code || null,
    dress_code_notes: valid.dress_code_notes || null,
    additional_notes: valid.additional_notes || null,
    hashtag: valid.hashtag || null,

    music_audio_url: valid.music_audio_url || null,
    music_title: valid.music_title || null,

    partner1_name: valid.partner1_name || null,
    partner2_name: valid.partner2_name || null,
    family_note: valid.family_note || null,
    wedding_subtype: valid.wedding_subtype || null,
    registry_note: valid.registry_note || null,

    celebrant_name: valid.celebrant_name || null,
    age_milestone: valid.age_milestone || null,
    theme: valid.theme || null,
    gift_note: valid.gift_note || null,

    schedule: valid.schedule || null,
    gallery: valid.gallery || null,
    venues: valid.venues || null,
    accommodations: valid.accommodations || null,
    colors_of_the_day: valid.colors_of_the_day || null,
    wedding_story: valid.wedding_story || null,

    updated_at: new Date().toISOString(),
  };

  const { error: upsertError } = await admin
    .from("event_invitation_pages")
    .upsert(payload, { onConflict: "event_id" });

  if (upsertError) {
    console.error("[saveInvitationPageDraft]", upsertError);
    return { ok: false, error: "Failed to save draft. Try again." };
  }

  return { ok: true };
}

/**
 * Promotes the current draft to the published snapshot.
 * Requires mandatory fields (timezone, title, template-specific requirements).
 */
export async function publishInvitationPage(
  eventId: string,
  locale: InvitationLocale = "en"
): Promise<PublishResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized. Please log in." };
  }

  const hasAccess = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!hasAccess) {
    return { ok: false, error: "Forbidden. You do not have permission to manage this event." };
  }

  const admin = createSupabaseAdmin();

  // 1. Fetch live event
  const { data: event, error: eventError } = await admin
    .from("events")
    .select("id, title, event_date, end_date, venue, street_address, city, latitude, longitude, eventbrite_event_id, category")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError || !event) {
    return { ok: false, error: "Event not found." };
  }

  // 2. Fetch current draft
  const { data: draftRow, error: draftError } = await admin
    .from("event_invitation_pages")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  if (draftError || !draftRow) {
    return { ok: false, error: "Draft not found. Please save your invitation page first." };
  }

  // 3. Validate for publishing
  const validation = validateForPublish(draftRow, event, locale);
  if (!validation.valid) {
    return {
      ok: false,
      error: locale === "fr" ? "Veuillez corriger les erreurs avant de publier." : "Please fix validation errors before publishing.",
      errors: validation.errors,
    };
  }

  // 4. Construct immutable published snapshot (PAGE-CONTENT ONLY)
  const snapshot: InvitationPageSnapshot = {
    template_id: draftRow.template_id,
    locale: locale,

    display_title: draftRow.display_title || null,
    eyebrow: draftRow.eyebrow || null,
    host_names: draftRow.host_names || null,
    story_headline: draftRow.story_headline || null,
    story_text: draftRow.story_text || null,
    story_image_url: draftRow.story_image_url || null,

    hero_image_url: draftRow.hero_image_url || null,
    hero_image_alt: draftRow.hero_image_alt || null,
    hero_image_focus_x: draftRow.hero_image_focus_x ?? 50,
    hero_image_focus_y: draftRow.hero_image_focus_y ?? 50,
    scroll_prompt: draftRow.scroll_prompt || null,

    venue_name: draftRow.venue_name || null,
    address: draftRow.address || null,
    parking_notes: draftRow.parking_notes || null,
    timezone: draftRow.timezone || "UTC",

    dress_code: draftRow.dress_code || null,
    dress_code_notes: draftRow.dress_code_notes || null,
    additional_notes: draftRow.additional_notes || null,
    hashtag: draftRow.hashtag || null,

    music_audio_url: draftRow.music_audio_url || null,
    music_title: draftRow.music_title || null,

    partner1_name: draftRow.partner1_name || null,
    partner2_name: draftRow.partner2_name || null,
    family_note: draftRow.family_note || null,
    wedding_subtype: draftRow.wedding_subtype || null,
    registry_note: draftRow.registry_note || null,

    celebrant_name: draftRow.celebrant_name || null,
    age_milestone: draftRow.age_milestone || null,
    theme: draftRow.theme || null,
    gift_note: draftRow.gift_note || null,

    schedule: draftRow.schedule || null,
    gallery: draftRow.gallery || null,
    venues: draftRow.venues || null,
    accommodations: draftRow.accommodations || null,
    colors_of_the_day: draftRow.colors_of_the_day || null,
    wedding_story: draftRow.wedding_story || null,
  };

  const nowIso = new Date().toISOString();

  // 5. Commit to database
  const { error: publishError } = await admin
    .from("event_invitation_pages")
    .update({
      page_status: "published",
      published_at: nowIso,
      published_snapshot: snapshot,
      locale,
      updated_at: nowIso,
    })
    .eq("event_id", eventId);

  if (publishError) {
    console.error("[publishInvitationPage]", publishError);
    return { ok: false, error: "Failed to publish invitation page." };
  }

  // 6. Cleanup orphan audio in background
  try {
    await cleanupOrphanInvitationAudio(eventId, draftRow.music_audio_url);
  } catch (err) {
    console.warn("[publishInvitationPage] orphan cleanup warning:", err);
  }

  return { ok: true, publishedAt: nowIso };
}

/**
 * Reverts the invitation page status to 'draft'.
 * Guests immediately fall back to the classic invitation card.
 */
export async function unpublishInvitationPage(eventId: string): Promise<{ ok: boolean; error?: string }> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized." };
  }

  const hasAccess = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!hasAccess) {
    return { ok: false, error: "Forbidden." };
  }

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("event_invitation_pages")
    .update({
      page_status: "draft",
      updated_at: new Date().toISOString(),
    })
    .eq("event_id", eventId);

  if (error) {
    console.error("[unpublishInvitationPage]", error);
    return { ok: false, error: "Failed to unpublish." };
  }

  return { ok: true };
}

/**
 * Generates or refreshes a draft preview token (64 hex chars, 7-day TTL).
 */
export async function createOrRegeneratePreviewToken(eventId: string): Promise<PreviewTokenResult> {
  const user = await getCurrentUser();
  if (!user) {
    return { ok: false, error: "Unauthorized." };
  }

  const hasAccess = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!hasAccess) {
    return { ok: false, error: "Forbidden." };
  }

  const token = randomBytes(32).toString("hex");
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString();

  const admin = createSupabaseAdmin();
  const { error } = await admin
    .from("invitation_page_preview_tokens")
    .upsert(
      {
        event_id: eventId,
        token,
        created_by: user.id,
        expires_at: expiresAt,
        created_at: new Date().toISOString(),
      },
      { onConflict: "event_id" }
    );

  if (error) {
    console.error("[createOrRegeneratePreviewToken]", error);
    return { ok: false, error: "Failed to generate preview link." };
  }

  return { ok: true, token, expiresAt };
}

/**
 * Fetches the draft row for the event dashboard editor.
 */
export async function getInvitationPageDraft(eventId: string): Promise<EventInvitationPageRow | null> {
  const user = await getCurrentUser();
  if (!user) return null;

  const hasAccess = await hasEventOrOrganizerAccess(user.id, eventId, ["event_manager"]);
  if (!hasAccess) return null;

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("event_invitation_pages")
    .select("*")
    .eq("event_id", eventId)
    .maybeSingle();

  return (data as EventInvitationPageRow) ?? null;
}

/**
 * Fetches the active published page snapshot for public guest rendering.
 */
export async function getPublishedInvitationPage(
  eventId: string
): Promise<{ published_snapshot: InvitationPageSnapshot; page_status: "published"; locale: InvitationLocale } | null> {
  if (!eventId) return null;

  const admin = createSupabaseAdmin();
  const { data } = await admin
    .from("event_invitation_pages")
    .select("published_snapshot, page_status, locale")
    .eq("event_id", eventId)
    .eq("page_status", "published")
    .maybeSingle();

  if (!data || !data.published_snapshot) return null;

  return {
    published_snapshot: data.published_snapshot as InvitationPageSnapshot,
    page_status: "published",
    locale: (data.locale as InvitationLocale) || "en",
  };
}

/**
 * Resolves a preview token to read the draft page content for host pre-release checks.
 */
export async function getInvitationPagePreviewByToken(
  token: string
): Promise<
  | { valid: true; draft: EventInvitationPageRow; event: EventLiveFields; expiresAt: string }
  | { valid: false; reason: "invalid" | "expired" }
> {
  if (!token || token.length !== 64) {
    return { valid: false, reason: "invalid" };
  }

  const admin = createSupabaseAdmin();
  const { data: tokenRecord } = await admin
    .from("invitation_page_preview_tokens")
    .select("event_id, expires_at")
    .eq("token", token)
    .maybeSingle();

  if (!tokenRecord) {
    return { valid: false, reason: "invalid" };
  }

  if (new Date(tokenRecord.expires_at).getTime() < Date.now()) {
    return { valid: false, reason: "expired" };
  }

  const { data: event } = await admin
    .from("events")
    .select("id, title, slug, event_date, end_date, venue, street_address, city, latitude, longitude, category")
    .eq("id", tokenRecord.event_id)
    .maybeSingle();

  if (!event) {
    return { valid: false, reason: "invalid" };
  }

  const { data: draft } = await admin
    .from("event_invitation_pages")
    .select("*")
    .eq("event_id", tokenRecord.event_id)
    .maybeSingle();

  const effectiveDraft = (draft as EventInvitationPageRow) || {
    id: "",
    event_id: event.id,
    template_id: "gala-editorial",
    locale: "en",
    page_status: "draft",
    published_at: null,
    published_snapshot: null,
    display_title: null,
    eyebrow: null,
    host_names: null,
    story_headline: null,
    story_text: null,
    story_image_url: null,
    hero_image_url: null,
    hero_image_alt: null,
    hero_image_focus_x: 50,
    hero_image_focus_y: 50,
    scroll_prompt: null,
    venue_name: null,
    address: null,
    parking_notes: null,
    timezone: "UTC",
    dress_code: null,
    dress_code_notes: null,
    additional_notes: null,
    hashtag: null,
    music_audio_url: null,
    music_title: null,
    partner1_name: null,
    partner2_name: null,
    family_note: null,
    wedding_subtype: null,
    registry_note: null,
    celebrant_name: null,
    age_milestone: null,
    theme: null,
    gift_note: null,
    schedule: null,
    gallery: null,
    venues: null,
    accommodations: null,
    colors_of_the_day: null,
    wedding_story: null,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  return {
    valid: true,
    draft: effectiveDraft,
    event: event as EventLiveFields,
    expiresAt: tokenRecord.expires_at,
  };
}
