import { redirect } from "next/navigation";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { getEventTeamRole, hasEventOrOrganizerAccess } from "@/lib/event-auth";
import { getEventSubNavTabs, type EventUserRole } from "@/lib/event-dashboard-navigation";
import { ManagementShell } from "@/components/management/ManagementShell";
import EventSwitcher from "@/components/events/EventSwitcher.client";

function iconForTab(id: string): string {
  const map: Record<string, string> = {
    overview: "LayoutDashboard",
    operations: "Activity",
    checkins: "CheckCircle2",
    scan: "QrCode",
    guests: "Users",
    memories: "Camera",
    "ticket-design": "Palette",
    "invitation-page": "Globe",
    seating: "LayoutDashboard",
    team: "Users",
    edit: "Edit3",
  };
  return map[id] ?? "LayoutDashboard";
}

export default async function EventDashboardLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const user = await getCurrentUser();

  if (!user) {
    redirect(`/login?redirect=/dashboard/events/${eventId}/checkins`);
  }

  const admin = createSupabaseAdmin();

  const { data: event } = await admin
    .from("events")
    .select("id, title, slug, user_id, organizer_id, kind")
    .eq("id", eventId)
    .maybeSingle();

  if (!event) {
    redirect("/dashboard/events");
  }

  const hasOrganizerAccess = await hasEventOrOrganizerAccess(user.id, eventId, []);
  const teamRole = hasOrganizerAccess ? null : await getEventTeamRole(user.id, eventId);
  const userRole: EventUserRole = hasOrganizerAccess ? "owner" : teamRole;

  if (!userRole) {
    redirect("/dashboard/events");
  }

  const tabs = getEventSubNavTabs(eventId, userRole, {
    // Round 4 Rule 1: invitation tabs render for invitation-kind events only.
    isInvitationKind: (event as { kind?: string | null } | null)?.kind === "invitation",
  });
  const base = `/dashboard/events/${eventId}`;
  const navGroups = [
    {
      items: tabs.map((tab) => ({
        label: tab.label,
        href: tab.href,
        icon: iconForTab(tab.id),
      })),
    },
  ];

  // Switcher: scoped to same organizer (or personal)
  let switcherItems: { id: string; title: string }[] = [];
  try {
    if (event.organizer_id) {
      const { data } = await admin
        .from("events")
        .select("id, title")
        .eq("organizer_id", event.organizer_id)
        .order("event_date", { ascending: false })
        .limit(50);
      switcherItems = (data ?? []).map((r) => ({ id: String(r.id), title: String(r.title ?? "Untitled") }));
    } else {
      const { data } = await admin.from("events").select("id, title").eq("user_id", user.id).is("organizer_id", null).order("created_at", { ascending: false }).limit(50);
      switcherItems = (data ?? []).map((r) => ({ id: String(r.id), title: String(r.title ?? "Untitled") }));
    }
  } catch {}

  const headerSlot = (
    <div className="px-3 pt-5 space-y-3">
      <Link href="/dashboard" className="flex items-center gap-1.5 text-xs font-semibold text-zinc-500 hover:text-zinc-900">
        <ArrowLeft className="h-3.5 w-3.5" /> Back to Dashboard
      </Link>
      <EventSwitcher currentId={eventId} items={switcherItems} variant="light" />
    </div>
  );

  const mobileHeaderSlot = <EventSwitcher currentId={eventId} items={switcherItems} variant="light" />;

  return (
    <ManagementShell
      entityLabel="Event"
      entityName={event.title ?? "Event"}
      backHref="/dashboard"
      navGroups={navGroups}
      headerSlot={headerSlot}
      mobileHeaderSlot={mobileHeaderSlot}
    >
      {children}
    </ManagementShell>
  );
}
