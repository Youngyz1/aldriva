import { notFound } from "next/navigation";
import { assertCanManageFundraiser } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";

export default async function BeneficiariesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageFundraiser(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();
  const { data: f } = await admin.from("fundraisers").select("beneficiary, beneficiary_id").eq("id", id).maybeSingle();
  const ben = f?.beneficiary as { name?: string; type?: string } | null;
  return (
    <div className="space-y-4">
      <h1 className="text-lg font-black">Beneficiaries</h1>
      <Card><CardHeader><CardTitle className="text-sm">Beneficiary for this fundraiser</CardTitle></CardHeader><CardContent>
        {ben?.name ? <p className="text-sm"><span className="font-bold">{ben.name}</span> — {ben.type}</p> : <p className="text-sm text-zinc-500">No beneficiary set. Invitation flow (add → invite → accept) is preserved in fundraiser creation.</p>}
        <p className="mt-2 text-xs text-zinc-500">Beneficiary is NOT owner — separate relationship via fundraisers.beneficiary JSONB and beneficiary_accounts. RLS and ledger preserved.</p>
      </CardContent></Card>
    </div>
  );
}
