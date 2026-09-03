/**
 * lib/ai/providers/openrouter.ts
 * OpenRouter Cloud AI Provider implementation for Aldriva AI.
 * Uses OpenRouter's OpenAI-compatible completions API endpoint.
 */

import {
  AIProvider,
  AIMessage,
  AIToolDefinition,
  AIGenerateOptions,
  AIGenerateResult,
  AIToolCallResult,
  AIToolCall,
} from '../types';

export class OpenRouterProvider implements AIProvider {
  public readonly id = 'openrouter';
  public readonly name = 'OpenRouter (Cloud)';

  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://openrouter.ai/api/v1';

  constructor(config?: { apiKey?: string; model?: string }) {
    this.apiKey =
      config?.apiKey || process.env.OPENROUTER_API_KEY || '';
    this.defaultModel =
      config?.model ||
      process.env.OPENROUTER_MODEL ||
      'meta-llama/llama-3.3-70b-instruct';
  }

  private ensureApiKey() {
    if (!this.apiKey) {
      throw new Error(
        'OpenRouter API key is not configured. Set OPENROUTER_API_KEY in your environment variables.'
      );
    }
  }

  private normalizeMessages(
    prompt: string | AIMessage[],
    systemPrompt?: string
  ): AIMessage[] {
    const messages: AIMessage[] = [];

    if (systemPrompt) {
      messages.push({ role: 'system', content: systemPrompt });
    }

    if (typeof prompt === 'string') {
      messages.push({ role: 'user', content: prompt });
    } else {
      messages.push(...prompt);
    }

    return messages;
  }

  private async fetchWithTimeout(
    endpoint: string,
    payload: Record<string, unknown>,
    timeoutMs = 15000
  ): Promise<Response> {
    this.ensureApiKey();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    try {
      const response = await fetch(`${this.baseUrl}${endpoint}`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
          'HTTP-Referer': process.env.NEXT_PUBLIC_BASE_URL || 'https://aldriva.com',
          'X-Title': 'Aldriva AI System',
        },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);
      return response;
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const message = isAbort
        ? `Request timed out after ${timeoutMs}ms`
        : err instanceof Error
        ? err.message
        : 'Connection failed';

      throw new Error(`OpenRouter provider error: ${message}`);
    }
  }

  async generateText(
    prompt: string | AIMessage[],
    options?: AIGenerateOptions
  ): Promise<AIGenerateResult> {
    const model = options?.model || this.defaultModel;
    const messages = this.normalizeMessages(prompt, options?.systemPrompt);
    const timeoutMs = options?.timeoutMs || 15000;

    const payload = {
      model,
      messages,
      temperature: options?.temperature ?? 0.7,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    };

    const res = await this.fetchWithTimeout(
      '/chat/completions',
      payload,
      timeoutMs
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(
        `OpenRouter API responded with status ${res.status}: ${errorText}`
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: { content?: string };
        finish_reason?: string;
      }>;
    };

    const text = data.choices?.[0]?.message?.content?.trim() || '';
    const finishReason =
      (data.choices?.[0]?.finish_reason as AIGenerateResult['finishReason']) ||
      'stop';

    return {
      text,
      finishReason,
      raw: data,
    };
  }

  async streamText(
    prompt: string | AIMessage[],
    options?: AIGenerateOptions
  ): Promise<ReadableStream<Uint8Array>> {
    const model = options?.model || this.defaultModel;
    const messages = this.normalizeMessages(prompt, options?.systemPrompt);
    const timeoutMs = options?.timeoutMs || 15000;

    const payload = {
      model,
      messages,
      stream: true,
      temperature: options?.temperature ?? 0.7,
      ...(options?.maxTokens ? { max_tokens: options.maxTokens } : {}),
    };

    const res = await this.fetchWithTimeout(
      '/chat/completions',
      payload,
      timeoutMs
    );

    if (!res.ok || !res.body) {
      throw new Error(
        `OpenRouter streaming error: API returned HTTP status ${res.status}`
      );
    }

    const reader = res.body.getReader();
    const encoder = new TextEncoder();
    const decoder = new TextDecoder();

    return new ReadableStream<Uint8Array>({
      async start(controller) {
        let buffer = '';

        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            buffer += decoder.decode(value, { stream: true });
            const lines = buffer.split('\n');
            buffer = lines.pop() || '';

            for (const line of lines) {
              const trimmed = line.trim();
              if (!trimmed || trimmed.startsWith(':')) continue;

              if (trimmed.startsWith('data: ')) {
                const dataStr = trimmed.slice(6);
                if (dataStr === '[DONE]') {
                  controller.close();
                  return;
                }

                try {
                  const parsed = JSON.parse(dataStr) as {
                    choices?: Array<{
                      delta?: { content?: string };
                    }>;
                  };

                  const deltaContent = parsed.choices?.[0]?.delta?.content;
                  if (deltaContent) {
                    controller.enqueue(encoder.encode(deltaContent));
                  }
                } catch {
                  // Ignore JSON parse error in stream chunk
                }
              }
            }
          }

          controller.close();
        } catch (err) {
          controller.error(err);
        }
      },
    });
  }

  async toolCall(
    prompt: string | AIMessage[],
    tools: AIToolDefinition[],
    options?: AIGenerateOptions
  ): Promise<AIToolCallResult> {
    const model = options?.model || this.defaultModel;
    const messages = this.normalizeMessages(prompt, options?.systemPrompt);
    const timeoutMs = options?.timeoutMs || 15000;

    const formattedTools = tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters,
      },
    }));

    const payload = {
      model,
      messages,
      tools: formattedTools,
      temperature: options?.temperature ?? 0.2,
    };

    const res = await this.fetchWithTimeout(
      '/chat/completions',
      payload,
      timeoutMs
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(
        `OpenRouter tool call responded with status ${res.status}: ${errorText}`
      );
    }

    const data = (await res.json()) as {
      choices?: Array<{
        message?: {
          content?: string;
          tool_calls?: Array<{
            id: string;
            type: 'function';
            function: {
              name: string;
              arguments: string;
            };
          }>;
        };
      }>;
    };

    const choiceMessage = data.choices?.[0]?.message;
    const rawCalls = choiceMessage?.tool_calls || [];
    const toolCalls: AIToolCall[] = rawCalls.map((call) => ({
      id: call.id,
      type: 'function',
      function: {
        name: call.function.name,
        arguments: call.function.arguments,
      },
    }));

    return {
      text: choiceMessage?.content || undefined,
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }
}
