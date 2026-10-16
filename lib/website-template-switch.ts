/**
 * lib/website-template-switch.ts
 *
 * Pure helpers for switching a site to another template (no DB, no auth).
 * The switch itself never deletes owner content: values for slots the new
 * template lacks stay in the content doc, so switching back restores them.
 * Used by the switch server action, the builder page, and hermetic tests.
 */

import {
  NEW_SITE_GALLERY_TEMPLATES,
  getFlagshipTemplate,
  type WebsiteTemplateV2,
} from "./website-template-v2";
import { isEmptyContentValue, planTemplateSwitch } from "./website-template-resolver";
import type { ContentDoc } from "./website-content";

export interface TemplateSwitchTarget {
  id: string;
  name: string;
  description: string;
  isCurrent: boolean;
}

/**
 * Single shared edit-access predicate for template switching — used by the
 * editor button, the dialog, and the server action so they cannot disagree.
 * Platform superadmins arrive with a null role and are always allowed (same
 * convention as the sibling editor checks); otherwise owner/admin/manager/
 * editor, mirroring ENTITY_ROLES_CONTENT_WRITE (parity pinned by test —
 * this module stays free of server-only imports for client use).
 */
export const TEMPLATE_EDIT_ROLES: readonly string[] = [
  "owner",
  "admin",
  "manager",
  "editor",
];

export function canEditWebsiteTemplate(userRole: string | null | undefined): boolean {
  if (userRole === null) return true;
  if (typeof userRole !== "string") return false;
  return TEMPLATE_EDIT_ROLES.includes(userRole);
}

/** Non-legacy templates only; the current template is marked, never excluded. */
export function getTemplateSwitchTargets(currentTemplateId: string | null): TemplateSwitchTarget[] {
  return NEW_SITE_GALLERY_TEMPLATES.map((template) => ({
    id: template.id,
    name: template.name,
    description: template.description,
    isCurrent: template.id === currentTemplateId,
  }));
}

export function isSwitchTargetAllowed(templateId: string): boolean {
  const template = getFlagshipTemplate(templateId);
  return Boolean(template && !template.legacy);
}

/**
 * The new template's accent default applies only when the owner has not
 * chosen an accent (empty/missing current accent).
 */
export function resolveSwitchedAccent(
  currentAccentId: string | null | undefined,
  newTemplate: WebsiteTemplateV2
): string {
  const chosen = typeof currentAccentId === "string" ? currentAccentId.trim() : "";
  if (chosen) return chosen;
  return newTemplate.defaultAccentId ?? "terracotta";
}

export interface TemplateSwitchSummary {
  currentTemplateId: string | null;
  newTemplateId: string;
  /** Slot labels whose values carry into the new template. */
  carriesOver: string[];
  /** Current-template section ids with content and no home in the new template. */
  hiddenSections: string[];
  /** New-template slot labels still needing content. */
  needsContent: string[];
  /** Doc keys kept verbatim (restored automatically when switching back). */
  keptKeys: string[];
}

/**
 * Plain-language switch summary built on the shared switch planner.
 * Read-only: never mutates the doc.
 */
export function summarizeTemplateSwitch(
  currentTemplateId: string | null,
  newTemplateId: string,
  contentDoc: ContentDoc
): TemplateSwitchSummary {
  const plan = planTemplateSwitch(currentTemplateId, newTemplateId, contentDoc);
  const next = getFlagshipTemplate(newTemplateId);
  const doc = (contentDoc ?? {}) as Record<string, unknown>;
  const labelByField = new Map<string, string>();
  if (next) {
    for (const slot of next.editableSlots) {
      if (!labelByField.has(String(slot.field))) {
        labelByField.set(String(slot.field), slot.label);
      }
    }
  }
  const carriesOver: string[] = [];
  for (const [field, label] of labelByField) {
    if (!isEmptyContentValue(doc[field]) && !carriesOver.includes(label)) {
      carriesOver.push(label);
    }
  }
  const needsContent: string[] = [];
  if (next) {
    for (const slotId of plan.newEmptySlots) {
      const slot = next.editableSlots.find((entry) => entry.slotId === slotId);
      const label = slot ? slot.label : slotId;
      if (!needsContent.includes(label)) needsContent.push(label);
    }
  }
  return {
    currentTemplateId: plan.currentTemplateId,
    newTemplateId: plan.newTemplateId,
    carriesOver,
    hiddenSections: plan.hiddenSections,
    needsContent,
    keptKeys: plan.keptUnslottedKeys,
  };
}
