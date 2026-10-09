"use client";

/**
 * app/invitation/builder-preview/[eventId]/LivePreviewFrame.tsx
 *
 * Client half of the live preview: listens for postMessage draft payloads
 * from the builder (origin + shape validated, malformed ignored), renders
 * the real template component with a sample guest, and scrolls to section
 * anchors on demand. Template switches re-render in place — no reload, no
 * scroll reset (template_id arrives inside the payload).
 *
 * Never writes: no onRsvp is passed, no real guest data enters here.
 */

import { useCallback, useEffect, useMemo, useState } from "react";
import { getTemplateById } from "@/components/invitation/templates/registry";
import { assembleInvitationPageData } from "@/lib/types/invitation-page-snapshot";
import {
  isPreviewMessage,
  isSameOriginMessage,
  placeholderSnapshot,
  PREVIEW_MESSAGE_SOURCE,
  resolvePreviewAnchor,
  SAMPLE_PREVIEW_GUEST,
  SAMPLE_PREVIEW_TICKET,
  type PreviewDraftMessage,
} from "@/lib/invitation-preview-channel";

interface Props {
  event: Record<string, unknown>;
  initialDraft?: Record<string, unknown>;
}

const EMPTY_DRAFT: Record<string, unknown> = {
  template_id: "gala-editorial",
  locale: "en",
};

export function LivePreviewFrame({ event, initialDraft }: Props) {
  const [payload, setPayload] = useState<PreviewDraftMessage | null>(null);

  useEffect(() => {
    function onMessage(e: MessageEvent) {
      if (!isSameOriginMessage(e.origin, window.location.origin)) return;
      if (!isPreviewMessage(e.data)) return;
      if (e.data.kind === "draft") {
        setPayload(e.data);
      } else if (e.data.kind === "scroll-to") {
        const anchor = resolvePreviewAnchor(e.data.sectionId);
        if (anchor === "top") {
          window.scrollTo({ top: 0, behavior: "smooth" });
        } else {
          document.getElementById(anchor)?.scrollIntoView({ behavior: "smooth", block: "start" });
        }
      }
    }
    window.addEventListener("message", onMessage);
    // Tell the parent we're ready so it flushes the latest draft
    // (avoids losing payloads posted before this listener attached).
    window.parent.postMessage({ source: PREVIEW_MESSAGE_SOURCE, kind: "ready" }, window.location.origin);
    return () => window.removeEventListener("message", onMessage);
  }, []);

  const pageData = useMemo(() => {
    const draft = placeholderSnapshot({ ...(payload?.draft ?? initialDraft ?? EMPTY_DRAFT) });
    const templateId =
      (payload?.templateId as string) || (draft.template_id as string) || "gala-editorial";
    const locale = payload?.locale || (draft.locale as "en" | "fr") || "en";
    const liveEvent = {
      id: String(event.id ?? ""),
      title: (event.title as string) || "Exclusive Event",
      slug: (event.slug as string) || "",
      event_date: (event.event_date as string) || "",
      end_date: (event.end_date as string | null) || null,
      venue: (event.venue as string | null) || null,
      street_address: (event.street_address as string | null) || null,
      city: (event.city as string | null) || null,
      latitude: (event.latitude as number | null) ?? null,
      longitude: (event.longitude as number | null) ?? null,
    };
    const snapshot = {
      template_id: templateId,
      locale,
      ...draft,
    };
    return {
      templateId,
      data: assembleInvitationPageData(
        snapshot as never,
        liveEvent,
        { ...SAMPLE_PREVIEW_GUEST },
        { ...SAMPLE_PREVIEW_TICKET },
        null
      ),
    };
  }, [payload, event, initialDraft]);

  const renderTemplate = useCallback(() => {
    const entry = getTemplateById(pageData.templateId);
    const TemplateComponent = entry.component;
    return <TemplateComponent data={pageData.data} />;
  }, [pageData]);

  return (
    <div className="min-h-screen bg-white">
      <p className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-[11px] font-semibold text-amber-800">
        Preview — bracketed names and the QR code are samples for the pending-guest view. Nothing here is saved.
      </p>
      {renderTemplate()}
    </div>
  );
}
