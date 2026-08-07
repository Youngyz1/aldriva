# Phase 1 Migration Audit — event-platform (SOURCE) → fundraising-app (TARGET)

Date: 2026-08-07
Source: `C:\Users\Youngyz\event-platform` (branch `main`, HEAD `728b9dd`, name "Fund4Good", next 16.3.0)
Target: `C:\Users\Youngyz\fundraising-app` (branch `cache-components/phase-0-suspense-wrap`, HEAD `9da433f`, name "Aldriva", next 16.2.6)

## How the delta was established

- A `parity_report.md` in the source (generated 2026-07-27) shows the two repos were **near-identical** at that date (632 identical files, 9 differing).
- The target was snapshotted from the source working tree ~2026-07-29/31 ("Initial commit: Aldriva platform"), **including** then-uncommitted source work — which is why target already has DB migrations 40–49, notifications, profile components, fund4good data lib, org workspace, etc.
- Ground truth is therefore the **direct working-tree diff** (git-tracked files, byte compare), not git history:
  - **146 files only in SOURCE** (migration candidates)
  - **220 files only in TARGET** (nearly all target-specific features — preserve)
  - **243 common files that differ** (mix of "source moved ahead" and "target adapted")
- Source-side delta = its 13 commits of 2026-08-05 → 08-07: share-card redesign, `/campaigns`, lime-green rebrand, settings fixes, route loading boundaries, campaigns/beneficiary system, **security remediation**, beneficiary find-or-create.
- Target-side delta since snapshot = Supabase project-ref migration, Cache Components Phases 0–4 (static shell + streamed pieces, `cacheComponents: true` on current branch), fundraiser progress redesign, its own image-upload+crop stack, /articles landing redesign, Aldriva branding (`config/branding.ts`, `BrandMark`), `(gated)` route group for articles/businesses/products.

## A. Architecture comparison

| Aspect | SOURCE (event-platform) | TARGET (fundraising-app) |
|---|---|---|
| Identity | "Fund4Good" — fundraising-only pivot | "Aldriva" — multi-vertical (Events, Articles, Businesses, Products, Fundraising) |
| next | 16.3.0 (security-motivated bump) | 16.2.6 (pinned; cache-components work built on it) |
| Fundraiser browse | `/campaigns` (+`[category]`), status-based, mobile redesign; `/fundraisers` deleted + redirected | `/fundraisers` decomposed into static shell + streamed (Cache Components Phase 2) |
| Events/Articles/Businesses/Products | **Deleted** | Fully present; articles freshly redesigned (some work uncommitted) |
| Dashboard | Fund4Good dashboard (`components/dashboard/fund4good/*`, `nav-items.ts`, AppSidebar/MobilePillNav) | Older generic dashboard (07-31 state) + target-only modules (events, attendees, articles, businesses, products) |
| Org workspace | `app/dashboard/org/[id]/*` (updated) + `app/org/[slug]` | Same `org/[id]` tree (07-31 state) + its own extra pages (blog, events, products) + a parallel older `app/dashboard/organizations/[slug]/*` tree |
| proxy.ts | Removed content gates (features deleted); added `x-admin-verified` fast path | Has article/business/product 404 gates (**critical**, Next 16 streaming semantics) |
| Security posture | 2026-08 assessment remediated (commit `b14dcc3`) | **Un-remediated** — all findings apply |
| DB migrations | up to 54 | up to 49 |
| Image upload | `components/ui/ImageUploadWithCrop.tsx`, `lib/crop-image.ts` | `components/ImageUploadWithCrop.tsx`, `lib/getCroppedImg.ts`, `lib/imageCompression.ts`, `hooks/use-image-upload.ts` (own parallel implementation, committed 08-06) |
| Branding system | CSS brand token scale in `globals.css` (lime `--brand-50…950`, semantic `--primary` etc. wired to ui/button, ui/card) | `config/branding.ts` (names/SEO/assets) + text rebrand; **no CSS token scale** — ui components' semantic tokens partially no-op |

## B/F. Database comparison

- **Common (already in target):** migrations 01–49 (incl. 40 total_raised fn, 41 fundraiser approval, 42 import markers, 43 comment likes, 44 notifications, 46–47 eventbrite/gofundme source columns, 48 organization system, 49 slug fixes). Never replay these.
- **SOURCE-only (candidates, with rollbacks):**
  - `migration_50_beneficiary.sql`, `51_beneficiary_accounts.sql`, `52_beneficiary_column_grants.sql` — Beneficiary system
  - `migration_53_security_hardening.sql` — purged-status check fix, organizers RLS (drop dead `USING(true)` policy, `deleted_at IS NULL`, column grants revoking `tax_id`/`nonprofit_registration_number`)
  - `migration_54_rate_limits.sql` — Postgres fixed-window rate limiter (SECURITY DEFINER RPC)
- **TARGET-only:** none beyond schema drift in shared files (`schema.sql` etc. differ mainly by branding/consolidation). `docs/migration-audit/` documents the target's Supabase project move (`hkvjdtbhiycqqhgelymr`) — migrations must be applied against **that** project, adapted if its live schema drifted.
- **Conflict caveat:** migration 53.3 changes `organizers` column grants, which **breaks `select("*")`** — every target code path selecting `*` from `organizers` must be updated in the same change (source did this in `app/organizers/page.tsx`; target has additional organizers surfaces incl. events-related ones to sweep).

## C/D/E. Key comparisons and conflicts

### Security (SOURCE commit `b14dcc3`) — CRITICAL, applies to target wholesale
1. **CRITICAL — account purge erased nothing**: target's `app/api/cron/purge-accounts/route.ts` is the broken 07-31 version (writes to non-existent columns, errors swallowed, auth user irreversibly deleted while data retained). Source fix + migration 53.1.
2. **SSRF in `/api/import-url`**: destination never validated. Source adds `lib/ssrf-guard.ts` (DNS resolve, private/link-local/NAT64/etc. rejection, per-redirect revalidation, body/duration caps). Target also has `api/media/import`, `api/geocode` fetch paths to sweep.
3. **No rate limiting anywhere in target**: source adds `lib/rate-limit.ts` + migration 54, applied to invite/donate-intent/create-payment-intent/import-url/comment-like. Fails open by design.
4. **Organizers RLS gaps** (migration 53.2/53.3) + code sweep off `select("*")`.
5. **HTML injection into outbound email** (dompurify override added).
6. **Dependency advisories**: source removed unused `@dotlottie/react-player` (target still declares it — verify unused), bumped next 16.2.6→16.3.0 (sharp/libvips CVEs on the Image Optimization path), added overrides for undici/postcss/dompurify.
7. `lib/cron-auth.ts` + `instrumentation.ts`/`instrumentation-node.ts` (cron auth, hardening) — verify target cron routes' auth.
8. `lib/auth.ts`: React `cache()` memoization of `getCurrentUser`/`getCurrentUserProfile` — safe perf win. Source `proxy.ts` also adds an `x-admin-verified` fast path (requireAdmin still full-checks as fallback).

### Beneficiary system (SOURCE-only) — coherent feature slice
`db` 50–52 → `lib/beneficiary.ts` → `app/api/beneficiary/{claim,invite,resolve}` → `components/fundraisers/{BeneficiarySelector,BeneficiaryInvite}.tsx` → `app/beneficiary/claim/[token]/*` → `app/dashboard/beneficiary/*` → integrations in `create-fundraiser`, `fundraisers/edit/[id]`, fundraiser detail page (`resolveBeneficiary`), dashboard nav. Cleanly additive; conflicts only where its integration files also conflict (below).

### Fundraiser detail + donate flow — Category E (both sides changed)
- SOURCE: beneficiary resolution, `safeImageSrc`, `calculateFundraisingPercentage` (`lib/fundraising-progress.ts`), `loading.tsx`, share-card/phone-mockup redesign, `force-dynamic`.
- TARGET: its own progress-visualization redesign (`ed3b4b0`), Aldriva `BRAND` config + `LocalBrandedPlaceholder` usage, mobile overflow fix (`9da433f`), Cache Components Phase 4 exemption.
- Action: **merge**, keep target branding + cache-component structure, adopt source's beneficiary + helper libs + loading state. Same story for `DonatePage`, `FundraiserActions`, `FundraiserShare`, `opengraph-image`, `create-fundraiser`, `fundraisers/edit`.

### /campaigns vs /fundraisers — Category E, product decision
Source deleted `/fundraisers` in favor of `/campaigns` (status-based browse, `CampaignBrowseList`, mobile showcase cards, `FundraiserListRow`) + permanent redirect in `next.config.ts` + all nav links repointed. Target instead decomposed `/fundraisers` into its cache-components static shell (`FundraisersBrowseSection`, `FundraisersHero`). Either adopt the rename (and rework `/campaigns` pages to the target's static-shell architecture) or port the browse/mobile improvements into the existing `/fundraisers`.

### User dashboard — Category B (adapt, don't replace)
Source's Fund4Good dashboard (19 components, KPIs, campaign health/timeline, insights, withdrawal status, skeletons; `nav-items.ts` + `components/nav/AppSidebar|MobilePillNav|SidebarNavList`) is newer than target's (07-31). But source nav is fundraising-only (Overview/Organizations/Analytics/Messages/Settings); target must keep Events, Attendees, Articles, Businesses, Products, My Tickets modules and `DashboardModulePage`/`DashboardView`. Merge = adopt fund4good components + nav framework, extend nav-items with target modules.
Also: source **deleted** `settings/connected` + `settings/accounts` (non-functional mock) — target still has both; removal applies. Settings profile country/state fix (`51fb5df`) — target's `ProfileClient` was upload-crop-touched 08-06, so merge carefully.

### Org workspace — Category B/E + target-side cleanup opportunity
Target has BOTH `app/dashboard/org/[id]/*` (shared lineage, stale) and an older parallel `app/dashboard/organizations/[slug]/*` tree, plus target-only org pages (blog/events/products). Source updated `org/[id]` (overview, analytics + `OrgAnalyticsCharts`, mobile nav, nav-items, settings) and `app/org/[slug]` public profile. Merge source updates into `org/[id]`; decide whether the duplicate `organizations/[slug]` tree should be retired (target-side decision, not part of source migration).

### Rebrand — Category E, product decision
Source `globals.css` adds a documented lime/dark-green brand scale + semantic tokens that make `ui/button`/`ui/card` variants actually render; ~40 components repainted (`22e346d`). Target has its own Aldriva identity (text-level) and a `btn-ripple` utility (source lacks). Options: keep Aldriva colors but adopt the **token architecture** (recommended), or adopt lime-green wholesale.

### Route loading boundaries (`0b307ac`) — Category A/B
`components/ui/RouteLoading.tsx` + ~15 `loading.tsx` files (admin, dashboard, campaigns, fundraiser detail, organizers, profile, search, org). Additive and safe; overlaps conceptually with target's cache-components streaming — apply to routes the target hasn't already decomposed, respect `AI agent hint` streaming semantics in the vendored Next 16 docs.

### UI primitives — Category A (new) / E (small merges)
SOURCE-only: `ui/dropdown-menu`, `ui/heading`, `ui/text`, `ui/page-header`, `ui/RouteLoading`. Differing: `badge`, `button`, `card`, `dialog`, `input`, `textarea`, `switch`, `settings-card`, `SearchableSelect` (mostly token-driven restyle — follows the rebrand decision). `ui/ImageUploadWithCrop` vs target's `components/ImageUploadWithCrop` — **two parallel implementations**; keep target's (already wired into every upload point, has compression), do not import source's.

### Admin — Category B
Source: `AdminSidebarNav`, admin fundraiser detail page + status actions + import panel updates, loading states, `x-admin-verified` layout fast-path. Target admin additionally has Articles/Businesses/Events/Products panels — extend nav, don't replace. `app/admin/homepage/HomepageCmsTabs` differs heavily (source removed events homepage CMS bits — skip deletions).

### Category D — do NOT migrate (source deletions of target features)
Everything the source deleted: events (pages, APIs, dashboard, cards, external events, city pages), articles, businesses, products, tickets/checkout/seats/verify, eventbrite sync, my-tickets, `(gated)` group, target proxy gates, `DashboardModulePage`/`DashboardView`, target image-upload stack, `config/branding.ts` consumers, curated destinations / city-slug libs, Aldriva strings in shared files (e.g. Stripe webhook email templates — target's copy is correct for target).

### Category C — source-specific, skip
`.agents/skills/*` (tooling), `supabase/.temp/*`, `parity-check.js`/reports, Fund4Good naming (`WhyFund4Good` — target has `WhyAldriva`), `.npmrc` (only if target's install actually needs legacy-peer-deps), `127.0.0.4` CSP oddity in source next.config (looks accidental — do not copy).

## G. Dependencies

- Required by migrated code: none new for beneficiary/campaigns (uses existing stack); security wants `dompurify` (+ overrides for `undici`, `postcss`) and the **next 16.3.0** bump (CVE-motivated — but target's cache-components branch is validated on 16.2.6; upgrade is its own tested step).
- Remove if confirmed unused in target: `@dotlottie/react-player`.
- Do not touch target-only deps (`browser-image-compression`, `@radix-ui/react-tabs`, etc.).

## H. Configuration

- `next.config.ts`: adopt `getLocalNetworkIPs()` auto-detected `allowedDevOrigins` (supersedes target's hardcoded LAN IP, including its uncommitted tweak). `/fundraisers→/campaigns` redirect only if the rename is adopted. Keep target's `cacheComponents: true` (branch-scoped) and CSP as-is.
- `proxy.ts`: keep target's version (content gates are load-bearing); optionally port `x-admin-verified` + `lib/auth.ts` `cache()` memoization.
- Target has in-flight **uncommitted** changes (articles components, `use-notifications`, `next.config.ts`) on branch `cache-components/phase-0-suspense-wrap` — migration work should start from a clean commit point and a dedicated branch.

## I. Conflict list (needs manual merge)

`app/fundraisers/[slug]/page.tsx`, `donate/DonatePage.tsx`, `FundraiserActions.tsx`, `FundraiserShare.tsx`, `opengraph-image.tsx`, `app/create-fundraiser/page.tsx`, `app/fundraisers/edit/[id]/page.tsx`, `app/create-organizer/page.tsx`, `app/dashboard/settings/profile/ProfileClient.tsx`, `app/globals.css`, `app/layout.tsx`, `next.config.ts`, `proxy.ts`, `components/editor/RichTextEditor.tsx`, `components/FundraiserCard.tsx`, `components/fundraisers/CampaignShowcase*`, `app/dashboard/org/[id]/settings/page.tsx`, `lib/fundraiser-data.ts`, `lib/fund4good-data.ts`, `db/schema.sql`, plus every "differing" file where the target's change is only Aldriva branding (keep target strings, take source logic).

## J. Migration map (prioritized)

| # | Work item | Category | Risk | Depends on |
|---|---|---|---|---|
| 1 | Security remediation: purge-accounts fix, `ssrf-guard` + apply to import-url/media-import, `rate-limit` + apply to 5 routes, email sanitization, migrations 53+54 (adapted), organizers `select("*")` sweep, cron-auth/instrumentation, `auth.ts` cache() | A | Med (DB grants break `select *`) | mig 53/54 on target Supabase project |
| 2 | Beneficiary system (mig 50–52, lib, APIs, components, claim flow, dashboard page, create/edit integration) | A/B | Med | #1 ordering optional; fundraiser-page merge |
| 3 | Fundraiser detail/donate/share merged redesign + `fundraising-progress`/`donation-counts` libs + loading.tsx | E-merge | Med | #2 for beneficiary display |
| 4 | Dashboard: fund4good components + nav framework (AppSidebar/MobilePillNav/nav-items) extended with target modules; drop connected/accounts mock; settings fixes | B | Med-High | decision on nav scope |
| 5 | `/campaigns` decision → either adopt rename (+redirect, nav repoint) or port browse improvements into `/fundraisers` static shell | E | High | product decision |
| 6 | Rebrand decision → token architecture with Aldriva palette (recommended) or lime-green wholesale; then ui primitive merges (button/card/badge/…) + new primitives (dropdown-menu/heading/text/page-header) | E | Med | product decision |
| 7 | Route loading boundaries + `RouteLoading` on non-decomposed routes | A | Low | after #5 |
| 8 | Admin merge (sidebar nav, fundraiser detail/import, loading states, `x-admin-verified`) | B | Low-Med | #1 |
| 9 | Org workspace merge (`org/[id]` updates, `app/org/[slug]` public profile) + decide fate of duplicate `organizations/[slug]` tree | B/E | Med | — |
| 10 | next 16.2.6→16.3.0 + dep overrides + `@dotlottie` removal (own verified step: build + cache-components validation) | A | High | after core merges |

**Not migrated (by design):** all Category C/D above — target's Events/Articles/Businesses/Products/tickets, proxy gates, branding, image-upload stack, cache-components architecture are preserved untouched.
