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
  KNOWN_BLOCK_TYPES,
} from "./website-blocks";
import type { ContentDoc, ContentKey } from "./website-content";
import type { NavigationItem } from "./website-nav";
import type {
  WebsiteTemplateV2,
  TemplateSection,
} from "./website-template-v2";
import { getFlagshipTemplate } from "./website-template-v2";
import { FLAGSHIP_SAMPLES } from "./website-template-samples";
import type { TemplatePagePurpose } from "./website-template-v2";

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
}

export interface ResolvedTemplate {
  templateId: string;
  templateVersion: string;
  pages: ResolvedPage[];
  navigation: ResolvedNavigationItem[];
  sampleFields: string[];
  skipped: SkippedSection[];
  /**
   * Pages from the manifest that produced zero renderable blocks (all
   * sections pendingBlock or chrome). Omitted from pages AND navigation so
   * they never publish blank; the manifest keeps them, so they reappear
   * automatically once their pendingBlock becomes a real block type.
   */
  omittedPages: OmittedPage[];
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
  sampleFields: string[]
): SlotTake {
  const live = (doc as Record<string, unknown>)[field];
  if (!isEmptyContentValue(live)) return { value: live, sampled: false };
  const sample = (samples as Record<string, unknown>)[field];
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
}

function take(ctx: BuildContext, field: ContentKey, slotId: string): unknown {
  return takeSlot(ctx.doc, ctx.samples, field, slotId, ctx.sampleFields).value;
}

function buildHero(ctx: BuildContext): Block {
  const isRestaurant = ctx.template.id === "restaurant-table-flame";
  const hours = asRecord(take(ctx, "hours", "hero.open_tag") ?? take(ctx, "hours", "hours.table"));
  const badge = hours ? asString(hours.today_tag) : undefined;
  return {
    type: "hero",
    variant: "split",
    align: "left",
    heading: asString(take(ctx, "hero_headline", "hero.headline")),
    subheading: asString(take(ctx, "hero_subtext", "hero.subtext")),
    backgroundImage: asString(take(ctx, "hero_image", "hero.image")),
    ctaLabel: asString(take(ctx, "primary_cta_label", "hero.cta_primary")),
    ctaHref: isRestaurant ? "/order" : "/book",
    secondaryCtaLabel:
      asString(take(ctx, "secondary_cta_label", "hero.cta_secondary")) ??
      (isRestaurant ? "View Menu" : undefined),
    secondaryCtaHref: isRestaurant ? "/menu" : undefined,
    ...(badge ? { badge } : {}),
  } as Block;
}

function buildFeatureItems(value: unknown): Array<{ title: string; description?: string }> {
  const rows = asRecordArray(value) ?? [];
  const out: Array<{ title: string; description?: string }> = [];
  for (const row of rows) {
    const title = recordText(row, ["title", "label", "name"]);
    if (!title) continue;
    const description = recordText(row, ["description", "value", "text"]) || undefined;
    out.push(description ? { title, description } : { title });
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

function buildAbout(ctx: BuildContext): Block {
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
    story: asString(take(ctx, "about_text", "about.text")),
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
  const heading =
    ctx.template.id === "restaurant-table-flame" ? "Hungry? Order now." : "Ready to hit the road?";
  return {
    type: "cta_banner",
    heading,
    variant: "brand",
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
    ...(selectedItemIds ? { selectedItemIds } : {}),
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
      if (section.id === "trust") return buildFeatures(ctx, section, "trust", "trust.items", 4, "Why DriveLine");
      if (section.id === "how-it-works") return buildFeatures(ctx, section, "steps", "steps.items", 3, "How it works");
      return buildFeatures(ctx, section, "highlights", "highlights.items", 3);
    }
    case "about":
      return buildAbout(ctx);
    case "gallery":
      return buildGallery(ctx);
    case "testimonials":
      return buildTestimonials(ctx);
    case "contact": {
      const heading = section.id === "locations" ? "Pickup locations" : "Visit us";
      return buildContact(ctx, heading);
    }
    case "faq":
      return buildFaq(ctx);
    case "cta_banner":
      return buildCtaBand(ctx);
    case "menu_embed": {
      const heading = section.id === "menu.full" ? "Our full menu" : "Featured dishes";
      return buildMenuEmbed(ctx, heading, section.id === "menu.full" ? 12 : 6, section.id !== "menu.full");
    }
    default:
      return null;
  }
}

// ── Resolver ────────────────────────────────────────────────────────────────

function pageIdFor(templateId: string, slug: string): string {
  return `${templateId}--${slug}`;
}

export function resolveTemplateContent(
  templateId: string,
  templateVersion: string,
  contentDoc: ContentDoc
): ResolvedTemplate {
  const template = getFlagshipTemplate(templateId, templateVersion);
  if (!template) {
    throw new Error(`Unknown flagship template: ${templateId}@${templateVersion}`);
  }
  return resolveTemplateManifest(template, contentDoc);
}

/**
 * Resolver core over an explicit manifest object (exported for tests: a test
 * double that "implements" a pendingBlock proves the page comes back).
 */
export function resolveTemplateManifest(
  template: WebsiteTemplateV2,
  contentDoc: ContentDoc
): ResolvedTemplate {
  // Deep-clone: the input doc is never mutated (pinned by test).
  const doc = JSON.parse(JSON.stringify(contentDoc ?? {})) as Record<string, unknown>;
  const samples = (FLAGSHIP_SAMPLES[template.id] ?? {}) as unknown as Record<string, unknown>;

  const sampleFields: string[] = [];
  const skipped: SkippedSection[] = [];
  const omittedPages: OmittedPage[] = [];
  const ctx: BuildContext = { template, doc, samples: samples as ContentDoc, sampleFields };

  const pages: ResolvedPage[] = [];
  for (const page of template.pages) {
    const rawBlocks: Block[] = [];
    const pendingNames: string[] = [];
    for (const section of template.sections) {
      if (section.page !== page.purpose) continue;
      if (section.chrome) continue;
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
      if (block) rawBlocks.push(block);
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
    const blocks = normalizeBlocks(rawBlocks);
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
  const navigation: ResolvedNavigationItem[] = template.navigation
    .filter((entry) => !entry.pageSlug || emittedSlugs.has(entry.pageSlug))
    .map((entry, index) => ({
      id: `${template.id}-nav-${index}`,
      label: entry.label,
      href: entry.href,
      page_id: entry.pageSlug ? pageIdFor(template.id, entry.pageSlug) : null,
      pageSlug: entry.pageSlug,
      target: "_self" as const,
      order: entry.order,
    }));

  return {
    templateId: template.id,
    templateVersion: template.version,
    pages,
    navigation,
    sampleFields: [...sampleFields],
    skipped,
    omittedPages,
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
