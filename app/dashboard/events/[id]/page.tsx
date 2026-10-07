import { redirect } from "next/navigation";
import { assertCanManageEvent } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";

/**
 * Event home router: invitation-kind events open on the preview-first
 * invitation home; public events keep the ticket-centric overview.
 * Access failures fall through to the overview, which 404s as before.
 */
export default async function EventRootPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id: eventId } = await params;
  const auth = await assertCanManageEvent(eventId);
  if (auth.ok) {
    const admin = createSupabaseAdmin();
    const { data: event } = await admin
      .from("events")
      .select("kind")
      .eq("id", eventId)
      .maybeSingle();
    if ((event as { kind?: string | null } | null)?.kind === "invitation") {
      redirect(`/dashboard/events/${eventId}/invitation-home`);
    }
  }
  redirect(`/dashboard/events/${eventId}/overview`);
}
