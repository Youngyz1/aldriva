/**
 * Invitation-specific local draft: payload shape, the DraftAdapter
 * implementation, and the IndexedDB-backed store for Phase 5's anonymous
 * builder. No ownership/organizer/event ids anywhere in the payload type —
 * by construction, not by a runtime filter.
 *
 * Split deliberately: everything above the "Browser-only IO" marker is
 * pure and unit-tested directly (node --test, no IndexedDB needed).
 * Everything below touches `indexedDB`/`navigator.storage`/`localStorage`/
 * `BroadcastChannel` and is exercised live in a real browser instead —
 * this file has no new test-only dependency.
 */

import {
  type DraftAdapter,
  type DraftEnvelope,
  createDraftEnvelope,
  touchDraftEnvelope,
  hasForbiddenPayloadKeys,
  readDraftEnvelope,
} from "@/lib/local-draft-envelope";
import { ALLOWED_IMAGE_TYPES, MAX_ORIGINAL_BYTES } from "@/lib/imageCompression";

export const INVITATION_LOCAL_DRAFT_KIND = "invitation";
/** Matches the existing server-side gallery cap (lib/invitation-page-schema.ts). */
export const MAX_LOCAL_GALLERY_IMAGES = 12;
/** Soft per-draft budget checked against navigator.storage.estimate() before accepting a new image. */
export const LOCAL_DRAFT_IMAGE_BUDGET_BYTES = 50 * 1024 * 1024;

/**
 * The anonymous equivalent of BuilderDraft + the live-event fields that, in
 * server mode, come from a real `events` row (there is no event row here,
 * so title/date/venue live directly on the payload instead of being merged
 * in from elsewhere). `images` maps a field key (e.g. "heroImage",
 * "gallery_0") to a local blob-store key — never a `blob:` URL, which is
 * only valid for the document session that created it.
 */
export interface InvitationLocalDraftPayload {
  templateId: string;
  title: string;
  eventDate: string | null;
  venue: string | null;
  address: string | null;
  city: string | null;
  /** The rest of the invitation content, same shape as the server BuilderDraft minus template_id. */
  builderDraft: Record<string, unknown>;
  images: Record<string, string>;
}

export function isInvitationLocalDraftPayload(value: unknown): value is InvitationLocalDraftPayload {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    typeof candidate.templateId === "string" && candidate.templateId.length > 0
    && typeof candidate.title === "string"
    && (candidate.eventDate === null || typeof candidate.eventDate === "string")
    && (candidate.venue === null || typeof candidate.venue === "string")
    && (candidate.address === null || typeof candidate.address === "string")
    && (candidate.city === null || typeof candidate.city === "string")
    && typeof candidate.builderDraft === "object" && candidate.builderDraft !== null
    && typeof candidate.images === "object" && candidate.images !== null
  );
}

/**
 * Schema migration: unknown/future versions are unreadable, never
 * guess-upgraded. Phase 5 ships schema version 1 only, so there is nothing
 * to migrate from yet — this always discards.
 */
export const invitationLocalDraftAdapter: DraftAdapter<InvitationLocalDraftPayload> = {
  kind: INVITATION_LOCAL_DRAFT_KIND,
  isPayloadShape: isInvitationLocalDraftPayload,
  migrate: () => null,
};

export function createInvitationLocalDraft(
  draftId: string,
  payload: InvitationLocalDraftPayload,
  now?: Date
): DraftEnvelope<InvitationLocalDraftPayload> {
  return createDraftEnvelope({ kind: INVITATION_LOCAL_DRAFT_KIND, draftId, payload, now });
}

export function updateInvitationLocalDraft(
  envelope: DraftEnvelope<InvitationLocalDraftPayload>,
  payload: InvitationLocalDraftPayload,
  now?: Date
): DraftEnvelope<InvitationLocalDraftPayload> {
  return touchDraftEnvelope(envelope, payload, { now });
}

export function readInvitationLocalDraft(raw: unknown): DraftEnvelope<InvitationLocalDraftPayload> | null {
  return readDraftEnvelope(raw, invitationLocalDraftAdapter);
}

export type LocalImageValidationError = "invalid_type" | "too_large";

/**
 * Pure gate: would this file be rejected before it ever enters the local
 * draft's blob map? Mirrors lib/uploadImage.ts's own type/size checks
 * (ALLOWED_IMAGE_TYPES, MAX_ORIGINAL_BYTES) for the local/anonymous-builder
 * path, which never calls uploadImage and so never runs those checks itself.
 */
export function validateLocalImageFile(file: Pick<File, "type" | "size">): LocalImageValidationError | null {
  if (!ALLOWED_IMAGE_TYPES.includes(file.type as (typeof ALLOWED_IMAGE_TYPES)[number])) return "invalid_type";
  if (file.size > MAX_ORIGINAL_BYTES) return "too_large";
  return null;
}

/** Pure gate: is there room for one more gallery image? */
export function canAddGalleryImage(currentImageKeys: readonly string[]): boolean {
  const galleryCount = currentImageKeys.filter((key) => key.startsWith("gallery_")).length;
  return galleryCount < MAX_LOCAL_GALLERY_IMAGES;
}

/** Pure gate: would accepting `incomingBytes` more exceed the per-draft budget? */
export function isWithinImageBudget(
  estimate: { usage?: number; quota?: number } | null | undefined,
  currentDraftImageBytes: number,
  incomingBytes: number
): boolean {
  if (currentDraftImageBytes + incomingBytes > LOCAL_DRAFT_IMAGE_BUDGET_BYTES) return false;
  if (!estimate || typeof estimate.quota !== "number" || typeof estimate.usage !== "number") return true;
  const remaining = estimate.quota - estimate.usage;
  return incomingBytes <= remaining;
}

export function isForbiddenImagePayload(value: unknown): boolean {
  return hasForbiddenPayloadKeys(value).length > 0;
}

export function isBlobUrlValue(value: unknown): value is string {
  return typeof value === "string" && value.startsWith("blob:");
}

const EVERGREEN_IMAGE_FIELD_KEYS = [
  "envelope_photo_url", "envelope_photo_two_url", "cover_photo_url",
  "polaroid_photo_one_url", "polaroid_photo_two_url",
  "story_photo_one_url", "story_photo_two_url", "closing_photo_url", "rsvp_photo_url",
] as const;

/**
 * Enumerates every known image-bearing field on a local BuilderDraft-shaped
 * object (hero, wedding-story moments, gallery items, evergreen photo
 * slots). Pure — never touches IndexedDB. Used by both save-time capture
 * and load-time restore below, so the two stay in lockstep by construction.
 */
export function listLocalDraftImageFields(
  builderDraft: Record<string, unknown>
): Array<{ key: string; value: string | null }> {
  const fields: Array<{ key: string; value: string | null }> = [];

  const heroUrl = builderDraft.hero_image_url;
  fields.push({ key: "hero_image_url", value: typeof heroUrl === "string" ? heroUrl : null });

  const weddingStory = Array.isArray(builderDraft.wedding_story) ? builderDraft.wedding_story : [];
  weddingStory.forEach((item, index) => {
    const image = typeof item === "object" && item !== null ? (item as Record<string, unknown>).image : null;
    fields.push({ key: `wedding_story_${index}_image`, value: typeof image === "string" ? image : null });
  });

  const gallery = Array.isArray(builderDraft.gallery) ? builderDraft.gallery : [];
  gallery.forEach((item, index) => {
    const url = typeof item === "object" && item !== null ? (item as Record<string, unknown>).url : null;
    fields.push({ key: `gallery_${index}`, value: typeof url === "string" ? url : null });
  });

  const layout = builderDraft.blocks_layout;
  const templateData = layout && typeof layout === "object" ? (layout as Record<string, unknown>).template_data : null;
  if (templateData && typeof templateData === "object") {
    for (const key of EVERGREEN_IMAGE_FIELD_KEYS) {
      const value = (templateData as Record<string, unknown>)[key];
      fields.push({ key, value: typeof value === "string" ? value : null });
    }

    // Manifest-driven templates (e.g. minimalism-dark-blue) store photo
    // slots as an array under template_data, not a flat EVERGREEN key —
    // mf_hero_photos was previously invisible here, so a hero photo
    // uploaded in local mode was never captured or restored.
    const heroPhotos = Array.isArray((templateData as Record<string, unknown>).mf_hero_photos)
      ? ((templateData as Record<string, unknown>).mf_hero_photos as unknown[])
      : [];
    heroPhotos.forEach((item, index) => {
      const url = typeof item === "object" && item !== null ? (item as Record<string, unknown>).url : null;
      fields.push({ key: `mf_hero_photos_${index}`, value: typeof url === "string" ? url : null });
    });
  }

  return fields;
}

/** Sets one image field's value by key, returning a new builderDraft object (immutable). Unknown keys are a no-op. */
export function setLocalDraftImageField(
  builderDraft: Record<string, unknown>,
  key: string,
  url: string
): Record<string, unknown> {
  if (key === "hero_image_url") {
    return { ...builderDraft, hero_image_url: url };
  }
  const storyMatch = /^wedding_story_(\d+)_image$/.exec(key);
  if (storyMatch) {
    const index = Number(storyMatch[1]);
    const weddingStory = Array.isArray(builderDraft.wedding_story) ? [...builderDraft.wedding_story] : [];
    const existing = typeof weddingStory[index] === "object" && weddingStory[index] !== null
      ? (weddingStory[index] as Record<string, unknown>)
      : {};
    weddingStory[index] = { ...existing, image: url };
    return { ...builderDraft, wedding_story: weddingStory };
  }
  const galleryMatch = /^gallery_(\d+)$/.exec(key);
  if (galleryMatch) {
    const index = Number(galleryMatch[1]);
    const gallery = Array.isArray(builderDraft.gallery) ? [...builderDraft.gallery] : [];
    const existing = typeof gallery[index] === "object" && gallery[index] !== null
      ? (gallery[index] as Record<string, unknown>)
      : {};
    gallery[index] = { ...existing, url };
    return { ...builderDraft, gallery };
  }
  const heroPhotoMatch = /^mf_hero_photos_(\d+)$/.exec(key);
  if (heroPhotoMatch) {
    const index = Number(heroPhotoMatch[1]);
    const layout = builderDraft.blocks_layout && typeof builderDraft.blocks_layout === "object"
      ? (builderDraft.blocks_layout as Record<string, unknown>)
      : {};
    const templateData = layout.template_data && typeof layout.template_data === "object"
      ? (layout.template_data as Record<string, unknown>)
      : {};
    const heroPhotos = Array.isArray(templateData.mf_hero_photos) ? [...(templateData.mf_hero_photos as unknown[])] : [];
    const existing = typeof heroPhotos[index] === "object" && heroPhotos[index] !== null
      ? (heroPhotos[index] as Record<string, unknown>)
      : {};
    heroPhotos[index] = { ...existing, url };
    return {
      ...builderDraft,
      blocks_layout: { ...layout, template_data: { ...templateData, mf_hero_photos: heroPhotos } },
    };
  }
  if ((EVERGREEN_IMAGE_FIELD_KEYS as readonly string[]).includes(key)) {
    const layout = builderDraft.blocks_layout && typeof builderDraft.blocks_layout === "object"
      ? (builderDraft.blocks_layout as Record<string, unknown>)
      : {};
    const templateData = layout.template_data && typeof layout.template_data === "object"
      ? (layout.template_data as Record<string, unknown>)
      : {};
    return {
      ...builderDraft,
      blocks_layout: { ...layout, template_data: { ...templateData, [key]: url } },
    };
  }
  return builderDraft;
}

// ─────────────────────────────────────────────────────────────────────────
// Browser-only IO — not unit-tested directly; exercised live in a browser.
// ─────────────────────────────────────────────────────────────────────────

const DB_NAME = "aldriva-local-drafts";
const DB_VERSION = 1;
const ENVELOPE_STORE = "envelopes";
const IMAGE_STORE = "images";
const ACTIVE_DRAFT_MARKER_KEY = "aldriva-active-invitation-draft-id";
const BROADCAST_CHANNEL_NAME = "aldriva-invitation-local-draft";

function imageStoreKey(draftId: string, imageKey: string): string {
  return `${draftId}:${imageKey}`;
}

function openDraftDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const db = request.result;
      if (!db.objectStoreNames.contains(ENVELOPE_STORE)) {
        db.createObjectStore(ENVELOPE_STORE, { keyPath: "draftId" });
      }
      if (!db.objectStoreNames.contains(IMAGE_STORE)) {
        db.createObjectStore(IMAGE_STORE);
      }
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function runTransaction<T>(
  db: IDBDatabase,
  storeName: string,
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>
): Promise<T> {
  return new Promise((resolve, reject) => {
    const tx = db.transaction(storeName, mode);
    const store = tx.objectStore(storeName);
    const request = run(store);
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export async function saveInvitationLocalDraft(
  envelope: DraftEnvelope<InvitationLocalDraftPayload>
): Promise<void> {
  const db = await openDraftDatabase();
  try {
    await runTransaction(db, ENVELOPE_STORE, "readwrite", (store) => store.put(envelope));
    broadcastInvitationLocalDraftChange(envelope.draftId);
  } finally {
    db.close();
  }
}

export async function loadInvitationLocalDraft(
  draftId: string
): Promise<DraftEnvelope<InvitationLocalDraftPayload> | null> {
  const db = await openDraftDatabase();
  try {
    const raw = await runTransaction(db, ENVELOPE_STORE, "readonly", (store) => store.get(draftId));
    return readInvitationLocalDraft(raw);
  } finally {
    db.close();
  }
}

export async function deleteInvitationLocalDraft(draftId: string, imageKeys: readonly string[]): Promise<void> {
  const db = await openDraftDatabase();
  try {
    await runTransaction(db, ENVELOPE_STORE, "readwrite", (store) => store.delete(draftId));
    for (const imageKey of imageKeys) {
      await runTransaction(db, IMAGE_STORE, "readwrite", (store) => store.delete(imageStoreKey(draftId, imageKey)));
    }
  } finally {
    db.close();
  }
}

export async function saveInvitationLocalDraftImage(draftId: string, imageKey: string, blob: Blob): Promise<void> {
  const db = await openDraftDatabase();
  try {
    await runTransaction(db, IMAGE_STORE, "readwrite", (store) => store.put(blob, imageStoreKey(draftId, imageKey)));
  } finally {
    db.close();
  }
}

export async function loadInvitationLocalDraftImageUrl(draftId: string, imageKey: string): Promise<string | null> {
  const db = await openDraftDatabase();
  try {
    const blob = await runTransaction<Blob | undefined>(db, IMAGE_STORE, "readonly", (store) =>
      store.get(imageStoreKey(draftId, imageKey))
    );
    return blob ? URL.createObjectURL(blob) : null;
  } finally {
    db.close();
  }
}

/**
 * Phase 6 promotion: the raw Blob itself, not wrapped in a fresh
 * URL.createObjectURL() — that wrapping is exactly what a <img src> needs
 * (loadInvitationLocalDraftImageUrl above) but NOT what uploadImage(file:
 * File, ...) needs (lib/uploadImage.ts), since File extends Blob and
 * accepts this directly.
 */
export async function getInvitationLocalDraftImageBlob(draftId: string, imageKey: string): Promise<Blob | null> {
  const db = await openDraftDatabase();
  try {
    const blob = await runTransaction<Blob | undefined>(db, IMAGE_STORE, "readonly", (store) =>
      store.get(imageStoreKey(draftId, imageKey))
    );
    return blob ?? null;
  } finally {
    db.close();
  }
}

/**
 * Save-time: persists every blob: URL currently sitting in the draft's
 * known image fields (hero/story/gallery/evergreen), keyed by field name.
 * `blobsByUrl` is the in-memory map the caller has been building up as the
 * user picks/crops images this session — this function doesn't create
 * blobs, only writes already-known ones to IndexedDB. Returns the set of
 * field keys that now have a persisted blob (becomes payload.images).
 */
export async function captureInvitationLocalDraftImages(
  draftId: string,
  builderDraft: Record<string, unknown>,
  blobsByUrl: ReadonlyMap<string, Blob>
): Promise<Record<string, string>> {
  const images: Record<string, string> = {};
  for (const { key, value } of listLocalDraftImageFields(builderDraft)) {
    if (!value || !isBlobUrlValue(value)) continue;
    // Single-image fields (handleLocalImageCropped) key by the stable field
    // path so re-cropping overwrites in place instead of orphaning the old
    // blob: URL entry. Gallery items (handleLocalGalleryImageCropped) still
    // key by the blob: URL itself, since a gallery index isn't stable
    // ahead of a batch upload landing — value lookup stays as the fallback.
    const blob = blobsByUrl.get(key) ?? blobsByUrl.get(value);
    if (!blob) continue;
    await saveInvitationLocalDraftImage(draftId, key, blob);
    images[key] = key;
  }
  return images;
}

/**
 * Load-time (after a refresh — any blob: URL from the prior session is now
 * dangling): resolves every field in `imageKeys` back to a fresh object URL
 * from IndexedDB and patches it into the draft. Returns a new object
 * (immutable) with the SAME shape as `builderDraft`.
 */
export async function restoreInvitationLocalDraftImages(
  draftId: string,
  builderDraft: Record<string, unknown>,
  imageKeys: Readonly<Record<string, string>>
): Promise<Record<string, unknown>> {
  let next = builderDraft;
  for (const key of Object.keys(imageKeys)) {
    const url = await loadInvitationLocalDraftImageUrl(draftId, key);
    if (url) next = setLocalDraftImageField(next, key, url);
  }
  return next;
}

export function getActiveInvitationDraftId(): string | null {
  try {
    return localStorage.getItem(ACTIVE_DRAFT_MARKER_KEY);
  } catch {
    return null;
  }
}

export function setActiveInvitationDraftId(draftId: string): void {
  try {
    localStorage.setItem(ACTIVE_DRAFT_MARKER_KEY, draftId);
  } catch {
    /* storage unavailable — refresh simply won't auto-restore this session */
  }
}

export function clearActiveInvitationDraftId(): void {
  try {
    localStorage.removeItem(ACTIVE_DRAFT_MARKER_KEY);
  } catch {
    /* no-op */
  }
}

/** Best effort — the browser may silently decline. Call once per draft save, not per keystroke. */
export async function requestPersistentStorage(): Promise<boolean> {
  try {
    if (!navigator.storage?.persist) return false;
    return await navigator.storage.persist();
  } catch {
    return false;
  }
}

export async function isStoragePersisted(): Promise<boolean> {
  try {
    if (!navigator.storage?.persisted) return false;
    return await navigator.storage.persisted();
  } catch {
    return false;
  }
}

export async function getStorageEstimate(): Promise<{ usage?: number; quota?: number } | null> {
  try {
    if (!navigator.storage?.estimate) return null;
    return await navigator.storage.estimate();
  } catch {
    return null;
  }
}

let broadcastChannel: BroadcastChannel | null = null;

function getBroadcastChannel(): BroadcastChannel | null {
  if (typeof BroadcastChannel === "undefined") return null;
  if (!broadcastChannel) broadcastChannel = new BroadcastChannel(BROADCAST_CHANNEL_NAME);
  return broadcastChannel;
}

function broadcastInvitationLocalDraftChange(draftId: string): void {
  getBroadcastChannel()?.postMessage({ draftId, updatedAt: new Date().toISOString() });
}

/** Subscribes to other tabs editing the same draftId. Returns an unsubscribe function. */
export function onInvitationLocalDraftChangedElsewhere(
  draftId: string,
  onChanged: (updatedAt: string) => void
): () => void {
  const channel = getBroadcastChannel();
  if (!channel) return () => {};
  const listener = (event: MessageEvent<{ draftId: string; updatedAt: string }>) => {
    if (event.data?.draftId === draftId) onChanged(event.data.updatedAt);
  };
  channel.addEventListener("message", listener);
  return () => channel.removeEventListener("message", listener);
}
