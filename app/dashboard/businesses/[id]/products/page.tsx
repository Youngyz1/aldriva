import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Button } from "@/components/ui/button";
export default async function BusinessProductsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();
  const admin = createSupabaseAdmin();
  const { data } = await admin.from("products").select("id, name, slug").eq("business_id", id).limit(20);
  return <div className="space-y-4"><h1 className="text-lg font-black">Products</h1>{(data??[]).length===0?<p className="text-sm text-zinc-500">No products yet.</p>:<ul className="divide-y">{(data??[]).map((p:{id:string;name:string}) => <li key={p.id} className="py-2 text-sm font-medium">{p.name}</li>)}</ul>}<Button asChild size="sm" className="mt-4"><Link href="/dashboard/products/new">Add product</Link></Button></div>;
}
