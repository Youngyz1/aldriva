/**
 * lib/observability/system-events.ts
 * Phase 143b — insertSystemEvent() + dedupe + deterministic severity (S1-S4 per investigation §2)
 * Best-effort, service_role, never throws into caller.
 */
import { createSupabaseAdmin } from '@/lib/supabase-admin';

export type SystemEventKind =
  | 'api_error'
  | 'job_error'
  | 'webhook_error'
  | 'payment_reconciliation'
  | 'auth_failure'
  | 'storage_error'
  | 'guard_rejection'
  | 'approval_block'
  | 'agent_tool_error'
  | 'qa_failure';

export interface InsertEventInput {
  kind: SystemEventKind;
  severity_hint: 'info' | 'warn' | 'error' | 'critical';
  tenant_id?: string | null;
  actor_id?: string | null;
  agent_id?: string | null;
  route?: string | null;
  tool_name?: string | null;
  status_code?: number | null;
  error_code?: string | null;
  message: string;
  metadata?: Record<string, unknown>;
  source?: string; // Amendment 2 — defaults to 'aldriva', always set explicitly at call sites
}

function dedupeKey(input: InsertEventInput): string {
  const tenantPart = input.tenant_id ? input.tenant_id : 'platform';
  return `${input.kind}:${input.route ?? ''}:${input.tool_name ?? ''}:${input.error_code ?? ''}:${tenantPart}`.slice(0, 400);
}

function deriveSeverity(params: { kind: SystemEventKind; errorCode?: string | null; burstCount: number }): 's1' | 's2' | 's3' | 's4' {
  const { kind, errorCode, burstCount } = params;
  if (kind === 'payment_reconciliation') return 's1';
  if (kind === 'api_error' || kind === 'agent_tool_error') {
    if (burstCount >= 20) return 's1';
    if (burstCount >= 5) return 's2';
    if (burstCount >= 2) return 's3';
    return 's4';
  }
  if (kind === 'guard_rejection') {
    const isPii = errorCode === 'pii_email' || errorCode === 'pii_phone' || errorCode === 'pii_uuid';
    if (isPii) return 's3';
    if (burstCount >= 5) return 's3';
    return 's4';
  }
  if (kind === 'approval_block') {
    if (burstCount >= 5) return 's3';
    return 's4';
  }
  if (kind === 'job_error') {
    // Stripe checkout.session.completed webhook 500 is critical
    if (errorCode === 'checkout.session.completed' || errorCode === 'stripe') return 's1';
    return 's2';
  }
  if (kind === 'webhook_error') return 's1';
  if (kind === 'qa_failure') {
    // Stage 7: the ingest route precomputes escalation. error_code carries
    // `qa_escalated:<suite>` (3rd+ consecutive failing day → s2) or
    // `qa_first:<suite>` (s3). Staging failures never reach s1 by design.
    if (errorCode && errorCode.startsWith('qa_escalated')) return 's2';
    return 's3';
  }
  return 's4';
}

export function buildIncidentTitle(input: InsertEventInput): string {
  const parts = [input.kind, input.route ?? '', input.error_code ?? ''].filter(Boolean).join(' — ');
  return parts.slice(0, 300) || `${input.kind} incident`;
}

/** Best-effort insert + dedupe into incidents. Never throws. */
export async function insertSystemEvent(input: InsertEventInput): Promise<string | null> {
  const dedupe = dedupeKey(input);
  const source = input.source ?? 'aldriva';
  const truncatedMsg = input.message.slice(0, 2000);
  try {
    const admin = createSupabaseAdmin();
    const { data: event, error: eventErr } = await admin
      .from('system_events')
      .insert({
        kind: input.kind,
        severity_hint: input.severity_hint,
        tenant_id: input.tenant_id ?? null,
        actor_id: input.actor_id ?? null,
        agent_id: input.agent_id ?? null,
        route: input.route ?? null,
        tool_name: input.tool_name ?? null,
        status_code: input.status_code ?? null,
        error_code: input.error_code ?? null,
        message: truncatedMsg,
        metadata: input.metadata ?? {},
        dedupe_key: dedupe,
        source,
      })
      .select('id, created_at')
      .single();
    if (eventErr || !event) {
      console.error('[system-events] insert failed:', eventErr?.message);
      return null;
    }
    const eventId = (event as { id: string }).id;
    // Fire-and-forget incident correlation — best-effort, never blocks caller
    void findOrCreateIncidentForEvent({
      dedupe_key: dedupe,
      tenant_id: input.tenant_id ?? null,
      kind: input.kind,
      route: input.route ?? null,
      error_code: input.error_code ?? null,
      message: truncatedMsg,
      eventId,
      createdAt: (event as { created_at: string }).created_at,
    }).catch((e) => console.error('[system-events] incident correlation failed:', e instanceof Error ? e.message : String(e)));
    return eventId;
  } catch (err) {
    console.error('[system-events] insert threw:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

async function findOrCreateIncidentForEvent(params: {
  dedupe_key: string;
  tenant_id: string | null;
  kind: SystemEventKind;
  route: string | null;
  error_code: string | null;
  message: string;
  eventId: string;
  createdAt: string;
}): Promise<void> {
  const admin = createSupabaseAdmin();
  const windowStart = new Date(Date.now() - 60 * 60 * 1000).toISOString();
  // Find open/incident within 60-min window
  const { data: existing } = await admin
    .from('incidents')
    .select('id, event_count, severity, last_seen_at')
    .eq('dedupe_key', params.dedupe_key)
    .in('status', ['open', 'investigating'])
    .gte('last_seen_at', windowStart)
    .order('last_seen_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (existing) {
    const row = existing as { id: string; event_count: number };
    await admin
      .from('incidents')
      .update({ event_count: row.event_count + 1, last_seen_at: new Date().toISOString() })
      .eq('id', row.id);
    await admin.from('incident_events').insert({ incident_id: row.id, event_id: params.eventId });
    return;
  }

  // No open within window — create new incident. Burst count = events 60-min for this dedupe_key (including just-inserted)
  const { count } = await admin.from('system_events').select('id', { count: 'exact', head: true }).eq('dedupe_key', params.dedupe_key).gte('created_at', windowStart);
  const burst = count ?? 1;
  const severity = deriveSeverity({ kind: params.kind, errorCode: params.error_code, burstCount: burst });
  const title = buildIncidentTitle({ kind: params.kind, route: params.route, error_code: params.error_code, severity_hint: 'error', message: params.message });

  const { data: incident, error: incErr } = await admin
    .from('incidents')
    .insert({
      status: 'open',
      severity,
      title,
      tenant_id: params.tenant_id,
      dedupe_key: params.dedupe_key,
      event_count: 1,
      first_seen_at: params.createdAt,
      last_seen_at: params.createdAt,
      metadata: { route: params.route, error_code: params.error_code, representativeMessage: params.message.slice(0, 500) },
    })
    .select('id')
    .single();
  if (incErr || !incident) {
    console.error('[system-events] incident insert failed:', incErr?.message);
    return;
  }
  await admin.from('incident_events').insert({ incident_id: (incident as { id: string }).id, event_id: params.eventId });
}

export async function closeStaleIncidentsolderThanHours(hours = 24): Promise<number> {
  try {
    const admin = createSupabaseAdmin();
    const cutoff = new Date(Date.now() - hours * 60 * 60 * 1000).toISOString();
    const { data, error } = await admin.from('incidents').update({ status: 'expired' }).in('status', ['open', 'investigating']).lt('last_seen_at', cutoff).select('id');
    if (error) {
      console.error('[system-events] closeStale failed:', error.message);
      return 0;
    }
    return (data as unknown[])?.length ?? 0;
  } catch (err) {
    console.error('[system-events] closeStale threw:', err instanceof Error ? err.message : String(err));
    return 0;
  }
}

// Re-export for hermetic tests
export const _deriveSeverity = deriveSeverity;
export const _dedupeKey = dedupeKey;
