/**
 * lib/staff/staff-capabilities.ts
 *
 * UI-only button visibility for the staff pages. RLS on staff_members is the
 * real gate; this mirrors it so people are not shown buttons the database
 * will refuse. Pure functions, no server-only imports, so node:test can load
 * this file.
 *
 * Mirrors the staff_members policies:
 * - create/update: head office, a branch manager (own branch), or self (update)
 * - delete: head office only
 */

export type StaffUiCapabilities = {
  /** Entity owner/admin/manager, or businesses.owner_id. */
  headOffice: boolean;
  /** Branch the caller manages through a seeded manager role, else null. */
  managedBranchId: string | null;
  /** The caller's own active staff row in this business, else null. */
  myStaffId: string | null;
  canAdd: boolean;
  canDelete: boolean;
};

type RowLike = { id: string; branch_id: string | null };

export function buildStaffUiCapabilities(input: {
  headOffice: boolean;
  managedBranchId: string | null;
  myStaffId: string | null;
}): StaffUiCapabilities {
  const { headOffice, managedBranchId, myStaffId } = input;
  return {
    headOffice,
    managedBranchId,
    myStaffId,
    canAdd: headOffice || managedBranchId !== null,
    canDelete: headOffice,
  };
}

export function canEditRow(caps: StaffUiCapabilities, row: RowLike): boolean {
  if (caps.headOffice) return true;
  if (caps.myStaffId !== null && row.id === caps.myStaffId) return true;
  return caps.managedBranchId !== null && row.branch_id === caps.managedBranchId;
}

export function canDeactivateRow(caps: StaffUiCapabilities, row: RowLike): boolean {
  if (caps.headOffice) return true;
  if (caps.myStaffId !== null && row.id === caps.myStaffId) return false;
  return caps.managedBranchId !== null && row.branch_id === caps.managedBranchId;
}