/**
 * lib/workforce/agents.ts — Stage 2 (Agents list + detail).
 *
 * Same shape as command-center.ts (fetch + pure view-model builder) and same
 * tenant contract: agents are platform-level (never tenant-filtered);
 * tasks/runs/reports attached to an agent take .eq('tenant_id') when a
 * tenant is given. Knowledge has no per-agent linkage in the schema, so the
 * detail page reports the shared corpus honestly instead of inventing
 * per-agent attachments.
 *
 * Secret hygiene (tested): system_prompt is never selected; tool rows carry
 * name/description/scope/risk only (no input_schema, no executor_ref);
 * step contents and run payloads are never read here.
 */

import type { CommandCenterClient } from './command-center';

export interface AgentDetail {
  id: string;
  name: string;
  display_name: string;
  department: string;
  description: string;
  model_selection: string;
  autonomy_level: string;
  tenant_id: string | null;
  status: string;
  version: number;
  updated_at: string;
}

export interface AgentToolView {
  name: string;
  description: string;
  scope: string;
  risk: string;
}

export interface AgentTaskView {
  id: string;
  title: string;
  status: string;
  created_at: string;
}

export interface AgentRunView {
  id: string;
  status: string;
  triggered_by: string;
  error: string | null;
  created_at: string;
  completed_at: string | null;
  approval_id?: string | null;
}

export interface AgentReportView {
  id: string;
  report_type: string;
  summary: string;
  created_at: string;
}

export interface KnowledgeDigest {
  platformApproved: number;
  agentRoleDocs: { id: string; title: string }[];
}

export interface AgentDetailRaw {
  agent: AgentDetail;
  tools: AgentToolView[];
  tasks: AgentTaskView[];
  runs: AgentRunView[];
  reports: AgentReportView[];
  knowledge: KnowledgeDigest;
  /** Approval ids in this window whose approvals row is non-pending (O-7 staleness guard). */
  decidedApprovalIds?: string[];
}

/** Live presence: an agent is busy iff it has a running/awaiting run. */
const BUSY_RUN = new Set(['running', 'awaiting_approval']);

export function isBusyStatus(status: string): boolean {
  return BUSY_RUN.has(status);
}

/** Shared lifecycle-vs-presence derivation (also used by command-center). */
export function derivePresence(runStatuses: string[]): { busy: boolean } {
  return { busy: runStatuses.some((s) => BUSY_RUN.has(s)) };
}

/**
 * Stage 17 (O-7): staleness guard. An awaiting_approval run whose approval is
 * already decided is a phantom (see O-2): the decision path now transitions
 * these rows, but rows decided before that fix — or missed by a failed
 * transition — must not read as busy. decidedApprovalIds carries approval
 * ids whose approvals row is non-pending.
 */
export function isStaleAwaiting(
  status: string,
  approvalId: string | null | undefined,
  decidedApprovalIds: readonly string[]
): boolean {
  return status === 'awaiting_approval' && !!approvalId && decidedApprovalIds.includes(approvalId);
}

/** Live presence: busy and not a decided-approval phantom. */
export function isLiveBusy(
  status: string,
  approvalId: string | null | undefined,
  decidedApprovalIds: readonly string[]
): boolean {
  return BUSY_RUN.has(status) && !isStaleAwaiting(status, approvalId, decidedApprovalIds);
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce agents read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

function scopedTenant<T>(q: T, tenantId: string | null): T {
  if (tenantId === null) return q;
  return (q as unknown as { eq(col: string, val: unknown): T }).eq('tenant_id', tenantId);
}

export async function fetchAgentList(client: CommandCenterClient): Promise<AgentDetail[]> {
  return selectAll<AgentDetail>(
    client.from('agents').select('id,name,display_name,department,description,model_selection,autonomy_level,tenant_id,status,version,updated_at').order('display_name', { ascending: true }).limit(50),
    'agents'
  );
}

export interface PresenceRun {
  agent_id: string;
  status: string;
  created_at: string;
  approval_id?: string | null;
}

/** Recent runs for live-presence derivation (bounded window, newest first). */
export async function fetchRecentRunPresence(
  client: CommandCenterClient,
  tenantId: string | null = null
): Promise<PresenceRun[]> {
  let q = client.from('agent_runs').select('agent_id,status,created_at,approval_id');
  if (tenantId !== null) q = q.eq('tenant_id', tenantId);
  return selectAll<PresenceRun>(q.order('created_at', { ascending: false }).limit(50), 'agent_runs');
}

export async function fetchAgentDetail(
  client: CommandCenterClient,
  agentId: string,
  tenantId: string | null = null
): Promise<AgentDetailRaw | null> {
  const agents = await selectAll<AgentDetail>(
    client.from('agents').select('id,name,display_name,department,description,model_selection,autonomy_level,tenant_id,status,version,updated_at').eq('id', agentId).limit(1),
    'agent'
  );
  const agent = agents[0] ?? null;
  if (!agent) return null;

  const toolRows = await selectAll<{ tool_name: string; allowed: boolean }>(
    client.from('agent_tools').select('tool_name,allowed').eq('agent_id', agentId).eq('allowed', true).limit(100),
    'agent_tools'
  );
  const names = toolRows.map((t) => t.tool_name);
  let tools: AgentToolView[] = [];
  if (names.length > 0) {
    const defs = await selectAll<{ name: string; description: string; scope: string; risk: string }>(
      client.from('tool_definitions').select('name,description,scope,risk').in('name', names).limit(100),
      'tool_definitions'
    );
    const byName = new Map(defs.map((d) => [d.name, d]));
    tools = names
      .map((n) => byName.get(n))
      .filter((d): d is { name: string; description: string; scope: string; risk: string } => !!d)
      .map((d) => ({ name: d.name, description: d.description, scope: d.scope, risk: d.risk }));
  }

  const tasks = await selectAll<AgentTaskView>(
    scopedTenant(client.from('agent_tasks').select('id,title,status,created_at').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(5), tenantId),
    'agent_tasks'
  );
  const runs = await selectAll<AgentRunView>(
    scopedTenant(client.from('agent_runs').select('id,status,triggered_by,error,created_at,completed_at,approval_id').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(5), tenantId),
    'agent_runs'
  );
  const reports = await selectAll<AgentReportView>(
    scopedTenant(client.from('agent_reports').select('id,report_type,summary,created_at').eq('agent_id', agentId).order('created_at', { ascending: false }).limit(5), tenantId),
    'agent_reports'
  );

  // Shared corpus: platform-approved docs + agent_role titles. No per-agent
  // linkage exists in the schema — reported as-is, never fabricated.
  const docs = await selectAll<{ id: string; title: string; category: string }>(
    client.from('knowledge_documents').select('id,title,category').is('tenant_id', null).eq('status', 'approved').limit(100),
    'knowledge_documents'
  );

  return {
    agent,
    tools,
    tasks,
    runs,
    reports,
    knowledge: {
      platformApproved: docs.length,
      agentRoleDocs: docs.filter((d) => d.category === 'agent_role').map((d) => ({ id: d.id, title: d.title })),
    },
    decidedApprovalIds: await fetchDecidedApprovalIds(client, runs),
  };
}

/**
 * Stage 17 (O-7): approval ids (from the given runs) whose approvals row is
 * already decided. Read-only; empty in/out on no linked approvals.
 */
export async function fetchDecidedApprovalIds(
  client: CommandCenterClient,
  runs: Array<{ approval_id?: string | null }>
): Promise<string[]> {
  const ids = [...new Set(runs.map((r) => r.approval_id).filter((id): id is string => !!id))];
  if (ids.length === 0) return [];
  const rows = await selectAll<{ id: string; status: string }>(
    client.from('approvals').select('id,status').in('id', ids),
    'approval decisions'
  );
  return rows.filter((r) => r.status !== 'pending').map((r) => r.id);
}

export interface AgentDetailViewModel {
  agent: AgentDetail;
  busy: boolean;
  currentTask: AgentTaskView | null;
  lastActivityAt: string | null;
  tools: AgentToolView[];
  toolScopeCounts: Record<string, number>;
  permissions: string[];
  tasks: AgentTaskView[];
  runs: AgentRunView[];
  reports: AgentReportView[];
  knowledge: KnowledgeDigest;
  empty: { tools: boolean; tasks: boolean; runs: boolean; reports: boolean; knowledge: boolean };
}

/**
 * Pure detail view-model. Permissions are derived facts (autonomy + scopes),
 * never credentials. Empty sections flagged for honest empty states.
 */
export function buildAgentDetailViewModel(raw: AgentDetailRaw): AgentDetailViewModel {
  const decided = raw.decidedApprovalIds ?? [];
  const live = (r: AgentRunView) => isLiveBusy(r.status, r.approval_id, decided);
  const { busy } = { busy: raw.runs.some(live) };
  const toolScopeCounts: Record<string, number> = {};
  for (const t of raw.tools) toolScopeCounts[t.scope] = (toolScopeCounts[t.scope] ?? 0) + 1;

  const permissions: string[] = [
    `Autonomy ${raw.agent.autonomy_level}: ${raw.agent.autonomy_level === 'L0' ? 'read-only — approval-gated tools are blocked without human approval' : 'escalated autonomy — see approvals for active grants'}`,
    `${raw.tools.length} allowed tool(s)${Object.entries(toolScopeCounts).map(([s, n]) => `, ${n} ${s}`).join('')}`,
    'Tenant isolation enforced server-side on every tool call; agent identity cannot grant itself tools.',
  ];

  return {
    agent: raw.agent,
    busy,
    // Stage 17 (O-7): current work is the newest NON-terminal task; a
    // completed task is history, never "current".
    currentTask: raw.tasks.find((t) => t.status === 'queued' || t.status === 'running' || t.status === 'awaiting_approval') ?? null,
    // Stage 17 (O-7): completion time when present, creation otherwise.
    lastActivityAt: raw.runs[0]?.completed_at ?? raw.runs[0]?.created_at ?? null,
    tools: raw.tools,
    toolScopeCounts,
    permissions,
    tasks: raw.tasks,
    runs: raw.runs,
    reports: raw.reports,
    knowledge: raw.knowledge,
    empty: {
      tools: raw.tools.length === 0,
      tasks: raw.tasks.length === 0,
      runs: raw.runs.length === 0,
      reports: raw.reports.length === 0,
      knowledge: raw.knowledge.platformApproved === 0,
    },
  };
}

/** UUID-shape guard for the [id] route: malformed ids 404 instead of 500. */
export function isAgentIdShape(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
