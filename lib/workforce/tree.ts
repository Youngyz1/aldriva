/**
 * lib/workforce/tree.ts — Stage 21 (P1): workforce shell tree (read-only).
 *
 * The shell layout's ONLY data access. Aggregated in a fixed handful of
 * bounded queries — never per-row:
 * - agent rows (status, presence, current task, last run) reuse the office
 *   snapshot builder over fetchCommandCenterData (agents 50, runs 20,
 *   tasks 10), so the status dot uses the existing presence logic;
 * - pending approvals grouped by requested_by_agent_id in ONE query;
 * - open incidents per agent via ONE aggregated hop
 *   incidents.agent_run_id -> agent_runs.agent_id.
 *
 * No secrets, no tool internals, no model output. requireAdmin() runs
 * first; without it the helper redirects before any read.
 */

import { requireAdmin } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase-server';
import {
  fetchCommandCenterData,
  type CommandCenterClient,
} from './command-center';
import { buildOfficeSnapshot } from './office';

export interface TreeAgentRow {
  id: string;
  name: string;
  department: string;
  statusLabel: string;
  presence: 'idle' | 'busy' | 'awaiting' | 'neutral';
  currentTaskTitle: string | null;
  lastActivityAt: string | null;
  pendingApprovals: number;
  openIncidents: number;
}

export interface TreeDepartment {
  department: string;
  agents: TreeAgentRow[];
  pendingApprovals: number;
  openIncidents: number;
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce tree read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

/**
 * Pure tree builder: snapshot rows + per-agent approval/incident counts ->
 * departments sorted, agents sorted by name. No I/O — hermetically tested.
 */
export function buildWorkforceTree(
  snapshot: ReturnType<typeof buildOfficeSnapshot>,
  approvalsByAgent: Record<string, number>,
  incidentsByAgent: Record<string, number>
): TreeDepartment[] {
  const byDept = new Map<string, TreeAgentRow[]>();
  for (const a of snapshot.agents) {
    const row: TreeAgentRow = {
      id: a.id,
      name: a.name,
      department: a.department,
      statusLabel: a.statusLabel,
      presence: a.presence,
      currentTaskTitle: a.currentTaskTitle,
      lastActivityAt: a.lastActivityAt,
      pendingApprovals: approvalsByAgent[a.id] ?? 0,
      openIncidents: incidentsByAgent[a.id] ?? 0,
    };
    const list = byDept.get(a.department) ?? [];
    list.push(row);
    byDept.set(a.department, list);
  }
  return [...byDept.entries()]
    .sort(([x], [y]) => x.localeCompare(y))
    .map(([department, agents]) => {
      agents.sort((x, y) => x.name.localeCompare(y.name));
      return {
        department,
        agents,
        pendingApprovals: agents.reduce((s, a) => s + a.pendingApprovals, 0),
        openIncidents: agents.reduce((s, a) => s + a.openIncidents, 0),
      };
    });
}

/**
 * Shell tree fetch. Pass an explicit client in hermetic tests to skip the
 * gate; production callers (the workforce layout) pass none, so
 * requireAdmin() runs before any read.
 */
export async function fetchWorkforceTree(client?: CommandCenterClient): Promise<TreeDepartment[]> {
  let supabase: CommandCenterClient;
  if (client) {
    supabase = client;
  } else {
    await requireAdmin();
    supabase = (await createSupabaseServer()) as unknown as CommandCenterClient;
  }

  const raw = await fetchCommandCenterData(supabase, null);
  const snapshot = buildOfficeSnapshot(raw);

  // ONE approvals query, grouped in JS (requested_by_agent_id is nullable).
  const approvalRows = await selectAll<{ requested_by_agent_id: string | null }>(
    (supabase as unknown as {
      from(table: string): any;
    })
      .from('approvals')
      .select('requested_by_agent_id')
      .eq('status', 'pending')
      .limit(200),
    'pending approvals'
  );
  const approvalsByAgent: Record<string, number> = {};
  for (const r of approvalRows) {
    if (!r.requested_by_agent_id) continue;
    approvalsByAgent[r.requested_by_agent_id] = (approvalsByAgent[r.requested_by_agent_id] ?? 0) + 1;
  }

  // ONE aggregated incident hop: open incidents -> run ids -> agent ids.
  const incidentRows = await selectAll<{ agent_run_id: string | null }>(
    (supabase as unknown as {
      from(table: string): any;
    })
      .from('incidents')
      .select('agent_run_id')
      .in('status', ['open', 'investigating'])
      .not('agent_run_id', 'is', null)
      .limit(100),
    'open incidents'
  );
  const runIds = [...new Set(incidentRows.map((r) => r.agent_run_id).filter((id): id is string => !!id))];
  const incidentsByAgent: Record<string, number> = {};
  if (runIds.length > 0) {
    const runRows = await selectAll<{ id: string; agent_id: string }>(
      (supabase as unknown as {
        from(table: string): any;
      })
        .from('agent_runs')
        .select('id,agent_id')
        .in('id', runIds),
      'incident runs'
    );
    for (const r of runRows) {
      incidentsByAgent[r.agent_id] = (incidentsByAgent[r.agent_id] ?? 0) + 1;
    }
  }

  return buildWorkforceTree(snapshot, approvalsByAgent, incidentsByAgent);
}
