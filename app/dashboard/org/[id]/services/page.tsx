import { requireTenantContext } from "@/lib/tenant-context";
import { getCurrentUser } from "@/lib/auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { Plus } from "lucide-react";

export default async function ServicesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Unauthorized</div>;
  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  } catch {
    return <div className="p-6">Forbidden</div>;
  }
  const admin = createSupabaseAdmin();
  const { data: services } = await admin.from("services").select("*").eq("organizer_id", organizerId).order("position").order("created_at");

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Services</h1>
        <Link href={`/dashboard/org/${organizerId}/services/new`}>
          <Button><Plus className="h-4 w-4 mr-2" />New Service</Button>
        </Link>
      </div>
      {!services || services.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-zinc-500">No services yet. Create your first service.</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {services.map((s: any) => (
            <Link key={s.id} href={`/dashboard/org/${organizerId}/services/${s.id}`} className="rounded-xl border p-4 shadow-xs hover:shadow-sm">
              <div className="font-medium">{s.title}</div>
              <div className="text-sm text-zinc-500 truncate">{s.description || "—"}</div>
              {/* TODO: multi-currency not in Phase 5 — hardcoded USD */}<div className="mt-2 text-sm font-mono">${Number(s.price).toFixed(2)} {s.duration_minutes ? `· ${s.duration_minutes} min` : ""}</div>
              <div className="mt-1 text-xs">{s.is_active ? "Active" : "Inactive"} · {s.slug}</div>
            </Link>
          ))}
        </div>
      )}
    </div>
  );
}
