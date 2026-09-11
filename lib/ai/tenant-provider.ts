/**
 * lib/ai/tenant-provider.ts
 *
 * Phase E provider router. WRAPS lib/ai/provider-factory.ts's
 * getAIProvider() — it never replaces it and never constructs provider
 * SDK clients directly.
 *
 * 'aldriva' as a provider value resolves internally to the existing
 * gemini/openrouter selection logic: first the tenant's active
 * ai_provider_configs row (if the tenant set one), else the platform
 * default (AI_PROVIDER_DEFAULT env / 'gemini').
 */

import { createSupabaseAdmin } from '@/lib/supabase-admin';
import { AIProvider } from './types';
import { getAIProvider } from './provider-factory';

export type TenantProviderSelection = 'gemini' | 'openrouter' | 'aldriva';

/**
 * Reads the tenant's preferred provider from ai_provider_configs.
 * Returns null when the tenant has no active config (caller falls back
 * to the platform default). Fail-open to default on DB errors — provider
 * routing is not an authorization decision.
 */
export async function resolveTenantProvider(
  tenantId: string | null | undefined
): Promise<string | null> {
  if (!tenantId) return null;
  try {
    const { data } = await createSupabaseAdmin()
      .from('ai_provider_configs')
      .select('provider')
      .eq('tenant_id', tenantId)
      .eq('status', 'active')
      .order('created_at', { ascending: true })
      .limit(1)
      .maybeSingle();
    const provider = (data as { provider?: string } | null)?.provider;
    if (provider === 'gemini' || provider === 'openrouter' || provider === 'aldriva') {
      return provider;
    }
    return null;
  } catch {
    return null;
  }
}

/**
 * Tenant-aware provider accessor. Wraps getAIProvider():
 * - explicit 'gemini'/'openrouter' -> passed straight through.
 * - 'aldriva' (or omitted with a tenantId) -> tenant config, then
 *   platform default, resolved THROUGH getAIProvider() so the gemini /
 *   openrouter selection logic stays in exactly one place.
 */
export async function getTenantAIProvider(
  tenantId?: string | null,
  overrideProviderId?: string
): Promise<AIProvider> {
  const requested = (overrideProviderId ?? '').toLowerCase();
  if (requested === 'gemini' || requested === 'openrouter') {
    return getAIProvider(requested);
  }
  if (requested && requested !== 'aldriva') {
    // Unknown provider values fall back to the platform default. This is
    // fail-OPEN by design: provider routing is not an authorization
    // decision (it cannot leak data or escalate privilege), so degrading
    // to the default beats failing the whole AI call.
    return getAIProvider();
  }
  const tenantProvider = await resolveTenantProvider(tenantId);
  if (tenantProvider === 'gemini' || tenantProvider === 'openrouter') {
    return getAIProvider(tenantProvider);
  }
  // 'aldriva' stored config, no config, or DB error: platform default.
  return getAIProvider();
}
