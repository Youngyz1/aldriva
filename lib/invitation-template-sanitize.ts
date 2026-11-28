/**
 * lib/invitation-template-sanitize.ts
 *
 * Single shared helper to sanitize invitation drafts and layouts against
 * the target template's declared capabilities.
 *
 * Rules:
 * - Drops unsupported effects (e.g. falling-petals on burgundy-gold).
 * - Drops unsupported layout blocks (e.g. interactive_envelope on burgundy-gold).
 * - Resets unsupported customizations (palette, fontPack, textScale) to defaults.
 * - Preserves hidden content in template_data so switching back restores it.
 * - Leaves guest data, tickets, and event metadata untouched.
 * - Pure function (no React, no DB, no server-only imports) — safe across client, server, and test runtimes.
 */

import {
  getInvitationTemplateDefinition,
  resolveInvitationTemplateId,
  type InvitationTemplateId,
} from "@/lib/invitation-template-registry";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import type { InvitationBlocksLayout } from "@/lib/invitation-template-schema";

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

export function sanitizeBlocksLayoutForTemplate(
  layout: unknown,
  templateId: string | null | undefined
): InvitationBlocksLayout {
  const resolvedId = resolveInvitationTemplateId(templateId);
  // legacyInvitationTemplateToLayout already filters blocks and effects through
  // the template definition's supportedBlockTypes and supportedEffects.
  const parsedLayout = legacyInvitationTemplateToLayout(resolvedId, layout);
  const def = getInvitationTemplateDefinition(resolvedId);
  if (!def) return parsedLayout;

  const supportedEffectsSet = new Set<string>(def.supportedEffects ?? []);
  const sanitizedEffects = (parsedLayout.effects ?? []).filter((e) => supportedEffectsSet.has(e.type));

  const supportedBlocksSet = new Set<string>(def.supportedBlockTypes ?? []);
  const sanitizedBlocks = (parsedLayout.layout_blocks ?? []).filter((b) => supportedBlocksSet.has(b.type));

  const theme = parsedLayout.global_theme;
  const sanitizedTheme = {
    ...theme,
    palette_id: def.supportedCustomizations?.palette ? theme.palette_id : undefined,
    font_pack_id: def.supportedCustomizations?.fontPack ? theme.font_pack_id : undefined,
    text_scale: def.supportedCustomizations?.textScale ? theme.text_scale : 1.0,
  };

  const incomingTemplateData = (isRecord(layout) && isRecord(layout.template_data))
    ? (layout.template_data as Record<string, unknown>)
    : undefined;

  return {
    ...parsedLayout,
    template_data: incomingTemplateData ?? parsedLayout.template_data,
    global_theme: sanitizedTheme,
    layout_blocks: sanitizedBlocks,
    effects: sanitizedEffects,
  };
}

export function sanitizeDraftForTemplate<T extends Record<string, unknown>>(
  draft: T,
  targetTemplateId: string | null | undefined
): T {
  const resolvedTemplateId: InvitationTemplateId = resolveInvitationTemplateId(targetTemplateId);
  const currentLayout = draft.blocks_layout;
  const sanitizedLayout = sanitizeBlocksLayoutForTemplate(currentLayout, resolvedTemplateId);

  // Sync opening-photo keys across template families:
  //   burgundy-gold uses mf_opening_photo; minimalism-dark-blue uses envelope_photo_url.
  //   When switching between them, copy the URL into the target template's key so the
  //   image carries across in both directions.
  const incomingTemplateData = (isRecord(currentLayout) && isRecord(currentLayout.template_data))
    ? (currentLayout.template_data as Record<string, unknown>)
    : undefined;
  const templateData = { ...(incomingTemplateData ?? {}), ...((sanitizedLayout.template_data as Record<string, unknown>) ?? {}) };
  const mfOpeningPhoto = typeof templateData.mf_opening_photo === "string" ? templateData.mf_opening_photo.trim() : "";
  const envelopePhotoUrl = typeof templateData.envelope_photo_url === "string" ? templateData.envelope_photo_url.trim() : "";

  let updatedTemplateData: Record<string, unknown> | undefined;
  if (resolvedTemplateId === "burgundy-gold" && !mfOpeningPhoto && envelopePhotoUrl) {
    updatedTemplateData = { ...templateData, mf_opening_photo: envelopePhotoUrl };
  } else if (resolvedTemplateId === "minimalism-dark-blue" && !envelopePhotoUrl && mfOpeningPhoto) {
    updatedTemplateData = { ...templateData, envelope_photo_url: mfOpeningPhoto };
  } else if (incomingTemplateData) {
    updatedTemplateData = templateData;
  }

  const finalLayout = updatedTemplateData
    ? { ...sanitizedLayout, template_data: updatedTemplateData }
    : sanitizedLayout;

  return {
    ...draft,
    template_id: resolvedTemplateId,
    blocks_layout: finalLayout,
  };
}
