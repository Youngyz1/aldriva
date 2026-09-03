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
}

export interface AIToolDefinition {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, unknown>;
    required?: string[];
  };
}

export interface AIGenerateOptions {
  temperature?: number;
  maxTokens?: number;
  systemPrompt?: string;
  timeoutMs?: number;
  model?: string;
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
