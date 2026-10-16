import type { SupabaseClient } from "@supabase/supabase-js";

export type WebsiteCatalogAdapter = "menu" | "products";

export interface WebsiteCatalogAvailability {
  menuItems: boolean;
  products: boolean;
}

/** Pick the catalog that exists, using business kind only to break a tie. */
export function resolveWebsiteCatalogAdapter(
  availability: WebsiteCatalogAvailability,
  business?: { category?: string | null; businessType?: string | null }
): WebsiteCatalogAdapter | undefined {
  if (availability.menuItems && !availability.products) return "menu";
  if (availability.products && !availability.menuItems) return "products";
  if (!availability.menuItems && !availability.products) return undefined;

  const kind = `${business?.category ?? ""} ${business?.businessType ?? ""}`.toLowerCase();
  if (/retail|store|shop|boutique|product/.test(kind)) return "products";
  return "menu";
}

/** Read-only availability query; errors fail closed so empty/unsupported catalogs stay hidden. */
export async function getWebsiteCatalogAvailability(
  client: SupabaseClient,
  tenantId: string,
  businessId?: string | null
): Promise<WebsiteCatalogAvailability> {
  if (!tenantId) return { menuItems: false, products: false };
  try {
    const [{ data: sections, error: sectionsError }, productResult] = await Promise.all([
      client
        .from("menu_sections")
        .select("id")
        .eq("organizer_id", tenantId)
        .eq("is_active", true),
      businessId
        ? client
            .from("products")
            .select("id", { count: "exact", head: true })
            .eq("business_id", businessId)
            .eq("status", "active")
        : Promise.resolve({ count: 0, error: null }),
    ]);

    let menuItems = false;
    if (!sectionsError && Array.isArray(sections) && sections.length > 0) {
      const { count, error } = await client
        .from("menu_items")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", tenantId)
        .eq("is_active", true)
        .in("section_id", sections.map((section: { id: string }) => section.id));
      menuItems = !error && (count ?? 0) > 0;
    }

    return {
      menuItems,
      products: !productResult.error && (productResult.count ?? 0) > 0,
    };
  } catch {
    return { menuItems: false, products: false };
  }
}
