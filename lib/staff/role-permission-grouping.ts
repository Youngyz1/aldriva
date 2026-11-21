/**
 * lib/staff/role-permission-grouping.ts
 *
 * Pure helpers for the Roles & Permissions screen and the staff-profile
 * role-assignment panel: no I/O, no server-only imports, loads in node:test
 * via the same require.extensions[".ts"] harness used elsewhere in lib/staff.
 */

export type PermissionRow = {
  key: string;
  description: string | null;
  domain: string;
};

export type PermissionDomainGroup = {
  domain: string;
  permissions: PermissionRow[];
};

// Mirrors the 5 domains seeded in migration_231 (staff_permissions.domain
// CHECK IN (...)) -- fixed display order, with any future/unknown domain
// appended alphabetically after these rather than dropped.
const DOMAIN_ORDER = [
  "staff_management",
  "role_management",
  "scheduling",
  "assignment_management",
  "reporting",
] as const;

export function groupPermissionsByDomain(permissions: readonly PermissionRow[]): PermissionDomainGroup[] {
  const byDomain = new Map<string, PermissionRow[]>();
  for (const permission of permissions) {
    const list = byDomain.get(permission.domain) ?? [];
    list.push(permission);
    byDomain.set(permission.domain, list);
  }

  const domains = [...byDomain.keys()].sort((a, b) => {
    const indexA = DOMAIN_ORDER.indexOf(a as (typeof DOMAIN_ORDER)[number]);
    const indexB = DOMAIN_ORDER.indexOf(b as (typeof DOMAIN_ORDER)[number]);
    if (indexA === -1 && indexB === -1) return a.localeCompare(b);
    if (indexA === -1) return 1;
    if (indexB === -1) return -1;
    return indexA - indexB;
  });

  return domains.map((domain) => ({
    domain,
    permissions: [...byDomain.get(domain)!].sort((a, b) => a.key.localeCompare(b.key)),
  }));
}

// The 3 platform role names staff_guard_privileged_role (migration_231,
// line 1302-1330) blocks a non-organizer-level actor from assigning. A
// branch-manager caller (assertCanAccessBusinessStaffArea's scope: "staff")
// can still technically submit one of these -- the DB trigger is the real
// gate -- but the UI disables the option up front with a short reason
// rather than letting the request round-trip just to be rejected.
const PRIVILEGED_PLATFORM_ROLES = ["owner", "admin", "manager"] as const;

export function isPrivilegedPlatformRole(platformRole: string | null): boolean {
  return platformRole !== null && (PRIVILEGED_PLATFORM_ROLES as readonly string[]).includes(platformRole);
}

export function isRoleOptionDisabledForCaller(
  platformRole: string | null,
  callerScope: "organizer" | "staff"
): boolean {
  return callerScope === "staff" && isPrivilegedPlatformRole(platformRole);
}
