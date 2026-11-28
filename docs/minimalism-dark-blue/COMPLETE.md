# Minimalism Dark Blue — Complete

## What shipped

- **Template**: Minimalism Dark Blue invitation page (tap-to-open cover gate, navy/cream palette, scroll-reveal sections).
- **Marketplace**: public gallery (`/invitations/templates`), a details page, and a demo page per template.
- **Anonymous builder**: `/invitations/templates/minimalism-dark-blue/create` — no login required. Drafts persist in the browser (IndexedDB), not on the server.
- **Promotion to a real event**: signing in from the builder converts the local draft into a server-owned event at `/invitations/promote`.
- **Memories gallery**: guest-photo wall with sample data in previews/demo, real approved photos once a real event exists.
- **Demo music**: a sample track starts when the visitor taps "Open" on the demo's cover gate, with a visible on/off control.
- **Map embed**: venue section renders a Google Maps iframe (or a link-only fallback) sized to match the Reception Information card.
- **Public entry links**: a signed-out visitor can reach the template gallery from the primary nav and from the Events page, without touching the authenticated event-creation flow.

## Key files

- `components/invitation/templates/minimalism-dark-blue/MinimalismDarkBluePageTemplate.tsx` — the page renderer (cover gate, sections, demo music control).
- `components/invitation/blocks/InvitationBlockRegistry.tsx`, `InvitationPresentationBlocks.tsx`, `InvitationBlocksLayoutClient.tsx` — shared block system (location_map, music, gallery, etc.).
- `lib/invitation-template-registry.ts` — template definition (composition, block types, effects).
- `lib/invitation-template-manifests.ts` — manifest-driven custom fields for the builder.
- `lib/invitation-template-preview-data.ts` — sample-data merge for demo/builder-preview/gallery-card; `demoRoute` option gates demo-only content (e.g. the sample music track) so it never leaks into other previews.
- `app/invitations/templates/page.tsx`, `[templateId]/page.tsx`, `[templateId]/demo/page.tsx`, `[templateId]/create/page.tsx` + `AnonymousInvitationBuilderClient.tsx` — the public marketplace + anonymous builder routes.
- `lib/invitation-local-draft.ts` — IndexedDB-backed local draft store, image validation, gallery budget.
- `lib/invitation-local-draft-promotion.ts`, `lib/invitation-promotion-core.ts`, `lib/actions/invitation-events.ts` (`promoteLocalInvitationDraftServer`, `confirmOwnedInvitationEvent`) — promotion pipeline.
- `app/invitations/promote/page.tsx` — the post-login landing route that runs the promotion.
- `components/invitation/useLocalInvitationBuilderAdapters.ts` — wires the local-draft store into the builder's persistence context.
- `components/memories/MemoriesGallery.tsx`, `lib/memories/public-gallery.ts` — guest memories.
- `lib/evergreen-map.ts` — pure URL builders for the map embed and the "Open in Google Maps" link.
- `components/nav/HomeAdaptiveNav.tsx`, `app/events/EventsHero.tsx` — public entry links.
- `db/migration_234_unified_template_page_only.sql` — the one schema change this template needed (see Known Limits).

## How the publish handoff works

1. A signed-out visitor builds a draft in the browser; it's saved to IndexedDB only (`lib/invitation-local-draft.ts`), never sent to the server.
2. Tapping Publish/Sign-in calls `handleLocalSignInToPublish`, which checks the current session. Signed in → goes straight to `/invitations/promote?draftId=...&template=...`. Signed out → `/login?redirect=<that URL>` (signup carries the same redirect).
3. `/invitations/promote` re-checks the session client-side, then calls `promoteLocalDraft(draftId, userId)`.
4. That uploads any cached local images, then calls the server action `promoteLocalInvitationDraftServer`, which creates the event in **draft** status (idempotent via a deterministic slug) and saves the invitation page with the server-resolved `template_id` — the client's `template_id` is never trusted directly.
5. `confirmOwnedInvitationEvent` verifies ownership before the user is sent to the real dashboard event.

## Gate results

Baseline: **28 failing tests across 11 files**, confirmed identical to a clean staging clone (`base-test.out`, captured from `aldriva-staging-clean`) — pre-existing and unrelated to this port. Every step in this body of work diffed its own test run's failing-file list against that baseline and found it unchanged.

## Known limits

- (a) Signup with a brand-new email was not verified live end-to-end; the staging URL must be on the Supabase Auth redirect allow-list for confirmation emails to land correctly.
- (b) The unified-template-page-only SQL was already applied on staging as migration 223; this repo stores the same migration as **234** (its correct next-free number locally — see the renumber commit). Migration 221 was already applied. No new SQL needs to run for this template.
- (c) `cms-media` is Supabase Storage, not Cloudflare R2 (enforced by `lib/invitation-image-url.ts`'s URL validator).
- (d) The demo music on/off icon can visually lag actual playback state by roughly a second right after the cover gate opens (the `play()` promise resolves after playback has already begun); the underlying `paused` state and the toggle are correct throughout.
- (e) At desktop widths, the map is intentionally narrower than the Reception Information card (unchanged pre-existing behavior) — only the mobile width was required to match.
- (f) Creating events, fundraisers, and businesses still requires login. Only invitations have the anonymous local-draft flow; the public entry links added here route to the invitation template gallery only.

## How to add the next template

1. **Registry**: add an entry to `lib/invitation-template-registry.ts` (id, composition, `defaultBlockTypes`/`supportedBlockTypes`/`requiredBlockTypes`, `pageRenderer`, supported effects).
2. **Manifest** (if the template needs custom builder fields beyond the standard blocks): add to `lib/invitation-template-manifests.ts`.
3. **Page template component**: `components/invitation/templates/<new-template-id>/<NewTemplate>PageTemplate.tsx`; wire it into `InvitationBlocksLayoutClient.tsx` if it needs a custom (non-generic-blocks) renderer.
4. **Demo sample data**: add a sample `InvitationPageData` object to `components/invitation/templates/invitation-sample-data.ts`, and extend `lib/invitation-template-preview-data.ts` if the template needs its own demo-only content gated by `demoRoute`.
5. **Gallery card**: the public catalog (`lib/invitation-template-public-catalog.ts`) picks up a new registry entry automatically; add a card preview image.
6. **Tests**: a unit test file under `lib/__tests__/` for any new pure logic, registered in `test-files.json`.
