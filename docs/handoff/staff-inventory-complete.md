# Staff management + inventory - completion handoff

**Status:** merged locally and gated. **Not pushed. No migration applied anywhere.**
**Branch:** `merge/staff-management-into-staging` (source tip `df454422b`, staging tip `3f957528b`).
**Worktree:** `C:/Users/Youngyz/aldriva-staff-merge` (sibling worktree; the main folder was never checked out to this branch).
**Last verified:** 2026-11-27.

## 1. Commit trail

| Commit | What it is |
|---|---|
| `9d2073f0b` | `git merge origin/staging` into the branch. Exactly 4 conflicts: `app/login/page.tsx` to the branch side (`signupHref`); `messages/en.json`, `messages/fr.json`, `test-files.json` as unions. All 331 registered test paths existed afterwards. |
| `88993864f` | `test-files.json` - the staff and inventory suites registered. 334 entries, no duplicates, valid JSON. |
| `c106053c9` | 32 new `supabase/migrations/` mirrors (231-269 minus staging's 234/265), byte-identical to `db/` (sha256 per pair), 5263 insertions. |

## 2. What the merged branch adds

- **Staff management** - a generic workforce layer owned by `business_id` and bridged to organizer-level authorization through `businesses.organizer_id`: staff members, roles, role permissions, token-hashed invitations, member-role assignments, branch scopes (`all_branches` plus per-branch rows), permission-key RLS on every staff table, role-rank and permission-escalation guards, `staff_has_permission()`, an append-only audit log and a denial log, planned shifts, and links from kitchen/courier `business_workers` rows to staff members.
- **Permission catalogue** - migration 235 renames the 6 legacy keys to dotted form and inserts 56 new ones (**62 rows**; the migration's own verification file asserts exactly 62), converts `domain` to a generated column, and backfills 6 mechanical grants. Migration 243 seeds the four built-in platform roles additively.
- **Inventory** - 268 (items, locations, balances, movement ledger) and 269 (transfers, location archive guard, stricter `inventory_apply_movement()`). Balances and movements are written only by `inventory_apply_movement()`; `authenticated` is SELECT-only there.
- **Rentals additions** - 232 (per-vehicle photo; the Fleet grid falls back to the category photo) and 262 (staff assignment/chauffeur link for rental bookings; `rental_bookings` itself unchanged), plus 263 tightening `rental_bookings` table privileges (`anon` nothing, `authenticated` SELECT only).
- **Grants tightening** - 267 removes Supabase default-privilege over-grants on `staff_*` tables.

## 3. Migration inventory (231-269)

`db/` is canonical. Every forward file has a fail-closed `_rollback` twin; several have `_verification` / `_verify` companions. The full register with per-migration detail lives in `docs/HANDOFF.md` section 6.

- **Authored by this branch:** 231, 232, 235-244, 246-259, 262-264, 266-269 (32 files).
- **Staging's own, arrived through the merge:** 234 (unified template page-only) and 265 (event guestbook entries).
- **Not used:** 245.
- **Held elsewhere, never reuse:** 260/261 (showcase workstream), 270/271 (`backup/organizer-ai-before-handoff`), 272 (`feature/organizer-ai-assistant`, **NOT applied**), 273 (`feature/customer-comms-foundation`).
- **Next free number: none confirmed** (274-279 held by other agents, 280 taken, 281 applied on staging, 282-286 supply and 287+ POS confirmed by owner; see `docs/HANDOFF.md` section 6)

### Mirror policy applied here

All 32 branch migrations were copied byte-for-byte into `supabase/migrations/TIMESTAMP_migration_NNN_same-suffix.sql` and verified pairwise with sha256 (250,281 bytes on both sides, 0 mismatches). Rollback and verification scripts stay in `db/`, matching the 30 pre-existing `db/*_verification.sql` files, none of which was ever mirrored.

Timestamps follow migration-number order, not commit time (DEC-0067):

- `232` to `20261114120000` (real add-commit `20261113212519`), so it sorts after 231's mirror.
- `263` to `20261124090000` and `264` to `20261124095000` (real `20261125042500` / `20261125074628`), so 262 < 263 < 264 < the existing 265 mirror.
- Every other mirror keeps its real add-commit timestamp, which was already ascending.

Result: 169 files in `supabase/migrations`, no duplicate timestamps, and the only number-order inversions left are five staging already shipped (133 to 127, 191 to 189, 222 to 221, 234 to 224, 233 to 231). None involves a new file.

## 4. Gate evidence (2026-11-27)

| Check | Result |
|---|---|
| `npx eslint` on 116 changed code files | exit 0 - 0 errors, 2 warnings (pre-existing `<img>` in `app/login/page.tsx:142`, `app/signup/page.tsx:176`) |
| `npx tsc --noEmit` | exit 0, after `npx next typegen` (see 5.3) |
| `"use server"` export check | 1679 files scanned, 42 server modules, 239 async exports, 0 violations |
| `npm run build` | exit 0, Next 16.4.6, compiled in 107s, 425/425 static pages |
| `npm test` | 334 files, 3717 tests, **3684 pass / 33 fail**, 0 skipped, 0 batch errors |
| en/fr parity | 2369 leaf keys each, 33 namespaces each, 0 duplicate keys, 0 en-only/fr-only |

Build notes: two `NEXT_PRERENDER_INTERRUPTED` bail-outs are logged for `/api/rentals/lookup/inspections` (`request.headers` via `lib/rate-limit.ts:323`) and `/api/rentals/inspections/view` (`request.url`). Both routes are untouched by this branch, fall back to dynamic rendering, and the build still exits 0.

## 5. Known gaps - read before claiming this is done

1. **33 test failures are inherited from staging, not caused here.** A clean `origin/staging` tree (`git archive`) run against the same 14 test files fails the identical 33 tests; the failing-name sets are equal. Causes:
   - `general-booking` (13) and `stage-b-reservations-capacity` (4): booking/service behaviour staging has since changed.
   - `services-and-menus`, `website-foundation`, `phase2b2-cart-and-orders`: assert `services`, `menu` and orders `routeExists` nav entries that no longer exist in `lib/org-dashboard-modules.ts`.
   - `bottom-bar`: asserts an Analytics link removed from `components/nav/DashboardMoreSheet.tsx`.
   - `savannah-phase-3c-render`, `savannah-phase-3d-menu-cards` (2), `website-template-v2`, `website-page-draft-projection`: fail against staging's own source.
   - `sentinel-events` (2), `p1-generic-error-responses` (2), `invitation-events-kind`, `phase7-reservations`: likewise, all failing on staging.

   A test-repair pass is needed before `npm test` can be called green.
2. **Six tracked test files are not in `test-files.json`** and therefore never run: `lib/__tests__/invitation-template-manifest.test.cjs`, `lib/__tests__/invitation-template-marketplace-routes.test.cjs`, `lib/__tests__/minimalism-dark-blue-stage7a.test.cjs`, `lib/__tests__/scan-actions.test.cjs`, `lib/audio/__tests__/audio-logic.test.ts`, `lib/security/__tests__/approval-flag-gap.test.cjs`. Registering them is an owner decision (they may be failing or obsolete); nothing was added without approval.
3. **A fresh install needs `npx next typegen` before `tsc --noEmit`.** `next-env.d.ts` is gitignored and absent after `npm ci`, so `tsc` fails with `TS2307: Cannot find module '@/public/logo-horizontal.png'` until Next generates the file (a build does it too). Environmental, not a source defect.
4. **No migration is applied.** Every status field for 231-269 is UNVERIFIED: no database query was made at any point. Deploy order still applies (235's catalogue before any permission-key RLS is relied on; 258 before 259; 268 before 269).
5. **Nothing is pushed.** The commits exist only in the sibling worktree's branch.
6. **`docs/DATABASE.md` section 5 still ends at migration 219.** Its table is the second half of the register rule in `docs/HANDOFF.md` section 6 and needs the same 231-269 rows.
7. **No browser or visual QA** was run for the staff or inventory UI in this merge.

## 6. How to resume

```bash
cd C:/Users/Youngyz/aldriva-staff-merge
git log --oneline -4                 # merge, test-files, mirrors, docs
git status --porcelain               # expect clean
npx next typegen && npx tsc --noEmit # typegen is required on a fresh install
npm run build && npm test            # 33 inherited failures (see 5.1)
```

Before writing any new migration: read `docs/HANDOFF.md` section 6, take the next number the owner confirms (not 274), and add the row in both `docs/HANDOFF.md` and `docs/DATABASE.md`.
