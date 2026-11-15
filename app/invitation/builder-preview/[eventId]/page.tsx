import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import type { Metadata } from "next";
import { getCurrentUser } from "@/lib/auth";
import { checkInvitationPageAccess, assertInvitationKindEvent, getInvitationPageDraft } from "@/lib/actions/invitation-page";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { readShowMemories } from "@/lib/memories/public-gallery";
import { resolveMemoriesProps } from "@/lib/memories/resolve-memories-props";
import { LivePreviewFrame } from "./LivePreviewFrame";

export const metadata: Metadata = {
  title: "Live Invitation Preview | Aldriva Dashboard",
  robots: { index: false, follow: false, nocache: true, noarchive: true },
};

export default async function InvitationLivePreviewRoute({
  params,
  searchParams,
}: {
  params: Promise<{ eventId: string }>;
  searchParams: Promise<{ embed?: string | string[] }>;
}) {
  await connection();
  const [{ eventId }, query] = await Promise.all([params, searchParams]);
  const embedded = query.embed === "1";

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=/dashboard/events/${eventId}/invitation-page`);
  }

  // Server-side ownership check: sample guest only, no real guest data,
  // no RSVP writes — but the event itself must not leak to strangers.
  const canAccess = await checkInvitationPageAccess(user.id, eventId);
  if (!canAccess) {
    return notFound();
  }

  // Round 4 Rule 1: the owner preview is invitation-kind only. Leftover
  // draft pages on public-kind events become unreachable here.
  if (!(await assertInvitationKindEvent(eventId))) {
    return notFound();
  }

  const pageData = await getInvitationPageDraft(eventId);
  if (!pageData) return notFound();
  if (!embedded && !pageData.draft.id) return notFound();

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, title, slug, event_date, end_date, venue, street_address, city, latitude, longitude, banner, category")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-zinc-200 bg-white p-6 text-center shadow-xs">
        <h2 className="text-xl font-black text-zinc-900">Event not found</h2>
      </div>
    );
  }

  // Stage 7b: the preview must show the organizer's real approved photos once
  // they exist, and the local samples only when no public gallery resolves.
  const showMemories = readShowMemories(
    (pageData.draft.blocks_layout as { template_data?: unknown } | null)?.template_data
  );
  const { data: shareRow } = await admin
    .from("event_invitation_pages")
    .select("share_enabled, share_token, page_status")
    .eq("event_id", eventId)
    .maybeSingle();
  const { memoriesToken, memoriesCount } = await resolveMemoriesProps(
    shareRow?.share_enabled === true,
    shareRow?.share_token,
    eventId,
    showMemories,
    shareRow?.page_status
  );

  return (
    <LivePreviewFrame
      event={{
        ...event,
        memoriesSample: !(memoriesCount > 0 && Boolean(memoriesToken)),
        memoriesCount,
        memoriesToken: memoriesToken ?? null,
      }}
      eventId={eventId}
      embedded={embedded}
      initialDraft={pageData.draft as unknown as Record<string, unknown>}
    />
  );
}
