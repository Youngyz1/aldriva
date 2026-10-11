/**
 * lib/website-v2-theme.ts
 *
 * Public-route theming for template-first (v2 flagship) websites (Stage 4A).
 *
 * Pure helpers only: given tenant_websites.metadata, resolve the flagship
 * template and produce scoped CSS custom properties that layer on top of the
 * existing theme tokens. Old (v1) sites are untouched — every helper returns
 * undefined/{} when metadata carries no flagship template id.
 *
 * Stage 4C owns the header/footer chrome rebuild (menubar/footer bands from
 * templateBackground); until then the current SiteHeader/SiteFooter stay in
 * place and only tokens + page background apply.
 */

import type { WebsiteTemplateV2 } from "./website-template-v2";
import { getFlagshipTemplate } from "./website-template-v2";

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
  return getFlagshipTemplate(templateId);
}

/**
 * Scoped CSS variables expressing the template's locked look:
 * locked primary (+hover/accent mirrors the resolveThemeTokens convention),
 * template background base, and the locked heading-font stack (exposed as a
 * variable for the Stage 4C chrome; body stays sans).
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
