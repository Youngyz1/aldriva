"use client";

import { useTranslations } from "next-intl";
import { IconBike as Bike } from "@tabler/icons-react";

export type OrderTabKey = "needs_attention" | "active" | "completed" | "deliveries" | "all";

interface OrdersFilterTabsProps {
  activeTab: OrderTabKey;
  onTabChange: (tab: OrderTabKey) => void;
  counts: {
    needs_attention: number;
    active: number;
    completed: number;
    deliveries?: number;
    all: number;
  };
  showDeliveries?: boolean;
}

export function OrdersFilterTabs({
  activeTab,
  onTabChange,
  counts,
  showDeliveries = false,
}: OrdersFilterTabsProps) {
  const t = useTranslations("Orders");

  const tabs: Array<{ key: OrderTabKey; label: string; count: number; alert?: boolean; icon?: React.ReactNode }> = [
    {
      key: "needs_attention",
      label: t("needsAttentionTab"),
      count: counts.needs_attention,
      alert: counts.needs_attention > 0,
    },
    {
      key: "active",
      label: t("activeTab"),
      count: counts.active,
    },
    {
      key: "completed",
      label: t("completedTab"),
      count: counts.completed,
    },
    ...(showDeliveries
      ? [
          {
            key: "deliveries" as OrderTabKey,
            label: t("deliveriesTab"),
            count: counts.deliveries ?? 0,
            icon: <Bike className="w-3.5 h-3.5" />,
          },
        ]
      : []),
    {
      key: "all",
      label: t("allTab"),
      count: counts.all,
    },
  ];

  return (
    <div className="flex gap-2 overflow-x-auto pb-1 -mx-1 px-1 scrollbar-none" role="tablist">
      {tabs.map((tab) => {
        const isActive = activeTab === tab.key;
        return (
          <button
            key={tab.key}
            role="tab"
            aria-selected={isActive}
            type="button"
            onClick={() => onTabChange(tab.key)}
            className={`inline-flex items-center gap-2 px-3.5 py-2 rounded-xl text-xs sm:text-sm font-medium transition-colors shrink-0 ${
              isActive
                ? "bg-zinc-900 text-white shadow-xs"
                : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200/80 hover:text-zinc-900"
            }`}
          >
            {tab.icon && <span className="shrink-0">{tab.icon}</span>}
            <span>{tab.label}</span>
            <span
              className={`inline-flex items-center justify-center px-1.5 py-0.5 rounded-full text-xs font-semibold tabular-nums min-w-[20px] ${
                isActive
                  ? tab.alert
                    ? "bg-red-500 text-white"
                    : "bg-zinc-800 text-zinc-200"
                  : tab.alert
                  ? "bg-red-100 text-red-700"
                  : "bg-zinc-200 text-zinc-700"
              }`}
            >
              {tab.count}
            </span>
          </button>
        );
      })}
    </div>
  );
}
