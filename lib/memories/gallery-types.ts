/**
 * lib/memories/gallery-types.ts
 *
 * Client-safe shapes shared by the guest Memories gallery and the public
 * read-only route. Deliberately contains no storage keys, event ids or delete
 * tokens: the public route must never return them.
 */

export interface MemoryGalleryItem {
  id: string;
  /** Short-lived signed GET URL minted server-side. */
  url: string;
  width: number | null;
  height: number | null;
  created_at: string;
}

export interface MemoryGalleryPage {
  items: MemoryGalleryItem[];
  /** Opaque cursor for the next page, or null on the last page. */
  nextCursor: string | null;
}

export interface MemoryGalleryLabels {
  title: string;
  close: string;
  loadMore: string;
  empty: string;
  error: string;
  retry: string;
  sample: string;
}
