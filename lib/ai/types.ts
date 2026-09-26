/**
 * lib/ai/types.ts
 * Core interfaces and types for the provider-agnostic Aldriva AI abstraction layer.
 */

export interface AIMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  name?: string;
  tool_call_id?: string;
  tool_calls?: AIToolCall[];
}

export interface AIToolCall {
  id: string;
  type: 'function';
  function: {
    name: string;
    arguments: string; // JSON formatted parameters string
  };
  /** Gemini thought_signature — encrypted reasoning continuity token. Required to replay for Gemini 3+ functionCall turns. */
  thoughtSignature?: string;
}

export type AIToolScope = 'public_read' | 'tenant_scoped' | 'transactional' | 'admin';

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
  /**
   * Tool trust tier. The 8 catalog/fetch tools are 'public_read'.
   * Tenant-scoped business tools resolve their tenant from a
   * server-derived TenantContext (never a model-supplied id).
   * 'transactional' tools perform side effects (notifications) via existing
   * service modules only.
   * 'admin' tools read admin-only tables (e.g. ai_content_items) and must
   * only be offered on admin-gated routes — never on a non-admin surface.
   */
  scope?: AIToolScope;
}

export interface AIGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  timeoutMs?: number;
  model?: string;
  /**
   * Gemini tool calling mode. When set to NONE on a final synthesis turn,
   * forces a text-only response even if history contains prior functionCalls.
   * Without this, a payload with no `tools` key is still ambiguous when the
   * history already contains functionCall/functionResponse — Gemini may return
   * more functionCalls instead of text (observed on sentinel sweep).
   */
  toolConfig?: {
    functionCallingConfig?: {
      mode?: 'AUTO' | 'ANY' | 'NONE';
      allowedFunctionNames?: string[];
    };
  };
}

export interface AIGenerateResult {
  text: string;
  finishReason?: 'stop' | 'length' | 'tool_calls' | 'error';
  raw?: unknown;
}

export interface AIToolCallResult {
  text?: string;
  toolCalls: AIToolCall[];
  finishReason?: 'tool_calls' | 'stop' | 'error';
}

export interface AIProvider {
  id: string;
  name: string;

  generateText(
    prompt: string | AIMessage[],
    options?: AIGenerateOptions
  ): Promise<AIGenerateResult>;

  streamText(
    prompt: string | AIMessage[],
    options?: AIGenerateOptions
  ): Promise<ReadableStream<Uint8Array>>;

  toolCall(
    prompt: string | AIMessage[],
    tools: AIToolDefinition[],
    options?: AIGenerateOptions
  ): Promise<AIToolCallResult>;
}
