/**
 * lib/workforce/reports.ts — Stage 5 (Reports list + detail).
 *
 * Same fetch + pure view-model shape as Stages 1–4. Reads PERSISTED
 * agent_reports rows directly (never reconstructed from runs/steps —
 * verified: the sole writer is createAgentReport() in lib/ai/agent-runs.ts,
 * called once per completed run from orchestrator.ts:683).
 *
 * Actual schema (db/migration_142_agent_runtime.sql — no status column, so
 * the list filters by report_type, not status):
 *   agent_reports(id, agent_id, run_id, tenant_id, report_type, summary,
 *   sections jsonb, created_at).
 * Linkage reality: report→run via run_id; report→task indirectly via
 * run.task_id (no task_id on reports); report→incident via
 * incidents.agent_run_id (no incident FK on reports). All three hops are
 * implemented; missing links render as honest empty states.
 *
 * Redaction audit (carried-over Stage 4 item — answered here): the sole
 * sections writer stores only prompt-excerpt (≤400ch user text), tool NAMES,
 * knowledge titles/categories, guard verdict, provider, duration — no raw
 * args, no payloads, no secrets (verified lib/ai/orchestrator.ts:683-694).
 * Defense in depth anyway: the view model renders a whitelist of known-safe
 * section keys fully and reduces every unknown key to a type descriptor,
 * so a future writer can never leak through this surface. The one genuine
 * write-time wart remains approvals.evidence (raw args slice) — flagged as
 * a Stage 4 follow-up (redact in createApprovalRequest), NOT touched here.
 */

import type { CommandCenterClient } from './command-center';

export const REPORT_TYPES = ['task', 'incident', 'daily', 'weekly', 'investigation'] as const;

export function isReportTypeValue(s: string): boolean {
  return (REPORT_TYPES as readonly string[]).includes(s);
}

export interface ReportListItem {
  id: string;
  agent_id: string;
  run_id: string | null;
  tenant_id: string | null;
  report_type: string;
  summary: string;
  created_at: string;
}

export interface ReportAgentRef {
  id: string;
  name: string;
  display_name: string;
}

export interface ReportSectionView {
  key: string;
  /** Fully rendered only for whitelisted safe keys; otherwise a type descriptor. */
  rendered: string;
  full: boolean;
}

export interface RelatedIncident {
  id: string;
  title: string;
  severity: string;
  status: string;
}

export interface ReportDetailRaw {
  report: ReportListItem & { sections: Record<string, unknown> };
  agent: ReportAgentRef | null;
  taskId: string | null;
  sections: ReportSectionView[];
  incident: RelatedIncident | null;
}

/** Section keys verified safe-by-construction (see header audit). */
const SAFE_SECTION_KEYS = new Set([
  'what_happened',
  'tool_calls',
  'knowledge_used',
  'guard_verdict',
  'provider',
  'duration_ms',
]);

function describeValue(v: unknown): string {
  if (v === null || v === undefined) return 'empty';
  if (Array.isArray(v)) return `${v.length} item(s)`;
  if (typeof v === 'object') return `${Object.keys(v as object).length} field(s)`;
  return `${typeof v}`;
}

function renderScalar(v: unknown): string {
  if (v === null || v === undefined) return '—';
  if (typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean') return String(v);
  if (Array.isArray(v)) {
    return v
      .slice(0, 12)
      .map((item) => {
        if (item !== null && typeof item === 'object') {
          const o = item as Record<string, unknown>;
          // Tool-call entries render as names only — never arg dumps.
          if (typeof o['tool'] === 'string' && Object.keys(o).length === 1) return String(o['tool']);
          return Object.keys(o).join(', ');
        }
        return String(item);
      })
      .join('; ');
  }
  return Object.keys(v as object).join(', ');
}

export function buildSectionViews(sections: Record<string, unknown> | null | undefined): ReportSectionView[] {
  if (!sections || typeof sections !== 'object' || Array.isArray(sections)) return [];
  return Object.entries(sections).map(([key, value]) => {
    if (SAFE_SECTION_KEYS.has(key)) {
      return { key, rendered: renderScalar(value).slice(0, 1000), full: true };
    }
    return { key, rendered: describeValue(value), full: false };
  });
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce reports read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

function scopedTenant<T>(q: T, tenantId: string | null): T {
  if (tenantId === null) return q;
  return (q as unknown as { eq(col: string, val: unknown): T }).eq('tenant_id', tenantId);
}

export async function fetchReportList(
  client: CommandCenterClient,
  tenantId: string | null = null,
  reportType: string | null = null
): Promise<ReportListItem[]> {
  let q = scopedTenant(
    client.from('agent_reports').select('id,agent_id,run_id,tenant_id,report_type,summary,created_at'),
    tenantId
  );
  if (reportType !== null) q = q.eq('report_type', reportType);
  return selectAll<ReportListItem>(q.order('created_at', { ascending: false }).limit(50), 'agent_reports');
}

export async function fetchReportDetail(
  client: CommandCenterClient,
  reportId: string,
  tenantId: string | null = null
): Promise<ReportDetailRaw | null> {
  const reports = await selectAll<ReportListItem & { sections: Record<string, unknown> }>(
    scopedTenant(
      client.from('agent_reports').select('id,agent_id,run_id,tenant_id,report_type,summary,sections,created_at').eq('id', reportId).limit(1),
      tenantId
    ),
    'agent_report'
  );
  const report = reports[0] ?? null;
  if (!report) return null;

  const agentRows = await selectAll<ReportAgentRef>(
    client.from('agents').select('id,name,display_name').eq('id', report.agent_id).limit(1),
    'agent'
  );

  // run → task hop (reports carry run_id only).
  let taskId: string | null = null;
  if (report.run_id) {
    const runs = await selectAll<{ task_id: string | null }>(
      client.from('agent_runs').select('task_id').eq('id', report.run_id).limit(1),
      'report_run'
    );
    taskId = runs[0]?.task_id ?? null;
  }

  // incident hop via incidents.agent_run_id (no FK from reports).
  let incident: RelatedIncident | null = null;
  if (report.run_id) {
    const incidents = await selectAll<RelatedIncident>(
      scopedTenant(
        client.from('incidents').select('id,title,severity,status').eq('agent_run_id', report.run_id).order('last_seen_at', { ascending: false }).limit(1),
        tenantId
      ),
      'report_incident'
    );
    incident = incidents[0] ?? null;
  }

  return { report, agent: agentRows[0] ?? null, taskId, sections: buildSectionViews(report.sections), incident };
}

export interface ReportDetailViewModel {
  report: ReportListItem;
  agent: ReportAgentRef | null;
  taskId: string | null;
  sections: ReportSectionView[];
  incident: RelatedIncident | null;
  empty: { sections: boolean; incident: boolean; task: boolean };
}

/** Pure detail view-model with honest empty flags. */
export function buildReportDetailViewModel(raw: ReportDetailRaw): ReportDetailViewModel {
  // Project the report row WITHOUT its raw sections object: untrusted
  // future keys must reach the page only through buildSectionViews above.
  const report: ReportListItem = {
    id: raw.report.id,
    agent_id: raw.report.agent_id,
    run_id: raw.report.run_id,
    tenant_id: raw.report.tenant_id,
    report_type: raw.report.report_type,
    summary: raw.report.summary,
    created_at: raw.report.created_at,
  };
  return {
    report,
    agent: raw.agent,
    taskId: raw.taskId,
    sections: raw.sections,
    incident: raw.incident,
    empty: {
      sections: raw.sections.length === 0,
      incident: raw.incident === null,
      task: raw.taskId === null,
    },
  };
}

/** UUID-shape guard for the [id] route: malformed ids 404 instead of 500. */
export function isReportIdShape(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
