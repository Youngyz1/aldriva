import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/admin-data";
import Link from "next/link";

export default async function AdminBusinessReviewQueuePage({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
  await requireAdmin();
  const params = await searchParams;
  const page = Math.max(1, Number(params.page || "1"));
  const perPage = 50;
  const offset = (page - 1) * perPage;

  // Fetch pending_review businesses ordered by screening_risk_score desc then created_at asc
  const { data: businesses, error } = await supabaseAdmin
    .from("businesses")
    .select("id, name, owner_id, category, industry, screening_risk_score, created_at, status, is_flagged")
    .eq("status", "pending_review")
    .order("screening_risk_score", { ascending: false, nullsFirst: false })
    .order("created_at", { ascending: true })
    .range(offset, offset + perPage - 1);

  if (error) {
    return <div className="p-6">Failed to load queue: {error.message}</div>;
  }

  // Fetch latest moderation event per business (simple: fetch recent events for these ids)
  const ids = (businesses || []).map((b: any) => b.id);
  let eventsByBusiness: Record<string, any> = {};
  if (ids.length > 0) {
    const { data: events } = await supabaseAdmin
      .from("business_moderation_events")
      .select("business_id, decision, risk_score, reasons, created_at")
      .in("business_id", ids)
      .order("created_at", { ascending: false });
    for (const ev of (events as any[]) || []) {
      if (!eventsByBusiness[ev.business_id]) eventsByBusiness[ev.business_id] = ev;
    }
  }

  // Fetch owner profiles for display
  const ownerIds = [...new Set((businesses || []).map((b: any) => b.owner_id).filter(Boolean))];
  let owners: Record<string, any> = {};
  if (ownerIds.length > 0) {
    const { data: profiles } = await supabaseAdmin.from("profiles").select("id, display_name, role").in("id", ownerIds);
    for (const p of (profiles as any[]) || []) owners[p.id] = p;
  }

  return (
    <div className="space-y-6 p-6">
      <header>
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-2xl font-black">Business Review Queue</h1>
        <p className="mt-2 text-sm text-zinc-500">Pending review businesses ordered by screening_risk_score desc then created_at asc. Showing {businesses?.length || 0} of page {page}.</p>
      </header>
      <div className="overflow-x-auto rounded-xl border bg-white">
        <table className="w-full min-w-[900px] text-left text-sm">
          <thead className="bg-zinc-50 text-xs font-black uppercase tracking-wide text-zinc-400">
            <tr>
              <th className="px-4 py-3">Business</th>
              <th className="px-4 py-3">Owner</th>
              <th className="px-4 py-3">Category</th>
              <th className="px-4 py-3">Risk</th>
              <th className="px-4 py-3">Reasons</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y">
            {(businesses || []).map((b: any) => {
              const ev = eventsByBusiness[b.id];
              return (
                <tr key={b.id}>
                  <td className="px-4 py-3 font-semibold">{b.name}<div className="text-xs text-zinc-500">{b.id.slice(0,8)}</div></td>
                  <td className="px-4 py-3">{owners[b.owner_id]?.display_name || b.owner_id?.slice(0,8) || "—"}</td>
                  <td className="px-4 py-3">{b.category} <span className="text-xs text-zinc-500">({b.industry})</span></td>
                  <td className="px-4 py-3 font-mono">{b.screening_risk_score ?? "—"}</td>
                  <td className="px-4 py-3 text-xs max-w-[300px] truncate">{ev ? JSON.stringify(ev.reasons) : "—"}</td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex justify-end gap-2">
                      <form action={`/api/admin/businesses/${b.id}`} method="POST">
                        <button formAction={`/api/admin/businesses/${b.id}?status=active`} className="rounded bg-emerald-600 px-3 py-1 text-xs font-bold text-white">Approve</button>
                      </form>
                      <Link href={`/admin/businesses?tab=pending_review`} className="rounded border px-3 py-1 text-xs">View</Link>
                    </div>
                  </td>
                </tr>
              );
            })}
            {(!businesses || businesses.length === 0) && (
              <tr><td colSpan={6} className="py-8 text-center text-sm text-zinc-400">No pending businesses.</td></tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex gap-2">
        {page > 1 && <Link href={`?page=${page-1}`} className="rounded border px-3 py-1 text-sm">Previous</Link>}
        <Link href={`?page=${page+1}`} className="rounded border px-3 py-1 text-sm">Next (50 per page)</Link>
      </div>
      <p className="text-xs text-zinc-400">is_flagged toggle available in main Businesses admin (/admin/businesses) — already exists.</p>
    </div>
  );
}
