/**
 * lib/workforce/tasks.ts — Stage 3 (Tasks list + detail).
 *
 * Same shape as agents.ts/command-center.ts (fetch + pure view-model).
 * Tenant contract: tasks/runs/reports take .eq('tenant_id') when a tenant
 * is given; steps have no tenant column and inherit scope through their
 * run ids. Agents are platform-level (never tenant-filtered).
 *
 * State reality (from db/migration_142_agent_runtime.sql — mapped, not
 * invented): tasks use queued/running/awaiting_approval/completed/failed/
 * cancelled/expired (there is no 'pending'); runs use running/
 * awaiting_approval/completed/failed/cancelled. Tasks carry created_at +
 * updated_at only (no started/completed columns) — run rows supply
 * started/completed. Task payload is never selected (title suffices).
 *
 * Secret hygiene (tested): step args_redacted never selected; step content
 * surfaces only for kind='error', truncated; result summaries truncated;
 * no run payloads, no credentials anywhere in the view model.
 */

import type { CommandCenterClient } from './command-center';

/** Plan wording → actual schema states (display labels). */
export const TASK_STATUS_LABELS: Record<string, string> = {
  queued: 'pending',
  running: 'running',
  awaiting_approval: 'waiting for approval',
  completed: 'completed',
  failed: 'failed',
  cancelled: 'cancelled',
  expired: 'expired',
};

export function taskStatusLabel(status: string): string {
  return TASK_STATUS_LABELS[status] ?? status;
}

export interface TaskListItem {
  id: string;
  agent_id: string;
  tenant_id: string | null;
  title: string;
  status: string;
  priority: string;
  created_at: string;
  updated_at: string;
}

export interface TaskAgentRef {
  id: string;
  name: string;
  display_name: string;
}

export interface TaskRunView {
  id: string;
  status: string;
  triggered_by: string;
  guard_result: string;
  duration_ms: number | null;
  error: string | null;
  created_at: string;
  completed_at: string | null;
}

export interface TaskStepView {
  id: string;
  run_id: string;
  seq: number;
  kind: string;
  tool_name: string | null;
  result_summary: string | null;
  content: string | null;
  guard_verdict: string | null;
  created_at: string;
}

export interface TaskReportView {
  id: string;
  report_type: string;
  summary: string;
  created_at: string;
}

export interface TaskDetailRaw {
  task: TaskListItem;
  agent: TaskAgentRef | null;
  runs: TaskRunView[];
  stepsByRun: Record<string, TaskStepView[]>;
  reports: TaskReportView[];
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce tasks read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

function scopedTenant<T>(q: T, tenantId: string | null): T {
  if (tenantId === null) return q;
  return (q as unknown as { eq(col: string, val: unknown): T }).eq('tenant_id', tenantId);
}

export async function fetchTaskList(
  client: CommandCenterClient,
  tenantId: string | null = null,
  status: string | null = null
): Promise<TaskListItem[]> {
  let q = scopedTenant(
    client.from('agent_tasks').select('id,agent_id,tenant_id,title,status,priority,created_at,updated_at'),
    tenantId
  );
  if (status !== null) q = q.eq('status', status);
  return selectAll<TaskListItem>(q.order('created_at', { ascending: false }).limit(50), 'agent_tasks');
}

export async function fetchTaskStatusCounts(
  client: CommandCenterClient,
  tenantId: string | null = null
): Promise<Record<string, number>> {
  // Bounded window counts (recent 200) — honest "recent" grouping, not a
  // table-wide census (which would need an aggregate endpoint).
  const rows = await selectAll<{ status: string }>(
    scopedTenant(client.from('agent_tasks').select('status'), tenantId)
      .order('created_at', { ascending: false })
      .limit(200),
    'agent_task_counts'
  );
  const counts: Record<string, number> = {};
  for (const r of rows) counts[r.status] = (counts[r.status] ?? 0) + 1;
  return counts;
}

const STEP_SUMMARY_LEN = 200;
const STEP_ERROR_LEN = 300;

function truncate(s: string | null, n: number): string | null {
  if (s === null || s === undefined) return null;
  return s.length > n ? `${s.slice(0, n)}…[truncated]` : s;
}

export async function fetchTaskDetail(
  client: CommandCenterClient,
  taskId: string,
  tenantId: string | null = null
): Promise<TaskDetailRaw | null> {
  const tasks = await selectAll<TaskListItem>(
    scopedTenant(
      client.from('agent_tasks').select('id,agent_id,tenant_id,title,status,priority,created_at,updated_at').eq('id', taskId).limit(1),
      tenantId
    ),
    'agent_task'
  );
  const task = tasks[0] ?? null;
  if (!task) return null;

  const agentRows = await selectAll<TaskAgentRef>(
    client.from('agents').select('id,name,display_name').eq('id', task.agent_id).limit(1),
    'agent'
  );

  const runs = await selectAll<TaskRunView>(
    scopedTenant(
      client.from('agent_runs').select('id,status,triggered_by,guard_result,duration_ms,error,created_at,completed_at').eq('task_id', taskId).order('created_at', { ascending: false }).limit(5),
      tenantId
    ),
    'agent_runs'
  );

  // Steps inherit tenant scope through their (already scoped) run ids.
  const runIds = runs.map((r) => r.id);
  let steps: (TaskStepView & { result_summary: string | null; content: string | null })[] = [];
  if (runIds.length > 0) {
    const raw = await selectAll<{ id: string; run_id: string; seq: number; kind: string; tool_name: string | null; result_summary: string | null; content: string | null; guard_verdict: string | null; created_at: string }>(
      client.from('agent_steps').select('id,run_id,seq,kind,tool_name,result_summary,content,guard_verdict,created_at').in('run_id', runIds).order('run_id', { ascending: true }).order('seq', { ascending: true }).limit(100),
      'agent_steps'
    );
    steps = raw.map((s) => ({
      ...s,
      // Summaries only; error text truncated. args_redacted never selected.
      result_summary: truncate(s.result_summary, STEP_SUMMARY_LEN),
      content: s.kind === 'error' ? truncate(s.content, STEP_ERROR_LEN) : null,
    }));
  }
  const stepsByRun: Record<string, TaskStepView[]> = {};
  for (const s of steps) {
    (stepsByRun[s.run_id] ??= []).push(s);
  }

  const reports = await selectAll<TaskReportView>(
    scopedTenant(
      client.from('agent_reports').select('id,report_type,summary,created_at').in('run_id', runIds.length > 0 ? runIds : ['00000000-0000-0000-0000-000000000000']).order('created_at', { ascending: false }).limit(5),
      tenantId
    ),
    'agent_reports'
  );

  return { task, agent: agentRows[0] ?? null, runs, stepsByRun, reports };
}

export interface TaskDetailViewModel {
  task: TaskListItem;
  agent: TaskAgentRef | null;
  statusLabel: string;
  runs: TaskRunView[];
  stepsByRun: Record<string, TaskStepView[]>;
  reports: TaskReportView[];
  empty: { runs: boolean; steps: boolean; reports: boolean };
}

/** Pure detail view-model with honest empty flags. */
export function buildTaskDetailViewModel(raw: TaskDetailRaw): TaskDetailViewModel {
  const stepCount = Object.values(raw.stepsByRun).reduce((n, arr) => n + arr.length, 0);
  return {
    task: raw.task,
    agent: raw.agent,
    statusLabel: taskStatusLabel(raw.task.status),
    runs: raw.runs,
    stepsByRun: raw.stepsByRun,
    reports: raw.reports,
    empty: { runs: raw.runs.length === 0, steps: stepCount === 0, reports: raw.reports.length === 0 },
  };
}

/** UUID-shape guard for the [id] route: malformed ids 404 instead of 500. */
export function isTaskIdShape(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}

/** Valid task status values (actual schema CHECK) for the list filter. */
export function isTaskStatusValue(s: string): boolean {
  return s in TASK_STATUS_LABELS;
}
