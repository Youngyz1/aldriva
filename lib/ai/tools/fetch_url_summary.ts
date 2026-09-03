/**
 * lib/ai/tools/fetch_url_summary.ts
 *
 * Tier A Research Tool: Fetches public web pages safely via SSRF guard,
 * screens untrusted content for prompt injections via input-guard,
 * and returns the quarantined content wrapped in structural delimiters.
 *
 * // [V3 HOOK] Per-user rate limiting and domain policy can be added here.
 */

import { AIToolDefinition } from '../types';
import { safeFetchHtml, SsrfBlockedError } from '@/lib/ssrf-guard';
import { screenUntrustedInput, wrapInUntrustedContainer } from '../input-guard';

export const fetchUrlSummaryDefinition: AIToolDefinition = {
  name: 'fetch_url_summary',
  description:
    'Fetches public web content from a specified URL, runs SSRF security checks, ' +
    'screens for prompt injection attacks, and returns the quarantined content for summarization.',
  parameters: {
    type: 'object',
    properties: {
      url: {
        type: 'string',
        description: 'The full public http or https web URL to fetch and analyze.',
      },
    },
    required: ['url'],
  },
};

export interface FetchUrlSummaryArgs {
  url?: string;
}

export interface FetchUrlSummaryResult {
  success: boolean;
  url: string;
  quarantinedContent?: string;
  verdict?: string;
  reason?: string;
  error?: string;
}

export async function fetchUrlSummary(
  args: FetchUrlSummaryArgs
): Promise<FetchUrlSummaryResult> {
  const rawUrl = args.url?.trim();

  if (!rawUrl) {
    return {
      success: false,
      url: '',
      error: 'A valid URL parameter is required.',
    };
  }

  // [V3 HOOK] Check requesting user domain allowlist or per-user request limits here.

  try {
    // 1. SSRF Guard fetch: validates DNS, IP blocks, manual redirects, and byte caps
    const fetchResult = await safeFetchHtml(rawUrl);

    // 2. Input Guard: DOM extraction, script stripping, injection pattern screening
    const guardResult = screenUntrustedInput(
      fetchResult.body,
      fetchResult.finalUrl,
      'input-guard.fetch_url_summary'
    );

    // 3. Wrap in structural untrusted delimiter container
    const quarantinedContent = wrapInUntrustedContainer(
      guardResult.sanitizedText,
      fetchResult.finalUrl
    );

    return {
      success: true,
      url: fetchResult.finalUrl,
      quarantinedContent,
      verdict: guardResult.verdict,
      reason: guardResult.reason,
    };
  } catch (err: unknown) {
    if (err instanceof SsrfBlockedError) {
      console.warn(`[fetch_url_summary] SSRF Blocked for URL "${rawUrl}":`, err.message);
      return {
        success: false,
        url: rawUrl,
        error: `Security Block: ${err.message}`,
        verdict: 'rejected',
      };
    }

    const message = err instanceof Error ? err.message : String(err);
    console.error(`[fetch_url_summary] Fetch error for URL "${rawUrl}":`, message);
    return {
      success: false,
      url: rawUrl,
      error: `Failed to fetch URL content: ${message}`,
      verdict: 'rejected',
    };
  }
}
