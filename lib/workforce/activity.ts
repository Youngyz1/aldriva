/**
 * lib/workforce/activity.ts — Stage 6 (Activity feed).
 *
 * Unified chronological feed from real rows. Coverage split (explicit —
 * verified against live system_events kinds guard_rejection/api_error,
 * i.e. pure observability signal with zero lifecycle overlap):
 * - system_events: read NATIVE kinds only (api/job/webhook/guard/approval-
 *   block/tool errors). Lifecycle never lives here, so nothing is filtered.
 * - Lifecycle (task created/status, run started/finished, approval
 *   created/decided, report created, incident opened/closed) is DERIVED
 *   from source tables. No event type is read twice: each source row yields
 *   exactly the entries below, and approval_block system events (gateway
 *   denials) are distinct from approval-row created/decided entries.
 * - approval entries carry action/risk/status ONLY — evidence is never
 *   selected (carried-over Stage 4/5 discipline; the write-time args slice
 *   stays out of every read path here).
 *
 * Bounded window (not pagination): per-source caps, merged newest-first,
 * hard cap FEED_CAP. Tenant contract: tenantId null = platform admin view;
 * set = .eq('tenant_id') on scoped tables (agents never filtered).
 */

import type { CommandCenterClient } from './command-center';

export const FEED_CAP = 60;

export type ActivityKind = 'run' | 'task' | 'approval' | 'report' | 'incident' | 'event';

export interface ActivityEntry {
  key: string;
  ts: string;
  kind: ActivityKind;
  title: string;
  detail: string;
  href: string;
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce activity read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

function scopedTenant<T>(q: T, tenantId: string | null): T {
  if (tenantId === null) return q;
  return (q as unknown as { eq(col: string, val: unknown): T }).eq('tenant_id', tenantId);
}

interface RawActivity {
  agents: { id: string; display_name: string }[];
  runs: { id: string; agent_id: string; task_id: string | null; tenant_id: string | null; status: string; triggered_by: string; created_at: string; completed_at: string | null }[];
  tasks: { id: string; title: string; status: string; created_at: string; updated_at: string }[];
  approvals: { id: string; action: string; risk: string; status: string; created_at: string; decided_at: string | null }[];
  reports: { id: string; summary: string; created_at: string }[];
  incidents: { id: string; title: string; severity: string; status: string; event_count: number; first_seen_at: string; last_seen_at: string }[];
  events: { id: string; kind: string; route: string | null; created_at: string }[];
}

export async function fetchActivityData(
  client: CommandCenterClient,
  tenantId: string | null = null
): Promise<RawActivity> {
  const agents = await selectAll<{ id: string; display_name: string }>(
    client.from('agents').select('id,display_name').limit(100),
    'agents'
  );
  const runs = await selectAll<RawActivity['runs'][number]>(
    scopedTenant(
      client.from('agent_runs').select('id,agent_id,task_id,tenant_id,status,triggered_by,created_at,completed_at').order('created_at', { ascending: false }).limit(20),
      tenantId
    ),
    'agent_runs'
  );
  const tasks = await selectAll<RawActivity['tasks'][number]>(
    scopedTenant(
      client.from('agent_tasks').select('id,title,status,created_at,updated_at').order('updated_at', { ascending: false }).limit(20),
      tenantId
    ),
    'agent_tasks'
  );
  const approvals = await selectAll<RawActivity['approvals'][number]>(
    scopedTenant(
      client.from('approvals').select('id,action,risk,status,created_at,decided_at').order('created_at', { ascending: false }).limit(10),
      tenantId
    ),
    'approvals'
  );
  const reports = await selectAll<RawActivity['reports'][number]>(
    scopedTenant(
      client.from('agent_reports').select('id,summary,created_at').order('created_at', { ascending: false }).limit(10),
      tenantId
    ),
    'agent_reports'
  );
  const incidents = await selectAll<RawActivity['incidents'][number]>(
    scopedTenant(
      client.from('incidents').select('id,title,severity,status,event_count,first_seen_at,last_seen_at').order('last_seen_at', { ascending: false }).limit(10),
      tenantId
    ),
    'incidents'
  );
  const events = await selectAll<RawActivity['events'][number]>(
    scopedTenant(
      client.from('system_events').select('id,kind,route,created_at').order('created_at', { ascending: false }).limit(15),
      tenantId
    ),
    'system_events'
  );
  return { agents, runs, tasks, approvals, reports, incidents, events };
}

/** Seconds between two timestamps; guards clock skew (never negative). */
function ageSeconds(a: string, b: string): number {
  return Math.max(0, (new Date(b).getTime() - new Date(a).getTime()) / 1000);
}

/**
 * Pure feed builder: exactly the documented entries per source row
 * (verified by the no-double-count test), merged newest-first, capped.
 */
export function buildActivityFeed(raw: RawActivity): ActivityEntry[] {
  const agentName = new Map(raw.agents.map((a) => [a.id, a.display_name]));
  const out: ActivityEntry[] = [];

  for (const r of raw.runs) {
    const who = agentName.get(r.agent_id) ?? 'unknown agent';
    const finished = r.status !== 'running';
    out.push({
      key: `run-${r.id}`,
      ts: (finished && r.completed_at) || r.created_at,
      kind: 'run',
      title: finished ? `run ${r.status}` : 'run started',
      detail: `${who} · via ${r.triggered_by}`,
      href: r.task_id ? `/admin/workforce/tasks/${r.task_id}` : '/admin/workforce/agents',
    });
  }

  for (const t of raw.tasks) {
    out.push({
      key: `task-${t.id}-created`,
      ts: t.created_at,
      kind: 'task',
      title: 'task created',
      detail: `${t.title.slice(0, 120)} · ${t.status}`,
      href: `/admin/workforce/tasks/${t.id}`,
    });
    if (ageSeconds(t.created_at, t.updated_at) > 60) {
      out.push({
        key: `task-${t.id}-status`,
        ts: t.updated_at,
        kind: 'task',
        title: `task ${t.status}`,
        detail: t.title.slice(0, 120),
        href: `/admin/workforce/tasks/${t.id}`,
      });
    }
  }

  for (const a of raw.approvals) {
    out.push({
      key: `approval-${a.id}-created`,
      ts: a.created_at,
      kind: 'approval',
      title: 'approval requested',
      detail: `${a.action} · risk ${a.risk}`,
      href: `/admin/workforce/approvals/${a.id}`,
    });
    if (a.decided_at) {
      out.push({
        key: `approval-${a.id}-decided`,
        ts: a.decided_at,
        kind: 'approval',
        title: `approval ${a.status}`,
        detail: a.action,
        href: `/admin/workforce/approvals/${a.id}`,
      });
    }
  }

  for (const r of raw.reports) {
    out.push({
      key: `report-${r.id}`,
      ts: r.created_at,
      kind: 'report',
      title: 'report published',
      detail: r.summary.slice(0, 140),
      href: `/admin/workforce/reports/${r.id}`,
    });
  }

  for (const i of raw.incidents) {
    const closed = i.status !== 'open' && i.status !== 'investigating';
    out.push({
      key: `incident-${i.id}`,
      ts: closed ? i.last_seen_at : i.first_seen_at,
      kind: 'incident',
      title: closed ? `incident ${i.status}` : 'incident opened',
      detail: `${i.severity} — ${i.title.slice(0, 120)} · ${i.event_count} event(s)`,
      href: `/admin/workforce/sentinel/incidents/${i.id}`,
    });
  }

  for (const e of raw.events) {
    out.push({
      key: `event-${e.id}`,
      ts: e.created_at,
      kind: 'event',
      title: e.kind,
      detail: e.route ?? 'no route',
      // No per-event detail route in Stage 9 (deliberate scope limit) —
      // events land on the Sentinel overview, which is a real page.
      href: '/admin/workforce/sentinel',
    });
  }

  out.sort((x, y) => (x.ts < y.ts ? 1 : x.ts > y.ts ? -1 : 0));
  return out.slice(0, FEED_CAP);
}
