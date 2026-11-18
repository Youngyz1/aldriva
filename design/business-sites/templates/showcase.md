# Showcase — Template Design Spec

> Mobile-first storefront. Clean sans-serif, photo-led cards, one accent colour.
> Reference: the Oakory mockup (home + catalog screens). Structure borrowed from Airbnb's style reference.

**Scope:** template id `showcase` only. Nothing here may change the other templates (Savannah, Table & Flame, Food Order, Store, Rental). Everything is scoped under `[data-site-template="showcase"]`.

**Authority:** template spec (this file) > `design/business-sites/BASELINE.md` > root `DESIGN.md`.

**Rule zero:** a change is not done until it has been screenshotted at 390px and 1280px and looks like the mockup. Passing tsc and unit tests does not count.

---

## 1. Principles

1. **Photo first.** The product image is the main thing on every card and every slide.
2. **One typeface, one accent.** Sans-serif everywhere. Colour comes only from the palette tokens.
3. **Flat and soft.** No drop shadows on cards. Depth comes from the soft background, a hairline border and generous radius.
4. **Small, confident type.** Card titles are small and medium weight. The price is the boldest thing on the card.
5. **Tight, consistent rhythm.** One spacing scale, one section gap. No per-component margin overrides.

---

## 2. Known bugs to remove first (found by the browser audit)

These are old global rules leaking into Showcase. Fix them before anything else.

| # | Problem | Cause | Required fix |
|---|---------|-------|--------------|
| 1 | Whole site renders in serif | Stored `theme_config.fontFamily: "serif"` is injected as inline `--site-font` / `font-family` on `.public-site` | For Showcase, ignore `theme_config.fontFamily`. The template font stack (section 3) always wins. Add a test. |
| 2 | Sans stack resolves to empty | `--ps-font-*` references `var(--font-arimo)`, which is only attached for Savannah, so the variable is invalid | Showcase font stack must not depend on `--font-arimo`. Use a stack that works on its own (section 3). |
| 3 | Card titles render 24px | `.public-site h3 { font-size: var(--ps-h3) }` beats `text-[16px]` | Scope or neutralise this rule under `[data-site-template="showcase"]`, or give the card title a selector that wins. |
| 4 | Card radius is 8px | `.public-site .rounded-xl.border { border-radius: var(--site-card-radius, 8px) }` | Define `--site-card-radius: 16px` for Showcase, or scope the rule out. |
| 5 | Section headings oversized ("Popular items", "About", "Visit us" render about 32-40px) | Same family of global `.public-site h2` rules | Scope out for Showcase. Headings follow the section 3 scale. |
| 6 | Catalog title touches the header | No top padding on the page | 16px padding above the page title. |
| 7 | Item detail sheet looks broken | See section 10c | Rebuild to section 10c. |
| 8 | Promo shows the photo twice, with a pale panel and unreadable text | Old split layout still rendering under the new full-bleed layer | One `<img>` per slide, no panel, soft scrim only (section 7). Find and remove the old layer. |
| 9 | Buttons stretched across the whole card or sheet | Missing content-width rule (flex stretch / w-full) | Buttons size to their content (section 5). |
| 10 | Dead controls: "View full menu" on the menu page, Popular cards not clickable, Cart / Order / More tabs open a blank page | Not wired | Remove the redundant link; wire the rest (sections 6, 10, 10d). |

After the fix, computed values must match section 3 and section 5. Verify with `getComputedStyle`, not by reading source.

---

## 3. Typography

**Font stack (body, headings, buttons, prices, labels):**

```
ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif
```

No serif anywhere. No `oldstyle-nums`. Prices use `font-variant-numeric: lining-nums tabular-nums`.

| Role | Mobile (390) | Desktop (1280) | Weight | Line height |
|------|--------------|----------------|--------|-------------|
| Page title (catalog) | 24px | 32px | 700 | 1.2 |
| Section title ("Popular Picks") | 18px | 22px | 600 | 1.25 |
| Promo headline | 22px | 36px | 700 | 1.15 |
| Promo subtext | 14px | 16px | 400 | 1.4 |
| Card title | 14px | 15px | 500 | 1.3 (max 2 lines) |
| Card price | 16px | 18px | 700 | 1.2 |
| Struck-through price | 12px | 13px | 400 | 1.2 |
| Badge | 11px | 11px | 700 | 1 |
| Chip / control label | 14px | 14px | 500 | 1 |
| Body / caption | 14px / 12px | 16px / 13px | 400 | 1.5 |
| Trust strip title / line | 12px / 11px | 13px / 12px | 600 / 400 | 1.3 |
| Tab bar label | 11px | n/a | 500 (600 active) | 1 |

Rules:
- Never size below 11px.
- Weights allowed: 400, 500, 600, 700. Nothing lighter, nothing heavier.
- Letter spacing: normal, except -0.01em on the promo headline at desktop.

---

## 4. Colour (palette tokens only, no hex, no `bg-white`)

| Use | Token |
|-----|-------|
| Page background | `--tf-base` |
| Card surface | `--tf-card` |
| Photo backing, soft panels, footer | `--tf-soft` |
| Primary text | `--tf-ink` |
| Secondary text | `--tf-muted` |
| Hairlines and borders | `--tf-border` |
| Accent (CTA, active chip, active tab, price emphasis in badges) | `--tf-accent` |
| Text on accent | `--tf-on-accent` |

Rules:
- Accent is used for: primary buttons, active chip, active tab, badge background. Nothing else.
- Text pairs must reach contrast 4.5:1 in all 7 palettes. The existing contrast test stays.
- No gradients except the promo slide (section 7).

---

## 5. Spacing, shape, layout

**Base unit: 4px.** Allowed values: 4, 8, 12, 16, 20, 24, 32, 40, 48.

| Token | Mobile | Desktop |
|-------|--------|---------|
| Page horizontal padding | 16px | 24px |
| Max content width | 100% | 1152px, centred |
| Gap between sections | 32px | 56px |
| Gap between heading and its content | 12px | 16px |
| Card inner padding | 12px | 12px |
| Grid gap | 12px | 16px |
| Chip gap | 8px | 8px |

Radii:

| Element | Radius |
|---------|--------|
| Cards | 16px |
| Promo slide | 20px |
| Card photo | 12px (inside the card) |
| Buttons, inputs, chips, badges, heart | 9999px (pill) |
| Trust strip items | 12px |
| Tab bar | 20px top corners |

Controls: minimum height 44px for anything tappable (buttons, inputs, tabs). **Buttons size to their content:** height 44 to 48px, horizontal padding 20 to 24px, never stretched to the full width of the card, sheet or page (the search field is the only full-width control). In a footer with a quantity stepper or a total, the button sits on the right at its natural width. Chips may be 36px high with a 44px tap area.

**One container everywhere.** Header, Home sections, Menu page and footer share the same content container (max 1152px, padding 16px mobile / 24px desktop). Page title, chips, search, promo, services strip and cards all share the same left edge at both viewports.

**Do not** use `py-10 sm:py-16` style section padding on the Home page. Use the gap values above. The Home top area (search, chips, promo, popular) is one continuous block with the gaps in this table.

---

## 6. Home page, top to bottom

1. **Header:** logo and business name on the left. On desktop, a cart icon with a count badge on the right (it opens the cart drawer, section 10d). On mobile there is no header cart icon: the Cart tab is the only cart entry point. Height 56px.
2. **Search field:** full width, pill, 44px high, search icon inside, filter button on the right (opens a sheet with categories and sort). Submits to the catalog page with `?q=`.
3. **Promo carousel (the hero):** see section 7. Directly after search. No category chips between them.
4. **Services strip:** directly below the promo card (section 10).
5. **Popular strip:** title on the left, "View all" link on the right to the catalog page (14px, `--tf-muted`). Below: cards in a horizontal scroll-snap row on mobile and a grid on desktop. **No prev/next arrow buttons**: swipe on touch, grid on desktop. Owners edit these items from their catalog. Tapping a card opens the same item sheet as on the catalog page; the heart and the "+" keep their own actions and do not open it. Cards are the same size as on the catalog page.
6. **About:** section 10a.
7. **Visit us:** section 10b.
8. **Footer** and **bottom tab bar** (section 10).

There is no separate hero image. If the owner has no promotions, step 3 is skipped and the page goes from search to services/Popular. Category chips live on the catalog page only.

---

## 7. Promo carousel (hero)

The owner can add one or many promotions. Each promotion is one slide, with its own headline, subtext, button and image. This is where the owner promotes a dish, an offer or any product. With no promotions the whole block is absent (no gap).

**Slide card (default style: full-bleed photo)**
- The photo fills the whole card, `object-fit: cover`, `object-position: 70% 50%` so a subject on the right stays visible.
- Radius 20px, 1px `--tf-border`, overflow hidden.
- Exactly one `<img>` per slide. No panel, box or solid background behind the text; only the soft scrim, with no visible edge.
- Height: 200px mobile, 300px desktop. Slide width: 88% on mobile (the next slide peeks), full container width on desktop.
- **Scrim over the photo** so text is always readable: a left-to-right gradient from `--tf-ink` at 70% opacity at the left edge, fading to transparent at about 75% of the width. Opacity must be at least 60% everywhere text sits.
- Text sits on the left over the scrim, about 60% of the card width, vertically centred. Padding 16px mobile, 32px desktop.

**Text (all over the scrim)**
- Text colour: the readable-on-ink colour from the existing colour engine (`readableOn`), never raw white.
- Headline 22px/700 mobile, 36px/700 desktop, max 3 lines. Step the size down for long text instead of clamping.
- One line of subtext, 14px mobile / 16px desktop.
- Optional offer chip: 1px outline and text in the readable-on-ink colour, pill, 12px/600.
- CTA button: pill, `--tf-accent` fill, `--tf-on-accent` text, 44px high, 20px horizontal padding, arrow icon.

**Alternate style: cutout (`promoImageStyle: contain`)**
- For product cutouts. Card background is the soft gradient `var(--tf-soft)` to `var(--tf-base)`, text in `--tf-ink`, and the image sits on the right half, bottom-aligned, `object-fit: contain`, edges faded with a CSS mask. No scrim.
- Select values: `cover` (default, full-bleed) or `contain` (cutout).

**No image:** a text slide on the soft gradient with `--tf-ink` text, text spanning the full width.

**Controls**
- Dots centred at the bottom of the card, on top of the photo, with a small translucent backing so they are visible on any image. Active dot uses accent. Pause button stays.
- Auto-advance 5s, paused on hover or touch.

**Contrast test:** for all 7 palettes, text colour against the worst-case scrim (the ink scrim at its lowest opacity over a pure white photo) must be at least 4.5:1. At 60% opacity over white the scrim is about #707070, which gives white-ish text about 4.9:1.

**Content guidance for owners (helper text in the editor)**
- Any good photo works. Put the subject on the right side so the text on the left stays clear.
- Keep the headline short (under 40 characters) and the subtext to one line.
- Product cutout on a plain background? Choose the "Cutout" image style.

---

## 8. Product card

Used identically on the Home strip and the catalog page.

```
+----------------------------+
| [badge]              [heart] |  <- on the photo
|        photo 4:3           |
+----------------------------+
| Name (14px/500, 2 lines)   |
| $16.00  $20.00 (struck)  [+]|
+----------------------------+
```

- Surface `--tf-card`, 1px `--tf-border`, radius 16px, no shadow.
- Photo: aspect 4:3, `--tf-soft` behind it, radius 12px, 8px inset from the card edge on all sides, `object-fit: cover`.
- Badge top-left on the photo, one at most (Discount, Popular, New). Pill, accent fill, `--tf-on-accent` text, 11px/700.
- Heart top-right on the photo: 32px circle, `--tf-card` background, outline icon. Filled accent when active. Toggling must not add to cart or open the item. `aria-pressed` and en/fr label.
- Name: 14px/500, `--tf-ink`, max 2 lines.
- Price row: price is the largest and boldest text on the card (16px/700). The original price sits beside it, struck through, `--tf-muted`.
- "+" quick-add: 32px circle, hairline border, bottom-right inside the card. Keeps existing add / open / sold-out behaviour.
- No description, no rating, no colour dots.

**Card widths**
- Home strip, mobile: 160px fixed width, scroll-snap, about 2.3 cards visible with a peek of the next.
- Home strip, desktop: 4 columns in a grid (or the same scroll row at 220px per card).
- Catalog, mobile: 2 columns, fluid.
- Catalog, tablet (768px+): 3 columns.
- Catalog, desktop (1024px+): 4 columns.
- Cards fill their grid cell. They are never left-clustered in a wider container.

---

## 9. Catalog page

Top to bottom:

1. Back arrow and search field (pill, with "Search in <section>" placeholder). On desktop only, a cart icon with a count.
2. Page title (24px/700), using the owner-named catalog (section 10f). One-line subtitle (14px, `--tf-muted`) only if the section has a description.
3. Chip row: category chips first, then a **Sort** chip with a small chevron. No Filter, Colour or Material chips.
4. Product grid (section 8).
5. No "View full menu" button on this page (it points to the page you are on). The order bar (section 10d) appears above the tab bar when the cart has items, and the page gets extra bottom padding so it never covers the last row.

---

## 10. Trust strip, tab bar, footer

**Trust strip**
- One container: `--tf-card`, 1px `--tf-border`, radius 12px, padding 12px.
- Items in a scroll-snap row, hidden scrollbar. Item: 20px icon, title 12px/600, line 11px/400 `--tf-muted`.
- Source order: owner `trust` items, then site `highlights`, then automatic chips for live features (Order online, Delivery, Pickup, Reservations, Online payment).
- No claims in default copy.

**Tab bar**
- `--tf-card` surface, rounded 20px top corners, hairline top border.
- Active tab: accent icon and accent label at 600 weight. Inactive: `--tf-muted`.
- Do not change heights, offsets or safe-area handling.
- Tabs depend on the site: Home, the owner-named catalog (section 10f), Order and Cart (only when ordering is enabled), More. **More** opens a sheet listing the remaining pages that exist (for example Reservations, Contact) and the language switch. No tab may open a blank page.

**Footer**
- `--tf-soft` background, `--tf-ink` text, links `--tf-muted`.
- Contrast test for all 7 palettes, text 4.5:1 or better.

---

## 10a. About (split layout)

Based on the supplied `hero-fashion` component, adapted to this template.

**Layout**
- Mobile: image on top, text below. Desktop (768px+): two columns, text left, image right, gap 48px, vertically top-aligned.
- Image: `--tf-soft` behind it, radius 20px, `object-fit: cover`, aspect 4:3 on mobile and 4:5 on desktop. No drop shadow, no blurred colour blob.
- No full-screen height, no white background wrapper. The section sits on `--tf-base`.

**Text column (every part is optional and hidden when empty)**
- Eyebrow: small caps label (12px/600, `--tf-muted`, letter spacing 0.08em). The owner's text, for example a season or tagline.
- Headline: the owner's headline, else the business name, else the localized word "About". Display size 32px mobile / 48px desktop, weight 700, tracking -0.02em, line height 1.1, `--tf-ink`.
- Link list: the business's menu categories (up to 5), 18px/500, each linking to the catalog with `?section=<id>`. Hover: shift up 2px and full opacity, as a CSS transition of 200-300ms. No animation library.
- Body: the owner's text, 16px, line height 1.6, `--tf-muted`, max width 448px.
- Optional text link "View <catalog name>" to the catalog.

**Do not copy from the component:** the brand name "Kokonut.", "SUMMER 2025", the Anglomania paragraph, the external image URL, `bg-white`, `text-black`, the pink hex blob, or the `motion` dependency. The component's generic setup instructions (shadcn folders, installing `motion`) do not apply, and its fashion image is replaced by a food sample image (section 10e). The layout and rhythm are what to borrow.

---

## 10b. Visit us

- Section title uses the section scale (18px/22px, 600).
- Mobile: one stack. Desktop: two columns of equal height.
- **Opening hours card:** `--tf-card`, 1px `--tf-border`, radius 16px, padding 16px. Seven rows, 14px, day on the left (500) and hours on the right (`--tf-muted`), separated by a single 1px hairline (no thick or double lines). Today's row has a `--tf-soft` background and 600 weight. A small "Open now / Closed" pill at the top only if the business timezone is available.
- **Location card:** same surface. Place name (16px/600), then tappable rows with icons: address, phone (`tel:`), email (`mailto:`), each 44px high. "Get directions" pill button, accent fill, 44px, at the bottom.
- Card titles inside ("Opening hours", "Location") are 16px/600, not display size.

---

## 10c. Item detail sheet

- Mobile: bottom sheet, radius 20px on the top corners, max height 90dvh, content scrolls inside, drag handle on top, backdrop dimmed. Desktop: centred dialog, max width 480px, radius 20px.
- Header: title 20px/600, max 2 lines, line height 1.3. Close button: 36px circle top-right.
- Image: full sheet width with 16px inset, 4:3, radius 12px, `object-fit: cover`.
- Price 18px/700. Description 14px, `--tf-muted`. Tags (Vegan etc.) are small pills, 12px.
- Allergens: a compact row, 14px, on a `--tf-soft` background with 12px radius. No square outlined box.
- Footer is sticky inside the sheet, with safe-area bottom padding: quantity stepper (pill, 40px, round 36px buttons) on the left, and on the right (or full width on very small screens) the accent "Add to order · $50.00" pill button, 48px high.
- Nothing may be clipped by the sheet edge or the device navigation bar.

---

## 10d. Cart and Orders

**Problem found:** the Cart, Order and More tabs opened blank pages, and the same thing was called both "order" and "cart".

**Rules**
- **Two ways in, one cart view.** The Cart tab (with a count badge) and the order bar both open the same cart view. On desktop (no tab bar) the header cart icon opens it too.
- **Order bar:** shown when the cart has items, above the tab bar on mobile. Dark pill (`--tf-ink` background). Left: "Your cart · $79.16" (no count circle, because the Cart tab badge already shows the count). Right: "View cart" accent button at its natural width. Not shown when ordering is disabled.
- **Vocabulary (en and fr):** "Cart" means items chosen but not yet placed. "Order" means something already placed. The item sheet button reads "Add to cart · $50.00".
- **Cart tab** opens the cart view: a bottom sheet on mobile (same style as the item sheet) and a right-side drawer, 400px wide, on desktop.
  - Title "Your cart". Each row: name, unit price, quantity stepper (pill, 36px round buttons), remove control. Line total on the right.
  - Footer (sticky): total on the left and an accent "Checkout" pill button at its natural width on the right, 48px.
  - Empty state: short message ("Your cart is empty") and a "Browse <catalog name>" button.
  - Adding an item does not open anything. The badge updates (small bump animation).
- **Order tab** opens "Your orders": orders placed from this device, newest first, each with status, time and total. Tapping one shows its detail.
  - Empty state: "No orders yet" and a "Browse <catalog name>" button.
  - It must no longer just open the menu.
  - Data source: use whatever the system already provides for looking up a guest's orders. If there is none, keep the ids of orders placed from this device in `localStorage`, keyed by site slug (try/catch, no account, no server change), and list those.

---

## 10e. Sample content (template preview)

A template must never look empty when a customer opens it in the gallery. Showcase ships with sample content, including images.

**Two modes**
- **Preview mode** (template gallery, and the starting state in the builder before the owner has entered anything): every section is filled with sample content, so the customer sees the finished look.
- **Live mode** (a published site): only the owner's own data is shown. Empty parts hide (section 10a). A live site must never show another business's sample dishes as if they were its own.
- Sample items are marked as sample in the data (for example `isSample: true`), and the builder shows a small "Sample" label on them. If cheap, warn the owner at publish time that sample content is still present. Report what was done.
- Sample content is template manifest data. It is not written to the database rows of real businesses.

**What to include**
- 3 promo slides (headline, one line of subtext, button, image), so the carousel, dots and swiping are visible. Use ordinary dish photos with the subject on the right, not cutouts.
- 8 menu items across 3 categories (for example rice dishes, soups and grills, drinks and desserts), each with a photo, a price, and one with a struck-through original price and a Discount badge.
- 1 About image and sample About text.
- Sample hours, address, phone and email for Visit us, clearly generic. No real business names or numbers.
- Sample services strip items.
- A neutral mix of dishes. Not tied to one cuisine or country.

**Images**
- Source: Unsplash. Do not guess photo IDs from memory. Use the Unsplash API or pages you can actually open, and confirm each URL returns HTTP 200 with an image content type.
- Check that each photo shows what its slot says (a soup photo for a soup item). Report the Unsplash page URL for each photo so a person can review them.
- Self-host them (follow how existing templates store preview images) instead of hotlinking, so previews load fast and never break.
- Sizes: menu items 800x600, promo images 1200x900, About 1000x1250. WebP, under 150KB for menu items. Real alt text on every image.
- Keep a `CREDITS.md` next to the images with photographer and Unsplash URL for each.
- Before building this, look at how the existing templates (Savannah, Table & Flame) provide preview content and follow that pattern.

---

## 10f. Owner-named catalog

The catalog is the owner's to name. A restaurant calls it "Menu", a shop "Catalog" or "Products", a service business "Services", a studio "Gallery". The template must never hardcode "menu" or "catalog".

- Read the owner's catalog name (follow how `extras.catalogSource` and the existing en/fr copy keys work today and extend that; report how it is configured). Use it everywhere: header nav, tab bar, page title ("Browse the <name>"), search placeholder, "View all", empty-state buttons ("Browse <name>"), About link, footer links. Same word in every place.
- Items may be dishes, products, services or plain pictures. Price is optional. Nothing assumes food.
- **Ordering enabled:** cards have the "+", the item sheet shows "Add to cart", and the Cart tab, Order tab and order bar exist.
- **Ordering disabled** (for example a services or portfolio site): no "+", no Cart or Order tabs, no order bar. The item sheet shows the item's own action button (existing `action`, for example "Contact us" or "Book") at its natural width. Tapping a card still opens the sheet.
- Sample content stays a menu for the preview, but every label must come from the owner name, so changing it to "Services" changes every label.

---

## 11. Do and don't

**Do**
- Use the type scale and spacing values from this file and nothing else.
- Use tokens for every colour.
- Test with long names ("Coconut rice with prawns and plantain") and with a missing image.
- Screenshot both viewports after every change.

**Don't**
- Don't use serif fonts, ever, on Showcase.
- Don't read `theme_config.fontFamily`, `borderRadius`, or `primaryColor` for Showcase. The palette and this spec own the look.
- Don't add shadows to cards.
- Don't add new global CSS rules outside `[data-site-template="showcase"]`.
- Don't clamp the promo headline. Step the size down instead.
- Don't add colours, gradients or fonts that are not in this file.

---

## 12. Acceptance checklist (run with Playwright at 390x844 and 1280x900)

Computed values, not source:

- [ ] Body, card title, price and button font-family resolve to the sans stack. No serif glyphs.
- [ ] Card title computed size is 14px (mobile) and 15px (desktop). Weight 500.
- [ ] Card price is 16px / 18px, weight 700, lining numerals.
- [ ] Card computed border-radius is 16px. No box-shadow.
- [ ] Photo aspect ratio is 4:3.
- [ ] Catalog grid: 2 columns at 390px, 4 columns at 1280px. Columns fill the container width.
- [ ] Home strip: cards are 160px wide on mobile with the next card peeking.
- [ ] One container: the left edge of the page title, search, promo, services strip and cards is identical on Home and Menu at 390px and 1280px.
- [ ] Gap between Home sections is 32px (mobile) and 56px (desktop). No overlaps.
- [ ] Promo slide (default style): the photo fills the whole card at 390px and 1280px, no hard-edged rectangle, no small corner thumbnail. Scrim present, text readable, headline 22px/700 mobile.
- [ ] Promo contrast test passes for all 7 palettes against the worst-case scrim.
- [ ] Switching a slide to Cutout shows the gradient card with the faded image on the right.
- [ ] Home order is: header, search, promo, services, Popular, About, Visit us, footer.
- [ ] No prev/next arrows on the Popular strip.
- [ ] With no promotions, the promo block is absent and there is no empty gap between search and the next section.
- [ ] With 3 promotions, swiping moves between slides, dots update, each slide shows its own text and image.
- [ ] Preview mode shows sample images in the promo carousel, Popular items, the full menu, and About, with no broken images and no empty placeholders.
- [ ] Live mode with no owner data shows none of the sample dishes. Empty parts are hidden.
- [ ] Every sample image returns HTTP 200, matches its slot, and has alt text.
- [ ] Order bar: appears with items in the cart, reads "Your cart · $", has no count circle, "View cart" opens the cart view. Hidden when the cart is empty.
- [ ] No "View full menu" button on the catalog page.
- [ ] Tapping a Popular card opens the item sheet. Heart and "+" do not open it.
- [ ] Every button is content-width (no button wider than its text plus padding, except the search field).
- [ ] Promo slide has exactly one <img>, no panel behind the text, readable text on the car photo.
- [ ] Renaming the catalog to "Services" changes the label in the nav, tab bar, page title, search placeholder and buttons. No hardcoded "Menu" or "Catalog" remains.
- [ ] With ordering disabled: no Cart or Order tabs, no bar, no "+", and the item sheet shows its action button.
- [ ] More tab opens a list of the remaining pages. No tab opens a blank page.
- [ ] Cart tab opens the cart with the added items, quantities and total. Empty cart shows the empty state.
- [ ] Order tab opens "Your orders" (or "No orders yet"), never the menu.
- [ ] The words "cart" and "order" are used as defined in section 10d, in en and fr.
- [ ] Section headings ("Popular items", "Visit us") compute to 18px mobile / 22px desktop.
- [ ] About uses the split layout, with no placeholder copy and no empty parts.
- [ ] Item sheet: title 20px, image radius 12px, sticky footer, nothing clipped at 390px.
- [ ] Every text and background pair passes 4.5:1 in all 7 palettes.
- [ ] The other five templates are unchanged (snapshot comparison).
- [ ] Screenshots saved and compared side by side with the mockup.