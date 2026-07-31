import Link from "next/link";
import { notFound, redirect } from "next/navigation";

import { getDashboardContext, supabaseAdmin } from "@/lib/dashboard-context";
import UpdatesClient from "./UpdatesClient";

export default async function FundraiserUpdatesPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const ctx = await getDashboardContext();
  if (!ctx) redirect("/login");

  const { id } = await params;

  const { data: fundraiser } = await supabaseAdmin
    .from("fundraisers")
    .select("id, title, organizer_id")
    .eq("id", id)
    .in("organizer_id", ctx.organizerIds)
    .maybeSingle();

  if (!fundraiser) return notFound();

  const { data: updates } = await supabaseAdmin
    .from("fundraiser_updates")
    .select("id, title, content, created_at")
    .eq("fundraiser_id", id)
    .order("created_at", { ascending: false });

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm">
        <Link
          href="/dashboard/fundraisers"
          className="text-sm font-black text-emerald-700 hover:text-emerald-800"
        >
          Back to fundraisers
        </Link>
        <h1 className="mt-3 text-2xl font-black tracking-tight text-zinc-950 sm:text-3xl">
          Updates for {fundraiser.title}
        </h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">
          Keep donors informed with campaign progress, milestones, and next steps.
        </p>
      </header>

      <UpdatesClient fundraiserId={fundraiser.id} initialUpdates={updates ?? []} />
    </div>
  );
}
