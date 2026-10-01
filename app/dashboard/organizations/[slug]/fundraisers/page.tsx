import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Heart, Plus } from "lucide-react";
import { ResponsiveDataTable } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";

function money(v: number | string | null) {
  return `$${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function OrgFundraisersPage({
  params,
}: {
  params: Promise<{ slug: string }>;
}) {
  const { slug } = await params;
  const supabase = createSupabaseAdmin();

  const { data: org } = await supabase
    .from("organizers").select("id").eq("slug", slug).maybeSingle();

  const { data: fundraisers } = org
    ? await supabase
        .from("fundraisers")
        .select("id, title, slug, goal, raised, status, created_at")
        .eq("organizer_id", org.id)
        .is("deleted_at", null)
        .order("created_at", { ascending: false })
    : { data: [] };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <p className="text-xs font-black uppercase tracking-wide text-orange-600">Organization</p>
          <h1 className="mt-1 text-2xl font-black">Fundraisers</h1>
        </div>
        <Link
          href="/create-fundraiser"
          className="flex items-center gap-2 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white transition hover:bg-emerald-700"
        >
          <Plus className="h-4 w-4" /> New Fundraiser
        </Link>
      </div>

      {(fundraisers ?? []).length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-300 bg-white py-16 text-center">
          <Heart className="mb-3 h-10 w-10 text-zinc-300" />
          <p className="font-black text-zinc-900">No fundraisers yet</p>
          <p className="mt-1 text-sm text-zinc-500">Launch your first fundraiser campaign.</p>
          <Link href="/create-fundraiser" className="mt-4 rounded-xl bg-emerald-600 px-4 py-2.5 text-sm font-black text-white hover:bg-emerald-700">
            Start Fundraiser
          </Link>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <ResponsiveDataTable
            columns={[
              { id: "campaign", header: "Campaign" },
              { id: "raised", header: "Raised" },
              { id: "goal", header: "Goal", hideBelow: "md" },
              { id: "progress", header: "Progress", hideBelow: "lg" },
              { id: "status", header: "Status" },
              { id: "actions", header: "", align: "right" },
            ]}
          >
            {(fundraisers ?? []).map((f) => {
              const pct = Number(f.goal) > 0 ? Math.min(100, Math.round((Number(f.raised) / Number(f.goal)) * 100)) : 0;
              const statusBadge = (
                <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                  f.status === "published" ? "bg-emerald-100 text-emerald-700" :
                  f.status === "draft" ? "bg-zinc-100 text-zinc-600" : "bg-yellow-100 text-yellow-700"
                }`}>
                  {f.status ?? "draft"}
                </span>
              );

              return (
                <ResponsiveDataRow
                  key={f.id}
                  id={f.id}
                  desktopCells={[
                    <span key="title" className="font-bold text-zinc-900 block">{f.title}</span>,
                    <span key="raised" className="font-bold text-emerald-700 block">{money(f.raised)}</span>,
                    <span key="goal" className="text-zinc-600 block">{money(f.goal)}</span>,
                    <div key="progress">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="mt-0.5 text-xs text-zinc-500">{pct}%</span>
                    </div>,
                    <div key="status">{statusBadge}</div>,
                    <div key="actions" className="text-right">
                      <Link href={`/fundraisers/${f.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>
                    </div>,
                  ]}
                  identity={<span className="font-bold text-zinc-950 text-left line-clamp-1">{f.title}</span>}
                  primaryValue={<span className="font-bold text-emerald-700 tabular-nums">{money(f.raised)}</span>}
                  state={statusBadge}
                  secondary={[`${pct}% funded`, `Goal: ${money(f.goal)}`]}
                  actions={<Link href={`/fundraisers/${f.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>}
                  expandedDetails={
                    <div className="space-y-1 text-xs text-zinc-600 py-1">
                      <div><span className="font-bold text-zinc-500">Goal:</span> {money(f.goal)}</div>
                      <div><span className="font-bold text-zinc-500">Progress:</span> {pct}%</div>
                    </div>
                  }
                />
              );
            })}
          </ResponsiveDataTable>
        </div>
      )}
    </div>
  );
}
