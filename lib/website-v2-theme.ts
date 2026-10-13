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
  template: WebsiteTemplateV2
): Record<string, string> {
  const primary = template.lockedTheme.primaryColor;
  const headingFont =
    template.lockedTheme.headingFont === "serif"
      ? "Georgia, 'Times New Roman', serif"
      : "ui-sans-serif, system-ui, sans-serif";
  return {
    "--site-primary": primary,
    "--site-primary-hover": primary,
    "--site-accent": primary,
    "--site-bg": template.templateBackground.base,
    "--v2-heading-font": headingFont,
  };
}
