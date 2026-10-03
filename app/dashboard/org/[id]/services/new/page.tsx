import { getCurrentUser } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { ServiceForm } from "@/components/dashboard/services/ServiceForm";

export default async function NewServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Unauthorized</div>;
  try { await requireTenantContext(user.id, organizerId, ["owner","admin","manager","editor"]); } catch { return <div className="p-6">Forbidden</div>; }
  return <div className="p-6 space-y-4"><h1 className="text-xl font-semibold">New Service</h1><ServiceForm organizerId={organizerId} tenantId={organizerId} /></div>;
}
