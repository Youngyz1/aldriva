# Table & Flame: modern bistro

Status: DRAFT v0.2, pilot template. Follows `design/business-sites/BASELINE.md` (v0.3).
Template ID: `restaurant-table-flame`.
Reference sites: [OWNER: add 2 or 3 restaurant sites and what you like about each].
Tags: [existing] true in code today. [NEW] not in code yet, new work. [ASSUMED] proposed value, owner to confirm. [DECISION NEEDED] owner must decide before work starts.

## 0. Contract and scope

- Unchanged: the template ID, the data that orders, reservations, cart, and checkout read, and commerce behavior. "Commerce blocks unchanged" means behavior and data, not markup. The markup of menu and order blocks may change.
- Additive manifest and resolver fields are allowed (`sectionAlign`, spacing values, a new hero variant). Nothing existing is removed or renamed.
- Manifest version: [DECISION NEEDED] keep `1.0.0` resolvable alongside a new version, alias old versions to the new manifest, or do not bump. Stored sites resolve by ID and version, so replacing the only `1.0.0` manifest breaks every site stored as `restaurant-table-flame@1.0.0`. No manifest change may ship before this is decided.
- Precedence: this spec outranks BASELINE.md. If they conflict, report it instead of choosing silently.
- Testing prerequisite: the template is `legacy: true` and hidden from the new-site gallery. Testing needs an existing or seeded Table & Flame site. Judge visual work on `/site/<slug>`, not in the builder preview (BASELINE section 12).

## 1. Identity

A warm, relaxed evening-table feel. Ivory paper, terracotta, big photography, a soft serif for headlines, and generous but controlled space. Editorial and calm, not loud. It should suit a bistro, a wine bar, or a modern local restaurant.

## 2. Current state vs target

Current values [existing], from `lib/website-template-v2.ts` and `lib/website-v2-theme.ts`:

- Accent terracotta `#c65d3b`, hover `#7c2d12`, light `#fbe9e3`, CTA text `#090909`
- Base `#faf6ef`, footer band `#23211f`
- Headings Georgia / Times New Roman, body Geist, sticky header, CTA label "Order Now"
- Hero: resolver emits `variant: "split"`, `align: "left"`, 4:3 media beside text
- Menu browse: card grid with 64px thumbnails, category pills at hard-coded `top-16 md:top-20`
- Cards: 8px radius and `shadow-xs` from the global `.public-site` rule

Not in code yet [NEW]:

- Full-bleed hero with a bottom-left gradient scrim (existing image hero: centered, `min-h-[480px]`, uniform `bg-black/45`)
- Ivory header text over the hero photo (today header text is white only when a hero band and hero image exist, and this template has no hero band)
- Rendering of the paper texture (`texture: "paper"` is stored but nothing consumes it)
- `sectionAlign`, the new spacing values, `--site-header-h`
- Fraunces for headings (not registered for business sites)
- Printed-menu rows with dotted leaders and 88px thumbnails
- Full-height mobile menu overlay
- Footer address, phone, and map link
- Motion and reduced-motion handling for business-site blocks
- The palette and font-pairing pickers

## 3. Changes proposed

1. [NEW] Hero: from a split box to a full-bleed photo hero with a scrim. Header and hero change together.
2. [NEW] Headings: from Georgia to Fraunces [ASSUMED]. Body stays Geist. Loading Fraunces for this template only is part of the pilot phase. Georgia stays as the fallback.
3. [NEW] `sectionAlign: left`.
4. [NEW] Spacing: `roomy` for the hero, `default` elsewhere. Code names map to BASELINE names: `compact` = tight, `default` = default, `roomy` = relaxed.
5. [NEW] Curated palette set and font-pairing set for the builder (sections 4 and 5). This is a separate later phase (section 15), not part of the pilot.

## 4. Palette

Roles for the default palette. Approximate contrast ratios are my calculations, to be confirmed by the contrast test.

| Role | Value | Use |
|---|---|---|
| Base (ivory) | `#faf6ef` [existing] | Page background |
| Subtle (sand) | `#f1e9dd` [ASSUMED] | Alternate section bands, card hover |
| Ink | `#2a211b` [ASSUMED] | Text on base (about 14:1) |
| Muted | `#6b5d52` [ASSUMED] | Secondary text on base (about 6:1) |
| Accent terracotta | `#c65d3b` [existing] | Button fills, large type, icons, pill highlights |
| Accent deep | `#7c2d12` [existing hover] | Links and any small accent text on ivory (about 8.7:1) |
| On accent | `#090909` [existing] | Button label on terracotta (about 4.7:1) |
| Footer band | `#23211f` [existing] | Footer, CTA band. Text `#faf6ef` (about 15:1) |
| Olive | `#5f6b3c` [ASSUMED] | Vegetarian tag, quiet secondary |
| Border | `#e6dccd` [ASSUMED] | Hairlines, card borders |

Rules:
- Terracotta `#c65d3b` on ivory is only about 3.9:1. Never use it for small text on ivory. Use Accent deep.
- White text on terracotta is only about 4.2:1. Use the On accent color, or use `#b4532a` (about 5:1 with white) if white labels are wanted [ASSUMED].
- Text colors on bands, buttons, and the header come from `readableOn`, not from hardcoded values (BASELINE section 4).

### Palette options in the builder [ASSUMED, later phase]

Six palettes that differ in hue and mood, not only in accent. Today V2 accents carry only accent, hover, light, and CTA text. Palettes with their own base and ink, and Ink & Brass in particular (dark base), require base and band colors to become palette-driven instead of fixed in `templateBackground` and `lockedTheme`. That is a larger job than the pilot.

| Name | Mood | Base | Accent | Ink |
|---|---|---|---|---|
| Terracotta (default) | Warm, bistro | `#faf6ef` | `#c65d3b` | `#2a211b` |
| Olive Grove | Garden, calm | `#f6f4ea` | `#5f6b3c` | `#232619` |
| Wine Cellar | Romantic, rich | `#fbf3f1` | `#7a1f33` | `#2b1a1e` |
| Ink & Brass | Dark, upscale | `#1c1b19` | `#c9a24b` | `#f3eee3` (text) |
| Sea Salt | Cool, coastal | `#f4f7f6` | `#1f5f5b` | `#14282a` |
| Butter & Cobalt | Playful, fresh | `#fdf8e6` | `#2d4fb3` | `#1b2233` |

Every other role (subtle, muted, border, accent deep, on-accent) is computed with `readableOn` and checked by the contrast test, not chosen by hand.

## 5. Typography

- Headings: Fraunces [ASSUMED, NEW], weight 500, line-height 1.05 to 1.15, slight negative tracking on large sizes. Georgia remains the fallback.
- Body and UI: Geist [existing].
- Sizes: hero h1 40px mobile / 72px desktop. Section h2 30px / 44px. Item names 20px. Body 16 to 17px. Eyebrow 12 to 13px uppercase, tracking 0.08em.
- Prices use tabular numbers.
- Fraunces must cover Latin Extended (French accents). Verify before loading.

### Font pairings in the builder [ASSUMED, later phase]

Six named pairings with a distinct character. Only the chosen pair loads. None of these families except Geist is registered for business sites today, and nothing loads only the selected pairing yet. Verify each supports Latin Extended.

| Name | Heading | Body | Character |
|---|---|---|---|
| Bistro (default) | Fraunces | Geist | Warm, soft serif |
| Brasserie | Playfair Display | Source Sans 3 | Classic, high contrast |
| Modern Table | Instrument Serif | Inter | Sharp, contemporary |
| Trattoria | DM Serif Display | DM Sans | Friendly, bold |
| Market | Bricolage Grotesque | Inter | Informal, street-food |
| Atelier | Cormorant Garamond | Jost | Elegant, light (large sizes only) |

## 6. Shape and depth

- Cards and images: 12px radius. Buttons and pills: fully rounded.
- No shadows by default. Depth comes from the sand band, thin borders (`#e6dccd`), and the paper texture, kept subtle.
- The paper texture is [NEW]: it is stored in the manifest but not rendered today. If it is not built in the pilot, drop it from this section rather than leaving it implied.
- Card radius and shadow are per-template tokens applied through a scoped override. Do not edit the global `.public-site` card rule (`.rounded-xl.border` forced to 8px, `shadow-xs`), so other templates keep their look.

## 7. Header

- Sticky [existing]. Over the hero it is transparent with ivory text. After 24px of scroll it turns solid ivory with ink text and a hairline border. The "over a photo with a scrim" signal comes from the hero, not from a hero band, so header and hero ship together.
- Header text color comes from `readableOn` against the actual background in both states.
- Left: logo with the business name beside it (the logo alone is too small). Right: navigation and the "Order Now" button.
- Mobile [NEW]: a clearly visible menu button, opening a full-height ivory overlay with large serif links and the CTA. Today the open menu is a dropdown inside the header.
- Height 64px mobile, 80px desktop, published as `--site-header-h`.

## 8. Hero

- Full-bleed food photo, min height 440px mobile / 560px desktop, text bottom-left. New hero variant, added alongside `split`.
- Scrim: dark gradient from about 65% at the bottom to about 25% at the top (base `#23211f`) [ASSUMED].
- Content: eyebrow (cuisine, area), h1 in Fraunces, one supporting line, then two CTAs: "Order now" (filled terracotta, On accent label) and "Reserve a table" (1.5px ivory outline, ivory label). The reserve button appears only when reservations are live [existing behavior].
- Optional strip of small pills at the bottom of the hero: "Open today until ...", address, phone, from existing business data. Each pill renders only when its data exists.
- Without a photo: a deep terracotta-to-espresso gradient with the logo mark, never an empty split.
- Hero padding comes from the section envelope with `roomy`. The block adds no `py-*` of its own.

## 9. Section recipes

All left-aligned through `sectionAlign`, section padding `default` unless noted. Names match the current manifest sections. Section background alternation is computed over the sections actually rendered, since optional sections drop out.

- Business offerings and highlights: 3 large cards with photo, title, one line. With 1 or 2 items, use a 2-column layout with a max width.
- Menu browse: category pills under the header (base color background, active pill terracotta, `top: var(--site-header-h)`). Items as printed-menu rows: name, dotted leader, price, short description in muted text, optional 88px thumbnail on the right. No photo means a text row. `StorefrontBrowse` is a shared block, so add the rows as a variant selected by this template, and other templates that render it keep their card grids.
- Menu order buttons and featured menu: large touch targets, terracotta fill.
- About: two columns on desktop (text left, photo right with 12px radius), stacked on mobile. Always has a visible heading.
- Gallery (optional): 2 columns on mobile, 3 on desktop, uniform aspect ratio.
- Testimonials: one large serif quote with a name and a small avatar, or 2 to 3 columns when there are enough. Always has a section heading.
- Hours and location: two columns, hours table left, address and map link right.
- Announcement banner ("today's special") [NEW, not a current manifest section]: a sand strip, left-aligned, text plus a link. Hidden when empty. Out of the pilot unless the owner adds it.
- CTA band: footer band color `#23211f`, ivory text, terracotta button. The footer uses the same color, so separate them with a 1px hairline in a lighter tone (about `#3a3632`) [ASSUMED], so they do not merge into one block.
- Footer: `#23211f` with ivory text. Business name and main navigation always render. Hours, address, phone, map link, and each social link render only when the data exists (BASELINE section 5). Address, phone, and map link are [NEW] in the footer.

## 10. Imagery and fallbacks

- Warm natural light, close-ups of real food and spaces. No generic stock photos that contradict the menu.
- Fallback for a missing photo: sand panel with the logo or the business initial in Fraunces. For a missing hero: see section 8.

## 11. Motion [NEW, interim until `motion.md` exists] [ASSUMED]

- Hero image fades in over 400ms. Sections fade and rise 12px once on first view, 300ms.
- Card hover: rise 2px, 200ms. Buttons: press scale 0.98.
- Everything off under `prefers-reduced-motion`, including any hero video (poster shown, no autoplay).

## 12. Do and don't

Do:
- Keep the hero a full-bleed photo with a scrim and one clear headline.
- Use terracotta for fills and highlights, Accent deep for small text.
- Keep one alignment (left) and one rhythm throughout.

Don't:
- Put terracotta text under 24px on ivory.
- Show a boxed white hero card, a flat color banner with no purpose, or alternating centered and left sections.
- Use a stock burger photo as a default image.
- Add a third font family.
- Hardcode white or black text on a band.

## 13. Example prompts

1. "Build the Table & Flame full-bleed hero variant and the matching header text signal together: scrim from section 8, eyebrow, Fraunces h1, one supporting line, then Order now and Reserve a table."
2. "Add a printed-menu-rows variant to StorefrontBrowse for Table & Flame only, with dotted leaders and sticky pills per section 9. Leave other templates unchanged."
3. "Show the Table & Flame home page with 2 menu items, no gallery, and no testimonial, and check it against BASELINE section 8."

## 14. Acceptance

- BASELINE section 13 passes, including before and after screenshots of every other V2 template for any shared-code change.
- Header and footer readable in all states (palette checks for all six palettes belong to the picker phase).
- Home page with realistic and with thin content looks intentional on 375px, 768px, and 1440px.
- Terracotta default matches section 4. Fraunces loads only for this template.
- A site stored as `restaurant-table-flame@1.0.0` still resolves and renders (per the version decision in section 0).
- Orders and reservations still work end to end.

## 15. Phases

1. Shared foundation (BASELINE): `readableOn`, contrast test, single padding owner, spacing values, header and footer text, footer content, `--site-header-h`, card tokens.
2. Table & Flame pilot: full-bleed hero and header together, `sectionAlign`, Fraunces for this template, menu rows variant, section recipes, mobile menu overlay, motion. Needs the version decision first.
3. Pickers and fonts: palettes, pairings, per-pairing font loading, palette-driven base and bands, then the V2 accent picker.