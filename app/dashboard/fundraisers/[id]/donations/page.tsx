import { notFound } from "next/navigation";
import { assertCanManageFundraiser } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function FundraiserDonationsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageFundraiser(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("donations").select("id, donor_name, amount, created_at").eq("fundraiser_id", id).order("created_at", { ascending: false }).limit(50);
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black">Donations — scoped to fundraiser {id.slice(0, 8)}</h1>
      <Card><CardHeader><CardTitle className="text-sm">Recent donations</CardTitle></CardHeader><CardContent>
        {(data ?? []).length === 0 ? <p className="text-sm text-zinc-500">No donations yet.</p> : <ul className="divide-y">{(data ?? []).map((d: {id:string; donor_name:string; amount:number}) => <li key={d.id} className="py-2 flex justify-between text-sm"><span>{d.donor_name ?? "Anonymous"}</span><span className="font-bold">${Number(d.amount).toLocaleString()}</span></li>)}</ul>}
      </CardContent></Card>
    </div>
  );
}
