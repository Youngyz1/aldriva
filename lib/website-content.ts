/**
 * lib/website-content.ts
 *
 * Template-first shared content store (Stage S2).
 *
 * One JSONB document per website, independent of any template. Template slots
 * point at content field keys declared here — never at block paths. Catalogs
 * (menu, services, fleet, products) stay in their own tables; this document
 * stores featured ids only.
 *
 * Samples/placeholders are render-only and must NEVER be representable here:
 * normalizeContent() keeps unknown keys out (extras overflow is explicit and
 * capped), and there is no `isSample` / `sampleFields` marker on this shape.
 * (Sample-merge doctrine: lib/invitation-template-preview-data.ts.)
 */

import { sanitizeUrl } from "./sanitize-html";
import { safeImageSrc } from "./image-url";
import { BLOCK_LIMITS } from "./website-blocks";
import { isValidWebsiteTime } from "./website-hours";

// ── 1. Key registries ───────────────────────────────────────────────────────

export const SHARED_CONTENT_KEYS = [
  "business_name",
  "logo_url",
  "tagline",
  "hero_image",
  "hero_headline",
  "hero_subtext",
  "primary_cta_label",
  "about_text",
  "about_image",
  "gallery_images",
  "testimonials",
  "faq",
  "hours",
  "address",
  "phone",
  "email",
  "directions_url",
  "socials",
  "nav_labels",
  "footer_note",
] as const;

export type SharedContentKey = (typeof SHARED_CONTENT_KEYS)[number];

export const OPTIONAL_CONTENT_KEYS = [
  "secondary_cta_label",
  "stats",
  "highlights",
  "trust",
  "steps",
  "addons",
  "locations",
  "featured",
  "enabled_sections",
  "template_extras",
] as const;

export type OptionalContentKey = (typeof OPTIONAL_CONTENT_KEYS)[number];

export type ContentKey = SharedContentKey | OptionalContentKey;

/** Max template-specific extra keys per template (launch cap). */
export const MAX_TEMPLATE_EXTRAS = 10;

/** Hard cap on the serialized document (bytes, UTF-8 approx via length). */
export const MAX_CONTENT_DOC_CHARS = 100_000;

/** Keys that must never appear — prototype pollution guard. */
const FORBIDDEN_KEYS = new Set(["__proto__", "prototype", "constructor"]);

// ── 2. Document types ───────────────────────────────────────────────────────

export interface ContentTestimonial {
  quote: string;
  author?: string;
  role?: string;
  avatar?: string;
}

export interface ContentFaqItem {
  question: string;
  answer: string;
}

export interface ContentDayHours {
  open?: string;
  close?: string;
  closed?: boolean;
}

export interface ContentHours {
  mon?: ContentDayHours;
  tue?: ContentDayHours;
  wed?: ContentDayHours;
  thu?: ContentDayHours;
  fri?: ContentDayHours;
  sat?: ContentDayHours;
  sun?: ContentDayHours;
  today_tag?: string;
}

export interface ContentSocials {
  instagram?: string;
  facebook?: string;
  tiktok?: string;
  x?: string;
}

export interface ContentFeatured {
  menu_item_ids?: string[];
  vehicle_ids?: string[];
}

export type ContentDoc = Partial<
  Record<SharedContentKey | Exclude<OptionalContentKey, "template_extras">, unknown> & {
    template_extras: Record<string, unknown>;
  }
>;

// ── 3. Normalization ────────────────────────────────────────────────────────

function isPlainObject(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function clampText(value: unknown, max: number): string | undefined {
  if (typeof value !== "string") return undefined;
  const trimmed = value.trim();
  if (!trimmed) return undefined;
  return trimmed.slice(0, max);
}

function clampUrl(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = sanitizeUrl(value.trim());
  if (!clean) return undefined;
  return clean.slice(0, BLOCK_LIMITS.URL_MAX_LENGTH);
}

function clampImage(value: unknown): string | undefined {
  if (typeof value !== "string") return undefined;
  const clean = safeImageSrc(value.trim());
  if (!clean) return undefined;
  return clean.slice(0, BLOCK_LIMITS.URL_MAX_LENGTH);
}

function clampStringArray(value: unknown, maxItems: number, maxLen: number): string[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: string[] = [];
  for (const entry of value) {
    if (typeof entry !== "string") continue;
    const trimmed = entry.trim();
    if (!trimmed) continue;
    out.push(trimmed.slice(0, maxLen));
    if (out.length >= maxItems) break;
  }
  return out.length > 0 ? out : undefined;
}

function normalizeTestimonials(value: unknown): ContentTestimonial[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ContentTestimonial[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const quote = clampText(entry.quote, BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH);
    if (!quote) continue;
    const item: ContentTestimonial = { quote };
    const author = clampText(entry.author, BLOCK_LIMITS.LABEL_MAX_LENGTH);
    if (author) item.author = author;
    const role = clampText(entry.role, BLOCK_LIMITS.LABEL_MAX_LENGTH);
    if (role) item.role = role;
    const avatar = clampImage(entry.avatar);
    if (avatar) item.avatar = avatar;
    out.push(item);
    if (out.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) break;
  }
  return out.length > 0 ? out : undefined;
}

function normalizeFaq(value: unknown): ContentFaqItem[] | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: ContentFaqItem[] = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const question = clampText(entry.question, BLOCK_LIMITS.HEADING_MAX_LENGTH);
    const answer = clampText(entry.answer, BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH);
    if (!question || !answer) continue;
    out.push({ question, answer });
    if (out.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) break;
  }
  return out.length > 0 ? out : undefined;
}

function normalizeHours(value: unknown): ContentHours | undefined {
  if (!isPlainObject(value)) return undefined;
  const days = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"] as const;
  const out: ContentHours = {};
  let filled = false;
  for (const day of days) {
    const raw = value[day];
    if (!isPlainObject(raw)) continue;
    const slot: ContentDayHours = {};
    if (raw.closed === true) {
      slot.closed = true;
      filled = true;
    } else {
      const open = raw.open;
      const close = raw.close;
      if (isValidWebsiteTime(open) && isValidWebsiteTime(close)) {
        slot.open = open;
        slot.close = close;
        filled = true;
      }
    }
    if (Object.keys(slot).length > 0) out[day] = slot;
  }
  const tag = clampText(value.today_tag, BLOCK_LIMITS.LABEL_MAX_LENGTH);
  if (tag) {
    out.today_tag = tag;
    filled = true;
  }
  return filled ? out : undefined;
}

function normalizeSocials(value: unknown): ContentSocials | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: ContentSocials = {};
  let filled = false;
  for (const network of ["instagram", "facebook", "tiktok", "x"] as const) {
    const url = clampUrl(value[network]);
    if (url) {
      out[network] = url;
      filled = true;
    }
  }
  return filled ? out : undefined;
}

function normalizeNavLabels(value: unknown): Record<string, string> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, string> = {};
  for (const [key, raw] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (typeof raw !== "string") continue;
    const label = raw.trim().slice(0, BLOCK_LIMITS.LABEL_MAX_LENGTH);
    if (label) out[key] = label;
    if (Object.keys(out).length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) break;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

function normalizeKeyedItems(
  value: unknown,
  textMax: number
): Array<Record<string, unknown>> | undefined {
  if (!Array.isArray(value)) return undefined;
  const out: Array<Record<string, unknown>> = [];
  for (const entry of value) {
    if (!isPlainObject(entry)) continue;
    const item: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(entry)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed) item[key] = trimmed.slice(0, textMax);
      } else if (typeof raw === "number" || typeof raw === "boolean") {
        item[key] = raw;
      }
    }
    if (Object.keys(item).length > 0) out.push(item);
    if (out.length >= BLOCK_LIMITS.MAX_ARRAY_ITEMS) break;
  }
  return out.length > 0 ? out : undefined;
}

const STABLE_SECTION_ID_PATTERN = /^[a-z0-9._-]+$/;
export const MAX_ENABLED_SECTIONS_KEYS = 20;

export function normalizeEnabledSections(value: unknown): Record<string, boolean> | undefined {
  if (!isPlainObject(value)) return undefined;
  const out: Record<string, boolean> = {};
  for (const [key, val] of Object.entries(value)) {
    if (FORBIDDEN_KEYS.has(key)) continue;
    if (typeof val !== "boolean") continue;
    if (!STABLE_SECTION_ID_PATTERN.test(key)) continue;
    out[key] = val;
    if (Object.keys(out).length >= MAX_ENABLED_SECTIONS_KEYS) break;
  }
  return Object.keys(out).length > 0 ? out : undefined;
}

/**
 * Normalizes an untrusted content payload into a ContentDoc.
 * - Drops unknown top-level keys (except into template_extras, capped).
 * - Rejects __proto__/constructor/prototype keys at every level.
 * - Enforces BLOCK_LIMITS size caps; sanitizes URLs/images via the single
 *   sanitizeUrl()/safeImageSrc() layer (no parallel regex).
 * - Never throws on bad input; returns {} for non-objects.
 */
export function normalizeContent(input: unknown): ContentDoc {
  if (!isPlainObject(input)) return {};
  const out: ContentDoc = {};

  const text = (v: unknown, max: number) => clampText(v, max);
  const businessName = text(input.business_name, BLOCK_LIMITS.HEADING_MAX_LENGTH);
  if (businessName) out.business_name = businessName;
  const tagline = text(input.tagline, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH);
  if (tagline) out.tagline = tagline;
  const heroHeadline = text(input.hero_headline, BLOCK_LIMITS.HEADING_MAX_LENGTH);
  if (heroHeadline) out.hero_headline = heroHeadline;
  const heroSubtext = text(input.hero_subtext, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH);
  if (heroSubtext) out.hero_subtext = heroSubtext;
  const primaryCta = text(input.primary_cta_label, BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH);
  if (primaryCta) out.primary_cta_label = primaryCta;
  const secondaryCta = text(input.secondary_cta_label, BLOCK_LIMITS.CTA_LABEL_MAX_LENGTH);
  if (secondaryCta) out.secondary_cta_label = secondaryCta;
  const aboutText = text(input.about_text, BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH);
  if (aboutText) out.about_text = aboutText;
  const address = text(input.address, BLOCK_LIMITS.ADDRESS_MAX_LENGTH);
  if (address) out.address = address;
  const phone = text(input.phone, BLOCK_LIMITS.PHONE_MAX_LENGTH);
  if (phone) out.phone = phone;
  const email = text(input.email, BLOCK_LIMITS.EMAIL_MAX_LENGTH);
  if (email) out.email = email;
  const footerNote = text(input.footer_note, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH);
  if (footerNote) out.footer_note = footerNote;

  const logo = clampImage(input.logo_url);
  if (logo) out.logo_url = logo;
  const heroImage = clampImage(input.hero_image);
  if (heroImage) out.hero_image = heroImage;
  const aboutImage = clampImage(input.about_image);
  if (aboutImage) out.about_image = aboutImage;
  const directions = clampUrl(input.directions_url);
  if (directions) out.directions_url = directions;

  const gallery = clampStringArray(
    input.gallery_images,
    6,
    BLOCK_LIMITS.URL_MAX_LENGTH
  )
    ?.map((src) => safeImageSrc(src))
    .filter((src): src is string => !!src);
  if (gallery && gallery.length > 0) out.gallery_images = gallery;

  const testimonials = normalizeTestimonials(input.testimonials);
  if (testimonials) out.testimonials = testimonials;
  const faq = normalizeFaq(input.faq);
  if (faq) out.faq = faq;
  const hours = normalizeHours(input.hours);
  if (hours) out.hours = hours;
  const socials = normalizeSocials(input.socials);
  if (socials) out.socials = socials;
  const navLabels = normalizeNavLabels(input.nav_labels);
  if (navLabels) out.nav_labels = navLabels;

  const stats = normalizeKeyedItems(input.stats, BLOCK_LIMITS.LABEL_MAX_LENGTH)?.slice(0, 3);
  if (stats) out.stats = stats;
  const highlights = normalizeKeyedItems(input.highlights, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH)?.slice(0, 3);
  if (highlights) out.highlights = highlights;
  const trust = normalizeKeyedItems(input.trust, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH)?.slice(0, 4);
  if (trust) out.trust = trust;
  const steps = normalizeKeyedItems(input.steps, BLOCK_LIMITS.SUBHEADING_MAX_LENGTH)?.slice(0, 3);
  if (steps) out.steps = steps;
  const addons = normalizeKeyedItems(input.addons, BLOCK_LIMITS.LABEL_MAX_LENGTH);
  if (addons) out.addons = addons;
  const locations = normalizeKeyedItems(input.locations, BLOCK_LIMITS.ADDRESS_MAX_LENGTH);
  if (locations) out.locations = locations;

  if (isPlainObject(input.featured)) {
    const featured: ContentFeatured = {};
    const menuIds = clampStringArray(
      input.featured.menu_item_ids,
      BLOCK_LIMITS.MAX_ARRAY_ITEMS,
      64
    );
    if (menuIds) featured.menu_item_ids = menuIds;
    const vehicleIds = clampStringArray(
      input.featured.vehicle_ids,
      BLOCK_LIMITS.MAX_ARRAY_ITEMS,
      64
    );
    if (vehicleIds) featured.vehicle_ids = vehicleIds;
    if (Object.keys(featured).length > 0) out.featured = featured;
  }

  const enabledSections = normalizeEnabledSections(input.enabled_sections);
  if (enabledSections) out.enabled_sections = enabledSections;

  if (isPlainObject(input.template_extras)) {
    const extras: Record<string, unknown> = {};
    for (const [key, raw] of Object.entries(input.template_extras)) {
      if (FORBIDDEN_KEYS.has(key)) continue;
      if (Object.keys(extras).length >= MAX_TEMPLATE_EXTRAS) break;
      if (typeof raw === "string") {
        const trimmed = raw.trim();
        if (trimmed) extras[key] = trimmed.slice(0, BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH);
      } else if (typeof raw === "number" || typeof raw === "boolean") {
        extras[key] = raw;
      } else if (isPlainObject(raw)) {
        const nested: Record<string, unknown> = {};
        for (const [nkey, nraw] of Object.entries(raw)) {
          if (FORBIDDEN_KEYS.has(nkey)) continue;
          if (typeof nraw === "string") {
            const trimmed = nraw.trim();
            if (trimmed) nested[nkey] = trimmed.slice(0, BLOCK_LIMITS.BODY_TEXT_MAX_LENGTH);
          } else if (typeof nraw === "number" || typeof nraw === "boolean") {
            nested[nkey] = nraw;
          }
        }
        if (Object.keys(nested).length > 0) extras[key] = nested;
      }
    }
    if (Object.keys(extras).length > 0) out.template_extras = extras;
  }

  return out;
}

/** True when every top-level key is a known shared/optional key. */
export function isKnownContentKey(key: string): key is ContentKey {
  return (
    (SHARED_CONTENT_KEYS as readonly string[]).includes(key) ||
    (OPTIONAL_CONTENT_KEYS as readonly string[]).includes(key)
  );
}
