/**
 * app/[locale]/admin/workforce/sentinel/incidents/page.tsx — Stage 9: Incident list.
 *
 * Real persisted incidents (migration 143), newest first (last_seen_at),
 * bounded, filterable by the ACTUAL schema statuses
 * (open/investigating/resolved/expired) and severities (s1–s4) — nothing
 * invented. Platform-wide admin view (tenantId null): tenant and
 * platform-level rows all appear — failed/unresolved incidents render
 * honestly, never filtered out. Unknown ?status=/?severity= falls back to
 * unfiltered, never 500. Read-only: rows link to detail; no lifecycle
 * controls exist on this surface.
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { Radar } from "lucide-react";
import {
  fetchIncidentList,
  fetchIncidentFilterCounts,
  isIncidentStatusValue,
  isIncidentSeverityValue,
  INCIDENT_STATUSES,
  INCIDENT_SEVERITIES,
} from "@/lib/workforce/sentinel";

const SEVERITY_TONE: Record<string, string> = {
  s1: "text-red-400",
  s2: "text-amber-400",
  s3: "text-amber-500",
  s4: "text-zinc-400",
};

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

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <Radar size={22} /> Incidents
        </h1>
        <p className="text-sm text-zinc-400">
          {incidents.length} shown{filterNote} · counts cover the 200 most recent incidents · last
          observed, newest first.
        </p>
      </div>

      {/* Status filter chips (actual schema states) */}
      <div className="flex flex-wrap gap-2" aria-label="Filter by status">
        <Link
          href={chipHref(null, activeSeverity)}
          className={`rounded-xl px-3 py-1 text-sm ${activeStatus === null ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
        >
          all statuses
        </Link>
        {INCIDENT_STATUSES.map((s) => (
          <Link
            key={s}
            href={chipHref(s, activeSeverity)}
            className={`rounded-xl px-3 py-1 text-sm ${activeStatus === s ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {s} ({counts.byStatus[s] ?? 0})
          </Link>
        ))}
      </div>

      {/* Severity filter chips (actual schema severities) */}
      <div className="flex flex-wrap gap-2" aria-label="Filter by severity">
        <Link
          href={chipHref(activeStatus, null)}
          className={`rounded-xl px-3 py-1 text-sm ${activeSeverity === null ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
        >
          all severities
        </Link>
        {INCIDENT_SEVERITIES.map((s) => (
          <Link
            key={s}
            href={chipHref(activeStatus, s)}
            className={`rounded-xl px-3 py-1 text-sm ${activeSeverity === s ? "bg-zinc-700 text-white" : "bg-zinc-900 text-zinc-400"}`}
          >
            {s} ({counts.bySeverity[s] ?? 0})
          </Link>
        ))}
      </div>

      {incidents.length === 0 ? (
        <p className="text-sm text-zinc-500">
          {activeStatus || activeSeverity
            ? "No incidents match these filters in the recent window."
            : "No incidents recorded yet. Emitted application, webhook, job, and QA-failure events group here automatically."}
        </p>
      ) : (
        <ul className="space-y-2">
          {incidents.map((i) => (
            <li key={i.id} className="flex flex-col gap-1 rounded-xl bg-zinc-900 p-3 shadow-xs sm:flex-row sm:items-center sm:justify-between">
              <div>
                <Link href={`/admin/workforce/sentinel/incidents/${i.id}`} className="text-sm text-white hover:underline">
                  {i.title}
                </Link>{" "}
                <span className={`text-sm ${SEVERITY_TONE[i.severity] ?? "text-zinc-400"}`}>{i.severity}</span>{" "}
                <span className="text-sm text-zinc-500">
                  · {i.status} · {i.tenant_id ? "tenant incident" : "platform incident"}
                </span>
                <div className="text-sm text-zinc-500 tabular-nums">
                  {i.event_count} event(s) · first seen {new Date(i.first_seen_at).toLocaleString()}
                </div>
              </div>
              <div className="text-sm text-zinc-500">
                last observed {new Date(i.last_seen_at).toLocaleString()}
              </div>
            </li>
          ))}
        </ul>
      )}
      <div className="flex gap-4">
        <Link href="/admin/workforce/sentinel" className="text-sm text-zinc-400 hover:text-white">
          ← Back to Sentinel overview
        </Link>
        <Link href="/admin/workforce" className="text-sm text-zinc-400 hover:text-white">
          ← Command Center
        </Link>
      </div>
    </div>
  );
}
