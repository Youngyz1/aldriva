/**
 * lib/ai/agent-runs.ts
 * Phase 142 — Persistence for agent_tasks, agent_runs, agent_steps, agent_reports.
 * All writes via service_role; best-effort (must never become DoS vector).
 * Uses redactArgs() pattern from tool-context for args_redacted.
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { redactArgs } from './tools/tenant/tool-context';

export interface CreateRunParams {
  agentId: string;
  tenantId: string | null;
  taskId?: string | null;
  triggeredBy: string;
  modelUsed?: string | null;
  providerUsed?: string | null;
}

export async function createAgentRun(params: CreateRunParams): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from('agent_runs')
      .insert({
        agent_id: params.agentId,
        tenant_id: params.tenantId,
        task_id: params.taskId ?? null,
        triggered_by: params.triggeredBy,
        model_used: params.modelUsed ?? null,
        provider_used: params.providerUsed ?? null,
        status: 'running',
        guard_result: 'pass',
      })
      .select('id')
      .single();
    if (error) {
      console.error('[agent-runs] createAgentRun failed:', error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.error('[agent-runs] createAgentRun threw:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function completeAgentRun(
  runId: string,
  patch: { status?: string; guard_result?: string; duration_ms?: number; error?: string | null; approval_id?: string | null; completed_at?: string }
): Promise<void> {
  if (!runId) return;
  try {
    const admin = createSupabaseAdmin();
    const update: Record<string, unknown> = {};
    if (patch.status) update.status = patch.status;
    if (patch.guard_result) update.guard_result = patch.guard_result;
    if (patch.duration_ms !== undefined) update.duration_ms = patch.duration_ms;
    if (patch.error !== undefined) update.error = patch.error;
    if (patch.approval_id !== undefined) update.approval_id = patch.approval_id;
    update.completed_at = patch.completed_at ?? new Date().toISOString();
    const { error } = await admin.from('agent_runs').update(update).eq('id', runId);
    if (error) console.error('[agent-runs] completeAgentRun failed:', error.message);
  } catch (err) {
    console.error('[agent-runs] completeAgentRun threw:', err instanceof Error ? err.message : String(err));
  }
}

export async function createAgentTask(params: {
  agentId: string;
  tenantId: string | null;
  requestedBy: string | null;
  title: string;
  payload?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from('agent_tasks')
      .insert({
        agent_id: params.agentId,
        tenant_id: params.tenantId,
        requested_by: params.requestedBy,
        title: params.title.slice(0, 200),
        payload: params.payload ?? {},
        status: 'completed',
        priority: 'normal',
      })
      .select('id')
      .single();
    if (error) {
      console.error('[agent-runs] createAgentTask failed:', error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.error('[agent-runs] createAgentTask threw:', err instanceof Error ? err.message : String(err));
    return null;
  }
}

export async function addAgentStep(params: {
  runId: string;
  seq: number;
  kind: string;
  toolName?: string | null;
  args?: unknown;
  content?: string | null;
  resultSummary?: string | null;
  guardVerdict?: string | null;
}): Promise<void> {
  if (!params.runId) return;
  try {
    const admin = createSupabaseAdmin();
    const redacted = params.args !== undefined ? redactArgs(params.args) : null;
    const { error } = await admin.from('agent_steps').insert({
      run_id: params.runId,
      seq: params.seq,
      kind: params.kind,
      tool_name: params.toolName ?? null,
      args_redacted: redacted,
      content: params.content ? String(params.content).slice(0, 4000) : null,
      result_summary: params.resultSummary ? String(params.resultSummary).slice(0, 2000) : null,
      guard_verdict: params.guardVerdict ?? null,
    });
    if (error) console.error('[agent-runs] addAgentStep failed:', error.message);
  } catch (err) {
    console.error('[agent-runs] addAgentStep threw:', err instanceof Error ? err.message : String(err));
  }
}

export async function createAgentReport(params: {
  agentId: string;
  runId: string | null;
  tenantId: string | null;
  summary: string;
  sections?: Record<string, unknown>;
}): Promise<string | null> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin
      .from('agent_reports')
      .insert({
        agent_id: params.agentId,
        run_id: params.runId,
        tenant_id: params.tenantId,
        report_type: 'task',
        summary: params.summary.slice(0, 5000),
        sections: params.sections ?? {},
      })
      .select('id')
      .single();
    if (error) {
      console.error('[agent-runs] createAgentReport failed:', error.message);
      return null;
    }
    return (data as { id: string }).id;
  } catch (err) {
    console.error('[agent-runs] createAgentReport threw:', err instanceof Error ? err.message : String(err));
    return null;
  }
}
