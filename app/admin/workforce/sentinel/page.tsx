/**
 * app/admin/workforce/sentinel/page.tsx — Stage 9: Sentinel overview.
 *
 * Real persisted incidents + system events (migrations 143–145), newest
 * first, bounded. Every number derives from a query; empty sources render
 * designed empty states. Timestamps are labeled "last observed" — sweeps are
 * manual, so nothing here claims to be live. Read-only: every action is a
 * navigation link; no acknowledge/resolve/close control exists on this
 * surface (or anywhere in Stage 9).
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Stage 15 RLS and read-only behavior unchanged.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { ArrowLeft } from "lucide-react";
import PageHeader from "@/components/admin/PageHeader";
import StatStrip from "@/components/admin/StatStrip";
import { StatusBadge } from "@/components/admin/ModerationBadge";
import AdminTable from "@/components/admin/table/AdminTable";
import type { AdminColumn } from "@/components/admin/table/types";
import { fetchSentinelOverview, buildSentinelOverviewViewModel } from "@/lib/workforce/sentinel";

function SectionHead({ title, href, linkText }: { title: string; href: string; linkText: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base font-bold text-zinc-950">{title}</h2>
      <Link href={href} className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
        {linkText}
      </Link>
    </div>
  );
}

const SEVERITY_TONE: Record<string, string> = {
  s1: "text-red-600",
  s2: "text-amber-600",
  s3: "text-amber-500",
  s4: "text-zinc-500",
};

const incidentColumns: AdminColumn[] = [
  { id: "incident", header: "Incident", role: "title" },
  { id: "status", header: "Status", role: "value", width: "140px" },
  { id: "events", header: "Events", role: "meta", hideBelow: "md" },
  { id: "seen", header: "Last observed", role: "meta", align: "right", hideBelow: "md" },
];

const eventColumns: AdminColumn[] = [
  { id: "event", header: "Event", role: "title" },
  { id: "route", header: "Route", role: "value" },
  { id: "observed", header: "Observed", role: "meta", align: "right", hideBelow: "md" },
];

export default async function WorkforceSentinelPage() {
  await headers();
  await requireAdmin();

  const supabase = await createSupabaseServer();
  // Platform-wide admin view (tenantId null). Throws only on query failure.
  const raw = await fetchSentinelOverview(supabase, null);
  const vm = buildSentinelOverviewViewModel(raw);

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Sentinel</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Sentinel — Reliability overview"
        description="Persisted incidents and events. Timestamps show when each item was last observed — sweeps run manually, so this page reports stored state, never a live probe."
      />

      <StatStrip
        items={[
          { label: "Open", value: vm.counts.open },
          { label: "Investigating", value: vm.counts.investigating },
          { label: "Needs attention", value: vm.counts.attention, accent: "text-amber-600" },
          { label: "Recent QA failures", value: vm.recentQaFailures.length },
        ]}
      />

      <section className="space-y-3">
        <SectionHead title="Needs attention" href="/admin/workforce/sentinel/incidents?severity=s1" linkText="Open s1 list" />
        <AdminTable
          columns={incidentColumns}
          rows={vm.attention.map((i) => ({
            id: i.id,
            detailHref: `/admin/workforce/sentinel/incidents/${i.id}`,
            cells: [
              <span key="incident" className="font-semibold text-zinc-950">
                <span className={SEVERITY_TONE[i.severity] ?? "text-zinc-500"}>{i.severity}</span>
                {" — "}
                <Link href={`/admin/workforce/sentinel/incidents/${i.id}`} className="hover:underline">
                  {i.title}
                </Link>
              </span>,
              <StatusBadge key="status" status={i.status} />,
              <span key="events" className="tabular-nums text-zinc-600">
                {i.event_count} event(s)
              </span>,
              <span key="seen" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(i.last_seen_at).toLocaleString()}
              </span>,
            ],
          }))}
          emptyMessage="No open s1 or s2 incidents. Nothing currently requires human attention."
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Recent incidents" href="/admin/workforce/sentinel/incidents" linkText="View all" />
        <AdminTable
          columns={incidentColumns}
          rows={vm.recent.map((i) => ({
            id: i.id,
            detailHref: `/admin/workforce/sentinel/incidents/${i.id}`,
            cells: [
              <span key="incident" className="font-semibold text-zinc-950">
                <span className={SEVERITY_TONE[i.severity] ?? "text-zinc-500"}>{i.severity}</span>
                {" — "}
                <Link href={`/admin/workforce/sentinel/incidents/${i.id}`} className="hover:underline">
                  {i.title}
                </Link>
              </span>,
              <StatusBadge key="status" status={i.status} />,
              <span key="events" className="tabular-nums text-zinc-600">
                {i.event_count} event(s)
              </span>,
              <span key="seen" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(i.last_seen_at).toLocaleString()}
              </span>,
            ],
          }))}
          emptyMessage="No open or investigating incidents. Sentinel has nothing to report."
        />
      </section>

      <section className="space-y-3">
        <h2 className="text-base font-bold text-zinc-950">Recent events</h2>
        <AdminTable
          columns={eventColumns}
          rows={vm.recentEvents.map((e) => ({
            id: e.id,
            cells: [
              <span key="event" className="font-semibold text-zinc-950">
                {e.kind}
              </span>,
              <span key="route" className="text-zinc-600">
                {e.route ?? "no route"}
                {e.error_code ? ` · ${e.error_code}` : ""}
              </span>,
              <span key="observed" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(e.created_at).toLocaleString()}
              </span>,
            ],
          }))}
          emptyMessage="No system events recorded in the recent window."
        />
      </section>

      <section className="space-y-3">
        <SectionHead title="Recent QA failures" href="/admin/workforce/qa" linkText="Open QA runs" />
        <AdminTable
          columns={eventColumns}
          rows={vm.recentQaFailures.map((e) => ({
            id: e.id,
            cells: [
              <span key="event" className="font-semibold text-zinc-950">
                {e.error_code ?? e.kind}
              </span>,
              <span key="route" className="text-zinc-600">
                {e.route ?? "no route"} · per-test detail lives under QA runs
              </span>,
              <span key="observed" className="whitespace-nowrap text-xs text-zinc-500">
                {new Date(e.created_at).toLocaleString()}
              </span>,
            ],
          }))}
          emptyMessage="No qa_failure events in the recent window. QA-failure emission is shadow-suppressed by default, so absence here is expected until the QA pipeline goes live."
        />
      </section>

      <p className="text-sm text-zinc-500">
        Sentinel is read-only in this stage: this surface investigates and links, and never changes
        incident state. Status changes, notifications, and scheduling remain explicitly out of scope.
      </p>
    </div>
  );
}
