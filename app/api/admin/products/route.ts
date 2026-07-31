import { NextRequest, NextResponse } from "next/server";
import { isAdmin } from "@/lib/auth";
import { parsePageParams } from "@/lib/admin-query";
import { supabaseAdmin, listAllAuthUsers } from "@/lib/admin-data";
import { getUserDisplayName } from "@/lib/admin-query";

export async function GET(req: NextRequest) {
  if (!(await isAdmin())) {
    return NextResponse.json({ error: "Forbidden" }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const { page, perPage, offset } = parsePageParams(sp);
  const statusTab = sp.get("tab") ?? sp.get("status") ?? "all";
  const search = sp.get("search") ?? "";

  try {
    // 1. Fetch products
    const { data: products, error } = await supabaseAdmin
      .from("products")
      .select("*")
      .order("created_at", { ascending: false });

    if (error) throw new Error(error.message);

    // Fetch profiles for the owners of these products
    const ownerIds = [...new Set((products ?? []).map((p) => p.owner_id))];
    let profilesMap = new Map();
    if (ownerIds.length > 0) {
      const { data: profiles, error: profilesError } = await supabaseAdmin
        .from("profiles")
        .select("id, display_name, account_info")
        .in("id", ownerIds);
      if (profilesError) throw new Error(profilesError.message);
      profilesMap = new Map(profiles?.map((p) => [p.id, p]));
    }

    // 2. Fetch all auth users to match emails
    const authResult = await listAllAuthUsers();
    if (authResult.error) throw new Error(authResult.error);

    const emailMap = new Map(authResult.users.map((u) => [u.id, u.email ?? ""]));
    const authUserMap = new Map(authResult.users.map((u) => [u.id, u]));

    // 3. Map and enrich
    const mapped = (products ?? []).map((p) => {
      const authUser = authUserMap.get(p.owner_id);
      const email = emailMap.get(p.owner_id) ?? "";
      const profile = profilesMap.get(p.owner_id) ?? null;
      const ownerName = authUser
        ? getUserDisplayName(profile, authUser)
        : "Unknown";

      return {
        id: p.id,
        name: p.name,
        slug: p.slug,
        price_type: p.price_type,
        status: p.status,
        stock_quantity: p.stock_quantity,
        rejection_reason: p.rejection_reason ?? null,
        created_at: p.created_at,
        owner_name: ownerName,
        owner_email: email,
      };
    });

    // 4. Search Filter
    const filtered = mapped.filter((p) => {
      if (!search.trim()) return true;
      const term = search.toLowerCase();
      return (
        p.name.toLowerCase().includes(term) ||
        p.owner_name.toLowerCase().includes(term) ||
        p.owner_email.toLowerCase().includes(term)
      );
    });

    // 5. Status Filter
    const statusFiltered = filtered.filter((p) => {
      if (statusTab === "all") return true;
      return p.status === statusTab;
    });

    // 6. Pagination
    const total = statusFiltered.length;
    const paginated = statusFiltered.slice(offset, offset + perPage);

    // 7. Stats (calculated on the pre-status-filtered search results so counts are accurate for the current search context)
    const stats = {
      total: filtered.length,
      pending_review: filtered.filter((p) => p.status === "pending_review").length,
      active: filtered.filter((p) => p.status === "active").length,
      out_of_stock: filtered.filter((p) => p.status === "out_of_stock").length,
      rejected: filtered.filter((p) => p.status === "rejected").length,
      archived: filtered.filter((p) => p.status === "archived").length,
    };

    return NextResponse.json({
      products: paginated,
      stats,
      total,
      page,
      per_page: perPage,
      total_pages: Math.ceil(total / perPage),
    });
  } catch (err) {
    const msg = err instanceof Error ? err.message : "Failed to load products.";
    return NextResponse.json({ error: msg }, { status: 500 });
  }
}
