/**
 * OfficeFallback — 2D accessible list for the 3D office.
 *
 * Same snapshot, no three.js (this file must never import it): shown when
 * WebGL is unavailable, on small screens, or via the List-view toggle.
 * Keyboard-operable (native links) with screen-reader text per agent state.
 */
import Link from "next/link";
import type { OfficeSnapshot } from "@/lib/workforce/office";

const PRESENCE_TEXT: Record<string, string> = {
  busy: "currently busy",
  awaiting: "awaiting approval",
  neutral: "state unknown",
  idle: "idle",
};

export function OfficeFallback({ snapshot }: { snapshot: OfficeSnapshot }) {
  return (
    <div className="rounded-xl bg-zinc-900 p-4 shadow-xs">
      <p className="mb-3 text-sm text-zinc-400">
        {snapshot.agents.length} agent(s) · {snapshot.pendingApprovals} pending approval(s) ·{' '}
        {snapshot.openIncidents} open incident(s)
      </p>
      <ul className="space-y-2">
        {snapshot.agents.map((a) => (
          <li key={a.id} className="flex items-center justify-between gap-3 rounded-xl bg-zinc-950 px-3 py-2">
            <div>
              <span className="text-sm text-white">{a.name}</span>{' '}
              <span className="text-xs text-zinc-500">
                {a.department} · {a.statusLabel} · {PRESENCE_TEXT[a.presence] ?? "idle"}
              </span>
              {a.currentTaskTitle && <div className="text-xs text-zinc-400">{a.currentTaskTitle}</div>}
            </div>
            <Link
              href={`/admin/workforce/agents/${a.id}`}
              className="shrink-0 rounded-xl bg-zinc-800 px-3 py-1.5 text-xs text-zinc-200 hover:text-white"
              aria-label={`Open ${a.name}, ${PRESENCE_TEXT[a.presence] ?? "idle"}`}
            >
              Open
            </Link>
          </li>
        ))}
      </ul>
      {snapshot.agents.length === 0 && (
        <p className="text-sm text-zinc-500">No agents registered. This zero is real, not a placeholder.</p>
      )}
    </div>
  );
}
