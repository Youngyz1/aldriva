"use client";

/**
 * Lazy-mounted, scaled live preview of a template, used as the gallery card
 * thumbnail and the details-page hero preview. Same proven pattern as the
 * in-builder picker's ScaledPageFrame (IntersectionObserver lazy mount +
 * CSS transform scale) — reimplemented here, independent of
 * UnifiedTemplatePicker.tsx, so public marketplace code never depends on
 * the authenticated builder's picker component.
 *
 * Renders through the exact same pipeline as the builder preview and the
 * published guest page (legacyInvitationTemplateToLayout +
 * assembleInvitationPageData + mergeInvitationTemplatePreviewData +
 * InvitationBlocksLayoutClient) on Phase 1 sample data — no screenshots, no
 * second renderer.
 *
 * Imports InvitationBlocksLayoutClient directly, NOT UniversalPageRenderer:
 * this is a "use client" component, and UniversalPageRenderer's
 * kind:"website" branch unconditionally imports BlockRenderer, which pulls
 * in server-only code (lib/supabase-admin.ts) at module scope — bundling
 * that into a client component breaks the whole app at build time.
 * InvitationBlocksLayoutClient is the actual client-safe renderer the
 * builder's own LivePreviewFrame and UnifiedTemplatePicker already use for
 * this exact purpose.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import { mergeInvitationTemplatePreviewData } from "@/lib/invitation-template-preview-data";
import { assembleInvitationPageData, type EventLiveFields, type InvitationPageSnapshot } from "@/lib/types/invitation-page-snapshot";
import { SAMPLE_PREVIEW_GUEST, SAMPLE_PREVIEW_TICKET } from "@/lib/invitation-preview-channel";
import { InvitationBlocksLayoutClient } from "@/components/invitation/blocks/InvitationBlocksLayoutClient";

const FRAME_DESIGN_WIDTH = 390;

// Port adaptation: same empty-base rationale as the demo page — see
// app/invitations/templates/[templateId]/demo/page.tsx. This component is
// "use client" (lazy-mounted gallery/detail thumbnail), and
// assembleInvitationPageData/mergeInvitationTemplatePreviewData have no
// server-only dependencies, so this stays safe to run in the browser.
const EMPTY_LIVE_EVENT: EventLiveFields = {
  id: "",
  title: "",
  slug: "",
  event_date: "",
  end_date: null,
  venue: null,
  street_address: null,
  city: null,
  latitude: null,
  longitude: null,
};

export function InvitationTemplatePreviewFrame({
  templateId,
  className,
  ariaLabel,
  eager = false,
}: {
  templateId: string;
  className?: string;
  ariaLabel: string;
  /** Skip the IntersectionObserver gate — for the details page's single, above-the-fold preview. */
  eager?: boolean;
}) {
  const frameRef = useRef<HTMLDivElement>(null);
  const [isVisible, setIsVisible] = useState(eager);
  const [frameWidth, setFrameWidth] = useState(FRAME_DESIGN_WIDTH);

  useEffect(() => {
    const el = frameRef.current;
    if (!el) return;
    const updateWidth = () => setFrameWidth(el.clientWidth || FRAME_DESIGN_WIDTH);
    updateWidth();
    if (typeof ResizeObserver === "undefined") return;
    const resizeObserver = new ResizeObserver(updateWidth);
    resizeObserver.observe(el);
    return () => resizeObserver.disconnect();
  }, []);

  useEffect(() => {
    const el = frameRef.current;
    if (!el || isVisible) return;
    if (typeof IntersectionObserver === "undefined") {
      setIsVisible(true);
      return;
    }
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsVisible(true);
          observer.disconnect();
        }
      },
      { rootMargin: "200px" }
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, [isVisible]);

  const scale = Math.min(frameWidth / FRAME_DESIGN_WIDTH, 1);
  const layout = useMemo(() => legacyInvitationTemplateToLayout(templateId), [templateId]);
  const preview = useMemo(() => {
    const realData = assembleInvitationPageData(
      { template_id: templateId, locale: "en" } as unknown as InvitationPageSnapshot,
      EMPTY_LIVE_EVENT,
      { ...SAMPLE_PREVIEW_GUEST },
      { ...SAMPLE_PREVIEW_TICKET },
      null
    );
    return mergeInvitationTemplatePreviewData(templateId, realData);
  }, [templateId]);

  return (
    <div
      ref={frameRef}
      role="img"
      aria-label={ariaLabel}
      className={cn("relative w-full overflow-hidden bg-zinc-100", className)}
    >
      {!isVisible ? (
        <div className="h-full w-full animate-pulse bg-zinc-100" />
      ) : (
        <div
          className="pointer-events-none absolute left-0 top-0 origin-top-left"
          style={{ width: FRAME_DESIGN_WIDTH, transform: `scale(${scale})` }}
        >
          <InvitationBlocksLayoutClient
            layout={layout}
            data={preview}
            templateId={templateId}
            mode="preview"
          />
        </div>
      )}
    </div>
  );
}
