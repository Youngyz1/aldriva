import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
export default async function ReviewsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();
  return <div className="space-y-4"><h1 className="text-lg font-black">Reviews</h1><p className="text-sm text-zinc-600">Reviews for business {id.slice(0,8)}.</p></div>;
}
