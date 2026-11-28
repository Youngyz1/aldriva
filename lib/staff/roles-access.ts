/**
 * lib/staff/roles-access.ts
 *
 * Pure rule for the Roles & Permissions screen. Mirrors the database:
 * - write (staff_roles 256, staff_role_permissions 257): head office
 *   (entity owner/admin/manager or businesses.owner_id) or a staff-layer
 *   actor holding workforce.roles.manage business-wide.
 * - read of custom-role keys (257 + old entity read policy): the above, or any
 *   organizer-level member, or workforce.roles.view.
 * Entity editors are organizer scope but can NOT write.
 */
export function resolveRolesAccess(input: {
  organizerScope: boolean;
  headOffice: boolean;
  hasManage: boolean;
  hasView: boolean;
}): { canManage: boolean; canView: boolean } {
  const canManage = input.headOffice || input.hasManage;
  const canView = canManage || input.organizerScope || input.hasView;
  return { canManage, canView };
}
