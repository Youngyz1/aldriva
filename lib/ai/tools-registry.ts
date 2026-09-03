/**
 * lib/ai/tools-registry.ts
 *
 * Central registry mapping tool definitions to their executor functions.
 * All tools in this registry call screenToolResult() internally to guarantee
 * that safe column allowlisting and output-guard filtering are applied.
 */

import { AIToolDefinition } from './types';
import {
  getUpcomingEventsDefinition,
  getUpcomingEvents,
} from './tools/get_upcoming_events';
import {
  getActiveFundraisersDefinition,
  getActiveFundraisers,
} from './tools/get_active_fundraisers';
import {
  getFeaturedBusinessesDefinition,
  getFeaturedBusinesses,
} from './tools/get_featured_businesses';
import {
  getRecentArticlesDefinition,
  getRecentArticles,
} from './tools/get_recent_articles';
import {
  getAvailableProductsDefinition,
  getAvailableProducts,
} from './tools/get_available_products';
import {
  getContentHistoryDefinition,
  getContentHistory,
} from './tools/get_content_history';
import {
  fetchUrlSummaryDefinition,
  fetchUrlSummary,
} from './tools/fetch_url_summary';
import {
  fetchRssFeedDefinition,
  fetchRssFeed,
} from './tools/fetch_rss_feed';
import {
  searchTrendsDefinition,
  searchTrends,
} from './tools/search_trends';
import { checkGuardAuditHealth } from './input-guard';

export const ALL_AI_TOOL_DEFINITIONS: AIToolDefinition[] = [
  getUpcomingEventsDefinition,
  getActiveFundraisersDefinition,
  getFeaturedBusinessesDefinition,
  getRecentArticlesDefinition,
  getAvailableProductsDefinition,
  getContentHistoryDefinition,
  fetchUrlSummaryDefinition,
  fetchRssFeedDefinition,
  searchTrendsDefinition,
];

export async function executeAITool(name: string, argsJSON: string): Promise<unknown> {
  // Non-blocking sanity check on first tool execution
  checkGuardAuditHealth().catch(() => {});

  let parsedArgs = {};
  try {
    if (argsJSON) {
      parsedArgs = JSON.parse(argsJSON);
    }
  } catch (err) {
    console.warn(`[tools-registry] Failed to parse JSON args for tool ${name}:`, err);
  }

  switch (name) {
    case 'get_upcoming_events':
      return await getUpcomingEvents(parsedArgs);
    case 'get_active_fundraisers':
      return await getActiveFundraisers(parsedArgs);
    case 'get_featured_businesses':
      return await getFeaturedBusinesses(parsedArgs);
    case 'get_recent_articles':
      return await getRecentArticles(parsedArgs);
    case 'get_available_products':
      return await getAvailableProducts(parsedArgs);
    case 'get_content_history':
      return await getContentHistory(parsedArgs);
    case 'fetch_url_summary':
      return await fetchUrlSummary(parsedArgs);
    case 'fetch_rss_feed':
      return await fetchRssFeed(parsedArgs);
    case 'search_trends':
      return await searchTrends(parsedArgs);
    default:
      throw new Error(`Unknown AI tool requested: "${name}"`);
  }
}
