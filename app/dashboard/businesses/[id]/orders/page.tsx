import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
export default async function OrdersPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();
  return <div className="space-y-4"><h1 className="text-lg font-black">Orders</h1><p className="text-sm text-zinc-600">Orders for business {id.slice(0,8)} — scoped via business_id.</p></div>;
}
