import { notFound } from "next/navigation";
import type { Metadata } from "next";
import { assertCanManageEvent } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getInvitationPageDraft } from "@/lib/actions/invitation-page";
import { getShareLinkState } from "@/lib/actions/invitation-sharing";
import { InvitationHomeClient } from "./InvitationHomeClient";

export const metadata: Metadata = {
  title: "Invitation Home | Aldriva Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Preview-first home for invitation-kind events: the real template in the
 * same chrome-free iframe as the builder preview (sample guest, no RSVP
 * writes, sample QR labelled as sample), status, actions and tool links.
 * Public events keep the ticket-centric overview (see ../page.tsx router).
 */
export default async function InvitationHomePage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const auth = await assertCanManageEvent(eventId);
  if (!auth.ok) return notFound();

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, title, kind, event_date, city")
    .eq("id", eventId)
    .maybeSingle();
  if (!event || (event as { kind?: string | null }).kind !== "invitation") return notFound();

  const [draftData, share] = await Promise.all([
    getInvitationPageDraft(eventId),
    getShareLinkState(eventId),
  ]);

  return (
    <InvitationHomeClient
      eventId={eventId}
      eventTitle={(event.title as string) ?? "Draft invitation"}
      hasPage={!!draftData && draftData.draft.id !== ""}
      pageStatus={draftData?.draft.page_status ?? "draft"}
      hasUnpublishedChanges={draftData?.hasUnpublishedChanges ?? false}
      draftLocale={draftData?.draft.locale ?? "en"}
      rsvpCounts={null}
      shareEnabled={share.ok && (share.enabled ?? false)}
      shareUrl={share.ok ? (share.url ?? null) : null}
    />
  );
}
