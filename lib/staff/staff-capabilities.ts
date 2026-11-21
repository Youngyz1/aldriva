/**
 * lib/staff/staff-capabilities.ts
 *
 * UI-only button visibility for the staff pages. RLS on staff_members is the
 * real gate; this mirrors it so people are not shown buttons the database
 * will refuse. Pure functions, no server-only imports, so node:test can load
 * this file.
 *
 * Mirrors the staff_members policies:
 * - create/update: head office, a branch manager (own branch), self (update),
 *   or a staff-layer actor holding workforce.update AND workforce.view at the
 *   row's branch (migration 250; an UPDATE needs the row visible, so view is
 *   required too). A NULL-branch row needs the business-wide answer.
 * - delete: head office only
 * - deactivate: same reach as edit, never on your own row (241 self-edit guard)
 * The 251 rank guard cannot be mirrored here; the database still refuses.
 */

export type StaffReach = {
  /** staff_has_permission(business, key, NULL): business-wide. */
  all: boolean;
  /** Branch ids where staff_has_permission(business, key, branch) is true. */
  branches: string[];
};

export type StaffUiReach = {
  update: StaffReach;
  view: StaffReach;
};

export type StaffUiCapabilities = {
  /** Entity owner/admin/manager, or businesses.owner_id. */
  headOffice: boolean;
  /** Branch the caller manages through a seeded manager role, else null. */
  managedBranchId: string | null;
  /** The caller's own active staff row in this business, else null. */
  myStaffId: string | null;
  /** Staff-layer permission reach (250). Empty when not computed: fails closed. */
  reach: StaffUiReach;
  canAdd: boolean;
  canDelete: boolean;
};

type RowLike = { id: string; branch_id: string | null };

const NO_REACH: StaffReach = { all: false, branches: [] };

function reaches(reach: StaffReach, branchId: string | null): boolean {
  if (reach.all) return true;
  return branchId !== null && reach.branches.includes(branchId);
}

function staffLayerWrite(caps: StaffUiCapabilities, branchId: string | null): boolean {
  return reaches(caps.reach.update, branchId) && reaches(caps.reach.view, branchId);
}

function staffLayerCanAdd(reach: StaffUiReach): boolean {
  const updateAny = reach.update.all || reach.update.branches.length > 0;
  if (!updateAny) return false;
  if (reach.view.all) return true;
  if (reach.update.all) return reach.view.branches.length > 0;
  return reach.update.branches.some((b) => reach.view.branches.includes(b));
}

export function buildStaffUiCapabilities(input: {
  headOffice: boolean;
  managedBranchId: string | null;
  myStaffId: string | null;
  reach?: StaffUiReach;
}): StaffUiCapabilities {
  const { headOffice, managedBranchId, myStaffId } = input;
  const reach: StaffUiReach = input.reach ?? { update: NO_REACH, view: NO_REACH };
  return {
    headOffice,
    managedBranchId,
    myStaffId,
    reach,
    canAdd: headOffice || managedBranchId !== null || staffLayerCanAdd(reach),
    canDelete: headOffice,
  };
}

export function canEditRow(caps: StaffUiCapabilities, row: RowLike): boolean {
  if (caps.headOffice) return true;
  if (caps.myStaffId !== null && row.id === caps.myStaffId) return true;
  if (caps.managedBranchId !== null && row.branch_id === caps.managedBranchId) return true;
  return staffLayerWrite(caps, row.branch_id);
}

export function canDeactivateRow(caps: StaffUiCapabilities, row: RowLike): boolean {
  if (caps.headOffice) return true;
  if (caps.myStaffId !== null && row.id === caps.myStaffId) return false;
  if (caps.managedBranchId !== null && row.branch_id === caps.managedBranchId) return true;
  return staffLayerWrite(caps, row.branch_id);
}
