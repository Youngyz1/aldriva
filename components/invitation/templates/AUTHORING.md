# Invitation Page Template — Authoring Notes

> How to build (or restyle) a template in `components/invitation/templates/`.
> The registry (`registry.ts`) maps `template_id` -> component; the builder
> preview and the guest page render the same component.

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
image, not only in the lightbox.

## 7. Preview placeholders

Bracketed sample text (`[Partner 1]`) is applied render-time in the
builder preview only (`placeholderSnapshot`), never persisted and never
shown to guests.
