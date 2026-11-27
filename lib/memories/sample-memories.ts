/**
 * lib/memories/sample-memories.ts
 *
 * Local sample photos for the template demo and builder preview. These are
 * repository assets, never external URLs, and are only used when the template
 * is not rendering a real guest's invitation.
 */

import type { MemoryGalleryItem } from "./gallery-types";

const SAMPLE_BASE = "/images/invitations/minimalism-dark-blue/demo";

/**
 * Three samples: enough to show the masonry layout and the "Sample" badge
 * without pretending a preview gallery is a full guest album.
 */
export const SAMPLE_MEMORY_ITEMS: MemoryGalleryItem[] = [
  { id: "sample-01", url: `${SAMPLE_BASE}/gallery-01.jpg`, width: 1600, height: 1067, created_at: "2027-06-12T20:10:00.000Z" },
  { id: "sample-02", url: `${SAMPLE_BASE}/gallery-03.jpg`, width: 1600, height: 2400, created_at: "2027-06-12T20:12:00.000Z" },
  { id: "sample-03", url: `${SAMPLE_BASE}/gallery-05.jpg`, width: 1600, height: 933, created_at: "2027-06-12T20:14:00.000Z" },
];
