/**
 * lib/memories/gallery-pages.ts
 *
 * Pure page-state helpers for MemoriesGallery. Kept framework-free so the
 * expired-signed-URL refetch path can be unit-tested without React.
 */

import type { MemoryGalleryItem, MemoryGalleryPage } from "./gallery-types";

export interface LoadedMemoryPage {
  /** Cursor used to request this page (null = first page). */
  cursor: string | null;
  items: MemoryGalleryItem[];
  nextCursor: string | null;
}

export function toLoadedPage(cursor: string | null, page: MemoryGalleryPage): LoadedMemoryPage {
  return {
    cursor,
    items: Array.isArray(page.items) ? page.items : [],
    nextCursor: typeof page.nextCursor === "string" ? page.nextCursor : null,
  };
}

/** Keeps the first occurrence of each id, preserving page order. */
export function dedupeLoadedPages(pages: LoadedMemoryPage[]): LoadedMemoryPage[] {
  const seen = new Set<string>();
  return pages.map((page) => ({
    ...page,
    items: page.items.filter((item) => {
      if (seen.has(item.id)) return false;
      seen.add(item.id);
      return true;
    }),
  }));
}

export function appendLoadedPage(
  pages: LoadedMemoryPage[],
  page: LoadedMemoryPage
): LoadedMemoryPage[] {
  return dedupeLoadedPages([...pages, page]);
}

export function flattenLoadedItems(pages: LoadedMemoryPage[]): MemoryGalleryItem[] {
  return dedupeLoadedPages(pages).flatMap((page) => page.items);
}

export function replaceLoadedPage(
  pages: LoadedMemoryPage[],
  index: number,
  next: LoadedMemoryPage
): LoadedMemoryPage[] {
  if (index < 0 || index >= pages.length) return pages;
  const copy = pages.slice();
  copy[index] = next;
  return dedupeLoadedPages(copy);
}

export function hideItemFromPages(
  pages: LoadedMemoryPage[],
  itemId: string
): LoadedMemoryPage[] {
  return pages.map((page) => ({
    ...page,
    items: page.items.filter((item) => item.id !== itemId),
  }));
}

export interface RefetchResult {
  pages: LoadedMemoryPage[];
  /** True when the item is still unusable after the refetch and was hidden. */
  hidden: boolean;
}

/**
 * Replaces the page containing `failedId` with a freshly loaded page (fresh
 * signed URLs). If the fresh page no longer contains the item (for example the
 * object was retention-deleted), the item disappears from the grid. If the item
 * is still present, it is kept with its fresh URL so the caller can retry the
 * image once; a subsequent failure should hide it via `hideItemFromPages`.
 */
export function applyRefetchedPage(
  pages: LoadedMemoryPage[],
  pageIndex: number,
  freshPage: MemoryGalleryPage,
  failedId: string
): RefetchResult {
  if (pageIndex < 0 || pageIndex >= pages.length) {
    return { pages, hidden: false };
  }
  const requestCursor = pages[pageIndex].cursor;
  const next = toLoadedPage(requestCursor, freshPage);
  const stillThere = next.items.some((item) => item.id === failedId);
  const withFresh = replaceLoadedPage(pages, pageIndex, next);
  if (!stillThere) {
    return { pages: withFresh, hidden: true };
  }
  return { pages: withFresh, hidden: false };
}
