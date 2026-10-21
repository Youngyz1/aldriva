"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, RotateCw, ExternalLink, Inbox, CheckCircle2, AlertCircle } from "lucide-react";
import { OrderCard, type DashboardOrderRow } from "./OrderCard";
import { OrdersFilterTabs, type OrderTabKey } from "./OrdersFilterTabs";
import { DeliverySettingsDialog } from "./DeliverySettingsDialog";
import { computeOrderOverdue } from "@/lib/order-overdue";
import type { DeliverySettings } from "@/lib/delivery-settings";

interface OrdersClientProps {
  initialOrders: DashboardOrderRow[];
  organizerId: string;
  canManage: boolean;
  websiteSlug?: string | null;
  websiteId?: string | null;
  courierWhatsapp?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  initialDeliverySettings?: DeliverySettings | null;
  hasDeliveryOffering?: boolean;
  currency?: string;
  registeredCouriers?: Array<{
    id: string;
    businessId: string;
    fullName: string;
    phone: string;
    isAvailable: boolean;
    hasActiveOrder: boolean;
    state: string;
  }>;
}

export function OrdersClient({
  initialOrders,
  organizerId,
  canManage,
  websiteSlug,
  websiteId,
  courierWhatsapp,
  businessName,
  businessAddress,
  businessPhone,
  initialDeliverySettings,
  hasDeliveryOffering = true,
  currency = "XOF",
  registeredCouriers = [],
}: OrdersClientProps) {
  const t = useTranslations("Orders");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();

  const [deliverySettings, setDeliverySettings] = useState<DeliverySettings>(
    initialDeliverySettings || {
      fee: 0,
      free_above: null,
      courier_whatsapp: courierWhatsapp || null,
    }
  );

  // Determine initial tab: prefer needs_attention if any need attention
  const defaultTab = useMemo<OrderTabKey>(() => {
    const hasAttention = initialOrders.some((o) => {
      const res = computeOrderOverdue(o);
      return o.status === "pending" || res.isOverdue || res.isWaitingForCourier;
    });
    if (hasAttention) return "needs_attention";
    const hasActive = initialOrders.some((o) =>
      ["accepted", "preparing", "ready", "out_for_delivery"].includes(o.status)
    );
    if (hasActive) return "active";
    return "all";
  }, [initialOrders]);

  const [activeTab, setActiveTab] = useState<OrderTabKey>(defaultTab);
  const [searchQuery, setSearchQuery] = useState("");

  // Auto-refresh: 30s background poll when tab is visible
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        startTransition(() => {
          router.refresh();
        });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  const handleManualRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  // Compute counts per tab
  const tabCounts = useMemo(() => {
    let needsAttentionCount = 0;
    let activeCount = 0;
    let completedCount = 0;

    for (const order of initialOrders) {
      const overdueRes = computeOrderOverdue(order);
      if (order.status === "pending" || overdueRes.isOverdue || overdueRes.isWaitingForCourier) {
        needsAttentionCount += 1;
      }
      if (["accepted", "preparing", "ready", "out_for_delivery"].includes(order.status)) {
        activeCount += 1;
      }
      if (["completed", "delivered", "cancelled"].includes(order.status)) {
        completedCount += 1;
      }
    }

    return {
      needs_attention: needsAttentionCount,
      active: activeCount,
      completed: completedCount,
      all: initialOrders.length,
    };
  }, [initialOrders]);

  // Filter orders by tab
  const tabOrders = useMemo(() => {
    return initialOrders.filter((order) => {
      if (activeTab === "all") return true;
      if (activeTab === "needs_attention") {
        const overdueRes = computeOrderOverdue(order);
        return order.status === "pending" || overdueRes.isOverdue || overdueRes.isWaitingForCourier;
      }
      if (activeTab === "active") {
        return ["accepted", "preparing", "ready", "out_for_delivery"].includes(order.status);
      }
      if (activeTab === "completed") {
        return ["completed", "delivered", "cancelled"].includes(order.status);
      }
      return true;
    });
  }, [initialOrders, activeTab]);

  // Filter by search query
  const searchedOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return tabOrders;
    const cleanDigits = q.replace(/[^\d]/g, "");

    return tabOrders.filter((order) => {
      if (order.order_number.toLowerCase().includes(q)) return true;
      if (order.customer_name.toLowerCase().includes(q)) return true;
      if (order.customer_phone.toLowerCase().includes(q)) return true;
      if (cleanDigits && order.customer_phone.replace(/[^\d]/g, "").includes(cleanDigits)) return true;
      return false;
    });
  }, [tabOrders, searchQuery]);

  // Extract recent unique riders for quick assignment suggestions
  const recentRiderSuggestions = useMemo(() => {
    const set = new Set<string>();
    for (const order of initialOrders) {
      if (order.rider_name && order.rider_name.trim()) {
        set.add(order.rider_name.trim());
      }
    }
    return Array.from(set).slice(0, 5);
  }, [initialOrders]);

  // Sort orders per tab specification
  const sortedOrders = useMemo(() => {
    const list = [...searchedOrders];

    if (activeTab === "needs_attention") {
      // Oldest pending first (longest-waiting customer); then overdue by promised time
      return list.sort((a, b) => {
        if (a.status === "pending" && b.status !== "pending") return -1;
        if (b.status === "pending" && a.status !== "pending") return 1;
        if (a.status === "pending" && b.status === "pending") {
          return new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
        }
        const aTime = a.estimated_ready_at
          ? new Date(a.estimated_ready_at).getTime()
          : new Date(a.created_at).getTime();
        const bTime = b.estimated_ready_at
          ? new Date(b.estimated_ready_at).getTime()
          : new Date(b.created_at).getTime();
        return aTime - bTime;
      });
    }

    if (activeTab === "active") {
      // Promised ready time ascending (soonest first)
      return list.sort((a, b) => {
        const aTime = a.estimated_ready_at
          ? new Date(a.estimated_ready_at).getTime()
          : new Date(a.created_at).getTime();
        const bTime = b.estimated_ready_at
          ? new Date(b.estimated_ready_at).getTime()
          : new Date(b.created_at).getTime();
        return aTime - bTime;
      });
    }

    // Completed & All: newest first
    return list.sort(
      (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    );
  }, [searchedOrders, activeTab]);

  return (
    <div className="space-y-6">
      {/* Top controls: Tabs, Search, Actions */}
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <OrdersFilterTabs
            activeTab={activeTab}
            onTabChange={setActiveTab}
            counts={tabCounts}
          />

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
            {websiteId && (
              <DeliverySettingsDialog
                organizerId={organizerId}
                websiteId={websiteId}
                initialSettings={deliverySettings}
                currency={currency}
                canManage={canManage}
                hasDeliveryOffering={hasDeliveryOffering}
                onSaved={(newSettings) => setDeliverySettings(newSettings)}
              />
            )}

            {websiteSlug && (
              <a
                href={`/site/${websiteSlug}`}
                target="_blank"
                rel="noreferrer"
                className="inline-flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-xs transition-colors"
              >
                <span>{t("viewLiveSite")}</span>
                <ExternalLink className="w-3.5 h-3.5 text-zinc-400" />
              </a>
            )}

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isPending}
              className="inline-flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-xs disabled:opacity-50 transition-colors"
              title={t("refresh")}
            >
              <RotateCw
                className={`w-3.5 h-3.5 text-zinc-500 ${isPending ? "animate-spin" : ""}`}
              />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </button>
          </div>
        </div>

        {/* Search input */}
        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs transition-colors"
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-xs font-medium text-zinc-400 hover:text-zinc-600"
            >
              {t("close")}
            </button>
          )}
        </div>
      </div>

      {/* Orders List / Empty state */}
      {sortedOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-8 py-16 text-center shadow-xs">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 mb-4">
            {activeTab === "needs_attention" ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            ) : activeTab === "active" ? (
              <Inbox className="w-6 h-6 text-zinc-400" />
            ) : (
              <AlertCircle className="w-6 h-6 text-zinc-400" />
            )}
          </div>
          <p className="text-base font-medium text-zinc-800">
            {searchQuery
              ? t("emptyAll")
              : activeTab === "needs_attention"
              ? t("emptyNeedsAttention")
              : activeTab === "active"
              ? t("emptyActive")
              : activeTab === "completed"
              ? t("emptyCompleted")
              : t("emptyAll")}
          </p>
          <p className="mt-1 text-sm text-zinc-400">
            {searchQuery ? t("searchPlaceholder") : t("noOrdersDescription")}
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          {sortedOrders.map((order) => (
            <OrderCard
              key={order.id}
              order={order}
              organizerId={organizerId}
              canManage={canManage}
              courierWhatsapp={deliverySettings.courier_whatsapp}
              businessName={businessName}
              businessAddress={businessAddress}
              businessPhone={businessPhone}
              recentRiderSuggestions={recentRiderSuggestions}
              registeredCouriers={registeredCouriers}
              onRefresh={handleManualRefresh}
            />
          ))}
        </div>
      )}

      {/* Footer count indicator */}
      {initialOrders.length > 0 && (
        <div className="text-center text-xs text-zinc-400 pt-2">
          {t("showingLatestCount", { count: initialOrders.length })}
        </div>
      )}
    </div>
  );
}
