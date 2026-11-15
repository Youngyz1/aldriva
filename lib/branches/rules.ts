/**
 * lib/branches/rules.ts
 *
 * Pure guard rules for business_branches main/status transitions. No I/O,
 * no server-only imports, so this loads in node:test directly -- mirrors
 * lib/staff/errors.ts's split between pure logic and the "use server"
 * action file (lib/actions/business-branches.ts) that calls it.
 *
 * Returns { code, message } so the UI can translate by code (Workforce
 * namespace, err* keys) and fall back to the English message.
 */

export type BranchStatus = "active" | "archived";

export type BranchMainGuardInput = {
  currentIsMain: boolean;
  currentStatus: BranchStatus;
  /** input.is_main, if the caller is changing it this write; undefined = unchanged. */
  nextIsMain?: boolean;
  /** input.status, if the caller is changing it this write; undefined = unchanged. */
  nextStatus?: BranchStatus;
};

export type BranchGuardError = { code: string; message: string };

/**
 * Returns { code, message } if the requested transition should be
 * rejected, or null if it's allowed. Three rules, checked in this order:
 * 1. Cannot directly unset the current main -- must make another branch
 *    main instead (that implicitly swaps it off).
 * 2. Cannot archive the branch that is (or would remain) main.
 * 3. Cannot set main on a branch that is (or would remain) archived.
 *
 * For createBranch (a brand-new row, no prior state), use
 * checkNewBranchMainGuard below instead -- calling this function with
 * currentIsMain: false, currentStatus: "active" and both nextIsMain and
 * nextStatus set to the insert's values would hit rule 2 first ("...before
 * archiving this one"), which reads oddly for a row that was never active
 * to begin with.
 */
export function checkBranchMainGuard(input: BranchMainGuardInput): BranchGuardError | null {
  if (input.nextIsMain === false && input.currentIsMain === true) {
    return { code: "branch_main_required", message: "Pick another branch as main first." };
  }

  const effectiveIsMain = input.nextIsMain !== undefined ? input.nextIsMain : input.currentIsMain;
  const effectiveStatus = input.nextStatus !== undefined ? input.nextStatus : input.currentStatus;

  if (input.nextStatus === "archived" && effectiveIsMain) {
    return { code: "branch_archive_main_denied", message: "Pick another branch as main before archiving this one." };
  }
  if (input.nextIsMain === true && effectiveStatus === "archived") {
    return { code: "branch_activate_required", message: "Reactivate this branch before making it main." };
  }
  return null;
}

/**
 * createBranch's guard: a brand-new row cannot be inserted as both main
 * and archived. Same code family as checkBranchMainGuard's rule 3
 * (branch_activate_required), with wording appropriate for a row that
 * doesn't exist yet.
 */
export function checkNewBranchMainGuard(wantsMain: boolean, status: BranchStatus): BranchGuardError | null {
  if (wantsMain && status === "archived") {
    return { code: "branch_activate_required", message: "A new branch cannot be both main and archived." };
  }
  return null;
}
