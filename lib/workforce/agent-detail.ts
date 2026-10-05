/**
 * lib/workforce/agent-detail.ts — Stage 21 (P3): per-agent selection panel.
 *
 * Read-only backing for the office ?agent= panel (and any future per-agent
 * surface). For ONE registry agent: current task, last 5 runs, pending
 * approvals (list, max 5, newest first), and open incidents under the
 * shared incident rule (run-linked -> this agent; run-less platform
 * incidents -> the reliability agent only). Every list is bounded with row
 * caps; the query count is fixed (no per-row queries).
 *
 * Validation: the id must be UUID-shaped AND exist in the registry —
 * anything else resolves null and the caller renders no panel (no 404, no
 * error leak). requireAdmin() runs first unless a client is injected
 * (hermetic tests inject; the office page is already gated and injects).
 *
 * No secrets: agent names/departments/statuses, task titles, run statuses,
 * approval actions, incident titles only. system_prompt, tool args,
 * evidence values, step contents and payloads are never selected.
 */

import { requireAdmin } from '@/lib/auth';
import { createSupabaseServer } from '@/lib/supabase-server';
import { isAgentIdShape } from './agents';
import type { CommandCenterClient } from './command-center';

export interface PanelAgent {
  id: string;
  display_name: string;
  department: string;
  status: string;
  autonomy_level: string;
}

export interface PanelTask {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export interface PanelRun {
  id: string;
  status: string;
  triggered_by: string;
  created_at: string;
  completed_at: string | null;
}

export interface PanelApproval {
  id: string;
  action: string;
  risk: string;
  created_at: string;
  expires_at: string;
}

export interface PanelIncident {
  id: string;
  title: string;
  severity: string;
  status: string;
  /** Run-linked (this agent's run) vs platform (run-less, reliability only). */
  linked: boolean;
}

export interface AgentPanelData {
  agent: PanelAgent;
  currentTask: PanelTask | null;
  runs: PanelRun[];
  approvals: PanelApproval[];
  incidents: PanelIncident[];
}

const TASK_CAP = 1;
const RUN_CAP = 5;
const APPROVAL_CAP = 5;
const RUNID_CAP = 20;
const INCIDENT_CAP = 5;
const NON_TERMINAL = ['queued', 'running', 'awaiting_approval'];
const OPEN = ['open', 'investigating'];

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce agent panel read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

/**
 * Panel fetch. Unknown ids (bad shape or absent row) resolve null so the
 * caller renders no panel — never an error, never a leak.
 */
export async function fetchAgentPanel(
  agentId: string,
  client?: CommandCenterClient
): Promise<AgentPanelData | null> {
  if (!isAgentIdShape(agentId)) return null;

  let supabase: CommandCenterClient;
  if (client) {
    supabase = client;
  } else {
    await requireAdmin();
    supabase = (await createSupabaseServer()) as unknown as CommandCenterClient;
  }
  const db = supabase as unknown as { from(table: string): any };

  const agents = await selectAll<PanelAgent>(
    db.from('agents').select('id,display_name,department,status,autonomy_level').eq('id', agentId).limit(1),
    'agent'
  );
  const agent = agents[0] ?? null;
  if (!agent) return null;

  const [tasks, runs, approvals, runIdRows] = await Promise.all([
    selectAll<PanelTask>(
      db
        .from('agent_tasks')
        .select('id,title,status,created_at')
        .eq('agent_id', agent.id)
        .in('status', NON_TERMINAL)
        .order('created_at', { ascending: false })
        .limit(TASK_CAP),
      'current task'
    ),
    selectAll<PanelRun>(
      db
        .from('agent_runs')
        .select('id,status,triggered_by,created_at,completed_at')
        .eq('agent_id', agent.id)
        .order('created_at', { ascending: false })
        .limit(RUN_CAP),
      'runs'
    ),
    selectAll<PanelApproval>(
      db
        .from('approvals')
        .select('id,action,risk,created_at,expires_at')
        .eq('requested_by_agent_id', agent.id)
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .limit(APPROVAL_CAP),
      'approvals'
    ),
    selectAll<{ id: string }>(
      db.from('agent_runs').select('id').eq('agent_id', agent.id).order('created_at', { ascending: false }).limit(RUNID_CAP),
      'run ids'
    ),
  ]);

  const runIds = runIdRows.map((r) => r.id);
  const incidents: PanelIncident[] = [];
  if (runIds.length > 0) {
    const linked = await selectAll<PanelIncident>(
      db
        .from('incidents')
        .select('id,title,severity,status')
        .in('status', OPEN)
        .in('agent_run_id', runIds)
        .limit(INCIDENT_CAP),
      'linked incidents'
    );
    for (const i of linked) incidents.push({ ...i, linked: true });
  }
  // Shared rule: run-less platform incidents attribute to the reliability
  // agent only — every other agent never sees them.
  if (agent.department === 'reliability') {
    const platform = await selectAll<PanelIncident>(
      db
        .from('incidents')
        .select('id,title,severity,status')
        .in('status', OPEN)
        .is('agent_run_id', null)
        .limit(INCIDENT_CAP),
      'platform incidents'
    );
    for (const i of platform) incidents.push({ ...i, linked: false });
  }

  return {
    agent,
    currentTask: tasks[0] ?? null,
    runs,
    approvals,
    incidents,
  };
}
