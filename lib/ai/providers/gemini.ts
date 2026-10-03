/**
 * lib/ai/providers/gemini.ts
 * Google Gemini AI Provider implementation for Aldriva AI.
 * Uses Google's Gemini REST API (v1beta) with support for text generation,
 * streaming, and function/tool calling.
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

interface GeminiPart {
  text?: string;
  /** Present on thinking-model responses; marks internal reasoning — must be excluded from output. */
  thought?: boolean;
  thoughtSignature?: string;
  functionCall?: {
    name: string;
    args: Record<string, unknown>;
  };
  functionResponse?: {
    name: string;
    response: Record<string, unknown>;
  };
}

interface GeminiContent {
  role: 'user' | 'model';
  parts: GeminiPart[];
}

export class GeminiProvider implements AIProvider {
  public readonly id = 'gemini';
  public readonly name = 'Google Gemini';

  private apiKey: string;
  private defaultModel: string;
  private baseUrl = 'https://generativelanguage.googleapis.com/v1beta';

  constructor(config?: { apiKey?: string; model?: string }) {
    this.apiKey = config?.apiKey || process.env.GEMINI_API_KEY || '';
    this.defaultModel =
      config?.model || process.env.GEMINI_MODEL || 'gemini-3.6-flash';
  }

  private ensureApiKey() {
    if (!this.apiKey) {
      throw new Error(
        'Gemini API key is not configured. Set GEMINI_API_KEY in your environment variables.'
      );
    }
  }

  /**
   * Translates unified AIMessage[] or prompt string into Gemini systemInstruction and contents array.
   */
  private formatMessages(
    prompt: string | AIMessage[],
    systemPromptOverride?: string
  ): {
    systemInstruction?: { parts: [{ text: string }] };
    contents: GeminiContent[];
  } {
    let systemText = systemPromptOverride || '';
    const rawMessages: AIMessage[] =
      typeof prompt === 'string'
        ? [{ role: 'user', content: prompt }]
        : prompt;

    const contents: GeminiContent[] = [];
    // Pending tool responses are coalesced into a single user content so that
    // parallel functionCalls (1 model content with N functionCalls) are followed
    // by 1 user content with N functionResponses — exactly the shape Gemini 3
    // validates. Without coalescing, we would emit N model+user pairs and the
    // validator would demand a thought_signature on the 2nd parallel call's
    // now-first-in-step functionCall (which legitimately has none).
    let pendingToolParts: GeminiPart[] = [];
    const flushPendingTools = () => {
      if (pendingToolParts.length > 0) {
        contents.push({ role: 'user', parts: pendingToolParts });
        pendingToolParts = [];
      }
    };

    for (const msg of rawMessages) {
      if (msg.role === 'system') {
        flushPendingTools();
        systemText = systemText
          ? `${systemText}\n\n${msg.content}`
          : msg.content;
        continue;
      }

      if (msg.role === 'user') {
        flushPendingTools();
        contents.push({
          role: 'user',
          parts: [{ text: msg.content || '' }],
        });
      } else if (msg.role === 'assistant') {
        flushPendingTools();
        const parts: GeminiPart[] = [];
        if (msg.content) {
          parts.push({ text: msg.content });
        }
        if (msg.tool_calls && msg.tool_calls.length > 0) {
          for (let idx = 0; idx < msg.tool_calls.length; idx++) {
            const call = msg.tool_calls[idx];
            let parsedArgs: Record<string, unknown> = {};
            try {
              parsedArgs =
                typeof call.function.arguments === 'string'
                  ? JSON.parse(call.function.arguments)
                  : (call.function.arguments as Record<string, unknown>);
            } catch {
              parsedArgs = {};
            }
            const part: GeminiPart = {
              functionCall: {
                name: call.function.name,
                args: parsedArgs,
              },
            };
            if (call.thoughtSignature) {
              part.thoughtSignature = call.thoughtSignature;
            } else if (idx === 0) {
              // Per Gemini 3 spec: only the FIRST functionCall in a parallel batch
              // carries a signature; subsequent parallel calls legitimately have
              // none. So we only warn on missing signature for the first call in
              // the batch — missing on idx>0 is expected for parallel calls.
              console.warn(`[gemini] Missing thought_signature for functionCall "${call.function.name}" (first in batch) in history replay — Gemini 3 will reject this turn (position ${contents.length + 1})`);
            }
            parts.push(part);
          }
        }
        if (parts.length > 0) {
          contents.push({ role: 'model', parts });
        }
      } else if (msg.role === 'tool') {
        let parsedResult: unknown = {};
        try {
          parsedResult =
            typeof msg.content === 'string'
              ? JSON.parse(msg.content)
              : { content: msg.content };
        } catch {
          parsedResult = { content: msg.content };
        }

        // Gemini functionResponse.response must be an OBJECT, not an array/primitive.
        // Our tools return arrays (row sets) — wrap those so the proto field is not repeating.
        let responseObj: Record<string, unknown>;
        if (Array.isArray(parsedResult)) {
          responseObj = { result: parsedResult };
        } else if (parsedResult !== null && typeof parsedResult === 'object') {
          responseObj = parsedResult as Record<string, unknown>;
          // Defensive: if somehow still an array-like after JSON parse, wrap
          if (Array.isArray(responseObj)) responseObj = { result: responseObj };
        } else {
          responseObj = { result: parsedResult };
        }

        // Hard fail loudly on malformed shape rather than silently sending bad proto
        if (!responseObj || typeof responseObj !== 'object' || Array.isArray(responseObj)) {
          console.error('[gemini] Refusing to send malformed functionResponse.response', { name: msg.name, type: typeof responseObj });
          responseObj = { error: 'malformed tool result shape', rawType: typeof parsedResult };
        }

        pendingToolParts.push({
          functionResponse: {
            name: msg.name || 'tool_response',
            response: responseObj,
          },
        });
      }
    }
    flushPendingTools();

    return {
      systemInstruction: systemText
        ? { parts: [{ text: systemText }] }
        : undefined,
      contents: contents.length > 0 ? contents : [{ role: 'user', parts: [{ text: '' }] }],
    };
  }

  private async fetchWithTimeout(
    endpoint: string,
    payload: Record<string, unknown>,
    timeoutMs = 15000
  ): Promise<Response> {
    this.ensureApiKey();

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), timeoutMs);

    const separator = endpoint.includes('?') ? '&' : '?';
    const url = `${this.baseUrl}${endpoint}${separator}key=${encodeURIComponent(
      this.apiKey
    )}`;

    try {
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          // AQ.-prefixed "Authorization keys" (new Google AI Studio format as of 2026)
          // require x-goog-api-key header; older AIzaSy keys work with key= query param.
          // Sending both ensures compatibility with either format.
          'x-goog-api-key': this.apiKey,
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

      throw new Error(`Gemini provider error: ${message}`);
    }
  }

  async generateText(
    prompt: string | AIMessage[],
    options?: AIGenerateOptions
  ): Promise<AIGenerateResult> {
    const model = options?.model || this.defaultModel;
    const { systemInstruction, contents } = this.formatMessages(
      prompt,
      options?.systemPrompt
    );
    const timeoutMs = options?.timeoutMs || 15000;

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        // For thinking models (e.g. gemini-3.6-flash), maxOutputTokens includes
        // both thinking tokens and final response tokens. We provide ample headroom
        // so internal reasoning never truncates the actual response text.
        maxOutputTokens: options?.maxTokens
          ? Math.max(options.maxTokens + 2048, 4096)
          : 4096,
      },
    };

    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }
    // When orchestrator's final synthesis explicitly passes toolConfig:NONE,
    // attach it verbatim so Gemini is forced into text-only mode. Without this,
    // a payload with NO `tools` key but WITH prior functionCall history may still
    // return functionCalls (observed: sentinel sweep final turn returned
    // get_health_status + get_ai_guard_rejections with thoughtSignature despite
    // no tools in payload). This is not (a) instance state nor (b) formatMessages
    // nor (c) singleton cache — provider-factory returns new instances and
    // GeminiProvider has no tools field; formatMessages only builds contents.
    if (options?.toolConfig) {
      payload.toolConfig = options.toolConfig;
    }

    const res = await this.fetchWithTimeout(
      `/models/${model}:generateContent`,
      payload,
      timeoutMs
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(
        `Gemini API responded with status ${res.status}: ${errorText}`
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{ text?: string; thought?: boolean; functionCall?: { name: string } }>;
        };
        finishReason?: string;
      }>;
      usageMetadata?: {
        thoughtsTokenCount?: number;
        candidatesTokenCount?: number;
        totalTokenCount?: number;
      };
    };

    const candidate = data.candidates?.[0];
    // Detect unexpected functionCalls on a supposedly text-only turn (e.g. final
    // synthesis with toolConfig:NONE that still returned get_health_status).
    // We deliberately surface this — previous code silently mapped it to "" and
    // the orchestrator fallback masked it as success:true with deterministic text.
    const leakedFunctionCalls = candidate?.content?.parts?.filter((p) => !!p.functionCall).map((p) => p.functionCall?.name) ?? [];
    if (leakedFunctionCalls.length > 0) {
      console.warn(`[gemini] generateText received ${leakedFunctionCalls.length} functionCall(s) despite ${options?.toolConfig ? 'toolConfig:' + JSON.stringify(options.toolConfig) : 'no tools'} — treating as empty text (model tried to call ${leakedFunctionCalls.join(', ')})`, {
        leakedFunctionCalls,
        finishReason: candidate?.finishReason,
        usageMetadata: (data as { usageMetadata?: unknown }).usageMetadata,
        rawSnippet: JSON.stringify(data).slice(0, 1200),
      });
    }
    // Filter out thought parts (thinking-model internal reasoning) before
    // joining — only non-thought parts contain the intended response text.
    const text =
      candidate?.content?.parts
        ?.filter((p) => !p.thought && !p.functionCall)
        ?.map((p) => p.text || '')
        .join('')
        .trim() || '';

    let finishReason: AIGenerateResult['finishReason'] = 'stop';
    if (candidate?.finishReason === 'MAX_TOKENS') finishReason = 'length';
    if (candidate?.finishReason === 'SAFETY') finishReason = 'error';
    // Preserve tool-call signal for callers that want to decide (orchestrator logs it)
    if (leakedFunctionCalls.length > 0) finishReason = 'tool_calls';

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
    const { systemInstruction, contents } = this.formatMessages(
      prompt,
      options?.systemPrompt
    );
    const timeoutMs = options?.timeoutMs || 15000;

    const payload: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: options?.temperature ?? 0.7,
        maxOutputTokens: options?.maxTokens
          ? Math.max(options.maxTokens + 2048, 4096)
          : 4096,
      },
    };

    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    const res = await this.fetchWithTimeout(
      `/models/${model}:streamGenerateContent?alt=sse`,
      payload,
      timeoutMs
    );

    if (!res.ok || !res.body) {
      throw new Error(
        `Gemini streaming error: API returned HTTP status ${res.status}`
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
                try {
                  const parsed = JSON.parse(dataStr) as {
                    candidates?: Array<{
                      content?: {
                        parts?: Array<{ text?: string; thought?: boolean }>;
                      };
                    }>;
                  };

                  const textChunk =
                    parsed.candidates?.[0]?.content?.parts
                      ?.filter((p) => !p.thought)
                      ?.map((p) => p.text || '')
                      .join('') || '';

                  if (textChunk) {
                    controller.enqueue(encoder.encode(textChunk));
                  }
                } catch {
                  // Ignore JSON parse error in individual SSE event
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
    const { systemInstruction, contents } = this.formatMessages(
      prompt,
      options?.systemPrompt
    );
    const timeoutMs = options?.timeoutMs || 15000;

    const formattedTools = [
      {
        functionDeclarations: tools.map((t) => ({
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        })),
      },
    ];

    const payload: Record<string, unknown> = {
      contents,
      tools: formattedTools,
      generationConfig: {
        temperature: options?.temperature ?? 0.2,
      },
    };

    if (systemInstruction) {
      payload.systemInstruction = systemInstruction;
    }

    const res = await this.fetchWithTimeout(
      `/models/${model}:generateContent`,
      payload,
      timeoutMs
    );

    if (!res.ok) {
      const errorText = await res.text().catch(() => res.statusText);
      throw new Error(
        `Gemini tool call responded with status ${res.status}: ${errorText}`
      );
    }

    const data = (await res.json()) as {
      candidates?: Array<{
        content?: {
          parts?: Array<{
            text?: string;
            thoughtSignature?: string;
            functionCall?: {
              name: string;
              args: Record<string, unknown>;
            };
          }>;
        };
      }>;
    };

    const parts = data.candidates?.[0]?.content?.parts || [];
    let text: string | undefined;
    const toolCalls: AIToolCall[] = [];

    parts.forEach((part, index) => {
      if (part.text) {
        text = (text ? `${text}\n` : '') + part.text;
      }
      if (part.functionCall) {
        const sig = (part as { thoughtSignature?: string }).thoughtSignature;
        if (!sig) {
          console.warn(`[gemini] Received functionCall "${part.functionCall.name}" without thoughtSignature — will fail on replay for Gemini 3`);
        }
        toolCalls.push({
          id: `call_gemini_${Date.now()}_${index}`,
          type: 'function',
          function: {
            name: part.functionCall.name,
            arguments: JSON.stringify(part.functionCall.args || {}),
          },
          thoughtSignature: sig,
        });
      }
    });

    return {
      text,
      toolCalls,
      finishReason: toolCalls.length > 0 ? 'tool_calls' : 'stop',
    };
  }
}
