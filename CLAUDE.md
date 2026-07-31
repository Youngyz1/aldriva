# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

@AGENTS.md

## ⚠️ Non-standard Next.js — read the vendored docs before writing code

This repo pins `next@16.2.6`, a version with breaking changes from what you likely know. **Before touching routing, caching, streaming, or navigation code, read the relevant page under `node_modules/next/dist/docs/`** rather than relying on training data. Known deviations found so far:

- **`middleware.ts` is deprecated and renamed to `proxy.ts`.** This project's root-level proxy file is `proxy.ts`, exporting a function named `proxy` (not `middleware`), with the same `config.matcher` shape. See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- The docs contain inline `{/* AI agent hint: ... */}` comments calling out non-obvious behavior (e.g. streaming/`loading.md` status-code semantics, `unstable_instant` navigation). Grep `node_modules/next/dist/docs` for `AI agent hint` before making changes to caching, streaming, or navigation — do not assume standard Next.js semantics apply.

## Commands

```bash
npm run dev      # start dev server (Turbopack, forces IPv4 DNS resolution)
npm run build    # production build
npm run start    # run production build
npm run lint     # eslint
```

There is no configured test runner (`playwright` is a devDependency but there is no `playwright.config.*` or spec files in the repo, and no `test` script). Don't assume `npm test` works — verify manually or ask before adding a test framework.

## Architecture

**Stack**: Next.js 16 App Router, React 19, Supabase (Postgres + Auth + Storage), Stripe (+ crypto payments), Tailwind v4, Tiptap editor, Resend for email.

### Auth & access control (three layers)

1. **`proxy.ts`** (root) — runs on every matched request. Refreshes the Supabase session, redirects unauthenticated users away from protected routes (`/dashboard`, `/admin`, `/create-event`, `/create-fundraiser`, `/create-organizer`, `/my-tickets`), blocks suspended accounts, and bounces logged-in users away from `/login`/`/signup`. It also gates `/articles/:slug` — it does a lightweight REST fetch (service role, no full DB client) to decide visibility before the page starts streaming, because per this Next.js version's streaming semantics, `notFound()` can no longer change the HTTP status code once the response has started streaming with 200.
2. **`app/admin/layout.tsx`** — calls `requireAdmin()` (from `lib/auth.ts`) for role enforcement on everything under `/admin`.
3. **`lib/auth.ts`** — server-only RBAC helpers (`getCurrentUser`, `getCurrentUserProfile`, `isAdmin`, `isOrganizer`, `requireAdmin`, `requireAuth`). Role/status checks use a service-role Supabase client to bypass RLS for the `profiles` lookup; never import these in client components.

### Supabase clients — pick the right one

- `lib/supabase.ts` — browser client (`createBrowserClient`), for client components.
- `lib/supabase-server.ts` — `createSupabaseServer()`, async, reads/writes cookies via `next/headers`; use in Server Components, Server Actions, Route Handlers.
- `lib/supabase-admin.ts` — service-role client, bypasses RLS. Only use server-side for privileged operations (role checks, admin mutations, webhook processing); never expose to the client.
- DB schema lives in `db/` as sequential `migration_NN_*.sql` files (currently up to 36) plus feature schema files (`*_schema.sql`) and a consolidated `schema.sql`. Check the latest migration number before adding a new one.

### Domain areas (mirrors `app/` route groups and `app/api/`)

- **Events & fundraisers**: core marketplace listings, each with a create flow (`create-event`, `create-fundraiser`, `create-organizer`), dashboard management, and public detail pages.
- **Businesses**: newer listing type (see `migration_36_business_listings.sql`) with its own crypto + unified payment selector modal (`components/payments`), moderated via the admin panel.
- **Articles**: CMS-style content with `draft`/`scheduled`/`archived`/`expired`/`rejected` statuses and `public`/`private` visibility, access-controlled in `proxy.ts` (see above). Server actions in `lib/actions/articles.ts`.
- **Payments**: Stripe (`@stripe/stripe-js`, `@stripe/react-stripe-js`) plus a custom crypto payment path; webhook handling under `app/api/webhooks/stripe`. Order/ticket flow spans `create-payment-intent`, `checkout`, `seats`, `send-ticket`, `receipts`, `certificates`.
- **External imports**: Eventbrite and GoFundMe sync (`app/api/eventbrite`, `app/api/eventbrite-sync`, `app/api/gofundme-sync`, `db/eventbrite_sources_schema.sql`, `db/gofundme_sources_schema.sql`) plus a generic `import-url` endpoint, all feeding `app/external-events` and `app/import`.
- **Admin**: `app/admin/*` (articles, businesses, events, fundraisers, organizers, payments, reviews, settings, users) — moderation panels with stats/filters/search/row actions, gated by `requireAdmin()`.
- **Scheduled jobs** (`vercel.json` crons): `/api/cron/daily-post` (14:00 UTC) and `/api/cron/promotion-engine` (18:00 UTC); logic lives in `lib/promotionEngine.js` and related `lib/*` modules.

### Security headers / CSP

`next.config.ts` builds a strict CSP dynamically (allowing Stripe, Supabase origin, Google Analytics, OpenStreetMap tiles, etc.) and disables `unsafe-eval` in production, gated on **both** `NODE_ENV` and Vercel's `VERCEL_ENV` (the latter can't be spoofed by a misconfigured `.env`). When adding a new third-party origin (images, fonts, iframes, XHR), update the corresponding directive array here rather than loosening `default-src`.

### Misc

- `scratch/` is git-ignored from lint and is where throwaway debug/simulation scripts belong (e.g. webhook simulators) — don't put real code there.
- `hooks/` holds shared client hooks (`use-dashboard-export`, `use-dashboard-params`, `use-image-upload`); prefer these over ad hoc `useState`/`useEffect` duplication in dashboard/admin pages.
