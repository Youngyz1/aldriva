"use client";

/**
 * lib/invitation-local-draft-promotion.ts
 *
 * Phase 6 (layer6-step2): client-side orchestrator that turns a local
 * (anonymous) invitation draft into a real, server-owned event. One shared
 * function — every caller (the post-login landing route and an
 * already-authenticated Publish click) goes through this, so a bug fixed
 * here is fixed everywhere (handoff-design.md v3 §3).
 *
 * No UI wiring lives here — see handoff-design.md v3 for where this gets
 * called from; that wiring is explicitly a later layer.
 */

import {
  loadInvitationLocalDraft,
  deleteInvitationLocalDraft,
  getInvitationLocalDraftImageBlob,
  clearActiveInvitationDraftId,
  listLocalDraftImageFields,
  isBlobUrlValue,
} from "@/lib/invitation-local-draft";
import { promotedMarkerKey, promotedImagesCacheKey, applyImageUrls } from "@/lib/invitation-promotion-core";
import { sanitizeDraftForTemplate } from "@/lib/invitation-template-sanitize";
import { uploadImage } from "@/lib/uploadImage";
import {
  promoteLocalInvitationDraftServer,
  confirmOwnedInvitationEvent,
  type PromoteLocalDraftResult as ServerPromoteResult,
} from "@/lib/actions/invitation-events";

export type PromoteLocalDraftResult =
  | { ok: true; eventId: string; skipped: boolean; basicsSkipped?: boolean }
  | { ok: false; reason: "not-found" }
  | { ok: false; reason: "promotion-failed"; step?: ServerPromoteResult["step"]; error?: string };

interface CachedImageEntry {
  url: string;
  sha256: string;
}

function readImageCache(userId: string, draftId: string): Record<string, CachedImageEntry> {
  try {
    const raw = window.localStorage.getItem(promotedImagesCacheKey(userId, draftId));
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    return parsed && typeof parsed === "object" ? (parsed as Record<string, CachedImageEntry>) : {};
  } catch {
    return {};
  }
}

function writeImageCache(userId: string, draftId: string, cache: Record<string, CachedImageEntry>): void {
  try {
    window.localStorage.setItem(promotedImagesCacheKey(userId, draftId), JSON.stringify(cache));
  } catch {
    // Best-effort — a failed cache write just means the next retry re-uploads.
  }
}

async function sha256OfBlob(blob: Blob): Promise<string> {
  const buffer = await blob.arrayBuffer();
  const digest = await crypto.subtle.digest("SHA-256", buffer);
  return Array.from(new Uint8Array(digest))
    .map((byte) => byte.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * Resolves every blob:-valued image field on the draft to a real, uploaded
 * cms-media URL. Reuses a cached URL only when the field's current blob's
 * sha256 still matches what was cached — a re-cropped field (new blob,
 * same field key) correctly re-uploads instead of serving a stale URL.
 */
async function resolveImageUrls(
  draftId: string,
  userId: string,
  builderDraft: Record<string, unknown>
): Promise<Record<string, string>> {
  const cache = readImageCache(userId, draftId);
  const resolved: Record<string, string> = {};
  let cacheChanged = false;

  for (const { key, value } of listLocalDraftImageFields(builderDraft)) {
    if (!value || !isBlobUrlValue(value)) continue;
    const blob = await getInvitationLocalDraftImageBlob(draftId, key);
    if (!blob) continue;

    const hash = await sha256OfBlob(blob);
    const cached = cache[key];
    if (cached && cached.sha256 === hash) {
      resolved[key] = cached.url;
      continue;
    }

    // Stored blobs were originally Files (handleLocalImageCropped's `file`
    // param), but IndexedDB's structured-clone read-back types as a bare
    // Blob — uploadImage needs a File, so re-wrap it without copying bytes.
    const file = new File([blob], key, { type: blob.type });
    const url = await uploadImage(file, "cms-media", `invitation-promoted/${draftId}`);
    resolved[key] = url;
    cache[key] = { url, sha256: hash };
    cacheChanged = true;
  }

  const musicAudioUrl = builderDraft.music_audio_url;
  if (typeof musicAudioUrl === "string" && isBlobUrlValue(musicAudioUrl)) {
    const musicBlob = await getInvitationLocalDraftImageBlob(draftId, "music_audio_url");
    if (musicBlob) {
      const hash = await sha256OfBlob(musicBlob);
      const cached = cache["music_audio_url"];
      if (cached && cached.sha256 === hash) {
        resolved["music_audio_url"] = cached.url;
      } else {
        const file = new File([musicBlob], "music.mp3", { type: musicBlob.type || "audio/mpeg" });
        const url = await uploadImage(file, "cms-media", `invitation-promoted/${draftId}`);
        resolved["music_audio_url"] = url;
        cache["music_audio_url"] = { url, sha256: hash };
        cacheChanged = true;
      }
    }
  }

  if (cacheChanged) writeImageCache(userId, draftId, cache);
  return resolved;
}

export async function promoteLocalDraft(draftId: string, userId: string): Promise<PromoteLocalDraftResult> {
  // (a) Marker check — but only trust it if the referenced event still
  // really exists and still belongs to this user; a stale/forged marker
  // must never short-circuit a legitimate promotion.
  const markerKey = promotedMarkerKey(userId, draftId);
  const cachedEventId = (() => {
    try {
      return window.localStorage.getItem(markerKey);
    } catch {
      return null;
    }
  })();
  if (cachedEventId) {
    const owned = await confirmOwnedInvitationEvent(cachedEventId);
    if (owned) {
      return { ok: true, eventId: cachedEventId, skipped: true };
    }
    try {
      window.localStorage.removeItem(markerKey);
    } catch {
      // ignore
    }
  }

  // (b) Load the envelope.
  const envelope = await loadInvitationLocalDraft(draftId);
  if (!envelope) {
    return { ok: false, reason: "not-found" };
  }

  // Sanitize the draft against the target template before resolving images and calling server
  const sanitizedDraft = sanitizeDraftForTemplate(
    envelope.payload.builderDraft,
    envelope.payload.templateId
  );

  // (c) Resolve every local image to a real URL (cached by content hash).
  const imageUrls = await resolveImageUrls(draftId, userId, sanitizedDraft);
  const builderDraftWithRealImages = applyImageUrls(sanitizedDraft, imageUrls);

  // (d) Call the server action — the single source of truth for what
  // actually gets written; it never trusts this client's templateId.
  const result = await promoteLocalInvitationDraftServer({
    draftId,
    templateId: envelope.payload.templateId,
    title: envelope.payload.title,
    eventDate: envelope.payload.eventDate,
    venue: envelope.payload.venue,
    address: envelope.payload.address,
    city: envelope.payload.city,
    builderDraft: builderDraftWithRealImages,
  });

  if (!result.ok || !result.eventId) {
    // (e), failure branch — local draft and image cache stay untouched so
    // a retry is cheap and nothing the user did is lost.
    return { ok: false, reason: "promotion-failed", step: result.step, error: result.error };
  }

  // (e), success branch.
  try {
    window.localStorage.setItem(markerKey, result.eventId);
  } catch {
    // Non-fatal — worst case, a retry re-runs the (idempotent) server call.
  }
  await deleteInvitationLocalDraft(draftId, Object.keys(envelope.payload.images));
  clearActiveInvitationDraftId();

  return { ok: true, eventId: result.eventId, skipped: result.skipped ?? false, basicsSkipped: result.basicsSkipped };
}
