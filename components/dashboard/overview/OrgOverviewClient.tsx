"use client";

import { OverviewShell } from "./OverviewShell";
import { AttentionStrip } from "./AttentionStrip";
import { TodayStrip } from "./TodayStrip";
import { SetupChecklist } from "./SetupChecklist";
import { QuickActions } from "./QuickActions";
import { RecentOrdersWidget } from "./RecentOrdersWidget";
import { EventMetricsWidget } from "./EventMetricsWidget";
import Link from "next/link";
import type { ReactNode } from "react";
import type {
  OverviewWidgetDescriptor,
  AttentionItem,
  TodayMetrics,
  QuickActionItem,
  RecentOrderSummary,
  EventMetrics,
  RecentEventSummary,
} from "@/lib/overview-types";

export interface OrgOverviewClientProps {
  organizerId: string;
  orgName: string;
  widgets: OverviewWidgetDescriptor[];
  invitationAction?: ReactNode;
}

export function OrgOverviewClient({
  organizerId,
  orgName,
  widgets,
  invitationAction,
}: OrgOverviewClientProps) {
  // Find specific widget data
  const attentionWidget = widgets.find((w) => w.id === "attention_strip");
  const checklistWidget = widgets.find((w) => w.id === "setup_checklist");
  const todayWidget = widgets.find((w) => w.id === "today_strip");
  const actionsWidget = widgets.find((w) => w.id === "quick_actions");
  const recentOrdersWidget = widgets.find((w) => w.id === "recent_orders");
  const eventsWidget = widgets.find((w) => w.id === "events_metrics");
  const recentEventsWidget = widgets.find((w) => w.id === "recent_events");
  const emptyStateWidget = widgets.find((w) => w.id === "empty_state");

  return (
    <OverviewShell
      title={orgName}
      subtitle="Your operational dashboard at a glance"
      badge="Organization"
    >
      {/* 1. Attention Strip */}
      {attentionWidget && (
        <AttentionStrip
          items={attentionWidget.data as AttentionItem[]}
          organizerId={organizerId}
        />
      )}

      {/* 2. Setup Checklist (appears if incomplete or collapsible) */}
      {checklistWidget && (
        <SetupChecklist
          organizerId={organizerId}
          data={checklistWidget.data as {
            isComplete: boolean;
            items: import("@/lib/overview-types").SetupChecklistItem[];
            completedCount: number;
            totalCount: number;
          }}
        />
      )}

      {/* 3. Today Strip (Commerce / Storefront) */}
      {todayWidget && (
        <TodayStrip
          metrics={todayWidget.data as TodayMetrics}
          organizerId={organizerId}
        />
      )}

      {/* 4. Quick Actions */}
      {actionsWidget && (
        <QuickActions
          actions={actionsWidget.data as QuickActionItem[]}
          organizerId={organizerId}
          additionalAction={invitationAction}
        />
      )}

      {/* 5. Recent Orders */}
      {recentOrdersWidget && (
        <RecentOrdersWidget
          orders={recentOrdersWidget.data as RecentOrderSummary[]}
          organizerId={organizerId}
        />
      )}

      {/* 6. Events & Community Metrics */}
      {eventsWidget && (
        <EventMetricsWidget
          metrics={eventsWidget.data as EventMetrics}
          recentEvents={recentEventsWidget?.data as RecentEventSummary[] | undefined}
          organizerId={organizerId}
          hasEvents={(eventsWidget.data as EventMetrics).hasEvents}
          hasFundraisers={(eventsWidget.data as EventMetrics).hasFundraisers}
        />
      )}

      {/* 7. None state or brand-new business guidance */}
      {emptyStateWidget && !todayWidget && (
        (() => {
          const emptyState = emptyStateWidget.data as {
            variant?: "none" | "business";
            headline?: string;
            description?: string;
            createLinks?: Array<{ label: string; href: string }>;
          };
          return (
            <section className="rounded-xl border border-dashed border-zinc-200 bg-white p-8 text-center shadow-xs">
              <p className="text-sm font-bold text-zinc-900">
                {emptyState.headline || "Get ready to take orders"}
              </p>
              <p className="mt-1 text-xs text-zinc-500 max-w-md mx-auto">
                {emptyState.description ||
                  "Complete your setup checklist above and publish your website to start receiving orders."}
              </p>
              {emptyState.variant === "none" && emptyState.createLinks?.length ? (
                <div className="mt-5 flex flex-wrap justify-center gap-3">
                  {emptyState.createLinks.map((item) => (
                    <Link
                      key={item.href}
                      href={item.href}
                      className="inline-flex min-h-11 items-center justify-center rounded-xl border border-zinc-200 bg-white px-4 py-2 text-sm font-bold text-zinc-800 transition hover:border-orange-300 hover:bg-orange-50"
                    >
                      {item.label}
                    </Link>
                  ))}
                </div>
              ) : null}
            </section>
          );
        })()
      )}
    </OverviewShell>
  );
}
