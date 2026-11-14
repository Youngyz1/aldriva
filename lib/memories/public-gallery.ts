import "server-only";
/**
 * lib/memories/public-gallery.ts
 *
 * Server-only Supabase adapter for the guest Memories gallery. No RLS change:
 * every read goes through the service role and is scoped to the event resolved
 * from the invitation page's public token. Signed URLs are minted per page with
 * a guest-only 900 s TTL; dashboard TTLs are untouched.
 */

import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getMemoryStorageDriverFor, type MemoryStorageProvider } from "@/lib/memories/storage";
import {
  createPublicMemoriesService,
  readShowMemories,
  type MemoriesRepository,
  type MemoryCursor,
  type PublicMemoryRow,
} from "@/lib/memories/public-gallery-core";
export {
  readShowMemories,
} from "@/lib/memories/public-gallery-core";
export type {
  MemoriesTarget,
  PublicMemoriesService,
} from "@/lib/memories/public-gallery-core";

const VISIBLE_PAGE_STATUSES = new Set(["published", "unlisted"]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function readShowMemoriesFromSnapshot(snapshot: unknown): boolean {
  if (!isRecord(snapshot)) return false;
  const layout = snapshot.blocks_layout;
  if (!isRecord(layout)) return false;
  return readShowMemories(layout.template_data);
}

function normalizeProvider(value: unknown): MemoryStorageProvider {
  return value === "r2" ? "r2" : "supabase";
}

export function createSupabaseMemoriesRepository(): MemoriesRepository {
  const admin = createSupabaseAdmin();

  return {
    async resolveTarget(segment: string) {
      const value = segment.trim();
      // Only accept the public share token format (64-char hex, same token /invitation/shared/[token] uses).
      // Guest tokens and event slugs return 404 (handled at the route level).
      const looksLikeToken = /^[a-f0-9]{64}$/i.test(value);

      if (!looksLikeToken) return null;

      const { data: sharePage } = await admin
        .from("event_invitation_pages")
        .select("event_id, page_status, share_enabled, published_snapshot")
        .eq("share_token", value)
        .maybeSingle();
      const shareRow = sharePage as { event_id?: string | null; page_status?: string | null; share_enabled?: boolean | null; published_snapshot?: unknown } | null;
      if (
        shareRow?.event_id &&
        shareRow.share_enabled === true &&
        typeof shareRow.page_status === "string" &&
        VISIBLE_PAGE_STATUSES.has(shareRow.page_status) &&
        shareRow.published_snapshot
      ) {
        return {
          eventId: shareRow.event_id,
          showMemories: readShowMemoriesFromSnapshot(shareRow.published_snapshot),
        };
      }

      return null;
    },

    async countApproved(eventId: string) {
      const { count } = await admin
        .from("event_memories")
        .select("id", { count: "exact", head: true })
        .eq("event_id", eventId)
        .eq("status", "approved")
        .eq("report_count", 0);
      return typeof count === "number" ? count : 0;
    },

    async listApproved(eventId: string, cursor: MemoryCursor | null, limit: number) {
      let query = admin
        .from("event_memories")
        .select(
          "id, event_id, storage_provider, object_key, width, height, status, report_count, created_at"
        )
        .eq("event_id", eventId)
        .eq("status", "approved")
        .eq("report_count", 0)
        .order("created_at", { ascending: false })
        .order("id", { ascending: false })
        .limit(limit);

      if (cursor) {
        query = query.or(
          `created_at.lt.${cursor.createdAt},and(created_at.eq.${cursor.createdAt},id.lt.${cursor.id})`
        );
      }

      const { data } = await query;
      return ((data ?? []) as unknown[]).map((row) => {
        const value = isRecord(row) ? row : {};
        return {
          id: String(value.id ?? ""),
          event_id: String(value.event_id ?? ""),
          storage_provider: normalizeProvider(value.storage_provider),
          object_key: String(value.object_key ?? ""),
          width: typeof value.width === "number" ? value.width : null,
          height: typeof value.height === "number" ? value.height : null,
          status: String(value.status ?? ""),
          report_count: typeof value.report_count === "number" ? value.report_count : 0,
          created_at: String(value.created_at ?? ""),
        } satisfies PublicMemoryRow;
      });
    },

    async signGet(provider, key, ttlSeconds) {
      return getMemoryStorageDriverFor(provider).signGet(key, ttlSeconds);
    },
  };
}

let service: ReturnType<typeof createPublicMemoriesService> | null = null;

/** Process-local singleton; safe because the repository is stateless. */
export function getPublicMemoriesService() {
  if (!service) service = createPublicMemoriesService(createSupabaseMemoriesRepository());
  return service;
}

/** Server-rendered button count. Returns 0 without touching photos when OFF. */
export async function getApprovedMemoriesCount(
  eventId: string,
  showMemories = true
): Promise<number> {
  if (!showMemories || !eventId) return 0;
  return getPublicMemoriesService().getCount(eventId, true);
}
