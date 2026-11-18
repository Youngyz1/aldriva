/**
 * lib/website-template-showcase.ts
 *
 * Flagship Template: Showcase (v1.0.0)
 *
 * Category-neutral flagship template designed for food, retail, and service businesses.
 * Features a clean, modern aesthetic with a fixed white base (#FAFAFA), high-contrast
 * ink (#111111), and 7 curated accent palettes.
 *
 * Layout:
 * - Home: Promos (carousel) -> Popular Picks (catalog: true, carousel) ->
 *         Trust Strip (features, trust_strip) -> Story (about, split) ->
 *         Hours & Location (contact, card)
 * - Menu/Shop: Catalog (catalog: true)
 * - Order: menu_order
 * - Reservations: reservation_form
 * - Contact: contact
 */

import {
  DEFAULT_THEME_CONFIG,
  DEFAULT_HEADER_CONFIG,
  DEFAULT_FOOTER_CONFIG,
} from "./website-nav";
import type {
  WebsiteTemplateV2,
  WebsiteTemplatePalette,
  TemplateSlot,
  TemplateSection,
} from "./website-template-v2";

export const SHOWCASE_PALETTES: readonly WebsiteTemplatePalette[] = [
  {
    id: "showcase-teal",
    label: { en: "Teal", fr: "Sarcelle" },
    base: "#FAFAFA",
    ink: "#111111",
    accent: "#0E4D4A",
    soft: "#E6F0F0",
  },
  {
    id: "showcase-forest",
    label: { en: "Forest", fr: "Forêt" },
    base: "#FAFAFA",
    ink: "#111111",
    accent: "#1B4332",
    soft: "#E8F0EC",
  },
  {
    id: "showcase-terracotta",
    label: { en: "Terracotta", fr: "Terre cuite" },
    base: "#FAFAFA",
    ink: "#111111",
    accent: "#A03E1B",
    soft: "#FBEFEA",
  },
  {
    id: "showcase-amber",
    label: { en: "Amber", fr: "Ambre" },
    base: "#FAFAFA",
    ink: "#111111",
    accent: "#9A4A0B",
    soft: "#FDF3EB",
  },
  {
    id: "showcase-indigo",
    label: { en: "Indigo", fr: "Indigo" },
    base: "#FAFAFA",
    ink: "#111111",
    accent: "#1E3A8A",
    soft: "#EDF2FB",
  },
  {
    id: "showcase-slate",
    label: { en: "Slate", fr: "Ardoise" },
    base: "#FAFAFA",
    ink: "#111111",
    accent: "#1E293B",
    soft: "#ECEFF2",
  },
  {
    id: "showcase-plum",
    label: { en: "Plum", fr: "Prune" },
    base: "#FAFAFA",
    ink: "#111111",
    accent: "#581C87",
    soft: "#F5EDFA",
  },
];

const SHOWCASE_SLOTS: TemplateSlot[] = [
  { slotId: "nav.logo", field: "logo_url", label: "Logo", kind: "image" },
  { slotId: "nav.labels", field: "nav_labels", label: "Menu bar labels", kind: "text" },
  { slotId: "nav.cta", field: "primary_cta_label", label: "Order / Shop button", kind: "text", required: true },
  { slotId: "hero.image", field: "hero_image", label: "Hero / Fallback photo", kind: "image" },
  { slotId: "hero.headline", field: "hero_headline", label: "Hero / Fallback headline", kind: "text" },
  { slotId: "hero.subtext", field: "hero_subtext", label: "Hero / Fallback subtext", kind: "textarea" },
  { slotId: "hero.cta_primary", field: "primary_cta_label", label: "Fallback button label", kind: "text" },
  {
    slotId: "catalog.source",
    field: "template_extras",
    extraKey: "catalogSource",
    label: "Catalog source",
    kind: "select",
    options: [
      { label: "Automatic", value: "auto" },
      { label: "Menu items", value: "menu" },
      { label: "Products", value: "products" },
    ],
  },
  {
    slotId: "catalog.card_action",
    field: "template_extras",
    extraKey: "cardAction",
    label: "Card action",
    kind: "select",
    options: [
      { label: "Automatic", value: "auto" },
      { label: "Quick add to order", value: "add" },
      { label: "Open detail sheet", value: "open" },
      { label: "Enquire", value: "enquire" },
    ],
  },
  {
    slotId: "contact.whatsapp",
    field: "template_extras",
    extraKey: "whatsappPhone",
    label: "WhatsApp phone",
    kind: "text",
    // E.164-style: optional leading +, then 7–15 digits.
    pattern: "^\\+?[0-9]{7,15}$",
    validationMessage: "Enter 7–15 digits with an optional leading +",
  },
  {
    slotId: "nav.mobile_tab_bar",
    field: "template_extras",
    extraKey: "mobileTabBar",
    label: "Mobile bottom tab bar",
    kind: "select",
    options: [
      { label: "On", value: "on" },
      { label: "Off", value: "off" },
    ],
  },
  {
    slotId: "promo.autoplay",
    field: "template_extras",
    extraKey: "carouselAutoplay",
    label: "Carousel autoplay",
    kind: "select",
    options: [
      { label: "On", value: "on" },
      { label: "Off", value: "off" },
    ],
  },
  {
    slotId: "promo.image_style",
    field: "template_extras",
    extraKey: "promoImageStyle",
    label: "Promotion image fit",
    kind: "select",
    options: [
      { label: "Contain", value: "contain" },
      { label: "Cover", value: "cover" },
    ],
  },
  { slotId: "catalog.featured", field: "featured", label: "Popular picks", kind: "pick", max: 6 },
  { slotId: "trust.items", field: "trust", label: "Trust points", kind: "items", max: 4 },
  { slotId: "about.caption", field: "about_caption", label: "About caption", kind: "text" },
  { slotId: "about.headline", field: "about_headline", label: "About headline", kind: "text" },
  { slotId: "about.subtitle", field: "about_subtitle", label: "About subtitle", kind: "text" },
  { slotId: "about.photo", field: "about_image", label: "About photo", kind: "image" },
  { slotId: "about.text", field: "about_text", label: "Story text", kind: "textarea" },
  { slotId: "about.stats", field: "stats", label: "Stats", kind: "items", max: 3 },
  { slotId: "hours.table", field: "hours", label: "Opening hours", kind: "hours", required: true },
  { slotId: "location.address", field: "address", label: "Address", kind: "text", required: true },
  { slotId: "location.phone", field: "phone", label: "Phone", kind: "text", required: true },
  { slotId: "location.directions", field: "directions_url", label: "Directions link", kind: "url" },
  { slotId: "contact.email", field: "email", label: "Email", kind: "text" },
  { slotId: "footer.business", field: "business_name", label: "Business name", kind: "text", required: true },
  { slotId: "footer.socials", field: "socials", label: "Social links", kind: "socials" },
  { slotId: "footer.note", field: "footer_note", label: "Footer note", kind: "text" },
];

const SHOWCASE_SECTIONS: TemplateSection[] = [
  { id: "menubar", page: "home", chrome: true, slots: ["nav.logo", "nav.labels", "nav.cta", "nav.mobile_tab_bar"] },
  {
    id: "promotions",
    page: "home",
    block: "promotions_embed",
    variant: "carousel",
    slots: ["hero.image", "hero.headline", "hero.subtext", "hero.cta_primary", "promo.autoplay", "promo.image_style"],
    note: "Promotions carousel at top of home; falls back to hero content when 0 promotions active.",
  },
  {
    id: "trust",
    page: "home",
    block: "features",
    variant: "trust_strip",
    slots: ["trust.items"],
    note: "Trust badge strip highlighting key business reassurances.",
  },
  {
    id: "picks",
    page: "home",
    catalog: true,
    variant: "carousel",
    slots: ["catalog.featured", "catalog.source", "catalog.card_action"],
    note: "Popular picks carousel resolving dynamically to menu items or products.",
  },
  {
    id: "about",
    page: "home",
    block: "about",
    variant: "split",
    slots: ["about.caption", "about.headline", "about.subtitle", "about.photo", "about.text", "about.stats"],
    note: "Split story and business background section.",
  },
  {
    id: "hours-location",
    page: "home",
    block: "contact",
    variant: "card",
    slots: ["hours.table", "location.address", "location.phone", "location.directions", "contact.whatsapp"],
    note: "Card presentation of business hours and location.",
  },
  {
    id: "catalog.full",
    page: "catalog",
    catalog: true,
    note: "Full catalog browse page resolving to menu or shop products.",
  },
  {
    id: "order.summary",
    page: "transaction",
    block: "menu_order",
    note: "Online ordering and transaction completion flow.",
  },
  {
    id: "reservation.book",
    page: "booking",
    block: "reservation_form",
    note: "Booking request form when reservations are enabled.",
  },
  {
    id: "contact.main",
    page: "contact",
    block: "contact",
    slots: ["hours.table", "location.address", "location.phone", "location.directions", "contact.email"],
  },
  {
    id: "footer",
    page: "home",
    chrome: true,
    slots: ["footer.business", "footer.socials", "footer.note", "hours.table"],
  },
];

export const SHOWCASE_TEMPLATE: WebsiteTemplateV2 = {
  id: "showcase",
  version: "1.0.0",
  name: "Showcase",
  description: "A category-neutral flagship template with a clean white base and vibrant accents.",
  localizedName: { en: "Showcase", fr: "Showcase" },
  localizedDescription: {
    en: "A category-neutral flagship template with a clean white base and vibrant accents.",
    fr: "Un modèle phare neutre avec une base blanche épurée et des accents éclatants.",
  },
  category: "service",
  style: "modern",
  previewColor: "#0E4D4A",
  supportedCategories: ["restaurant", "retail", "service"],
  mobileTabBar: true,
  theme: {
    ...DEFAULT_THEME_CONFIG,
    theme: "default",
    primaryColor: "#0E4D4A",
    fontFamily: "sans",
  },
  header: {
    ...DEFAULT_HEADER_CONFIG,
    ctaLabel: "Explore",
    ctaHref: "",
    sticky: true,
    mobileMenu: "overlay",
  },
  footer: {
    ...DEFAULT_FOOTER_CONFIG,
    showSocials: true,
    showPoweredBy: true,
  },
  lockedTheme: {
    primaryColor: "#0E4D4A",
    headingFont: "sans",
    bodyFont: "sans",
  },
  lockedLayout: true,
  templateBackground: {
    base: "#FAFAFA",
    texture: "none",
    bands: [{ zone: "footer", color: "#111111" }],
  },
  editableSlots: SHOWCASE_SLOTS,
  lockedBlocks: ["footer"],
  pages: [
    { slug: "home", title: "Home", isHome: true, sortOrder: 0, purpose: "home" },
    { slug: "menu", title: "Catalog", isHome: false, sortOrder: 1, purpose: "catalog" },
    { slug: "order", title: "Order", isHome: false, sortOrder: 2, purpose: "transaction" },
    { slug: "reservations", title: "Reservations", isHome: false, sortOrder: 3, purpose: "booking" },
    { slug: "contact", title: "Contact", isHome: false, sortOrder: 4, purpose: "contact" },
  ],
  navigation: [
    { label: "Home", pageSlug: "home", order: 0 },
    { label: "Catalog", pageSlug: "menu", order: 1, feature: "catalog" },
    { label: "Order", pageSlug: "order", order: 2, feature: "ordering" },
    { label: "Reservations", pageSlug: "reservations", order: 3, feature: "reservations" },
    { label: "Contact", pageSlug: "contact", order: 4 },
  ],
  sections: SHOWCASE_SECTIONS,
  commerce: { order: "food", buy: true },
  defaultAccentId: "showcase-teal",
  defaultPaletteId: "showcase-teal",
  palettes: SHOWCASE_PALETTES,
  sectionAlign: "left",
  legacy: true,
  tags: ["showcase", "modern", "store", "restaurant", "services"],
};
