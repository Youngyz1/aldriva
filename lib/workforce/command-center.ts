/**
 * lib/workforce/command-center.ts — Stage 1 (AI Workforce Core)
 *
 * Read-only data access for the Workforce Command Center. All queries run
 * through the caller's Supabase client (admin pages pass the authenticated
 * server client, so RLS applies; service-role is never touched here).
 *
 * Tenant scoping contract (explicit, tested hermetically):
 * - tenantId === null → platform-wide admin view (no tenant filter).
 * - tenantId set → tenant-scoped tables (runs/tasks/reports/incidents/
 *   events) are filtered with .eq('tenant_id', tenantId). Agents and
 *   approvals are platform registries: agents are never tenant-filtered
 *   (tenant_id NULL = platform agent by design); approvals carry an
 *   optional tenant_id and ARE filtered when a tenant is given.
 *
 * No secrets, no tool internals, no model output flow through this module.
 * Every list is bounded (LIMIT) and ordered newest-first.
 */

// Live-presence derivation lives in ./agents (single source of truth —
// Stage 2 resolution: stored `status` is the admin lifecycle, `busy`
// derives from live run state; both are displayed, distinctly labeled).
import { fetchDecidedApprovalIds, isLiveBusy } from './agents';

/**
 * The caller supplies any PostgREST-style client (real Supabase server
 * client or hermetic fake). `from()` returns `any` deliberately: the real
 * builder's chain types (`QueryBuilder` → `FilterBuilder`) do not flatten
 * onto one interface, so generic-level conformance would be fiction. The
 * actual chain shape (select/eq/in/order/limit, thenable) is enforced by
 * the hermetic suite instead — see lib/workforce/__tests__/.
 */
export interface CommandCenterClient {
  from(table: string): any;
}

export interface AgentRow {
  id: string;
  name: string;
  display_name: string;
  department: string;
  status: string;
  autonomy_level: string;
  updated_at: string;
}

export interface RunRow {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  task_id: string | null;
  status: string;
  triggered_by: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  approval_id?: string | null;
}

export interface TaskRow {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  title: string;
  status: string;
  created_at: string;
}

export interface ApprovalRow {
  id: string;
  requested_by_agent_id: string | null;
  tenant_id: string | null;
  action: string;
  risk: string;
  status: string;
  created_at: string;
  expires_at: string;
}

export interface ReportRow {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  report_type: string;
  summary: string;
  created_at: string;
}

export interface IncidentRow {
  id: string;
  tenant_id: string | null;
  title: string;
  severity: string;
  status: string;
  event_count: number;
  last_seen_at: string;
}

export interface EventRow {
  id: string;
  tenant_id: string | null;
  kind: string;
  route: string | null;
  message: string;
  created_at: string;
}

export interface CommandCenterRaw {
  agents: AgentRow[];
  runs: RunRow[];
  tasks: TaskRow[];
  approvals: ApprovalRow[];
  reports: ReportRow[];
  incidents: IncidentRow[];
  events: EventRow[];
  qaRunCount: number;
  /** Approval ids in this window whose approvals row is non-pending (O-7 guard). */
  decidedApprovalIds: string[];
}

async function selectAll<T>(qPromise: PromiseLike<unknown>): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce read failed: ${error.message}`);
  return (data ?? []) as T[];
}

/** Apply the tenant filter to tenant-scoped tables; platform registries pass through. */
function scoped(client: CommandCenterClient, table: string, cols: string, tenantId: string | null) {
  let q = client.from(table).select(cols);
  if (tenantId !== null) q = q.eq('tenant_id', tenantId);
  return q;
}

export async function fetchCommandCenterData(
  client: CommandCenterClient,
  tenantId: string | null = null
): Promise<CommandCenterRaw> {
  const agents = await selectAll<AgentRow>(
    client.from('agents').select('id,name,display_name,department,status,autonomy_level,updated_at').order('updated_at', { ascending: false }).limit(50)
  );

  const runs = await selectAll<RunRow>(
    scoped(client, 'agent_runs', 'id,agent_id,tenant_id,task_id,status,triggered_by,error,created_at,completed_at,approval_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(20)
  );

  const tasks = await selectAll<TaskRow>(
    scoped(client, 'agent_tasks', 'id,agent_id,tenant_id,title,status,created_at', tenantId)
      .order('created_at', { ascending: false })
      .limit(10)
  );

  const approvals = await selectAll<ApprovalRow>(
    scoped(client, 'approvals', 'id,requested_by_agent_id,tenant_id,action,risk,status,created_at,expires_at', tenantId)
      .eq('status', 'pending')
      .order('created_at', { ascending: false })
      .limit(10)
  );

  const reports = await selectAll<ReportRow>(
    scoped(client, 'agent_reports', 'id,agent_id,tenant_id,report_type,summary,created_at', tenantId)
      .order('created_at', { ascending: false })
      .limit(5)
  );

  const incidents = await selectAll<IncidentRow>(
    scoped(client, 'incidents', 'id,tenant_id,title,severity,status,event_count,last_seen_at', tenantId)
      .in('status', ['open', 'investigating'])
      .order('last_seen_at', { ascending: false })
      .limit(10)
  );

  const events = await selectAll<EventRow>(
    scoped(client, 'system_events', 'id,tenant_id,kind,route,message,created_at', tenantId)
      .order('created_at', { ascending: false })
      .limit(8)
  );

  // Stage 17 (O-7): QA run count from the QA execution plane (qa_runs),
  // not gateway agent_runs. Platform (NULL tenant) + tenant rows included,
  // matching the QA page's own scoping.
  let qaRunsQuery = client.from('qa_runs').select('id', { count: 'exact', head: true });
  if (tenantId !== null) {
    qaRunsQuery = qaRunsQuery.or(`target_tenant_id.eq.${tenantId},target_tenant_id.is.null`);
  }
  const qaRes = (await qaRunsQuery) as unknown as { count?: number | null; error?: { message: string } | null };
  if (qaRes.error) throw new Error(`Workforce read failed: ${qaRes.error.message}`);
  const qaRunCount = qaRes.count ?? 0;

  // Stage 17 (O-7): staleness guard input — approval ids in this window
  // whose approvals row is already decided (phantoms, see O-2).
  const decidedApprovalIds = await fetchDecidedApprovalIds(client, runs);

  return { agents, runs, tasks, approvals, reports, incidents, events, qaRunCount, decidedApprovalIds };
}

export interface AgentStatus {
  agent: AgentRow;
  busy: boolean;
  lastRunAt: string | null;
}

export interface CommandCenterViewModel {
  counts: {
    totalAgents: number;
    activeAgents: number;
    idleAgents: number;
    runningRuns: number;
    awaitingApproval: number;
    activeTasks: number;
    failedRunsRecent: number;
    pendingApprovals: number;
    openIncidents: number;
    qaRuns: number;
  };
  agents: AgentStatus[];
  runs: RunRow[];
  tasks: TaskRow[];
  approvals: ApprovalRow[];
  reports: ReportRow[];
  incidents: IncidentRow[];
  events: EventRow[];
  agentNameById: Record<string, string>;
  empty: {
    agents: boolean;
    runs: boolean;
    tasks: boolean;
    approvals: boolean;
    reports: boolean;
    incidents: boolean;
    events: boolean;
    qa: boolean;
  };
}

const ACTIVE_TASK = new Set(['queued', 'running', 'awaiting_approval']);

/**
 * Pure view-model builder: counts, per-agent busy/last-run derivation, and
 * explicit empty flags so the page renders designed empty states instead of
 * inventing numbers. No I/O — fully hermetically testable.
 */
export function buildCommandCenterViewModel(raw: CommandCenterRaw): CommandCenterViewModel {
  const agentNameById: Record<string, string> = {};
  for (const a of raw.agents) agentNameById[a.id] = a.display_name || a.name;

  // Stage 17 (O-7): staleness guard — decided-approval phantoms are not busy.
  const decided = raw.decidedApprovalIds ?? [];
  const live = (r: RunRow) => isLiveBusy(r.status, r.approval_id, decided);
  const busyAgentIds = new Set(
    raw.runs.filter(live).map((r) => r.agent_id)
  );
  const lastRunByAgent: Record<string, string> = {};
  for (const r of raw.runs) {
    // Stage 17 (O-7): completion time when present, creation otherwise.
    if (!lastRunByAgent[r.agent_id]) lastRunByAgent[r.agent_id] = r.completed_at ?? r.created_at;
  }

  const agents: AgentStatus[] = raw.agents.map((agent) => ({
    agent,
    busy: busyAgentIds.has(agent.id),
    lastRunAt: lastRunByAgent[agent.id] ?? null,
  }));

  const activeAgents = raw.agents.filter((a) => a.status === 'active');
  // Stage 17 (O-7): a task born 'completed' whose run is still live counts as
  // active (O-6 read-time derivation — stored task status untouched).
  const liveTaskIds = new Set(raw.runs.filter(live).map((r) => r.task_id).filter((id): id is string => !!id));
  const counts = {
    totalAgents: raw.agents.length,
    activeAgents: activeAgents.length,
    idleAgents: activeAgents.filter((a) => !busyAgentIds.has(a.id)).length,
    runningRuns: raw.runs.filter((r) => r.status === 'running' && live(r)).length,
    awaitingApproval: raw.runs.filter((r) => r.status === 'awaiting_approval' && live(r)).length,
    activeTasks: raw.tasks.filter((t) => ACTIVE_TASK.has(t.status) || liveTaskIds.has(t.id)).length,
    failedRunsRecent: raw.runs.filter((r) => r.status === 'failed').length,
    pendingApprovals: raw.approvals.length,
    openIncidents: raw.incidents.length,
    qaRuns: raw.qaRunCount,
  };

  return {
    counts,
    agents,
    runs: raw.runs,
    tasks: raw.tasks,
    approvals: raw.approvals,
    reports: raw.reports,
    incidents: raw.incidents,
    events: raw.events,
    agentNameById,
    empty: {
      agents: raw.agents.length === 0,
      runs: raw.runs.length === 0,
      tasks: raw.tasks.length === 0,
      approvals: raw.approvals.length === 0,
      reports: raw.reports.length === 0,
      incidents: raw.incidents.length === 0,
      events: raw.events.length === 0,
      qa: raw.qaRunCount === 0,
    },
  };
}
