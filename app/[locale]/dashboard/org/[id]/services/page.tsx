import { requireTenantContext } from "@/lib/tenant-context";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { checkTenantAccess } from "@/lib/entity-auth";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";
import { ServicesManager } from "@/components/dashboard/services/ServicesManager";

export default async function ServicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Unauthorized</div>;
  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  } catch {
    return <div className="p-6">Forbidden</div>;
  }
  const access = await checkTenantAccess(user.id, organizerId, ["owner","admin","manager","editor","finance","viewer"]);
  const role = access.role;
  const canEdit = role ? ["owner","admin","manager","editor"].includes(role) : false;
  const canDelete = role ? ["owner","admin","manager"].includes(role) : false;
  const admin = createSupabaseAdmin();
  const { data: services } = await admin.from("services").select("*").eq("organizer_id", organizerId).order("position").order("created_at");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Services</h1>
        {canEdit && (
          <Link href={`/dashboard/org/${organizerId}/services/new`}>
            <Button><Plus className="h-4 w-4 mr-2" />New Service</Button>
          </Link>
        )}
      </div>
      <ServicesManager organizerId={organizerId} services={services || []} canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}
