/**
 * lib/memories/public-gallery-core.ts
 *
 * Pure guest-gallery policy: privacy filters, cursor pagination and response
 * shaping. No Supabase import here so the logic can be exercised with fixtures
 * in tests. The production repository lives in public-gallery.ts.
 *
 * Privacy contract:
 * - only `status = 'approved'`, `report_count = 0`, matching `event_id`;
 * - the response never contains event ids, object keys, delete tokens or guest
 *   labels — only id, signed URL, width, height, created_at.
 */

import type { MemoryGalleryItem, MemoryGalleryPage } from "./gallery-types";

export const MEMORIES_PAGE_SIZE = 24;
export const GUEST_MEMORY_URL_TTL_SECONDS = 900;

export interface PublicMemoryRow {
  id: string;
  event_id: string;
  storage_provider: "supabase" | "r2";
  object_key: string;
  width: number | null;
  height: number | null;
  status: string;
  report_count: number;
  created_at: string;
}

export interface MemoriesTarget {
  eventId: string;
  showMemories: boolean;
}

export interface MemoryCursor {
  createdAt: string;
  id: string;
}

export interface MemoriesRepository {
  resolveTarget(segment: string): Promise<MemoriesTarget | null>;
  countApproved(eventId: string): Promise<number>;
  /** Returns up to `limit` approved rows for the event, newest first. */
  listApproved(
    eventId: string,
    cursor: MemoryCursor | null,
    limit: number
  ): Promise<PublicMemoryRow[]>;
  signGet(provider: "supabase" | "r2", key: string, ttlSeconds: number): Promise<string>;
}

export class InvalidMemoryCursorError extends Error {
  constructor() {
    super("Invalid memories cursor.");
    this.name = "InvalidMemoryCursorError";
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/** `mf_show_memories` is OFF unless it is explicitly true. */
export function readShowMemories(templateData: unknown): boolean {
  return isRecord(templateData) && templateData.mf_show_memories === true;
}

/** Server-rendered button gate: toggle on AND (real count > 0 OR sample preview). */
export function shouldShowMemoriesButton(input: {
  showMemories: boolean;
  count: number;
  sample?: boolean;
}): boolean {
  if (!input.showMemories) return false;
  return input.sample === true || input.count > 0;
}

export function encodeMemoryCursor(cursor: MemoryCursor): string {
  return Buffer.from(JSON.stringify(cursor), "utf8").toString("base64url");
}

export function decodeMemoryCursor(value: string | null | undefined): MemoryCursor | null {
  if (!value) return null;
  try {
    const parsed = JSON.parse(Buffer.from(value, "base64url").toString("utf8")) as unknown;
    if (!isRecord(parsed)) return null;
    if (typeof parsed.createdAt !== "string" || typeof parsed.id !== "string") return null;
    if (!parsed.createdAt || !parsed.id) return null;
    return { createdAt: parsed.createdAt, id: parsed.id };
  } catch {
    return null;
  }
}

function compareNewestFirst(a: PublicMemoryRow, b: PublicMemoryRow): number {
  const aTime = Date.parse(a.created_at);
  const bTime = Date.parse(b.created_at);
  if (aTime !== bTime) return bTime - aTime;
  if (a.id === b.id) return 0;
  return a.id < b.id ? 1 : -1;
}

function isAfterCursor(row: PublicMemoryRow, cursor: MemoryCursor): boolean {
  const rowTime = Date.parse(row.created_at);
  const cursorTime = Date.parse(cursor.createdAt);
  if (rowTime !== cursorTime) return rowTime < cursorTime;
  return row.id < cursor.id;
}

/**
 * Applies the public privacy filters and `(created_at, id)` keyset pagination.
 * Exported so tests can prove pending/rejected/reported and cross-event rows
 * never survive the filter.
 */
export function filterPublicMemoryRows(
  rows: PublicMemoryRow[],
  eventId: string,
  cursor: MemoryCursor | null,
  limit = MEMORIES_PAGE_SIZE
): { page: PublicMemoryRow[]; nextCursor: MemoryCursor | null } {
  const filtered = rows
    .filter(
      (row) =>
        row.event_id === eventId &&
        row.status === "approved" &&
        (row.report_count ?? 0) === 0
    )
    .sort(compareNewestFirst);
  const afterCursor = cursor ? filtered.filter((row) => isAfterCursor(row, cursor)) : filtered;
  const page = afterCursor.slice(0, limit);
  const hasMore = afterCursor.length > limit;
  const last = page[page.length - 1];
  return {
    page,
    nextCursor: hasMore && last ? { createdAt: last.created_at, id: last.id } : null,
  };
}

export function createPublicMemoriesService(repo: MemoriesRepository) {
  return {
    async resolveTarget(segment: string): Promise<MemoriesTarget | null> {
      const target = await repo.resolveTarget(segment);
      if (!target || !target.eventId) return null;
      return { eventId: target.eventId, showMemories: target.showMemories === true };
    },

    async getCount(eventId: string, showMemories: boolean): Promise<number> {
      if (!showMemories) return 0;
      return repo.countApproved(eventId);
    },

    async listPage(target: MemoriesTarget, cursorValue: string | null): Promise<MemoryGalleryPage> {
      if (!target.showMemories) return { items: [], nextCursor: null };
      const cursor = decodeMemoryCursor(cursorValue);
      if (cursorValue && !cursor) throw new InvalidMemoryCursorError();

      // Ask for one extra row so `nextCursor` is exact without a second query.
      const rows = await repo.listApproved(target.eventId, cursor, MEMORIES_PAGE_SIZE + 1);
      const { page, nextCursor } = filterPublicMemoryRows(
        rows,
        target.eventId,
        cursor,
        MEMORIES_PAGE_SIZE
      );

      const items: MemoryGalleryItem[] = [];
      for (const row of page) {
        try {
          const url = await repo.signGet(
            row.storage_provider,
            row.object_key,
            GUEST_MEMORY_URL_TTL_SECONDS
          );
          if (!url) continue;
          items.push({
            id: row.id,
            url,
            width: row.width,
            height: row.height,
            created_at: row.created_at,
          });
        } catch {
          // Retention-deleted or storage hiccup: hide this item, keep the grid.
        }
      }

      return {
        items,
        nextCursor: nextCursor ? encodeMemoryCursor(nextCursor) : null,
      };
    },
  };
}

export type PublicMemoriesService = ReturnType<typeof createPublicMemoriesService>;
