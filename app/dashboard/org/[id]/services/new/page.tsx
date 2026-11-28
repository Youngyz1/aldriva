import { getCurrentUser } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { ServiceForm } from "@/components/dashboard/services/ServiceForm";
import { listServiceCategories } from "@/lib/actions/service-categories";

export default async function NewServicePage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Unauthorized</div>;
  try { await requireTenantContext(user.id, organizerId, ["owner","admin","manager","editor"]); } catch { return <div className="p-6">Forbidden</div>; }
  const categoriesResult = await listServiceCategories(organizerId);
  return (
    <div className="p-6 space-y-4" key="new-service">
      <h1 className="text-xl font-semibold">New Service</h1>
      <ServiceForm
        key="new"
        organizerId={organizerId}
        tenantId={organizerId}
        categories={categoriesResult.data.map((c) => ({ id: c.id, title: c.title }))}
      />
    </div>
  );
}
