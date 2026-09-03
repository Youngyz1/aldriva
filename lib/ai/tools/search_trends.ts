/**
 * lib/ai/tools/search_trends.ts
 *
 * Tier B Research Tool: Wraps the pluggable SearchProvider to query external web search APIs,
 * runs per-result prompt injection screening using input-guard on every snippet and title,
 * and wraps clean results in structural untrusted data delimiters.
 *
 * Gracefully degrades with an explicit message if search API keys are not configured.
 */

import { AIToolDefinition } from '../types';
import { getSearchProvider, SearchResultItem } from '../search-provider';
import { screenUntrustedInput, wrapInUntrustedContainer } from '../input-guard';

export const searchTrendsDefinition: AIToolDefinition = {
  name: 'search_trends',
  description:
    'Searches the live web for industry trends, news, and market intelligence. ' +
    'Screens all external snippets for prompt injections before returning quarantined results. ' +
    'Degrades gracefully if search API keys are not configured.',
  parameters: {
    type: 'object',
    properties: {
      query: {
        type: 'string',
        description: 'The search query (e.g. "community nonprofit fundraising trends Nigeria 2026").',
      },
      maxResults: {
        type: 'number',
        description: 'Maximum number of search results to return (default: 5, max: 10).',
      },
    },
    required: ['query'],
  },
};

export interface ScreenedSearchResult {
  title: string;
  url: string;
  snippet: string;
  publishedDate?: string;
  verdict: 'pass' | 'flagged' | 'rejected';
  flagReason?: string;
}

export interface SearchTrendsArgs {
  query?: string;
  maxResults?: number;
}

export interface SearchTrendsResult {
  success: boolean;
  configured: boolean;
  query: string;
  provider?: string;
  resultCount?: number;
  flaggedCount?: number;
  results?: ScreenedSearchResult[];
  quarantinedContent?: string;
  message?: string;
  error?: string;
}

export async function searchTrends(
  args: SearchTrendsArgs
): Promise<SearchTrendsResult> {
  const query = args.query?.trim();
  const maxResults = Math.min(Math.max(Number(args.maxResults) || 5, 1), 10);

  if (!query) {
    return {
      success: false,
      configured: true,
      query: '',
      error: 'A search query string is required.',
    };
  }

  const provider = getSearchProvider();

  // Graceful degradation when search provider is unconfigured
  if (!provider.isConfigured()) {
    return {
      success: false,
      configured: false,
      query,
      provider: provider.name,
      message:
        'Live search is not configured. Set TAVILY_API_KEY (or TAVILY_API_KEY) in environment variables to enable live web search.',
    };
  }

  try {
    const searchRes = await provider.search(query, { maxResults });

    if (!searchRes.success) {
      return {
        success: false,
        configured: searchRes.configured,
        query,
        provider: searchRes.provider,
        message: searchRes.message,
        error: searchRes.error,
      };
    }

    // Per-result prompt injection screening
    const screenedResults: ScreenedSearchResult[] = [];
    let flaggedCount = 0;

    for (const raw of searchRes.results) {
      const titleGuard = screenUntrustedInput(
        raw.title,
        raw.url,
        'input-guard.search_trends'
      );
      const snippetGuard = screenUntrustedInput(
        raw.content,
        raw.url,
        'input-guard.search_trends'
      );

      const isFlagged = titleGuard.verdict === 'flagged' || snippetGuard.verdict === 'flagged';
      if (isFlagged) {
        flaggedCount++;
      }

      screenedResults.push({
        title: titleGuard.sanitizedText || raw.title,
        url: raw.url,
        publishedDate: raw.publishedDate,
        snippet: snippetGuard.sanitizedText || raw.content.slice(0, 400),
        verdict: isFlagged ? 'flagged' : 'pass',
        flagReason: titleGuard.reason || snippetGuard.reason || undefined,
      });
    }

    // Format screened results into structural untrusted container
    const formattedList = screenedResults
      .map((item, index) => {
        const flagNote = item.verdict === 'flagged' ? ' [FLAGGED & SANITIZED]' : '';
        const lines = [
          `Result ${index + 1}: ${item.title}${flagNote}`,
          item.publishedDate ? `Date: ${item.publishedDate}` : '',
          item.url ? `URL: ${item.url}` : '',
          `Snippet: ${item.snippet}`,
        ].filter(Boolean);
        return lines.join('\n');
      })
      .join('\n\n---\n\n');

    const quarantinedContent = wrapInUntrustedContainer(
      formattedList,
      `web-search:${provider.name}?q=${encodeURIComponent(query)}`
    );

    return {
      success: true,
      configured: true,
      query,
      provider: searchRes.provider,
      resultCount: screenedResults.length,
      flaggedCount,
      results: screenedResults,
      quarantinedContent,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : String(err);
    console.error(`[search_trends] Search execution error for query "${query}":`, message);
    return {
      success: false,
      configured: true,
      query,
      error: `Search execution error: ${message}`,
    };
  }
}
