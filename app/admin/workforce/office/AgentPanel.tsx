/**
 * app/admin/workforce/office/AgentPanel.tsx — Stage 21 (P3): selection panel.
 *
 * Server component, props-only: the ?agent= snapshot arrives from the
 * office page (fetched via lib/workforce/agent-detail.ts). A snapshot of
 * STORED state, labelled read-only — nothing here can approve, reject or
 * start anything: links only, no forms, no actions, no data imports.
 * Mobile: bottom sheet; desktop: static card. The agents/[id] route is the
 * full-page fallback on every viewport (including no-JS).
 */
import Link from "next/link";
import type { AgentPanelData } from "@/lib/workforce/agent-detail";
import { StatusBadge } from "@/components/admin/ModerationBadge";
import { PanelCloseButton } from "./PanelCloseButton";

export function AgentPanel({ panel }: { panel: AgentPanelData }) {
  const a = panel.agent;
  return (
    <section
      aria-label={`Selected agent ${a.display_name}`}
      className="fixed inset-x-3 bottom-3 z-40 rounded-2xl border border-zinc-200 bg-white p-4 shadow-xl lg:static"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 className="truncate text-base font-bold text-zinc-950">{a.display_name}</h2>
          <p className="text-xs text-zinc-500">
            {a.department} · {a.autonomy_level} · snapshot of stored state · read-only
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <StatusBadge status={a.status} />
          <PanelCloseButton />
        </div>
      </div>

      <div className="mt-3 grid gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400">Current task</h3>
          {panel.currentTask ? (
            <p className="text-sm text-zinc-950">
              {panel.currentTask.title}{" "}
              <span className="text-zinc-500">({panel.currentTask.status})</span>
            </p>
          ) : (
            <p className="text-sm text-zinc-500">No current task.</p>
          )}
          <h3 className="pt-2 text-xs font-bold uppercase tracking-wide text-zinc-400">
            Last runs ({panel.runs.length})
          </h3>
          {panel.runs.length === 0 ? (
            <p className="text-sm text-zinc-500">No runs yet.</p>
          ) : (
            <ul className="space-y-1">
              {panel.runs.map((r) => (
                <li key={r.id} className="text-sm text-zinc-600">
                  {r.status} · via {r.triggered_by} · {new Date(r.created_at).toLocaleString()}
                </li>
              ))}
            </ul>
          )}
        </div>
        <div className="space-y-1">
          <h3 className="text-xs font-bold uppercase tracking-wide text-zinc-400">
            Pending approvals ({panel.approvals.length})
          </h3>
          {panel.approvals.length === 0 ? (
            <p className="text-sm text-zinc-500">None pending.</p>
          ) : (
            <ul className="space-y-1">
              {panel.approvals.map((ap) => (
                <li key={ap.id} className="text-sm text-zinc-600">
                  <Link
                    href={`/admin/workforce/approvals/${ap.id}`}
                    className="font-semibold text-zinc-950 hover:underline"
                  >
                    {ap.action}
                  </Link>{" "}
                  · risk {ap.risk}
                </li>
              ))}
            </ul>
          )}
          <h3 className="pt-2 text-xs font-bold uppercase tracking-wide text-zinc-400">
            Open incidents ({panel.incidents.length})
          </h3>
          {panel.incidents.length === 0 ? (
            <p className="text-sm text-zinc-500">None linked.</p>
          ) : (
            <ul className="space-y-1">
              {panel.incidents.map((i) => (
                <li key={i.id} className="text-sm text-zinc-600">
                  <Link
                    href={`/admin/workforce/sentinel/incidents/${i.id}`}
                    className="font-semibold text-zinc-950 hover:underline"
                  >
                    {i.severity} — {i.title.slice(0, 80)}
                  </Link>{" "}
                  · {i.linked ? i.status : `${i.status} · platform`}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>

      <div className="mt-3 border-t border-zinc-200 pt-2">
        <Link
          href={`/admin/workforce/agents/${a.id}`}
          className="text-sm font-semibold text-violet-700 hover:underline"
        >
          Open full page →
        </Link>
      </div>
    </section>
  );
}
