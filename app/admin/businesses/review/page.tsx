import { requireAdmin } from "@/lib/auth";
import { supabaseAdmin } from "@/lib/admin-data";
import ReviewQueueClient, { type ReviewQueueRow } from "./ReviewQueueClient";

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

  // Total pending for the footer pagination (exact head:true count).
  const { count: pendingTotal } = await supabaseAdmin
    .from("businesses")
    .select("id", { count: "exact", head: true })
    .eq("status", "pending_review");

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

  const rows: ReviewQueueRow[] = (businesses || []).map((b: any) => {
    const ev = eventsByBusiness[b.id];
    return {
      id: String(b.id),
      name: String(b.name ?? "—"),
      idShort: String(b.id).slice(0, 8),
      owner:
        owners[b.owner_id]?.display_name || String(b.owner_id ?? "").slice(0, 8) || "—",
      category: String(b.category ?? "—"),
      industry: b.industry ?? null,
      risk: typeof b.screening_risk_score === "number" ? b.screening_risk_score : null,
      reasons: ev ? JSON.stringify(ev.reasons) : "—",
      created: String(b.created_at ?? ""),
      flagged: b.is_flagged === true,
    };
  });

  return (
    <ReviewQueueClient
      rows={rows}
      page={page}
      total={pendingTotal ?? 0}
      perPage={perPage}
    />
  );
}
