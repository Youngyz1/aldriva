"use client";

import { OverviewShell } from "./OverviewShell";
import { AttentionStrip } from "./AttentionStrip";
import { TodayStrip } from "./TodayStrip";
import { SetupChecklist } from "./SetupChecklist";
import { QuickActions } from "./QuickActions";
import { RecentOrdersWidget } from "./RecentOrdersWidget";
import { EventMetricsWidget } from "./EventMetricsWidget";
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
}

export function OrgOverviewClient({
  organizerId,
  orgName,
  widgets,
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
        />
      )}

      {/* 7. Brand-new Business Guidance (if not showing orders or events) */}
      {emptyStateWidget && !todayWidget && (
        <div className="rounded-xl border border-dashed border-zinc-200 bg-white p-8 text-center shadow-xs">
          <p className="text-sm font-bold text-zinc-900">
            {(emptyStateWidget.data as { headline?: string }).headline || "Get ready to take orders"}
          </p>
          <p className="mt-1 text-xs text-zinc-500 max-w-md mx-auto">
            {(emptyStateWidget.data as { description?: string }).description ||
              "Complete your setup checklist above and publish your website to start receiving orders."}
          </p>
        </div>
      )}
    </OverviewShell>
  );
}
