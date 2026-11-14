/**
 * lib/active-business.ts
 *
 * Active business context resolver for multi-business tenant workspaces.
 * Documentation: docs/design/rental/architecture.md §2 (Decision 9)
 *
 * Resolves active business context for an organizer using the strict precedence order:
 *   1. Explicit URL parameter: ?business=<business_id>
 *   2. Persisted browser cookie: aldriva_active_business_<org_id>
 *   3. Tenant default: row with is_main = true, or oldest business row (earliest created_at, then id)
 */

export interface BaseBusinessRow {
  id: string;
  name?: string | null;
  slug?: string | null;
  status?: string | null;
  industry?: string | null;
  category?: string | null;
  business_type?: string | null;
  offerings?: unknown;
  logo?: string | null;
  country?: string | null;
  is_main?: boolean | null;
  created_at?: string | null;
}

export function getActiveBusinessCookieName(organizerId: string): string {
  return `aldriva_active_business_${organizerId}`;
}

export interface ResolveActiveBusinessOptions {
  searchParamBusinessId?: string | null;
  cookieBusinessId?: string | null;
}

/**
 * Deterministically resolves the active business record from eligible business candidates.
 */
export function resolveActiveBusiness<T extends BaseBusinessRow>(
  eligibleBusinesses: readonly T[] | null | undefined,
  options?: ResolveActiveBusinessOptions
): T | null {
  if (!eligibleBusinesses || eligibleBusinesses.length === 0) {
    return null;
  }
  if (eligibleBusinesses.length === 1) {
    return eligibleBusinesses[0];
  }

  // 1. Search param: ?business=<id>
  if (options?.searchParamBusinessId) {
    const matched = eligibleBusinesses.find(
      (b) => b.id === options.searchParamBusinessId
    );
    if (matched) return matched;
  }

  // 2. Persisted cookie: aldriva_active_business_<org_id>
  if (options?.cookieBusinessId) {
    const matched = eligibleBusinesses.find(
      (b) => b.id === options.cookieBusinessId
    );
    if (matched) return matched;
  }

  // 3. Tenant default: is_main = true
  const main = eligibleBusinesses.find((b) => b.is_main === true);
  if (main) return main;

  // 4. Stable fallback: oldest created_at, then lexicographical id
  const sorted = [...eligibleBusinesses].sort((a, b) => {
    if (a.created_at && b.created_at) {
      const diff = new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      if (diff !== 0) return diff;
    } else if (a.created_at && !b.created_at) {
      return -1;
    } else if (!a.created_at && b.created_at) {
      return 1;
    }
    return a.id.localeCompare(b.id);
  });

  return sorted[0];
}
