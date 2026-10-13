/**
 * lib/website-commerce-registry.ts
 *
 * Category-agnostic registry for domain-specific commerce/inventory managers
 * embedded inside the website builder.
 *
 * Restaurant -> menu editor.
 * Adding future verticals (e.g. rental -> fleet editor, services -> appointment editor)
 * is a single registry entry.
 */

import type { WebsiteCategory } from "./website-category";

export type BuilderCommerceEditorKind = "menu" | "fleet" | "services" | "products";

export interface BuilderCommerceCapability {
  kind: BuilderCommerceEditorKind;
  category: WebsiteCategory;
  titleKey: string;
  manageButtonKey: string;
}

export const BUILDER_COMMERCE_REGISTRY: Partial<Record<WebsiteCategory, BuilderCommerceCapability>> = {
  restaurant: {
    kind: "menu",
    category: "restaurant",
    titleKey: "manageFullMenu",
    manageButtonKey: "manageFullMenu",
  },
};

export function getBuilderCommerceCapability(
  category?: string | null
): BuilderCommerceCapability | null {
  if (!category) return null;
  return BUILDER_COMMERCE_REGISTRY[category as WebsiteCategory] ?? null;
}
