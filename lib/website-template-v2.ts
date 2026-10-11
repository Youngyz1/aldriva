/**
 * lib/website-template-v2.ts
 *
 * Template-first flagship manifests (Stage S3).
 *
 * Fully-designed, code-owned, immutable templates. Users never add, move, or
 * remove blocks and never choose layout or colors — editing is click-on-element
 * only, driven by `editableSlots` that point at shared content field KEYS
 * (lib/website-content.ts ContentKey), never at block paths.
 *
 * The 6 v1 templates in lib/website-template-registry.ts are untouched and keep
 * working through instantiateWebsiteFromTemplate / create_website_from_template.
 * Flagship v2 templates live in a separate registry below.
 *
 * SlotId stability contract: slot ids are pinned per id@version by
 * lib/__tests__/website-template-v2.test.cjs — renames fail the test.
 */

import type { BlockType } from "./website-blocks";
import type { ContentKey } from "./website-content";
import type { WebsiteCategory } from "./website-category";
import type {
  ThemeConfig,
  HeaderConfig,
  FooterConfig,
} from "./website-nav";
import {
  DEFAULT_THEME_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_FOOTER_CONFIG,
} from "./website-nav";

// ── Slot schema ─────────────────────────────────────────────────────────────

export type TemplateSlotKind =
  | "text"
  | "textarea"
  | "image"
  | "images"
  | "items"
  | "pick"
  | "url"
  | "hours"
  | "socials";

export interface TemplateSlot {
  /** Stable within id@version (pinned by test). e.g. "hero.headline" */
  slotId: string;
  /** Shared content field key — must exist in the content key registry. */
  field: ContentKey;
  /** Human label for the click-to-edit inspector. */
  label: string;
  kind: TemplateSlotKind;
  max?: number;
  required?: boolean;
}

// ── Page purposes + sections ────────────────────────────────────────────────

export type TemplatePagePurpose = "home" | "catalog" | "transaction" | "contact";

export interface TemplateV2Page {
  slug: string;
  title: string;
  isHome: boolean;
  sortOrder: number;
  purpose: TemplatePagePurpose;
}

export interface TemplateV2NavEntry {
  label: string;
  /** Resolved page slug, or null for anchor/external entries. */
  pageSlug: string | null;
  href: string;
  order: number;
}

export interface TemplateSection {
  /** Stable within id@version (pinned by test). e.g. "hero", "menu.featured" */
  id: string;
  page: TemplatePagePurpose;
  /** Existing block type to render — skipped when absent. */
  block?: BlockType;
  /**
   * Commerce/future block that does not exist yet. Sections carrying only a
   * pendingBlock are SKIPPED by the resolver (reported, never faked).
   */
  pendingBlock?: string;
  /** Slot ids (into editableSlots) this section reads. */
  slots?: string[];
  /** Locked copy (e.g. CTA band) — rendered, never editable. */
  locked?: boolean;
  /** Site chrome (menu bar / footer) — not a block, built by the shell. */
  chrome?: boolean;
  /** Human note for template authors (e.g. why featured ids are unbound). */
  note?: string;
}

// ── Locked look ─────────────────────────────────────────────────────────────

export interface TemplateBackgroundBand {
  zone: "hero" | "section" | "footer";
  color: string;
}

export interface TemplateBackground {
  base: string;
  texture: "none" | "paper";
  bands: TemplateBackgroundBand[];
}

export interface LockedTheme {
  primaryColor: string;
  headingFont: "serif" | "sans";
  bodyFont: "sans";
}

export interface TemplateCommerce {
  order?: "food";
  booking?: "range" | "slots";
  buy?: boolean;
  /** No fleet table exists yet — rental fleet is referenced only. */
  fleet?: boolean;
}

// ── Flagship template shape ─────────────────────────────────────────────────

export interface WebsiteTemplateV2 {
  id: string;
  version: string;
  name: string;
  description: string;
  category: WebsiteCategory;
  style: "modern" | "minimal" | "bold" | "warm";
  previewColor: string;
  supportedCategories: WebsiteCategory[];
  theme: ThemeConfig;
  header: HeaderConfig;
  footer: FooterConfig;
  lockedTheme: LockedTheme;
  lockedLayout: true;
  templateBackground: TemplateBackground;
  editableSlots: TemplateSlot[];
  /** Section ids that are rendered but never editable (CTA copy, footer). */
  lockedBlocks: string[];
  pages: TemplateV2Page[];
  navigation: TemplateV2NavEntry[];
  sections: TemplateSection[];
  commerce: TemplateCommerce;
  tags?: string[];
}

// ── Restaurant: Table & Flame ───────────────────────────────────────────────

const RESTAURANT_SLOTS: TemplateSlot[] = [
  { slotId: "nav.logo", field: "logo_url", label: "Logo", kind: "image", required: true },
  { slotId: "nav.labels", field: "nav_labels", label: "Menu bar labels", kind: "text" },
  { slotId: "nav.cta", field: "primary_cta_label", label: "Order Now button", kind: "text", required: true },
  { slotId: "hero.image", field: "hero_image", label: "Hero photo", kind: "image", required: true },
  { slotId: "hero.headline", field: "hero_headline", label: "Headline", kind: "text", required: true },
  { slotId: "hero.subtext", field: "hero_subtext", label: "Subtext", kind: "textarea" },
  { slotId: "hero.tagline", field: "tagline", label: "Tagline", kind: "text" },
  { slotId: "hero.cta_primary", field: "primary_cta_label", label: "Order button label", kind: "text" },
  { slotId: "hero.cta_secondary", field: "secondary_cta_label", label: "Second button label", kind: "text" },
  { slotId: "hero.open_tag", field: "hours", label: "Open-today tag", kind: "text" },
  { slotId: "highlights.items", field: "highlights", label: "Highlight items", kind: "items", max: 3 },
  { slotId: "menu.featured", field: "featured", label: "Featured dishes", kind: "pick", max: 6 },
  { slotId: "about.photo", field: "about_image", label: "About photo", kind: "image" },
  { slotId: "about.text", field: "about_text", label: "Story text", kind: "textarea" },
  { slotId: "about.stats", field: "stats", label: "Stats", kind: "items", max: 3 },
  { slotId: "gallery.photos", field: "gallery_images", label: "Gallery photos", kind: "images", max: 6 },
  { slotId: "testimonials.items", field: "testimonials", label: "Testimonials", kind: "items", max: 3 },
  { slotId: "hours.table", field: "hours", label: "Opening hours", kind: "hours", required: true },
  { slotId: "location.address", field: "address", label: "Address", kind: "text", required: true },
  { slotId: "location.phone", field: "phone", label: "Phone", kind: "text", required: true },
  { slotId: "location.directions", field: "directions_url", label: "Directions link", kind: "url" },
  { slotId: "contact.email", field: "email", label: "Email", kind: "text" },
  { slotId: "footer.business", field: "business_name", label: "Business name", kind: "text", required: true },
  { slotId: "footer.socials", field: "socials", label: "Social links", kind: "socials" },
  { slotId: "footer.note", field: "footer_note", label: "Footer note", kind: "text" },
];

const RESTAURANT_SECTIONS: TemplateSection[] = [
  { id: "menubar", page: "home", chrome: true, slots: ["nav.logo", "nav.labels", "nav.cta"] },
  { id: "hero", page: "home", block: "hero", slots: ["hero.image", "hero.headline", "hero.subtext", "hero.tagline", "hero.cta_primary", "hero.cta_secondary", "hero.open_tag"] },
  { id: "highlights", page: "home", block: "features", slots: ["highlights.items"] },
  {
    id: "menu.featured", page: "home", block: "menu_embed", slots: ["menu.featured"],
    note: "UUID-shaped featured.menu_item_ids bind as selectedItemIds (tenant-scoped in resolveMenuEmbed); non-UUID ids are dropped.",
  },
  { id: "menu.order-buttons", page: "home", pendingBlock: "menu_order", note: "Add to Order buttons need the menu_order commerce block (not built)." },
  { id: "about", page: "home", block: "about", slots: ["about.photo", "about.text", "about.stats"] },
  { id: "gallery", page: "home", block: "gallery", slots: ["gallery.photos"] },
  { id: "testimonials", page: "home", block: "testimonials", slots: ["testimonials.items"] },
  { id: "hours-location", page: "home", block: "contact", slots: ["hours.table", "location.address", "location.phone", "location.directions"] },
  { id: "cta-band", page: "home", block: "cta_banner", locked: true, note: 'Locked copy: "Hungry? Order now."' },
  { id: "menu.full", page: "catalog", block: "menu_embed", note: "Full menu shows all sections (no featured filter)." },
  { id: "order.summary", page: "transaction", pendingBlock: "order_summary", note: "Cart-less order summary + pay needs the order_summary commerce block (not built)." },
  { id: "contact.main", page: "contact", block: "contact", slots: ["location.address", "hours.table", "location.phone", "location.directions", "contact.email"] },
  { id: "contact.form", page: "contact", pendingBlock: "contact_form", note: "Message form needs the contact_form block (not built)." },
  { id: "footer", page: "home", chrome: true, slots: ["footer.business", "footer.socials", "footer.note", "hours.table"] },
];

export const RESTAURANT_TABLE_FLAME: WebsiteTemplateV2 = {
  id: "restaurant-table-flame",
  version: "1.0.0",
  name: "Table & Flame",
  description: "Warm restaurant template with menu, ordering, and reservations.",
  category: "restaurant",
  style: "warm",
  previewColor: "#c65d3b",
  supportedCategories: ["restaurant"],
  theme: { ...DEFAULT_THEME_CONFIG, theme: "warm", primaryColor: "#c65d3b", fontFamily: "serif" },
  header: { ...DEFAULT_HEADER_CONFIG, ctaLabel: "Order Now", ctaHref: "/order", sticky: true },
  footer: { ...DEFAULT_FOOTER_CONFIG, showSocials: true, showPoweredBy: true },
  lockedTheme: { primaryColor: "#c65d3b", headingFont: "serif", bodyFont: "sans" },
  lockedLayout: true,
  templateBackground: {
    base: "#faf6ef",
    texture: "paper",
    bands: [{ zone: "footer", color: "#23211f" }],
  },
  editableSlots: RESTAURANT_SLOTS,
  lockedBlocks: ["cta-band", "footer"],
  pages: [
    { slug: "home", title: "Home", isHome: true, sortOrder: 0, purpose: "home" },
    { slug: "menu", title: "Menu", isHome: false, sortOrder: 1, purpose: "catalog" },
    { slug: "order", title: "Order", isHome: false, sortOrder: 2, purpose: "transaction" },
    { slug: "contact", title: "Contact", isHome: false, sortOrder: 3, purpose: "contact" },
  ],
  navigation: [
    { label: "Home", pageSlug: "home", href: "/", order: 0 },
    { label: "Menu", pageSlug: "menu", href: "/menu", order: 1 },
    { label: "About", pageSlug: "home", href: "/#about", order: 2 },
    { label: "Contact", pageSlug: "contact", href: "/contact", order: 3 },
  ],
  sections: RESTAURANT_SECTIONS,
  commerce: { order: "food" },
  tags: ["restaurant", "food", "menu", "ordering"],
};

// ── Car rental: DriveLine ───────────────────────────────────────────────────

const RENTAL_SLOTS: TemplateSlot[] = [
  { slotId: "nav.logo", field: "logo_url", label: "Logo", kind: "image", required: true },
  { slotId: "nav.labels", field: "nav_labels", label: "Menu bar labels", kind: "text" },
  { slotId: "nav.cta", field: "primary_cta_label", label: "Book a Car button", kind: "text", required: true },
  { slotId: "hero.image", field: "hero_image", label: "Hero photo", kind: "image", required: true },
  { slotId: "hero.headline", field: "hero_headline", label: "Headline", kind: "text", required: true },
  { slotId: "hero.tagline", field: "tagline", label: "Tagline", kind: "text" },
  { slotId: "trust.items", field: "trust", label: "Trust items", kind: "items", max: 4 },
  { slotId: "fleet.featured", field: "featured", label: "Featured cars", kind: "pick" },
  { slotId: "steps.items", field: "steps", label: "How-it-works steps", kind: "items", max: 3 },
  { slotId: "about.text", field: "about_text", label: "About text", kind: "textarea" },
  { slotId: "about.photo", field: "about_image", label: "About photo", kind: "image" },
  { slotId: "testimonials.items", field: "testimonials", label: "Testimonials", kind: "items", max: 3 },
  { slotId: "faq.items", field: "faq", label: "FAQ", kind: "items" },
  { slotId: "locations.list", field: "locations", label: "Pickup locations", kind: "items" },
  { slotId: "hours.table", field: "hours", label: "Opening hours", kind: "hours", required: true },
  { slotId: "location.phone", field: "phone", label: "Phone", kind: "text", required: true },
  { slotId: "location.directions", field: "directions_url", label: "Directions link", kind: "url" },
  { slotId: "contact.email", field: "email", label: "Email", kind: "text" },
  { slotId: "footer.business", field: "business_name", label: "Business name", kind: "text", required: true },
  { slotId: "footer.socials", field: "socials", label: "Social links", kind: "socials" },
  { slotId: "footer.note", field: "footer_note", label: "Footer note", kind: "text" },
];

const RENTAL_SECTIONS: TemplateSection[] = [
  { id: "menubar", page: "home", chrome: true, slots: ["nav.logo", "nav.labels", "nav.cta"] },
  { id: "hero", page: "home", block: "hero", slots: ["hero.image", "hero.headline", "hero.tagline"] },
  { id: "hero.booking-bar", page: "home", pendingBlock: "booking_bar", note: "Pickup/return date-range search needs the booking_bar commerce block (not built)." },
  { id: "trust", page: "home", block: "features", slots: ["trust.items"] },
  { id: "fleet.featured", page: "home", pendingBlock: "fleet_cards", note: "No fleet table exists yet; featured.vehicle_ids are stored references only." },
  { id: "how-it-works", page: "home", block: "features", slots: ["steps.items"] },
  { id: "addons", page: "home", pendingBlock: "addons_table", note: "Add-ons pricing needs the addons_table commerce block (not built)." },
  { id: "why-us", page: "home", block: "about", slots: ["about.text", "about.photo"] },
  { id: "testimonials", page: "home", block: "testimonials", slots: ["testimonials.items"] },
  { id: "faq", page: "home", block: "faq", slots: ["faq.items"] },
  { id: "locations", page: "home", block: "contact", slots: ["locations.list", "hours.table", "location.phone"] },
  { id: "cta-band", page: "home", block: "cta_banner", locked: true, note: 'Locked copy: "Ready to hit the road?"' },
  { id: "fleet.grid", page: "catalog", pendingBlock: "fleet_grid", note: "Category-filtered fleet grid needs the fleet_grid commerce block (not built)." },
  { id: "book.form", page: "transaction", pendingBlock: "booking_form", note: "Car + dates + driver + pay needs the booking_form commerce block (not built)." },
  { id: "contact.main", page: "contact", block: "contact", slots: ["locations.list", "hours.table", "location.phone", "location.directions", "contact.email"] },
  { id: "contact.form", page: "contact", pendingBlock: "contact_form", note: "Message form needs the contact_form block (not built)." },
  { id: "footer", page: "home", chrome: true, slots: ["footer.business", "footer.socials", "footer.note", "hours.table"] },
];

export const RENTAL_DRIVELINE: WebsiteTemplateV2 = {
  id: "rental-driveline",
  version: "1.0.0",
  name: "DriveLine",
  description: "Car rental template with fleet showcase and date-range booking.",
  category: "retail",
  style: "bold",
  previewColor: "#2563eb",
  supportedCategories: ["retail", "service"],
  theme: { ...DEFAULT_THEME_CONFIG, theme: "bold", primaryColor: "#2563eb", fontFamily: "sans" },
  header: { ...DEFAULT_HEADER_CONFIG, ctaLabel: "Book a Car", ctaHref: "/book", sticky: true },
  footer: { ...DEFAULT_FOOTER_CONFIG, showSocials: true, showPoweredBy: true },
  lockedTheme: { primaryColor: "#2563eb", headingFont: "sans", bodyFont: "sans" },
  lockedLayout: true,
  templateBackground: {
    base: "#f1f4f9",
    texture: "none",
    bands: [
      { zone: "hero", color: "#101c33" },
      { zone: "footer", color: "#101c33" },
    ],
  },
  editableSlots: RENTAL_SLOTS,
  lockedBlocks: ["cta-band", "footer"],
  pages: [
    { slug: "home", title: "Home", isHome: true, sortOrder: 0, purpose: "home" },
    { slug: "fleet", title: "Fleet", isHome: false, sortOrder: 1, purpose: "catalog" },
    { slug: "book", title: "Book", isHome: false, sortOrder: 2, purpose: "transaction" },
    { slug: "contact", title: "Contact", isHome: false, sortOrder: 3, purpose: "contact" },
  ],
  navigation: [
    { label: "Fleet", pageSlug: "fleet", href: "/fleet", order: 0 },
    { label: "How It Works", pageSlug: "home", href: "/#how-it-works", order: 1 },
    { label: "Pricing", pageSlug: "home", href: "/#pricing", order: 2 },
    { label: "FAQ", pageSlug: "home", href: "/#faq", order: 3 },
    { label: "Contact", pageSlug: "contact", href: "/contact", order: 4 },
  ],
  sections: RENTAL_SECTIONS,
  commerce: { booking: "range", fleet: true },
  tags: ["rental", "cars", "fleet", "booking"],
};

// ── Flagship registry ───────────────────────────────────────────────────────

export const FLAGSHIP_TEMPLATES: WebsiteTemplateV2[] = [
  RESTAURANT_TABLE_FLAME,
  RENTAL_DRIVELINE,
];

export function getFlagshipTemplate(id: string, version?: string): WebsiteTemplateV2 | undefined {
  return FLAGSHIP_TEMPLATES.find((t) => t.id === id && (!version || t.version === version));
}

export function formatFlagshipRef(template: WebsiteTemplateV2): string {
  return `${template.id}@${template.version}`;
}

export function listFlagshipSlotIds(template: WebsiteTemplateV2): string[] {
  return template.editableSlots.map((s) => s.slotId);
}

export function listFlagshipSectionIds(template: WebsiteTemplateV2): string[] {
  return template.sections.map((s) => s.id);
}
