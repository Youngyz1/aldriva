# Phase 2 — Website and Invitation Builder Staging Investigation

Date: 2026-10-23

Status: Website Builder root cause reproduced on Vercel and locally changed; configured production build and authenticated local production route checks pass. The changed code has not been deployed, so neither builder has been verified on a deployment containing the local change.

## Findings

### Website Builder

- An authenticated direct visit and refresh of the real organization Website Builder route on the current `staging` branch preview returned HTTP 200 with an empty body. The browser reported React error #412 and a failed RSC payload.
- Vercel function logs for that same route reported `ERR_REQUIRE_ESM`: the CommonJS `html-encoding-sniffer` path attempted to require the ESM-only `@exodus/bytes/encoding-lite.js` module. The stack included `jsdom`, `isomorphic-dompurify`, `lib/sanitize-html`, and the builder block preview.
- The builder statically imported `CanvasBlockPreview`; that editor-only component imported `sanitizeArticleHtml`, which loaded the server-side `jsdom` dependency chain during route module evaluation. The server module failure closed the RSC response. The official React decoder defines error #412 as “Connection closed,” consistent with that failure rather than evidence of a hydration mismatch.
- The targeted change in `components/dashboard/website/builder/canvas/CanvasBlockWrapper.tsx` dynamically imports the preview with `ssr: false`. The browser still renders the same preview and calls the existing HTML sanitizer. A short, accessible loading message appears while that editor preview chunk loads. No sanitizer, validation, permission, or tenant-isolation logic was removed.

### Invitation Builder

- On the current `staging` branch preview, an authenticated direct visit and refresh of a real invitation event's builder route returned HTTP 200 and rendered its editor controls and preview iframe once the streamed route had time to hydrate. The iframe preview also returned HTTP 200. The earlier immediate zero-body observation was a timing issue, not a reproduced persistent failure.
- The older `aldriva-staging.vercel.app` alias points to a September deployment at commit `5735655`, while the latest branch preview contains `7d1e3b2`. The older deployment did not expose an invitation event through the same authenticated list API, so a comparable real-data invitation route could not be tested there.
- The invitation route retains its existing event-kind and access checks, missing-data handling, retryable query-error state, and dashboard loading/error boundaries. No invitation-builder code change is justified by the current evidence.

## Runtime and separate browser warning

- Commit `7d1e3b2` is present in the current branch. The latest branch preview and the older alias both reported the Vercel Node.js 24 runtime. The package engine requirement is `>=22.13.0`, so a too-old configured Node runtime does not explain the observed module error.
- The lockfile resolves `isomorphic-dompurify@3.18.0` to `jsdom@29.1.1`, `html-encoding-sniffer@6.0.0`, and `@exodus/bytes@1.15.1`. The dependency is still loaded by the preview's SSR path despite the earlier URL-only sanitizer split.
- The `vercel.live` feedback script blocked by `script-src` is separate from the server module failure. It is deployment feedback UI, not a builder dependency. The Content Security Policy was not weakened.

## Verification

- Focused Website Builder canvas tests: 12 passed, including the new client-only preview boundary regression check.
- Production TypeScript check (`npx tsc -p tsconfig.build.json --noEmit`): passed.
- Focused ESLint on the changed component and test: passed with no diagnostics.
- Full suite (`npm test`): 2,733 passed, 0 failed, 0 skipped across 220 files.
- `git diff --check`: passed.
- Configured production build (`npm run build`, Turbopack): passed; TypeScript and all 386 static pages completed.
- Authenticated local production browser checks used the existing QA session and real event/organization records. The Invitation Builder direct route and refresh returned HTTP 200, rendered its editor and preview iframe, and had no page errors or mobile horizontal overflow. On desktop, navigation from event Overview through the Invitation Page sidebar and Edit invitation action reached the editor. No write/save action was performed.
- The local QA organization's Website Builder URL redirected to its website overview/setup page because that organization has no website. Using a real organization record from the authenticated staging list, the same isolated local production server rendered the Website Builder route with no browser page errors. That QA record had no canvas element hit targets, so this verifies the route's production render but does not exercise a rich-text block's client sanitizer call. The website dashboard navigation click was not completed in this check.
- An optional `--webpack` build used during isolated-build troubleshooting failed TypeScript checks on unrelated route-module exports in `app/api/courier/orders/[orderId]/issue/route.ts`, `app/api/invitation/[token]/card.png/route.ts`, `app/api/webhooks/stripe/route.ts`, and `app/site/[slug]/[[...page]]/page.ts`. The project's configured Turbopack build passed; those files were not changed.
- Vercel browser and function-log reproduction described above is from the deployed pre-change branch preview. The modified code has not been pushed or deployed.

## Completion boundary

**Post-change Vercel verification is pending.** This report records the pre-change deployment findings and local production checks. It does not claim that the client-only preview change has been verified on Vercel. Staging can only be called fixed after a deployment containing the change is tested with authenticated organization and invitation data, including direct navigation, dashboard navigation, refresh, browser errors, failed requests, and Vercel function logs. The vanity alias also needs to be aligned with the intended current staging deployment before it can represent the latest branch state.
