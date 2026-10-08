import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";
import { CreateInvitationCard } from "@/components/events/CreateInvitationCard";

export default async function NewDashboardEventPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  // NOTE (Round 3, Commit 3c): the isAdmin() gate that used to sit here was
  // added in 874d0ece ("feat(import): gate CSV/URL import behind
  // platform-admin access") solely because one of the choice columns was the
  // admin-only Import Event card. That card was deleted in Commit 3b and
  // nothing else on this page is admin-only (public form: open to all
  // logged-in users; invitation draft: login-only server action), so every
  // logged-in user now sees both cards. Logged-out users never reach this
  // render: proxy.ts redirects /dashboard/* to /login?redirect=<original>.

  if (ctx.organizerIds.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm">
        <p className="text-2xl font-black text-zinc-950">Create an organizer profile first</p>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium text-zinc-500">
          You need an organizer profile before you can create events.
        </p>
        <Link
          href="/create-organizer"
          className="mt-6 inline-block rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700"
        >
          Create Organization Profile
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Open header — option links below are interactive surfaces and keep their boundaries. */}
      <header className="pb-1">
        <p className="text-xs font-black uppercase tracking-wide text-orange-600">Events</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Create New Event</h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">
          Choose how your event is shared: a public event anyone can discover, or a
          private invitation for your guest list.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <Link
          href="/create-event?from=new"
          className="rounded-2xl border border-orange-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-sm font-black uppercase tracking-wide text-orange-600">Create</p>
          <h2 className="mt-2 text-2xl font-black text-zinc-950">Create from scratch</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Build a fresh event with your own details, ticket types, venue, images, and checkout.
          </p>
          <span className="mt-5 inline-block rounded-xl bg-orange-600 px-5 py-3 text-sm font-black text-white">
            Start Event
          </span>
        </Link>

        <CreateInvitationCard />
      </div>
    </div>
  );
}
