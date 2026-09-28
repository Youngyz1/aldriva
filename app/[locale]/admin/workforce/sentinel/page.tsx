/**
 * app/[locale]/admin/workforce/sentinel/page.tsx — Stage 9: Sentinel overview.
 *
 * Real persisted incidents + system events (migrations 143–145), newest
 * first, bounded. Every number derives from a query; empty sources render
 * designed empty states. Timestamps are labeled "last observed" — sweeps are
 * manual, so nothing here claims to be live. Read-only: every action is a
 * navigation link; no acknowledge/resolve/close control exists on this
 * surface (or anywhere in Stage 9).
 */
import { headers } from "next/headers";
import { requireAdmin } from "@/lib/auth";
import { createSupabaseServer } from "@/lib/supabase-server";
import Link from "next/link";
import { Radar } from "lucide-react";
import { fetchSentinelOverview, buildSentinelOverviewViewModel } from "@/lib/workforce/sentinel";

function StatCard({ label, value, hint }: { label: string; value: number; hint: string }) {
  return (
    <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
      <div className="text-sm text-zinc-400">{label}</div>
      <div className="text-2xl text-white tabular-nums">{value}</div>
      <div className="text-sm text-zinc-500">{hint}</div>
    </div>
  );
}

function EmptyNote({ text }: { text: string }) {
  return <p className="text-sm text-zinc-500">{text}</p>;
}

function SectionHead({ title, href, linkText }: { title: string; href: string; linkText: string }) {
  return (
    <div className="flex items-center justify-between">
      <h2 className="text-base text-white">{title}</h2>
      <Link href={href} className="text-sm text-zinc-400 hover:text-white">
        {linkText}
      </Link>
    </div>
  );
}

const SEVERITY_TONE: Record<string, string> = {
  s1: "text-red-400",
  s2: "text-amber-400",
  s3: "text-amber-500",
  s4: "text-zinc-400",
};

export default async function WorkforceSentinelPage() {
  await headers();
  await requireAdmin();

  const supabase = await createSupabaseServer();
  // Platform-wide admin view (tenantId null). Throws only on query failure.
  const raw = await fetchSentinelOverview(supabase, null);
  const vm = buildSentinelOverviewViewModel(raw);

  return (
    <div className="space-y-6 p-6 max-w-7xl mx-auto">
      <div className="border-b border-zinc-800 pb-4">
        <h1 className="flex items-center gap-2 text-2xl text-white">
          <Radar size={22} /> Sentinel — Reliability overview
        </h1>
        <p className="text-sm text-zinc-400">
          Persisted incidents and events. Timestamps show when each item was last observed — sweeps run
          manually, so this page reports stored state, never a live probe.
        </p>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <StatCard label="Open incidents" value={vm.counts.open} hint={`${vm.counts.investigating} investigating`} />
        <StatCard
          label="Needs attention"
          value={vm.counts.attention}
          hint="open s1/s2 severity"
        />
        <StatCard
          label="Severity (recent window)"
          value={vm.counts.active}
          hint={`s1 ${vm.severity["s1"] ?? 0} · s2 ${vm.severity["s2"] ?? 0} · s3 ${vm.severity["s3"] ?? 0} · s4 ${vm.severity["s4"] ?? 0}`}
        />
        <StatCard
          label="Recent QA failures"
          value={vm.recentQaFailures.length}
          hint="qa_failure events, newest first"
        />
      </div>

      {/* Attention */}
      <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <SectionHead title="Needs attention" href="/admin/workforce/sentinel/incidents?severity=s1" linkText="Open s1 list" />
        {vm.empty.attention ? (
          <EmptyNote text="No open s1 or s2 incidents. Nothing currently requires human attention." />
        ) : (
          <ul className="space-y-2">
            {vm.attention.map((i) => (
              <li key={i.id} className="rounded-xl bg-zinc-800 p-3">
                <div className="text-sm text-white">
                  <span className={SEVERITY_TONE[i.severity] ?? "text-zinc-400"}>{i.severity}</span> —{" "}
                  <Link href={`/admin/workforce/sentinel/incidents/${i.id}`} className="hover:underline">
                    {i.title}
                  </Link>
                </div>
                <div className="text-sm text-zinc-500 tabular-nums">
                  {i.status} · {i.event_count} event(s) · last observed{" "}
                  {new Date(i.last_seen_at).toLocaleString()}
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Recent incidents + recent events */}
      <div className="grid gap-3 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <SectionHead title="Recent incidents" href="/admin/workforce/sentinel/incidents" linkText="View all" />
          {vm.empty.incidents ? (
            <EmptyNote text="No open or investigating incidents. Sentinel has nothing to report." />
          ) : (
            <ul className="space-y-2">
              {vm.recent.map((i) => (
                <li key={i.id} className="rounded-xl bg-zinc-800 p-3">
                  <div className="text-sm text-white">
                    <span className={SEVERITY_TONE[i.severity] ?? "text-zinc-400"}>{i.severity}</span> —{" "}
                    <Link href={`/admin/workforce/sentinel/incidents/${i.id}`} className="hover:underline">
                      {i.title}
                    </Link>
                  </div>
                  <div className="text-sm text-zinc-500 tabular-nums">
                    {i.status} · {i.event_count} event(s) · last observed{" "}
                    {new Date(i.last_seen_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
          <h2 className="text-base text-white">Recent events</h2>
          {vm.empty.events ? (
            <EmptyNote text="No system events recorded in the recent window." />
          ) : (
            <ul className="space-y-2">
              {vm.recentEvents.map((e) => (
                <li key={e.id} className="rounded-xl bg-zinc-800 p-3">
                  <div className="text-sm text-white">{e.kind}</div>
                  <div className="text-sm text-zinc-500">
                    {e.route ?? "no route"}
                    {e.error_code ? ` · ${e.error_code}` : ""} · observed{" "}
                    {new Date(e.created_at).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      {/* Recent QA failures */}
      <div className="space-y-3 rounded-xl bg-zinc-900 p-4 shadow-xs">
        <SectionHead title="Recent QA failures" href="/admin/workforce/qa" linkText="Open QA runs" />
        {vm.empty.qa ? (
          <EmptyNote text="No qa_failure events in the recent window. QA-failure emission is shadow-suppressed by default, so absence here is expected until the QA pipeline goes live." />
        ) : (
          <ul className="space-y-2">
            {vm.recentQaFailures.map((e) => (
              <li key={e.id} className="rounded-xl bg-zinc-800 p-3">
                <div className="text-sm text-white">{e.error_code ?? e.kind}</div>
                <div className="text-sm text-zinc-500">
                  {e.route ?? "no route"} · observed {new Date(e.created_at).toLocaleString()} · per-test
                  detail lives under QA runs (this list is event-level only).
                </div>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Known limitation */}
      <p className="text-sm text-zinc-500">
        Sentinel is read-only in this stage: this surface investigates and links, and never changes
        incident state. Status changes, notifications, and scheduling remain explicitly out of scope.
      </p>

      <Link href="/admin/workforce" className="text-sm text-zinc-400 hover:text-white">
        ← Back to Command Center
      </Link>
    </div>
  );
}
