/**
 * lib/ai/agent-registry.ts
 * Phase 140 — Agent Registry access layer.
 * Reads from agents / agent_tools / tool_definitions (migration 139-140).
 * Falls back to static registry when DB is unavailable (test/hermetic mode).
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIToolDefinition } from './types';
import { ALL_AI_TOOL_DEFINITIONS } from './tools-registry';

export interface AgentRow {
  id: string;
  name: string;
  display_name: string;
  department: string;
  description: string;
  system_prompt: string;
  model_selection: string;
  autonomy_level: string;
  tenant_id: string | null;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const FALLBACK_AGENTS: AgentRow[] = [
  {
    id: '00000000-0000-0000-0000-000000000001',
    name: 'dylan',
    display_name: 'Dylan — Executive Coordinator',
    department: 'executive',
    description: 'Executive coordinator and orchestrator for the AI workforce. L0 read-only.',
    system_prompt:
      'You are Dylan, the Executive Coordinator for the Aldriva AI workforce. You are a read-only executive agent. Your responsibilities: coordinate tasks, summarize status, and provide grounded answers from knowledge and authorized tools. You must never perform writes, deployments, or financial actions. You must call only tools explicitly allowed for your identity. If a task requires a write or high-risk action, respond that it requires human approval and stop. Exception: approval-gated tools in your allowlist may be called. Calling one does not perform the write; the platform intercepts the call and routes it to human approval. Never try to bypass or pre-empt the approval step.',
    model_selection: 'aldriva',
    autonomy_level: 'L0',
    tenant_id: null,
    status: 'active',
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000002',
    name: 'sentinel',
    display_name: 'Sentinel — Reliability Intelligence',
    department: 'reliability',
    description: 'Reliability and engineering intelligence. L0 read-only.',
    system_prompt:
      'You are Sentinel, the Reliability Intelligence agent for Aldriva. You are read-only. Your responsibilities: observe available health signals, correlate evidence from authorized tools and knowledge, classify severity, and report findings with evidence. You must never modify code, deploy, or access production secrets.',
    model_selection: 'aldriva',
    autonomy_level: 'L0',
    tenant_id: null,
    status: 'active',
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
  {
    id: '00000000-0000-0000-0000-000000000003',
    name: 'qa',
    display_name: 'QA Engineer',
    department: 'quality',
    description: 'Quality assurance. Prepares and reports test observations. L0 read-only.',
    system_prompt:
      'You are the QA Engineer for Aldriva. You are read-only. Your responsibilities: describe test plans, analyze available test evidence from authorized tools and knowledge, and report quality findings. You must never trigger writes, deploys, or production mutations.',
    model_selection: 'aldriva',
    autonomy_level: 'L0',
    tenant_id: null,
    status: 'active',
    version: 1,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  },
];

// Fallback allowlist mirrors migration_140 seeding — L0 read-only, no transactional writes
const FALLBACK_ALLOWED: Record<string, string[]> = {
  dylan: [
    'get_upcoming_events','get_active_fundraisers','get_featured_businesses','get_recent_articles','get_available_products',
    'fetch_url_summary','fetch_rss_feed','search_trends',
    'get_content_history',
    'searchEvents','getEvent','getTicketAvailability','getTicketOrderStatus',
    'searchFundraisers','getFundraiser','getDonationStatus',
    'searchProducts','getProduct','getProductAvailability','getProductOrderStatus',
    'getPaymentStatus',
  ],
  sentinel: [
    'get_upcoming_events','get_active_fundraisers','get_featured_businesses','get_recent_articles','get_available_products',
    'fetch_url_summary','fetch_rss_feed','search_trends',
    'searchEvents','getEvent','getTicketAvailability','getTicketOrderStatus',
    'searchFundraisers','getFundraiser','getDonationStatus',
    'searchProducts','getProduct','getProductAvailability','getProductOrderStatus',
    'getPaymentStatus',
  ],
  qa: [
    'get_upcoming_events','get_active_fundraisers','get_featured_businesses','get_recent_articles','get_available_products',
    'fetch_url_summary','fetch_rss_feed','search_trends',
    'searchEvents','getEvent','getTicketAvailability','getTicketOrderStatus',
    'searchFundraisers','getFundraiser','getDonationStatus',
    'searchProducts','getProduct','getProductAvailability','getProductOrderStatus',
    'getPaymentStatus',
  ],
};

export async function getAgentByName(name: string): Promise<AgentRow | null> {
  const key = (name || '').toLowerCase().trim();
  if (!key) return null;
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.from('agents').select('*').eq('name', key).eq('status', 'active').maybeSingle();
    if (!error && data) return data as AgentRow;
  } catch {
    // fall through
  }
  const fb = FALLBACK_AGENTS.find((a) => a.name === key);
  return fb ?? null;
}

export async function listAgents(): Promise<AgentRow[]> {
  try {
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.from('agents').select('*').eq('status', 'active').order('name');
    if (!error && data && data.length > 0) return data as AgentRow[];
  } catch {
    // fall through
  }
  return FALLBACK_AGENTS;
}

export async function getAllowedToolNames(agentName: string): Promise<string[]> {
  const key = (agentName || '').toLowerCase().trim();
  try {
    const agent = await getAgentByName(key);
    if (!agent || agent.id.startsWith('00000000-0000-')) throw new Error('fallback');
    const admin = createSupabaseAdmin();
    const { data, error } = await admin.from('agent_tools').select('tool_name').eq('agent_id', agent.id).eq('allowed', true);
    if (!error && data) {
      const names = (data as Array<{ tool_name: string }>).map((r) => r.tool_name);
      if (names.length > 0) return names;
    }
  } catch {
    // fallback
  }
  return FALLBACK_ALLOWED[key] ?? [];
}

export async function getAllowedToolDefinitions(agentName: string): Promise<AIToolDefinition[]> {
  const allowed = new Set(await getAllowedToolNames(agentName));
  return ALL_AI_TOOL_DEFINITIONS.filter((d) => allowed.has(d.name));
}

/** True if agent exists and is L0 (read-only) — used by orchestrator to enforce autonomy gate */
export async function isAgentReadOnly(agentName: string): Promise<boolean> {
  const agent = await getAgentByName(agentName);
  if (!agent) return true;
  return agent.autonomy_level === 'L0';
}

// Re-export for tests
export const _fallbackAgents = FALLBACK_AGENTS;
export const _fallbackAllowed = FALLBACK_ALLOWED;
