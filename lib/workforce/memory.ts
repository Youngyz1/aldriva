/**
 * lib/workforce/memory.ts — Stage 12 (Memory list + detail, admin UI reads).
 *
 * Same fetch + pure view-model shape as Stages 1–11. Reads PERSISTED
 * agent_memory / agent_memory_versions rows directly. This module performs
 * ZERO writes (statically asserted in tests); the applier
 * (lib/workforce/memory-apply.ts) and the human direct-create action are
 * the only writers, both service-role.
 *
 * READ-ONLY CONTRACT: no insert/update/delete/upsert, no service-role
 * import, explicit column selects, escaped-text rendering in pages.
 */

import type { CommandCenterClient } from './command-center';

export const MEMORY_STATUSES = ['active', 'revoked', 'expired'] as const;

export function isMemoryStatusValue(s: string): boolean {
  return (MEMORY_STATUSES as readonly string[]).includes(s);
}

export const MEMORY_SOURCES = ['human', 'system', 'agent-proposed'] as const;

export interface MemoryListItem {
  id: string;
  tenant_id: string | null;
  agent_id: string | null;
  fact_key: string;
  version: number;
  status: string;
  source: string;
  expires_at: string | null;
  updated_at: string;
}

export interface MemoryDetail extends MemoryListItem {
  fact_value: string;
  proposed_by_agent_id: string | null;
  proposed_run_id: string | null;
  proposed_task_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  approval_id: string | null;
  effective_at: string;
  created_at: string;
}

export interface MemoryVersionRow {
  version: number;
  fact_value: string;
  status: string;
  expires_at: string | null;
  approval_id: string | null;
  proposed_by_agent_id: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_at: string;
}

export interface MemoryAgentRef {
  id: string;
  name: string;
  display_name: string;
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce memory read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

const LIST_COLUMNS = 'id,tenant_id,agent_id,fact_key,version,status,source,expires_at,updated_at';

export async function fetchMemoryList(
  client: CommandCenterClient,
  statusFilter: string | null = null
): Promise<MemoryListItem[]> {
  let q = client.from('agent_memory').select(LIST_COLUMNS);
  if (statusFilter !== null && isMemoryStatusValue(statusFilter)) {
    q = q.eq('status', statusFilter);
  }
  return selectAll<MemoryListItem>(q.order('updated_at', { ascending: false }).limit(50), 'agent_memory');
}

export async function fetchMemoryDetail(
  client: CommandCenterClient,
  factId: string
): Promise<{ fact: MemoryDetail; versions: MemoryVersionRow[] } | null> {
  if (!isMemoryIdShape(factId)) return null;
  const rows = await selectAll<MemoryDetail>(
    client
      .from('agent_memory')
      .select(
        'id,tenant_id,agent_id,fact_key,fact_value,version,status,source,proposed_by_agent_id,proposed_run_id,proposed_task_id,approved_by,approved_at,approval_id,effective_at,expires_at,created_at,updated_at'
      )
      .eq('id', factId)
      .limit(1),
    'agent_memory'
  );
  const fact = rows[0] ?? null;
  if (!fact) return null;
  const versions = await selectAll<MemoryVersionRow>(
    client
      .from('agent_memory_versions')
      .select('version,fact_value,status,expires_at,approval_id,proposed_by_agent_id,approved_by,approved_at,created_at')
      .eq('fact_id', fact.id)
      .order('version', { ascending: false }),
    'agent_memory_versions'
  );
  return { fact, versions };
}

export async function fetchMemoryAgents(client: CommandCenterClient): Promise<MemoryAgentRef[]> {
  return selectAll<MemoryAgentRef>(
    client.from('agents').select('id,name,display_name').limit(100),
    'agents'
  );
}

export async function fetchTenantNames(
  client: CommandCenterClient,
  tenantIds: string[]
): Promise<Array<{ id: string; name: string }>> {
  const ids = [...new Set(tenantIds.filter((t) => typeof t === 'string' && t.length > 0))];
  if (ids.length === 0) return [];
  return selectAll<{ id: string; name: string }>(
    client.from('organizers').select('id,name').in('id', ids.slice(0, 100)),
    'organizer_names'
  );
}

/** Scope label: Platform / Tenant <name|short> × shared / agent name. */
export function memoryScopeLabel(
  tenantId: string | null,
  agentId: string | null,
  tenantName?: string | null,
  agentName?: string | null
): string {
  const tenant = tenantId === null ? 'Platform' : `Tenant ${tenantName ?? shortId(tenantId)}`;
  const agent = agentId === null ? 'shared' : (agentName ?? shortId(agentId));
  return `${tenant} · ${agent}`;
}

/** Status badge view-model (label + tone key; pages map tone to classes). */
export function memoryStatusBadge(status: string, expiresAt: string | null): { label: string; tone: 'ok' | 'warn' | 'muted' | 'bad' } {
  if (status === 'active') {
    if (expiresAt !== null) return { label: 'active · expiring', tone: 'warn' };
    return { label: 'active', tone: 'ok' };
  }
  if (status === 'revoked') return { label: 'revoked', tone: 'bad' };
  if (status === 'expired') return { label: 'expired', tone: 'muted' };
  return { label: status || 'unknown', tone: 'muted' };
}

export const MEMORY_VALUE_PREVIEW_CAP = 1500;

export function buildMemoryPreview(value: string): { text: string; truncated: boolean } {
  const body = typeof value === 'string' ? value : '';
  if (body.length <= MEMORY_VALUE_PREVIEW_CAP) return { text: body, truncated: false };
  return { text: body.slice(0, MEMORY_VALUE_PREVIEW_CAP), truncated: true };
}

export function shortId(id: string | null): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/** Apply-state label derived from the approval audit_ref stamp. */
export function memoryApplyState(auditRef: string | null): string {
  if (!auditRef) return "approved — awaiting applier";
  if (auditRef.startsWith("memory:applied:")) return `applied (${auditRef})`;
  if (auditRef === "memory-version-conflict") return "version conflict — not applied";
  if (auditRef === "memory-invalid-proposal" || auditRef === "memory-invalid-scope") {
    return `invalid proposal — not applied (${auditRef})`;
  }
  return auditRef;
}

/** UUID-shape guard for the [id] route: malformed ids 404 instead of 500. */
export function isMemoryIdShape(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
