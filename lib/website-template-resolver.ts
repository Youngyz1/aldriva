/**
 * lib/website-template-resolver.ts
 *
 * Pure template → blocks resolution for flagship v2 templates (Stage S3).
 *
 * resolveTemplateContent(templateId, templateVersion, contentDoc) returns, per
 * page, a Block[] built ONLY from the 14 existing block types, validated with
 * the existing validateBlock / normalizeBlocks. Rules:
 * - Slot values are copied from content field KEYS (never block paths).
 * - Featured ids expand as references only (embed resolvers fetch rows at
 *   render time); nothing catalog-shaped is fabricated.
 * - Empty slots render sample placeholders and are reported in sampleFields[].
 *   Samples are NEVER written anywhere savable — the input doc is deep-cloned
 *   and never mutated, and blocks are a separate output structure.
 * - Sections needing a nonexistent block type carry pendingBlock and are
 *   SKIPPED (reported in skipped[]), never faked.
 *
 * planTemplateSwitch(currentId, newId, contentDoc) is pure (no DB) and returns
 * the confirm-step data for the later UI: hiddenSections, newEmptySlots,
 * pageMapping, keptUnslottedKeys.
 */

import type {
  Block,
  BlockType,
} from "./website-blocks";
import {
  validateBlock,
  normalizeBlocks,
  normalizeCurrencyCode,
  KNOWN_BLOCK_TYPES,
} from "./website-blocks";
import type { ContentDoc, ContentKey } from "./website-content";
import type { NavigationItem } from "./website-nav";
import type {
  WebsiteTemplateV2,
  TemplateSection,
} from "./website-template-v2";
import { getFlagshipTemplate } from "./website-template-v2";
import { FLAGSHIP_SAMPLES, STORE_PREVIEW_PRODUCTS } from "./website-template-samples";
import type { TemplatePagePurpose } from "./website-template-v2";
import { getCapabilitiesForBusiness } from "./business-taxonomy";
import type { Capability } from "./business-taxonomy";
import { getSelectedFactOfferings } from "./business-offerings";
import {
  getBuiltStorefrontFeatures,
  resolveStorefrontFeatures,
  type StorefrontFeatureState,
} from "./storefront-features";
import { resolveTodayHours, type ResolvedTodayHours } from "./website-hours";
import { getSitePageHref, resolveSiteHref } from "./site-paths";
import {
  resolveWebsiteCatalogAdapter,
  type WebsiteCatalogAvailability,
  type WebsiteCatalogAdapter,
} from "./website-catalog-adapter";
import {
  resolvePrimaryAction,
  type PrimaryActionLabelKey,
  type ResolvedPrimaryActions,
} from "./storefront-primary-action";

// ── Result shapes ───────────────────────────────────────────────────────────

export interface ResolvedPage {
  id: string;
  slug: string;
  title: string;
  isHome: boolean;
  sortOrder: number;
  purpose: TemplatePagePurpose;
  blocks: Block[];
}

export function selectTemplateRoutePage<TPageRow extends { slug: string }>(
  resolvedPages: readonly ResolvedPage[],
  pageRows: readonly TPageRow[],
  requestedSlug?: string | null
): {
  pages: TPageRow[];
  availablePageSlugs: string[];
  target: { row: TPageRow; page: ResolvedPage } | null;
} {
  const emittedBySlug = new Map(resolvedPages.map((page) => [page.slug, page]));
  const pages = pageRows.filter((row) => emittedBySlug.has(row.slug));
  const resolvedTarget = requestedSlug
    ? emittedBySlug.get(requestedSlug)
    : resolvedPages.find((page) => page.isHome) ?? resolvedPages[0];
  const row = resolvedTarget ? pages.find((page) => page.slug === resolvedTarget.slug) : undefined;
  return {
    pages,
    availablePageSlugs: pages.map((page) => page.slug),
    target: row && resolvedTarget ? { row, page: resolvedTarget } : null,
  };
}

export interface SkippedSection {
  page: TemplatePagePurpose;
  sectionId: string;
  pendingBlock: string;
  note?: string;
}

export interface OmittedPage {
  purpose: TemplatePagePurpose;
  slug: string;
  title: string;
  reason: string;
}

export interface ResolvedNavigationItem extends NavigationItem {
  /** Template page slug this entry points at (null for anchor/external). */
  pageSlug: string | null;
  anchor?: string;
  /** Optional commerce gate; nav appears only when the resolved feature is live. */
  feature?: keyof StorefrontFeatureState;
}

export interface TemplateSourceMapEntry {
  slotId: string;
  field: ContentKey;
  itemIndex?: number;
  subfield?: string;
  sampled: boolean;
}

export type BlockSourceMap = Record<string, Record<string, TemplateSourceMapEntry>>;

export interface ChromeSourceMap {
  menuBar: Record<string, TemplateSourceMapEntry>;
  footer: Record<string, TemplateSourceMapEntry>;
}

export interface ChecklistTarget {
  pageSlug: string;
  elementPath: string;
}

export interface TemplateResolutionOptions {
  /** Tenant slug used to scope every internal page link. */
  siteSlug?: string;
  /** Public reservations are disabled until the linked business is approved. */
  reservationsApproved?: boolean;
  /** Samples are rendered only for preview. Defaults to true for existing preview callers. */
  includeSamples?: boolean;
  /** Omit editor-only maps in public/publish callers. Defaults to true. */
  includeSourceMap?: boolean;
  /** ISO 4217 price display code stamped onto emitted menu_embed blocks. Omit for USD. */
  currency?: string;
  /** Linked business context. Only stable selected keys and translated labels are used. */
  business?: {
    industry?: string;
    category?: string;
    businessType?: string | null;
    offerings?: readonly string[] | null;
    offeringLabels?: Record<string, string>;
    capabilities?: readonly Capability[];
  };
  /** Live records used to resolve a manifest catalog slot; omitted by sample previews. */
  catalogAvailability?: WebsiteCatalogAvailability;
  /** Render-only sample override for owner-specific gallery previews. */
  sampleContentOverride?: ContentDoc;
  catalogLabels?: { products: string; featuredProducts: string };
  /** Existing page rows that may be linked at runtime; omitted during publish. */
  availablePageSlugs?: readonly string[] | ReadonlySet<string>;
  /** Locale-resolved template copy, supplied by the caller. */
  viewMenuLabel?: string;
  rentalContactCta?: string;
  /** Evaluation timestamp for time-sensitive content (tests). */
  now?: Date;
  primaryActionLabels?: Partial<Record<PrimaryActionLabelKey, string>>;
  offeringsHeading?: string;
  restaurantCtaBandHeading?: string;
  rentalCtaBandHeading?: string;
  /** Locale-resolved copy used only by the category-neutral food-order template. */
  foodOrderCopy?: {
    stepsHeading?: string;
    popularItemsHeading?: string;
    menuPageHeading?: string;
    orderPageHeading?: string;
    offerHeading?: string;
    offerSubheading?: string;
    contactHeading?: string;
    navigationLabels?: Record<string, string>;
  };
  /** Locale-resolved headings/navigation used only by the Store template. */
  storeCopy?: {
    homeProductsHeading?: string;
    shopHeading?: string;
    trustHeading?: string;
    trustItemHeading?: string;
    navigationLabels?: Record<string, string>;
  };
  /** IANA site timezone for the one-line footer hours display. */
  timeZone?: string;
}

const DEFAULT_PRIMARY_ACTION_LABELS: Record<PrimaryActionLabelKey, string> = {
  orderNow: "Order now",
  reserveTable: "Reserve a table",
  bookNow: "Book now",
  viewMenu: "View menu",
  viewProducts: "Browse products",
  shopNow: "Shop now",
  contact: "Contact",
  rentalContactCta: "Ask about availability",
};

export interface ResolvedTemplate {
  templateId: string;
  templateVersion: string;
  pages: ResolvedPage[];
  navigation: ResolvedNavigationItem[];
  sampleFields: string[];
  /** Render-only editor metadata. Never copied into a block or content document. */
  sourceMap: BlockSourceMap;
  chromeSourceMap: ChromeSourceMap;
  checklistTargets: Record<string, ChecklistTarget>;
  skipped: SkippedSection[];
  /**
   * Pages from the manifest that produced zero renderable blocks (all
   * sections pendingBlock or chrome). Omitted from pages AND navigation so
   * they never publish blank; the manifest keeps them, so they reappear
   * automatically once their pendingBlock becomes a real block type.
   */
  omittedPages: OmittedPage[];
  storefrontFeatures: StorefrontFeatureState;
  primaryAction: ResolvedPrimaryActions;
  todayHours: ResolvedTodayHours | null;
}

export interface SwitchPageMapping {
  purpose: TemplatePagePurpose;
  from: string | null;
  to: string;
}

export interface TemplateSwitchPlan {
  currentTemplateId: string | null;
  newTemplateId: string;
  hiddenSections: string[];
  newEmptySlots: string[];
  pageMapping: SwitchPageMapping[];
  keptUnslottedKeys: string[];
}

// ── Small pure helpers (exported for tests) ─────────────────────────────────

export function isEmptyContentValue(value: unknown): boolean {
  if (value === undefined || value === null) return true;
  if (typeof value === "string") return value.trim().length === 0;
  if (Array.isArray(value)) return value.length === 0;
  if (typeof value === "object") return Object.keys(value).length === 0;
  return false;
}

function asString(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : undefined;
}

function asStringArray(value: unknown): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter(
    (entry): entry is string => typeof entry === "string" && entry.trim().length > 0
  );
  return out.length > 0 ? out : undefined;
}

function asRecordArray(value: unknown): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out = value.filter(
    (entry): entry is Record<string, unknown> =>
      typeof entry === "object" && entry !== null && !Array.isArray(entry)
  );
  return out.length > 0 ? out : undefined;
}

function asRecord(value: unknown): Record<string, unknown> | undefined {
  if (typeof value !== "object" || value === null || Array.isArray(value)) return undefined;
  return value as Record<string, unknown>;
}

function recordText(item: Record<string, unknown>, keys: string[]): string {
  for (const key of keys) {
    const text = asString(item[key]);
    if (text) return text;
  }
  return "";
}

// ── Slot reading (fill-empties-only) ────────────────────────────────────────

interface SlotTake {
  value: unknown;
  sampled: boolean;
}

function takeSlot(
  doc: Record<string, unknown>,
  samples: ContentDoc,
  field: ContentKey,
  slotId: string,
  sampleFields: string[],
  includeSamples = true
): SlotTake {
  const live = (doc as Record<string, unknown>)[field];
  if (!isEmptyContentValue(live)) return { value: live, sampled: false };
  const sample = includeSamples ? (samples as Record<string, unknown>)[field] : undefined;
  if (!isEmptyContentValue(sample)) {
    if (!sampleFields.includes(slotId)) sampleFields.push(slotId);
    return { value: sample, sampled: true };
  }
  return { value: undefined, sampled: false };
}

// ── Section builders (one per existing block type used) ─────────────────────

interface BuildContext {
  template: WebsiteTemplateV2;
  doc: Record<string, unknown>;
  samples: ContentDoc;
  sampleFields: string[];
  includeSamples: boolean;
  currency?: string;
  business: NonNullable<TemplateResolutionOptions["business"]>;
  catalogAdapter?: WebsiteCatalogAdapter;
  catalogAvailability?: WebsiteCatalogAvailability;
  catalogLabels: { products: string; featuredProducts: string };
  storefrontFeatures: StorefrontFeatureState;
  viewMenuLabel: string;
  rentalContactCta: string;
  offeringsHeading: string;
  restaurantCtaBandHeading: string;
  rentalCtaBandHeading: string;
  foodOrderCopy?: TemplateResolutionOptions["foodOrderCopy"];
  storeCopy?: TemplateResolutionOptions["storeCopy"];
  timeZone?: string;
  now?: Date;
}

function take(ctx: BuildContext, field: ContentKey, slotId: string): unknown {
  return takeSlot(ctx.doc, ctx.samples, field, slotId, ctx.sampleFields, ctx.includeSamples).value;
}

function effectiveValue(ctx: BuildContext, field: ContentKey): unknown {
  const live = ctx.doc[field];
  if (!isEmptyContentValue(live)) return live;
  return ctx.includeSamples ? ctx.samples[field] : undefined;
}

function indexedRecords(value: unknown): Array<{ index: number; value: Record<string, unknown> }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) =>
    typeof item === "object" && item !== null && !Array.isArray(item)
      ? [{ index, value: item as Record<string, unknown> }]
      : []
  );
}

function indexedStrings(value: unknown): Array<{ index: number; value: string }> {
  if (!Array.isArray(value)) return [];
  return value.flatMap((item, index) =>
    typeof item === "string" && item.trim()
      ? [{ index, value: item.trim() }]
      : []
  );
}

function stableUuid(seed: string): string {
  const hashes = [2166136261, 2246822519, 3266489917, 668265263];
  for (let index = 0; index < seed.length; index += 1) {
    const code = seed.charCodeAt(index);
    for (let round = 0; round < hashes.length; round += 1) {
      hashes[round] = Math.imul(hashes[round] ^ (code + round), 16777619) >>> 0;
    }
  }
  const hex = hashes.map((value) => value.toString(16).padStart(8, "0")).join("").split("");
  hex[12] = "5";
  hex[16] = "8";
  const value = hex.join("");
  return value.slice(0, 8) + "-" + value.slice(8, 12) + "-" + value.slice(12, 16) +
    "-" + value.slice(16, 20) + "-" + value.slice(20, 32);
}

function stabilizeBlockIds(blocks: Block[], templateId: string, pageSlug: string, sectionIds: string[]): Block[] {
  return blocks.map((block, blockIndex) => {
    const seed = [templateId, pageSlug, sectionIds[blockIndex] ?? String(blockIndex)].join(":");
    const stable: Record<string, unknown> = {
      ...(block as unknown as Record<string, unknown>),
      id: stableUuid(seed),
    };
    for (const key of ["items", "images", "highlights"]) {
      const values = stable[key];
      if (Array.isArray(values)) {
        stable[key] = values.map((item, itemIndex) => ({
          ...(item as Record<string, unknown>),
          id: stableUuid(seed + ":" + key + ":" + itemIndex),
        }));
      }
    }
    return stable as unknown as Block;
  });
}

function entryFor(
  ctx: BuildContext,
  slotId: string,
  field: ContentKey,
  options: { itemIndex?: number; subfield?: string } = {}
): TemplateSourceMapEntry {
  const sampled = ctx.includeSamples &&
    isEmptyContentValue(ctx.doc[field]) &&
    !isEmptyContentValue(ctx.samples[field]);
  if (sampled && !ctx.sampleFields.includes(slotId)) ctx.sampleFields.push(slotId);
  return {
    slotId,
    field,
    ...(options.itemIndex !== undefined ? { itemIndex: options.itemIndex } : {}),
    ...(options.subfield ? { subfield: options.subfield } : {}),
    sampled,
  };
}

function setEntry(
  map: Record<string, TemplateSourceMapEntry>,
  ctx: BuildContext,
  elementPath: string,
  slotId: string,
  field: ContentKey,
  options: { itemIndex?: number; subfield?: string } = {}
): void {
  map[elementPath] = entryFor(ctx, slotId, field, options);
}

function setChecklistTarget(
  targets: Record<string, ChecklistTarget>,
  slotId: string,
  pageSlug: string,
  elementPath: string
): void {
  if (!targets[slotId]) targets[slotId] = { pageSlug, elementPath };
}

function sourceEntriesForBlock(
  ctx: BuildContext,
  section: TemplateSection,
  block: Block,
  pageSlug: string,
  targets: Record<string, ChecklistTarget>
): Record<string, TemplateSourceMapEntry> {
  const entries: Record<string, TemplateSourceMapEntry> = {};
  const object = block as unknown as Record<string, unknown>;
  const isValueAvailable = (field: ContentKey) => !isEmptyContentValue(effectiveValue(ctx, field));
  const add = (
    path: string,
    slotId: string,
    field: ContentKey,
    shouldMap: boolean,
    options: { itemIndex?: number; subfield?: string } = {}
  ) => {
    if (!shouldMap) return;
    setEntry(entries, ctx, path, slotId, field, options);
    setChecklistTarget(targets, slotId, pageSlug, path);
  };

  if (block.type === "hero") {
    add("heading", "hero.headline", "hero_headline", Boolean(object.heading) || !isValueAvailable("hero_headline"));
    add("subheading", "hero.subtext", "hero_subtext", Boolean(object.subheading));
    add("tagline", "hero.tagline", "tagline", Boolean(object.tagline));
    add("image", "hero.image", "hero_image", Boolean(object.backgroundImage) || !isValueAvailable("hero_image"));
    add("ctaLabel", "hero.cta_primary", "primary_cta_label", Boolean(object.ctaLabel));
    add("secondaryCtaLabel", "hero.cta_secondary", "secondary_cta_label", Boolean(object.secondaryCtaLabel));
    add("badge", "hero.open_tag", "hours", Boolean(object.badge), { subfield: "today_tag" });
  } else if (block.type === "features") {
    const slotId = section.id === "trust" ? "trust.items" : section.id === "store.trust" ? "trust.copy" : section.id === "how-it-works" ? "steps.items" : "highlights.items";
    const field: ContentKey = section.id === "trust" ? "trust" : section.id === "store.trust" ? "template_extras" : section.id === "how-it-works" ? "steps" : "highlights";
    if (section.id === "store.trust") {
      const extras = asRecord(effectiveValue(ctx, "template_extras"));
      add("items[0].description", slotId, field, Boolean(asString(extras?.storeTrustText)), { subfield: "storeTrustText" });
      return entries;
    }
    const sourceRows = indexedRecords(effectiveValue(ctx, field));
    let emittedIndex = 0;
    for (const row of sourceRows) {
      const title = recordText(row.value, ["title", "label", "name"]);
      if (!title || emittedIndex >= (block.items?.length ?? 0)) continue;
      const description = recordText(row.value, ["description", "value", "text"]);
      const image = recordText(row.value, ["image", "image_url", "photo", "src"]);
      add("items[" + emittedIndex + "].title", slotId, field, true, { itemIndex: row.index, subfield: "title" });
      add("items[" + emittedIndex + "].description", slotId, field, Boolean(description), { itemIndex: row.index, subfield: "description" });
      if (image) add("items[" + emittedIndex + "].image", slotId, field, true, { itemIndex: row.index, subfield: "image" });
      emittedIndex += 1;
    }
  } else if (block.type === "about") {
    if (object.caption) add("caption", "about.caption", "about_caption", true);
    if (object.heading) add("heading", "about.headline", "about_headline", true);
    if (object.subtitle) add("subtitle", "about.subtitle", "about_subtitle", true);
    add("story", "about.text", "about_text", Boolean(object.story));
    add("founderImage", "about.photo", "about_image", Boolean(object.founderImage));
    const sourceRows = indexedRecords(effectiveValue(ctx, "stats"));
    let emittedIndex = 0;
    for (const row of sourceRows) {
      const label = recordText(row.value, ["label", "title", "name"]);
      const value = recordText(row.value, ["value", "description", "text"]);
      if (!label || !value || emittedIndex >= (block.highlights?.length ?? 0)) continue;
      add("highlights[" + emittedIndex + "].label", "about.stats", "stats", true, { itemIndex: row.index, subfield: "label" });
      add("highlights[" + emittedIndex + "].value", "about.stats", "stats", true, { itemIndex: row.index, subfield: "value" });
      emittedIndex += 1;
    }
  } else if (block.type === "gallery") {
    const sourceRows = indexedStrings(effectiveValue(ctx, "gallery_images")).slice(0, block.images?.length ?? 0);
    sourceRows.forEach((row, index) => add("images[" + index + "].src", "gallery.photos", "gallery_images", true, { itemIndex: row.index }));
  } else if (block.type === "testimonials") {
    const sourceRows = indexedRecords(effectiveValue(ctx, "testimonials"));
    let emittedIndex = 0;
    for (const row of sourceRows) {
      const quote = recordText(row.value, ["quote", "text"]);
      if (!quote || emittedIndex >= (block.items?.length ?? 0)) continue;
      add("items[" + emittedIndex + "].quote", "testimonials.items", "testimonials", true, { itemIndex: row.index, subfield: "quote" });
      const author = recordText(row.value, ["author", "name"]);
      add("items[" + emittedIndex + "].author", "testimonials.items", "testimonials", Boolean(author), { itemIndex: row.index, subfield: "author" });
      emittedIndex += 1;
    }
  } else if (block.type === "contact") {
    add("email", "contact.email", "email", Boolean(object.email));
    add("phone", "location.phone", "phone", Boolean(object.phone) || !isValueAvailable("phone"));
    add("address", "location.address", "address", Boolean(object.address) || !isValueAvailable("address"));
    add("directionsUrl", "location.directions", "directions_url", Boolean(object.directionsUrl));
    add("hours", "hours.table", "hours", (block.hoursTable?.length ?? 0) === 0 && (Boolean(object.hours) || !isValueAvailable("hours")), { subfield: "today_tag" });
    const hours = asRecord(effectiveValue(ctx, "hours"));
    const dayKeys = Object.keys(WEEKDAY_LABELS);
    (block.hoursTable ?? []).forEach((row, index) => {
      const dayKey = dayKeys.find((key) => WEEKDAY_LABELS[key] === row.day);
      if (dayKey && asRecord(hours?.[dayKey])) {
        add("hoursTable[" + index + "]", "hours.table", "hours", true, { subfield: dayKey });
      }
    });
    const locations = indexedRecords(effectiveValue(ctx, "locations"));
    let locationIndex = 0;
    for (const row of locations) {
      const name = recordText(row.value, ["name", "title"]);
      const address = recordText(row.value, ["address"]);
      const text = recordText(row.value, ["hours", "text"]);
      if (!(name || address || text) || locationIndex >= (block.locations?.length ?? 0)) continue;
      if (name) add("locations[" + locationIndex + "].name", "locations.list", "locations", true, { itemIndex: row.index, subfield: "name" });
      if (address) add("locations[" + locationIndex + "].address", "locations.list", "locations", true, { itemIndex: row.index, subfield: "address" });
      if (text) add("locations[" + locationIndex + "].hours", "locations.list", "locations", true, { itemIndex: row.index, subfield: "hours" });
      locationIndex += 1;
    }
  } else if (block.type === "faq") {
    const sourceRows = indexedRecords(effectiveValue(ctx, "faq"));
    let emittedIndex = 0;
    for (const row of sourceRows) {
      const question = recordText(row.value, ["question", "title"]);
      const answer = recordText(row.value, ["answer", "text", "description"]);
      if (!question || !answer || emittedIndex >= (block.items?.length ?? 0)) continue;
      add("items[" + emittedIndex + "].question", "faq.items", "faq", true, { itemIndex: row.index, subfield: "question" });
      add("items[" + emittedIndex + "].answer", "faq.items", "faq", true, { itemIndex: row.index, subfield: "answer" });
      emittedIndex += 1;
    }
  } else if (block.type === "menu_embed" && section.id === "menu.featured") {
    add("heading", "menu.featured", "featured", true, { subfield: "menu_item_ids" });
    const picks = asRecord(effectiveValue(ctx, "featured"))?.menu_item_ids;
    if (Array.isArray(picks)) {
      const ids = picks.flatMap((id, itemIndex) =>
        typeof id === "string" && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())
          ? [{ id: id.trim(), itemIndex }]
          : []
      ).slice(0, block.selectedItemIds?.length ?? 0);
      ids.forEach((pick, index) => add("selectedItemIds[" + index + "]", "menu.featured", "featured", true, { itemIndex: pick.itemIndex, subfield: "menu_item_ids" }));
    }
  } else if (block.type === "cta_banner") {
    if (section.id === "promo") {
      add("eyebrow", "promo.eyebrow", "promo", Boolean(object.eyebrow), { subfield: "eyebrow" });
      add("heading", "promo.headline", "promo", Boolean(object.heading), { subfield: "headline" });
      add("subheading", "promo.text", "promo", Boolean(object.subheading), { subfield: "text" });
      add("image", "promo.image", "promo", Boolean(object.image), { subfield: "image" });
      add("ctaLabel", "promo.button_label", "promo", Boolean(object.ctaLabel), { subfield: "button_label" });
      add("ctaHref", "promo.button_link", "promo", Boolean(object.ctaHref), { subfield: "button_link" });
      add("endDate", "promo.end_date", "promo", Boolean(object.endDate), { subfield: "end_date" });
    } else if (section.id === "cta-band") {
      if (ctx.template.id === "restaurant-savannah") {
        add("heading", "cta.heading", "template_extras", Boolean(object.heading), { subfield: "ctaBandHeading" });
      }
      add("ctaLabel", "cta.button_label", "template_extras", Boolean(object.ctaLabel), { subfield: "ctaBandButtonLabel" });
      add("ctaHref", "cta.button_link", "template_extras", Boolean(object.ctaHref), { subfield: "ctaBandButtonLink" });
    }
  }

  return entries;
}

function buildHero(ctx: BuildContext): Block {
  const primaryCtaLabel = asString(take(ctx, "primary_cta_label", "hero.cta_primary"));
  const hours = asRecord(take(ctx, "hours", "hero.open_tag") ?? take(ctx, "hours", "hours.table"));
  const badge = hours ? asString(hours.today_tag) : undefined;
  const isTableFlame = ctx.template.id === "restaurant-table-flame";
  const isSavannah = ctx.template.id === "restaurant-savannah";
  const isRestaurantEditorial = isTableFlame || isSavannah;
  const tagline = asString(take(ctx, "tagline", "hero.tagline"));
  const address = asString(effectiveValue(ctx, "address"));
  const area = address?.split(",").slice(-2).join(",").trim();
  const eyebrow = isTableFlame
    ? [asString(ctx.business.businessType), area].filter(Boolean).join(" · ") || tagline
    : tagline;
  const today = isRestaurantEditorial ? resolveTodayHours(hours, ctx.timeZone) : null;
  const phone = asString(effectiveValue(ctx, "phone"));
  const metaPills = isTableFlame
    ? [
        today?.open && today.close && !today.closed ? { label: `Open today until ${today.close}` } : undefined,
        address ? { label: address } : undefined,
        phone ? { label: phone, href: `tel:${phone}` } : undefined,
      ].filter((pill): pill is { label: string; href?: string } => Boolean(pill))
    : [];
  const extras = asRecord(effectiveValue(ctx, "template_extras"));
  let imagePosition = typeof extras?.tableFlameHeroPosition === "string"
    ? extras.tableFlameHeroPosition
    : undefined;
  if (isSavannah) {
    const fx = typeof extras?.savannahHeroFocalX === "number" && Number.isFinite(extras.savannahHeroFocalX)
      ? extras.savannahHeroFocalX
      : undefined;
    const fy = typeof extras?.savannahHeroFocalY === "number" && Number.isFinite(extras.savannahHeroFocalY)
      ? extras.savannahHeroFocalY
      : undefined;
    if (fx !== undefined || fy !== undefined) {
      imagePosition = `${Math.max(0, Math.min(100, Math.round(fx ?? 50)))}% ${Math.max(0, Math.min(100, Math.round(fy ?? 50)))}%`;
    }
  }
  const logoMark = isTableFlame ? asString(take(ctx, "logo_url", "nav.logo")) : undefined;
  const imageFit = isSavannah && extras?.savannahHeroFit === "contain" ? "contain" : undefined;
  return {
    type: "hero",
    variant: isRestaurantEditorial ? "full-bleed" : "split",
    align: "left",
    tagline: eyebrow,
    heading: asString(take(ctx, "hero_headline", "hero.headline")),
    subheading: asString(take(ctx, "hero_subtext", "hero.subtext")),
    backgroundImage: asString(take(ctx, "hero_image", "hero.image")),
    ctaLabel: primaryCtaLabel,
    ctaHref: ctx.template.header.ctaHref,
    secondaryCtaLabel: asString(take(ctx, "secondary_cta_label", "hero.cta_secondary")),
    secondaryCtaHref: undefined,
    ...(badge ? { badge } : {}),
    ...(logoMark ? { logoMark } : {}),
    ...(imagePosition ? { imagePosition } : {}),
    ...(imageFit ? { imageFit } as any : {}),
    ...(metaPills.length ? { metaPills } : {}),
    ...(isRestaurantEditorial ? { scrim: true } : {}),
  } as Block;
}

function buildFeatureItems(value: unknown): Array<{ title: string; description?: string; image?: string }> {
  const rows = asRecordArray(value) ?? [];
  const out: Array<{ title: string; description?: string; image?: string }> = [];
  for (const row of rows) {
    const title = recordText(row, ["title", "label", "name"]);
    if (!title) continue;
    const description = recordText(row, ["description", "value", "text"]) || undefined;
    const image = recordText(row, ["image", "image_url", "photo", "src"]) || undefined;
    out.push({ title, ...(description ? { description } : {}), ...(image ? { image } : {}) });
  }
  return out;
}

function buildFeatures(
  ctx: BuildContext,
  section: TemplateSection,
  field: ContentKey,
  slotId: string,
  columns: 2 | 3 | 4,
  heading?: string
): Block {
  const items = buildFeatureItems(take(ctx, field, slotId)).slice(0, columns === 4 ? 4 : 3);
  return {
    type: "features",
    ...(heading ? { heading } : {}),
    columns,
    items,
  } as Block;
}

function buildBusinessOfferings(ctx: BuildContext): Block | null {
  const selectedFacts = getSelectedFactOfferings(
    ctx.business.offerings,
    ctx.business.businessType,
    ctx.business.category
  );
  const items = selectedFacts.flatMap((offering) => {
    const title = ctx.business.offeringLabels?.[offering.key];
    return title ? [{ title }] : [];
  });
  if (items.length === 0) return null;
  return {
    type: "features",
    heading: ctx.offeringsHeading,
    columns: 3,
    items,
  } as Block;
}

function buildAbout(ctx: BuildContext): Block {
  const isSavannah = ctx.template.id === "restaurant-savannah";
  const stats = asRecordArray(take(ctx, "stats", "about.stats")) ?? [];
  const highlights = stats
    .map((row) => ({
      label: recordText(row, ["label", "title", "name"]),
      value: recordText(row, ["value", "description", "text"]),
    }))
    .filter((highlight) => highlight.label.length > 0 && highlight.value.length > 0)
    .slice(0, 3);
  return {
    type: "about",
    ...(isSavannah ? {
      caption: asString(take(ctx, "about_caption", "about.caption")),
      heading: asString(take(ctx, "about_headline", "about.headline")) || "Our Story",
      subtitle: asString(take(ctx, "about_subtitle", "about.subtitle")),
    } : {
      ...(ctx.template.id === "restaurant-table-flame" ? { heading: "Our Story" } : {}),
    }),
    story: asString(take(ctx, "about_text", "about.text")),
    founderImage: asString(take(ctx, "about_image", "about.photo")),
    ...(highlights.length > 0 ? { highlights } : {}),
  } as Block;
}

function buildGallery(ctx: BuildContext): Block {
  const images = (asStringArray(take(ctx, "gallery_images", "gallery.photos")) ?? [])
    .slice(0, 6)
    .map((src, index) => ({ src, alt: `Photo ${index + 1}` }));
  return {
    type: "gallery",
    layout: "grid",
    columns: 3,
    images,
  } as Block;
}

function buildTestimonials(ctx: BuildContext): Block {
  const rows = asRecordArray(take(ctx, "testimonials", "testimonials.items")) ?? [];
  const items = rows
    .map((row) => ({
      quote: recordText(row, ["quote", "text"]),
      ...(recordText(row, ["author", "name"]) ? { author: recordText(row, ["author", "name"]) } : {}),
    }))
    .filter((item) => item.quote.length > 0)
    .slice(0, 3);
  return {
    type: "testimonials",
    ...(ctx.template.id === "restaurant-table-flame" ? { heading: "Words from the table" } : ctx.template.id === "restaurant-savannah" ? { heading: "A word from our guests" } : {}),
    layout: "grid",
    items,
  } as Block;
}

const WEEKDAY_LABELS: Record<string, string> = {
  mon: "Mon",
  tue: "Tue",
  wed: "Wed",
  thu: "Thu",
  fri: "Fri",
  sat: "Sat",
  sun: "Sun",
};

function buildContact(ctx: BuildContext, heading: string): Block {
  const hours = asRecord(take(ctx, "hours", "hours.table"));
  const hoursTable: Array<{ day: string; open?: string; close?: string; closed?: boolean }> = hours
    ? (Object.keys(WEEKDAY_LABELS) as Array<keyof typeof WEEKDAY_LABELS>)
        .map((day) => {
          const slot = asRecord(hours[day]);
          if (!slot) return null;
          const open = asString(slot.open);
          const close = asString(slot.close);
          const closed = slot.closed === true;
          if (!open && !close && !closed) return null;
          const row: { day: string; open?: string; close?: string; closed?: boolean } = { day: WEEKDAY_LABELS[day] };
          if (open) row.open = open;
          if (close) row.close = close;
          if (closed) row.closed = true;
          return row;
        })
        .filter((row): row is { day: string; open?: string; close?: string; closed?: boolean } => row !== null)
        .slice(0, 7)
    : [];
  const locations = (asRecordArray(take(ctx, "locations", "locations.list")) ?? [])
    .map((row) => ({
      ...(recordText(row, ["name", "title"]) ? { name: recordText(row, ["name", "title"]) } : {}),
      ...(recordText(row, ["address"]) ? { address: recordText(row, ["address"]) } : {}),
      ...(recordText(row, ["hours", "text"]) ? { hours: recordText(row, ["hours", "text"]) } : {}),
    }))
    .filter((row) => Boolean(row.name || row.address || row.hours))
    .slice(0, 12);
  return {
    type: "contact",
    heading,
    email: asString(take(ctx, "email", "contact.email")),
    phone: asString(take(ctx, "phone", "location.phone")),
    address: asString(take(ctx, "address", "location.address")),
    hours: hours ? asString(hours.today_tag) : undefined,
    ...(hoursTable.length > 0 ? { hoursTable } : {}),
    ...(locations.length > 0 ? { locations } : {}),
    directionsUrl: asString(take(ctx, "directions_url", "location.directions")),
    showMap: false,
  } as Block;
}

function buildFaq(ctx: BuildContext): Block {
  const rows = asRecordArray(take(ctx, "faq", "faq.items")) ?? [];
  const items = rows
    .map((row) => ({
      question: recordText(row, ["question", "title"]),
      answer: recordText(row, ["answer", "text", "description"]),
    }))
    .filter((item) => item.question.length > 0 && item.answer.length > 0);
  return {
    type: "faq",
    heading: "Frequently asked questions",
    items,
  } as Block;
}

function buildCtaBand(ctx: BuildContext): Block {
  const isFoodOrder = ctx.template.id === "food-order";
  const isSavannah = ctx.template.id === "restaurant-savannah";
  const isRestaurantEditorial = ctx.template.id === "restaurant-table-flame" || isSavannah;
  const heading = isFoodOrder
    ? ctx.foodOrderCopy?.offerHeading ?? "A little something special"
    : ctx.template.id === "restaurant-table-flame"
      ? ctx.restaurantCtaBandHeading
      : isSavannah
        ? "Join us around the table."
      : ctx.rentalCtaBandHeading;
  const extras = asRecord(effectiveValue(ctx, "template_extras"));
  const customLabel = isSavannah ? asString(extras?.ctaBandButtonLabel) : undefined;
  const customLink = isSavannah ? asString(extras?.ctaBandButtonLink) : undefined;
  const defaultLabel = isSavannah ? ctx.viewMenuLabel : undefined;
  const defaultLink = isSavannah ? "/menu" : undefined;
  const ctaLabel = customLabel ?? defaultLabel;
  const ctaHref = customLink ?? defaultLink;
  const headingFinal = (isSavannah ? (extras?.ctaBandHeading as string) : undefined) ?? heading;
  return {
    type: "cta_banner",
    heading: headingFinal,
    ...(isFoodOrder && ctx.foodOrderCopy?.offerSubheading
      ? { subheading: ctx.foodOrderCopy.offerSubheading }
      : {}),
    ...(ctaLabel ? { ctaLabel } : {}),
    ...(ctaHref ? { ctaHref } : {}),
    variant: isRestaurantEditorial ? "footer" : "brand",
  } as Block;
}

function buildMenuEmbed(ctx: BuildContext, heading: string, limit: number, bindFeatured: boolean): Block {
  // Featured menu_item_ids bind only when they are UUID-shaped (anything else
  // is dropped so validation never fails); section scoping + tenant isolation
  // stay in resolveMenuEmbed. Unset/empty keeps "show all" behavior.
  const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  let selectedItemIds: string[] | undefined;
  if (bindFeatured) {
    const featured = take(ctx, "featured", "menu.featured") as { menu_item_ids?: unknown } | undefined;
    const ids = Array.isArray(featured?.menu_item_ids)
      ? featured.menu_item_ids.filter(
          (id): id is string => typeof id === "string" && UUID_SHAPE.test(id.trim())
        ).map((id) => id.trim()).slice(0, 12)
      : [];
    if (ids.length > 0) selectedItemIds = ids;
  }
  return {
    type: "menu_embed",
    heading,
    limit,
    layout: "grid",
    ...(ctx.template.id === "restaurant-table-flame" ? { variant: "rows" } : ctx.template.id === "restaurant-savannah" ? { variant: "catalog-carousel" } : {}),
    ...(selectedItemIds ? { selectedItemIds } : {}),
    ...(ctx.currency ? { currency: ctx.currency } : {}),
  } as Block;
}

function buildSectionBlock(
  ctx: BuildContext,
  section: TemplateSection
): Block | null {
  switch (section.block) {
    case "hero":
      return buildHero(ctx);
    case "features": {
      if (section.id === "business-offerings") return buildBusinessOfferings(ctx);
      if (section.id === "store.trust") {
        const extras = asRecord(effectiveValue(ctx, "template_extras"));
        const text = asString(extras?.storeTrustText);
        if (!text) return null;
        return {
          type: "features",
          heading: ctx.storeCopy?.trustHeading ?? "About this store",
          columns: 2,
          items: [{ title: ctx.storeCopy?.trustItemHeading ?? "A note from this business", description: text }],
        } as Block;
      }
      if (section.id === "trust") return buildFeatures(ctx, section, "trust", "trust.items", 4, "Why DriveLine");
      if (section.id === "how-it-works") {
        const heading = ctx.template.id === "food-order"
          ? ctx.foodOrderCopy?.stepsHeading ?? "Order steps"
          : "How it works";
        return buildFeatures(ctx, section, "steps", "steps.items", 3, heading);
      }
      return buildFeatures(ctx, section, "highlights", "highlights.items", 3);
    }
    case "about":
      return buildAbout(ctx);
    case "gallery":
      return buildGallery(ctx);
    case "testimonials":
      return buildTestimonials(ctx);
    case "contact": {
      const heading = ctx.template.id === "food-order"
        ? ctx.foodOrderCopy?.contactHeading ?? "Contact"
        : ctx.template.id === "restaurant-table-flame" || ctx.template.id === "restaurant-savannah" ? "Hours & Location"
          : section.id === "locations" ? "Pickup locations" : "Visit us";
      return buildContact(ctx, heading);
    }
    case "faq":
      return buildFaq(ctx);
    case "cta_banner": {
      if (section.id === "promo") {
        const promo = asRecord(effectiveValue(ctx, "promo"));
        const headline = asString(promo?.headline) ?? (ctx.includeSamples ? "Special Seasonal Menu" : undefined);
        const text = asString(promo?.text) ?? (ctx.includeSamples ? "Experience our chef's curated seasonal tasting menu, crafted with local ingredients." : undefined);
        const eyebrow = asString(promo?.eyebrow) ?? (ctx.includeSamples ? "Limited Time" : undefined);
        const image = asString(promo?.image);
        const ctaLabel = asString(promo?.button_label) ?? (ctx.includeSamples ? "Reserve a table" : undefined);
        const ctaHref = asString(promo?.button_link) ?? (ctx.includeSamples ? "/reservations" : undefined);
        const endDateRaw = asString(promo?.end_date) ?? (ctx.includeSamples ? "Available this month" : undefined);
        let shouldHide = false;
        if (endDateRaw && !ctx.includeSamples) {
          let ts: number | null = null;
          const asDate = new Date(endDateRaw);
          if (!Number.isNaN(asDate.getTime())) {
            ts = asDate.getTime();
          } else {
            const match = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(endDateRaw);
            if (match) {
              const y = Number(match[1]);
              const m = Number(match[2]) - 1;
              const d = Number(match[3]);
              const end = new Date(y, m, d);
              end.setHours(23, 59, 59, 999);
              ts = end.getTime();
            } else {
              const parsed = Date.parse(endDateRaw);
              if (!Number.isNaN(parsed)) ts = parsed;
            }
          }
          if (ts !== null) {
            const nowTs = (ctx.now ?? new Date()).getTime();
            if (nowTs > ts) shouldHide = true;
          }
        }
        if (shouldHide) return null;
        const endDate = endDateRaw;
        if (!headline && !text && !image) return null;
        return {
          type: "cta_banner",
          variant: "promo",
          heading: headline,
          subheading: text,
          ...(eyebrow ? { eyebrow } : {}),
          ...(image ? { image } : {}),
          ...(ctaLabel ? { ctaLabel } : {}),
          ...(ctaHref ? { ctaHref } : {}),
          ...(endDate ? { endDate } : {}),
        } as Block;
      }
      return buildCtaBand(ctx);
    }
    case "menu_embed": {
      if (ctx.catalogAvailability && !ctx.catalogAdapter) return null;
      if (ctx.catalogAdapter === "products") {
        if (section.id === "order.summary") return null;
        return {
          type: "products_embed",
          heading: section.id === "menu.full" || section.id === "menu.browse"
            ? (ctx.template.id === "food-order" && section.id === "menu.browse"
              ? ctx.foodOrderCopy?.popularItemsHeading ?? "Popular items"
              : ctx.catalogLabels.products)
            : ctx.catalogLabels.featuredProducts,
          limit: section.id === "menu.featured" || (ctx.template.id === "food-order" && section.id === "menu.browse") ? 6 : 200,
          layout: "grid",
        } as Block;
      }
      if (section.id === "menu.full" && ctx.template.id === "food-order") {
        return buildMenuEmbed(ctx, ctx.foodOrderCopy?.menuPageHeading ?? "Browse the menu", 200, false);
      }
      if (section.id === "menu.full") return buildMenuEmbed(ctx, "Our full menu", 200, false);
      if (section.id === "menu.browse" && ctx.template.id === "food-order") {
        return buildMenuEmbed(ctx, ctx.foodOrderCopy?.popularItemsHeading ?? "Popular items", 6, false);
      }
      if (section.id === "menu.browse") return buildMenuEmbed(ctx, "Our Menu", 200, false);
      if (section.id === "order.summary") {
        return ctx.storefrontFeatures.ordering
          ? buildMenuEmbed(ctx, ctx.template.id === "food-order"
            ? ctx.foodOrderCopy?.orderPageHeading ?? "Start an order"
            : "Start your order", 200, false)
          : null;
      }
      return buildMenuEmbed(ctx, ctx.template.id === "restaurant-savannah" ? "Best sellers" : "Featured dishes", 6, true); // menu.featured — picks only
    }
    case "products_embed": {
      if (ctx.template.id !== "store") return null;
      if (ctx.catalogAvailability && !ctx.catalogAvailability.products) return null;
      const home = section.id === "store.home.products";
      // Owner-tunable grid density (V2 "Shop page" section); falls back to
      // the template defaults (6 Home / 12 Shop) when unset or invalid.
      const densityExtras = asRecord(effectiveValue(ctx, "template_extras"));
      const densityRaw = densityExtras?.storeBrowsePageSize;
      const density =
        typeof densityRaw === "number" && Number.isFinite(densityRaw)
          ? Math.min(24, Math.max(1, Math.floor(densityRaw)))
          : home ? 6 : 12;
      // Owner-picked featured products (V2 "Featured products" section) bind
      // only when UUID-shaped; anything else falls back to latest. Tenant
      // scoping stays in resolveProductsEmbed, so foreign ids resolve empty.
      const featured = asRecord(effectiveValue(ctx, "featured"));
      const picks = section.id === "store.home.products" && Array.isArray(featured?.product_ids)
        ? (featured.product_ids as unknown[]).filter(
            (id): id is string =>
              typeof id === "string" &&
              /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id.trim())
          ).map((id) => id.trim()).slice(0, 12)
        : [];
      return {
        type: "products_embed",
        heading: home
          ? ctx.storeCopy?.homeProductsHeading ?? "Featured products"
          : ctx.storeCopy?.shopHeading ?? "Shop all products",
        limit: 200,
        layout: "grid",
        categoryTiles: true,
        siteLocalProductDetails: true,
        allowLargeCatalog: true,
        browsePageSize: density,
        ...(picks.length > 0 ? { selectedProductIds: picks } : {}),
        ...(!ctx.catalogAvailability && ctx.includeSamples ? { previewProducts: STORE_PREVIEW_PRODUCTS } : {}),
      } as Block;
    }
    case "menu_order": {
      if (ctx.catalogAvailability && ctx.catalogAdapter !== "menu") return null;
      if (!ctx.storefrontFeatures.ordering) return null;
      return {
        id: stableUuid(ctx.template.id + ":home:menu_order"),
        type: "menu_order",
      };
    }
    case "reservation_form": {
      if (!ctx.storefrontFeatures.reservations) return null;
      return {
        id: stableUuid(ctx.template.id + ":reservations:reservation_form"),
        type: "reservation_form",
      };
    }
    default:
      return null;
  }
}

type BlockContentChecker = (block: Block) => boolean;

const BLOCK_CONTENT_CHECKERS: Partial<Record<BlockType, BlockContentChecker>> = {
  gallery: (block) => {
    const images = (block as { images?: unknown[] }).images;
    return Array.isArray(images) && images.length > 0;
  },
  features: (block) => {
    const items = (block as { items?: unknown[] }).items;
    return Array.isArray(items) && items.length > 0;
  },
  testimonials: (block) => {
    const items = (block as { items?: unknown[] }).items;
    return Array.isArray(items) && items.length > 0;
  },
  faq: (block) => {
    const items = (block as { items?: unknown[] }).items;
    return Array.isArray(items) && items.length > 0;
  },
  about: (block) => {
    const b = block as { story?: string; founderImage?: string; highlights?: unknown[] };
    return Boolean(
      (typeof b.story === "string" && b.story.trim().length > 0) ||
      (typeof b.founderImage === "string" && b.founderImage.trim().length > 0) ||
      (Array.isArray(b.highlights) && b.highlights.length > 0)
    );
  },
};

export function hasBlockContent(block: Block): boolean {
  const checker = BLOCK_CONTENT_CHECKERS[block.type];
  if (!checker) return true;
  return checker(block);
}

function sectionHasLiveSlotContent(
  doc: Record<string, unknown>,
  section: TemplateSection,
  template?: WebsiteTemplateV2
): boolean {
  if (!section.slots || section.slots.length === 0) return false;
  if (template?.editableSlots) {
    const slotsById = new Map(template.editableSlots.map((s) => [s.slotId, s]));
    for (const slotId of section.slots) {
      const slot = slotsById.get(slotId);
      if (!slot) continue;
      const fieldValue = doc[slot.field];
      const val = slot.extraKey && fieldValue && typeof fieldValue === "object" && !Array.isArray(fieldValue)
        ? (fieldValue as Record<string, unknown>)[slot.extraKey]
        : fieldValue;
      if (!isEmptyContentValue(val)) return true;
    }
    return false;
  }
  if (section.id === "gallery" || section.block === "gallery") {
    return !isEmptyContentValue(doc.gallery_images);
  }
  return false;
}

export function isSectionEnabled(
  section: TemplateSection,
  doc: Record<string, unknown>,
  template?: WebsiteTemplateV2
): boolean {
  if (!section.optional) return true;
  const enabledMap = (doc.enabled_sections && typeof doc.enabled_sections === "object"
    ? doc.enabled_sections
    : undefined) as Record<string, boolean> | undefined;

  if (enabledMap && typeof enabledMap[section.id] === "boolean") {
    return enabledMap[section.id];
  }

  if (section.defaultOff) {
    return sectionHasLiveSlotContent(doc, section, template);
  }

  return true;
}

// ── Resolver ────────────────────────────────────────────────────────────────

function pageIdFor(templateId: string, slug: string): string {
  return `${templateId}--${slug}`;
}

export function resolveTemplateContent(
  templateId: string,
  templateVersion: string,
  contentDoc: ContentDoc,
  options: TemplateResolutionOptions = {}
): ResolvedTemplate {
  const template = getFlagshipTemplate(templateId, templateVersion);
  if (!template) {
    throw new Error(`Unknown flagship template: ${templateId}@${templateVersion}`);
  }
  return resolveTemplateManifest(template, contentDoc, options);
}

/**
 * Resolver core over an explicit manifest object (exported for tests: a test
 * double that "implements" a pendingBlock proves the page comes back).
 */
export function resolveTemplateManifest(
  template: WebsiteTemplateV2,
  contentDoc: ContentDoc,
  options: TemplateResolutionOptions = {}
): ResolvedTemplate {
  // Deep-clone: the input doc is never mutated (pinned by test).
  const doc = JSON.parse(JSON.stringify(contentDoc ?? {})) as Record<string, unknown>;
  const samples = (options.sampleContentOverride ?? FLAGSHIP_SAMPLES[template.id] ?? {}) as unknown as Record<string, unknown>;

  const sampleFields: string[] = [];
  const skipped: SkippedSection[] = [];
  const omittedPages: OmittedPage[] = [];
  const business = options.business ?? {};
  const siteSlug = options.siteSlug ?? template.id;
  const capabilities = getCapabilitiesForBusiness(
    business.industry ?? "",
    business.category ?? "",
    business.businessType ?? ""
  );
  const resolvedCapabilities = business.capabilities ?? capabilities;
  const catalogAdapter = template.id === "store"
    ? options.catalogAvailability
      ? options.catalogAvailability.products ? "products" : undefined
      : options.includeSamples !== false ? "products" : undefined
    : options.catalogAvailability
      ? resolveWebsiteCatalogAdapter(options.catalogAvailability, business)
      : undefined;
  const storefrontFeatures = resolveStorefrontFeatures({
    capabilities: resolvedCapabilities,
    offerings: business.offerings,
    built: getBuiltStorefrontFeatures(template),
    currency: normalizeCurrencyCode(options.currency),
    hasActiveDish: options.catalogAvailability ? catalogAdapter === "menu" : undefined,
    reservationsApproved: options.reservationsApproved,
  });
  const ctx: BuildContext = {
    template,
    doc,
    samples: samples as ContentDoc,
    sampleFields,
    includeSamples: options.includeSamples !== false,
    currency: normalizeCurrencyCode(options.currency),
    business,
    catalogAdapter,
    catalogAvailability: options.catalogAvailability,
    catalogLabels: options.catalogLabels ?? { products: "Products", featuredProducts: "Featured products" },
    storefrontFeatures,
    viewMenuLabel: options.viewMenuLabel ?? "View menu",
    rentalContactCta: options.rentalContactCta ?? "Ask about availability",
    offeringsHeading: options.offeringsHeading ?? "What we offer",
    restaurantCtaBandHeading: options.restaurantCtaBandHeading ?? "Made for good moments.",
    rentalCtaBandHeading: options.rentalCtaBandHeading ?? "Ready for your next journey?",
    foodOrderCopy: options.foodOrderCopy,
    storeCopy: options.storeCopy,
    timeZone: options.timeZone,
    now: options.now,
  };

  const pages: ResolvedPage[] = [];
  const sourceMap: BlockSourceMap = {};
  const checklistTargets: Record<string, ChecklistTarget> = {};
  for (const page of template.pages) {
    const rawBlocks: Block[] = [];
    const rawSectionIds: string[] = [];
    const rawBlockMaps: Array<Record<string, TemplateSourceMapEntry>> = [];
    const pendingNames: string[] = [];
    for (const section of template.sections) {
      if (section.page !== page.purpose) continue;
      if (section.chrome) continue;
      if (!isSectionEnabled(section, doc, template)) continue;
      if (!section.block) {
        if (section.pendingBlock) {
          skipped.push({
            page: page.purpose,
            sectionId: section.id,
            pendingBlock: section.pendingBlock,
            ...(section.note ? { note: section.note } : {}),
          });
          pendingNames.push(section.pendingBlock);
        }
        continue;
      }
      const block = buildSectionBlock(ctx, section);
      if (block) {
        if (section.spacing) block.spacing = section.spacing;
        if (!ctx.includeSamples && !hasBlockContent(block)) {
          continue;
        }
        rawBlocks.push(block);
        rawSectionIds.push(section.id);
        rawBlockMaps.push(sourceEntriesForBlock(ctx, section, block, page.slug, checklistTargets));
      }
    }
    if (rawBlocks.length === 0) {
      omittedPages.push({
        purpose: page.purpose,
        slug: page.slug,
        title: page.title,
        reason:
          pendingNames.length > 0
            ? `page '${page.slug}' has no renderable blocks yet (pending: ${pendingNames.join(", ")})`
            : `page '${page.slug}' has no renderable blocks yet`,
      });
      continue;
    }
    const blocks = stabilizeBlockIds(normalizeBlocks(rawBlocks), template.id, page.slug, rawSectionIds);
    for (const block of blocks) {
      const result = validateBlock(block);
      if (!result.success) {
        throw new Error(
          `Template ${template.id}@${template.version} produced an invalid ${String(
            (block as { type?: unknown }).type
          )} block: ${result.error} ${JSON.stringify(result.issues)}`
        );
      }
    }
    blocks.forEach((block, index) => {
      const entries = rawBlockMaps[index];
      if (entries && Object.keys(entries).length > 0) {
        sourceMap[block.id ?? stableUuid(template.id + ":" + page.slug + ":" + index)] = entries;
      }
    });
    pages.push({
      id: pageIdFor(template.id, page.slug),
      slug: page.slug,
      title: page.title,
      isHome: page.isHome,
      sortOrder: page.sortOrder,
      purpose: page.purpose,
      blocks,
    });
  }

  const emittedSlugs = new Set(pages.map((page) => page.slug));
  const availablePageSlugs = options.availablePageSlugs
    ? new Set(options.availablePageSlugs)
    : undefined;
  const homePage = pages.find((page) => page.isHome);
  const emittedAnchors = new Set<string>();
  for (const block of homePage?.blocks ?? []) {
    if (block.type === "about") emittedAnchors.add("about");
    if (block.type === "features" && block.heading === "How it works") emittedAnchors.add("how-it-works");
    if (block.type === "faq" && (block.items?.length ?? 0) > 0) emittedAnchors.add("faq");
  }
  const primaryAction = resolvePrimaryAction({
    siteSlug,
    industry: business.industry,
    category: business.category,
    businessType: business.businessType,
    features: {
      offerings: business.offerings,
      capabilities: resolvedCapabilities,
      built: getBuiltStorefrontFeatures(template),
      reservationsApproved: options.reservationsApproved,
    },
    builtPages: emittedSlugs,
    availablePages: options.availablePageSlugs,
    catalogAdapter,
    ...(template.id === "store" ? { catalogPageSlug: "shop", catalogActionLabelKey: "shopNow" } : {}),
  });
  // Store-only owner hero-button label: template_extras.storeHeroCta becomes
  // the action label itself, so fixed-fallback precedence (line ~1190) honors
  // it by construction. Other templates keep platform-owned fallback labels.
  const storeHeroCtaLabel = template.id === "store"
    ? (() => {
        const raw = asRecord(ctx.doc.template_extras)?.storeHeroCta;
        const text = typeof raw === "string" ? raw.trim() : "";
        return text ? text.slice(0, 60) : undefined;
      })()
    : undefined;
  const actionLabel = storeHeroCtaLabel ?? (primaryAction.primary
    ? options.primaryActionLabels?.[primaryAction.primary.labelKey] ??
      (template.id === "store" && primaryAction.primary.labelKey === "shopNow" ? options.storeCopy?.navigationLabels?.shop : undefined) ??
      (primaryAction.primary.labelKey === "viewMenu" ? options.viewMenuLabel : undefined) ??
      (primaryAction.primary.labelKey === "rentalContactCta" ? options.rentalContactCta : undefined) ??
      DEFAULT_PRIMARY_ACTION_LABELS[primaryAction.primary.labelKey]
    : undefined);
  for (const page of pages) {
    if (!page.isHome) continue;
    const hero = page.blocks.find((block) => block.type === "hero");
    if (!hero || hero.type !== "hero" || !primaryAction.primary) continue;
    const actionIsFixedFallback = ["viewMenu", "viewProducts", "shopNow", "contact", "rentalContactCta"].includes(primaryAction.primary.labelKey);
    if (actionLabel && (actionIsFixedFallback || !hero.ctaLabel || sampleFields.includes("hero.cta_primary"))) {
      hero.ctaLabel = actionLabel;
    }
    hero.ctaHref = primaryAction.primary.href;
    if (primaryAction.secondary) {
      hero.secondaryCtaLabel = options.primaryActionLabels?.[primaryAction.secondary.labelKey] ??
        DEFAULT_PRIMARY_ACTION_LABELS[primaryAction.secondary.labelKey];
      hero.secondaryCtaHref = primaryAction.secondary.href;
    } else {
      hero.secondaryCtaHref = undefined;
    }
  }

  const navLabels = asRecord(take(ctx, "nav_labels", "nav.labels"));
  const labelKeyFor = (entry: { pageSlug: string | null; anchor?: string; href?: string }): string => {
    if (entry.anchor === "how-it-works") return "how";
    if (entry.anchor) return entry.anchor;
    if (entry.pageSlug === "home") return "home";
    if (entry.pageSlug) return entry.pageSlug;
    return entry.href ?? "";
  };
  const homeSlug = template.pages.find((page) => page.isHome)?.slug ?? template.pages[0]?.slug ?? "home";
  const navLabelMap: Record<string, TemplateSourceMapEntry> = {};
  const navigation: ResolvedNavigationItem[] = template.navigation
    .filter((entry) =>
      (!entry.pageSlug || emittedSlugs.has(entry.pageSlug)) &&
      (!entry.pageSlug || !availablePageSlugs || availablePageSlugs.has(entry.pageSlug)) &&
      (!entry.anchor || emittedAnchors.has(entry.anchor)) &&
      (!entry.feature || storefrontFeatures[entry.feature])
    )
    .map((entry, index) => ({
      id: `${template.id}-nav-${index}`,
      label: asString(navLabels?.[labelKeyFor(entry)]) ??
        (template.id === "food-order" ? options.foodOrderCopy?.navigationLabels?.[labelKeyFor(entry)] : undefined) ??
        (template.id === "store" ? options.storeCopy?.navigationLabels?.[labelKeyFor(entry)] : undefined) ??
        entry.label,
      href: entry.pageSlug
        ? getSitePageHref(siteSlug, entry.pageSlug, entry.anchor)
        : resolveSiteHref(siteSlug, entry.href ?? ""),
      page_id: entry.pageSlug ? pageIdFor(template.id, entry.pageSlug) : null,
      pageSlug: entry.pageSlug,
      ...(entry.anchor ? { anchor: entry.anchor } : {}),
      target: "_self" as const,
      order: entry.order,
    }));

  navigation.forEach((item, index) => {
    const labelKey = labelKeyFor(item);
    setEntry(navLabelMap, ctx, "navigation[" + index + "].label", "nav.labels", "nav_labels", { subfield: labelKey });
    setChecklistTarget(checklistTargets, "nav.labels", homeSlug, "navigation[" + index + "].label");
  });

  const chromeSourceMap: ChromeSourceMap = { menuBar: {}, footer: {} };
  setEntry(chromeSourceMap.menuBar, ctx, "logo", "nav.logo", "logo_url");
  setChecklistTarget(checklistTargets, "nav.logo", homeSlug, "logo");
  setEntry(chromeSourceMap.menuBar, ctx, "ctaLabel", "nav.cta", "primary_cta_label");
  setChecklistTarget(checklistTargets, "nav.cta", homeSlug, "ctaLabel");
  Object.assign(chromeSourceMap.menuBar, navLabelMap);

  setEntry(chromeSourceMap.footer, ctx, "businessName", "footer.business", "business_name");
  setChecklistTarget(checklistTargets, "footer.business", homeSlug, "businessName");
  if (!isEmptyContentValue(effectiveValue(ctx, "footer_note"))) {
    setEntry(chromeSourceMap.footer, ctx, "footerNote", "footer.note", "footer_note");
    setChecklistTarget(checklistTargets, "footer.note", homeSlug, "footerNote");
  }
  const socials = asRecord(effectiveValue(ctx, "socials"));
  for (const network of ["instagram", "facebook", "tiktok", "x"] as const) {
    if (asString(socials?.[network])) {
      setEntry(chromeSourceMap.footer, ctx, "socials." + network, "footer.socials", "socials", { subfield: network });
      setChecklistTarget(checklistTargets, "footer.socials", homeSlug, "socials." + network);
    }
  }
  const footerHours = asRecord(effectiveValue(ctx, "hours"));
  let footerHasHours = false;
  for (const day of Object.keys(WEEKDAY_LABELS)) {
    if (asRecord(footerHours?.[day])) {
      setEntry(chromeSourceMap.footer, ctx, "hours." + day, "hours.table", "hours", { subfield: day });
      if (!checklistTargets["hours.table"]) {
        setChecklistTarget(checklistTargets, "hours.table", homeSlug, "hours." + day);
      }
      footerHasHours = true;
    }
  }
  if (!footerHasHours) {
    setEntry(chromeSourceMap.footer, ctx, "hours", "hours.table", "hours", { subfield: "mon" });
    setChecklistTarget(checklistTargets, "hours.table", homeSlug, "hours");
  }

  const sampledSlots = new Set<string>();
  for (const blockEntries of Object.values(sourceMap)) {
    for (const entry of Object.values(blockEntries)) if (entry.sampled) sampledSlots.add(entry.slotId);
  }
  for (const chromeEntries of [chromeSourceMap.menuBar, chromeSourceMap.footer]) {
    for (const entry of Object.values(chromeEntries)) if (entry.sampled) sampledSlots.add(entry.slotId);
  }

  return {
    templateId: template.id,
    templateVersion: template.version,
    pages,
    navigation,
    sampleFields: [...sampledSlots],
    sourceMap: options.includeSourceMap === false ? {} : sourceMap,
    chromeSourceMap: options.includeSourceMap === false
      ? { menuBar: {}, footer: {} }
      : chromeSourceMap,
    checklistTargets: options.includeSourceMap === false ? {} : checklistTargets,
    skipped,
    omittedPages,
    storefrontFeatures,
    primaryAction,
    todayHours: resolveTodayHours(effectiveValue(ctx, "hours"), options.timeZone),
  };
}

// ── Publish readiness (pure, no DB) ─────────────────────────────────────────
// A site is publishable when every REQUIRED slot has real content. Optional
// slots showing samples do NOT block publishing — they are reported in
// sampleFieldsInUse so the UI can warn, but samples never enter the saved doc
// (fill-empties-only), so publishing with placeholders only affects sections
// the owner left empty.

export interface MissingRequiredSlot {
  slotId: string;
  field: ContentKey;
  label: string;
}

export interface PublishReadiness {
  ready: boolean;
  missingRequired: MissingRequiredSlot[];
  sampleFieldsInUse: string[];
}

export function checkPublishReadiness(
  templateId: string,
  templateVersion: string,
  contentDoc: ContentDoc
): PublishReadiness {
  const template = getFlagshipTemplate(templateId, templateVersion);
  if (!template) {
    throw new Error(`Unknown flagship template: ${templateId}@${templateVersion}`);
  }
  const doc = (contentDoc ?? {}) as Record<string, unknown>;
  const samples = (FLAGSHIP_SAMPLES[template.id] ?? {}) as unknown as Record<string, unknown>;
  const sampleFields: string[] = [];
  const missingRequired: MissingRequiredSlot[] = [];
  for (const slot of template.editableSlots) {
    const live = doc[slot.field];
    if (!isEmptyContentValue(live)) continue;
    const sample = samples[slot.field];
    if (!isEmptyContentValue(sample) && !sampleFields.includes(slot.slotId)) {
      sampleFields.push(slot.slotId);
    }
    if (slot.required) {
      missingRequired.push({ slotId: slot.slotId, field: slot.field, label: slot.label });
    }
  }
  return { ready: missingRequired.length === 0, missingRequired, sampleFieldsInUse: sampleFields };
}

// ── Switch planner (pure, no DB) ────────────────────────────────────────────

function slotFieldOf(template: WebsiteTemplateV2, slotId: string): ContentKey | undefined {
  return template.editableSlots.find((slot) => slot.slotId === slotId)?.field;
}

export function planTemplateSwitch(
  currentTemplateId: string | null,
  newTemplateId: string,
  contentDoc: ContentDoc
): TemplateSwitchPlan {
  const current = currentTemplateId ? getFlagshipTemplate(currentTemplateId) : undefined;
  const next = getFlagshipTemplate(newTemplateId);
  if (!next) {
    throw new Error(`Unknown flagship template: ${newTemplateId}`);
  }
  const doc = (contentDoc ?? {}) as Record<string, unknown>;
  const nextFields = new Set(next.editableSlots.map((slot) => slot.field as string));

  const hiddenSections: string[] = [];
  if (current) {
    for (const section of current.sections) {
      if (section.chrome) continue;
      const slotIds = section.slots ?? [];
      if (slotIds.length === 0) continue;
      const hasContent = slotIds.some((slotId) => {
        const field = slotFieldOf(current, slotId);
        return field !== undefined && !isEmptyContentValue(doc[field]);
      });
      const hasNewHome = slotIds.some((slotId) => {
        const field = slotFieldOf(current, slotId);
        return field !== undefined && nextFields.has(field as string);
      });
      if (hasContent && !hasNewHome) hiddenSections.push(section.id);
    }
  }

  const newEmptySlots = next.editableSlots
    .filter((slot) => isEmptyContentValue(doc[slot.field]))
    .map((slot) => slot.slotId);

  const currentByPurpose = new Map<string, string>();
  if (current) {
    for (const section of current.sections) {
      if (!currentByPurpose.has(section.page)) {
        const page = current.pages.find((p) => p.purpose === section.page);
        if (page) currentByPurpose.set(section.page, page.slug);
      }
    }
    for (const page of current.pages) {
      if (!currentByPurpose.has(page.purpose)) currentByPurpose.set(page.purpose, page.slug);
    }
  }

  const pageMapping: SwitchPageMapping[] = next.pages.map((page) => ({
    purpose: page.purpose,
    from: currentByPurpose.get(page.purpose) ?? null,
    to: page.slug,
  }));

  const keptUnslottedKeys = Object.keys(doc).filter((key) => !nextFields.has(key));

  return {
    currentTemplateId: current?.id ?? null,
    newTemplateId: next.id,
    hiddenSections,
    newEmptySlots,
    pageMapping,
    keptUnslottedKeys,
  };
}

export function assertKnownBlockType(type: string): asserts type is BlockType {
  if (!(KNOWN_BLOCK_TYPES as readonly string[]).includes(type)) {
    throw new Error(`Unknown block type: ${type}`);
  }
}
