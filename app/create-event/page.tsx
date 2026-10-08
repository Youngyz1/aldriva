import { redirect } from "next/navigation";
import CreateEventForm from "./CreateEventForm";

/**
 * app/create-event/page.tsx
 *
 * Server guard for the public event form (Round 3, Commit 3c). The form is
 * only reachable through an intentional Public choice:
 * - /dashboard/events/new Public card links here with ?from=new.
 * - Every other "Create event" entry point lands on /dashboard/events/new.
 * - Direct opens (bookmarks, typed URLs, stale links) bounce to the choice
 *   page instead of silently skipping the Public / Invitation decision.
 *
 * Logged-out visitors: /create-event is public, so this guard runs for them
 * too — they land on the choice page, where proxy.ts sends them to
 * /login?redirect=/dashboard/events/new and back after sign-in.
 */
export default async function CreateEventPage({
  searchParams,
}: {
  searchParams?: Promise<{ from?: string }>;
}) {
  const from = (await searchParams)?.from;
  if (from !== "new") {
    redirect("/dashboard/events/new");
  }

  return <CreateEventForm />;
}
