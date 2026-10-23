# Phase 2 — Website and Invitation Builder Staging Investigation

Date: 2026-10-23

Status: the first Website Builder fix was insufficient. The remaining Vercel runtime cause is now confirmed, and a targeted dependency fix plus regression test and route error boundary are committed and deployed. Authenticated post-fix UI verification remains pending.

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

## Phase 2 follow-up — remaining runtime failure

- Vercel logs for the deployed `staging` builder route show the same `ERR_REQUIRE_ESM` chain even after `CanvasBlockPreview` became client-only. The route also statically imported `TemplateSwitchPreview`, which renders `BlockRenderer`; `BlockRenderer` imports `lib/sanitize-html.ts`, which loads `isomorphic-dompurify` and `jsdom` during server route module evaluation. The template-switch preview is part of the actual server module graph, so the earlier canvas boundary alone could not prevent the failure.
- The lockfile resolved `jsdom@29.1.1` → `html-encoding-sniffer@6.0.0` → `@exodus/bytes@1.15.1`. The exact `ERR_REQUIRE_ESM` is documented in the upstream [`html-encoding-sniffer` issue](https://github.com/jsdom/html-encoding-sniffer/issues/23); Vercel's log stack matches it. `jsdom@27.3.0` resolves `html-encoding-sniffer@4.0.0` and does not include the offending dependency.
- Added an npm override for `jsdom@27.3.0`, keeping the existing server HTML sanitizer and full template-switch rendering. Added a regression in `lib/dashboard/__tests__/website-builder-canvas.test.cjs` that inspects the actual nested manifests used by `isomorphic-dompurify` and runs malicious HTML through `sanitizeArticleHtml`. Added a route `error.tsx` boundary that logs the caught error and digest while presenting a retry UI; this does not replace server logs.
- No invitation-builder or sanitizer policy code was changed. No CSP, permission, validation, or tenant-isolation control was weakened.

### Follow-up local verification

- Focused Website Builder + sanitizer tests: 21 passed, 0 failed. Full `npm test`: 2,734 passed, 0 failed, 0 skipped across 220 files.
- `npx tsc --noEmit -p tsconfig.build.json --pretty false`: passed. Focused ESLint on the new error boundary and regression test: passed with no diagnostics. `git diff --check`: passed.
- `npm run build` (configured Next.js 16.3.4 Turbopack build): passed; TypeScript completed and all 386 static pages generated.
- The previously reported ESLint error remains at `app/m/[token]/page.tsx:54` (`react-hooks/error-boundaries`, JSX inside a `try/catch`). That Phase 1A-touched file's diff is an icon import; it is unchanged in this follow-up. `npx eslint 'app/m/[token]/page.tsx'` reproduces the error.
- Post-follow-up authenticated staging browser checks have not run: browser use is disabled in this Codex Work session. No website data was created or changed.
- Commit `0ed6548c053ac543caa1ff4ef3d80cce22fd4539` (`fix(website-builder): pin compatible jsdom runtime`) was pushed to `staging`. Vercel deployment `dpl_Hg6gUNRdsPj1ib3ah7u36maLoLFp` is `READY` for that exact commit at `https://aldriva-5sday95ti-ofiliyoungyz-specs-projects.vercel.app`.
- A post-deploy 10-minute Vercel error-log query returned zero records, but it also showed no authenticated builder invocation. This does not establish that the deployed route works.

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
- Vercel browser and function-log reproduction described above is from the deployed pre-change branch preview. At that checkpoint, the first canvas-only change had not yet been pushed; it was later included in the Phase 2 commit and deployed, but did not address this remaining route-level import path.

## Completion boundary

**Post-follow-up authenticated Vercel verification is pending.** Staging can only be called fixed after the deployed code is tested with authenticated organization and invitation data, including direct navigation, dashboard navigation, refresh, browser errors, failed requests, and Vercel function logs. The prior inventory did not find populated legacy canvas/rich-text content; check again after deployment, and ask before creating a disposable test draft if no suitable existing content is available. The current session also has browser use disabled, so authenticated UI verification needs an enabled browser session.
