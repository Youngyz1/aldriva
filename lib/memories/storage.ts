import "server-only";
/**
 * lib/memories/storage.ts
 *
 * Private photo storage driver interface — Round 4.
 *
 * - Production uses the private R2 bucket (`R2_PRIVATE_BUCKET`, built on
 *   the `lib/storage/private-media.ts` primitives).
 * - Staging/local uses the private Supabase `event-memories` bucket
 *   (migration 162, service-role signed URLs — no public reads).
 * - Selected by `MEMORY_STORAGE_DRIVER` (`r2` | `supabase`), defaulting to
 *   R2 in production and Supabase elsewhere (same convention as
 *   `lib/media/driver-policy.ts`).
 *
 * Every photo is addressed by an opaque key; keys are never guest-derived
 * beyond the event id prefix. Delivery is exclusively via short-lived
 * signed GET URLs minted server-side.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isProductionDeployment } from "@/lib/media/driver-policy";
import {
  deletePrivateMediaObject,
  getPrivateMediaPutUrl,
  getPrivateMediaSignedGetUrl,
} from "@/lib/storage/private-media";
import { getObject, headObject, putObject as r2PutObject } from "@/lib/storage/r2";

export const MEMORY_SUPABASE_BUCKET = "event-memories";
const MEMORY_R2_PREFIX = "memories/";

export type MemoryStorageProvider = "supabase" | "r2";

export interface MemoryObjectStat {
  size: number;
  contentType: string | null;
}

export interface MemoryStorageDriver {
  readonly provider: MemoryStorageProvider;
  /** Presigned PUT URL for a direct-to-storage guest upload. */
  signPut(key: string, contentType: string, contentLength: number): Promise<string>;
  /** Existence + size check. Null when the object is absent. */
  stat(key: string): Promise<MemoryObjectStat | null>;
  /** Bounded full download (photo pipeline, per-file ZIP chunks). */
  getBytes(key: string, maxBytes: number): Promise<{ body: Buffer; contentType: string | null }>;
  /** Server-side write (finalized/converted photos). */
  putBytes(key: string, body: Buffer, contentType: string): Promise<void>;
  /** Short-lived signed GET (private delivery). */
  signGet(key: string, ttlSeconds?: number): Promise<string>;
  /** Permanent removal (moderation, uploader delete, retention). */
  delete(key: string): Promise<void>;
}

function resolveDriverName(): MemoryStorageProvider {
  const raw = (process.env.MEMORY_STORAGE_DRIVER || "").trim().toLowerCase();
  if (raw === "r2" || raw === "supabase") return raw;
  return isProductionDeployment({
    nodeEnv: process.env.NODE_ENV,
    vercelEnv: process.env.VERCEL_ENV,
  })
    ? "r2"
    : "supabase";
}

/** Opaque object key. `name` is server-generated (uuid + extension). */
export function memoryObjectKey(eventId: string, name: string): string {
  return `${MEMORY_R2_PREFIX}${eventId}/${name}`;
}

export function memoryPendingKey(eventId: string, name: string): string {
  return `${MEMORY_R2_PREFIX}${eventId}/pending/${name}`;
}

/** Guards that a client-supplied key belongs to this event's namespace. */
export function isMemoryKeyForEvent(key: unknown, eventId: string): boolean {
  if (typeof key !== "string" || !eventId) return false;
  if (key.includes("..") || key.includes("//") || key.startsWith("/")) return false;
  return key.startsWith(`${MEMORY_R2_PREFIX}${eventId}/`);
}

class R2MemoryDriver implements MemoryStorageDriver {
  readonly provider = "r2" as const;

  async signPut(key: string, contentType: string, contentLength: number): Promise<string> {
    return getPrivateMediaPutUrl(key, contentType, contentLength);
  }

  async stat(key: string): Promise<MemoryObjectStat | null> {
    try {
      const head = await headObject(requirePrivateBucket(), key);
      if (head.contentLength === null || head.contentLength < 1) return null;
      return { size: head.contentLength, contentType: head.contentType };
    } catch {
      return null;
    }
  }

  async getBytes(key: string, maxBytes: number) {
    return getObject(requirePrivateBucket(), key, maxBytes);
  }

  async putBytes(key: string, body: Buffer, contentType: string): Promise<void> {
    await r2PutObject(requirePrivateBucket(), key, body, contentType, "private, max-age=0");
  }

  async signGet(key: string, ttlSeconds = 120): Promise<string> {
    return getPrivateMediaSignedGetUrl(key, ttlSeconds);
  }

  async delete(key: string): Promise<void> {
    await deletePrivateMediaObject(key);
  }
}

function requirePrivateBucket(): string {
  const bucket = process.env.R2_PRIVATE_BUCKET;
  if (!bucket || bucket === process.env.R2_BUCKET || bucket === process.env.R2_TMP_BUCKET) {
    throw new Error("Private R2 storage must use a separate bucket.");
  }
  return bucket;
}

class SupabaseMemoryDriver implements MemoryStorageDriver {
  readonly provider = "supabase" as const;

  async signPut(key: string, contentType: string, contentLength: number): Promise<string> {
    void contentLength;
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(MEMORY_SUPABASE_BUCKET)
      .createSignedUploadUrl(key);
    if (error || !data?.signedUrl) {
      throw new Error(`Could not mint memory upload URL: ${error?.message || "unknown"}`);
    }
    // NOTE: Supabase signed upload URLs do not bind contentType; the
    // declared type is re-validated server-side at finalize (magic bytes).
    void contentType;
    return data.signedUrl;
  }

  async stat(key: string): Promise<MemoryObjectStat | null> {
    const admin = createSupabaseAdmin();
    const slash = key.lastIndexOf("/");
    const dir = slash >= 0 ? key.slice(0, slash) : "";
    const name = slash >= 0 ? key.slice(slash + 1) : key;
    const { data, error } = await admin.storage.from(MEMORY_SUPABASE_BUCKET).list(dir, {
      limit: 100,
      search: name,
    });
    if (error || !data) return null;
    const hit = data.find((f) => f.name === name);
    if (!hit || hit.id === null) return null;
    const size =
      typeof hit.metadata === "object" && hit.metadata !== null
        ? Number((hit.metadata as Record<string, unknown>).size)
        : NaN;
    if (!Number.isFinite(size) || size < 1) return null;
    const contentType =
      typeof hit.metadata === "object" && hit.metadata !== null
        ? String((hit.metadata as Record<string, unknown>).mimetype ?? "")
        : "";
    return { size, contentType: contentType || null };
  }

  async getBytes(key: string, maxBytes: number) {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.storage.from(MEMORY_SUPABASE_BUCKET).download(key);
    if (error || !data) throw new Error(`Could not read memory object: ${error?.message || "missing"}`);
    const buffer = Buffer.from(await data.arrayBuffer());
    if (buffer.byteLength > maxBytes) {
      const err = new Error("The memory object exceeds the size limit.");
      err.name = "MemoryObjectTooLargeError";
      throw err;
    }
    // Supabase download does not return the stored MIME; callers that need
    // it use stat() first (finalize does).
    return { body: buffer, contentType: null as string | null };
  }

  async putBytes(key: string, body: Buffer, contentType: string): Promise<void> {
    const admin = createSupabaseAdmin();
    const { error } = await admin.storage.from(MEMORY_SUPABASE_BUCKET).upload(key, body, {
      contentType,
      upsert: true,
    });
    if (error) throw new Error(`Could not store memory object: ${error.message}`);
  }

  async signGet(key: string, ttlSeconds = 120): Promise<string> {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.storage
      .from(MEMORY_SUPABASE_BUCKET)
      .createSignedUrl(key, Math.min(Math.max(Math.floor(ttlSeconds), 1), 3600));
    if (error || !data?.signedUrl) {
      throw new Error(`Could not sign memory URL: ${error?.message || "unknown"}`);
    }
    return data.signedUrl;
  }

  async delete(key: string): Promise<void> {
    const admin = createSupabaseAdmin();
    const { error } = await admin.storage.from(MEMORY_SUPABASE_BUCKET).remove([key]);
    if (error) throw new Error(`Could not delete memory object: ${error.message}`);
  }
}

const drivers: Partial<Record<MemoryStorageProvider, MemoryStorageDriver>> = {};

/** The configured driver for NEW uploads. Per-row provider selects drivers for reads/deletes. */
export function getMemoryStorageDriver(): MemoryStorageDriver {
  const name = resolveDriverName();
  if (!drivers[name]) {
    drivers[name] = name === "r2" ? new R2MemoryDriver() : new SupabaseMemoryDriver();
  }
  return drivers[name] as MemoryStorageDriver;
}

/** Driver for an existing row (legacy Supabase rows coexist with new R2 rows). */
export function getMemoryStorageDriverFor(provider: MemoryStorageProvider): MemoryStorageDriver {
  if (!drivers[provider]) {
    drivers[provider] = provider === "r2" ? new R2MemoryDriver() : new SupabaseMemoryDriver();
  }
  return drivers[provider] as MemoryStorageDriver;
}
