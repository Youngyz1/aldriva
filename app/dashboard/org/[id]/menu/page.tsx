import { getCurrentUser } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import Link from "next/link";
import { Button } from "@/components/ui/button";

export default async function MenuPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Unauthorized</div>;
  try { await requireTenantContext(user.id, organizerId, ["owner","admin","manager","editor","finance","viewer"]); } catch { return <div className="p-6">Forbidden</div>; }
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
        <div className="text-sm text-zinc-500">QR-ready: /site/[slug]/menu</div>
      </div>
      {!sections || sections.length === 0 ? (
        <div className="rounded-xl border border-dashed p-12 text-center text-sm text-zinc-500">No sections yet. Create your first section.</div>
      ) : (
        <div className="space-y-4">
          {sections.map((sec:any)=> (
            <div key={sec.id} className="rounded-xl border p-4 shadow-xs">
              <div className="flex items-center justify-between">
                <div className="font-medium">{sec.name} {sec.is_active ? "" : "(Inactive)"}</div>
                <div className="text-xs">#{sec.position}</div>
              </div>
              {sec.description && <div className="text-sm text-zinc-500">{sec.description}</div>}
              <div className="mt-3 space-y-2">
                {(itemsBySection[sec.id] || []).map((it:any)=> (
                  <div key={it.id} className="rounded-lg border px-3 py-2 flex items-center justify-between">
                    <div>
                      <div className="font-medium text-sm">{it.name} {it.is_featured ? "★" : ""} {it.is_active ? "" : "(Inactive)"}</div>
                      <div className="text-xs text-zinc-500">${Number(it.price).toFixed(2)} {it.dietary_tags?.length ? `· ${it.dietary_tags.join(", ")}` : ""} {it.allergens?.length ? `· allergens: ${it.allergens.join(", ")}` : ""}</div>
                    </div>
                    <div className="text-xs">{it.modifiers?.length ? `${it.modifiers.length} modifiers` : ""}</div>
                  </div>
                ))}
                {(itemsBySection[sec.id] || []).length === 0 && <div className="text-xs text-zinc-400">No items in this section.</div>}
              </div>
            </div>
          ))}
        </div>
      )}
      <div className="pt-4"><Link href={`/dashboard/org/${organizerId}/services`}><Button variant="outline">Manage Services</Button></Link></div>
    </div>
  );
}
