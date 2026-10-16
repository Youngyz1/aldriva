import { WEBSITE_CATEGORIES, type WebsiteCategory } from "./website-category";
import { NEW_SITE_GALLERY_TEMPLATES } from "./website-template-v2";

export interface V2TemplateCreateOptions {
  websiteCategory: WebsiteCategory;
  creationRequestId: string;
}

export interface V2CreationAttempt {
  key: string;
  requestId: string;
}

/** Category selects a recommendation badge; it never filters the gallery. */
export function getV2GalleryCategories(): readonly WebsiteCategory[] {
  return WEBSITE_CATEGORIES;
}

export function getV2GalleryCategoryModel(category: WebsiteCategory) {
  const templates = NEW_SITE_GALLERY_TEMPLATES;
  return {
    categories: WEBSITE_CATEGORIES,
    templates,
    empty: false,
    recommendedTemplateIds: templates
      .filter((template) => template.supportedCategories.includes(category))
      .map((template) => template.id),
  };
}

export function getV2CreateAttemptKey(
  category: WebsiteCategory,
  templateId: string
): string {
  return `${category}:${templateId}`;
}

/** Reuses the request key for retries of the same template/category attempt. */
export function getOrCreateV2CreationAttempt(
  previous: V2CreationAttempt | null,
  key: string,
  createRequestId: () => string
): V2CreationAttempt {
  return previous?.key === key
    ? previous
    : { key, requestId: createRequestId() };
}

/** Keep the organizer id in the verified action argument, never in options. */
export function getV2CreateActionArgs(
  organizerId: string,
  templateId: string,
  websiteCategory: WebsiteCategory,
  creationRequestId: string
): [string, string, V2TemplateCreateOptions] {
  return [organizerId, templateId, { websiteCategory, creationRequestId }];
}

export function mapV2TemplateCreateError(error: string | undefined): string {
  const message = error?.trim();
  if (!message) return "Failed to create website from template. Please try again.";
  if (message.startsWith("Website already exists")) {
    return "A website already exists for this organization. Open the existing website overview.";
  }
  if (message.startsWith("Forbidden:")) {
    return "Only an organization owner, admin, or manager can create a website.";
  }
  if (message.startsWith("Unauthorized:")) {
    return "Your session has expired. Sign in again to create a website.";
  }
  return message;
}

export function getV2WebsiteBuilderPath(organizerId: string): string {
  return `/dashboard/org/${encodeURIComponent(organizerId)}/website/builder`;
}

