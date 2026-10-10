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

import { Component, useEffect, useMemo, useState, type ReactNode } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { getTemplateById } from "@/components/invitation/templates/registry";
import { buildInvitationTemplatePreviewData } from "@/lib/invitation-template-preview-data";
import {
  isPreviewMessage,
  isSameOriginMessage,
  PREVIEW_MESSAGE_SOURCE,
  resolvePreviewAnchor,
  type PreviewDraftMessage,
} from "@/lib/invitation-preview-channel";

interface Props {
  event: Record<string, unknown>;
  eventId: string;
  embedded: boolean;
  initialDraft?: Record<string, unknown>;
}

const EMPTY_DRAFT: Record<string, unknown> = {
  template_id: "gala-editorial",
  locale: "en",
};

class CandidatePreviewErrorBoundary extends Component<
  { children: ReactNode; fallback: ReactNode },
  { hasError: boolean }
> {
  state = { hasError: false };

  static getDerivedStateFromError() {
    return { hasError: true };
  }

  render() {
    return this.state.hasError ? this.props.fallback : this.props.children;
  }
}

function TemplateRender({
  templateId,
  data,
  sampleLabel,
}: {
  templateId: string;
  data: ReturnType<typeof buildInvitationTemplatePreviewData>;
  sampleLabel: string;
}) {
  const TemplateComponent = getTemplateById(templateId).component;
  return (
    <>
      {data.sampleFields.length > 0 && (
        <span className="fixed right-2 top-12 z-30 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-[11px] font-bold text-amber-950 shadow-xs">
          {sampleLabel}
        </span>
      )}
      <TemplateComponent data={data.data} />
    </>
  );
}

export function LivePreviewFrame({ event, eventId, embedded, initialDraft }: Props) {
  const t = useTranslations("Events");
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
    const draft = { ...(payload?.draft ?? initialDraft ?? EMPTY_DRAFT) };
    const templateId =
      (payload?.templateId as string) || (draft.template_id as string) || "gala-editorial";
    draft.locale = payload?.locale || (draft.locale as "en" | "fr") || "en";
    const savedTemplateId = payload?.savedTemplateId || (draft.template_id as string) || "gala-editorial";
    const active = buildInvitationTemplatePreviewData(templateId, draft, event);
    const saved =
      payload?.candidatePreview && savedTemplateId !== templateId
        ? buildInvitationTemplatePreviewData(savedTemplateId, draft, event)
        : active;
    return {
      templateId,
      savedTemplateId,
      candidatePreview: payload?.candidatePreview === true && savedTemplateId !== templateId,
      active,
      saved,
    };
  }, [payload, event, initialDraft]);

  const activeRender = (
    <TemplateRender
      templateId={pageData.templateId}
      data={pageData.active}
      sampleLabel={t("invitationPreviewSampleLabel")}
    />
  );
  const previewRender = pageData.candidatePreview ? (
    <CandidatePreviewErrorBoundary
      key={`${pageData.savedTemplateId}:${pageData.templateId}`}
      fallback={
        <>
          <p className="fixed inset-x-2 top-12 z-40 mx-auto w-fit rounded-lg border border-amber-300 bg-amber-50 px-3 py-1.5 text-center text-xs font-semibold text-amber-950 shadow-xs" role="status">
            {t("candidatePreviewFallbackNotice")}
          </p>
          <TemplateRender
            templateId={pageData.savedTemplateId}
            data={pageData.saved}
            sampleLabel={t("invitationPreviewSampleLabel")}
          />
        </>
      }
    >
      {activeRender}
    </CandidatePreviewErrorBoundary>
  ) : activeRender;

  return (
    <div className="min-h-screen bg-white">
      {embedded ? (
        <p className="sticky top-0 z-10 border-b border-amber-200 bg-amber-50 px-3 py-1.5 text-center text-[11px] font-semibold text-amber-800">
          Preview — bracketed names and the QR code are samples for the pending-guest view. Nothing here is saved.
        </p>
      ) : (
        <header className="sticky top-0 z-10 flex flex-wrap items-center justify-between gap-2 border-b border-amber-200 bg-amber-50 px-4 py-2 text-sm text-amber-950">
          <p className="font-semibold">Private: only you can see this. Guest names and QR code are samples; nothing here is saved.</p>
          <nav className="flex flex-wrap gap-2" aria-label="Preview actions">
            <Link
              href={`/dashboard/events/${eventId}/overview`}
              className="rounded-xl border border-amber-300 bg-white px-3 py-1.5 text-xs font-bold text-zinc-800 hover:bg-amber-100"
            >
              Back to event
            </Link>
            <Link
              href={`/dashboard/events/${eventId}/invitation-page?edit=1`}
              className="rounded-xl bg-orange-700 px-3 py-1.5 text-xs font-bold text-white hover:bg-orange-800"
            >
              Edit invitation
            </Link>
          </nav>
        </header>
      )}
      {previewRender}
    </div>
  );
}
