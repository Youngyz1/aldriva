import { Suspense } from "react";
import { connection } from "next/server";
import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { getDemoTemplateSummary } from "@/lib/invitation-template-public-catalog";
import { legacyInvitationTemplateToLayout } from "@/lib/invitation-page-layout";
import { mergeInvitationTemplatePreviewData } from "@/lib/invitation-template-preview-data";
import { assembleInvitationPageData, type EventLiveFields, type InvitationPageSnapshot } from "@/lib/types/invitation-page-snapshot";
import { SAMPLE_PREVIEW_GUEST, SAMPLE_PREVIEW_TICKET } from "@/lib/invitation-preview-channel";
// Direct import, NOT UniversalPageRenderer: this must stay safe to ever
// become a "use client" component without risking the Phase 2/3 crash
// (UniversalPageRenderer's kind:"website" branch pulls in server-only
// Supabase code transitively; InvitationBlocksLayoutClient does not).
import { InvitationBlocksLayoutClient } from "@/components/invitation/blocks/InvitationBlocksLayoutClient";
import { InvitationDemoTopBar } from "@/components/invitation/marketplace/InvitationDemoTopBar";

// Port adaptation: feat's buildInvitationTemplatePreviewData(templateId, draft, event)
// assembled an empty draft/event pair internally before merging sample data.
// That builder was deleted upstream along with the other removed templates;
// the port's mergeInvitationTemplatePreviewData(templateId, realData) instead
// takes an already-assembled InvitationPageData, so the empty base is built
// here from the port's own assembler (same one LivePreviewFrame.tsx uses).
const EMPTY_SNAPSHOT = { template_id: "", locale: "en" } as unknown as InvitationPageSnapshot;
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

type Params = { templateId: string };

export async function generateMetadata({ params }: { params: Promise<Params> }): Promise<Metadata> {
  const { templateId } = await params;
  const summary = getDemoTemplateSummary(templateId);
  return {
    title: summary ? `${summary.name} — Demo` : "Template not found",
    // Demo pages are disposable sample-data renders, not real invitations —
    // they must never compete with real guest pages in search results.
    robots: { index: false, follow: false },
  };
}

export default async function InvitationTemplateDemoPage({
  params,
  searchParams,
}: {
  params: Promise<Params>;
  // Opt-in only: `?locale=fr` renders the French sample dataset. Without the
  // query param the demo stays English, so existing demo output is unchanged.
  searchParams: Promise<{ locale?: string }>;
}) {
  const { templateId } = await params;
  const summary = getDemoTemplateSummary(templateId);
  if (!summary) notFound();

  const layout = legacyInvitationTemplateToLayout(summary.id);
  layout.template_data = { ...(layout.template_data ?? {}), mf_show_memories: true };

  return (
    <>
      <InvitationDemoTopBar templateId={summary.id} />
      <div className="pt-10">
        {/* searchParams is runtime data, so it must be read inside a Suspense
            boundary for the static shell (Cache Components). */}
        <Suspense fallback={<div className="min-h-[60vh]" />}>
          <DemoInvitation summaryId={summary.id} layout={layout} searchParams={searchParams} />
        </Suspense>
      </div>
    </>
  );
}

async function DemoInvitation({
  summaryId,
  layout,
  searchParams,
}: {
  summaryId: string;
  layout: ReturnType<typeof legacyInvitationTemplateToLayout>;
  searchParams: Promise<{ locale?: string }>;
}) {
  // Opt-in only: `?locale=fr` renders the French sample dataset. Without the
  // query param the demo stays English, so existing demo output is unchanged.
  // `connection()` marks the segment as request-time work, so the query string
  // is read per request instead of being frozen into the prerendered shell.
  await connection();
  const { locale } = await searchParams;
  const demoLocale = locale === "fr" ? "fr" : "en";
  const realData = assembleInvitationPageData(
    { ...EMPTY_SNAPSHOT, template_id: summaryId, locale: demoLocale },
    EMPTY_LIVE_EVENT,
    { ...SAMPLE_PREVIEW_GUEST },
    { ...SAMPLE_PREVIEW_TICKET },
    null
  );
  const preview = mergeInvitationTemplatePreviewData(summaryId, realData, { demoRoute: true });

  return (
    <InvitationBlocksLayoutClient
      layout={layout}
      data={preview}
      templateId={summaryId}
      mode="live"
    />
  );
}
