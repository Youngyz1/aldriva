import { Suspense } from "react";
import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/admin-data";
import Link from "next/link";
import { ResponsiveDataTable } from "@/components/dashboard/ResponsiveDataTable";
import { ResponsiveDataRow } from "@/components/dashboard/ResponsiveDataRow";

function ReviewQueueSkeleton() {
  return (
    <div className="space-y-6 p-6 animate-pulse">
      <div className="h-8 w-64 bg-zinc-200 rounded" />
      <div className="h-64 w-full bg-zinc-200 rounded-xl" />
    </div>
  );
}

async function AdminBusinessReviewQueueContent({ searchParams }: { searchParams: Promise<{ page?: string }> }) {
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

      <div className="overflow-hidden rounded-xl border bg-white">
        <ResponsiveDataTable
          totalCount={businesses?.length || 0}
          emptyMessage="No pending businesses."
          columns={[
            { id: "business", header: "Business" },
            { id: "owner", header: "Owner", hideBelow: "md" },
            { id: "category", header: "Category", hideBelow: "lg" },
            { id: "risk", header: "Risk" },
            { id: "reasons", header: "Reasons", hideBelow: "lg" },
            { id: "actions", header: "Actions", align: "right" },
          ]}
        >
          {(businesses || []).map((b: any) => {
            const ev = eventsByBusiness[b.id];
            const actionButtons = (
              <div className="flex justify-end gap-2">
                <form action={`/api/admin/businesses/${b.id}`} method="POST">
                  <button
                    formAction={`/api/admin/businesses/${b.id}?status=active`}
                    className="rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-bold text-white hover:bg-emerald-700 transition"
                  >
                    Approve
                  </button>
                </form>
                <Link
                  href={`/admin/businesses?tab=pending_review`}
                  className="rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                >
                  View
                </Link>
              </div>
            );

            return (
              <ResponsiveDataRow
                key={b.id}
                id={b.id}
                desktopCells={[
                  <div key="name" className="font-semibold">
                    {b.name}
                    <div className="text-xs text-zinc-500 font-normal">{b.id.slice(0, 8)}</div>
                  </div>,
                  <span key="owner">{owners[b.owner_id]?.display_name || b.owner_id?.slice(0, 8) || "—"}</span>,
                  <span key="cat">
                    {b.category} <span className="text-xs text-zinc-500">({b.industry})</span>
                  </span>,
                  <span key="risk" className="font-mono font-bold text-zinc-900">{b.screening_risk_score ?? "—"}</span>,
                  <span key="reasons" className="text-xs max-w-[300px] truncate block text-zinc-500">
                    {ev ? JSON.stringify(ev.reasons) : "—"}
                  </span>,
                  <div key="actions" className="flex justify-end gap-2">
                    {actionButtons}
                  </div>,
                ]}
                identity={
                  <span className="font-bold text-zinc-950 text-left line-clamp-1">
                    {b.name}
                  </span>
                }
                primaryMeta={
                  <span className="text-xs text-zinc-500">
                    {owners[b.owner_id]?.display_name || "Owner"} · {b.category}
                  </span>
                }
                statusBadge={
                  <span className="rounded-full bg-amber-50 px-2.5 py-0.5 text-xs font-bold uppercase text-amber-700 border border-amber-200">
                    Pending Review
                  </span>
                }
                numericMetric={
                  b.screening_risk_score != null ? (
                    <span className="font-mono font-bold text-xs bg-zinc-100 px-2 py-0.5 rounded text-zinc-700">
                      Risk: {b.screening_risk_score}
                    </span>
                  ) : undefined
                }
                actions={actionButtons}
                mobileDetails={
                  <div className="space-y-2 text-xs text-zinc-600">
                    <div><span className="font-bold text-zinc-500">Owner:</span> {owners[b.owner_id]?.display_name || b.owner_id || "—"}</div>
                    <div><span className="font-bold text-zinc-500">Category / Industry:</span> {b.category} ({b.industry})</div>
                    <div><span className="font-bold text-zinc-500">Risk Score:</span> {b.screening_risk_score ?? "—"}</div>
                    {ev && <div><span className="font-bold text-zinc-500">Reasons:</span> {JSON.stringify(ev.reasons)}</div>}
                  </div>
                }
              />
            );
          })}
        </ResponsiveDataTable>
      </div>

      <div className="flex gap-2">
        {page > 1 && <Link href={`?page=${page-1}`} className="rounded border px-3 py-1 text-sm font-semibold hover:bg-zinc-50">Previous</Link>}
        <Link href={`?page=${page+1}`} className="rounded border px-3 py-1 text-sm font-semibold hover:bg-zinc-50">Next (50 per page)</Link>
      </div>
      <p className="text-xs text-zinc-400">is_flagged toggle available in main Businesses admin (/admin/businesses) — already exists.</p>
    </div>
  );
}

export default function AdminBusinessReviewQueuePage(props: { searchParams: Promise<{ page?: string }> }) {
  return (
    <Suspense fallback={<ReviewQueueSkeleton />}>
      <AdminBusinessReviewQueueContent {...props} />
    </Suspense>
  );
}
