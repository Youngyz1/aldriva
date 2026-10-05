/**
 * app/admin/workforce/WorkforceTreeNav.tsx — Stage 21 (P1): shell tree leaf.
 *
 * "use client" ONLY for active-link highlighting (usePathname) and the
 * mobile sheet toggle. Props-only: the department tree arrives from the
 * server layout — no fetch, no actions, no data imports (type-only import
 * is erased at runtime), no writes. Links navigate to agents/[id].
 */
"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState } from "react";
import type { TreeAgentRow, TreeDepartment } from "@/lib/workforce/tree";

const PRESENCE_DOT: Record<TreeAgentRow["presence"], string> = {
  busy: "bg-emerald-500",
  awaiting: "bg-amber-500",
  neutral: "bg-zinc-400",
  idle: "bg-zinc-300",
};

const PRESENCE_LABEL: Record<TreeAgentRow["presence"], string> = {
  busy: "busy",
  awaiting: "awaiting approval",
  neutral: "state unknown",
  idle: "idle",
};

function AgentRow({ agent, active, onNavigate }: { agent: TreeAgentRow; active: boolean; onNavigate: () => void }) {
  return (
    <Link
      href={`/admin/workforce/agents/${agent.id}`}
      onClick={onNavigate}
      aria-current={active ? "page" : undefined}
      aria-label={`${agent.name}, ${PRESENCE_LABEL[agent.presence]}`}
      className={`flex items-center gap-2 rounded-xl px-3 py-2 text-sm ${
        active ? "bg-zinc-100 font-semibold text-zinc-950" : "text-zinc-600 hover:bg-zinc-50 hover:text-zinc-950"
      }`}
    >
      <span
        aria-hidden="true"
        title={PRESENCE_LABEL[agent.presence]}
        className={`h-2 w-2 shrink-0 rounded-full ${PRESENCE_DOT[agent.presence]}`}
      />
      <span className="min-w-0 flex-1 truncate">{agent.name}</span>
      {agent.pendingApprovals > 0 && (
        <span className="shrink-0 rounded-full bg-amber-100 px-1.5 py-0.5 text-[10px] font-bold text-amber-700">
          {agent.pendingApprovals}
        </span>
      )}
      {agent.openIncidents > 0 && (
        <span className="shrink-0 rounded-full bg-red-100 px-1.5 py-0.5 text-[10px] font-bold text-red-700">
          {agent.openIncidents}
        </span>
      )}
    </Link>
  );
}

function TreeBody({
  departments,
  pathname,
  onNavigate,
}: {
  departments: TreeDepartment[];
  pathname: string;
  onNavigate: () => void;
}) {
  if (departments.length === 0) {
    return <p className="px-3 py-2 text-sm text-zinc-500">No agents registered.</p>;
  }
  return (
    <ul className="space-y-3">
      {departments.map((dept) => (
        <li key={dept.department}>
          <div className="flex items-center justify-between px-3 pb-1">
            <span className="text-xs font-bold uppercase tracking-wide text-zinc-400">{dept.department}</span>
            {(dept.pendingApprovals > 0 || dept.openIncidents > 0) && (
              <span className="text-[10px] font-semibold text-zinc-400">
                {dept.pendingApprovals > 0 ? `${dept.pendingApprovals} pending` : ""}
                {dept.pendingApprovals > 0 && dept.openIncidents > 0 ? " · " : ""}
                {dept.openIncidents > 0 ? `${dept.openIncidents} incident(s)` : ""}
              </span>
            )}
          </div>
          <ul className="space-y-0.5">
            {dept.agents.map((agent) => (
              <li key={agent.id}>
                <AgentRow
                  agent={agent}
                  active={pathname === `/admin/workforce/agents/${agent.id}`}
                  onNavigate={onNavigate}
                />
              </li>
            ))}
          </ul>
        </li>
      ))}
    </ul>
  );
}

export function WorkforceTreeNav({ departments }: { departments: TreeDepartment[] }) {
  const pathname = usePathname() ?? "";
  const [open, setOpen] = useState(false);
  const agentCount = departments.reduce((s, d) => s + d.agents.length, 0);
  const pendingCount = departments.reduce((s, d) => s + d.pendingApprovals, 0);
  const close = () => setOpen(false);

  // Dismiss the sheet on Esc as well as backdrop and navigation.
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [open]);

  return (
    <>
      {/* Mobile: collapsed toggle + top sheet */}
      <div className="mb-4 lg:hidden">
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          className="flex w-full items-center justify-between rounded-xl border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-950"
        >
          <span>
            Agents ({agentCount}
            {pendingCount > 0 ? ` · ${pendingCount} pending` : ""})
          </span>
          <span aria-hidden="true" className="text-zinc-400">{open ? "▲" : "▼"}</span>
        </button>
      </div>
      {open && (
        <>
          <button
            type="button"
            aria-label="Close agent tree"
            onClick={close}
            className="fixed inset-0 z-30 cursor-default bg-zinc-950/20 lg:hidden"
          />
          <nav
            aria-label="Workforce agents"
            className="fixed inset-x-3 top-16 z-40 max-h-[70vh] overflow-y-auto rounded-2xl border border-zinc-200 bg-white p-3 shadow-xl lg:hidden"
          >
            <TreeBody departments={departments} pathname={pathname} onNavigate={close} />
          </nav>
        </>
      )}

      {/* Desktop: sticky left tree */}
      <aside className="hidden w-64 shrink-0 lg:block">
        <nav
          aria-label="Workforce agents"
          className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto rounded-xl border border-zinc-200 bg-white p-3"
        >
          <TreeBody departments={departments} pathname={pathname} onNavigate={() => {}} />
        </nav>
      </aside>
    </>
  );
}
