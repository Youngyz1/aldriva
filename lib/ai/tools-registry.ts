/**
 * lib/ai/tools-registry.ts
 *
 * Central registry mapping tool definitions to their executor functions.
 * Read tools call screenToolResult() internally to guarantee safe column
 * allowlisting and output-guard filtering; transactional notification tools
 * screen their copy via screenModelOutput() instead (they return delivery
 * receipts, not DB rows). Tenant tools additionally require a
 * server-derived TenantContext — see executeTenantTool().
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
import type { TenantToolContext } from './tools/tenant/tool-context';
import { logToolInvocation } from './tools/tenant/tool-context';
import {
  searchEventsDefinition,
  getEventDefinition,
  getTicketAvailabilityDefinition,
  getTicketOrderStatusDefinition,
  searchEvents,
  getEvent,
  getTicketAvailability,
  getTicketOrderStatus,
} from './tools/tenant/tenant-events';
import {
  searchFundraisersDefinition,
  getFundraiserDefinition,
  getDonationStatusDefinition,
  searchFundraisers,
  getFundraiser,
  getDonationStatus,
} from './tools/tenant/tenant-fundraising';
import {
  searchProductsDefinition,
  getProductDefinition,
  getProductAvailabilityDefinition,
  getProductOrderStatusDefinition,
  searchProducts,
  getProduct,
  getProductAvailability,
  getProductOrderStatus,
} from './tools/tenant/tenant-products';
import {
  getPaymentStatusDefinition,
  getPaymentStatus,
} from './tools/tenant/tenant-payments';
import {
  createTenantNotificationDefinition,
  notifyOwnerDefinition,
  createTenantNotification,
  notifyOwner,
} from './tools/tenant/tenant-notifications';

/**
 * Tool scope tiers:
 * - public_read: catalog/fetch tools over public data (8 tools).
 * - admin: tools over admin-only tables (ai_content_items). Offer only on
 *   admin-gated routes — never on a public or tenant surface.
 * - tenant_scoped: business reads pinned to a server-derived tenant.
 * - transactional: side-effecting tools (notifications) via existing services.
 */
export const PUBLIC_AI_TOOL_DEFINITIONS = [
  { ...getUpcomingEventsDefinition, scope: 'public_read' as const },
  { ...getActiveFundraisersDefinition, scope: 'public_read' as const },
  { ...getFeaturedBusinessesDefinition, scope: 'public_read' as const },
  { ...getRecentArticlesDefinition, scope: 'public_read' as const },
  { ...getAvailableProductsDefinition, scope: 'public_read' as const },
  { ...fetchUrlSummaryDefinition, scope: 'public_read' as const },
  { ...fetchRssFeedDefinition, scope: 'public_read' as const },
  { ...searchTrendsDefinition, scope: 'public_read' as const },
];

/** Admin-only tools. Sole execution path: admin-gated routes via executeAITool. */
export const ADMIN_AI_TOOL_DEFINITIONS: AIToolDefinition[] = [
  getContentHistoryDefinition,
];

export const TENANT_AI_TOOL_DEFINITIONS = [
  searchEventsDefinition,
  getEventDefinition,
  getTicketAvailabilityDefinition,
  getTicketOrderStatusDefinition,
  searchFundraisersDefinition,
  getFundraiserDefinition,
  getDonationStatusDefinition,
  searchProductsDefinition,
  getProductDefinition,
  getProductAvailabilityDefinition,
  getProductOrderStatusDefinition,
  getPaymentStatusDefinition,
  createTenantNotificationDefinition,
  notifyOwnerDefinition,
];

const TENANT_TOOL_NAMES = new Set(TENANT_AI_TOOL_DEFINITIONS.map((d) => d.name));

export const ALL_AI_TOOL_DEFINITIONS: AIToolDefinition[] = [
  ...PUBLIC_AI_TOOL_DEFINITIONS,
  ...ADMIN_AI_TOOL_DEFINITIONS,
  ...TENANT_AI_TOOL_DEFINITIONS,
];

export async function executeAITool(name: string, argsJSON: string): Promise<unknown> {
  // Non-blocking sanity check on first tool execution
  checkGuardAuditHealth().catch(() => {});

  // Tenant-scoped / transactional tools require a server-derived tenant
  // context — fail closed rather than running them without one. Same
  // rejection shape as unknown tools.
  if (TENANT_TOOL_NAMES.has(name)) {
    throw new Error(
      `AI tool "${name}" requires a tenant context: call executeTenantTool() instead`
    );
  }

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

/**
 * Executes a tenant-scoped / transactional tool with a server-derived
 * TenantToolContext (from lib/tenant-context.ts). The context — never
 * caller args — supplies the authoritative tenant_id. Malformed args get
 * the exact same treatment as the 9 existing tools (warn + {} defaults);
 * invalid contexts fail closed with a NULL-tenant audit row.
 */
export async function executeTenantTool(
  name: string,
  ctx: TenantToolContext | null | undefined,
  argsJSON: string
): Promise<unknown> {
  checkGuardAuditHealth().catch(() => {});

  let parsedArgs: Record<string, never> = {};
  try {
    if (argsJSON) {
      parsedArgs = JSON.parse(argsJSON);
    }
  } catch (err) {
    console.warn(`[tools-registry] Failed to parse JSON args for tool ${name}:`, err);
  }

  if (!TENANT_TOOL_NAMES.has(name)) {
    throw new Error(`Unknown tenant AI tool requested: "${name}"`);
  }

  // Fail closed before dispatch: invalid context logs a NULL-tenant row.
  // Same UUID strictness as requireToolContext() — one gate, one strictness.
  if (
    !ctx ||
    typeof ctx.tenantId !== 'string' ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(ctx.tenantId) ||
    typeof ctx.userId !== 'string' ||
    ctx.userId.length === 0
  ) {
    logToolInvocation(null, null, name, parsedArgs, 'failed_closed', 'error', null, 'invalid tenant context');
    throw new Error(`[tools-registry] Access denied: invalid tenant context for tool "${name}"`);
  }

  switch (name) {
    case 'searchEvents':
      return await searchEvents(ctx, parsedArgs as Parameters<typeof searchEvents>[1]);
    case 'getEvent':
      return await getEvent(ctx, parsedArgs as Parameters<typeof getEvent>[1]);
    case 'getTicketAvailability':
      return await getTicketAvailability(ctx, parsedArgs as unknown as Parameters<typeof getTicketAvailability>[1]);
    case 'getTicketOrderStatus':
      return await getTicketOrderStatus(ctx, parsedArgs as unknown as Parameters<typeof getTicketOrderStatus>[1]);
    case 'searchFundraisers':
      return await searchFundraisers(ctx, parsedArgs as Parameters<typeof searchFundraisers>[1]);
    case 'getFundraiser':
      return await getFundraiser(ctx, parsedArgs as Parameters<typeof getFundraiser>[1]);
    case 'getDonationStatus':
      return await getDonationStatus(ctx, parsedArgs as unknown as Parameters<typeof getDonationStatus>[1]);
    case 'searchProducts':
      return await searchProducts(ctx, parsedArgs as Parameters<typeof searchProducts>[1]);
    case 'getProduct':
      return await getProduct(ctx, parsedArgs as Parameters<typeof getProduct>[1]);
    case 'getProductAvailability':
      return await getProductAvailability(ctx, parsedArgs as unknown as Parameters<typeof getProductAvailability>[1]);
    case 'getProductOrderStatus':
      return await getProductOrderStatus(ctx, parsedArgs as unknown as Parameters<typeof getProductOrderStatus>[1]);
    case 'getPaymentStatus':
      return await getPaymentStatus(ctx, parsedArgs as unknown as Parameters<typeof getPaymentStatus>[1]);
    case 'createNotification':
      return await createTenantNotification(ctx, parsedArgs as unknown as Parameters<typeof createTenantNotification>[1]);
    case 'notifyOwner':
      return await notifyOwner(ctx, parsedArgs as unknown as Parameters<typeof notifyOwner>[1]);
    default:
      throw new Error(`Unknown tenant AI tool requested: "${name}"`);
  }
}
