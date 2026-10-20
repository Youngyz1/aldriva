# Kitchen & Delivery Workstream (under Phase 6: Unified Commerce)

> **STATUS (verified 2026-10-20)** — PARTIAL. **The code exists but is 100% UNCOMMITTED.**
> Location: untracked/modified files in the worktree `C:/Users/Youngyz/aldriva-staging` (branch `feat/menu-promotions-phase-4` @ `16265fb` at discovery time; the docs branch `docs/handoff-roadmap` was later created from the same tip).
> `git log --all --grep=kitchen -i` returns nothing → **no commit of this work exists on any branch** (VERIFIED 2026-10-20).
> This doc was written by a documentation agent reading the other agent's files; none of those files were changed.

## What this workstream is

Restaurants on Aldriva need their orders to reach a human who cooks them, and cooked food to reach the customer. This workstream adds: (1) **cook worker access** — invite staff to a kitchen screen without giving them a full account; (2) a **kitchen display** where incoming orders show up; (3) the **order state flow** (accepted → preparing → ready → notify customer); (4) **courier/driver registration** and a **lightweight driver dashboard** (accept/decline job, availability, pickup, delivery). It builds on the earlier owner-managed delivery work (migration 175).

## Built (VERIFIED — files read 2026-10-20; all uncommitted)

- **Migration 185 `db/migration_185_kitchen_worker_access.sql` (361 lines) + `_rollback.sql` + `db/migration_185_staging_test_data_cleanup.sql`** (staging-only cleanup, header says "NEVER run on production"):
  5 tables — `business_kitchens` (1:1 with businesses), `business_workers` (role `cook`|`courier`, cook requires kitchen, phone + WhatsApp number, deactivation fields), `business_worker_invitations` (SHA-256 `token_hash`, expiry, consumed/accepted/revoked), `business_worker_sessions` (token hash, sliding `expires_at` ≤ 90-day `hard_expires_at`), `business_kitchen_display_links` (one token per kitchen). All 5 have RLS enabled and are REVOKEd from PUBLIC/anon/authenticated, GRANTed to service_role only (migration lines 96–117). 3 SECURITY DEFINER RPCs: `consume_business_worker_invitation` (atomic accept with phone-last4 check, lines 167–257), `validate_and_renew_business_worker_session` (sliding renewal after 24h, lines 261–333), and a deactivation trigger that revokes invitations + sessions (lines 120–163).
- **Cook access flow end-to-end:**
  - Server actions `lib/actions/kitchen-management.ts` (357 lines): `createKitchen`, `inviteCook` (returns one-time plaintext token; SHA-256 stored), `resendCookInvitation` (rotates token, revokes sessions), `revokeCookInvitation`, `deactivateCook`, `regenerateKitchenDisplayLink`, `revokeKitchenDisplayLink`, `getKitchenManagementData`. All go through `checkTenantAccess` with roles owner/admin/manager (lines 10–43).
  - Routes: `app/api/kitchen/accept/bootstrap` (invite-link → sets invite cookie), `app/api/kitchen/accept` (phone-last4 POST → RPC consumes invitation → session cookie), `app/api/kitchen/session` (validate + refresh), `app/api/kitchen/logout`, `app/api/kitchen/display/bootstrap` (display token → display cookie). Cookies: `aldriva_kitchen_invite`, `aldriva_kitchen_session`, `aldriva_kitchen_display` (`lib/kitchen/worker-session.ts:6-9`).
  - Pages: public `app/kitchen/accept/page.tsx` (109 lines); owner dashboard `app/dashboard/org/[id]/kitchen/page.tsx` + `components/dashboard/kitchen/KitchenManagementClient.tsx` (275 lines — create kitchen, invite/resend/revoke/deactivate cooks, regenerate/revoke display link).
  - Navigation: "Kitchen" item added conditionally to `app/dashboard/org/[id]/org-nav-items.ts` when the org has menu rows or MENU capability (VERIFIED — diff).
- **Hardening:** 4 rate-limit buckets added in `lib/rate-limit.ts` (`kitchenInviteBootstrap` 12/600s, `kitchenAccept` 10/3600s, `kitchenDisplayBootstrap` 12/600s, `kitchenSession` 120/600s — all fail-closed); `next.config.ts` adds `Cache-Control: no-store` + `Referrer-Policy: no-referrer` for `/kitchen*` and `/api/kitchen*` (VERIFIED — diffs).
- **Tests:** `lib/kitchen/__tests__/worker-access.test.cjs` (455 lines, **20/20 PASS** when run 2026-10-20), registered in `package.json`'s explicit test list (VERIFIED — diff appends it).
- **Companion edits by the same agent (VERIFIED — `git diff`):**
  - `db/migration_175_owner_managed_delivery.sql` (+ rollback + Supabase mirror): forward wrapped in BEGIN, inline rider length CHECKs converted to named constraints created idempotently via guarded `DO` blocks (so 175 can be re-applied on staging where columns already exist); rollback redesigned from silent status remap to a **hard abort** (`MIGRATION_175_ROLLBACK_BLOCKED`).
  - `lib/__tests__/phase6-owner-managed-delivery.test.cjs`: updated to expect the new guard → **38/38 PASS** (was 1 failing before these edits).
  - `lib/workforce/__tests__/stage17-pass-one.test.cjs`: "latest migration" assertion updated 184 → 185.
  - Untracked `db/migration_175_rollback.sql` — appears to duplicate the redesigned rollback (**Owner to confirm**).
  - Unrelated to kitchen (INFERRED): `components/PrivacySafeGoogleAnalytics.tsx` + `app/layout.tsx` + `app/[locale]/layout.tsx` swap `@next/third-parties/google` for a Suspense-wrapped privacy-safe GA loader.

## Partly built

- **Courier/driver identity:** the `courier` role exists in `business_workers` (migration 185 CHECK, line 21) and session validation accepts it (`lib/kitchen/worker-session.ts:98`), but **no courier registration/invitation flow exists** — `inviteCook` hardcodes `role: "cook"` (`lib/actions/kitchen-management.ts:204`). (VERIFIED)
- **Kitchen display:** the token/cookie pipeline exists (`display/bootstrap` route, `validateKitchenDisplayToken`, `regenerateKitchenDisplayLink` returning `path: "/kitchen/display"`), but **the display page itself does not exist** — `find app/kitchen` shows only `accept/page.tsx`. (VERIFIED — NOT FOUND)
- **Earlier owner-managed delivery (committed Phase-6 work):** migration 175 adds `delivery_mode`, delivery address fields, `rider_name`/`rider_phone` and the `out_for_delivery`/`delivered` statuses to `orders`; `lib/courier/whatsapp-message.ts` (162 lines) builds the WhatsApp dispatch message for the rider. The new work reuses the same `orders` statuses the kitchen flow will drive (relationship: kitchen marks ready → owner assigns rider → rider status lives on `orders`). (VERIFIED — files; flow linkage INFERRED from status names)

## Not built (NOT FOUND — searched `app/`, `components/`, `lib/` for kitchen order flow, courier, driver)

1. **Kitchen order state flow** — no route/action/UI to accept an order, mark it preparing, mark it ready, or list incoming orders for a kitchen. No test for it.
2. **`/kitchen/display` page** — the kitchen screen itself (see Partly built).
3. **Customer notification on "ready"** — no message/email/SMS trigger tied to order readiness (existing notifications cover payment/shipment only: `lib/product-notifications.ts`). (VERIFIED NOT FOUND)
4. **Courier registration UI/actions** (owner inviting couriers, courier accepting).
5. **Lightweight driver dashboard** — accept/decline a delivery job, availability toggle, pickup and delivery confirmation. No files.
6. **Supabase mirror** for migration 185 — no `supabase/migrations/*migration_185*` file (VERIFIED — `ls supabase/migrations | grep 185` empty); mirrors are optional per `docs/DATABASE.md`, but 184 has one, so this may be an oversight (**Owner to confirm**).

## Known bugs / risks

- **Loss risk (highest):** the entire workstream has no commit. One `git clean` or disk failure loses it. (VERIFIED)
- Migration 185 has not been applied to any database; all table behavior is unverified live. (VERIFIED as unverified)
- The uncommitted migration-175 rollback redesign means the committed test expectations and the working-tree rollback no longer match the committed rollback — anyone running the committed tree sees the old behavior; the working tree is self-consistent (38/38). **Owner decision needed: adopt or discard.**

## Test coverage

| Suite | Result (2026-10-20 run) |
|---|---|
| `lib/kitchen/__tests__/worker-access.test.cjs` (20 tests: token hashing, invitation lifecycle, session renewal, revocation, deactivation trigger, display links) | 20/20 PASS |
| `lib/__tests__/phase6-owner-managed-delivery.test.cjs` (38 tests incl. the new guard-based rollback assertion) | 38/38 PASS |
| `lib/workforce/__tests__/stage17-pass-one.test.cjs` (latest-migration = 185) | PASS (modified file; run in chunk suites) |

## Continue from here

1. **Owner first:** decide the branch for this work and have the kitchen agent commit it there (see `docs/HANDOFF.md` §7 item 1). Do not commit these files from a docs branch.
2. Then, in order: **(a)** `/kitchen/display` page consuming `/api/kitchen/session` + an orders feed; **(b)** kitchen order state actions (accept → preparing → ready) against `orders.status` with the same role-scoped pattern as `kitchen-management.ts`; **(c)** "ready" customer notification (reuse `lib/courier/whatsapp-message.ts` or Resend); **(d)** courier invitation flow (extend `inviteCook` to accept `role: "courier"`, kitchen_id optional); **(e)** driver dashboard (accept/decline/availability/pickup/deliver actions). Register every new test file in `package.json`.
3. Apply migration 185 on staging (owner runs it), then `db/migration_185_staging_test_data_cleanup.sql` to clear test workers. Mirror 185 to `supabase/migrations/` if the owner wants CLI parity.

---

## Original context: owner-managed delivery (migration 175, committed)

Phase 6 Store orders gained delivery support: customer picks delivery vs pickup, owner sets fee and free-shipping threshold, owner assigns a rider (name + phone, exposed to the customer only while `out_for_delivery`), and a WhatsApp dispatch link. Tests: `lib/__tests__/phase6-owner-managed-delivery.test.cjs`. The kitchen/delivery workstream extends this from "owner drives everything" to "kitchen staff and couriers do their part of it". (VERIFIED — `db/migration_175_owner_managed_delivery.sql`, `lib/courier/whatsapp-message.ts`, `docs/project-status.md` §5.6)
