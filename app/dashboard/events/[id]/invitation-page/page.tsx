import { redirect } from "next/navigation";
import { connection } from "next/server";
import { getCurrentUser } from "@/lib/auth";
import { checkInvitationPageAccess, getInvitationPageDraft } from "@/lib/actions/invitation-page";
import type { Metadata } from "next";
import InvitationPageDashboardClient from "./InvitationPageDashboardClient";

export const metadata: Metadata = {
  title: "Invitation Page | Aldriva Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

export default async function EventInvitationPageDashboardRoute({
  params,
}: {
  params: Promise<{ id: string }>;
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
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-xs">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can configure published invitation pages.
        </p>
      </div>
    );
  }

  const data = await getInvitationPageDraft(eventId);
  if (!data) {
    redirect("/dashboard/events");
  }

  return (
    <InvitationPageDashboardClient
      eventId={eventId}
      initialData={data}
    />
  );
}
