import { notFound } from "next/navigation";
import Link from "next/link";
import { assertCanManageEvent } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";

export default async function EventOverviewPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageEvent(id);
  if (!auth.ok) return notFound();

  const admin = createSupabaseAdmin();
  const { data: event } = await admin.from("events").select("id, title, slug, event_date, city, status, organizer_id").eq("id", id).maybeSingle();
  if (!event) return notFound();

  const [{ count: guestCount }, { count: ticketCount }] = await Promise.all([
    admin.from("guests").select("id", { count: "exact", head: true }).eq("event_id", id),
    admin.from("tickets").select("id", { count: "exact", head: true }).eq("event_id", id),
  ]);

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-black tracking-tight">{event.title}</h1>
        <p className="text-sm text-zinc-500">{event.city ?? "—"} · {event.event_date ? new Date(event.event_date).toLocaleDateString() : "Date TBA"} · {event.status}</p>
      </header>

      <div className="grid gap-4 sm:grid-cols-3">
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-zinc-500">Guests</CardTitle></CardHeader><CardContent><p className="text-2xl font-black">{guestCount ?? 0}</p><Button asChild variant="outline" size="sm" className="mt-2"><Link href={`/dashboard/events/${id}/guests`}>Manage guests</Link></Button></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-zinc-500">Tickets</CardTitle></CardHeader><CardContent><p className="text-2xl font-black">{ticketCount ?? 0}</p><Button asChild variant="outline" size="sm" className="mt-2"><Link href={`/dashboard/events/${id}/checkins`}>Check-ins</Link></Button></CardContent></Card>
        <Card><CardHeader className="pb-2"><CardTitle className="text-xs uppercase tracking-wide text-zinc-500">Scan</CardTitle></CardHeader><CardContent><p className="text-sm text-zinc-600">Door scanner for this event</p><Button asChild size="sm" className="mt-2"><Link href={`/dashboard/events/${id}/scan`}>Open scanner</Link></Button></CardContent></Card>
      </div>

      <div className="grid gap-4 sm:grid-cols-2">
        <Card><CardHeader><CardTitle className="text-sm">Quick actions</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm" variant="outline"><Link href={`/dashboard/events/${id}/team`}>Team</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/dashboard/events/${id}/seating`}>Seating</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/dashboard/events/${id}/operations`}>Operations</Link></Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Invite special guests</CardTitle></CardHeader><CardContent className="flex flex-wrap gap-2">
          <Button asChild size="sm"><Link href={`/dashboard/events/${id}/invitation-page/builder`}>Invitation builder</Link></Button>
          <Button asChild size="sm" variant="outline"><Link href={`/dashboard/events/${id}/guests`}>Guests & RSVPs</Link></Button>
        </CardContent></Card>
        <Card><CardHeader><CardTitle className="text-sm">Public page</CardTitle></CardHeader><CardContent><Button asChild size="sm" variant="outline"><Link href={`/events/${event.slug}`} target="_blank">View public event →</Link></Button></CardContent></Card>
      </div>
    </div>
  );
}
