"use client";

/**
 * app/dashboard/events/[id]/invitation-page/builder/InvitationBuilderLocalPreview.tsx
 *
 * Phase 5 local-mode preview: renders InvitationBlocksLayoutClient directly
 * in the same React tree, instead of the server-mode iframe
 * (/invitation/builder-preview/[eventId], itself auth+event-gated — see
 * docs/REA-MARKETPLACE-PHASE-5-ANONYMOUS-DRAFT-DESIGN.md §1/§2). No
 * postMessage round-trip is needed since there's no iframe boundary to
 * cross — edits are reflected the instant React re-renders.
 *
 * Deliberately imports InvitationBlocksLayoutClient directly, never
 * UniversalPageRenderer (Phase 2/3's server-only client-bundle crash).
 *
 * Reuses the SAME device-frame chassis as the dashboard builder
 * (InvitationPreviewPanel -> InvitationDevicePreviewFrame) by passing our
 * direct-rendered content as `children` instead of an `iframeSrc` — both
 * components treat that as an explicit escape hatch and never touch it
 * unless a caller opts in, so server mode's iframe path is unchanged (see
 * their own comments).
 *
 * Port adaptation: feat built the preview data with
 * buildInvitationTemplatePreviewData(templateId, draft, event), which was
 * deleted upstream along with the other removed templates. Same pipeline
 * LivePreviewFrame.tsx (the server-mode builder preview) already uses:
 * assembleInvitationPageData -> applyEventMemories ->
 * mergeInvitationTemplatePreviewData.
 */

import { useMemo } from "react";
import { assembleInvitationPageData, type EventLiveFields, type InvitationPageSnapshot } from "@/lib/types/invitation-page-snapshot";
import { mergeInvitationTemplatePreviewData, applyEventMemories } from "@/lib/invitation-template-preview-data";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import { InvitationBlocksLayoutClient } from "@/components/invitation/blocks/InvitationBlocksLayoutClient";
import { InvitationPreviewPanel } from "@/components/invitation/InvitationPreviewPanel";
import { SAMPLE_PREVIEW_GUEST, SAMPLE_PREVIEW_TICKET } from "@/lib/invitation-preview-channel";
import type { BuilderDraft } from "./InvitationPageBuilder";

export function InvitationBuilderLocalPreview({
  draft,
  event,
  locale,
  onLocaleChange,
  viewport,
  onViewportChange,
}: {
  draft: BuilderDraft;
  event: Record<string, unknown>;
  locale: "en" | "fr";
  onLocaleChange: (locale: "en" | "fr") => void;
  viewport: 390 | 1440;
  onViewportChange: (viewport: 390 | 1440) => void;
}) {
  const templateId = draft.template_id || "minimalism-dark-blue";
  const layout = useMemo(
    () => legacyInvitationTemplateToLayout(templateId, draft.blocks_layout),
    [templateId, draft.blocks_layout]
  );
  const preview = useMemo(() => {
    const snapshot = { ...draft, template_id: templateId, locale } as unknown as InvitationPageSnapshot;
    const liveEvent: EventLiveFields = {
      id: String(event.id ?? ""),
      title: typeof event.title === "string" && event.title ? event.title : "Exclusive Event",
      slug: typeof event.slug === "string" ? event.slug : "",
      event_date: typeof event.event_date === "string" ? event.event_date : "",
      end_date: typeof event.end_date === "string" ? event.end_date : null,
      venue: typeof event.venue === "string" ? event.venue : null,
      street_address: typeof event.street_address === "string" ? event.street_address : null,
      city: typeof event.city === "string" ? event.city : null,
      latitude: typeof event.latitude === "number" ? event.latitude : null,
      longitude: typeof event.longitude === "number" ? event.longitude : null,
    };
    return mergeInvitationTemplatePreviewData(
      templateId,
      applyEventMemories(
        assembleInvitationPageData(
          snapshot,
          liveEvent,
          { ...SAMPLE_PREVIEW_GUEST },
          { ...SAMPLE_PREVIEW_TICKET },
          null
        ),
        event
      )
    );
  }, [templateId, draft, locale, event]);

  return (
    <InvitationPreviewPanel
      className="h-full min-h-0"
      containerClassName="min-h-0 flex-1"
      title="Live invitation preview"
      showLocaleToggle
      locale={locale}
      onLocaleChange={onLocaleChange}
      viewport={viewport}
      onViewportChange={onViewportChange}
    >
      <InvitationBlocksLayoutClient
        layout={layout}
        data={preview}
        templateId={templateId}
        mode="preview"
        isEditMode
      />
    </InvitationPreviewPanel>
  );
}
