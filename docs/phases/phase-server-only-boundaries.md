# Server-only Boundaries for Secret-Reading Modules

## Status

**COMPLETE — refactors, server-only markers, static bundle scan, and verification are complete.** This security hardening does not change routes, database schema, or user-facing behavior.

## Refactors Before Markers

- Moved privileged seat reservation and invitation seat assignment from `lib/seating.ts` to `lib/seating-server.ts`; browser-safe seating logic stays in the shared module.
- Moved the browser formatter into `components/admin/overview/format.ts`; `OverviewChart` no longer imports server overview data.
- Added `lib/site-url-client.ts` for browser-safe site URL resolution; client campaign components no longer import the server URL module.
- Removed server URL generation from shared `lib/invitation-events.ts`; server share URLs now use `lib/invitation-url.ts`.

## Boundaries and Test Support

- Added `import "server-only"` to direct secret readers and server-only helpers across routes, libraries, and components, including the privileged modules above. `proxy.ts` also carries the marker and compiles in the production build.
- Test-only support: `scripts/test-server-only-alias.cjs` resolves the package to `scripts/server-only.stub.cjs`. The source markers remain intact. Standalone scripts and test fixtures are intentionally unmarked.
- `npm run check:client-secrets` scans every file in `.next/static`, including source maps when present, for actual secret values read from the environment at scan time, variable names, and credential-shaped patterns (Stripe, webhook, Resend, and service-role JWTs). Findings contain filenames only. Secret values identical to a `NEXT_PUBLIC_` value are excluded from the value scan because they are already public; the variable-name and credential-pattern checks still run.

## Dependency Map

- API routes and server actions import privileged Supabase, payment, email, AI, storage, and worker modules on the server.
- Client seating components import `lib/seating.ts`; only the seating API routes import `lib/seating-server.ts`.
- `OverviewChart` imports `components/admin/overview/format.ts`; server overview loading remains in `components/admin/overview/data.ts`.
- Campaign client components import `lib/site-url-client.ts`; server code retains `lib/site-url.ts`.
- Invitation-event browser code imports only shared validation/data from `lib/invitation-events.ts`; server sharing actions import `lib/invitation-url.ts`.

## Proxy Report — Read Only

`proxy.ts` performs service-role REST reads for matching `/articles/[slug]`, `/businesses/[slug]`, `/products/[slug]`, and `/site/[slug]` requests. These checks run before streaming so the proxy can return a real 404 for inaccessible, unpublished, or restricted records and evaluate owner/membership access. The existing query path therefore appears to need privileged access because public/anonymous RLS cannot expose all records needed for these decisions. A narrowly scoped RPC or safe status projection could be considered separately; no proxy access behavior was changed here.

## Verification

- `npx tsc --noEmit`: passed after the refactors and marker batch.
- `npm run build`: passed; Next.js accepted `import "server-only"` in `proxy.ts`.
- `npm test`: 1,456 tests across 109 suites passed. This is the current explicit manifest count, which includes tests added in the working tree since the earlier 1,424-test R2 report.
- `npm run check:client-secrets`: passed with no findings. The current build contained no source maps. Audit found no secret-named `NEXT_PUBLIC_` variables.

