/**
 * components/dashboard/overview/modules/ProductsSection.tsx
 *
 * Hardened tenant-scoped Retail & Products section with stock, low stock, and product items.
 * docs/design/dashboard-overview/03-category-capability-matrix.md §2.3.
 */

import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { StatCard } from "../StatCard";
import { EmptyState } from "../EmptyState";
import {
  IconShoppingBag as ShoppingBag,
  IconArrowRight as ArrowRight,
  IconPlus as Plus,
  IconAlertTriangle as AlertTriangle,
} from "@tabler/icons-react";

export interface ProductsSectionProps {
  organizerId: string;
  canManage?: boolean;
}

interface ProductItem {
  id: string;
  name: string;
  slug: string;
  status: string;
  price_type: string;
  stock_quantity: number | null;
  created_at: string;
}

export async function ProductsSection({
  organizerId,
  canManage = true,
}: ProductsSectionProps) {
  const supabase = createSupabaseAdmin();

  let products: ProductItem[] = [];

  try {
    // 1. Resolve org user_id and linked business IDs for tenant isolation
    const [{ data: org }, { data: businesses }] = await Promise.all([
      supabase.from("organizers").select("user_id").eq("id", organizerId).maybeSingle(),
      supabase.from("businesses").select("id").eq("organizer_id", organizerId),
    ]);

    const orgUserId = org?.user_id;
    const businessIds = (businesses || []).map((b) => b.id);

    // 2. Query products scoped to either owner_id or business_id
    if (orgUserId || businessIds.length > 0) {
      let query = supabase
        .from("products")
        .select("id, name, slug, status, price_type, stock_quantity, created_at")
        .order("created_at", { ascending: false })
        .limit(20);

      if (orgUserId && businessIds.length > 0) {
        query = query.or(`owner_id.eq.${orgUserId},business_id.in.(${businessIds.join(",")})`);
      } else if (orgUserId) {
        query = query.eq("owner_id", orgUserId);
      } else {
        query = query.in("business_id", businessIds);
      }

      const { data, error } = await query;
      if (!error && Array.isArray(data)) {
        products = data as ProductItem[];
      }
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ProductsSection] query error:", err);
    }
  }

  const activeProducts = products.filter((p) => p.status !== "archived");
  const lowStockProducts = activeProducts.filter(
    (p) => p.stock_quantity !== null && p.stock_quantity > 0 && p.stock_quantity <= 5
  );
  const outOfStockProducts = activeProducts.filter(
    (p) => p.status === "out_of_stock" || p.stock_quantity === 0
  );
  const topProducts = activeProducts.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <ShoppingBag className="h-4 w-4 text-brand-700" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Retail & Products Catalog
          </h2>
        </div>
        {canManage && (
          <div className="flex items-center gap-2">
            <Link
              href="/dashboard/products/new"
              className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
            >
              <Plus className="h-3.5 w-3.5" />
              <span>New Product</span>
            </Link>
            <span className="text-zinc-300">·</span>
            <Link
              href={`/dashboard/org/${organizerId}/products`}
              className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-zinc-600 hover:text-zinc-900"
            >
              <span>Manage</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          </div>
        )}
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
        <StatCard
          label="Active Products"
          value={activeProducts.length}
          format="count"
          href={`/dashboard/org/${organizerId}/products`}
        />
        <StatCard
          label="In Stock"
          value={activeProducts.length - outOfStockProducts.length}
          format="count"
        />
        <StatCard
          label="Low Stock (≤5)"
          value={lowStockProducts.length}
          format="count"
          hint={lowStockProducts.length > 0 ? "Reorder recommended" : "Adequate stock"}
          href={`/dashboard/org/${organizerId}/products`}
        />
        <StatCard
          label="Out of Stock"
          value={outOfStockProducts.length}
          format="count"
          hint={outOfStockProducts.length > 0 ? "Unavailable to buyers" : "None out of stock"}
          href={`/dashboard/org/${organizerId}/products`}
        />
      </div>

      {/* Product List or Empty State */}
      {topProducts.length === 0 ? (
        <EmptyState
          variant="section"
          title="No products in your catalog yet"
          description="Create digital or physical products to sell through your website."
          action={
            canManage
              ? {
                  label: "+ Add Product",
                  href: "/dashboard/products/new",
                }
              : undefined
          }
          icon={ShoppingBag}
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
          {topProducts.map((prod) => {
            const isOutOfStock = prod.status === "out_of_stock" || prod.stock_quantity === 0;
            const isLowStock =
              !isOutOfStock &&
              prod.stock_quantity !== null &&
              prod.stock_quantity <= 5;

            return (
              <div
                key={prod.id}
                className="min-h-[52px] flex items-center justify-between p-3.5 gap-3 hover:bg-zinc-50/60 transition"
              >
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-zinc-900 truncate">
                    {prod.name}
                  </p>
                  <p className="text-xs text-zinc-500 mt-0.5">
                    {prod.price_type === "subscription" ? "Subscription" : "One-time purchase"}
                  </p>
                </div>

                <div className="flex items-center gap-3 shrink-0">
                  {prod.stock_quantity === null ? (
                    <span className="text-xs font-medium text-zinc-500">
                      Digital / Unlimited
                    </span>
                  ) : isOutOfStock ? (
                    <span className="text-xs font-bold text-red-700 bg-red-50 px-2 py-0.5 rounded-full">
                      Out of stock
                    </span>
                  ) : isLowStock ? (
                    <span className="text-xs font-bold text-amber-700 bg-amber-50 px-2 py-0.5 rounded-full flex items-center gap-1">
                      <AlertTriangle className="h-3 w-3" />
                      {prod.stock_quantity} left
                    </span>
                  ) : (
                    <span className="text-xs font-medium text-emerald-700">
                      {prod.stock_quantity} in stock
                    </span>
                  )}
                  <span className="text-xs font-semibold px-2 py-0.5 rounded bg-zinc-100 text-zinc-600 capitalize">
                    {prod.status}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
