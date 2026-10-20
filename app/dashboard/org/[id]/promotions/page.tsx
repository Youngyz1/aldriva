import { getCurrentUser, isAdmin } from "@/lib/auth";
import { requireTenantContext } from "@/lib/tenant-context";
import { checkTenantAccess } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { listPromotions } from "@/lib/actions/promotions";
import { resolveStorefrontCurrency } from "@/lib/website-v2-theme";
import { PromotionsManager } from "@/components/dashboard/menu/PromotionsManager";

export default async function PromotionsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) return <div className="p-6">Unauthorized</div>;
  let platformAdmin = false;
  try {
    await requireTenantContext(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  } catch {
    platformAdmin = await isAdmin();
    if (!platformAdmin) return <div className="p-6">Forbidden</div>;
  }
  const access = await checkTenantAccess(user.id, organizerId, ["owner", "admin", "manager", "editor", "finance", "viewer"]);
  const role = access.role ?? (platformAdmin ? "admin" : "viewer");
  const admin = createSupabaseAdmin();
  const [{ data: sections }, { data: business }, { data: website }, promotionResult] = await Promise.all([
    admin.from("menu_sections").select("id, name, is_active").eq("organizer_id", organizerId).order("position", { ascending: true }),
    admin.from("businesses").select("country").eq("organizer_id", organizerId).order("created_at", { ascending: true }).limit(1).maybeSingle(),
    admin.from("tenant_websites").select("id, metadata").eq("tenant_id", organizerId).maybeSingle(),
    listPromotions(organizerId),
  ]);
  const sectionIds = (sections || []).map((section: { id: string }) => section.id);
  const { data: items } = sectionIds.length
    ? await admin.from("menu_items").select("id, section_id, name, price, promo_price, is_active, is_sold_out, option_groups, options_source, created_at").in("section_id", sectionIds).order("position", { ascending: true })
    : { data: [] };
  const normalizedItemIds = (items || []).filter((item: any) => item.options_source === "normalized").map((item: any) => item.id);
  const variantItemIds = new Set<string>((items || []).filter((item: any) =>
    item.options_source !== "normalized" && Array.isArray(item.option_groups) && item.option_groups.some((group: any) => group?.kind === "variant")
  ).map((item: any) => item.id));
  if (normalizedItemIds.length > 0) {
    const { data: assignments } = await admin.from("menu_item_option_groups").select("item_id, group_id").in("item_id", normalizedItemIds);
    const groupIds = [...new Set((assignments || []).map((row: any) => row.group_id))];
    if (groupIds.length > 0) {
      const { data: groups } = await admin.from("menu_option_groups").select("id, kind").in("id", groupIds);
      const variantGroupIds = new Set((groups || []).filter((group: any) => group.kind === "variant").map((group: any) => group.id));
      for (const row of assignments || []) if (variantGroupIds.has(row.group_id)) variantItemIds.add(row.item_id);
    }
  }
  let menuPagePublished = false;
  if (website?.id) {
    const { data: menuPage } = await admin.from("website_pages").select("id").eq("website_id", website.id).eq("slug", "menu").eq("status", "published").maybeSingle();
    menuPagePublished = Boolean(menuPage);
  }
  const promotions = promotionResult.success && promotionResult.data ? promotionResult.data.promotions : [];
  const loadError = promotionResult.success ? null : promotionResult.error;
  const currency = resolveStorefrontCurrency(website?.metadata, business?.country);

  return (
    <div className="space-y-6">
      <header className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p className="text-sm font-medium text-orange-700">Menu management</p>
          <h1 className="text-2xl font-semibold tracking-tight text-zinc-900">Promotions</h1>
          <p className="mt-1 max-w-2xl text-sm text-zinc-600">Create menu offers and control where they appear. Prices are checked again when an order is placed.</p>
        </div>
      </header>
      <PromotionsManager
        organizerId={organizerId}
        tenantId={organizerId}
        role={role}
        promotions={promotions}
        sections={sections || []}
        items={items || []}
        variantItemIds={[...variantItemIds]}
        currency={currency}
        menuPagePublished={menuPagePublished}
        loadError={loadError}
      />
    </div>
  );
}
