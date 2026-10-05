/**
 * app/admin/workforce/sentinel/incidents/page.tsx — Stage 9: Incident list.
 *
 * Real persisted incidents (migration 143), newest first (last_seen_at),
 * bounded, filterable by the ACTUAL schema statuses
 * (open/investigating/resolved/expired) and severities (s1–s4) — nothing
 * invented. Platform-wide admin view (tenantId null): tenant and
 * platform-level rows all appear — failed/unresolved incidents render
 * honestly, never filtered out. Unknown ?status=/?severity= falls back to
 * unfiltered, never 500. Read-only: rows link to detail; no lifecycle
 * controls exist on this surface.
 *
 * Stage 21 P2 restyle: light admin system (PageHeader + StatStrip +
 * AdminTable). Read-only: no forms anywhere on sentinel surfaces.
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
import { tableStrings } from "@/components/admin/table/strings";
import {
  fetchIncidentList,
  fetchIncidentFilterCounts,
  isIncidentStatusValue,
  isIncidentSeverityValue,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
} from "@/lib/workforce/sentinel";

const SEVERITY_TONE: Record<string, string> = {
  s1: "text-red-600",
  s2: "text-amber-600",
  s3: "text-amber-500",
  s4: "text-zinc-500",
};

const columns: AdminColumn[] = [
  { id: "incident", header: "Incident", role: "title" },
  { id: "severity", header: "Severity", role: "value", width: "110px" },
  { id: "status", header: "Status", role: "meta" },
  { id: "scope", header: "Scope", role: "meta", hideBelow: "md" },
  { id: "seen", header: "Last observed", role: "meta", align: "right", hideBelow: "md" },
];

function chipHref(status: string | null, severity: string | null): string {
  const params = new URLSearchParams();
  if (status) params.set("status", status);
  if (severity) params.set("severity", severity);
  const qs = params.toString();
  return `/admin/workforce/sentinel/incidents${qs ? `?${qs}` : ""}`;
}

export default async function SentinelIncidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; severity?: string }>;
}) {
  await headers();
  await requireAdmin();
  const { status, severity } = await searchParams;

  const supabase = await createSupabaseServer();
  const activeStatus = status && isIncidentStatusValue(status) ? status : null;
  const activeSeverity = severity && isIncidentSeverityValue(severity) ? severity : null;
  const [incidents, counts] = await Promise.all([
    fetchIncidentList(supabase, null, activeStatus, activeSeverity),
    fetchIncidentFilterCounts(supabase, null),
  ]);

  const filterNote =
    activeStatus || activeSeverity
      ? ` · filtered to${activeStatus ? ` ${activeStatus}` : ""}${activeSeverity ? ` ${activeSeverity}` : ""}`
      : "";
  const chip = (isActive: boolean) =>
    `rounded-xl px-3 py-1 text-sm font-medium ${isActive ? "bg-zinc-950 text-white" : "border border-zinc-200 bg-white text-zinc-600 hover:text-zinc-950"}`;

  return (
    <div className="space-y-4 sm:space-y-6">
      <Link
        href="/admin/workforce/sentinel"
        className="inline-flex items-center gap-1 text-sm font-medium text-zinc-500 hover:text-zinc-800"
      >
        <ArrowLeft className="h-4 w-4" /> AI Workforce <span aria-hidden="true">/</span> Sentinel{" "}
        <span aria-hidden="true">/</span>
        <span className="text-zinc-800">Incidents</span>
      </Link>

      <PageHeader
        eyebrow="AI Workforce"
        title="Incidents"
        description={`${incidents.length} shown${filterNote} · counts cover the 200 most recent incidents · last observed, newest first.`}
      />

      <StatStrip
        items={[
          { label: "Shown", value: incidents.length },
          { label: "Open", value: counts.byStatus["open"] ?? 0 },
          { label: "s1", value: counts.bySeverity["s1"] ?? 0, accent: "text-red-600" },
          { label: "s2", value: counts.bySeverity["s2"] ?? 0, accent: "text-amber-600" },
        ]}
      />

      {/* Status filter chips (actual schema states) */}
      <div className="flex flex-wrap gap-2" aria-label="Filter by status">
        <Link href={chipHref(null, activeSeverity)} className={chip(activeStatus === null)}>
          all statuses
        </Link>
        {INCIDENT_STATUSES.map((s) => (
          <Link key={s} href={chipHref(s, activeSeverity)} className={chip(activeStatus === s)}>
            {s} ({counts.byStatus[s] ?? 0})
          </Link>
        ))}
      </div>

      {/* Severity filter chips (actual schema severities) */}
      <div className="flex flex-wrap gap-2" aria-label="Filter by severity">
        <Link href={chipHref(activeStatus, null)} className={chip(activeSeverity === null)}>
          all severities
        </Link>
        {INCIDENT_SEVERITIES.map((s) => (
          <Link key={s} href={chipHref(activeStatus, s)} className={chip(activeSeverity === s)}>
            {s} ({counts.bySeverity[s] ?? 0})
          </Link>
        ))}
      </div>

      <AdminTable
        columns={columns}
        rows={incidents.map((i) => ({
          id: i.id,
          detailHref: `/admin/workforce/sentinel/incidents/${i.id}`,
          cells: [
            <Link
              key="incident"
              href={`/admin/workforce/sentinel/incidents/${i.id}`}
              className="font-semibold text-zinc-950 hover:underline"
            >
              {i.title}
            </Link>,
            <span key="severity" className={`whitespace-nowrap font-semibold ${SEVERITY_TONE[i.severity] ?? "text-zinc-500"}`}>
              {i.severity}
            </span>,
            <StatusBadge key="status" status={i.status} />,
            <span key="scope" className="text-zinc-600">
              {i.tenant_id ? "tenant incident" : "platform incident"} · {i.event_count} event(s)
            </span>,
            <span key="seen" className="whitespace-nowrap text-xs text-zinc-500">
              first {new Date(i.first_seen_at).toLocaleString()} · last {new Date(i.last_seen_at).toLocaleString()}
            </span>,
          ],
        }))}
        emptyMessage={
          activeStatus || activeSeverity
            ? "No incidents match these filters in the recent window."
            : "No incidents recorded yet. Emitted application, webhook, job, and QA-failure events group here automatically."
        }
      />

      <div className="sticky bottom-0 z-10 bg-zinc-100 pb-[env(safe-area-inset-bottom)]">
        <p className="text-xs font-semibold text-zinc-400">
          {incidents.length === 0
            ? tableStrings.showingNone(incidents.length)
            : tableStrings.showingResults(1, incidents.length, incidents.length)}
        </p>
      </div>

      <div className="flex gap-4">
        <Link href="/admin/workforce/sentinel" className="text-sm font-medium text-zinc-500 hover:text-zinc-800">
          ← Back to Sentinel overview
        </Link>
      </div>
    </div>
  );
}
