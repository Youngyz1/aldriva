import { notFound } from "next/navigation";
import { assertCanManageFundraiser } from "@/lib/entity-authz";
export default async function DonorsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageFundraiser(id);
  if (!auth.ok) return notFound();
  return <div className="space-y-4"><h1 className="text-lg font-black">Donors</h1><p className="text-sm text-zinc-600">Donors for fundraiser {id.slice(0,8)} — scoped query via fundraiser_id.</p></div>;
}
