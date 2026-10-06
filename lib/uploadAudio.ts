/**
 * lib/uploadAudio.ts
 *
 * Audio upload and verification pipeline for invitation page background music.
 *
 * Constraints:
 * - Bucket: `invitation-media` (public-read, authenticated write).
 * - Types: `audio/mpeg` (.mp3) or `audio/mp4` (.m4a).
 * - Max size: 5 MB (5 * 1024 * 1024 bytes).
 * - Magic byte inspection on server to reject spoofed files.
 * - Storage path: `{eventId}/{uuid}.{ext}`.
 */

import { randomUUID } from "node:crypto";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

export const AUDIO_BUCKET = "invitation-media" as const;
export const AUDIO_MAX_BYTES = 5 * 1024 * 1024; // 5 MB

export const ALLOWED_AUDIO_TYPES = [
  "audio/mpeg",
  "audio/mp3",
  "audio/mp4",
  "audio/m4a",
  "audio/x-m4a",
  "audio/aac",
] as const;

export type AllowedAudioMimeType = (typeof ALLOWED_AUDIO_TYPES)[number];

export interface AudioValidationResult {
  valid: boolean;
  error?: string;
  detectedMime?: "audio/mpeg" | "audio/mp4";
  extension?: "mp3" | "m4a";
}

/**
 * Validates audio file header bytes (magic bytes) to ensure authenticity.
 */
export function validateAudioBytes(head: Uint8Array, size: number): AudioValidationResult {
  if (size > AUDIO_MAX_BYTES) {
    return {
      valid: false,
      error: `Audio file exceeds the 5MB size limit (${(size / (1024 * 1024)).toFixed(1)}MB).`,
    };
  }

  if (head.length < 8) {
    return {
      valid: false,
      error: "Audio file is too small or truncated.",
    };
  }

  // 1. MP3 detection:
  // - ID3 tag: 'I' 'D' '3' (0x49 0x44 0x33)
  if (head[0] === 0x49 && head[1] === 0x44 && head[2] === 0x33) {
    return { valid: true, detectedMime: "audio/mpeg", extension: "mp3" };
  }
  // - MPEG sync frame: 11 bits set (0xFF followed by 0xE0 mask in second byte)
  if (head[0] === 0xff && (head[1] & 0xe0) === 0xe0) {
    return { valid: true, detectedMime: "audio/mpeg", extension: "mp3" };
  }

  // 2. M4A / MP4 detection:
  // - ISO base media file: bytes 4-7 are 'ftyp' (0x66 0x74 0x79 0x70)
  if (head[4] === 0x66 && head[5] === 0x74 && head[6] === 0x79 && head[7] === 0x70) {
    return { valid: true, detectedMime: "audio/mp4", extension: "m4a" };
  }

  return {
    valid: false,
    error: "Unsupported audio format. Please upload a valid MP3 (.mp3) or M4A/AAC (.m4a) file.",
  };
}

/**
 * Uploads an audio buffer to `invitation-media` storage.
 * If `preValidated` is provided (e.g. from the route handler which already ran
 * validateAudioBytes), the internal validation pass is skipped.
 */
export async function uploadInvitationAudio(
  eventId: string,
  buffer: Buffer | Uint8Array,
  preValidatedExtension?: "mp3" | "m4a"
): Promise<{ url: string; path: string }> {
  let ext: "mp3" | "m4a";
  let mime: "audio/mpeg" | "audio/mp4";

  if (preValidatedExtension) {
    ext = preValidatedExtension;
    mime = ext === "mp3" ? "audio/mpeg" : "audio/mp4";
  } else {
    const head = buffer.slice(0, 32);
    const validation = validateAudioBytes(head as Uint8Array, buffer.byteLength);
    if (!validation.valid || !validation.extension || !validation.detectedMime) {
      throw new Error(validation.error || "Audio validation failed.");
    }
    ext = validation.extension;
    mime = validation.detectedMime;
  }

  const uniqueId = randomUUID();
  const storagePath = `${eventId}/${uniqueId}.${ext}`;

  const admin = createSupabaseAdmin();
  const { error: uploadError } = await admin.storage
    .from(AUDIO_BUCKET)
    .upload(storagePath, buffer, {
      contentType: mime,
      upsert: true,
    });

  if (uploadError) {
    throw new Error(`Audio upload failed: ${uploadError.message}`);
  }

  const { data: urlData } = admin.storage.from(AUDIO_BUCKET).getPublicUrl(storagePath);
  return {
    url: urlData.publicUrl,
    path: storagePath,
  };
}


/**
 * Deletes an audio file from `invitation-media` by path or public URL.
 */
export async function deleteInvitationAudio(urlOrPath: string): Promise<boolean> {
  if (!urlOrPath) return false;

  let storagePath = urlOrPath;
  const marker = `/storage/v1/object/public/${AUDIO_BUCKET}/`;
  if (urlOrPath.includes(marker)) {
    storagePath = urlOrPath.split(marker)[1];
  }

  if (!storagePath) return false;

  const admin = createSupabaseAdmin();
  const { error } = await admin.storage.from(AUDIO_BUCKET).remove([storagePath]);
  return !error;
}

/**
 * Orphan cleanup: removes previous audio files in the event folder that are no longer active.
 */
export async function cleanupOrphanInvitationAudio(
  eventId: string,
  activeAudioUrl?: string | null
): Promise<number> {
  if (!eventId) return 0;

  const admin = createSupabaseAdmin();
  const { data: files, error } = await admin.storage.from(AUDIO_BUCKET).list(eventId);
  if (error || !files || files.length === 0) return 0;

  let activeFileName = "";
  if (activeAudioUrl) {
    const parts = activeAudioUrl.split("/");
    activeFileName = parts[parts.length - 1] ?? "";
  }

  const toDelete = files
    .filter((f) => f.name !== activeFileName && f.name !== ".emptyFolderPlaceholder")
    .map((f) => `${eventId}/${f.name}`);

  if (toDelete.length === 0) return 0;

  const { error: deleteError } = await admin.storage.from(AUDIO_BUCKET).remove(toDelete);
  if (deleteError) {
    console.error("[uploadAudio] orphan cleanup failed:", deleteError.message);
    return 0;
  }

  return toDelete.length;
}
