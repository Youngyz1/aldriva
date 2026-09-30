/**
 * lib/ai/orchestrator.ts
 * Phase 142 — Smallest safe execution path (synchronous, L0 read-only).
 * Reuses: provider-factory, tools-registry, tenant-context, output/input/ssrf guards, rate-limit.
 */

import { getAgentByName, getAllowedToolDefinitions } from './agent-registry';
import { retrieveKnowledge, formatKnowledgeForPrompt } from './knowledge';
import { resolveMemory, formatMemoryForPrompt, buildMemoryAuditLine } from './memory';
import { validateMemoryProposal } from './tools/workforce/memory-propose';
import { getTenantAIProvider } from './tenant-provider';
import { getAIProvider } from './provider-factory';
import { guardBeforeDisplay } from './output-guard';
import { executeAITool, executeTenantTool } from './tools-registry';
import { PLATFORM_TENANT_PLACEHOLDER } from './tools/tenant/tool-context';
import { resolveTenantContext } from '@/lib/tenant-context';
import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { checkApprovalRequired, createApprovalRequest } from './approvals';
import { mintExecutionEnvelope } from '../exec/envelope';
import {
  createAgentTask,
  createAgentRun,
  completeAgentRun,
  addAgentStep,
  createAgentReport,
} from './agent-runs';
import { AIMessage, AIToolDefinition } from './types';

export interface OrchestratorRequest {
  agent: string; // dylan | sentinel | qa
  prompt: string;
  tenantId?: string | null;
  userId?: string | null;
  history?: AIMessage[];
}

export interface OrchestratorResult {
  success: boolean;
  agent: string;
  text: string;
  guardedText: string;
  guardVerdict: 'pass' | 'flagged' | 'rejected';
  toolCalls: Array<{ tool: string; args: string; result: unknown }>;
  knowledgeUsed: number;
  provider: string;
  runId: string | null;
  taskId: string | null;
  approvalRequired?: boolean;
  approvalId?: string | null;
  error?: string;
}

const MAX_TOOL_ITERATIONS = 1; // L0: one tool-call round only (no autonomous looping yet)
// Sentinel's natural pattern (incidents THEN events) fits in one parallel round;
// raising to 2 would double burst-cost per sweep (Phase 143 §4 concern) for
// marginal gain now that synthesis is hardened — decision: keep at 1.

/** Load tool risk/approval from DB tool_definitions, fallback to scope-derived risk */
async function getToolGate(
  toolName: string
): Promise<{ risk: string; approvalRequired: boolean; scope: string }> {
  try {
    const admin = createSupabaseAdmin();
    const { data } = await admin.from('tool_definitions').select('risk, approval_required, scope').eq('name', toolName).maybeSingle();
    if (data) {
      const row = data as { risk: string; approval_required: boolean; scope: string };
      return { risk: row.risk, approvalRequired: Boolean(row.approval_required), scope: row.scope };
    }
  } catch {
    // fallback
  }
  // Fallback: transactional => medium approval_required false; public/tenant => low
  return { risk: 'low', approvalRequired: false, scope: 'public_read' };
}

export async function orchestrate(req: OrchestratorRequest): Promise<OrchestratorResult> {
  const startedAt = Date.now();
  const agentName = (req.agent || 'dylan').toLowerCase().trim();
  const prompt = (req.prompt || '').trim();

  if (!prompt) {
    return {
      success: false,
      agent: agentName,
      text: '',
      guardedText: '',
      guardVerdict: 'rejected',
      toolCalls: [],
      knowledgeUsed: 0,
      provider: 'unknown',
      runId: null,
      taskId: null,
      error: 'prompt is required',
    };
  }

  // 1. Resolve agent
  const agent = await getAgentByName(agentName);
  if (!agent) {
    return {
      success: false,
      agent: agentName,
      text: '',
      guardedText: '',
      guardVerdict: 'rejected',
      toolCalls: [],
      knowledgeUsed: 0,
      provider: 'unknown',
      runId: null,
      taskId: null,
      error: `Unknown agent: ${agentName}`,
    };
  }

  // 2. Resolve tenant when tenantId supplied (fail closed — tenant isolation)
  let resolvedTenantId: string | null = null;
  if (req.tenantId) {
    const ctx = await resolveTenantContext(req.userId ?? null, req.tenantId ?? null);
    if (!ctx) {
      return {
        success: false,
        agent: agentName,
        text: '',
        guardedText: '',
        guardVerdict: 'rejected',
        toolCalls: [],
        knowledgeUsed: 0,
        provider: 'unknown',
        runId: null,
        taskId: null,
        error: 'Tenant resolution failed: unknown tenant or no membership',
      };
    }
    resolvedTenantId = ctx.tenantId;
  }

  // 3. Create task + run (persistence)
  const taskId = await createAgentTask({
    agentId: agent.id,
    tenantId: resolvedTenantId,
    requestedBy: req.userId ?? null,
    title: prompt.slice(0, 200),
    payload: { agent: agentName, prompt: prompt.slice(0, 2000) },
  });

  // Choose provider (tenant-aware, via existing factory wrapper — never direct SDK)
  let providerId: string;
  try {
    // tenant-aware path first; falls back to platform default when tenantId null
    const tenantProvider = await getTenantAIProvider(
      resolvedTenantId,
      agent.model_selection !== 'aldriva' ? agent.model_selection : undefined
    );
    providerId = tenantProvider.id;
  } catch {
    const p = getAIProvider(agent.model_selection !== 'aldriva' ? agent.model_selection : undefined);
    providerId = p.id;
  }

  const runId = await createAgentRun({
    agentId: agent.id,
    tenantId: resolvedTenantId,
    taskId,
    triggeredBy: 'gateway',
    modelUsed: agent.model_selection,
    providerUsed: providerId,
  });

  let seq = 0;

  // 4. Retrieve knowledge (scoped)
  const retrieval = await retrieveKnowledge(prompt, resolvedTenantId, 4);
  const knowledgeBlock = formatKnowledgeForPrompt(retrieval);
  // 4b. Stage 12: resolve approved memory AFTER knowledge (knowledge
  // outranks memory in the prompt). Empty when no facts apply — never 500.
  const memory = await resolveMemory(agent.id, resolvedTenantId);
  const memoryBlock = formatMemoryForPrompt(memory);
  if (runId) {
    await addAgentStep({
      runId,
      seq: seq++,
      kind: 'knowledge_retrieval',
      content: knowledgeBlock ? knowledgeBlock.slice(0, 4000) : 'no knowledge retrieved',
    });
    // Stage 13 (F-5): memory retrieval joins the same audit trail under its
    // own additive kind — keys/versions/scopes only, never values.
    await addAgentStep({
      runId,
      seq: seq++,
      kind: 'memory_retrieval',
      content: buildMemoryAuditLine(memory),
    });
  }

  // 5. Resolve allowed tools for this agent
  const allowedDefs = await getAllowedToolDefinitions(agentName);
  const allowedNames = new Set(allowedDefs.map((d) => d.name));

  // 6. Build messages (agent system prompt + knowledge + memory + user prompt)
  const systemContent = [
    agent.system_prompt,
    knowledgeBlock ? `\n\n${knowledgeBlock}` : '',
    memoryBlock ? `\n\n${memoryBlock}` : '',
    '\n\nYou must only use tools from the provided allowlist. If a requested action requires a high-risk tool or write, state that it requires human approval and do not attempt it — unless the tool is in your allowlist and its description states that calling it creates an approval request, in which case call it so the platform can route it to human approval.',
  ].join('');

  const messages: AIMessage[] = [
    { role: 'system', content: systemContent },
    ...(req.history ?? []),
    { role: 'user', content: prompt },
  ];

  // 7. Call provider (single iteration, L0)
  const executedToolCalls: Array<{ tool: string; args: string; result: unknown }> = [];
  let rawText = '';
  let providerNameForResult = providerId;

  try {
    const provider = resolvedTenantId
      ? await getTenantAIProvider(resolvedTenantId, agent.model_selection !== 'aldriva' ? agent.model_selection : undefined)
      : getAIProvider(agent.model_selection !== 'aldriva' ? agent.model_selection : undefined);

    providerNameForResult = provider.id;

    if (allowedDefs.length > 0) {
      const toolResult = await provider.toolCall(messages, allowedDefs as AIToolDefinition[], { temperature: 0.2 });
      rawText = toolResult.text ?? '';

      if (toolResult.toolCalls && toolResult.toolCalls.length > 0 && MAX_TOOL_ITERATIONS > 0) {
        // Check each tool call for allowlist + approval gate BEFORE execution
        const tenantCtx = resolvedTenantId && req.userId
          ? await resolveTenantContext(req.userId, resolvedTenantId).catch(() => null)
          : null;

        // For tenant tools, build TenantToolContext-compatible object when we have a tenant ctx
        // Sentinel platform sweep (tenantId null, agent sentinel) needs a synthetic platform ctx
        // so it can query platform (tenant_id IS NULL) incidents/events without failing closed.
        let tenantToolCtx: { tenantId: string; userId: string; role: string; channelAssetId: null; connectedAccountId: null; conversationId: null } | null = tenantCtx
          ? {
              tenantId: tenantCtx.tenantId,
              userId: tenantCtx.userId,
              role: tenantCtx.role as unknown as string,
              channelAssetId: null,
              connectedAccountId: null,
              conversationId: null,
            }
          : null;
        if (!tenantToolCtx && agentName === 'sentinel' && !resolvedTenantId) {
          // Synthetic platform context for sentinel sweep — valid UUID, passes requireToolContext, queries platform merge path.
          // The audit logger (resolveLogTenantId) coerces this placeholder to
          // genuine NULL so ai_tool_invocations keeps its audit row (FK-safe).
          tenantToolCtx = {
            tenantId: PLATFORM_TENANT_PLACEHOLDER,
            userId: req.userId ?? 'system:sentinel-sweep',
            role: 'viewer',
            channelAssetId: null,
            connectedAccountId: null,
            conversationId: null,
          };
        }

        // Batch history so Gemini sees parallel calls as 1 model content with N
        // functionCalls + 1 user content with N functionResponses. The previous
        // per-call push (assistant+tool per iteration) broke parallel replay:
        // it split one parallel model turn into N sequential steps, and the
        // validator then required a thought_signature on the 2nd call's now-
        // first-in-step functionCall — which legitimately has no signature
        // (only the first parallel call carries one). This was position 2.
        const batchAssistantCalls: typeof toolResult.toolCalls = [];
        const batchToolMessages: AIMessage[] = [];

        for (const call of toolResult.toolCalls.slice(0, 6)) {
          const toolName = call.function.name;
          const argsStr = call.function.arguments;

          // Allowlist check (software-enforced) — BEFORE any executor/DB call
          if (!allowedNames.has(toolName)) {
            console.warn(`[orchestrator] Hallucinated or disallowed tool "${toolName}" for agent "${agentName}" — rejected by allowlist before executor (no DB call). Allowed: ${[...allowedNames].slice(0, 8).join(', ')}`);
            if (runId) {
              await addAgentStep({
                runId,
                seq: seq++,
                kind: 'approval_request',
                toolName,
                args: argsStr ? { raw: argsStr.slice(0, 200) } : {},
                content: `Tool "${toolName}" not allowed for agent "${agentName}" — blocked before executor`,
                guardVerdict: 'rejected',
              });
            }
            // Do not execute; surface as guard-layer denial in tool history
            executedToolCalls.push({
              tool: toolName,
              args: argsStr,
              result: { error: `Tool "${toolName}" not allowed for agent "${agentName}"` },
            });
            batchAssistantCalls.push(call);
            batchToolMessages.push({
              role: 'tool',
              name: toolName,
              tool_call_id: call.id,
              content: JSON.stringify({ error: `Tool "${toolName}" not allowed for agent "${agentName}"` }),
            });
            continue;
          }

          // Approval gate
          const gate = await getToolGate(toolName);
          const approvalCheck = await checkApprovalRequired(
            agent.id,
            agent.name,
            agent.autonomy_level,
            toolName,
            gate.risk,
            gate.approvalRequired
          );
          if (approvalCheck.blocked) {
            // Stage 12: memory proposals validate BEFORE any approval exists.
            // Malformed proposals are rejected as tool errors (no approval
            // row); valid ones are recorded with action='memory_propose' and
            // a canonical {memory_proposal} payload — never an execution
            // envelope, so the generic materializer can never enqueue them.
            let approvalId: string | null;
            let blockReason: string;
            if (toolName === 'memory_propose') {
              let proposalRaw: Record<string, unknown> | null = null;
              try {
                proposalRaw = argsStr ? (JSON.parse(argsStr) as Record<string, unknown>) : null;
              } catch {
                proposalRaw = null;
              }
              const checked = validateMemoryProposal(proposalRaw);
              if (!checked.ok) {
                const msg = checked.message;
                executedToolCalls.push({ tool: toolName, args: argsStr, result: { error: msg } });
                batchAssistantCalls.push(call);
                batchToolMessages.push({
                  role: 'tool',
                  name: toolName,
                  tool_call_id: call.id,
                  content: JSON.stringify({ error: msg }),
                });
                continue;
              }
              const p = checked.proposal;
              blockReason = `Memory proposal recorded for human approval (${p.op} ${p.fact_key}).`;
              approvalId = await createApprovalRequest({
                requestedBy: req.userId ?? null,
                requestedByAgentId: agent.id,
                tenantId: resolvedTenantId,
                action: 'memory_propose',
                reason: `Memory ${p.op}: ${p.fact_key}${p.reason ? ` — ${p.reason.slice(0, 500)}` : ''}`.slice(0, 2000),
                evidence: {
                  tool: toolName,
                  proposal: {
                    op: p.op, scope: p.scope, agent: p.agent, fact_key: p.fact_key,
                    fact_value: p.fact_value, base_version: p.base_version,
                    expires_at: p.expires_at, reason: p.reason,
                    run_id: runId ?? null, task_id: taskId ?? null,
                  },
                },
                risk: gate.risk === 'low' ? 'medium' : gate.risk,
                proposedOutcome: {
                  memory_proposal: {
                    op: p.op, scope: p.scope, agent: p.agent, fact_key: p.fact_key,
                    fact_value: p.fact_value, base_version: p.base_version,
                    expires_at: p.expires_at,
                  },
                },
              });
            } else {
            // Stage 10.0: mint the canonical execution envelope from RAW args
            // BEFORE sanitization, so a future worker can bind the exact
            // approved invocation. Mint failure → proposedOutcome stays null
            // (existing behavior; the claim path stamps such rows invalid
            // rather than guessing).
            const minted = mintExecutionEnvelope({
              rawArgs: argsStr ?? null,
              tenantId: resolvedTenantId,
              agentId: agent.id,
              agentName: agent.name,
              taskId: taskId ?? null,
              runId: runId ?? null,
              action: toolName,
            });
            blockReason = approvalCheck.reason;
            approvalId = await createApprovalRequest({
              requestedBy: req.userId ?? null,
              requestedByAgentId: agent.id,
              tenantId: resolvedTenantId,
              action: toolName,
              reason: approvalCheck.reason,
              evidence: { tool: toolName, args: argsStr?.slice(0, 500) ?? '' },
              risk: gate.risk,
              proposedOutcome: minted.ok ? (minted.envelope as unknown as Record<string, unknown>) : null,
            });
            }
            if (runId) {
              await addAgentStep({
                runId,
                seq: seq++,
                kind: 'approval_request',
                toolName,
                args: argsStr ? { raw: argsStr.slice(0, 200) } : {},
                content: blockReason,
                guardVerdict: 'rejected',
              });
            }
            executedToolCalls.push({
              tool: toolName,
              args: argsStr,
              result: { error: blockReason, approvalRequired: true, approvalId },
            });
            batchAssistantCalls.push(call);
            batchToolMessages.push({
              role: 'tool',
              name: toolName,
              tool_call_id: call.id,
              content: JSON.stringify({ error: blockReason, approvalRequired: true }),
            });
            // Complete run as awaiting_approval (still audited) — flush history
            // first so the audit trail is grounded, then early-return.
            if (batchAssistantCalls.length > 0) {
              messages.push({
                role: 'assistant',
                content: toolResult.text ?? '',
                tool_calls: batchAssistantCalls,
              });
              for (const tm of batchToolMessages) messages.push(tm);
            }
            const durationMs = Date.now() - startedAt;
            if (runId) {
              await completeAgentRun(runId, {
                status: 'awaiting_approval',
                duration_ms: durationMs,
                approval_id: approvalId ?? null,
              });
            }
            return {
              success: false,
              agent: agentName,
              text: blockReason,
              guardedText: blockReason,
              guardVerdict: 'rejected',
              toolCalls: executedToolCalls,
              knowledgeUsed: retrieval.chunks.length,
              provider: providerNameForResult,
              runId,
              taskId,
              approvalRequired: true,
              approvalId: approvalId ?? null,
              error: approvalCheck.reason,
            };
          }

          // Execute tool (reuse existing executors — no new SQL paths)
          let toolResultData: unknown;
          try {
            // Tenant-scoped tools require tenant context; route via executeTenantTool when we have one
            const isTenantTool = gate.scope === 'tenant_scoped' || gate.scope === 'transactional';
            if (isTenantTool && tenantToolCtx) {
              // @ts-expect-error — tenantToolCtx shape matches TenantToolContext at runtime for these scopes
              toolResultData = await executeTenantTool(toolName, tenantToolCtx, argsStr);
            } else if (isTenantTool && !tenantToolCtx) {
              // Tenant tool without tenant context: fail closed
              throw new Error(`Tool "${toolName}" requires a tenant context`);
            } else {
              toolResultData = await executeAITool(toolName, argsStr);
            }

            if (runId) {
              await addAgentStep({
                runId,
                seq: seq++,
                kind: 'tool_result',
                toolName,
                args: argsStr ? { raw: argsStr.slice(0, 200) } : {},
                resultSummary: JSON.stringify(toolResultData).slice(0, 2000),
              });
            }
            executedToolCalls.push({ tool: toolName, args: argsStr, result: toolResultData });
            batchAssistantCalls.push(call);
            batchToolMessages.push({
              role: 'tool',
              name: toolName,
              tool_call_id: call.id,
              content: JSON.stringify(toolResultData),
            });
          } catch (toolErr) {
            const msg = toolErr instanceof Error ? toolErr.message : String(toolErr);
            if (runId) {
              await addAgentStep({
                runId,
                seq: seq++,
                kind: 'error',
                toolName,
                content: msg.slice(0, 2000),
              });
            }
            executedToolCalls.push({ tool: toolName, args: argsStr, result: { error: msg } });
            batchAssistantCalls.push(call);
            batchToolMessages.push({
              role: 'tool',
              name: toolName,
              tool_call_id: call.id,
              content: JSON.stringify({ error: msg }),
            });
          }
        }

        // Flush batched history as one model + coalesced user content(s)
        if (batchAssistantCalls.length > 0) {
          messages.push({
            role: 'assistant',
            content: toolResult.text ?? '',
            tool_calls: batchAssistantCalls,
          });
          for (const tm of batchToolMessages) messages.push(tm);
        }

        // Synthesis-turn closure: the next generateText call has tools omitted
        // (text-only). The model must not narrate unexecuted calls — it must
        // summarize ONLY what it already has, or say plainly it lacks data.
        messages.push({
          role: 'user',
          content:
            'You have reached the maximum number of tool calls for this investigation. ' +
            'Do NOT propose, mention, or write out any further tool calls. ' +
            'Summarize your findings based ONLY on the tool results you already have. ' +
            "If you don't have enough information to reach a conclusion, say so plainly and stop — " +
            'do not describe what you would check next.',
        });

        // Final turn with tool outputs in context — MUST be text-only.
        // Prior code called generateText(messages) with no tools in the payload
        // and expected text. Gemini still returned functionCalls (get_health_status,
        // get_ai_guard_rejections with thoughtSignature) with finishReason STOP and
        // maxOutputTokens 800 not exceeded — so MAX_TOKENS wasn't the cause.
        // This is not stateful instance fields nor provider cache: factory returns
        // new instances and GeminiProvider has no tools field; formatMessages only
        // builds contents. Gemini may return functionCalls when history already
        // contains tool turns unless explicitly forced to text via toolConfig:NONE.
        if (executedToolCalls.length > 0 && executedToolCalls.some((tc) => !('error' in (tc.result as object)) || !!(tc.result as { error?: string }).error === false)) {
          let finalGenText = '';
          let finalGenFinishReason: string | undefined;
          try {
            // Final synthesis MUST be text-only. Gemini's generateText payload
            // already omits the `tools` array entirely (only toolCall() ever
            // sends tools), but we also send toolConfig:NONE as an explicit
            // signal. Gemini does not reliably honor NONE alone (observed:
            // returned get_incident_history with thoughtSignature despite NONE),
            // so on leak we retry ONCE with the same text-only payload before
            // falling back to the deterministic summary. Do not raise
            // MAX_TOOL_ITERATIONS and do not loop more than once extra.
            let finalGen = await provider.generateText(messages, {
              temperature: 0.3,
              maxTokens: 800,
              toolConfig: { functionCallingConfig: { mode: 'NONE' } },
            });
            finalGenText = finalGen.text || '';
            finalGenFinishReason = finalGen.finishReason;
            if (!finalGenText.trim()) {
              const rawCandidate = (finalGen as unknown as { raw?: { candidates?: Array<{ content?: { parts?: Array<{ functionCall?: { name: string } }> }; finishReason?: string }>; usageMetadata?: { thoughtsTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } } }).raw;
              let leaked = rawCandidate?.candidates?.[0]?.content?.parts?.filter((p) => !!p.functionCall).map((p) => p.functionCall!.name) ?? [];
              if (leaked.length > 0) {
                // Keep WARN observable — do not silence. Retry once with tools
                // still omitted (payload has no tools array, only contents) before
                // deterministc fallback. This reduces flake without raising
                // MAX_TOOL_ITERATIONS or adding unbounded looping.
                console.warn(
                  `[orchestrator] final synthesis requested text-only (toolConfig:NONE, no tools array) but Gemini returned ${leaked.length} functionCall(s): ${leaked.join(', ')} — retrying once text-only before deterministic fallback. MAX_TOOL_ITERATIONS=${MAX_TOOL_ITERATIONS}`,
                  {
                    agent: agentName,
                    leaked,
                    finishReason: rawCandidate?.candidates?.[0]?.finishReason,
                    thoughtTokens: rawCandidate?.usageMetadata?.thoughtsTokenCount,
                    outputTokens: rawCandidate?.usageMetadata?.candidatesTokenCount,
                    totalTokens: rawCandidate?.usageMetadata?.totalTokenCount,
                    maxOutputTokens: 800,
                    rawSnippet: JSON.stringify(finalGen).slice(0, 1200),
                  }
                );
                // Single bounded retry — same text-only payload (no tools array)
                try {
                  finalGen = await provider.generateText(messages, {
                    temperature: 0.3,
                    maxTokens: 800,
                    toolConfig: { functionCallingConfig: { mode: 'NONE' } },
                  });
                  finalGenText = finalGen.text || '';
                  finalGenFinishReason = finalGen.finishReason;
                  if (finalGenText.trim()) {
                    console.warn(`[orchestrator] retry succeeded for agent=${agentName} after hallucinated ${leaked.join(', ')}`);
                  } else {
                    const raw2 = (finalGen as unknown as { raw?: { candidates?: Array<{ content?: { parts?: Array<{ functionCall?: { name: string } }> }; finishReason?: string }>; usageMetadata?: unknown } }).raw;
                    const leaked2 = raw2?.candidates?.[0]?.content?.parts?.filter((p) => !!p.functionCall).map((p) => p.functionCall!.name) ?? [];
                    if (leaked2.length > 0) {
                      console.warn(
                        `[orchestrator] retry still returned ${leaked2.length} functionCall(s): ${leaked2.join(', ')} — falling back to deterministic summary.`,
                        { agent: agentName, leaked2, finishReason: raw2?.candidates?.[0]?.finishReason, rawSnippet: JSON.stringify(finalGen).slice(0, 1200) }
                      );
                    } else {
                      console.warn(`[orchestrator] retry still empty for agent=${agentName} — falling back to deterministic summary.`, {
                        finishReason: (raw2 as unknown as { candidates?: Array<{ finishReason?: string }> })?.candidates?.[0]?.finishReason,
                        rawSnippet: JSON.stringify(finalGen).slice(0, 1000),
                      });
                    }
                  }
                } catch (retryErr) {
                  const rmsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
                  console.error(`[orchestrator] retry generateText failed for agent=${agentName}:`, rmsg);
                  // Preserve original leak text (empty) so fallback triggers; do not throw — fallback is safety net.
                }
              } else {
                console.warn(`[orchestrator] generateText returned empty text after ${executedToolCalls.length} tool(s) for agent=${agentName}`, {
                  finishReason: rawCandidate?.candidates?.[0]?.finishReason,
                  thoughtTokens: rawCandidate?.usageMetadata?.thoughtsTokenCount,
                  outputTokens: rawCandidate?.usageMetadata?.candidatesTokenCount,
                  totalTokens: rawCandidate?.usageMetadata?.totalTokenCount,
                  maxOutputTokens: 800,
                  rawSnippet: JSON.stringify(finalGen).slice(0, 1000),
                });
              }
            }
          } catch (genErr) {
            const genMsg = genErr instanceof Error ? genErr.message : String(genErr);
            console.error(`[orchestrator] final generateText failed for agent=${agentName}:`, genMsg);
            // Propagate to outer catch so it emits system_events and returns
            // success:false instead of silently returning success:true + fallback.
            // The fallback below only covers true empty-model (no error) cases.
            throw genErr;
          }
          // Only adopt non-empty synthesis; empty (including leaked tool-call
          // empty) keeps rawText="" so the fallback path below is visible.
          if (finalGenText.trim()) rawText = finalGenText;
          else if (finalGenFinishReason === 'tool_calls') {
            // Ensure fallback is triggered visibly, not hidden as success with empty rawText.
            rawText = '';
          } else {
            rawText = finalGenText || rawText;
          }
        }
      }
    } else {
      const gen = await provider.generateText(messages, { temperature: 0.3, maxTokens: 800 });
      rawText = gen.text;
    }

    if (runId) {
      await addAgentStep({
        runId,
        seq: seq++,
        kind: 'model_output',
        content: rawText.slice(0, 4000),
      });
    }
  } catch (err) {
    const msg = err instanceof Error ? err.message : String(err);
    const durationMs = Date.now() - startedAt;
    if (runId) {
      await addAgentStep({ runId, seq: seq++, kind: 'error', content: msg.slice(0, 4000) });
      await completeAgentRun(runId, { status: 'failed', duration_ms: durationMs, error: msg.slice(0, 2000) });
    }
    return {
      success: false,
      agent: agentName,
      text: '',
      guardedText: '',
      guardVerdict: 'rejected',
      toolCalls: executedToolCalls,
      knowledgeUsed: retrieval.chunks.length,
      provider: providerNameForResult,
      runId,
      taskId,
      error: msg,
    };
  }

  // 8. Output guard (mandatory — never bypass)
  let guardedText = rawText;
  let guardVerdict: 'pass' | 'flagged' | 'rejected' = 'pass';
  let guardError: string | null = null;
  try {
    const knownUuids: string[] = [];
    // Collect UUIDs from tool results as known (leak-safe set)
    for (const tc of executedToolCalls) {
      const json = JSON.stringify(tc.result);
      const uuidRe = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
      let m: RegExpExecArray | null;
      while ((m = uuidRe.exec(json))) knownUuids.push(m[0]);
    }
    const maybeGuarded = guardBeforeDisplay(rawText, `gateway.${agentName}`, knownUuids);
    guardedText = maybeGuarded;
    if (guardedText !== rawText) guardVerdict = 'flagged';
    if (runId) {
      await addAgentStep({
        runId,
        seq: seq++,
        kind: 'guard_verdict',
        content: `guard: ${guardVerdict}`,
        guardVerdict,
      });
    }
  } catch (guardErr) {
    const reason = guardErr instanceof Error ? guardErr.message : String(guardErr);
    guardError = reason;
    guardVerdict = 'rejected';
    guardedText = '';
    if (runId) {
      await addAgentStep({
        runId,
        seq: seq++,
        kind: 'guard_verdict',
        content: reason.slice(0, 2000),
        guardVerdict: 'rejected',
      });
    }
  }

  // Fallback when model returns empty but tools returned data (e.g. sentinel sweep platform query)
  if (!guardedText.trim() && executedToolCalls.length > 0 && !guardError) {
    const hasData = executedToolCalls.some((tc) => {
      const r = tc.result as unknown as { length?: number } | unknown[];
      if (Array.isArray(r)) return r.length > 0;
      if (r && typeof r === 'object' && 'reconciliation_failures' in (r as object)) {
        const v = (r as { reconciliation_failures?: unknown[]; webhook_events?: unknown[] }).reconciliation_failures;
        const w = (r as { reconciliation_failures?: unknown[]; webhook_events?: unknown[] }).webhook_events;
        return (Array.isArray(v) && v.length > 0) || (Array.isArray(w) && w.length > 0);
      }
      if (r && typeof r === 'object' && r !== null) return Object.keys(r as object).length > 0;
      return false;
    });
    if (hasData) {
      // Deterministic fallback so sweep never returns empty text when grounded data exists
      const toolSummary = executedToolCalls
        .map((tc) => {
          const res = tc.result as unknown;
          let count = 0;
          if (Array.isArray(res)) count = res.length;
          else if (res && typeof res === 'object' && 'length' in (res as object)) count = (res as { length: number }).length;
          else if (res && typeof res === 'object') {
            const maybe = res as { reconciliation_failures?: unknown[] };
            if (Array.isArray(maybe.reconciliation_failures)) count = maybe.reconciliation_failures.length;
          }
          const first = Array.isArray(res) && res[0] ? (res[0] as { dedupe_key?: string; severity?: string; title?: string }) : null;
          const hint = first?.dedupe_key ? ` dedupe_key=${first.dedupe_key}` : first?.severity ? ` severity=${first.severity}` : '';
          return `${tc.tool}: ${count} row(s)${hint}`;
        })
        .join('; ');
      const fallback = `[Sentinel fallback summary — model returned empty but tools returned data] ${toolSummary}. Prompt: ${prompt.slice(0, 300)}`;
      guardedText = fallback;
      console.warn(`[orchestrator] Empty model text for agent=${agentName} — using fallback summary`);
    }
  }

  // 9. Complete run + report
  const durationMs = Date.now() - startedAt;
  const runStatus = guardVerdict === 'rejected' ? 'failed' : 'completed';
  if (runId) {
    await completeAgentRun(runId, {
      status: runStatus,
      guard_result: guardVerdict,
      duration_ms: durationMs,
      error: guardError,
    });
    const summary = guardedText
      ? guardedText.slice(0, 500)
      : guardError
        ? `Guard rejected: ${guardError.slice(0, 300)}`
        : `Agent ${agentName} executed ${executedToolCalls.length} tool(s)`;
    await createAgentReport({
      agentId: agent.id,
      runId,
      tenantId: resolvedTenantId,
      summary,
      sections: {
        what_happened: `Prompt: ${prompt.slice(0, 400)}`,
        tool_calls: executedToolCalls.map((tc) => ({ tool: tc.tool })),
        knowledge_used: retrieval.chunks.map((c) => ({ title: c.title, category: c.category })),
        guard_verdict: guardVerdict,
        provider: providerNameForResult,
        duration_ms: durationMs,
      },
    });
  }

  return {
    success: guardVerdict !== 'rejected' && runStatus !== 'failed',
    agent: agentName,
    text: rawText,
    guardedText,
    guardVerdict,
    toolCalls: executedToolCalls,
    knowledgeUsed: retrieval.chunks.length,
    provider: providerNameForResult,
    runId,
    taskId,
    error: guardError ?? undefined,
  };
}
