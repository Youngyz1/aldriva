/**
 * lib/workforce/knowledge.ts — Stage 11.1 (Knowledge list + detail, read-only).
 *
 * Same fetch + pure view-model shape as Stages 1–10. Reads PERSISTED
 * knowledge_documents rows directly (the sole writer path is the migration
 * seeds in db/migration_141_knowledge_foundation.sql — no route, script, or
 * admin action writes knowledge; verified: no INSERT/UPDATE/DELETE on these
 * tables anywhere in lib/ or app/).
 *
 * Actual schema (db/migration_141_knowledge_foundation.sql):
 *   knowledge_documents(id, tenant_id NULL=platform, category [16 CHECK
 *   values], title, content, tags, status, version, source_type, source_hash,
 *   source_ref, approved_by/at, created_by/at, updated_at).
 *   knowledge_document_versions(document_id, version, title, content,
 *   created_by, created_at) — NO tenant_id, NO status: scope/status live on
 *   the parent document only, so versions are fetched ONLY after the parent
 *   was successfully read. knowledge_chunks(document_id, chunk_index,
 *   tenant_id, content 10–5000, tsv) — list/detail surfaces expose the chunk
 *   COUNT only, never chunk text (chunk viewer is 11.2 scope).
 *
 * READ-ONLY CONTRACT (statically asserted in tests): this module and its two
 * pages perform zero writes (no insert/update/delete/upsert/rpc-write), use
 * no service-role client (caller passes the signed-in admin's server
 * client), and never render HTML (content can be agent-generated or
 * admin-authored — pages render it as escaped text with whitespace-pre-wrap).
 *
 * Reported-only RLS gaps (NOT fixed here — no migration/RLS changes in 11.1):
 * knowledge_document_versions allows any authenticated SELECT (id-guessing
 * leaks deprecated content); knowledge_chunks has no status check (chunks of
 * deprecated documents remain directly readable). The UI below never reads
 * version content or chunk text, so it does not widen either gap.
 */

import type { CommandCenterClient } from './command-center';

/** The 17 category CHECK values (db/migration_141_knowledge_foundation.sql:14-17). */
export const KNOWLEDGE_CATEGORIES = [
  'company',
  'domain',
  'agent_role',
  'sop',
  'policy',
  'security',
  'architecture',
  'database',
  'api_tool',
  'codebase',
  'ui_route',
  'incident',
  'qa',
  'agent_memory',
  'operational',
  'brand',
  'moderation',
] as const;

export function isKnowledgeCategoryValue(s: string): boolean {
  return (KNOWLEDGE_CATEGORIES as readonly string[]).includes(s);
}

export const KNOWLEDGE_STATUSES = ['draft', 'proposed', 'approved', 'deprecated'] as const;

export function isKnowledgeStatusValue(s: string): boolean {
  return (KNOWLEDGE_STATUSES as readonly string[]).includes(s);
}

/** Display scope filter. Unknown values fall back to 'platform', never 500. */
export const KNOWLEDGE_SCOPES = ['platform', 'tenant', 'all'] as const;

export function isKnowledgeScopeValue(s: string): s is (typeof KNOWLEDGE_SCOPES)[number] {
  return (KNOWLEDGE_SCOPES as readonly string[]).includes(s);
}

export interface DocumentListItem {
  id: string;
  tenant_id: string | null;
  category: string;
  title: string;
  status: string;
  version: number;
  source_type: string;
  updated_at: string;
}

export interface DocumentDetail extends DocumentListItem {
  content: string;
  source_ref: string | null;
  source_hash: string | null;
  approved_by: string | null;
  approved_at: string | null;
  created_by: string | null;
  created_at: string;
}

export interface DocumentVersionMeta {
  version: number;
  title: string;
  created_at: string;
  created_by: string | null;
}

export interface DocumentDetailRaw {
  document: DocumentDetail;
  versions: DocumentVersionMeta[];
  chunkCount: number;
}

export interface TenantNameRef {
  id: string;
  name: string;
}

async function selectAll<T>(qPromise: PromiseLike<unknown>, what: string): Promise<T[]> {
  const { data, error } = (await qPromise) as unknown as { data: T[] | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce knowledge read failed (${what}): ${error.message}`);
  return (data ?? []) as T[];
}

/** List column allowlist — content is NEVER selected here (detail-only). */
const LIST_COLUMNS =
  'id,tenant_id,category,title,status,version,source_type,updated_at';

export async function fetchDocumentList(
  client: CommandCenterClient,
  scopeFilter: string | null = null,
  categoryFilter: string | null = null
): Promise<DocumentListItem[]> {
  const scope = scopeFilter !== null && isKnowledgeScopeValue(scopeFilter) ? scopeFilter : 'platform';
  let q = client.from('knowledge_documents').select(LIST_COLUMNS);
  if (scope === 'platform') q = q.is('tenant_id', null);
  else if (scope === 'tenant') q = q.not('tenant_id', 'is', null);
  if (categoryFilter !== null && isKnowledgeCategoryValue(categoryFilter)) {
    q = q.eq('category', categoryFilter);
  }
  return selectAll<DocumentListItem>(q.order('updated_at', { ascending: false }).limit(50), 'knowledge_documents');
}

export async function fetchDocumentDetail(
  client: CommandCenterClient,
  documentId: string
): Promise<DocumentDetailRaw | null> {
  if (!isDocumentIdShape(documentId)) return null;
  const rows = await selectAll<DocumentDetail>(
    client
      .from('knowledge_documents')
      .select(
        'id,tenant_id,category,title,status,version,source_type,content,source_ref,source_hash,approved_by,approved_at,created_by,created_at,updated_at'
      )
      .eq('id', documentId)
      .limit(1),
    'knowledge_document'
  );
  const document = rows[0] ?? null;
  if (!document) return null;
  // Versions carry no scope/status gate of their own — metadata only, and
  // only reachable after the parent document read succeeded above.
  const versions = await fetchDocumentVersions(client, document.id);
  const chunkCount = await fetchDocumentChunkCount(client, document.id);
  return { document, versions, chunkCount };
}

/** Version METADATA only (version, title, created_at, created_by) — never content. */
export async function fetchDocumentVersions(
  client: CommandCenterClient,
  documentId: string
): Promise<DocumentVersionMeta[]> {
  if (!isDocumentIdShape(documentId)) return [];
  return selectAll<DocumentVersionMeta>(
    client
      .from('knowledge_document_versions')
      .select('version,title,created_at,created_by')
      .eq('document_id', documentId)
      .order('version', { ascending: false }),
    'knowledge_document_versions'
  );
}

/** Chunk COUNT only — chunk text is 11.2 scope and never selected here. */
export async function fetchDocumentChunkCount(
  client: CommandCenterClient,
  documentId: string
): Promise<number> {
  if (!isDocumentIdShape(documentId)) return 0;
  const { count, error } = (await client
    .from('knowledge_chunks')
    .select('id', { count: 'exact', head: true })
    .eq('document_id', documentId)) as unknown as { count: number | null; error: { message: string } | null };
  if (error) throw new Error(`Workforce knowledge read failed (knowledge_chunks count): ${error.message}`);
  return count ?? 0;
}

/** Tenant display names for scope badges (organizers are publicly readable). */
export async function fetchTenantNames(
  client: CommandCenterClient,
  tenantIds: string[]
): Promise<TenantNameRef[]> {
  const ids = [...new Set(tenantIds.filter((t) => typeof t === 'string' && t.length > 0))];
  if (ids.length === 0) return [];
  return selectAll<TenantNameRef>(
    client.from('organizers').select('id,name').in('id', ids.slice(0, 100)),
    'organizer_names'
  );
}

/** Scope label: Platform for NULL tenant, otherwise Tenant <name or short id>. */
export function scopeLabel(tenantId: string | null, tenantName?: string | null): string {
  if (tenantId === null) return 'Platform';
  if (tenantName) return `Tenant ${tenantName}`;
  return `Tenant ${shortId(tenantId)}`;
}

/** Status badge view-model (label + tone key; pages map tone to classes). */
export function statusBadge(status: string): { label: string; tone: 'ok' | 'warn' | 'muted' | 'bad' } {
  if (status === 'approved') return { label: 'approved', tone: 'ok' };
  if (status === 'deprecated') return { label: 'deprecated', tone: 'bad' };
  if (status === 'proposed' || status === 'draft') return { label: status, tone: 'warn' };
  return { label: status || 'unknown', tone: 'muted' };
}

export const CONTENT_PREVIEW_CAP = 1500;

/** Capped content preview with an explicit truncation flag. */
export function buildContentPreview(content: string): { text: string; truncated: boolean } {
  const body = typeof content === 'string' ? content : '';
  if (body.length <= CONTENT_PREVIEW_CAP) return { text: body, truncated: false };
  return { text: body.slice(0, CONTENT_PREVIEW_CAP), truncated: true };
}

export function shortId(id: string | null): string {
  if (!id) return '—';
  return id.length > 8 ? `${id.slice(0, 8)}…` : id;
}

/** UUID-shape guard for the [id] route: malformed ids 404 instead of 500. */
export function isDocumentIdShape(id: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
}
