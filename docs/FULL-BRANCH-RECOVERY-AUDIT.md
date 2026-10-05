# Full Branch Recovery & Integration Audit

## 1. Executive Summary

This audit establishes the Git topology across all local and remote branches in `aldriva-staging`, evaluates every historical and feature branch for recoverable work, and confirms the integration strategy for producing a clean, verified `main` branch.

**Key Findings:**
1. The `staging` branch (tip `3a30735`) represents the canonical, most up-to-date platform architecture (incorporating Workforce, AI Studio, Studio chat, Sentinel, agent memory, QA infrastructure, admin redesign, and recent security hardening migrations through Migration 153).
2. `origin/main` (tip `95d6902`) is an exact ancestor of `staging` (`git merge-base staging origin/main` = `95d6902`). All 142 commits from `origin/main`, including Pull Request #5 (`release/admin-redesign`), are already fully merged into `staging` (via merge commit `d7cf6ea`).
3. Local `main` (tip `0552219`) is simply an older snapshot that is 142 commits behind `origin/main` and 163 commits behind `staging`.
4. All feature branches (`release/admin-redesign`, `feature/admin-redesign`, `feat/app-locale-migration`, `feat/source-migration`, `add-qa-workflow`, `cache-components/phase-0-suspense-wrap`, `tmp/i18n-verify`) have their changes fully merged into `staging`.
5. `feat/entity-architecture` (`5da2d4b`) created migrations 58 and 59, which are already present in `staging` in a hardened, strictly superior state (`SECURITY DEFINER` with search path pinning and immutable column triggers).
6. `wip/admin-baseline` (`20df7d5`) was an older temporary branch whose experimental components were superseded by the modern `app/admin` table architecture.

---

## 2. Branch Topology & Commits Inventory

| Branch | Tip Commit | Upstream | Ahead of Staging | Behind Staging | Merged in Staging? | Merged in Main (origin)? | Classification & Recommended Action |
|---|---|---|:---:|:---:|:---:|:---:|---|
| `staging` | `3a30735` | `origin/staging` | 0 | 0 | Source of Truth | Ahead by 21 commits | **Preserve as foundation**. Base for integration branch. |
| `origin/main` | `95d6902` | - | 0 | 21 | Yes (`d7cf6ea`) | Tip of origin/main | **Already in staging**. Target for fast-forward/clean merge. |
| `main` (local) | `0552219` | `origin/main` | 0 | 163 | Yes (`3cc6d38`) | Behind by 142 commits | **Update via integration branch**. |
| `release/admin-redesign` | `95ec18e` | `origin/release/admin-redesign` | 0 | 22 | Yes (via `95d6902`) | Yes (PR #5) | **Already in staging**. All 32 admin redesign commits intact. |
| `feature/admin-redesign` | `95d6902` | - | 0 | 21 | Yes (`d7cf6ea`) | Yes (PR #5) | **Already in staging**. |
| `feat/entity-architecture` | `5da2d4b` | - | 1 | 269 | Superseded | No | **Superseded**. Migrations 58 & 59 present and hardened in staging. |
| `feat/app-locale-migration` | `f3c42fd` | - | 0 | 113 | Yes | Yes | **Already in staging**. Replay chain & locale migration active. |
| `feat/source-migration` | `b72b006` | `origin/feat/source-migration` | 0 | 242 | Yes | Yes | **Already in staging**. TTS & audio player simplifications present. |
| `add-qa-workflow` | `62b3c09` | `origin/add-qa-workflow` | 0 | 164 | Yes (`3cc6d38`) | Yes (PR #3) | **Already in staging**. QA sweep workflow active in `.github/workflows`. |
| `cache-components/phase-0-suspense-wrap` | `9da433f` | - | 0 | 283 | Yes | Yes | **Already in staging**. Organizers loading & mobile overflow fixes present. |
| `tmp/i18n-verify` | `e67934d` | - | 0 | 128 | Yes | Yes | **Already in staging**. Dashboard layout sidebar slot active. |
| `wip/admin-baseline` | `20df7d5` | - | 2 | 72 | Superseded | No | **Obsolete / Superseded**. Older exploratory baseline replaced by `app/admin` redesign. |

---

## 3. Special Audit: Admin Redesign

All 32 commits from the Admin Redesign effort are fully incorporated into `staging` through commit `d7cf6ea` (`Merge origin/main into staging (admin redesign)`):

- `3f96696` Admin Phase 1: stabilize toolbar, truncate email, e2e screenshot rig
- `646ceb3` feat(admin): Phase 2 collapsible shell, cookie-persisted sidebar, mobile drawer
- `c32cee0` feat(admin): Phase 3 unboxed Overview with range comparison, chart, queues
- `af5bee2` feat(admin): Phase 4 shared table system on users page
- `eac6a63` feat(admin): table system - sticky toolbar, clip+priority hiding, sticky footer, tested range math
- `3cfd0c9` feat(admin): migrate organizers to shared table
- `cce0659` feat(admin): migrate events to shared table
- `2ee5d45` feat(admin): shared PageHeader + StatStrip page pieces
- `e77e3f4` feat(admin): migrate fundraisers to shared table
- `fcdcd58` feat(admin): migrate businesses to shared table
- `946240a` feat(admin): migrate articles to shared table
- `428a881` feat(admin): migrate products to shared table
- `611f980` feat(admin): overview glance as chip-strip groups
- `81cfae3` feat(admin): overview polish
- `3be0588` feat(admin): overview platform coverage
- `0209777` feat(admin): migrate ai rejections audit to shared table - server split kept
- `c172716` test(admin): scan that every referenced adminPageCopy key exists
- `1c4e9c7` feat(admin): tab-aware sidebar active state for homepage links
- `b10d51c` feat(admin): homepage CMS refresh - shared header, underline tabs, sheet forms
- `977d013` feat(admin): migrate payments ledger to shared tables - server-rendered
- `9797fc7` feat(admin): migrate payouts queue to shared table - modals unchanged
- `128203d` feat(admin): per-currency payout volume totals
- `edeec07` feat(admin): payments amounts render in their stored currency
- `38ac222` feat(admin): overview deep-links requested payouts via ?status=
- `d468471` test(e2e): read-only admin smoke rig over all admin routes
- `a5bfa53` fix(admin): deterministic UTC audit timestamps in rejections
- `a9736f0` test(e2e): pin browser tz-locale, full failure messages
- `21930ad` fix(admin): suppress welcome-timestamp hydration warning in Growth Studio
- `2ea3f83` fix(admin): pin UTC locale dates on identity and payouts lists
- `f5f6927` test(e2e): SMOKE_TZ/SMOKE_LOCALE second timezone mode
- `facef0a` feat(admin): migrate identity verifications queue to shared table
- `95d6902` Merge pull request #5 from Youngyz1/release/admin-redesign

**Verification:**
Every admin surface in `app/admin/` uses `components/admin/table/AdminTable.tsx`, `PageHeader`, `StatStrip`, and the unified admin theme.

---

## 4. Special Audit: Entity Architecture (`feat/entity-architecture`)

- **Commit `5da2d4b`**: Added initial drafts of `migration_58_business_entity_link.sql` and `migration_59_entity_members.sql`.
- **Status in `staging`**: Present and hardened. The migrations in `db/` in `staging` contain `SECURITY DEFINER` execution, `search_path = public` protection, explicit foreign key cascade guards across all 7 referencing tables, and column immutability triggers (`prevent_business_organizer_id_change` and `prevent_is_business_auto_created_change`).
- **Conclusion**: `staging` contains the complete and secure version. No recovery or cherry-picking needed.

---

## 5. File & Component Level Differences

| File / Component Group | Status | Rationale |
|---|---|---|
| `app/admin/` (all routes) | Intact | Uses shared table system, strict `requireAdmin()`, and unified styling. |
| `app/admin/workforce/` (all routes) | Intact | Stage 14–23 Workforce console, agents tree, memory, QA, Sentinel, 3D office viewer. |
| `app/api/ai/` | Intact | Admin chat endpoint, output guard, secret pattern detection, studio persistence. |
| `components/admin/` | Intact | AdminTable, TableToolbar, PageHeader, StatStrip, Overview widgets. |
| `components/dashboard/ResponsiveDataTable.tsx` | Obsolete | Superseded by `components/admin/table/AdminTable.tsx` during admin redesign. |
| `db/migration_001` through `migration_153` | Intact | Complete canonical sequence with rollback twins and supabase mirrors. |

---

## 6. Integration Strategy & Sequence

1. Create a clean integration branch `integration/full-recovery` directly from `staging` (`3a30735`).
2. Clean up the stale `responsive-data.test.cjs` reference in `package.json` test script and register `lib/__tests__/cms-image-upload.test.cjs`.
3. Validate full build, typecheck, linting, and all 36 test suites (1201+ tests).
4. Update local `main` from `integration/full-recovery` cleanly.
5. Generate `docs/FULL-BRANCH-RECOVERY-FINAL-REPORT.md`.
