# Phase 2 — Website and Invitation Builder Staging Investigation

Date: 2026-10-23

Status: two successive Website Builder runtime fixes have been insufficient to date. New Vercel logs confirm a second `ERR_REQUIRE_ESM` failure in the JSDOM CSS dependency chain. A revised `jsdom@26.1.0` pin, related Next.js/DOMPurify security updates, and regression test pass focused/full tests, production typecheck, focused lint, and configured build locally. The revised fix has not yet been deployed. Authenticated post-fix UI verification remains pending.

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

## Production incident follow-up 2 — JSDOM CSS dependency failure (2026-10-23)

### New deployed evidence

- Vercel CLI listed `https://aldriva-1zsrpxhpt-ofiliyoungyz-specs-projects.vercel.app` as the newest READY preview (`dpl_1216exwW5azwnT5wA3pMNAahb8Cq`), above the previous fix deployment. Its runtime error query returned two records with this stack head: `Failed to load external module jsdom… ERR_REQUIRE_ESM: require() of ES Module …/@csstools/css-calc/dist/index.mjs from …/@asamuzakjp/css-color/dist/cjs/index.cjs not supported.` The stack continues through `lib_sanitize-html` and the server `components_site_blocks` bundle. The runtime log record did not include a request path, so the exact browser request could not be correlated by request ID/path.
- The route source imports `TemplateSwitchPreview`, which renders `BlockRenderer`; `BlockRenderer` statically imports `sanitizeArticleHtml`. The package tree in the earlier fix was `jsdom@27.3.0` → `cssstyle@5.3.7` → `@asamuzakjp/css-color@4.1.2` → ESM-only `@csstools/css-calc@3.2.1`. This is a concrete module-evaluation failure in the builder's server module graph and matches the reported stream closure. React's official error page decodes #412 as “Connection closed.”
- The CSP rejection of Vercel's feedback script is a separate client feedback script and does not explain this server module exception. The stylesheet preload warning has no matching server stack evidence. Neither was changed.

### Route rendering and cache findings

- `next.config.ts` has `cacheComponents: true`. The configured production build marks `/dashboard/org/[id]/website/builder` with `◐` (Partial Prerender), meaning the build emits a static shell and streams dynamic server content. `proxy.ts` also documents `x-nextjs-prerender` / `x-nextjs-postponed` as markers used by that shell behavior. Thus `x-nextjs-prerender: 1` is expected for this route under the current build configuration; it does not by itself mean the authenticated page was fully statically generated.
- The parent organization layout and builder page call `getCurrentUser()` and `checkTenantAccess()` before loading tenant website/builder data. The dynamic auth/data path is request-dependent. The Vercel cache HIT can represent the partial static shell; it is not proof that organization data is shared. The authenticated cached and fresh response bodies were not compared, so response-level tenant isolation was not independently confirmed in this session.
- A source search found no service-worker registration or service-worker implementation under app/public. This makes an application-controlled document-navigation service worker unlikely, but the browser's installed worker state could not be inspected here.

### Local corrective change and verification

- Changed the npm `jsdom` override and test dependency from `27.3.0` to `26.1.0`. The installed tree now resolves `cssstyle@4.6.0`, `@asamuzakjp/css-color@3.2.0`, `@csstools/css-calc@2.1.4` with an explicit CommonJS export, and `html-encoding-sniffer@4.0.0`. Updated Next.js and `eslint-config-next` to 16.4.3 for related Cache Components security fixes and DOMPurify to 3.4.17 for sanitizer security fixes. Sanitizer code, policy, and allowlists remain unchanged.
- Extended `lib/dashboard/__tests__/website-builder-canvas.test.cjs` to verify the nested JSDOM, CSS style/color/calc, and encoding-sniffer versions/entry point, and to confirm script/event-handler payloads remain removed.
- On the updated dependencies, focused Website Builder, block-renderer, and template-switch suites passed 39 tests; `npm test` passed 2,734 across 220 files with no skips; production TypeScript and focused ESLint passed; configured Next.js 16.4.3 Turbopack `npm run build` passed and generated 386 static pages. The build emitted a warning that Cache Components lacks an explicit `partialPrefetching` setting. `git diff --check` will be rerun after report edits.
- An unauthenticated request to the local production route returned 307 to `/login`, with no JSDOM/ESM error in the server output. This checks the local server module can load; it does not exercise authenticated editor rendering.
- The updated dependencies are installed locally and match the lockfile (`next`/`eslint-config-next` 16.4.3, DOMPurify 3.4.17, jsdom 26.1.0). Focused/full tests, production typecheck, focused lint, and production build pass locally. Deployment and authenticated verification of the revised fix remain pending. No local data was written.

### Remaining acceptance checks

**The incident remains open.** Browser use is disabled in this Codex Work session, and the updated commit is not yet deployed. After deployment, an authenticated browser must verify the exact commit on staging: direct route, dashboard navigation, refresh, builder shell/canvas, selecting a block, a rich-text block through the existing sanitizer, preview loading, console/network/RSC errors, Invitation Builder health, and matching Vercel logs. Recheck for an existing authorized populated site. If no rich-text site exists, obtain approval before creating any disposable staging draft. Do not edit/publish a customer site or start Phase 3/First Strike before those checks.
