import { notFound } from "next/navigation";
import { assertCanManageBusiness } from "@/lib/entity-authz";
export default async function AnalyticsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const auth = await assertCanManageBusiness(id);
  if (!auth.ok) return notFound();
  return <div className="space-y-4"><h1 className="text-lg font-black">Analytics</h1><p className="text-sm text-zinc-600">Business analytics for {id.slice(0,8)}.</p></div>;
}
