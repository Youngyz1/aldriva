import { getCurrentUser } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { MenuManager } from "@/components/dashboard/menu/MenuManager";

export default async function MenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Unauthorized</div>;
  try { await requireTenantContext(user.id, organizerId, ["owner","admin","manager","editor","finance","viewer"]); } catch { return <div className="p-6">Forbidden</div>; }
  const access = await checkTenantAccess(user.id, organizerId, ["owner","admin","manager","editor","finance","viewer"]);
  const role = access.role;
  const canEdit = role ? ["owner","admin","manager","editor"].includes(role) : false;
  const canDelete = role ? ["owner","admin","manager"].includes(role) : false;
  const admin = createSupabaseAdmin();
  const { data: sections } = await admin.from("menu_sections").select("*").eq("organizer_id", organizerId).order("position");
  const sectionIds = (sections || []).map((s:any)=> s.id);
  let itemsBySection: Record<string, any[]> = {};
  if (sectionIds.length > 0) {
    const { data: items } = await admin.from("menu_items").select("*").in("section_id", sectionIds).order("position");
    for (const it of (items || []) as any[]) {
      itemsBySection[it.section_id] = itemsBySection[it.section_id] || [];
      itemsBySection[it.section_id].push(it);
    }
  }

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-semibold">Menu</h1>
        <div className="text-sm text-zinc-500">Published by adding a Menu block in the website builder.</div>
      </div>
      <MenuManager organizerId={organizerId} sections={sections || []} itemsBySection={itemsBySection} tenantId={organizerId} canEdit={canEdit} canDelete={canDelete} />
    </div>
  );
}
