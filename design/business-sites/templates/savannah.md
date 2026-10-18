# Savannah: modern editorial restaurant

Status: DRAFT v0.1, second restaurant template. Follows `design/business-sites/BASELINE.md` (v0.3). Built from three owner references: the "Midnight Sapphire" palette image, the Google Stitch "Lumière Editorial" design system export, and the type choice Helvetica.
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

Borrowed from the Lumière reference: sharp 0px corners, no borders and no shadows (depth comes from tonal shifts between sections), asymmetric layouts, a two-column staggered feel instead of a three-card grid, and thin uppercase labels. Not borrowed: the Noto Serif plus Inter pairing (replaced by Helvetica), "strictly monochromatic" (replaced by the sapphire palette), the translucent glass header (made solid enough to stay readable), and the faint 15% borders on inputs (too low contrast).

## 2. Current state vs target

Reused as is [existing]: `sectionAlign`, scoped card tokens (`--site-card-radius`, `--site-card-shadow`), the full-bleed hero variant with a dark scrim, the transparent-over-hero header with a logo plate, the mobile overlay menu option, palette variables and the Appearance panel, `readableOn`, fallback initials on `subtle` panels.

New work [NEW]:
- The manifest, gallery entry, previews, and en/fr labels for Savannah.
- A Helvetica font stack for this template only.
- Sharp-corner, borderless card tokens (a border token if none exists, with a fallback equal to today's value so other templates stay identical).
- An "editorial" menu variant of `StorefrontBrowse`.
- Staggered offerings, asymmetric About, and a single pull-quote testimonial.
- A centered `sectionAlign`.
- Six Savannah palettes, with Midnight Sapphire as the default.

## 3. Palette [ASSUMED]

Midnight Sapphire comes from the owner's image: `#8FAADC`, `#2F5DA8`, `#0C1F3F`, and a pale first swatch. The image labels the first swatch `#FFF1E8` (a warm cream) but the swatch shown is pale blue-white, so base is taken as `#EEF3FB` [DECISION NEEDED: confirm; if the cream was intended, base becomes `#FFF1E8`].

| Name | Mood | Base | Accent | Ink | Soft (decor only) |
|---|---|---|---|---|---|
| Midnight Sapphire (default) | Cool, calm, editorial | `#EEF3FB` | `#2F5DA8` | `#0C1F3F` | `#8FAADC` |
| Deep Sapphire | Dark, upscale | `#0C1F3F` | `#8FAADC` | `#EEF3FB` (text) | `#2F5DA8` |
| Gallery White | Monochrome, gallery | `#F9F9F9` | `#000000` | `#1B1B1B` | `#DADADA` |
| Dusk Sienna | Warm, earthy | `#FBF4EA` | `#B5441F` | `#2B1810` | `#E8B89A` |
| Acacia | Green, fresh | `#F3F6EE` | `#2F6B3A` | `#14241A` | `#A9C9A4` |
| Baobab Gold | Warm, golden | `#FAF6EA` | `#C8941F` | `#231B0E` | `#E6CF8F` |

Rules:
- Every other role (subtle, muted, border, accent deep, on-accent, band, scrim base) is derived and checked by the contrast test, as for Table & Flame. Given base, accent, and ink are never silently changed. If a pair fails, report it with the ratio and the smallest change that fixes it.
- `soft` is optional and additive. It is used only for decoration: fallback panels, pill fills, rules, and tonal bands. It is never used for text. (`#8FAADC` on `#EEF3FB` is only about 2:1.)
- The scrim base is always a dark shade. For dark palettes derive it from base, never from a light color.
- Bands (CTA and footer) are dark with light text via `readableOn`. For Deep Sapphire, the band must be clearly distinguishable from the dark page.
- Savannah does not declare a dot pattern [ASSUMED], so no pattern toggle appears.

## 4. Typography

- One family: Helvetica. Helvetica is a commercial typeface, not available on Google Fonts, and web use needs a license [DECISION NEEDED]. Until licensed, use this stack: `"Helvetica Neue", Helvetica, Arimo, Arial, sans-serif`. Devices with Helvetica installed use it. Others get Arimo (open, metric-compatible), loaded only for Savannah pages through the same mechanism used for Geist and Fraunces. Arimo and Helvetica Neue cover Latin Extended (French accents).
- Headings: weight 700, line-height 1.05 to 1.15, tracking about -0.02em on large sizes. Sentence case.
- Labels and eyebrows: 12px minimum, uppercase, tracking 0.1em, weight 500. (The reference used 11px, which is below the baseline.)
- Sizes: hero h1 40px mobile / 72px desktop, section h2 30px / 44px, item names 18 to 20px, body 16 to 17px.
- Prices use tabular numbers.

## 5. Shape and depth

- Cards, images, buttons, pills, inputs: 0px radius.
- No shadows. No borders on cards. Depth comes from tonal shifts: base, subtle, and soft bands, and cards one tone off their section.
- Inputs: bottom border only, at least 3:1 against the background (not the reference's 15% ghost border). Visible focus ring on every control.
- Dividers between list items are replaced by spacing (about 32px). A 1px hairline is allowed only between the CTA band and the footer.

## 6. Header

- Sticky, 64px mobile / 80px desktop, `--site-header-h` [existing].
- Over the hero: transparent with light text on the dark scrim. After 24px of scroll: a solid-feeling bar in the base color at 92% opacity or higher with a 12px blur. Text color from `readableOn` against the base. Never below 90% opacity, so text stays readable over any content.
- Logo plate over the hero [existing]. Business name beside the logo. Navigation and "Order Now" on the right.
- Mobile: the full-height overlay menu [existing option], large Helvetica links, primary CTA.

## 7. Hero

- Reuse the full-bleed hero variant: min height 440px mobile / 560px desktop, text bottom-left, dark scrim, eyebrow, h1, one supporting line, at most two CTAs. "Order now" filled with the accent and a readable label, "Reserve a table" as an outline, shown only when reservations are live.
- Optional pills strip (open today until, address, phone), each shown only when its data exists.
- No photo: a deep gradient from the ink-derived dark to the accent, with the business initial. Never an empty split.

## 8. Section recipes

Same section types as Table & Flame so commerce works. `sectionAlign: "center"` [ASSUMED] for headings and intros. Card contents and body text stay left-aligned. A single pull quote follows `sectionAlign`. Section padding `default`, hero `roomy`. Backgrounds alternate base and subtle, computed over the sections actually rendered. No section gap above 96px on mobile or 160px on desktop (the reference's 8.5rem section gap is too large on mobile).

- Offerings and highlights: a two-column staggered layout (one larger image, one offset text block) instead of three cards. With 1 or 2 items, a centered group with a max width and no empty slots.
- Menu browse (editorial variant, Savannah only): category tabs as text with an accent underline on the active one, sticky at `top: var(--site-header-h)` with the base color behind. Items in two columns on desktop, one on mobile: name, tabular price on the right, short description in muted text, optional 88px square thumbnail. No dividers, no card borders, about 32px between items. No photo means a plain text item. Add-to-order behavior and data are unchanged.
- Menu order buttons and featured menu: 48px minimum height, accent fill, 0px radius.
- About: an asymmetric two-column layout (larger photo, offset text), stacked on mobile, with a visible heading.
- Testimonials: one large pull quote with a name. Always has a section heading.
- Gallery (optional): 2 columns mobile, 3 desktop, uniform aspect ratio.
- Hours and location: two columns.
- CTA band: dark band, centered heading, accent button when the CTA data has a label and link. 1px hairline between it and the footer.
- Footer: dark band with business name and navigation always, and hours, address, phone, map link, and social links only when the data exists (BASELINE section 5).
- Sections with no content do not render.

## 9. Imagery and fallbacks

- Large, calm, high-contrast photography with generous space around it.
- Fallback for a missing photo: a `subtle` or `soft` panel with the business initial in the Savannah font, colored via `readableOn`. Never the logo image, never an unrelated stock photo.

## 10. Motion [ASSUMED]

- Hero image fades in over 400ms. Sections fade in once on first view, 300ms, with no rise. Buttons press to scale 0.98. Hover changes tone, not position.
- Everything off under `prefers-reduced-motion`. No autoplaying video without a poster.

## 11. Do and don't

Do:
- Keep every corner sharp, every card borderless, and let tone and space do the separating.
- Use accent for fills and accent deep for small accent text.
- Use `soft` only for decoration.

Don't:
- Round a corner, add a shadow, or add a border to a card.
- Put the soft color under text.
- Add a second font family.
- Hardcode any color. Every color comes from the palette tokens.

## 12. Acceptance

- BASELINE section 13 passes without screenshots: contrast for all six palettes, thin-content tests (0, 1, 2, and 12 items, short and 300-character descriptions, missing logo, very long business name), the literal-color scan over Savannah code paths, and reduced motion.
- Savannah appears in the new-site gallery, can be created, and exposes the Appearance panel with six palettes and no pattern toggle.
- A Savannah site can take orders and reservations the same way a Table & Flame site does.
- Switching between Savannah and Table & Flame keeps content, and an unknown palette id falls back to the default.
- Table & Flame, Food Order, Store, and DriveLine markup is unchanged.

## 13. Open decisions

1. Helvetica: license it, or keep the Helvetica Neue / Arimo stack.
2. Midnight Sapphire base: pale blue `#EEF3FB` or cream `#FFF1E8`.
3. Centered or left `sectionAlign` for headings.
4. Allergen numbers and multi-size prices (from the burger reference): not in version 1.0.0. They need a shared menu-item data decision first.