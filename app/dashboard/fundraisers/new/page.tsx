import Link from "next/link";
import { redirect } from "next/navigation";
import { getDashboardContext } from "@/lib/dashboard-context";

export default async function NewDashboardFundraiserPage() {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  if (ctx.organizerIds.length === 0) {
    return (
      <div className="rounded-2xl border border-dashed border-zinc-300 bg-white px-6 py-16 text-center shadow-sm">
        <p className="text-2xl font-black text-zinc-950">Create an organizer profile first</p>
        <p className="mx-auto mt-2 max-w-md text-sm font-medium text-zinc-500">
          You need an organizer profile before you can create or import fundraisers.
        </p>
        <Link
          href="/create-organizer"
          className="mt-6 inline-block rounded-xl bg-emerald-600 px-6 py-3 text-sm font-black text-white hover:bg-emerald-700"
        >
          Create Organization Profile
        </Link>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-emerald-600">Fundraisers</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Create New Fundraiser</h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">
          Start a campaign from scratch or import one from a source page.
        </p>
      </header>

      <div className="grid gap-5 md:grid-cols-2">
        <Link
          href="/create-fundraiser"
          className="rounded-2xl border border-emerald-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:shadow-md"
        >
          <p className="text-sm font-black uppercase tracking-wide text-emerald-600">Create</p>
          <h2 className="mt-2 text-2xl font-black text-zinc-950">Create from scratch</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Build a new campaign with your story, goal, images, and Aldriva donation checkout.
          </p>
          <span className="mt-5 inline-block rounded-xl bg-emerald-600 px-5 py-3 text-sm font-black text-white">
            Start Fundraiser
          </span>
        </Link>

        <Link
          href="/import?mode=fundraisers"
          className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-sm transition hover:-translate-y-0.5 hover:border-emerald-200 hover:shadow-md"
        >
          <p className="text-sm font-black uppercase tracking-wide text-zinc-500">Import</p>
          <h2 className="mt-2 text-2xl font-black text-zinc-950">Import fundraiser</h2>
          <p className="mt-3 text-sm leading-6 text-zinc-600">
            Bring in campaign data from a URL or CSV, review it, then save it to your organizer account.
          </p>
          <span className="mt-5 inline-block rounded-xl border border-emerald-200 px-5 py-3 text-sm font-black text-emerald-700">
            Import Fundraiser
          </span>
        </Link>
      </div>
    </div>
  );
}
