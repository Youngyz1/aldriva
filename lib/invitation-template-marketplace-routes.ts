/**
 * Single source of truth for the public marketplace's route shapes, so the
 * gallery, details, and (future Phase 4/5) pages agree on exactly how a
 * template id is carried across navigation. Pure, no framework imports.
 */
import type { InvitationTemplateCategory } from "@/lib/invitation-template-registry";

export function getInvitationTemplateGalleryHref(category?: InvitationTemplateCategory | null): string {
  return category ? `/invitations/templates?category=${category}` : "/invitations/templates";
}

export function getInvitationTemplateDetailsHref(templateId: string): string {
  return `/invitations/templates/${encodeURIComponent(templateId)}`;
}

/** Phase 4: the full guest-facing demo route. */
export function getInvitationTemplatePreviewHref(templateId: string): string {
  return `/invitations/templates/${encodeURIComponent(templateId)}/demo`;
}

/**
 * Phase 5: the public, unauthenticated anonymous-builder route. Carries the
 * template id as a path segment, same shape as details/demo, so it's keyed
 * by the exact same proxy 404 gate.
 */
export function getInvitationTemplateCreateHref(templateId: string): string {
  return `/invitations/templates/${encodeURIComponent(templateId)}/create`;
}

export function isValidInvitationCategoryParam(
  value: string | null | undefined,
  categories: readonly InvitationTemplateCategory[]
): value is InvitationTemplateCategory {
  return typeof value === "string" && (categories as readonly string[]).includes(value);
}

/**
 * Matches the details page, the Phase 4 demo page, AND the Phase 5
 * anonymous-builder page — the shape proxy.ts needs for its pre-stream 404
 * gate (all three are keyed by the same template id, demo/create just add
 * a path suffix).
 */
export const INVITATION_TEMPLATE_ID_PATH_PATTERN = /^\/invitations\/templates\/([^/]+)(?:\/demo|\/create)?$/;

/**
 * Matches ONLY the Phase 4 demo route — used by Navbar/CookieConsent to hide
 * site chrome there (full-screen guest-facing experience) without affecting
 * the gallery or details pages, which keep normal chrome.
 */
const INVITATION_TEMPLATE_DEMO_PATTERN = /^\/invitations\/templates\/[^/]+\/demo$/;

export function isInvitationTemplateDemoPath(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && INVITATION_TEMPLATE_DEMO_PATTERN.test(pathname);
}

/**
 * Matches ONLY the Phase 5 anonymous-builder route — same chrome-hiding
 * purpose as the demo path above, kept as its own named check since the two
 * routes are conceptually different (guest-facing demo vs. an actual editor)
 * even though both want a chrome-free shell.
 */
const INVITATION_TEMPLATE_CREATE_PATTERN = /^\/invitations\/templates\/[^/]+\/create$/;

export function isInvitationTemplateCreatePath(pathname: string | null | undefined): boolean {
  return typeof pathname === "string" && INVITATION_TEMPLATE_CREATE_PATTERN.test(pathname);
}
