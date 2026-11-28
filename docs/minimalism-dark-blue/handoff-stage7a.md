# Stage 7a — catalog entry, page-only cleanup, legacy fallback

Updated: 2026-11-09
Repo: `C:\Users\Youngyz\aldriva-staging`, branch `feat/invitation-templates-v2`
Server: dev on port 3100 only (PID 3000/6264 untouched).

## Phase A — audit evidence

### 1. Why the template was not on "Invitation templates"

- Page: `app/invitations/templates/page.tsx:36-46` reads `getPublicTemplateCatalog()` / `getPublicTemplateCategories()`.
- Feed: `lib/invitation-template-public-catalog.ts:53-57` filters `INVITATION_TEMPLATE_REGISTRY` to `publicationStatus === "published"`.
- Registry entry: `lib/invitation-template-registry.ts:262` had `publicationStatus: "unlisted"`, so both the public catalog and `getPublicTemplateSummary` (`:61-66`) returned nothing.
- A catalog entry shape (`PublicTemplateSummary`, `lib/invitation-template-public-catalog.ts:24-33`): `{ id, name, description, category, categoryLabel, features: { blockTypes, effects, customizations }, preview: { kind: "rendered-sample", sampleId } }`.

`getTemplateById` callers (only the invitation registry function):
- Definition: `components/invitation/templates/registry.ts:92-96` (was `found || INVITATION_TEMPLATES[0]`).
- No runtime caller imported `getTemplateById`; only `lib/__tests__/invitation-page-phase3.test.cjs:226-237` documents it.
- Crash risk was in direct `INVITATION_TEMPLATES[0]` users:
  - `components/invitation/InvitationTemplateSelect.tsx:92` → `selected.id` crashed with an empty list (file deleted in step 6).
  - `app/invitation/preview/PreviewSandboxClient.tsx:268` → `currentTemplate.category` at `:276` crashed with an empty list.
  - `PublishSection.tsx:54`, `UnifiedTemplatePicker.tsx:84` use `.find()` only and were safe.

### 2. Invitation card / envelope surfaces for minimalism-dark-blue

| Surface | File | Kind | Verdict |
|---|---|---|---|
| Builder unified picker page tile | `components/invitation/UnifiedTemplatePicker.tsx:229-253` | small **separate card inset** (gray placeholder for page-only) | remove inset for page-only |
| Builder unified picker detail preview | `:523-566` | page preview + optional card tab | keep page, hide card tab/lookup |
| Public gallery tile | `components/invitation/marketplace/InvitationTemplateGalleryCard.tsx:22-27` | live **page** render, no card | keep |
| Details hero | `InvitationTemplatePreviewFrame.tsx` | live **page** render | keep |
| Demo route | `app/invitations/templates/[templateId]/demo/page.tsx` | full **page** | keep |
| Share page | `app/invitation/shared/[token]/page.tsx` | page via `UniversalPageRenderer`, no card | keep |
| Guest card fallback | `app/invitation/[token]/InvitationClient.tsx:88-104` | separate card only when a card template exists | not reachable: `cardSlug` is `null` (`lib/unified-invitation-templates.ts:146-154`) and the RPC writes a null card id (`lib/actions/unified-invitation-template.ts:101-109`) |
| Email art | `lib/invitations.ts:537-543` | card PNG only when `event.invitation_template_id` exists | not reachable for page-only (null) |
| Opening screen | `components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx:820-886` | **page's own** click-to-open gate | KEEP |

### 3. Legacy files under `components/invitation/` (importers outside own folder / tests)

Zero-importers (deleted in step 6):
- `templates/InvitationTemplate1.tsx` — 0 importers; tests: expandable-qr, music-links, sharing, page-phase3, page-builder.
- `templates/InvitationTemplateBirthday.tsx` — 0; tests: expandable-qr, music-links, sharing, page-phase3, page-builder.
- `templates/InvitationTemplateBlackTie.tsx` — 0; tests: expandable-qr, music-links, sharing, page-phase3, page-builder.
- `templates/InvitationTemplateCover.tsx` — 0; tests: expandable-qr, image-presentation, music-links, unified.
- `templates/InvitationTemplateWedding.tsx` — 0; tests: expandable-qr, image-presentation, music-links, music-persistence, sharing, page-phase3, page-builder.
- `templates/InvitationStoryMoments.tsx` — 0 after the five above; tests: image-presentation, music-persistence.
- `SharedNote.tsx` — 0 after the five above; no tests.
- `InvitationTemplateSelect.tsx` — 0 importers; no tests (only string-absence assertions in builder/home tests).
- `TemplateSurface.tsx` — 0 importers; tests: page-phase3.

Kept (registry importers, not legacy orphans): `templates/botanical-reverie`, `evergreen-envelope`, `luxe-editorial`, `romantic-envelope`, `invitation-sample-data.ts`, `invitation-sample-media.ts`, `InvitationPageComponentRegistry.tsx`, `registry.ts`, `InvitationCardRenderer.tsx`, `BotanicalStationeryCard.tsx`, `LuxeEditorialInvitationCard.tsx`, `InvitationGalleryGrid.tsx`, `FloatingMusicControl.tsx`, `InvitationDevicePreviewFrame.tsx`, `marketplace/*`.

Legacy `template_id` behavior before the fix: `legacyInvitationTemplateToLayout()` returned a generic standard block layout for an unknown id (`lib/invitation-page-layout.ts:202-273`), the renderer skipped the custom page (`InvitationBlocksLayoutClient.tsx:96`), and the builder kept the unknown id. It did not crash, but it was not minimalism.

## Phase B — work completed

| Item | Status | Evidence |
|---|---|---|
| 4. Catalog entry | DONE | `publicationStatus: "published"` (`lib/invitation-template-registry.ts:263`); catalog/details/create now list it. `getTemplateById` always returns an entry (published → builder → default). `InvitationTemplateSelect` / `PreviewSandboxClient` no longer dereference an empty list. |
| Thumbnail | DONE | The gallery/details preview uses the existing live 390px page render (`InvitationTemplatePreviewFrame` → `InvitationBlocksLayoutClient`). Stage 7a screenshots render it at 390px. |
| 5. Remove separate card UI | DONE | `UnifiedTemplatePicker` renders the card inset only when `card` exists and shows the card tab only for paired cards; page-only details still preview the page. Opening screen untouched. |
| 6. Legacy cleanup | DONE | 9 files deleted (list above); every test reference removed; `test-files.json` unchanged for deletions (files were source reads, not test files). Legacy ids normalize to `minimalism-dark-blue` in `resolveInvitationTemplateId`, layout and renderer chokepoints. |
| 7. Behaviour tests | DONE | `lib/__tests__/minimalism-dark-blue-stage7a.test.cjs` (11 tests) registered in `test-files.json`; updated `invitation-template-page-only-pair`, `invitation-local-template-picker`, and the source-shape suites. |

## Browser proof (port 3100, QA login)

Script: `.stage7a-playwright.cjs` (temporary). Flow: cookie consent → email login → `/invitations/templates` → card → details → Create → `/demo` gate → Open.

Results: PASS. Catalog lists exactly 1 published template (`Minimalism Dark Blue`) with a live gate thumbnail; details shows the page preview + Create/Preview and no card; Create loads the page-only builder preview with no card; the 390px demo shows only the navy opening screen, and Open reveals the full page. No `[data-card-slot]` on any surface.

Screenshots (`docs/minimalism-dark-blue/renders/stage7a/`):
- `01-catalog-1280.png`
- `02-details-1280.png`
- `03-create-1280.png`
- `04-demo-gate-390.png`
- `05-demo-open-390.png`

Note: the first browser run exposed dev-worker degradation (`Jest worker encountered 2 child process exceptions`) on template routes and an unrelated dashboard builder route. Restarting only the 3100 dev server fixed it; all routes then returned 200 with zero worker errors.

## Phase C - verification (this session, 2026-11-10)

| Step | Status | Evidence |
|---|---|---|
| eslint changed files | DONE | 0 errors / 0 warnings on the 8 changed source/test files. |
| Playwright re-proof | DONE | Fresh run PASS at 02:51-02:53 on 10/11/2026: catalog 1 card, details, Create, gate -> page, no `[data-card-slot]`. Screenshots overwritten in `renders/stage7a/`. |
| `tsc --noEmit` | DONE | exit 0 (with the pre-existing uncommitted `tsconfig.json` exclude). |
| `npm test` | DONE | 275 files, **3322 tests, 3319 passed, 3 failed**, 0 batch errors. Failures are exactly the known ones: `lib/__tests__/event-scan-activity.test.cjs` x2 (batch 1), `lib/workforce/__tests__/stage17-pass-one.test.cjs` x1 (batch 3). Delta vs stage6c (274 files / 3332 tests): **+1 file, -10 net tests** = +11 stage7a tests - 21 tests removed from the legacy-cleaned suites. |
| build | DONE | `npm run build` exit 0; route table printed, `ƒ Proxy (Middleware)` present. |
| restart 3100 | DONE | `npx next dev -p 3100`, listening **PID 40848**, `/login` -> HTTP 200. |
| `git diff --stat` | DONE | 30 files changed, 136 insertions(+), 5354 deletions(-). No commit made. |

Test-runner note: the first `npm test` attempt timed out (ETIMEDOUT, 5-min batch cap) on batches 1-2 while the long-lived dev server was competing for CPU; after stopping PID 12156 the re-run completed all 3 batches with 0 execution/count errors.

Note: `tsconfig.json` already carries an uncommitted exclude addition (`playwright-tests`, `test_templates.spec.ts`) from the crashed session; left untouched per STEP 0. It is included in the 30-file diff and is not committed.
