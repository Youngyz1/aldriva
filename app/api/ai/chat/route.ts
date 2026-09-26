/**
 * app/api/ai/chat/route.ts
 *
 * Admin AI Chat & Tool Endpoint for Growth Studio workspace.
 *
 * Requirements (ADR-0002):
 *  1. Gated strictly by requireAdmin() — no alternate auth check allowed.
 *  2. Executes safe-column tools registered in lib/ai/tools-registry.ts.
 *  3. Passes every model-generated text through guardBeforeDisplay() before returning to UI.
 */

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth';
import { enforceRateLimit } from '@/lib/rate-limit';
import { getAIProvider } from '@/lib/ai/provider-factory';
import { guardBeforeDisplay } from '@/lib/ai/output-guard';
import { executeAITool } from '@/lib/ai/tools-registry';
import { PUBLIC_AI_TOOL_DEFINITIONS, ADMIN_AI_TOOL_DEFINITIONS } from '@/lib/ai/tools-registry';
import { AIMessage } from '@/lib/ai/types';
import { insertSystemEvent } from '@/lib/observability/system-events';

export async function POST(req: NextRequest) {
  try {
    // 1. Mandatory Admin Gate
    await requireAdmin();

    // LLM + tool calls per request: same per-caller AI budget as the
    // article assistant (articleAi tier).
    const limited = await enforceRateLimit("articleAi", req);
    if (limited) return limited;

    const body = await req.json();
    const {
      prompt,
      messages: inputMessages,
      provider = 'gemini',
      enableTools = true,
      directTool,
      toolArgs,
    } = body;

    // Direct single-tool invocation mode (for direct UI tool testing buttons)
    if (directTool) {
      const rawResult = await executeAITool(directTool, JSON.stringify(toolArgs || {}));
      return NextResponse.json({
        success: true,
        tool: directTool,
        result: rawResult,
      });
    }

    if (!prompt && (!inputMessages || inputMessages.length === 0)) {
      return NextResponse.json(
        { error: 'Either prompt or messages array is required' },
        { status: 400 }
      );
    }

    const aiProvider = getAIProvider(provider);

    // Build message history
    let messages: AIMessage[] = [];
    if (inputMessages && Array.isArray(inputMessages)) {
      messages = [...inputMessages];
    } else {
      messages = [
        {
          role: 'system',
          content:
            'You are Aldriva AI, an intelligent assistant for the Aldriva growth studio admin panel. ' +
            'You help platform admins analyze, curate, and promote events, fundraisers, businesses, articles, and products. ' +
            'Use available tools to fetch live platform data when requested.',
        },
        {
          role: 'user',
          content: prompt,
        },
      ];
    }

    let finalResponseText = '';
    const executedToolCalls: Array<{ tool: string; args: string; result: unknown }> = [];

    if (enableTools) {
      // Admin-gated route: offer public catalog tools + admin tools only.
      // Tenant-scoped tools are intentionally excluded — they require a
      // server-derived TenantContext via executeTenantTool(), which this
      // route does not establish, so offering them would only leak the
      // internal tool surface to the model.
      const toolCallResult = await aiProvider.toolCall(messages, [
        ...PUBLIC_AI_TOOL_DEFINITIONS,
        ...ADMIN_AI_TOOL_DEFINITIONS,
      ]);

      if (toolCallResult.toolCalls && toolCallResult.toolCalls.length > 0) {
        // Batch tool history so Gemini sees parallel calls as 1 model content.
        // Per-call push (assistant+tool per iteration) broke parallel replay:
        // it split one parallel model turn into N sequential steps, making
        // Gemini demand a thought_signature on position 2's now-first-in-step
        // functionCall — which legitimately has none (only first parallel has sig).
        const batchCalls: typeof toolCallResult.toolCalls = [];
        const batchToolMessages: AIMessage[] = [];
        for (const call of toolCallResult.toolCalls) {
          const toolName = call.function.name;
          const toolArgsStr = call.function.arguments;

          try {
            const toolResultData = await executeAITool(toolName, toolArgsStr);
            executedToolCalls.push({
              tool: toolName,
              args: toolArgsStr,
              result: toolResultData,
            });
            batchCalls.push(call);
            batchToolMessages.push({
              role: 'tool',
              name: toolName,
              tool_call_id: call.id,
              content: JSON.stringify(toolResultData),
            });
          } catch (err: unknown) {
            const errorMsg = err instanceof Error ? err.message : String(err);
            console.error(`[api/ai/chat] Tool ${toolName} execution error:`, errorMsg);
            batchCalls.push(call);
            batchToolMessages.push({
              role: 'tool',
              name: toolName,
              tool_call_id: call.id,
              content: JSON.stringify({ error: errorMsg }),
            });
          }
        }
        // Flush as one model content with N functionCalls, then coalesced user
        // content with N functionResponses (formatMessages merges consecutive tools).
        messages.push({
          role: 'assistant',
          content: toolCallResult.text || '',
          tool_calls: batchCalls,
        });
        for (const tm of batchToolMessages) messages.push(tm);

        // Step 2: Final turn after tool results are added to history
        // Do NOT swallow thought_signature 400s — let outer catch emit
        // system_events so the failure is visible instead of masked by empty.
        // Force text-only: without toolConfig:NONE Gemini may return more
        // functionCalls (observed in orchestrator sentinel sweep) even when
        // payload has no tools, because history already contains tool turns.
        const secondTurn = await aiProvider.generateText(messages, { toolConfig: { functionCallingConfig: { mode: 'NONE' } } });
        finalResponseText = secondTurn.text;
      } else {
        finalResponseText = toolCallResult.text || '';
      }
    } else {
      // Standard generation without tools
      const genResult = await aiProvider.generateText(messages);
      finalResponseText = genResult.text;
    }

    // 2. Mandatory Output Guard Gate before returning to UI
    let guardedText = '';
    let guardVerdict: 'pass' | 'sanitised' | 'rejected' = 'pass';
    let guardReason: string | undefined;

    try {
      guardedText = guardBeforeDisplay(finalResponseText, 'app.api.ai.chat');
      if (guardedText !== finalResponseText) {
        guardVerdict = 'sanitised';
        guardReason = 'Offending system prompt fragments stripped';
      }
    } catch (guardErr: unknown) {
      const reason = guardErr instanceof Error ? guardErr.message : String(guardErr);
      void insertSystemEvent({
        kind: 'guard_rejection',
        severity_hint: 'warn',
        route: 'POST /api/ai/chat',
        status_code: 422,
        error_code: 'output_guard_rejected',
        message: reason.slice(0, 2000),
        metadata: { guardVerdict: 'rejected', toolCalls: executedToolCalls.length, provider: aiProvider.id },
        source: 'aldriva',
      });
      return NextResponse.json(
        {
          error: 'Content rejected by Output Guard',
          reason,
          rejected: true,
          toolCalls: executedToolCalls,
        },
        { status: 422 }
      );
    }

    return NextResponse.json({
      success: true,
      text: guardedText,
      guardVerdict,
      guardReason,
      toolCalls: executedToolCalls,
      provider: aiProvider.id,
    });
  } catch (err: unknown) {
    console.error("[api/ai/chat]", err);
    const raw = err instanceof Error ? err.message : String(err);
    const status = raw.includes('Unauthorized') || raw.includes('Forbidden') ? 403 : 500;
    const isProviderError = /gemini|openrouter|provider|503|timeout/i.test(raw);
    void insertSystemEvent({
      kind: status === 403 ? 'approval_block' : 'api_error',
      severity_hint: status === 403 ? 'warn' : 'error',
      route: 'POST /api/ai/chat',
      status_code: status,
      error_code: isProviderError ? 'provider_error' : status === 403 ? 'auth_forbidden' : 'unhandled',
      message: raw.slice(0, 2000),
      metadata: { provider: 'unknown' },
      source: 'aldriva',
    });
    return NextResponse.json({ error: "AI service error. Please try again." }, { status });
  }
}
