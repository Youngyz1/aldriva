import { notFound, redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkInvitationPageAccess, assertInvitationKindEvent, getInvitationPageDraft } from "@/lib/actions/invitation-page";
import { getShareLinkState } from "@/lib/actions/invitation-sharing";
import type { Metadata } from "next";
import InvitationPageDashboardClient from "./InvitationPageDashboardClient";
import { InvitationHomeClient } from "../invitation-home/InvitationHomeClient";

export const metadata: Metadata = {
  title: "Invitation Page | Aldriva Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EventInvitationPageDashboardRoute({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ edit?: string | string[] }>;
}) {
  await connection();
  const { id: eventId } = await params;

  const user = await getCurrentUser();
  if (!user) {
    redirect(`/login?redirect=/dashboard/events/${eventId}/invitation-page`);
  }

  const canAccess = await checkInvitationPageAccess(user.id, eventId);
  if (!canAccess) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-red-200 bg-red-50 p-6 text-center shadow-xs">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can configure published invitation pages.
        </p>
      </div>
    );
  }

  // Round 4 Rule 1: invitation tooling serves invitation-kind events only.
  if (!(await assertInvitationKindEvent(eventId))) {
    notFound();
  }

  let data = null;
  let queryError: string | null = null;
  try {
    data = await getInvitationPageDraft(eventId);
  } catch (err) {
    console.error("[EventInvitationPageDashboardRoute] Query error:", err);
    queryError = err instanceof Error ? err.message : "Failed to load draft data.";
  }

  if (queryError) {
    return (
      <div className="mx-auto max-w-lg rounded-xl border border-amber-200 bg-amber-50 p-6 text-center shadow-xs">
        <h2 className="text-xl font-black text-amber-900">Unable to Load Invitation Page</h2>
        <p className="mt-2 text-sm text-amber-800">
          We encountered an error loading this invitation page: {queryError}
        </p>
        <div className="mt-4">
          <a
            href={`/dashboard/events/${eventId}/invitation-page`}
            className="inline-flex items-center rounded-xl bg-orange-600 px-4 py-2 text-sm font-semibold text-white shadow-xs hover:bg-orange-700"
          >
            Retry
          </a>
        </div>
      </div>
    );
  }

  if (!data) {
    notFound();
  }

  const query = await searchParams;
  const hasPage = data.draft.id !== "";
  if (hasPage && query.edit !== "1") {
    const share = await getShareLinkState(eventId);
    return (
      <InvitationHomeClient
        eventId={eventId}
        eventTitle={data.event.title || "Invitation"}
        hasPage
        pageStatus={data.draft.page_status}
        hasUnpublishedChanges={data.hasUnpublishedChanges}
        draftLocale={data.draft.locale}
        rsvpCounts={null}
        shareEnabled={share.ok && (share.enabled ?? false)}
        shareUrl={share.ok ? (share.url ?? null) : null}
      />
    );
  }

  return (
    <InvitationPageDashboardClient
      eventId={eventId}
      initialData={data}
    />
  );
}
