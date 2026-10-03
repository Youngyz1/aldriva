/**
 * lib/website-category.ts
 *
 * Centralized business category vs website template family mapping (Stage C).
 *
 * Distinguishes:
 *  - Business category  : what the organizer/business actually is (source of truth: organizers.org_type + optional businesses.category)
 *  - Website category   : how the website should be presented (template family)
 *
 * A single business category can support multiple website families/templates.
 * All filtering logic is centralized here — components should not contain scattered
 * if (category === "restaurant") branches.
 */

import type { OrgType } from "./profile-modules";

// ── Website category (template family) ──────────────────────────────────────

export const WEBSITE_CATEGORIES = [
  "business",
  "restaurant",
  "retail",
  "service",
  "professional",
  "creative",
  "organization",
] as const;

export type WebsiteCategory = (typeof WEBSITE_CATEGORIES)[number];

// Legacy alias kept for backward compatibility with lib/website-templates.ts
export type WebsiteTemplateCategory = WebsiteCategory;

export function isWebsiteCategory(value: unknown): value is WebsiteCategory {
  return typeof value === "string" && (WEBSITE_CATEGORIES as readonly string[]).includes(value);
}

export function normalizeWebsiteCategory(value: unknown, fallback: WebsiteCategory = "business"): WebsiteCategory {
  if (isWebsiteCategory(value)) return value;
  if (typeof value !== "string") return fallback;
  const normalized = value.trim().toLowerCase();
  if (isWebsiteCategory(normalized)) return normalized as WebsiteCategory;
  // Handle legacy / aliases
  if (normalized === "professional-service" || normalized === "professional_service") return "professional";
  if (normalized === "nonprofit" || normalized === "non-profit") return "organization";
  if (normalized === "salon" || normalized === "barbershop" || normalized === "barber") return "service";
  return fallback;
}

// ── Business category source of truth ───────────────────────────────────────

/**
 * Business category is derived from organizers.org_type (authoritative) and
 * optionally refined by businesses.category text.
 * We do NOT create a duplicate taxonomy — we map the existing org_type.
 */
export type BusinessCategory = OrgType | string;

export function mapOrgTypeToWebsiteCategory(orgType: string | null | undefined): WebsiteCategory {
  const normalized = (orgType ?? "other").toLowerCase().trim() as OrgType;
  switch (normalized) {
    case "restaurant":
      return "restaurant";
    case "nonprofit":
      return "organization";
    case "creator":
      return "creative";
    case "business":
      return "business";
    case "church":
    case "school":
    case "community":
    case "government":
    case "sports_club":
    case "other":
    default:
      return "business";
  }
}

/**
 * Refine website category using an optional free-form businesses.category string
 * when available (e.g. "barbershop", "salon", "retail"). This is a lightweight
 * heuristic, not a full taxonomy system.
 */
export function refineWebsiteCategoryFromBusinessCategory(
  base: WebsiteCategory,
  businessCategory: string | null | undefined
): WebsiteCategory {
  if (!businessCategory) return base;
  const normalized = businessCategory.trim().toLowerCase();
  if (["barbershop", "barber", "salon", "beauty", "spa"].includes(normalized)) return "service";
  if (["retail", "boutique", "fashion", "store", "shop"].includes(normalized)) return "retail";
  if (["restaurant", "cafe", "food", "dining"].includes(normalized)) return "restaurant";
  if (["professional", "consulting", "agency", "legal", "accounting"].includes(normalized)) return "professional";
  if (["creative", "portfolio", "design", "photography", "art"].includes(normalized)) return "creative";
  if (["nonprofit", "non-profit", "charity", "organization", "ngo"].includes(normalized)) return "organization";
  return base;
}

export function resolveWebsiteCategoryForOrganizer(
  orgType: string | null | undefined,
  businessCategory?: string | null | undefined
): WebsiteCategory {
  const base = mapOrgTypeToWebsiteCategory(orgType);
  return refineWebsiteCategoryFromBusinessCategory(base, businessCategory);
}

// ── Template compatibility ──────────────────────────────────────────────────

export interface TemplateCategoryConfig {
  category?: WebsiteCategory;
  supportedCategories?: readonly WebsiteCategory[] | WebsiteCategory[];
}

/**
 * Centralized compatibility check — template declares which website categories it supports.
 * If supportedCategories is empty/undefined, template is considered universal.
 */
export function isTemplateCompatibleWithCategory(
  template: TemplateCategoryConfig,
  websiteCategory: WebsiteCategory
): boolean {
  const supported = template.supportedCategories;
  if (!supported || supported.length === 0) return true;
  return (supported as WebsiteCategory[]).includes(websiteCategory);
}

export function getCompatibleTemplates<T extends TemplateCategoryConfig>(
  templates: T[],
  websiteCategory: WebsiteCategory
): T[] {
  return templates.filter((t) => isTemplateCompatibleWithCategory(t, websiteCategory));
}

export function getIncompatibleTemplates<T extends TemplateCategoryConfig>(
  templates: T[],
  websiteCategory: WebsiteCategory
): T[] {
  return templates.filter((t) => !isTemplateCompatibleWithCategory(t, websiteCategory));
}

// Display labels (single source for UI)
export const WEBSITE_CATEGORY_LABELS: Record<WebsiteCategory, string> = {
  business: "Business",
  restaurant: "Restaurant",
  retail: "Retail",
  service: "Service",
  professional: "Professional",
  creative: "Creative",
  organization: "Organization",
};

export const WEBSITE_CATEGORY_DESCRIPTIONS: Record<WebsiteCategory, string> = {
  business: "General business",
  restaurant: "Restaurant & food",
  retail: "Retail & boutique",
  service: "Local service",
  professional: "Professional service",
  creative: "Creative & portfolio",
  organization: "Organization & nonprofit",
};
