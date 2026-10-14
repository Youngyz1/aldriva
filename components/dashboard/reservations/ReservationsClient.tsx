"use client";

import { useState, useEffect, useMemo, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations } from "next-intl";
import { Search, RotateCw, CheckCircle2, Inbox, CalendarClock } from "lucide-react";
import { ReservationCard, type DashboardReservationRow } from "./ReservationCard";
import { ReservationSettingsDialog } from "./ReservationSettingsDialog";
import type { ReservationSettings } from "@/lib/reservation-settings";

type ReservationTabKey = "needs_action" | "today" | "upcoming" | "past" | "all";

const TAB_META: Array<{ key: ReservationTabKey; labelKey: string; emptyKey: string }> = [
  { key: "needs_action", labelKey: "needsActionTab", emptyKey: "emptyNeedsAction" },
  { key: "today", labelKey: "todayTab", emptyKey: "emptyToday" },
  { key: "upcoming", labelKey: "upcomingTab", emptyKey: "emptyUpcoming" },
  { key: "past", labelKey: "pastTab", emptyKey: "emptyPast" },
  { key: "all", labelKey: "allTab", emptyKey: "noRequests" },
];

interface ReservationsClientProps {
  initialReservations: DashboardReservationRow[];
  organizerId: string;
  canManage: boolean;
  websiteId?: string | null;
  businessId?: string | null;
  initialSettings?: ReservationSettings | null;
  hasReservationOffering?: boolean;
  siteTimezone?: string;
}

function dayKeyInTimezone(iso: string, timeZone: string): string {
  try {
    return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date(iso));
  } catch {
    return new Date(iso).toISOString().slice(0, 10);
  }
}

export function ReservationsClient({
  initialReservations,
  organizerId,
  canManage,
  websiteId,
  businessId,
  initialSettings,
  hasReservationOffering = true,
  siteTimezone = "Africa/Abidjan",
}: ReservationsClientProps) {
  const t = useTranslations("Reservations");
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [settings, setSettings] = useState<ReservationSettings>(
    initialSettings || {
      enabled: true,
      max_party_size: 12,
      min_lead_minutes: 60,
      max_days_ahead: 30,
      slot_minutes: 30,
      note: null,
    }
  );

  const defaultTab = useMemo<ReservationTabKey>(() => {
    if (initialReservations.some((r) => r.status === "pending")) return "needs_action";
    if (initialReservations.some((r) => ["confirmed", "seated"].includes(r.status))) return "today";
    return "all";
  }, [initialReservations]);

  const [activeTab, setActiveTab] = useState<ReservationTabKey>(defaultTab);
  const [searchQuery, setSearchQuery] = useState("");

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

  const todayKey = useMemo(() => dayKeyInTimezone(new Date().toISOString(), siteTimezone), [siteTimezone]);

  const inTab = (r: DashboardReservationRow): boolean => {
    if (activeTab === "all") return true;
    if (activeTab === "needs_action") return r.status === "pending";
    if (activeTab === "today") {
      if (["cancelled", "declined"].includes(r.status)) return false;
      return dayKeyInTimezone(r.starts_at, siteTimezone) === todayKey;
    }
    if (activeTab === "upcoming") {
      return r.status === "confirmed" && new Date(r.starts_at).getTime() >= Date.now();
    }
    if (activeTab === "past") {
      return ["completed", "declined", "no_show", "cancelled"].includes(r.status);
    }
    return true;
  };

  const tabCounts = useMemo(() => {
    const counts: Record<ReservationTabKey, number> = {
      needs_action: 0,
      today: 0,
      upcoming: 0,
      past: 0,
      all: initialReservations.length,
    };
    for (const r of initialReservations) {
      if (r.status === "pending") counts.needs_action += 1;
      if (!["cancelled", "declined"].includes(r.status) && dayKeyInTimezone(r.starts_at, siteTimezone) === todayKey) {
        counts.today += 1;
      }
      if (r.status === "confirmed" && new Date(r.starts_at).getTime() >= Date.now()) counts.upcoming += 1;
      if (["completed", "declined", "no_show", "cancelled"].includes(r.status)) counts.past += 1;
    }
    return counts;
  }, [initialReservations, siteTimezone, todayKey]);

  const visibleOrders = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    const cleanDigits = q.replace(/[^\d]/g, "");
    const filtered = initialReservations.filter((r) => {
      if (!inTab(r)) return false;
      if (!q) return true;
      if (r.reservation_number.toLowerCase().includes(q)) return true;
      if (r.customer_name.toLowerCase().includes(q)) return true;
      if (r.customer_phone.toLowerCase().includes(q)) return true;
      if (cleanDigits && r.customer_phone.replace(/[^\d]/g, "").includes(cleanDigits)) return true;
      return false;
    });
    const list = [...filtered];
    if (activeTab === "needs_action") {
      return list.sort((a, b) => new Date(a.created_at).getTime() - new Date(b.created_at).getTime());
    }
    if (activeTab === "today" || activeTab === "upcoming") {
      return list.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    }
    return list.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialReservations, activeTab, searchQuery, siteTimezone, todayKey]);

  const activeMeta = TAB_META.find((m) => m.key === activeTab) ?? TAB_META[0];

  return (
    <div className="space-y-6">
      <div className="space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
          <div className="flex gap-2 overflow-x-auto pb-1" role="tablist" aria-label={t("title")}>
            {TAB_META.map((tab) => (
              <button
                key={tab.key}
                type="button"
                role="tab"
                aria-selected={activeTab === tab.key}
                onClick={() => setActiveTab(tab.key)}
                className={`shrink-0 whitespace-nowrap rounded-full border px-3.5 py-1.5 text-xs font-semibold transition min-h-[44px] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-orange-600 ${
                  activeTab === tab.key
                    ? "border-orange-600 bg-orange-600 text-white shadow-xs"
                    : "border-zinc-200 bg-white text-zinc-700 hover:border-zinc-300 hover:bg-zinc-50"
                }`}
              >
                {t(tab.labelKey)} ({tabCounts[tab.key]})
              </button>
            ))}
          </div>

          <div className="flex items-center gap-2 self-end sm:self-auto shrink-0 flex-wrap">
            {websiteId && (
              <ReservationSettingsDialog
                organizerId={organizerId}
                websiteId={websiteId}
                initialSettings={settings}
                canManage={canManage}
                hasReservationOffering={hasReservationOffering}
                businessId={businessId}
                onSaved={(next) => setSettings(next)}
              />
            )}
            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isPending}
              className="inline-flex min-h-[44px] items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-xs disabled:opacity-50 transition-colors"
              title={t("refresh")}
            >
              <RotateCw className={`w-3.5 h-3.5 text-zinc-500 ${isPending ? "animate-spin" : ""}`} />
              <span className="hidden sm:inline">{t("refresh")}</span>
            </button>
          </div>
        </div>

        <div className="relative">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-zinc-400 pointer-events-none" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder={t("searchPlaceholder")}
            className="w-full min-h-[44px] pl-10 pr-4 py-2.5 rounded-xl border border-zinc-200 bg-white text-sm text-zinc-900 placeholder-zinc-400 focus:outline-none focus:ring-2 focus:ring-orange-500/20 focus:border-orange-500 shadow-xs transition-colors"
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

      {visibleOrders.length === 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white px-8 py-16 text-center shadow-xs">
          <div className="inline-flex items-center justify-center w-12 h-12 rounded-full bg-zinc-100 text-zinc-400 mb-4">
            {activeTab === "needs_action" ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-500" />
            ) : activeTab === "today" ? (
              <CalendarClock className="w-6 h-6 text-zinc-400" />
            ) : (
              <Inbox className="w-6 h-6 text-zinc-400" />
            )}
          </div>
          <p className="text-base font-medium text-zinc-800">
            {searchQuery ? t("noRequests") : t(activeMeta.emptyKey)}
          </p>
          <p className="mt-1 text-sm text-zinc-400">{t("noRequestsDescription")}</p>
        </div>
      ) : (
        <div className="space-y-3">
          {visibleOrders.map((r) => (
            <ReservationCard
              key={r.id}
              reservation={r}
              organizerId={organizerId}
              canManage={canManage}
              siteTimezone={siteTimezone}
              onRefresh={handleManualRefresh}
            />
          ))}
        </div>
      )}

      {initialReservations.length > 0 && (
        <div className="text-center text-xs text-zinc-400 pt-2">
          {t("showingLatestCount", { count: initialReservations.length })}
        </div>
      )}
    </div>
  );
}
