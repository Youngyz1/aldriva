# Order Tracking 404 — Investigation and Fix Plan

## Goal
Diagnose and fix customer "Track My Order" → Page Not Found using repo evidence, then add regression tests. No speculative changes.

## Constraints
- Read-only until root cause confirmed.
- No DB writes, migrations, payments, notifications.
- Preserve tenant isolation and anonymous tracking.
- No commits/pushes.

## Key files
- URL generation: `components/site/blocks/StorefrontBrowse.tsx` (~2932, ~3011)
- Route: `app/site/[slug]/orders/[tracking_token]/page.tsx` (slug lookup lines ~57-65; order lookup lines ~76-118)
- Proxy/middleware: root `proxy.ts`

## Investigation steps
1. Confirm branch + `git status --short`; preserve user changes.
2. Trace slug source in StorefrontBrowse and order success payload.
3. Trace token creation/persistence in `lib/order-submit.ts`.
4. Inspect `proxy.ts` public-route allowlist for `/site/.../orders/...`.
5. Compare website slug (tenant_websites.slug) vs order.organizer_id.
6. Distinguish `notFound()` (slug miss / order miss) from route-level 404.

## Evidence needed before fix
- Redacted staging: does website slug resolve? does order token exist? organizer match?
- If unavailable, report undetermined and stop (no speculative fix).

## Candidate fix classes (only if evidenced)
- Correct slug/token passed to URL.
- Ensure token persisted before link shown.
- Correct overly restrictive order lookup.
- Handle upstream errors distinctly from not-found.

## Tests to add (after confirmed cause)
- Valid tracking URL resolves.
- Unknown token → notFound.
- Mismatched slug cannot expose order.
- Anonymous access works.
- Missing token/slug → no usable link.

## Validation
- `npx tsc --noEmit`, focused tests, `git diff --check`.
- Report exact commands/results.

## Open question
Is staging DB access available for redacted metadata checks? If not, root cause remains undetermined.
