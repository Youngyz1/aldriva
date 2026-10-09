/**
 * lib/event-slug-metadata.ts
 *
 * Metadata for invitation-kind slugs on /events/[slug] — Round 4 Rule 1.
 *
 * An invitation slug must be indistinguishable from a nonexistent slug
 * apart from the slug string itself: the nonexistent path renders the
 * generic "Event — Aldriva" title, so this returns exactly that title
 * plus robots noindex — and deliberately omits description, canonical,
 * openGraph (incl. og:url), and twitter metadata.
 *
 * Pure module (type-only next import): hermetic-testable.
 */

import type { Metadata } from "next";

export function invitationSlugMetadata(): Metadata {
  return {
    title: "Event — Aldriva",
    robots: {
      index: false,
      follow: false,
      nocache: true,
    },
  };
}
