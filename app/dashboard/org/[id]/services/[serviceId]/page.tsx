import { getCurrentUser } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { ServiceForm } from "@/components/dashboard/services/ServiceForm";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function ServiceEditPage({ params }: { params: Promise<{ id: string; serviceId: string }> }) {
  const { id: organizerId, serviceId } = await params as any;
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Unauthorized</div>;
  try { await requireTenantContext(user.id, organizerId, ["owner","admin","manager","editor"]); } catch { return <div className="p-6">Forbidden</div>; }
  const admin = createSupabaseAdmin();
  const { data: service } = await admin.from("services").select("*").eq("id", serviceId).eq("organizer_id", organizerId).maybeSingle();
  if (!service) return <div className="p-6">Service not found</div>;
  const { data: tiers } = await admin.from("service_tiers").select("*").eq("service_id", serviceId).order("position");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-semibold">Edit Service</h1>
        <Link href={`/dashboard/org/${organizerId}/services`}><Button variant="outline">Back to Services</Button></Link>
      </div>
      <ServiceForm organizerId={organizerId} service={service} tenantId={organizerId} />
      <div className="pt-6 border-t">
        <h2 className="font-medium mb-2">Service Tiers {tiers?.length ? `(${tiers.length})` : ""}</h2>
        <div className="text-sm text-zinc-500">{tiers && tiers.length > 0 ? tiers.map((t:any)=> t.name).join(", ") : "No tiers yet. Add tiers from the tier manager."}</div>
        <div className="text-xs text-zinc-400 mt-1">Tier management (add/edit/reorder/delete) available — see Service Tiers section.</div>
      </div>
    </div>
  );
}
