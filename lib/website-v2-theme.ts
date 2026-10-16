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
  const accentId = readAccentId(metadata) ?? template.defaultAccentId;
  const palette = getPublicAccentPalette(accentId);
  const primary = palette?.accent ?? template.lockedTheme.primaryColor;
  const hover = palette?.hover ?? primary;
  const light = palette?.light ?? "#fbe9e3";
  const foreground = palette?.foreground ?? "#ffffff";
  const headingFont =
    template.lockedTheme.headingFont === "serif"
      ? "Georgia, 'Times New Roman', serif"
      : "var(--font-sans), Arial, Helvetica, sans-serif";
  return {
    "--site-primary": primary,
    "--site-primary-hover": hover,
    "--site-primary-light": light,
    "--site-accent": primary,
    "--site-bg": template.templateBackground.base,
    "--v2-heading-font": headingFont,
    "--ps-accent": primary,
    "--ps-accent-hover": hover,
    "--ps-accent-light": light,
    "--ps-accent-foreground": foreground,
  };
}
