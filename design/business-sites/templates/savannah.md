# Savannah: modern editorial restaurant

Status: DRAFT v0.2 (updated after owner review in Phase 3b). Follows `design/business-sites/BASELINE.md` (v0.3). Built from three owner references: the "Midnight Sapphire" palette image, the Google Stitch "Lumière Editorial" design system export, and the type choice Helvetica.
Template ID: `restaurant-savannah` (new, version `1.0.0`, not legacy, so it appears in the new-site gallery).
Tags: [existing] already in code from Table & Flame work. [NEW] new work. [ASSUMED] proposed value, owner to confirm. [DECISION NEEDED] owner must decide.

## 0. Contract and scope

- New template with a new ID. It must not change Table & Flame, Food Order, Store, DriveLine, or any other template's appearance or behavior.
- Same restaurant commerce as Table & Flame: menu browse, menu order buttons, and a conditional reservation form. Orders and reservations derive their features from the manifest sections, so Savannah declares the same section types with the same data contract. Commerce behavior and data are unchanged. Markup may differ.
- Additive fields only. Reuse what Table & Flame already built: `sectionAlign`, scoped card tokens, the full-bleed hero variant, the mobile overlay menu option, the palette and pattern machinery, `readableOn`, and the contrast test.
- Precedence: this spec outranks BASELINE.md. If they conflict, report it instead of choosing silently.
- Out of scope for this template: wishlist, collection pages, product detail pages, and cart for retail goods. The Lumière reference includes those screens. They are retail features, not restaurant features, and a retail template would also touch the Store ID gates. Not part of Savannah.
- Not the loud street-food look from the earlier burger reference. That energy can become its own later template.

## 1. Identity

A modern editorial restaurant. Sharp corners, large calm photography, one confident sans family, a cool sapphire palette, and white space used as a material, not as leftover room. Reads like a printed magazine, not an app. It should suit a modern kitchen, a tasting-menu room, a cocktail bar, or a brunch café.

Borrowings: sharp 0px corners, no borders and no shadows (depth comes from tonal shifts between sections), asymmetric layouts, a two-column staggered feel instead of a three-card grid, and thin uppercase labels.

## 2. Current state vs target

Reused as is [existing]: `sectionAlign`, scoped card tokens (`--site-card-radius`, `--site-card-shadow`), the full-bleed hero variant with a dark scrim, the transparent-over-hero header with a logo plate, the mobile overlay menu option, palette variables and the Appearance panel, `readableOn`, fallback initials on `subtle` panels.

New work [NEW]:
- The manifest, gallery entry, previews, and en/fr labels for Savannah.
- A Helvetica font stack for this template only (`"Helvetica Neue", Helvetica, Arimo, Arial, sans-serif`).
- Sharp-corner, borderless card tokens (`--site-card-radius: 0px`, `--site-card-shadow: none`).
- Menu presentation options: "editorial" 2-column layout and sharp-corner "cards" variant for `StorefrontBrowse`.
- Staggered offerings/highlights (count-based layout: 1 max-w-md, 2 max-w-3xl, 3 max-w-6xl with optional 16:9 images).
- Asymmetric About block (40/60 split with portrait photo, caption eyebrow, display headline, subtitle, and body).
- Contained promo banner block (`variant: "promo"`) with 2-column bounded card, 4:3 image, eyebrow, headline, CTA button, and optional end date.
- Centered section headings with `mx-auto` alignment.
- Six Savannah palettes, with Midnight Sapphire as the default.

## 3. Palette

Midnight Sapphire comes from the owner's image: `#8FAADC`, `#2F5DA8`, `#0C1F3F`, and `#EEF3FB`.

| Name | Mood | Base | Accent | Ink | Soft (decor only) |
|---|---|---|---|---|---|
| Midnight Sapphire (default) | Cool, calm, editorial | `#EEF3FB` | `#2F5DA8` | `#0C1F3F` | `#8FAADC` |
| Deep Sapphire | Dark, upscale | `#0C1F3F` | `#8FAADC` | `#EEF3FB` (text) | `#2F5DA8` |
| Gallery White | Monochrome, gallery | `#F9F9F9` | `#000000` | `#1B1B1B` | `#DADADA` |
| Dusk Sienna | Warm, earthy | `#FBF4EA` | `#B5441F` | `#2B1810` | `#E8B89A` |
| Acacia | Green, fresh | `#F3F6EE` | `#2F6B3A` | `#14241A` | `#A9C9A4` |
| Baobab Gold | Warm, golden | `#FAF6EA` | `#C8941F` | `#231B0E` | `#E6CF8F` |

Rules:
- Every other role (subtle, muted, border, accent deep, on-accent, band, scrim base) is derived and checked by the contrast test, as for Table & Flame.
- `soft` is optional and additive. It is used only for decoration: fallback panels, pill fills, rules, and tonal bands. It is never used for text.
- The scrim base is always a dark shade. For dark palettes derive it from base, never from a light color.
- Bands (CTA and footer) are dark with light text via `readableOn`.
- Savannah does not declare a dot pattern, so no pattern toggle appears.

## 4. Typography

- One family: Helvetica. Until licensed, use this stack: `"Helvetica Neue", Helvetica, Arimo, Arial, sans-serif`. Devices with Helvetica installed use it. Others get Arimo (open, metric-compatible), loaded only for Savannah pages.
- Headings: weight 700, line-height 1.05 to 1.15, tracking about -0.02em on large sizes. Sentence case.
- Labels, eyebrows, and captions: 12px minimum, uppercase, tracking 0.1em to 0.2em, weight 600.
- Sizes: hero h1 40px mobile / 72px desktop, section h2 30px / 44px, item names 18 to 20px, body 16 to 17px.
- Prices use tabular numbers.

## 5. Shape and depth

- Cards, images, buttons, pills, inputs: 0px radius (`rounded-none`).
- No shadows. No borders on cards (`border-none` / tonal separation).
- Depth comes from tonal shifts: base, subtle, and soft bands, and cards one tone off their section.
- Inputs: bottom border only, at least 3:1 against the background. Visible focus ring on every control.
- Dividers between list items are replaced by spacing (about 32px). A 1px hairline is allowed only between the CTA band and the footer.

## 6. Header

- Sticky, 64px mobile / 80px desktop, `--site-header-h`.
- Over the hero: transparent with light text on the dark scrim.
- Desktop CTA behavior: while the hero CTA is visible, the header CTA button is hidden (`opacity-0 pointer-events-none`). After 24px scroll past the hero threshold, it fades in smoothly (`opacity-100`) without layout shift.
- Mobile: the full-height overlay menu, large links, primary CTA.

## 7. Hero

- Full-bleed hero variant: min height 440px mobile / 560px desktop, text bottom-left, dark scrim, eyebrow, h1, one supporting line, primary CTA.
- Repetition suppression: the address and phone pills strip is omitted on Savannah hero (details live in Hours & Location and footer).
- No photo fallback: a deep gradient from the ink-derived dark to the accent, with the business initial.

## 8. Section recipes

- Offerings and highlights: count-based layout (1 centered column, 2 columns, or 3 columns) with optional 16:9 images and no artificial translations.
- Promo banner (optional section): contained bounded card in `bg-[var(--tf-soft)]`, 4:3 image, uppercase eyebrow, headline, description, CTA button, and optional end date badge.
- Best sellers (`menu.featured`): optional strip showing owner-picked items.
- Menu browse (`menu.browse`): category chips with search, item cards with sharp 0px radius, 4:3 images, tabular price formatting.
- About: asymmetric 40/60 two-column layout with portrait photo, caption eyebrow, headline, subtitle, and body.
- Hours and location: two columns.
- CTA band: dark locked band, centered copy.
- Footer: dark band with business name and navigation always, and hours/address/socials when present.

## 9. Acceptance

- BASELINE section 13 passes: contrast for all six palettes, thin-content tests (0, 1, 2, and 12 items, short and 300-character descriptions, missing logo, very long business name), literal-color scan over Savannah code paths, and reduced motion.
- Table & Flame, Food Order, Store, and DriveLine markup is 100% unchanged.
- Savannah appears in the new-site gallery and takes orders and reservations identically to Table & Flame.