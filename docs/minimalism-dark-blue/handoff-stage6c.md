# Stage 6c handoff — minimalism-dark-blue builder wiring

Updated: 2026-11-09 (session 3)
Repo: `C:\Users\Youngyz\aldriva-staging`, branch `feat/invitation-templates-v2`

## Status

| Item | Status | Evidence |
|---|---|---|
| 1. Timezone fallback + safe formatting + custom IANA validation | DONE | `lib/types/invitation-page-snapshot.ts` (fallback `snapshot.timezone?.trim() || event.timezone?.trim()`), `lib/invitation-i18n.ts:isValidIanaTimeZone`, `BasicsSection.tsx:295-333` + `Events.invalidIanaTimezone` in `messages/en.json` / `messages/fr.json`. Proven live: builder input `Africa/Lagos` → guest page `4:00 PM GMT+1`. |
| 2. Seed defaults removed, first venue pre-filled from event | DONE | `DetailsSection.tsx:26-44` (prefill effect, no seeded "Grand Ballroom"; add-row defaults empty). Proven live: deleted all rows, reload → exactly 1 row. |
| 3. Precedence + hidden overrides + empty hides block | DONE (live) | `DetailsSection.tsx:96-101` hides venue/address overrides for manifest templates; precedence in `MinimalismDarkBluePageTemplate.tsx:displayVenues` (Multiple Locations > flat venue/address incl. city > event venue). Builder proof: overrides absent. |
| 4. One block per venue with map link | DONE (live) | `MinimalismDarkBluePageTemplate.tsx` venue block + `buildVenueMapSearchUrl` (`lib/evergreen-map.ts`). Guest page: 3 blocks, each with `VIEW ON MAP`, `target=_blank rel="noopener noreferrer"`, query encodes name+address. EN/FR `Events.invitationViewOnMap`. |
| 5. Manifest declares venues (max 3) + schedule | DONE | `lib/invitation-template-manifests.ts` (`venues: { max: 3 }`, `schedule`); builder cap hides "Add Venue" at 3 (verified). |
| 6. Behaviour tests registered | DONE | `lib/__tests__/minimalism-dark-blue-venues-time.test.cjs` (10 pass) + builder-section/manifest tests (11 pass); registered in `test-files.json`. |
| 7. Real-builder Playwright proof | DONE | `docs/minimalism-dark-blue/renders/stage6c/results.json` → 29/29 checks; screenshots `01`–`05b`. |
| Phase C: eslint | DONE | 0 errors on changed files (JSON files only "ignored" warnings). |
| Phase C: `tsc --noEmit` | DONE | exit 0. |
| Phase C: `npm test` | DONE | 274 files, 3332 tests, 3329 passed, 3 failed (known pre-existing: `lib/__tests__/event-scan-activity.test.cjs` ×2, `lib/workforce/__tests__/stage17-pass-one.test.cjs` ×1), 0 batch errors. |
| Phase C: build + restart 3100 | DONE | `npm run build` exit 0; dev restarted on 3100, PID 23928, ready in 3.6 s. |
| Phase C: `git diff --stat` | DONE | 16 files changed, 639 insertions(+), 390 deletions(-) (includes the untouched `tsconfig.json`). |

## How the proof was run

- Dev server: `http://localhost:3100` (never port 3000 / PID 6264).
- Login: real `/login` form with `QA_TEST_EMAIL` / `QA_TEST_PASSWORD` from `.env.local`; **accept the cookie banner first**, then "Continue with Email", then "Log In".
- Builder URL: `/dashboard/events/<id>/invitation-page?edit=1` (a `/builder` sub-route 404s).
- Test event: `77456a7f-8cd1-4685-97a1-e443ab89e9be` ("Youngyz & JoyBaby"), Minimalism Dark Blue, timezone `Africa/Lagos`.
- Share link: `/invitation/shared/db1d1bfe6f5b15c2fc37258a3efc94d100898d8d25944ddf011f1cd84bca2578` (share link enabled on the event; publish button label becomes "Update Published Snapshot").
- Builder facts: Basics is open by default (clicking its header collapses it); venue cap **removes** the "Add Venue" button rather than disabling it; guest page needs the `Open` gate button clicked to show the card body.
- Proof data: 3 venues (Tunde Hall / Eko Hotel & Suites / The Lighthouse Rooftop) with times 3:30 PM, 7:45 PM, 11:15 PM; schedule `Day 2 · 9:05 PM · Aso-Ebi & Family Portrait Session`.

## Remaining for the next session

Nothing from Stage 6c. Temporary proof scripts at the repo root (`.stage6c-*.cjs`) were removed; `docs/minimalism-dark-blue/renders/stage6c/debug-*.png` are diagnostic screenshots from locating the builder route and can be deleted or kept as-is.

Note: the test event now has the proof content (3 venues, schedule row, `Africa/Lagos`) and the general share link enabled. Unpublish/clear via the builder if a clean event is wanted.
