/**
 * lib/website-v2-theme.ts
 *
 * Public-route theming for template-first (v2 flagship) websites (Stage 4B-1).
 *
 * Pure helpers only: given tenant_websites.metadata, resolve the flagship
 * template and produce scoped CSS custom properties that layer on top of the
 * existing theme tokens. Old (v1) sites are untouched — every helper returns
 * undefined/{} when metadata carries no flagship template id.
 *
 * The public route uses separate v2 header/footer components for these
 * templates; the legacy components remain the v1 path.
 */

import type { WebsiteTemplateV2 } from "./website-template-v2";
import { getFlagshipTemplate } from "./website-template-v2";
import { normalizeCurrencyCode } from "./website-blocks";
import { readableOn } from "./readable-on";
import { deriveWebsitePaletteRoles } from "./website-v2-color-resolution";

export const WEBSITE_APPEARANCE_DRAFT_EXTRA_KEY = "websiteAppearance";

export interface PublicAccentPalette {
  id: string;
  accent: string;
  hover: string;
  light: string;
  foreground: string;
}

/** Curated public-site accents. Foreground values are checked against accent fills. */
export const PUBLIC_ACCENT_PALETTES: readonly PublicAccentPalette[] = [
  { id: "mustard", accent: "#e4a81c", hover: "#805a00", light: "#fff4d6", foreground: "#241700" },
  { id: "warm-gold", accent: "#b88d2d", hover: "#72520c", light: "#f8eed8", foreground: "#201705" },
  { id: "terracotta", accent: "#c65d3b", hover: "#7c2d12", light: "#fbe9e3", foreground: "#090909" },
  { id: "blue", accent: "#2563eb", hover: "#163b8c", light: "#e8efff", foreground: "#ffffff" },
  { id: "forest", accent: "#166534", hover: "#104526", light: "#e5f3e9", foreground: "#ffffff" },
  { id: "berry", accent: "#9f1239", hover: "#70102a", light: "#fce8ef", foreground: "#ffffff" },
];

export const FUTURE_FOOD_ACCENT_ID = "mustard";
export const FUTURE_STORE_ACCENT_ID = "warm-gold";

export function getPublicAccentPalette(id: unknown): PublicAccentPalette | undefined {
  return typeof id === "string"
    ? PUBLIC_ACCENT_PALETTES.find((palette) => palette.id === id)
    : undefined;
}

function readAccentId(metadata: unknown): string | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const brand = (metadata as Record<string, unknown>).brand;
  if (!brand || typeof brand !== "object" || Array.isArray(brand)) return undefined;
  const id = (brand as Record<string, unknown>).accentId;
  return typeof id === "string" ? id : undefined;
}

function readBrandValue(metadata: unknown, key: string): unknown {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) return undefined;
  const brand = (metadata as Record<string, unknown>).brand;
  if (!brand || typeof brand !== "object" || Array.isArray(brand)) return undefined;
  return (brand as Record<string, unknown>)[key];
}

export function getWebsitePaletteId(template: WebsiteTemplateV2, metadata?: unknown): string | undefined {
  if (!template.palettes?.length) return undefined;
  const saved = readBrandValue(metadata, "paletteId");
  const fallback = template.defaultPaletteId ?? template.palettes[0].id;
  return typeof saved === "string" && template.palettes.some((palette) => palette.id === saved)
    ? saved
    : fallback;
}

export function getWebsiteBackgroundPattern(template: WebsiteTemplateV2, metadata?: unknown): "none" | "dots" {
  if (!template.patterns?.length) return "none";
  const saved = readBrandValue(metadata, "backgroundPattern");
  return typeof saved === "string" && template.patterns.some((pattern) => pattern.id === saved)
    ? saved as "none" | "dots"
    : "none";
}

function toRgbChannels(color: string): string {
  const value = color.startsWith("#") ? color.slice(1) : color;
  const full = value.length === 3 ? value.split("").map((digit) => digit + digit).join("") : value;
  return [0, 2, 4].map((offset) => Number.parseInt(full.slice(offset, offset + 2), 16)).join(", ");
}

/**
 * Resolves the flagship template for a website from its metadata row value.
 * Returns undefined for v1 sites, template-less sites, and unknown ids.
 */
export function getV2TemplateForWebsite(
  metadata: unknown
): WebsiteTemplateV2 | undefined {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return undefined;
  }
  const templateId = (metadata as Record<string, unknown>).templateId;
  if (typeof templateId !== "string" || templateId.length === 0) {
    return undefined;
  }
  const version = (metadata as Record<string, unknown>).templateVersion;
  return getFlagshipTemplate(templateId, typeof version === "string" ? version : undefined);
}

/**
 * Resolves the price display currency for a storefront site.
 *
 * Precedence: explicit `metadata.storefront.currency` (set at creation for
 * new restaurant sites, editable later in Site settings) wins; otherwise
 * businesses located in Côte d'Ivoire fall back to XOF; everything else keeps
 * the USD default so existing sites render exactly as before.
 */
export function resolveStorefrontCurrency(
  metadata: unknown,
  businessCountry?: string | null
): string {
  if (metadata && typeof metadata === "object" && !Array.isArray(metadata)) {
    const storefront = (metadata as Record<string, unknown>).storefront;
    if (storefront && typeof storefront === "object" && !Array.isArray(storefront)) {
      const explicit = normalizeCurrencyCode((storefront as Record<string, unknown>).currency);
      if (explicit) return explicit;
    }
  }
  if (typeof businessCountry === "string") {
    const normalized = businessCountry
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .trim()
      .toLowerCase();
    if (normalized === "cote d'ivoire" || normalized === "ivory coast" || normalized === "ci") {
      return "XOF";
    }
  }
  return "USD";
}

/**
 * Scoped CSS variables expressing the template's locked look:
 * locked primary (+hover/accent mirrors the resolveThemeTokens convention),
 * template background base, and the locked heading-font stack.
 */
export function v2ThemeStyle(
  template: WebsiteTemplateV2,
  metadata?: unknown
): Record<string, string> {
  const paletteId = getWebsitePaletteId(template, metadata);
  const declaredPalette = paletteId
    ? template.palettes?.find((entry) => entry.id === paletteId)
    : undefined;
  const accentId = readAccentId(metadata) ?? template.defaultAccentId;
  const accentPalette = getPublicAccentPalette(accentId);
  const hasExplicitPaletteChoice = typeof readBrandValue(metadata, "paletteId") === "string" &&
    template.palettes?.some((entry) => entry.id === readBrandValue(metadata, "paletteId"));
  // Keep existing public accent choices working for older Table & Flame sites
  // until the owner chooses one of the new full palettes in the builder.
  const legacyAccentOverride = Boolean(
    declaredPalette && !hasExplicitPaletteChoice && readAccentId(metadata) && accentPalette
  );
  const palette = declaredPalette && legacyAccentOverride && accentPalette
    ? { ...declaredPalette, accent: accentPalette.accent }
    : declaredPalette;
  const derivedRoles = palette ? deriveWebsitePaletteRoles(palette) : undefined;
  const roles = derivedRoles && legacyAccentOverride && accentPalette
    ? {
        ...derivedRoles,
        accentDeep: readableOn(palette!.base, [accentPalette.hover, derivedRoles.accentDeep, palette!.ink]),
        accentLight: accentPalette.light,
      }
    : derivedRoles;
  const primary = roles?.accent ?? accentPalette?.accent ?? template.lockedTheme.primaryColor;
  const hover = roles?.accentDeep ?? accentPalette?.hover ?? primary;
  const light = roles?.accentLight ?? accentPalette?.light ?? "#fbe9e3";
  const isTableFlame = template.id === "restaurant-table-flame";
  const foreground = roles?.onAccent ?? (isTableFlame ? readableOn(primary, ["#090909", "#faf6ef"]) : accentPalette?.foreground ?? "#ffffff");
  const headingFont = isTableFlame
    ? "var(--font-fraunces), Georgia, 'Times New Roman', serif"
    : template.lockedTheme.headingFont === "serif"
      ? "Georgia, 'Times New Roman', serif"
      : "var(--font-sans), Arial, Helvetica, sans-serif";
  return {
    "--site-primary": primary,
    "--site-primary-hover": hover,
    "--site-primary-light": light,
    "--site-accent": primary,
    "--site-bg": roles?.base ?? template.templateBackground.base,
    "--v2-heading-font": headingFont,
    "--ps-accent": primary,
    "--ps-accent-hover": hover,
    "--ps-accent-light": light,
    "--ps-accent-foreground": foreground,
    ...(roles ? {
      "--tf-base": roles.base,
      "--tf-subtle": roles.subtle,
      "--tf-ink": roles.ink,
      "--tf-muted": roles.muted,
      "--tf-border": roles.border,
      "--tf-accent": roles.accent,
      "--tf-accent-deep": roles.accentDeep,
      "--tf-on-accent": roles.onAccent,
      "--tf-on-ink": roles.onInk,
      "--tf-band": roles.band,
      "--tf-scrim": roles.scrim,
      "--tf-scrim-rgb": toRgbChannels(roles.scrim),
      "--tf-on-base": roles.onBase,
      "--tf-on-header": roles.onHeader,
      "--tf-on-band": roles.onBand,
      "--tf-on-footer": roles.onFooter,
      "--tf-on-scrim": roles.onScrim,
      "--tf-hairline": roles.hairline,
      "--tf-header-border": roles.headerBorder,
      "--tf-menu-leader": roles.menuLeader,
      "--tf-dot": roles.dot,
      "--tf-dot-background": roles.dotBackground,
      "--ps-text": roles.ink,
      "--ps-muted": roles.muted,
      "--ps-surface": roles.base,
      "--ps-cream": roles.base,
      "--ps-neutral": roles.subtle,
      "--ps-border": roles.border,
      "--ps-card-radius": "12px",
      "--ps-card-shadow": "none",
      "--ps-card-border": `1px solid ${roles.border}`,
    } : {}),
  };
}
