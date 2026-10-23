/**
 * lib/unified-invitation-templates.ts
 *
 * Unified invitation templates — Round 5, step 1.
 *
 * One organizer selection yields BOTH the invitation card (email body +
 * card.png, via `invitation_templates.slug`) AND the invitation page (via
 * page registry id). Code-owned immutable registry (DEC-0016 precedent):
 * no database mirror, no migration. Versioned ids (`base@1.0.0`); a version
 * bump adds a new entry and never mutates a shipped one.
 *
 * Pure module (no imports at all): safe for client components, server
 * actions, routes, and the hermetic test suite.
 *
 * Round 5 step 1 ships the 4 existing pairs. The concert/casual pages and
 * the Cover pair land in steps 3–4 as new entries — the resolver already
 * handles forward references by treating unknown page ids as custom.
 */

export type UnifiedTemplateOccasion = "wedding" | "birthday" | "gala" | "other";

export interface UnifiedInvitationTemplate {
  /** Immutable versioned id, e.g. "royal-elegance@1.0.0". */
  id: string;
  /** Unversioned base id for lookup (`royal-elegance`). */
  baseId: string;
  name: string;
  nameKey: UnifiedTemplateNameKey;
  categoryLabel: string;
  occasion: UnifiedTemplateOccasion;
  /** Card variant: invitation_templates.slug (UUID resolved at write time). */
  cardSlug: string;
  /** Page variant: page registry id (event_invitation_pages.template_id). */
  pageId: string;
  blurb: string;
}

export const UNIFIED_INVITATION_TEMPLATES: UnifiedInvitationTemplate[] = [
  {
    id: "royal-elegance@1.0.0",
    baseId: "royal-elegance",
    name: "Aurora",
    nameKey: "unifiedRoyalEleganceName",
    categoryLabel: "Wedding & Formal",
    occasion: "wedding",
    cardSlug: "royal-elegance",
    pageId: "wedding-romantic",
    blurb: "Gold-on-ink formality on the card, romantic blush page.",
  },
  {
    id: "romantic-envelope@1.0.0",
    baseId: "romantic-envelope",
    name: "Romantic Envelope",
    nameKey: "unifiedRomanticEnvelopeName",
    categoryLabel: "Wedding & Formal",
    occasion: "wedding",
    cardSlug: "royal-elegance",
    pageId: "romantic-envelope",
    blurb: "A cinematic envelope reveal followed by the wedding invitation page.",
  },
  {
    id: "botanical-reverie@1.0.0",
    baseId: "botanical-reverie",
    name: "Botanical Reverie",
    nameKey: "unifiedBotanicalReverieName",
    categoryLabel: "Wedding & Formal",
    occasion: "wedding",
    cardSlug: "botanical-reverie",
    pageId: "botanical-reverie",
    blurb: "Layered garden stationery with an envelope reveal and editorial wedding details.",
  },
  // TODO: Revisit the share-preview card slug; Evergreen currently uses botanical-reverie.
  {
    id: "evergreen-envelope@1.0.0",
    baseId: "evergreen-envelope",
    name: "Evergreen Envelope",
    nameKey: "unifiedEvergreenEnvelopeName",
    categoryLabel: "Wedding & Formal",
    occasion: "wedding",
    cardSlug: "botanical-reverie",
    pageId: "evergreen-envelope",
    blurb: "An olive and cream envelope reveal with layered photo stationery and wedding details.",
  },
  {
    id: "luxe-editorial@1.0.0",
    baseId: "luxe-editorial",
    name: "Luxe Editorial",
    nameKey: "unifiedLuxeEditorialName",
    categoryLabel: "Wedding & Formal",
    occasion: "wedding",
    cardSlug: "luxe-editorial",
    pageId: "luxe-editorial",
    blurb: "Photo-led wedding stationery with a refined editorial page and gallery.",
  },
  {
    id: "festive-gold-noir@1.0.0",
    baseId: "festive-gold-noir",
    name: "Confetti",
    nameKey: "unifiedFestiveGoldNoirName",
    categoryLabel: "Birthday & Celebration",
    occasion: "birthday",
    cardSlug: "festive-gold-noir",
    pageId: "birthday-bold",
    blurb: "Celebratory gold card with a bold party page.",
  },
  {
    id: "grand-gala-noir@1.0.0",
    baseId: "grand-gala-noir",
    name: "Midnight",
    nameKey: "unifiedGrandGalaNoirName",
    categoryLabel: "Gala & Fundraiser",
    occasion: "gala",
    cardSlug: "grand-gala-noir",
    pageId: "black-tie",
    blurb: "Dark luxe card matched to the black-tie page.",
  },
  {
    id: "modern-executive@1.0.0",
    baseId: "modern-executive",
    name: "Atelier",
    nameKey: "unifiedModernExecutiveName",
    categoryLabel: "Corporate & Conference",
    occasion: "other",
    cardSlug: "modern-executive",
    pageId: "gala-editorial",
    blurb: "Slate-blue corporate card with a light editorial page.",
  },
  {
    id: "cover@1.0.0",
    baseId: "cover",
    name: "Cover Story",
    nameKey: "unifiedCoverName",
    categoryLabel: "Cover",
    occasion: "other",
    cardSlug: "cover",
    pageId: "cover",
    blurb: "Full-bleed event photo with live text, card and page.",
  },
];

/** Translation keys used on user-facing picker, banner, and readiness surfaces. */
export const UNIFIED_TEMPLATE_NAME_KEYS = {
  "royal-elegance": "unifiedRoyalEleganceName",
  "romantic-envelope": "unifiedRomanticEnvelopeName",
  "botanical-reverie": "unifiedBotanicalReverieName",
  "evergreen-envelope": "unifiedEvergreenEnvelopeName",
  "luxe-editorial": "unifiedLuxeEditorialName",
  "festive-gold-noir": "unifiedFestiveGoldNoirName",
  "grand-gala-noir": "unifiedGrandGalaNoirName",
  "modern-executive": "unifiedModernExecutiveName",
  cover: "unifiedCoverName",
} as const;

export type UnifiedTemplateNameKey = (typeof UNIFIED_TEMPLATE_NAME_KEYS)[keyof typeof UNIFIED_TEMPLATE_NAME_KEYS];

/** Resolve any pair, card, or page identifier to its localized display-name key. */
export function getUnifiedTemplateNameKey(identifier: string | null | undefined): UnifiedTemplateNameKey | null {
  if (!identifier) return null;
  const pair = UNIFIED_INVITATION_TEMPLATES.find(
    (template) => template.id === identifier || template.baseId === identifier ||
      template.cardSlug === identifier || template.pageId === identifier
  );
  return pair ? pair.nameKey : null;
}

/** Suggested pair when an occasion is picked (host can still choose any). */
export const DEFAULT_UNIFIED_FOR_OCCASION: Record<UnifiedTemplateOccasion, string> = {
  wedding: "royal-elegance@1.0.0",
  birthday: "festive-gold-noir@1.0.0",
  gala: "grand-gala-noir@1.0.0",
  other: "modern-executive@1.0.0",
};

/** Exact id first, then unversioned base id. Never throws. */
export function getUnifiedTemplate(id: string | null | undefined): UnifiedInvitationTemplate | undefined {
  if (!id || typeof id !== "string") return undefined;
  const exact = UNIFIED_INVITATION_TEMPLATES.find((t) => t.id === id);
  if (exact) return exact;
  return UNIFIED_INVITATION_TEMPLATES.find((t) => t.baseId === id);
}

export interface ResolvedUnifiedPair {
  /** Registry unified id (or null when nothing matches). */
  unifiedId: string | null;
  /** True only when both stored variants match the pair. */
  isExact: boolean;
}

export interface StoredInvitationVariants {
  /** events.invitation_template_id resolved to slug, card code id, or null. */
  cardSlug?: string | null;
  /** event_invitation_pages.template_id, or null when no page row exists. */
  pageId?: string | null;
}

/**
 * Derives the display pair from whatever an event already stores — WITHOUT
 * rewriting anything. Precedence: exact (both match) > card-dominant >
 * page-dominant > null. Mismatched pairs keep rendering exactly as today;
 * the picker surfaces them as a custom combination with a one-click unify.
 */
export function resolveUnifiedPair(stored: StoredInvitationVariants): ResolvedUnifiedPair {
  const cardSlug = typeof stored.cardSlug === "string" ? stored.cardSlug : null;
  const pageId = typeof stored.pageId === "string" ? stored.pageId : null;

  if (cardSlug && pageId) {
    const exact = UNIFIED_INVITATION_TEMPLATES.find(
      (t) => t.cardSlug === cardSlug && t.pageId === pageId
    );
    if (exact) return { unifiedId: exact.id, isExact: true };
  }
  if (cardSlug) {
    const byCard = UNIFIED_INVITATION_TEMPLATES.find((t) => t.cardSlug === cardSlug);
    if (byCard) return { unifiedId: byCard.id, isExact: false };
  }
  if (pageId) {
    const byPage = UNIFIED_INVITATION_TEMPLATES.find((t) => t.pageId === pageId);
    if (byPage) return { unifiedId: byPage.id, isExact: false };
  }
  return { unifiedId: null, isExact: false };
}
