# Business Sites Baseline

Status: DRAFT v0.3. Written from the code audits and reviews of 2026-10-17.
Applies to: every public business website template. This file is the quality floor, not a look. Each template's look lives in `design/business-sites/templates/<template>.md`.
Precedence: template spec (identity) > this file (quality floor) > `DESIGN.md` (platform). If they conflict, report it instead of choosing silently.
Tags: [ASSUMED] proposed default, owner to confirm. [DECISION] owner decided. [DECISION NEEDED] owner must decide before work starts. [existing] true in code today.

## 1. Principles

1. Readable before beautiful. No text is ever hard to read.
2. One owner per decision. One place sets vertical padding, one place sets alignment, one place picks text colors.
3. Mobile first. Design at 375px, then scale up.
4. Content-proof. The site must look good with missing images, short text, 1 or 2 items, and long names.
5. Identity belongs to the template. The floor belongs here.

## 1b. Current vs target

Rules in this file are TARGET unless marked [existing]. Agents must not assume target items exist in code. Not yet in code:

- Single padding owner (blocks still add their own `py-[var(--ps-space-16)]`).
- `sectionAlign` and the `relaxed` spacing value.
- `--site-header-h`.
- The `readableOn` helper and the contrast test.
- A full-height mobile menu overlay (today: a dropdown inside the header).
- Footer address, phone, and map link (today: business name, navigation, optional socials, today's hours).
- Reduced-motion handling for business-site hero video and section motion. Reduced-motion support exists elsewhere in the repo (for example `HowItWorks.tsx`, `ProgressBar.tsx`, `ArticleContentRenderer.tsx`), but none of it covers public business-site blocks.
- Rendering of `templateBackground.texture` (it is stored in the manifest but nothing consumes it).
- Per-template card tokens (today `globals.css` applies one card style to all of `.public-site`).

Existing and consistent with this file: sticky header at 64px mobile and 80px desktop, 24px scroll threshold, Geist as the platform body font.

## 2. Vertical rhythm

- The section envelope is the only owner of vertical padding. Block renderers must not add their own `py-*`.
  Audit finding [existing bug]: envelope `py-12 sm:py-16` (from `lib/section-helpers.ts`, applied in `BlockRenderer.tsx` even when a block has no spacing value) plus block `py-[var(--ps-space-16)]` gives 112px (mobile) / 128px (desktop) per section, and up to 224px / 256px between the content of adjacent sections. This is the cause of the huge gaps.
- Section padding-block, mobile / desktop [ASSUMED]:

| Option | Padding | Visible gap between adjacent sections |
|---|---|---|
| tight | 32 / 48px | 64 / 96px |
| default | 40 / 64px | 80 / 128px |
| relaxed | 48 / 80px | 96 / 160px |

- Vocabulary mapping: the code accepts `compact | default | roomy` (`lib/section-helpers.ts`). Mapping is tight = `compact`, default = `default`, relaxed = `roomy`. Keep the code names.
- All three values change, not only `roomy` [ASSUMED]. Current padding (mobile / desktop) versus target:

| Code name | Current | Target |
|---|---|---|
| `compact` | 24 / 32px | 32 / 48px |
| `default` | 48 / 64px | 40 / 64px |
| `roomy` | 64 / 96px | 48 / 80px |

  These apply to every V2 template that uses the envelope, so they fall under the shared-code screenshot rule in section 13.
- No gap may exceed 96px on mobile or 160px on desktop.
- Adjacent sections alternate background (base / subtle) so the padding reads as a band, not empty space. Alternation is computed over the sections actually rendered, because optional and empty sections drop out.
- Inside a section: heading to content 24 to 32px, card gap 16 to 24px, paragraph gap 16px.

## 3. Alignment

- Each template sets `sectionAlign`: `left` or `center` (new additive manifest field).
- Within a section, the heading, intro text, and CTA row share that alignment.
- Card contents and body paragraphs are always left-aligned. Stat and metric tiles follow `sectionAlign`.
- The hero may use its own alignment only if the template spec says so.
- Today alignment is chosen per component: `SectionHeading` defaults to centered, the Table & Flame hero is generated left-aligned, About metric cards and CTA banners are centered. `sectionAlign` replaces these per-component defaults.

## 4. Contrast and readable text

- Every text and background pair: at least 4.5:1 for normal text, 3:1 for large text (24px+, or 18.66px+ bold).
- Never hardcode white or black text on a band. All text colors on bands, headers, footers, CTA bands, badges, and buttons come from one helper, `readableOn(background, candidates)`, based on the real background color.
  Audit finding [existing bug]: `V2SiteFooter` uses white text whenever any footer band exists, and `V2SiteHeader` uses white text whenever a hero band and hero image exist, without checking the band's actual color. This currently hits Food Order and Store (footer band `#f3f1ec`, hero band `var(--ps-accent-light)`). Table & Flame is not affected today: its footer band is dark and it has no hero band. The code is shared, so the rule applies to every template.
- Text over photos always sits on a scrim (a dark gradient of at least 40% at the text edge). White text is allowed only with a scrim.
- A contrast test runs over every palette and template background and fails the build below the thresholds. No runtime or build-time contrast check exists today. A CSS comment in the repo notes one orange/white ratio, but that is documentation, not an automated check.

## 5. Header and footer

- Header height 64px mobile, 80px desktop [existing]. Sticky [existing]. Its height is published as `--site-header-h` (new).
- Transparent header only over a full-bleed image hero with a scrim. Otherwise it is solid from first paint.
- Header text color comes from the actual background behind it, in both states (transparent and scrolled). The signal for "over a photo with a scrim" must come from the hero, not from the presence of a hero band. Change header and hero together.
- The mobile menu button must be clearly visible in both states. The open menu is a full-height overlay with the primary CTA (today: a dropdown inside the header).
- Sticky sub-bars (category pills, filters) use `top: var(--site-header-h)` (today hard-coded `top-16 md:top-20` in `StorefrontBrowse.tsx`), sit above content but below the header, and use the page base color as background, not white.
  Note: the offsets already match today's header height, and `z-30` under the header's `z-50` is the intended order. A report of pills stuck under the header after scrolling is unconfirmed. Reproduce it in a browser before treating it as a bug.
- Footer text color comes from the footer band color. Footer shows: business name, hours, address, phone, map link, social links, main navigation.
- Missing-data rule: business name and main navigation always render. Every other item (hours, address, phone, map link, each social link) renders only when the business has that data. Unavailable items are omitted, with no empty labels, placeholders, or blank columns, and the footer grid reflows to the items present. The map link needs an address.
- Today the V2 footer conditionally shows hours and social links, and does not render address, phone, or map link at all.

## 6. Hero

- One `h1`, at most about 8 words. One supporting line. At most two CTAs, primary first.
- The hero is a full section, not a floating boxed card, unless the template spec says so.
- Media uses object-fit cover with a focal point. Missing media falls back to the template's fallback (section 8), never an empty half or a broken split.
- Height [ASSUMED]: min 440px on mobile, 560px on desktop. Text column max width 36 to 40 characters for the headline, 60ch for the supporting line.
- Today the resolver emits `variant: "split"` for Table & Flame, and the existing image hero uses `min-h-[480px]` with a uniform `bg-black/45` overlay. A full-bleed hero with a gradient scrim is a new hero variant (additive).

## 7. Cards, grids, and menus

- Grids adapt to the item count. With 1 or 2 items, the group is centered or uses a 2-column grid with a max width. It never leaves empty grid slots.
- One radius, one border style, one padding value per card type, set by the template.
  Note: `globals.css` currently forces an 8px radius on bordered `.rounded-xl` and a `shadow-xs` across `.public-site`. Per-template card tokens replace this through a scoped override, not by editing the global rule, so other templates keep their look until they adopt tokens.
- Images use a fixed aspect ratio with a placeholder, so layout never jumps.
- Menu items: name, optional description, price, optional thumbnail. Items without a photo render as clean text rows, not cards with an empty image box. Today menu browse renders card grids with 64px thumbnails.

## 8. Empty and thin content

- Sections with no content do not render.
- Every image slot has a template fallback: a tinted panel with the business logo or initial. Never a random unrelated stock photo (for example a burger on a jollof menu).
- Test every template with: 0, 1, 2, and 12 items; a 1-word and a 300-character description; a missing logo; a very long business name.

## 9. Typography

- Body text at least 16px on mobile, line-height 1.5 to 1.65, line length 45 to 75 characters.
- At most two font families per template. Only the fonts of the active pairing are loaded.
- Fonts must support Latin Extended (French accents). Sites run in `en` and `fr`.
- Heading hierarchy is real: one `h1`, then `h2` for sections, `h3` for items.
- Today V2 maps `serif` to Georgia / Times New Roman and body to Geist. Other font families are not registered for business sites, and nothing loads only the selected pairing.

## 10. Touch, accessibility, performance

- Touch targets at least 44px. Primary CTAs at least 48px tall.
- Visible keyboard focus on every control.
- All motion respects `prefers-reduced-motion`, including sliders and video heroes.
- Hero image is sized and prioritized. No autoplaying video on mobile without a poster and a reduced-motion fallback. Today business-site hero videos autoplay, and business-site hero and section motion has no reduced-motion handling.

## 11. Customization limits

Users may change: logo, images, text, palette (from the template's curated set), font pairing (from the template's curated set), hero variant, section order and on/off toggles.
Locked by the template: spacing rhythm, type hierarchy, shape language, layout structure.
Automatic: when a palette or color is chosen, text colors come from `readableOn`, and a warning appears for any pair below the thresholds.

Scope note: today V2 accents carry only accent, hover, light, and CTA text. A palette with its own base and ink (including dark palettes) requires base and band colors to become palette-driven instead of fixed in `templateBackground` and `lockedTheme`. This is a larger job and belongs to the customization phase.

Known builder bugs to fix in the customization phase (not in the baseline phase):

- The legacy picker's preset IDs (`minimal`, `bold`, `warm`, `midnight`) are not recognized by the resolver (`default`, `zinc_orange`, `dark`, `slate`, `warm_amber`, `forest`). Unknown IDs fall back to the default palette, so only the primary color changes.
- `default` and `zinc_orange` are identical. Several presets are orange or amber.
- V2 has no accent picker at all. The accent comes from the manifest default and cannot be changed by users.
- The legacy font picker offers three system stacks (sans, serif, mono).

## 12. Preview parity

The builder preview for V2 (`V2WebsitePreviewClient.tsx`) renders a handwritten `PreviewBlock`, not the public `BlockRenderer`, so it can differ from the live site. Until they are unified, judge visual work on the published route `/site/<slug>`, not in the builder preview. Target: the builder preview renders through the same public renderer.

Practical note: Table & Flame is `legacy: true` and hidden from the new-site gallery, so testing needs an existing or seeded Table & Flame site.

## 13. Definition of done (any template change)

- Screenshots at 1440px, 768px, and 375px, before and after.
- Any change to shared code (padding, header, footer, cards, `SectionHeading`) also needs before and after screenshots of every other V2 template (Food Order, Store, DriveLine, and the rest), because the change affects all of them.
- Header and footer text readable in every state.
- No gap between sections above the limits in section 2.
- Contrast test passes. Empty and thin content test (section 8) passes.
- Reduced-motion check done. Typecheck passes.
- "Unchanged" means: template ID, the data that orders, reservations, cart, and checkout read, and commerce behavior. Additive manifest and resolver fields (`sectionAlign`, spacing values, a new hero variant) are allowed. The markup of commerce blocks may change. Template specs must use this same definition. If a template spec says "commerce blocks unchanged", it means behavior and data, not markup, unless the spec explicitly says markup is frozen. Because a template spec outranks this file, a stricter wording there would win and could block restyles such as menu rows.
- Manifest version: [DECISION NEEDED] keep 1.0.0 resolvable alongside a new version, alias old versions to the new manifest, or do not bump. Stored sites resolve by template ID and version, so replacing the only manifest with a new version breaks every site stored as 1.0.0.