/**
 * components/dashboard/overview/modules/RestaurantModules.tsx
 *
 * Dedicated restaurant modules for kitchen queue, active orders, and menu catalog.
 * docs/design/dashboard-overview/03-category-capability-matrix.md §2.1.
 */

import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { formatMoney } from "@/lib/money";
import { StatCard } from "../StatCard";
import { StatusChip } from "../StatusChip";
import { EmptyState } from "../EmptyState";
import {
  IconChefHat as ChefHat,
  IconToolsKitchen2 as Kitchen,
  IconArrowRight as ArrowRight,
  IconClock as Clock,
  IconPhotoOff as PhotoOff,
  IconPlus as Plus,
} from "@tabler/icons-react";

export interface RestaurantModulesProps {
  organizerId: string;
  fromIso: string;
  toIso: string;
  canManage?: boolean;
}

interface ActiveOrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  total_amount: number;
  currency: string;
  status: string;
  fulfilment_type: string;
  created_at: string;
}

interface MenuItemRow {
  id: string;
  name: string;
  price: number;
  image_url: string | null;
  is_active: boolean;
}

export async function RestaurantModules({
  organizerId,
  fromIso,
  toIso,
  canManage = true,
}: RestaurantModulesProps) {
  const supabase = createSupabaseAdmin();

  let kitchenQueue: ActiveOrderRow[] = [];
  let menuItems: MenuItemRow[] = [];
  let sectionCount = 0;
  let grossSales = 0;
  let orderCurrency = "USD";

  try {
    const [kitchenRes, menuItemsRes, sectionsRes, salesRes] = await Promise.all([
      // Kitchen queue: accepted, preparing, ready
      supabase
        .from("orders")
        .select("id, order_number, customer_name, total_amount, currency, status, fulfilment_type, created_at")
        .eq("organizer_id", organizerId)
        .in("status", ["accepted", "preparing", "ready"])
        .order("created_at", { ascending: true })
        .limit(10),

      // Menu items
      supabase
        .from("menu_items")
        .select("id, name, price, image_url, is_active")
        .eq("organizer_id", organizerId)
        .limit(50),

      // Menu sections count
      supabase
        .from("menu_sections")
        .select("id", { count: "exact", head: true })
        .eq("organizer_id", organizerId),

      // Period sales
      supabase
        .from("orders")
        .select("total_amount, currency, payment_status, status")
        .eq("organizer_id", organizerId)
        .gte("created_at", fromIso)
        .lte("created_at", toIso)
        .neq("status", "cancelled"),
    ]);

    if (!kitchenRes.error && Array.isArray(kitchenRes.data)) {
      kitchenQueue = kitchenRes.data as ActiveOrderRow[];
    }
    if (!menuItemsRes.error && Array.isArray(menuItemsRes.data)) {
      menuItems = menuItemsRes.data as MenuItemRow[];
    }
    sectionCount = sectionsRes.count ?? 0;

    if (!salesRes.error && Array.isArray(salesRes.data)) {
      if (salesRes.data.length > 0 && salesRes.data[0].currency) {
        orderCurrency = salesRes.data[0].currency;
      }
      grossSales = salesRes.data
        .filter((o) => o.payment_status !== "refunded")
        .reduce((sum, o) => sum + Number(o.total_amount || 0), 0);
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[RestaurantModules] query error:", err);
    }
  }

  const activeDishes = menuItems.filter((i) => i.is_active);
  const dishesMissingPhoto = activeDishes.filter((i) => !i.image_url);

  return (
    <div className="space-y-6">
      {/* 1. Kitchen Queue Section */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <ChefHat className="h-4 w-4 text-brand-700" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Kitchen Queue
            </h2>
            {kitchenQueue.length > 0 && (
              <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-100 text-amber-800">
                {kitchenQueue.length} active
              </span>
            )}
          </div>
          {canManage && (
            <Link
              href={`/dashboard/org/${organizerId}/kitchen`}
              className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
            >
              <span>Kitchen Display</span>
              <ArrowRight className="h-3 w-3" />
            </Link>
          )}
        </div>

        {kitchenQueue.length === 0 ? (
          <EmptyState
            variant="inline"
            title="Nothing in the kitchen right now."
            action={{
              label: "Open Kitchen",
              href: `/dashboard/org/${organizerId}/kitchen`,
            }}
            icon={Clock}
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-3">
            {kitchenQueue.map((order) => {
              const minutesWaiting = Math.max(
                0,
                Math.floor((Date.now() - new Date(order.created_at).getTime()) / 60_000)
              );
              return (
                <div
                  key={order.id}
                  className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2 hover:border-zinc-300 transition"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-base font-extrabold text-zinc-950">
                      #{order.order_number}
                    </span>
                    <StatusChip domain="order" value={order.status} size="sm" />
                  </div>
                  <div className="flex items-center justify-between text-xs text-zinc-500">
                    <span className="truncate">{order.customer_name}</span>
                    <span className="tabular-nums font-medium text-zinc-600">
                      {minutesWaiting}m ago
                    </span>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* 2. Menu Catalog Summary */}
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Kitchen className="h-4 w-4 text-brand-700" />
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
              Menu & Catalog Status
            </h2>
          </div>
          {canManage && (
            <div className="flex items-center gap-2">
              <Link
                href={`/dashboard/org/${organizerId}/menu`}
                className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>Add Dish</span>
              </Link>
              <span className="text-zinc-300">·</span>
              <Link
                href={`/dashboard/org/${organizerId}/menu`}
                className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-zinc-600 hover:text-zinc-900"
              >
                <span>Manage Menu</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </div>
          )}
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          <StatCard
            label="Active Dishes"
            value={activeDishes.length}
            format="count"
            href={`/dashboard/org/${organizerId}/menu`}
          />
          <StatCard
            label="Menu Sections"
            value={sectionCount}
            format="count"
          />
          <StatCard
            label="Needs Photos"
            value={dishesMissingPhoto.length}
            format="count"
            hint={dishesMissingPhoto.length > 0 ? "Items missing image" : "All illustrated"}
            href={`/dashboard/org/${organizerId}/menu`}
          />
        </div>

        {activeDishes.length === 0 && (
          <EmptyState
            variant="section"
            title="No dishes on your menu yet"
            description="Add sections and menu items so customers can view your dishes and order online."
            action={
              canManage
                ? {
                    label: "+ Add your first dish",
                    href: `/dashboard/org/${organizerId}/menu`,
                  }
                : undefined
            }
            icon={Kitchen}
          />
        )}
      </div>
    </div>
  );
}
