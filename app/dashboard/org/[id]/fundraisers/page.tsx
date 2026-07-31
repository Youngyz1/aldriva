import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Heart, Plus } from "lucide-react";

function money(v: number | string | null) {
  return `$${Number(v ?? 0).toLocaleString(undefined, { maximumFractionDigits: 0 })}`;
}

export default async function OrgFundraisersPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = createSupabaseAdmin();

  const { data: fundraisers } = await supabase
    .from("fundraisers")
    .select("id, title, slug, goal, raised, status, created_at")
    .eq("organizer_id", id)
    .is("deleted_at", null)
    .order("created_at", { ascending: false });

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
        <div className="overflow-x-auto rounded-2xl border border-zinc-200 bg-white shadow-sm">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="border-b border-zinc-100 bg-zinc-50">
              <tr>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Campaign</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Raised</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Goal</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Progress</th>
                <th className="px-5 py-3 text-left text-xs font-black uppercase tracking-wide text-zinc-500">Status</th>
                <th className="px-5 py-3"></th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {(fundraisers ?? []).map((f) => {
                const pct = Number(f.goal) > 0 ? Math.min(100, Math.round((Number(f.raised) / Number(f.goal)) * 100)) : 0;
                return (
                  <tr key={f.id} className="hover:bg-zinc-50">
                    <td className="px-5 py-4 font-bold text-zinc-900">{f.title}</td>
                    <td className="px-5 py-4 font-bold text-emerald-700">{money(f.raised)}</td>
                    <td className="px-5 py-4 text-zinc-600">{money(f.goal)}</td>
                    <td className="px-5 py-4">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-zinc-100">
                        <div className="h-full rounded-full bg-emerald-500" style={{ width: `${pct}%` }} />
                      </div>
                      <span className="mt-0.5 text-xs text-zinc-500">{pct}%</span>
                    </td>
                    <td className="px-5 py-4">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        f.status === "published" ? "bg-emerald-100 text-emerald-700" :
                        f.status === "draft" ? "bg-zinc-100 text-zinc-600" : "bg-yellow-100 text-yellow-700"
                      }`}>{f.status ?? "draft"}</span>
                    </td>
                    <td className="px-5 py-4 text-right">
                      <Link href={`/fundraisers/${f.slug}`} className="text-xs font-bold text-orange-600 hover:underline">View</Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
