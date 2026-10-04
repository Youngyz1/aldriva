/**
 * lib/workforce/office.ts — Stage 19: 3D office view-model (visualization ONLY).
 *
 * HARD RULE: this module is another VIEW of stored workforce state. It never
 * starts, approves, edits or mutates anything: pure functions, no I/O, no
 * clients, no service-role. Animation (in the scene component) reflects
 * STORED state only — never invented activity.
 *
 * Rooms come from the registry `department` field: a new registry agent gets
 * a desk automatically with zero code mapping and no hardcoded agent names.
 */

import type { CommandCenterRaw } from './command-center';

export type AgentPresence = 'idle' | 'busy' | 'awaiting' | 'neutral';

export interface OfficeAgentSnapshot {
  id: string;
  name: string;
  department: string;
  statusLabel: string;
  presence: AgentPresence;
  currentTaskTitle: string | null;
  lastActivityAt: string | null;
}

export interface OfficeSnapshot {
  agents: OfficeAgentSnapshot[];
  openIncidents: number;
  pendingApprovals: number;
}

export interface OfficeDesk {
  agentId: string;
  x: number;
  z: number;
  pose: 'seated' | 'working';
  marker: 'none' | 'awaiting' | 'neutral';
}

export interface OfficeRoom {
  department: string;
  desks: OfficeDesk[];
  alertLight: boolean;
}

export interface OfficeScene {
  rooms: OfficeRoom[];
}

const NON_TERMINAL_TASK = new Set(['queued', 'running', 'awaiting_approval']);
const TITLE_CAP = 80;

function presenceFor(
  statuses: string[],
  approvalIds: Array<string | null | undefined>,
  decidedApprovalIds: readonly string[]
): AgentPresence | 'stale' {
  for (let i = 0; i < statuses.length; i++) {
    const s = statuses[i];
    if (s === 'awaiting_approval') {
      const aid = approvalIds[i];
      if (aid && decidedApprovalIds.includes(aid)) return 'stale';
    }
  }
  if (statuses.includes('awaiting_approval')) return 'awaiting';
  if (statuses.includes('running')) return 'busy';
  if (statuses.some((s) => s !== 'completed' && s !== 'failed' && s !== 'cancelled' && s !== 'idle')) {
    return 'neutral';
  }
  return 'idle';
}

/**
 * Minimal JSON snapshot: ids, names, roles, status labels and counts only.
 * Task titles trimmed to 80 chars. No prompts, tool args, evidence, tokens,
 * or tenant data (tenant_id never selected into the snapshot).
 */
export function buildOfficeSnapshot(raw: CommandCenterRaw): OfficeSnapshot {
  const decided = raw.decidedApprovalIds ?? [];
  const runsByAgent = new Map<string, typeof raw.runs>();
  for (const r of raw.runs) {
    const list = runsByAgent.get(r.agent_id) ?? [];
    list.push(r);
    runsByAgent.set(r.agent_id, list);
  }
  const tasksByAgent = new Map<string, typeof raw.tasks>();
  for (const t of raw.tasks) {
    const list = tasksByAgent.get(t.agent_id) ?? [];
    list.push(t);
    tasksByAgent.set(t.agent_id, list);
  }
  const agents: OfficeAgentSnapshot[] = raw.agents.map((a) => {
    const runs = runsByAgent.get(a.id) ?? [];
    const presenceRaw = presenceFor(
      runs.map((r) => r.status),
      runs.map((r) => r.approval_id),
      decided
    );
    const presence: AgentPresence = presenceRaw === 'stale' ? 'neutral' : presenceRaw;
    const current = (tasksByAgent.get(a.id) ?? []).find((t) => NON_TERMINAL_TASK.has(t.status)) ?? null;
    const newest = runs[0] ?? null;
    return {
      id: a.id,
      name: a.display_name || a.name,
      department: a.department || 'general',
      statusLabel: a.status,
      presence,
      currentTaskTitle: current ? current.title.slice(0, TITLE_CAP) : null,
      lastActivityAt: newest ? (newest.completed_at ?? newest.created_at) : null,
    };
  });
  return {
    agents,
    openIncidents: raw.incidents.length,
    pendingApprovals: raw.approvals.length,
  };
}

const DESK_GAP = 3;
const ROOM_GAP = 12;

/**
 * Snapshot -> deterministic scene model. Desk positions derive from sorted
 * agent order (stable across renders). Rooms derive from departments; the
 * reliability annex exists only while open incidents are stored.
 */
export function buildOfficeScene(snapshot: OfficeSnapshot): OfficeScene {
  const byDept = new Map<string, OfficeAgentSnapshot[]>();
  for (const a of [...snapshot.agents].sort((x, y) => x.id.localeCompare(y.id))) {
    const list = byDept.get(a.department) ?? [];
    list.push(a);
    byDept.set(a.department, list);
  }
  const rooms: OfficeRoom[] = [...byDept.entries()].map(([department, members], ri) => ({
    department,
    desks: members.map((a, i) => ({
      agentId: a.id,
      x: ri * ROOM_GAP + i * DESK_GAP,
      z: 0,
      pose: a.presence === 'busy' ? ('working' as const) : ('seated' as const),
      marker: a.presence === 'awaiting' ? ('awaiting' as const) : a.presence === 'neutral' ? ('neutral' as const) : ('none' as const),
    })),
    alertLight: false,
  }));
  if (snapshot.openIncidents > 0) {
    rooms.push({
      department: 'reliability',
      desks: [],
      alertLight: true,
    });
  }
  return { rooms };
}
