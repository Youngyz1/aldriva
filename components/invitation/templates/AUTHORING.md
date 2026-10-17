# Invitation Page Template — Authoring Notes

> How to build or restyle an invitation page in `components/invitation/`.
> Template metadata, block renderers, and custom full-page components are
> separate allowlisted registries. Builder preview and guest pages share the
> same presentation path, with actions only attached in live mode.

## 0. Select the right rendering path

- `lib/invitation-template-registry.ts` owns stable IDs, metadata, default
  blocks/themes, supported editor controls, and bounded effect configuration.
- `components/invitation/blocks/InvitationBlockRegistry.tsx` maps approved
  block types to shared presentation components. Keep JSON data declarative;
  never turn a saved string into a component import or arbitrary binding path.
- `components/invitation/templates/InvitationPageComponentRegistry.tsx` is the
  explicit allowlist for custom full-page compositions. A custom page must be
  presentation-only, accept validated data/layout and shared block children,
  and preserve the shared live-action boundary. Add literal lazy import paths
  here; the fallback is the normal shared-block canvas.
- Most designs should remain configuration-driven variants of the shared
  blocks. Use a custom page only where the page journey/composition is
  genuinely distinct (`romantic-envelope`, `botanical-reverie`,
  `luxe-editorial`). Legacy files in `components/invitation/templates/registry.ts`
  are picker/catalog compatibility code, not the renderer registry.

## 0.1 Effects and builder controls

- Declare an effect in the template definition and use the typed bounded
  effect schema. Effects must honor `prefers-reduced-motion`, remain decorative
  and pointer-transparent, and fail open with content visible if observation
  does not initialize.
- Builder controls are rendered from each definition's supported options.
  Do not expose a control for a template that does not declare support.
- A custom template must keep action callbacks optional. Preview, shared, and
  sandbox rendering do not receive live RSVP handlers.

## 1. Card-free default (architecture, not taste)

- Content sits **directly on the page background**. Separate blocks with
  **whitespace + hairline dividers** (`TemplateDivider` from
  `components/invitation/TemplateSurface.tsx`), never with boxed,
  bordered, or tinted card containers.
- No card-inside-card anywhere. The map is bare: render `VenueMapClient`
  with no bordered wrapper (no frame around a frame).
- Explicit opt-in only: `TemplateCard` exists for the rare boxed moment
  (QR quiet zone for scannability, a ticket-stub motif that IS the
  design). Ordinary content grouping must not use it.

## 2. Tokens — Tailwind v4 syntax or invisible ink

- The old v3 `[--var]` class shorthand emits **invalid CSS in Tailwind v4**
  (`border-color: --rule` is dropped; borders fall back to `currentColor`
  and render near-black). Always use the v4 paren form:
  `text-(--tpl-ink)`, `bg-(--tpl-bg)`, `border-(--tpl-rule)`.
- Define tokens in a `*_VARS` const spread onto the root `style`, exactly
  like the existing templates.

## 3. Anchors for builder scroll-to

Every template must carry these ids (the builder preview posts
`scroll-to` for them): `inv-hero`, `inv-story`, `inv-details`,
`inv-schedule`, `inv-gallery`, `rsvp-section`.

## 4. Time honesty

Render the time line only when **both** `data.timezone` and
`data.eventDate` are set. Never invent a default time or "UTC".
Publishing is blocked without them (`validateForPublish`), so guests
only ever see host-chosen times.

## 5. RSVP honesty

The `catch` in the RSVP handler must branch on `onRsvp`: no `onRsvp`
(preview/sandbox) → preview-mode copy; `onRsvp` present (real guest
page) → `dict.rsvpFailed` error WITHOUT flipping local RSVP state.

## 6. Gallery honesty

Gallery images render at **natural aspect ratio, never cropped**
(`object-contain` / masonry). Captions (and alt) render **below** each
image, not only in the lightbox. On mobile, unframed photos in
`InvitationGalleryGrid` and the shared gallery block use a one-column,
edge-to-edge layout; captions retain the matching page gutter. Pass the sum
of the surrounding mobile horizontal gutters as `mobileBleedGutter` when a
custom template adds page padding around `InvitationGalleryGrid`. Keep images
inside intentional cards, frames, and thumbnail slots on their existing
`framed` or `thumbnail` presentation instead of applying gallery bleed.

## 7. Preview placeholders

Bracketed sample text (`[Partner 1]`) is applied render-time in the
builder preview only (`placeholderSnapshot`), never persisted and never
shown to guests.

## 8. Botanical Reverie composition and card

- `botanical-reverie` is a custom allowlisted full-page composition that
  rearranges the shared `romantic_hero`, `details`, `schedule`, `location_map`,
  `gallery`, and `action_portal` output. Keep it presentation-only: do not fetch
  invitation rows or implement a second RSVP handler in the custom page.
- Its envelope can be opened from the wax-seal button or skipped. Petal and
  reveal effects are template-scoped and must remain usable under
  `prefers-reduced-motion`.
- The page palette/type/scale controls affect the webpage. The card keeps a
  dedicated portrait stationery composition; approved hero photos and event
  details are shared to it from the builder draft or published snapshot.
- Decorative vectors under `public/images/invitations/botanical/` were authored
  in this repository for this template. They are original project artwork with
  no third-party source or license dependency; do not replace them with remote
  stock-image URLs.
- The invitation card's layout configuration selects the existing
  `InvitationCardRenderer` extension point; the card PNG route uses the same
  pure presentation component with published-only artwork and the current
  token access guard.

## 9. Luxe Editorial composition and card

- `luxe-editorial` rearranges the shared hero, story, details, countdown,
  schedule, map, gallery, music, and action block output. Its formal invite
  stationery frame is an intentional part of the design; do not extend that
  frame around the other page sections.
- Hero imagery remains full-bleed at the viewport edges and uses the saved
  focal point. Editorial gallery images keep natural ratios and captions;
  only the first image receives the featured desktop span.
- Render only sections with organizer-supplied content. Keep date/time output
  subject to the saved timezone, map output subject to usable coordinates or
  address data, and the optional music control subject to an actual media URL.
- RSVP is the shared `action_portal` block. The custom composition has no form,
  guest query, or response handler of its own; live callbacks remain supplied
  only by the token-authorized invitation route.
- The portrait card uses the existing `InvitationCardRenderer` extension
  point. Its PNG path uses the same 64-character invitation-token check as the
  current route and reads hero artwork from the published snapshot only. The
  card image does not include guest-identifying text.
