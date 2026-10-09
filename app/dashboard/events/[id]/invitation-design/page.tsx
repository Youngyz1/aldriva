import { notFound, redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { assertInvitationKindEvent } from "@/lib/actions/invitation-page";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Invitation Design | Aldriva Dashboard",
  robots: { index: false, follow: false, nocache: true },
};

/**
 * Round 5: the standalone card-design step is gone. Template selection
 * lives in ONE place — the invitation page builder's unified picker.
 * This route stays as a kind-gated redirect (never a 404 for valid
 * invitation events) so bookmarks and old links keep working.
 */
export default async function EventInvitationDesignPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;

  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const canManage = await hasEventOrOrganizerAccess(ctx.user.id, eventId, ["event_manager"]);
  if (!canManage) {
    return (
      <div className="mx-auto max-w-lg rounded-2xl border border-red-200 bg-red-50 p-6 text-center shadow-sm">
        <h2 className="text-xl font-black text-red-700">Access Restricted</h2>
        <p className="mt-2 text-sm font-semibold text-red-600">
          Only Event Managers and Organizers can configure invitation designs.
        </p>
      </div>
    );
  }

  // Kind gate stays: public-kind events never had a design surface.
  if (!(await assertInvitationKindEvent(eventId))) {
    notFound();
  }

  redirect(`/dashboard/events/${eventId}/invitation-page`);
}
