/**
 * lib/ai/provider-factory.ts
 * Factory function to retrieve the configured AIProvider instance.
 * Supports switching between 'gemini' (default) and 'openrouter'.
 *
 * Stage 14 boundary — SHARED by AI Studio and AI Workforce (provider is one
 * of the five shareable layers: provider, tools, knowledge, runtime, guards).
 */

import { AIProvider } from './types';
import { GeminiProvider } from './providers/gemini';
import { OpenRouterProvider } from './providers/openrouter';

export type ProviderId = 'gemini' | 'openrouter';

export function getAIProvider(overrideProviderId?: string): AIProvider {
  const selected = (
    overrideProviderId ||
    process.env.AI_PROVIDER_DEFAULT ||
    'gemini'
  ).toLowerCase();

  switch (selected) {
    case 'openrouter':
      return new OpenRouterProvider();
    case 'gemini':
    default:
      return new GeminiProvider();
  }
}

