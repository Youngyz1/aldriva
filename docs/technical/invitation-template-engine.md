# Aldriva Invitation Template Engine

## Architecture audit (2026-10-16, before this change)

- The public guest route is `app/invitation/[token]/page.tsx`. It validates token shape, loads the invitation through `getInvitationByToken`, and only renders a published page snapshot. Published pages assemble page content with live event, guest, seat, and ticket data; an invitation without a published page keeps the existing invitation-card path.
- `InvitationPageSnapshot` separates published content from event and guest data. `event_invitation_pages.blocks_layout` is the draft JSONB column introduced by migration 178; publish freezes the normalized layout into `published_snapshot.blocks_layout`. Existing flat snapshot fields remain the compatibility source.
- `PageBlocksLayoutSchema` defines version 1, a theme, and ordered `{ id, type, content }` blocks. `lib/invitation-page-layout.ts` maps legacy template IDs and flat fields into that shape. `$bind` values resolve only through a finite reader map; no arbitrary path evaluation occurs.
- `UniversalPageRenderer` branches between invitation and business pages. Invitation blocks render through `InvitationBlocksLayoutClient`; business blocks are unwrapped and passed to the existing `parseBlock` / `BlockRenderer` pipeline. RSVP is enabled only in live invitation mode when the server action is supplied. Shared invitations show a neutral note, and builder preview selection is carried by same-origin `postMessage`.
- `lib/unified-invitation-templates.ts` is the card/page pairing catalog. `components/invitation/templates/registry.ts` is a separate data-only catalog. Actual microsite block defaults and template-specific conditions currently live in the legacy adapter. The old full-page TSX files remain in the repository but are not imported by the active invitation route; the active no-page fallback is the invitation card renderer.
- Reusable presentation code includes the hero, story, details, gallery, schedule, countdown, location map, music, and action portal blocks; QR and calendar behavior are shared in the action portal. The romantic envelope journey is currently part of the presentation-block module. The codebase uses Tailwind CSS v4; Framer Motion v12 is installed, but these invitation blocks currently use CSS transitions rather than Motion components.
- Invitation draft validation checks the general page-layout envelope and flat field constraints, but does not reject unknown invitation block types. The renderer's switch safely returns `null` for unknown types, which can conceal invalid saved configuration.

## Existing reusable infrastructure

Use the existing data contracts (`InvitationPageData`, `InvitationPageSnapshot`), `PageBlocksLayoutSchema`, theme/palette/font registries, `$bind` reader allowlist, `UniversalPageRenderer`, presentation blocks, `ActionPortalBlock`, invitation actions, guest-token access, QR/calendar helpers, and Tailwind design tokens. Migration 178 already supplies the required JSONB storage; no new database column is needed for a first registry/configuration slice.

## Identified limits

1. Template defaults, block ordering, and required romantic-envelope blocks are encoded as ID checks in the legacy adapter.
2. The pair registry and page-template catalog can drift from the renderer's supported template IDs.
3. General page-layout validation accepts arbitrary block type strings for business compatibility, so invitation validation needs a narrower allowlist.
4. Legacy full-page TSX components combine presentation and RSVP behavior. They are not part of the active microsite renderer and should not be wired in as-is, because that would create a second RSVP implementation.
5. No invitation-specific authoring guide explains when to use configuration versus a bespoke React composition.

## Target architecture and migration strategy

1. Add a code-owned, typed invitation template-definition registry with stable IDs, implementation/configuration versions, category/preview metadata, default block sequence, theme preset, supported customization controls, and supported effects.
2. Make legacy flat-data normalization derive its defaults and required blocks from the registry while preserving saved layouts, theme restoration, and existing identifiers.
3. Add invitation-only block-layout validation over the shared page-layout schema. Keep the broader shared schema and business block parsing unchanged.
4. Keep data loading, guest authorization, event merging, RSVP submission, ticket/QR behavior, and business-site rendering in their current shared application pathways.
5. Migrate existing invitations incrementally. Configuration-driven variants should reuse the shared block composition. A genuinely distinct journey may use the allowlisted lazy custom-page entry, receiving the same validated data and shared action contract; do not adapt legacy full-page components until their duplicated business logic is removed.

## Template authoring guide

## Botanical Reverie — current implementation

- `botanical-reverie` is the second custom page in the typed registry and is
  paired with the `botanical-reverie` invitation-card slug. The custom page is
  lazy-loaded through `InvitationPageComponentRegistry`; its data sections and
  RSVP action remain the already-rendered shared blocks.
- The envelope gate is keyboard operable and includes both seal-open and skip
  controls. Reduced-motion users receive the same content with nonessential
  bloom, reveal, and petal motion removed or simplified. Falling petals remain
  capped by the existing effect schema.
- Botanical SVGs in `public/images/invitations/botanical/` are authored in this
  repository and do not depend on external image hosts. The sample preview
  fixture uses these local assets; real guest-uploaded hero art follows the
  existing page image and publication flow.
- The standalone card uses the existing `InvitationCardRenderer` API with a
  code-owned `layout_config.design` variant and a 900×1200 canvas. The card PNG
  route shares the same pure card component, reads hero artwork only from the
  published snapshot, does not render guest-specific names, and retains token
  validation. QR behavior stays in the existing invitation pass/action flow.
- Migration 180 seeds the card catalog row. Its rollback removes an unreferenced
  row or deactivates one still referenced by an event, preserving foreign-key
  values. The migration is authored but not applied live.

## Luxe Editorial — current implementation

- `luxe-editorial` is a selectable wedding card/page pair in the unified
  template picker. Its full page is an allowlisted custom composition over
  shared validated invitation blocks; its card is a 900×1200 portrait variant
  in the existing `InvitationCardRenderer` path.
- The photo-led full-viewport hero, stationery invitation, editorial gallery,
  event details, schedule, map, and closing typography use organizer data.
  Optional sections remain absent when their content is empty.
- The custom page does not fetch invitation rows or implement RSVP. It
  rearranges the shared `action_portal`; the live callback remains attached
  only on the token-authorized guest route, and preview remains non-submitting.
- Migration 181 seeds the existing invitation card catalog row used by the
  unified picker. Its rollback removes an unreferenced row or deactivates a
  referenced row. The migration is authored but has not been applied.
- The standalone card uses hero artwork from the published snapshot and does
  not include guest-identifying text. Existing token validation is unchanged.

### Template authoring guide

### Configuration-driven floral wedding

1. Add a stable definition in `lib/invitation-template-registry.ts`, based on the wedding definition, with `configurationVersion`, `themePreset`, supported section order, and enabled customization/effect keys.
2. Reuse `hero`, `story`, `details`, `schedule`, `gallery`, `location_map`, and `action_portal`. Add only approved theme utility strings and asset IDs; keep event values as flat snapshot fields or allowlisted `$bind` references.
3. Add English/French labels to `messages/en.json` and `messages/fr.json` if the builder exposes the design. Use shared color/font registries instead of embedding a second picker list.
4. Add a fixture and regression test for default layout, saved-layout compatibility, unknown IDs, and reduced-motion behavior if the design introduces motion.

### Genuinely custom composition

1. Define a typed template entry with a distinct stable ID and supported block/effect metadata.
2. Implement a focused React block or composition that accepts `InvitationPageData`, `PageGlobalTheme`, and the shared `PageActionHandler`; do not retrieve data or submit RSVP directly inside it.
3. Register only approved block types and make the composition consume the layout and validated content through the shared renderer. Keep client-only animation code behind the relevant interactive block.
4. Test both live action-enabled rendering and preview/shared modes, including keyboard/touch and reduced-motion behavior. Register custom full-page TSX through `InvitationPageComponentRegistry.tsx`, with a literal import path, Suspense fallback, and shared-block error fallback.

## Implemented vertical slice (2026-10-16)

- Added `lib/invitation-template-registry.ts` as the code-owned page template definition source. It owns the active stable page IDs, implementation versions, category/description/preview metadata, default theme presets, block order, required sections, supported builder customizations, and supported effects. `components/invitation/templates/registry.ts` now derives its picker catalog from those definitions; the card/page pairing registry remains separate because it owns the unified card selection contract.
- The legacy adapter in `lib/invitation-page-layout.ts` now composes defaults and required legacy sections from registry metadata. The old block bindings remain explicit and typed. `themeForInvitationTemplate()` resolves its preset from the registry and falls back to gala for unknown IDs.
- Added invitation-specific validation in `lib/invitation-template-schema.ts`. It layers on the shared version-1 envelope, permits only registered invitation block types, rejects duplicate IDs, unknown binding paths, unsafe object keys, oversized/deep block content, and non-RSVP invitation actions. The envelope effect supports `enabled` and `transitionDurationMs` (0–3000 ms); the component also honors `prefers-reduced-motion`. The broader business website schema remains unchanged.
- `InvitationBlocksLayoutClient` now uses `InvitationBlockRegistry.tsx`, a code-owned block-to-component map. Layout JSON cannot select an arbitrary React component. `DesignSection` uses the template definition's supported-customization flags to decide which controls to show.
- No new SQL migration was added: migration 178 already adds the draft JSONB column, and the published snapshot is already JSONB. Existing published layouts stay self-contained in `blocks_layout.version`; legacy records continue through the adapter. Migration 178 remains a deployment migration and was not applied here.
- The new template name has English and French message keys. Existing event/token authorization, live event data merging, guest/seat/QR behavior, and the shared RSVP action pathway are unchanged.

### Historical status and limits (recorded after the initial vertical slice; superseded below)

- This status describes the first registry/configuration slice and is superseded by the next-phase implementation below. Legacy full-page files remain compatibility/reference code and are not used by the active microsite route; do not reuse their self-submitting RSVP handlers.
- Shared block presentation code remains shared; only `romantic-envelope` has a separate lazy page-composition chunk. Other templates are configuration-driven and do not add per-template React chunks.
- No new invitations/business template runtime tests were added for browser behavior. Automated registry/schema/adapter tests are added to the existing invitation phase suite. Responsive visual review, reduced-motion browser review, and a live DB migration check remain deployment/QA steps.

## Developer workflow

### Configuration-driven floral wedding

1. Add a definition to `INVITATION_TEMPLATE_REGISTRY` with a stable page ID, incremented implementation version, default theme preset, shared default block sequence, supported customizations/effects, and an EN/FR sample-data entry.
2. Reuse the shared blocks in `supportedBlockTypes`; declare only the sections in `defaultBlockTypes` that should initially appear. Use typed `$bind` paths for event values, never an arbitrary path string.
3. If the design is selectable as a unified card/page pair, add that pair in `lib/unified-invitation-templates.ts`; the general page catalog is derived from the page registry. Add palette/font options through the shared registries, not a separate picker list.
4. Add a registry/schema/adapter test and EN/FR picker copy. Verify preview, published snapshot, RSVP, and private-link behavior.

### Genuinely custom composition

1. Add a focused React block in `components/invitation/blocks/` that accepts typed content, theme, locale, and (only when needed) a shared action callback.
2. Add its safe type to `INVITATION_BLOCK_TYPES`, an explicit renderer in `InvitationBlockRegistry.tsx`, and content/effect bounds to `InvitationBlocksLayoutSchema`.
3. Enable it only in the relevant template's `supportedBlockTypes` and add it to `defaultBlockTypes` only when it belongs in that design by default.
4. Keep it presentation-only: data loading and RSVP remain in the route/action layer. Register custom full-page templates by a literal lazy import in `InvitationPageComponentRegistry.tsx` and reuse the shared data/action contract rather than importing legacy self-submitting templates.

## Next implementation phase (2026-10-16)

### Six-template audit and renderer choice

The registry IDs below are the active microsite templates. Each definition is resolved by stable ID; the old individual invitation TSX pages are not the active published-page renderer.

| Template ID | Rendering strategy | Composition and reusable blocks | Visual / motion capability |
|---|---|---|---|
| `gala-editorial` | Configuration-driven blocks | Shared hero, story, details, countdown, location, schedule, gallery, music, and RSVP blocks | Gala theme preset; optional scroll reveal |
| `black-tie` | Configuration-driven blocks | Same approved block set and order | Black-tie theme preset; optional scroll reveal |
| `wedding-romantic` | Configuration-driven blocks | Same approved block set and order | Wedding theme preset; optional scroll reveal and falling petals |
| `romantic-envelope` | Custom TSX page composition around the shared blocks | Shared block array plus the custom envelope entry/reveal and romantic hero variant | Envelope reveal, optional scroll reveal, optional falling petals |
| `birthday-bold` | Configuration-driven blocks | Same approved block set and order | Birthday theme preset; optional scroll reveal |
| `cover` | Configuration-driven blocks | Shared blocks with a reduced default section order (no countdown by default) | Cover theme preset; no motion effects exposed |

Before this phase, all six definitions selected the same client block canvas. `romantic-envelope` only had a gate block and a hero variation; the gate implementation lived in the eagerly imported shared presentation module. The registry had no custom page-component contract or lazy page component map. The five standard designs were genuinely data/theme variants, while the envelope journey had a distinctive experience but no full-page composition boundary.

### Hybrid rendering and lazy loading

- Template definitions now declare `pageRenderer: { kind: "blocks" }` or an allowlisted custom component ID. Only `romantic-envelope` selects the custom renderer; the other five IDs keep JSON block composition.
- `InvitationPageComponentRegistry.tsx` is the only custom page component map. It uses a literal `React.lazy(() => import(...))` path and `Suspense`; no value from a database row is used as an import path. The App Router retains client-component SSR. If the custom chunk suspends or errors, the already-built shared block page is the fallback.
- The custom envelope composition receives the validated layout, the existing `InvitationPageData`, mode/edit flags, and block children. The route still owns loading, authorization, live data assembly, and the RSVP server action. The template cannot submit an RSVP or fetch a guest record itself.
- Shared approved blocks remain in the common block bundle. The template-specific envelope page component is split into its own lazy chunk; there are no eager imports of all six legacy full-page TSX files on the public invitation route.
- `templateId` is passed explicitly by public, shared, preview, builder-preview, sandbox, and template-picker paths. Metadata and private/shared route gates remain server-owned and independent of the client renderer choice.

### Motion configuration

Invitation JSON may carry an optional `effects` array. Each effect is a discriminated, bounded object:

```ts
type InvitationEffectConfig =
  | { type: "envelope-reveal"; enabled: boolean; transitionDurationMs: number } // 0–3000
  | { type: "scroll-reveal"; enabled: boolean; durationMs: number } // 0–1600
  | { type: "falling-petals"; enabled: boolean; density: number }; // 1–12
```

The invitation draft schema checks that effect types are unique and supported by the selected template. Missing effects use registry defaults; saved legacy envelope block settings remain a fallback. The builder derives controls only from `supportedEffects`. The envelope reveal uses CSS transitions, section reveals use `IntersectionObserver` plus CSS, and falling petals use a deterministic CSS keyframe layer with at most 12 pointer-transparent SVG petals. All honor reduced-motion preferences. Motion is intentionally CSS/Observer based; adding Framer Motion or GSAP would add weight without improving these three effects.

Bird, butterfly, foliage, and larger choreographed sequences are not implemented in this slice. The envelope gate followed by optional section reveals demonstrates the sequence contract; additional effects should be added only with a template that needs them and an approved asset/design treatment.

### Validation and visual QA

- Registry, schema, adapter, route-mode, compatibility, and effect-bound regression coverage lives in the already registered invitation phase test file.
- The local `/invitation/preview` sandbox uses render-only sample invitation data and can safely exercise desktop/mobile layouts without a guest token or database write. It can select the custom envelope page as well as shared-block templates.
- Published-token RSVP flows and private guest records remain covered by server/action tests. They require a designated staging invitation and authenticated browser session for end-to-end visual verification; do not enumerate real guest tokens to create QA fixtures.
