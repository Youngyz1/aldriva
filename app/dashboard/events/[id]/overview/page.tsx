import { notFound } from "next/navigation";
import { assertCanManageEvent } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getTranslations } from "next-intl/server";
import { isInvitationEvent } from "@/lib/invitation-events";
import { OverviewShell } from "@/components/dashboard/overview/OverviewShell";
import { StatCard } from "@/components/dashboard/overview/StatCard";
import { QuickActionTile } from "@/components/dashboard/overview/QuickActionTile";
import {
  IconUsers,
  IconQrcode,
  IconActivity,
  IconArmchair,
  IconEdit,
  IconUserCheck,
} from "@tabler/icons-react";

export default async function EventOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const t = await getTranslations("Events");
  const auth = await assertCanManageEvent(id);
  if (!auth.ok) return notFound();

  const admin = createSupabaseAdmin();
  const { data: event } = await admin
    .from("events")
    .select("id, title, slug, event_date, city, status, organizer_id, kind, visibility")
    .eq("id", id)
    .maybeSingle();
  if (!event) return notFound();

  const [{ count: guestCount }, { count: ticketCount }, { data: invitationPage }] = await Promise.all([
    admin.from("guests").select("id", { count: "exact", head: true }).eq("event_id", id),
    admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", id),
    admin.from("event_invitation_pages").select("event_id").eq("event_id", id).maybeSingle(),
  ]);
  const hasInvitationPage = Boolean(invitationPage);

  // Build a clean subtitle — omit city+separator when null
  const dateStr = event.event_date
    ? new Date(event.event_date).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" })
    : "Date TBA";
  const subtitleParts = [
    event.city ?? null,
    dateStr,
    event.status,
  ].filter(Boolean);
  const subtitle = subtitleParts.join(" · ");

  const isInvitation = isInvitationEvent(event as { kind?: string | null });

  return (
    <OverviewShell workspaceName={event.title}>
      {/* Compact event header */}
      <header className="space-y-0.5 pb-2">
        <h1 className="text-xl font-black tracking-tight text-zinc-950">{event.title}</h1>
        {subtitle && <p className="text-sm text-zinc-500">{subtitle}</p>}
      </header>

      {/* KPI stat cards */}
      <div className="grid gap-3 grid-cols-2">
        <StatCard
          label="Guests"
          value={guestCount ?? 0}
          format="count"
          href={`/dashboard/events/${id}/guests`}
        />
        <StatCard
          label="Tickets"
          value={ticketCount ?? 0}
          format="count"
          href={`/dashboard/events/${id}/checkins`}
        />
      </div>

      {/* Quick action tiles — full-size 2-col grid, 72px each */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
        <QuickActionTile
          icon={IconQrcode}
          label="Door Scanner"
          description="Check guests in at the door"
          href={`/dashboard/events/${id}/scan`}
          variant="secondary"
        />
        <QuickActionTile
          icon={IconUserCheck}
          label="Check-ins & Roster"
          description="View attendance and check-in list"
          href={`/dashboard/events/${id}/checkins`}
          variant="secondary"
        />
        <QuickActionTile
          icon={IconActivity}
          label="Operations"
          description="Run-of-show and event tasks"
          href={`/dashboard/events/${id}/operations`}
          variant="secondary"
        />
        <QuickActionTile
          icon={IconArmchair}
          label="Seating"
          description="Assign seats and manage layout"
          href={`/dashboard/events/${id}/seating`}
          variant="secondary"
        />
        {isInvitation && (
          <>
            <QuickActionTile
              icon={IconUsers}
              label="Guests & RSVPs"
              description="Manage guest list and invitations"
              href={`/dashboard/events/${id}/guests`}
              variant="secondary"
            />
            <QuickActionTile
              icon={IconEdit}
              label={hasInvitationPage ? "Preview Invitation" : "Invitation Builder"}
              description={hasInvitationPage ? "View your invitation page" : "Create your invitation page"}
              href={hasInvitationPage ? `/invitation/builder-preview/${id}` : `/dashboard/events/${id}/invitation-page`}
              variant="secondary"
            />
          </>
        )}
        <QuickActionTile
          icon={IconEdit}
          label={event.visibility === "private" ? "Private Page" : "Public Event Page"}
          description={event.visibility === "private" ? t("privatePageNote") : "View your event page"}
          href={`/events/${event.slug}`}
          variant="secondary"
        />
      </div>
    </OverviewShell>
  );
}
