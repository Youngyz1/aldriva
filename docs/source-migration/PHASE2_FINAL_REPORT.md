# Phase 2 Migration — Final Report

event-platform (Aldriva, SOURCE) → fundraising-app (Aldriva, TARGET)
Branch: `feat/source-migration` (7 commits over `main`) · Date: 2026-08-07

Scope was set by user decision after the [Phase 1 audit](./PHASE1_REPORT.md): migrate security
remediation, the beneficiary system, fundraiser UX, and dashboard/nav — while keeping the
`/fundraisers` route (not `/campaigns`), building the brand-token architecture on Aldriva's own
orange rather than lime-green, and deferring the next 16.3.0 upgrade.

## MIGRATED

- **Security** (`5c5f45b`): `lib/ssrf-guard.ts`, `lib/rate-limit.ts`, `lib/cron-auth.ts`; migrations
  53 (purged status, organizers RLS + column grants, fundraiser_updates/media scoping,
  organizer_follows privacy + `organizer_follower_counts` view) and 54 (Postgres rate limiter).
  Applied to import-url, create-payment-intent, donate/intent, comment-like, all 3 crons.
  `lib/auth.ts` request-memoized via React `cache()`. `proxy.ts` + admin layout `x-admin-verified`
  fast path.
- **Beneficiary system** (`f8ef475`): migrations 50–52, `lib/beneficiary.ts`, claim/invite/resolve
  APIs, public claim flow, self-service profile editor, create/edit-fundraiser integration.
- **Fundraiser UX** (`45b303c`): detail/donate/share redesign, beneficiary-aware attribution,
  full-bleed hero, batched queries, continuous tip slider, IntersectionObserver floating bar;
  browse-page smart filters + mobile list/card views ported into the existing `/fundraisers`
  Cache Components shell (no route rename); loading boundaries for 5 admin + 4 public routes.
- **Admin fundraiser panel** (`271cc78`): real bug fix (public-page link used `id` instead of
  `slug`) plus brand-token color adoption.
- **Dashboard + nav** (`605b018`): shared nav framework (`components/nav/*`), extended
  `dashboardNavGroups` with 6 previously-unlinked-but-working routes (Fundraisers, Events,
  Attendees, Articles, Businesses, Products), scrollable mobile pill nav, a11y + auth-cache
  improvements to `layout.tsx`, Connected Accounts mock removed, free-text country/state fields.
- **Brand tokens** (`f6a05a7`): `--brand-50..950` (Tailwind's stock orange scale) + shadcn-style
  semantic tokens in `globals.css`; token-driven ui primitives (button/card/dialog/input/
  textarea/switch/settings-card).

## MERGED

Every file above that existed in both repos was diffed and merged, not overwritten — target's
branding, cache-components architecture, image-upload stack, and content-gate proxy logic were
preserved throughout. Notable merges: `app/fundraisers/[slug]/page.tsx`, `DonatePage.tsx`,
`FundraiserActions.tsx`, `FundraiserSidebar.tsx`, `lib/image-url.ts` (overloaded
`normalizeImageUrl` so Events/Articles keep a non-null return while Fundraisers use the new
null-means-no-image contract), `lib/fundraiser-data.ts`, `app/organizers/OrganizersDirectory.tsx`
and 6 other call sites swept off `organizers.select("*")`.

## NOT MIGRATED (by design)

- Everything source **deleted**: Events, Articles, Businesses, Products, tickets/checkout/seats,
  eventbrite sync, `(gated)` route group, target's proxy content gates, Aldriva branding strings,
  target's own `ImageUploadWithCrop`/`getCroppedImg`/`imageCompression` stack.
- `/campaigns` rename, redirect, and its `revalidatePath('/')` — target kept `/fundraisers`.
- `components/ui/badge.tsx` — source's API (default/secondary/destructive/outline) genuinely
  diverged from target's actively-used one (`variant="orange"` etc., 7 semantic color variants +
  size prop); overwriting would have broken it.
- `components/ui/SearchableSelect.tsx` — source collapsed its two accent modes (green/orange)
  into one brand color, erasing the Events-vs-Fundraisers visual distinction that only matters
  for a multi-vertical platform.
- `components/ui/{heading,text,page-header}.tsx` — nothing ported depends on them; skipped per
  YAGNI rather than added as unused primitives.
- `app/dashboard/page.tsx` overview replacement with `AldrivaDashboardView` — would have
  dropped target's cross-vertical (Events+Fundraisers+Organizations) aggregate for a
  fundraising-only KPI view. Per user decision, the KPI widget library
  (`components/dashboard/Aldriva/*`) was ported unwired instead, for a future fundraiser-scoped
  view.
- next 16.2.6→16.3.0, `@dotlottie/react-player` removal is done but the next version bump itself
  is deferred (own future step, per decision).
- `.agents/skills/*`, `supabase/.temp/*`, `parity-check.js` — source tooling, not app code.

## CONFLICTS RESOLVED

| File/area | Conflict | Resolution |
|---|---|---|
| `lib/image-url.ts` | Fundraiser surfaces want `string \| null`; Events/Articles want `string` | Function overload on `normalizeImageUrl` |
| `app/fundraisers/[slug]/page.tsx` + companions | Hardcoded lime-green hex (`#c0f269`/`#1c3a27`) in Donate/Share CTAs, found via live screenshot after the token work landed | Remapped to `brand-300`/`brand-900` equivalents across 3 files + 1 email template |
| `components/ui/badge.tsx`, `SearchableSelect.tsx` | "Differing" per Phase 1, but actually two unrelated designs | Kept target's (verified via actual call-site usage before deciding) |
| `organizers` table reads (7 call sites) | migration_53's column grants make `select("*")` fail | Shared `lib/organizer-public-columns.ts` constant |
| `organizer_follows` count reads (5 call sites) | migration_53 restricts row-level reads | Switched to the `organizer_follower_counts` aggregate view |
| Admin fundraiser routes' `revalidatePath` | Source pointed at `/` (post-`/campaigns`-rename) | Kept target's `/fundraisers` |

## DATABASE CHANGES

Staged in `db/` but **not yet applied** to the live Supabase project (`hkvjdtbhiycqqhgelymr`):
`migration_50_beneficiary.sql`, `51_beneficiary_accounts.sql`, `52_beneficiary_column_grants.sql`,
`53_security_hardening.sql`, `54_rate_limits.sql` (+ rollbacks for each). All code changes are
written to be safe against the **current, pre-migration** schema (confirmed live — organizer
counts/followers/campaigns all render correctly against the unmigrated DB in manual testing).
Apply migrations 50–54 in order before or shortly after this branch deploys; none replay anything
already in target (01–49 confirmed identical in Phase 1).

## DEPENDENCY CHANGES

- Removed: `@dotlottie/react-player` (declared, never imported).
- Added `overrides`: `undici@^7.29.0`, `dompurify@^3.4.13`; bumped `postcss` override to
  `^8.5.23`.
- No new runtime dependencies — `@radix-ui/react-dropdown-menu` (used by the newly-ported
  `dropdown-menu.tsx`) was already present.
- next stays 16.2.6 (deferred).

## TEST RESULTS

| Check | Result |
|---|---|
| `tsc --noEmit` | **PASS** (clean after every commit) |
| `eslint .` (full repo) | **PASS** — 0 errors introduced; 1 pre-existing error in `components/ImageUploadWithCrop.tsx` (last touched by target's own `7b7da06`, unrelated to this migration) |
| `next build` | **PASS** — all routes compiled, including every target-only route (Events, Articles, Businesses, Products, admin panels) |
| Fundraisers (browse + detail + donate) | **PASS** — manually verified in-browser; beneficiary attribution, progress ring, smart filters, and brand-orange CTAs all render correctly |
| Events | **PASS** — hero, cache-components streaming unaffected |
| Articles | **PASS** — target's own landing redesign unaffected |
| Businesses | **PASS** — no console errors |
| Organizers directory + profile | **PASS** — counts, follower counts, campaign counts all resolve correctly against the pre-migration schema, confirming the RLS/column-grant sweep is forward-compatible |
| Admin | Not manually exercised (requires an admin session); relies on `tsc`+`build` passing and the `x-admin-verified` fallback logic (`requireAdmin()` still runs in full if the header is missing) |
| Payments/Stripe | Not exercised (no test Stripe keys in this session); code changes were confined to rate-limiting the intent-creation call site, not the payment logic itself |

## REMAINING ISSUES

1. **`public/logo.png` still shows the "fund♥good" wordmark** — discovered during the brand-token
   screenshot check. This is a static image asset, present since the very first "Initial commit:
   Aldriva platform" (`b171379`), predates this migration entirely, and isn't something code
   migration can fix — needs a real Aldriva logo asset.
2. **Migrations 50–54 not yet applied** to the live Supabase project — see Database Changes above.
3. **Pre-existing lint error** in `components/ImageUploadWithCrop.tsx:115` ("Cannot access refs
   during render") — out of scope (predates this migration, not touched by it).
4. **Duplicate org-workspace tree**: target still has both `app/dashboard/org/[id]/*` and an older
   parallel `app/dashboard/organizations/[slug]/*`. Flagged in Phase 1 as a target-side cleanup
   decision, intentionally not touched here.
5. **Aldriva KPI widget library** (`components/dashboard/Aldriva/*`) is ported but unwired —
   available for a future fundraiser-scoped dashboard view, per decision.
6. **Payments/Stripe and admin-authenticated flows** weren't exercised end-to-end in this session
   (no admin session, no test Stripe keys available) — recommend a manual pass before merging to
   `main`.
