/**
 * lib/ai/search-provider.ts
 *
 * Pluggable web search provider abstraction.
 * Provides a unified interface for external search APIs (Tavily, Brave)
 * with graceful degradation when search API keys are not configured.
 */

export interface SearchResultItem {
  title: string;
  url: string;
  content: string;
  publishedDate?: string;
  score?: number;
}

export interface SearchOptions {
  maxResults?: number;
  searchDepth?: 'basic' | 'advanced';
  includeDomains?: string[];
  excludeDomains?: string[];
}

export interface SearchResponse {
  success: boolean;
  configured: boolean;
  query: string;
  results: SearchResultItem[];
  provider: string;
  message?: string;
  error?: string;
}

export interface ISearchProvider {
  readonly name: string;
  isConfigured(): boolean;
  search(query: string, options?: SearchOptions): Promise<SearchResponse>;
}

/**
 * Tavily Search Provider
 * Simple JSON POST endpoint designed for LLM agent search and extraction.
 */
export class TavilySearchProvider implements ISearchProvider {
  readonly name = 'tavily';
  private apiKey: string;
  private endpoint = 'https://api.tavily.com/search';

  constructor(apiKey?: string) {
    this.apiKey =
      apiKey ||
      process.env.TAVILY_API_KEY ||
      process.env.TAVILY_API_KEY ||
      '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        configured: false,
        query,
        results: [],
        provider: this.name,
        message:
          'Live search is not configured. Set TAVILY_API_KEY (or TAVILY_API_KEY) in environment variables to enable live web search.',
      };
    }

    const maxResults = Math.min(Math.max(Number(options?.maxResults) || 5, 1), 10);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const payload: Record<string, unknown> = {
        api_key: this.apiKey,
        query,
        max_results: maxResults,
        search_depth: options?.searchDepth || 'basic',
        include_answer: false,
      };

      if (options?.includeDomains && options.includeDomains.length > 0) {
        payload.include_domains = options.includeDomains;
      }
      if (options?.excludeDomains && options.excludeDomains.length > 0) {
        payload.exclude_domains = options.excludeDomains;
      }

      const res = await fetch(this.endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        return {
          success: false,
          configured: true,
          query,
          results: [],
          provider: this.name,
          error: `Tavily search API returned HTTP ${res.status}: ${errText.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as {
        results?: Array<{
          title?: string;
          url?: string;
          content?: string;
          published_date?: string;
          score?: number;
        }>;
      };

      const results: SearchResultItem[] = (data.results || []).map((r) => ({
        title: r.title || 'Untitled Result',
        url: r.url || '',
        content: r.content || '',
        publishedDate: r.published_date,
        score: r.score,
      }));

      return {
        success: true,
        configured: true,
        query,
        results,
        provider: this.name,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const errMsg = isAbort ? 'Search request timed out after 12s' : (err instanceof Error ? err.message : String(err));
      return {
        success: false,
        configured: true,
        query,
        results: [],
        provider: this.name,
        error: `Search failed: ${errMsg}`,
      };
    }
  }
}

/**
 * Brave Search Provider
 * Alternative search backend using the Brave Search API.
 */
export class BraveSearchProvider implements ISearchProvider {
  readonly name = 'brave';
  private apiKey: string;
  private endpoint = 'https://api.search.brave.com/res/v1/web/search';

  constructor(apiKey?: string) {
    this.apiKey =
      apiKey ||
      process.env.BRAVE_TAVILY_API_KEY ||
      '';
  }

  isConfigured(): boolean {
    return Boolean(this.apiKey && this.apiKey.trim().length > 0);
  }

  async search(query: string, options?: SearchOptions): Promise<SearchResponse> {
    if (!this.isConfigured()) {
      return {
        success: false,
        configured: false,
        query,
        results: [],
        provider: this.name,
        message:
          'Brave search is not configured. Set BRAVE_TAVILY_API_KEY in environment variables to enable Brave web search.',
      };
    }

    const count = Math.min(Math.max(Number(options?.maxResults) || 5, 1), 10);
    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), 12000);

    try {
      const url = new URL(this.endpoint);
      url.searchParams.set('q', query);
      url.searchParams.set('count', String(count));

      const res = await fetch(url.toString(), {
        method: 'GET',
        headers: {
          Accept: 'application/json',
          'X-Subscription-Token': this.apiKey,
        },
        signal: controller.signal,
      });

      clearTimeout(timeoutId);

      if (!res.ok) {
        const errText = await res.text().catch(() => res.statusText);
        return {
          success: false,
          configured: true,
          query,
          results: [],
          provider: this.name,
          error: `Brave search API returned HTTP ${res.status}: ${errText.slice(0, 200)}`,
        };
      }

      const data = (await res.json()) as {
        web?: {
          results?: Array<{
            title?: string;
            url?: string;
            description?: string;
            page_age?: string;
          }>;
        };
      };

      const results: SearchResultItem[] = (data.web?.results || []).map((r) => ({
        title: r.title || 'Untitled Result',
        url: r.url || '',
        content: r.description || '',
        publishedDate: r.page_age,
      }));

      return {
        success: true,
        configured: true,
        query,
        results,
        provider: this.name,
      };
    } catch (err: unknown) {
      clearTimeout(timeoutId);
      const isAbort = err instanceof Error && err.name === 'AbortError';
      const errMsg = isAbort ? 'Search request timed out after 12s' : (err instanceof Error ? err.message : String(err));
      return {
        success: false,
        configured: true,
        query,
        results: [],
        provider: this.name,
        error: `Search failed: ${errMsg}`,
      };
    }
  }
}

/**
 * Factory function to retrieve the configured search provider.
 * Default priority: Tavily (TAVILY_API_KEY / TAVILY_API_KEY), then Brave.
 */
export function getSearchProvider(providerName?: string): ISearchProvider {
  const selected = (providerName || process.env.SEARCH_PROVIDER || 'tavily').toLowerCase();
  switch (selected) {
    case 'brave':
      return new BraveSearchProvider();
    case 'tavily':
    default:
      return new TavilySearchProvider();
  }
}
