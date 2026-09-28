/**
 * lib/workforce/sentinel.ts — Stage 9 (Sentinel overview + incident list/detail).
 *
 * Same fetch + pure view-model shape as Stages 1–8. Reads PERSISTED
 * incidents / incident_events / system_events rows from migration 143
 * (db/migration_143_sentinel_events.sql — mapped, not invented; `qa_failure`
 * kind added by migration 145:80-83):
 *   incidents(id, tenant_id, status, severity, title, summary, dedupe_key,
 *   event_count, first_seen_at, last_seen_at, agent_run_id, metadata,
 *   created_at, updated_at).
 * Actual status CHECK: open/investigating/resolved/expired (no closed, no
 * acknowledged). Actual severity CHECK: s1/s2/s3/s4. Actual event kinds: the
 * 9 migration-143 values plus qa_failure.
 *   incident_events(incident_id, event_id) — append-only join, no tenant
 *   column (scope inherits from the parent incident via RLS).
 *   system_events(id, tenant_id, kind, severity_hint, route, tool_name,
 *   status_code, error_code, message, dedupe_key, source, created_at, …).
 *
 * Tenant contract (explicit — matches tasks/reports, NOT QA): incidents and
 * events carry plain nullable tenant_id. tenantId === null → platform-wide
 * admin view (no filter; RLS still restricts platform rows to active
 * admins). tenantId set → .eq('tenant_id', tenantId). Platform-level (null)
 * rows are admin-only by RLS, so a tenant view correctly shows only that
 * tenant's rows. Agents/approvals lookups are never tenant-filtered
 * (platform registries, same as Stages 2–4).
 *
 * Read-only discipline (tested): no .insert/.update/.delete anywhere in this
 * module; lifecycle writers (closeStaleIncidents…) are never invoked from UI
 * code. system_events.metadata and incidents.metadata are NEVER selected
 * (unbounded JSONB that may echo webhook bodies). incident/agent_run hops
 * reuse the reports.ts pattern (run → task; reports by run_id).
 *
 * Secret hygiene (tested): system event message text is worker/output text
 * that can echo payloads — it is truncated (300ch) and passed through
 * redactSentinelMessage() at the fetch boundary, same judgment as Stage 8
 * QA errors. summaries/dedupe keys are system-generated strings and render
 * as-is (dedupe display truncated by the page).
 */

import type { CommandCenterClient } from './command-center';

/** Actual incidents.status CHECK values (migration 143) — display order. */
export const INCIDENT_STATUSES = ['open', 'investigating', 'resolved', 'expired'] as const;

export function isIncidentStatusValue(s: string): boolean {
  return (INCIDENT_STATUSES as readonly string[]).includes(s);
}

/** Actual incidents.severity CHECK values (migration 143). */
export const INCIDENT_SEVERITIES = ['s1', 's2', 's3', 's4'] as const;

export function isIncidentSeverityValue(s: string): boolean {
  return (INCIDENT_SEVERITIES as readonly string[]).includes(s);
}

/** Actual system_events.kind values (migration 143 CHECK + qa_failure from 145). */
export const EVENT_KINDS = [
  'api_error',
  'job_error',
  'webhook_error',
  'payment_reconciliation',
  'auth_failure',
  'storage_error',
  'guard_rejection',
  'approval_block',
  'agent_tool_error',
  'qa_failure',
] as const;

export function isEventKindValue(s: string): boolean {
  return (EVENT_KINDS as readonly string[]).includes(s);
}

export interface IncidentListItem {
  id: string;
  tenant_id: string | null;
  status: string;
  severity: string;
  title: string;
  event_count: number;
  first_seen_at: string;
  last_seen_at: string;
  created_at: string;
  updated_at: string;
}

export interface IncidentDetail extends IncidentListItem {
  summary: string | null;
  dedupe_key: string;
  agent_run_id: string | null;
}

export interface IncidentEventView {
  id: string;
  kind: string;
  severity_hint: string;
  route: string | null;
  tool_name: string | null;
  status_code: number | null;
  error_code: string | null;
  /** Truncated + redacted — never raw emitter output. */
  message: string;
  dedupe_key: string;
  source: string;
  created_at: string;
}

export interface IncidentRunRef {
  id: string;
  task_id: string | null;
  approval_id: string | null;
}

export interface IncidentTaskRef {
  id: string;
  title: string;
  status: string;
}

export interface IncidentApprovalRef {
  id: string;
  action: string;
  status: string;
}

export interface IncidentReportRef {
  id: string;
  report_type: string;
  summary: string;
  created_at: string;
}

export interface IncidentDetailRaw {
  incident: IncidentDetail;
  events: IncidentEventView[];
  run: IncidentRunRef | null;
  task: IncidentTaskRef | null;
  approval: IncidentApprovalRef | null;
  reports: IncidentReportRef[];
}

const SENTINEL_MESSAGE_LEN = 300;

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce sentinel read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

function scopedTenant<T>(q: T, tenantId: string | null): T {
  if (tenantId === null) return q;
  return (q as unknown as { eq(col: string, val: unknown): T }).eq('tenant_id', tenantId);
}

function truncate(s: string | null, n: number): string | null {
  if (s === null || s === undefined) return null;
  return s.length > n ? `${s.slice(0, n)}…[truncated]` : s;
}

/**
 * Redact secret-looking material from emitter message text before render.
 * Same screen as Stage 8 QA errors: key=value pairs, Stripe-style secret
 * keys, bearer tokens, PEM blocks. A screen, not a proof — the hermetic
 * no-secrets test scans the serialized view model.
 */
export function redactSentinelMessage(s: string | null): string | null {
  if (s === null || s === undefined) return null;
  let out = s;
  out = out.replace(/-----BEGIN [A-Z ]*PRIVATE KEY-----[\s\S]*?-----END [A-Z ]*PRIVATE KEY-----/g, '[redacted-key-block]');
  out = out.replace(/sk_(live|test)_[A-Za-z0-9]+/g, '[redacted]');
  out = out.replace(
    /(api[_-]?key|secret|token|passwd|password|authorization|bearer|session|cookie)\s*[:=]\s*['"]?[^'"\s,}]+['"]?/gi,
    '$1=[redacted]'
  );
  return out;
}

/**
 * Columns ever read from incidents — metadata deliberately absent
 * (unbounded JSONB). Mirrors the Sentinel tool SAFE_COLUMNS plus the
 * display/hop columns the UI needs (summary, agent_run_id).
 */
const INCIDENT_LIST_COLS =
  'id,tenant_id,status,severity,title,event_count,first_seen_at,last_seen_at,created_at,updated_at';

const INCIDENT_DETAIL_COLS = `${INCIDENT_LIST_COLS},summary,dedupe_key,agent_run_id`;

/** Exactly the getRecentEvents SAFE_COLUMNS — metadata/actor/agent never read. */
const EVENT_COLS =
  'id,tenant_id,kind,severity_hint,route,tool_name,status_code,error_code,message,dedupe_key,source,created_at';

function toEventView(r: {
  id: string;
  kind: string;
  severity_hint: string;
  route: string | null;
  tool_name: string | null;
  status_code: number | null;
  error_code: string | null;
  message: string;
  dedupe_key: string;
  source: string;
  created_at: string;
}): IncidentEventView {
  return {
    id: r.id,
    kind: r.kind,
    severity_hint: r.severity_hint,
    route: r.route,
    tool_name: r.tool_name,
    status_code: r.status_code,
    error_code: r.error_code,
    message: redactSentinelMessage(truncate(r.message, SENTINEL_MESSAGE_LEN)) ?? '—',
    dedupe_key: r.dedupe_key,
    source: r.source,
    created_at: r.created_at,
  };
}

export async function fetchIncidentList(
  client: CommandCenterClient,
  tenantId: string | null = null,
  status: string | null = null,
  severity: string | null = null
): Promise<IncidentListItem[]> {
  let q = scopedTenant(client.from('incidents').select(INCIDENT_LIST_COLS), tenantId);
  if (status !== null) q = q.eq('status', status);
  if (severity !== null) q = q.eq('severity', severity);
  return selectAll<IncidentListItem>(q.order('last_seen_at', { ascending: false }).limit(50), 'incidents');
}

export interface IncidentFilterCounts {
  byStatus: Record<string, number>;
  bySeverity: Record<string, number>;
}

export async function fetchIncidentFilterCounts(
  client: CommandCenterClient,
  tenantId: string | null = null
): Promise<IncidentFilterCounts> {
  // Bounded window counts (recent 200) — honest "recent" grouping, not a
  // table-wide census (same convention as tasks/QA counts).
  const rows = await selectAll<{ status: string; severity: string }>(
    scopedTenant(client.from('incidents').select('status,severity'), tenantId)
      .order('last_seen_at', { ascending: false })
      .limit(200),
    'incident_counts'
  );
  const byStatus: Record<string, number> = {};
  const bySeverity: Record<string, number> = {};
  for (const r of rows) {
    byStatus[r.status] = (byStatus[r.status] ?? 0) + 1;
    bySeverity[r.severity] = (bySeverity[r.severity] ?? 0) + 1;
  }
  return { byStatus, bySeverity };
}

export async function fetchEventList(
  client: CommandCenterClient,
  tenantId: string | null = null,
  kind: string | null = null,
  limit = 50
): Promise<IncidentEventView[]> {
  let q = scopedTenant(client.from('system_events').select(EVENT_COLS), tenantId);
  if (kind !== null) q = q.eq('kind', kind);
  const rows = await selectAll<Parameters<typeof toEventView>[0]>(
    q.order('created_at', { ascending: false }).limit(limit),
    'system_events'
  );
  return rows.map(toEventView);
}

export async function fetchIncidentDetail(
  client: CommandCenterClient,
  incidentId: string,
  tenantId: string | null = null
): Promise<IncidentDetailRaw | null> {
  const incidents = await selectAll<IncidentDetail>(
    scopedTenant(
      client.from('incidents').select(INCIDENT_DETAIL_COLS).eq('id', incidentId).limit(1),
      tenantId
    ),
    'incident'
  );
  const incident = incidents[0] ?? null;
  if (!incident) return null;

  // Correlated timeline via the append-only join (scope inherits from parent).
  const joins = await selectAll<{ event_id: string }>(
    client.from('incident_events').select('event_id').eq('incident_id', incidentId).limit(100),
    'incident_events'
  );
  const eventIds = joins.map((j) => j.event_id);
  let events: IncidentEventView[] = [];
  if (eventIds.length > 0) {
    const rows = await selectAll<Parameters<typeof toEventView>[0]>(
      client.from('system_events').select(EVENT_COLS).in('id', eventIds).order('created_at', { ascending: true }).limit(100),
      'incident_timeline'
    );
    events = rows.map(toEventView);
  }

  // run → task hop (incidents carry agent_run_id only; same as reports.ts).
  let run: IncidentRunRef | null = null;
  let task: IncidentTaskRef | null = null;
  let approval: IncidentApprovalRef | null = null;
  let reports: IncidentReportRef[] = [];
  if (incident.agent_run_id) {
    const runs = await selectAll<IncidentRunRef>(
      scopedTenant(
        client.from('agent_runs').select('id,task_id,approval_id').eq('id', incident.agent_run_id).limit(1),
        tenantId
      ),
      'incident_run'
    );
    run = runs[0] ?? null;
    if (run?.task_id) {
      const tasks = await selectAll<IncidentTaskRef>(
        scopedTenant(
          client.from('agent_tasks').select('id,title,status').eq('id', run.task_id).limit(1),
          tenantId
        ),
        'incident_task'
      );
      task = tasks[0] ?? null;
    }
    if (run?.approval_id) {
      const approvals = await selectAll<IncidentApprovalRef>(
        client.from('approvals').select('id,action,status').eq('id', run.approval_id).limit(1),
        'incident_approval'
      );
      approval = approvals[0] ?? null;
    }
    // Investigation history: reports filed against the same run.
    reports = await selectAll<IncidentReportRef>(
      scopedTenant(
        client.from('agent_reports').select('id,report_type,summary,created_at').eq('run_id', incident.agent_run_id).order('created_at', { ascending: false }).limit(5),
        tenantId
      ),
      'incident_reports'
    );
  }

  return { incident, events, run, task, approval, reports };
}

export interface SentinelOverviewRaw {
  /** Open + investigating, newest first (bounded window for all overview math). */
  active: IncidentListItem[];
  recentEvents: IncidentEventView[];
  recentQaFailures: IncidentEventView[];
}

export async function fetchSentinelOverview(
  client: CommandCenterClient,
  tenantId: string | null = null
): Promise<SentinelOverviewRaw> {
  const [active, recentEvents, recentQaFailures] = await Promise.all([
    selectAll<IncidentListItem>(
      scopedTenant(client.from('incidents').select(INCIDENT_LIST_COLS), tenantId)
        .in('status', ['open', 'investigating'])
        .order('last_seen_at', { ascending: false })
        .limit(50),
      'overview_active'
    ),
    fetchEventList(client, tenantId, null, 8),
    fetchEventList(client, tenantId, 'qa_failure', 5),
  ]);
  return { active, recentEvents, recentQaFailures };
}

export interface SentinelOverviewViewModel {
  counts: { open: number; investigating: number; active: number; attention: number };
  severity: Record<string, number>;
  recent: IncidentListItem[];
  attention: IncidentListItem[];
  recentEvents: IncidentEventView[];
  recentQaFailures: IncidentEventView[];
  empty: { incidents: boolean; events: boolean; qa: boolean; attention: boolean };
}

/** Pure overview view-model: counts, severity histogram, attention slice. No I/O. */
export function buildSentinelOverviewViewModel(raw: SentinelOverviewRaw): SentinelOverviewViewModel {
  const open = raw.active.filter((i) => i.status === 'open');
  const investigating = raw.active.filter((i) => i.status === 'investigating');
  const attention = raw.active.filter((i) => i.status === 'open' && (i.severity === 's1' || i.severity === 's2'));
  const severity: Record<string, number> = {};
  for (const i of raw.active) severity[i.severity] = (severity[i.severity] ?? 0) + 1;
  return {
    counts: { open: open.length, investigating: investigating.length, active: raw.active.length, attention: attention.length },
    severity,
    recent: raw.active.slice(0, 10),
    attention: attention.slice(0, 10),
    recentEvents: raw.recentEvents,
    recentQaFailures: raw.recentQaFailures,
    empty: {
      incidents: raw.active.length === 0,
      events: raw.recentEvents.length === 0,
      qa: raw.recentQaFailures.length === 0,
      attention: attention.length === 0,
    },
  };
}

export interface IncidentDetailViewModel {
  incident: IncidentDetail;
  events: IncidentEventView[];
  run: IncidentRunRef | null;
  task: IncidentTaskRef | null;
  approval: IncidentApprovalRef | null;
  reports: IncidentReportRef[];
  counts: { events: number; byKind: Record<string, number>; qaFailureEvents: number };
  empty: { events: boolean; run: boolean; reports: boolean; summary: boolean };
}

/** Pure detail view-model: kind histogram + honest empty flags. No I/O. */
export function buildIncidentDetailViewModel(raw: IncidentDetailRaw): IncidentDetailViewModel {
  const byKind: Record<string, number> = {};
  for (const e of raw.events) byKind[e.kind] = (byKind[e.kind] ?? 0) + 1;
  return {
    incident: raw.incident,
    events: raw.events,
    run: raw.run,
    task: raw.task,
    approval: raw.approval,
    reports: raw.reports,
    counts: {
      events: raw.events.length,
      byKind,
      qaFailureEvents: byKind['qa_failure'] ?? 0,
    },
    empty: {
      events: raw.events.length === 0,
      run: raw.run === null,
      reports: raw.reports.length === 0,
      summary: raw.incident.summary === null,
    },
  };
}

/** UUID-shape guard for the [id] route: malformed ids 404 instead of 500. */
export function isIncidentIdShape(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
