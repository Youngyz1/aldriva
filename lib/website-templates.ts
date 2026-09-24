/**
 * lib/website-templates.ts
 *
 * Backward-compatibility shim — Stage A migration.
 * Canonical registry lives in lib/website-template-registry.ts.
 * This file re-exports legacy shapes so existing imports keep working.
 */

import type { Block } from "./website-blocks";
import type { WebsiteCategory } from "./website-category";
import {
  TEMPLATE_REGISTRY,
  type CanonicalTemplate,
  getTemplateById as getCanonicalById,
} from "./website-template-registry";

export type WebsiteTemplateCategory = WebsiteCategory;

export type WebsiteTemplateStyle = CanonicalTemplate["style"];

export type WebsiteTemplate = {
  id: string;
  name: string;
  description: string;
  category: WebsiteTemplateCategory;
  style: WebsiteTemplateStyle;
  previewColor: string;
  defaultBlocks: Block[];
  /** New fields for callers that need version-aware data */
  version?: string;
  canonical?: CanonicalTemplate;
};

/**
 * Legacy array — derived from canonical registry's home page blocks.
 * Preserved for backward compatibility; new code should use TEMPLATE_REGISTRY directly.
 */
export const WEBSITE_TEMPLATES: WebsiteTemplate[] = TEMPLATE_REGISTRY.map((t) => ({
  id: t.id,
  name: t.name,
  description: t.description,
  category: t.category,
  style: t.style,
  previewColor: t.previewColor,
  defaultBlocks: t.pages.find((p) => p.isHome)?.blocks ?? t.pages[0]?.blocks ?? [],
  version: t.version,
  canonical: t,
}));

export function getTemplateById(id: string): WebsiteTemplate | undefined {
  const canonical = getCanonicalById(id);
  if (!canonical) return undefined;
  return WEBSITE_TEMPLATES.find((t) => t.id === id);
}

export function getTemplatesByCategory(category: WebsiteTemplateCategory): WebsiteTemplate[] {
  return WEBSITE_TEMPLATES.filter((t) => t.category === category);
}

// Re-export canonical helpers for new code that imports via this path
export { TEMPLATE_REGISTRY as CANONICAL_TEMPLATES } from "./website-template-registry";
export type { CanonicalTemplate } from "./website-template-registry";
