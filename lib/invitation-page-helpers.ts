/**
 * lib/invitation-page-helpers.ts
 *
 * Pure (non-server-action) helpers for invitation page logic.
 *
 * IMPORTANT: This file must NOT have "use server" because it exports synchronous
 * functions. The server actions in lib/actions/invitation-page.ts import from here.
 */

import type {
  EventInvitationPageRow,
  InvitationPageSnapshot,
} from "@/lib/types/invitation-page-snapshot";

/**
 * Content keys compared to determine whether a draft has uncommitted changes
 * vs the published snapshot. updated_at and id are intentionally excluded.
 */
export const INVITATION_PAGE_CONTENT_KEYS: (keyof InvitationPageSnapshot)[] = [
  "template_id",
  "locale",
  "display_title",
  "eyebrow",
  "host_names",
  "story_headline",
  "story_text",
  "story_image_url",
  "hero_image_url",
  "hero_image_alt",
  "hero_image_focus_x",
  "hero_image_focus_y",
  "scroll_prompt",
  "venue_name",
  "address",
  "parking_notes",
  "timezone",
  "dress_code",
  "dress_code_notes",
  "additional_notes",
  "hashtag",
  "music_audio_url",
  "music_title",
  "partner1_name",
  "partner2_name",
  "family_note",
  "wedding_subtype",
  "registry_note",
  "celebrant_name",
  "age_milestone",
  "theme",
  "gift_note",
  "schedule",
  "gallery",
  "venues",
  "accommodations",
  "colors_of_the_day",
  "wedding_story",
];

/**
 * Returns true if the draft's content fields differ from the published snapshot.
 * updated_at, id, page_status, published_at are not compared (they are metadata).
 */
export function hasDraftChanges(
  draft: EventInvitationPageRow,
  snapshot: InvitationPageSnapshot | null,
  pageStatus: string
): boolean {
  // A never-published draft has nothing to differ from.
  if (pageStatus !== "published" || !snapshot) {
    return false;
  }

  for (const key of INVITATION_PAGE_CONTENT_KEYS) {
    const dVal = (draft as unknown as Record<string, unknown>)[key];
    const sVal = (snapshot as unknown as Record<string, unknown>)[key];

    if (typeof dVal === "object" || typeof sVal === "object") {
      const dStr = JSON.stringify(dVal ?? null);
      const sStr = JSON.stringify(sVal ?? null);
      if (dStr !== sStr) return true;
    } else {
      const dNorm = dVal === "" || dVal === undefined ? null : dVal;
      const sNorm = sVal === "" || sVal === undefined ? null : sVal;
      if (dNorm !== sNorm) return true;
    }
  }

  return false;
}
