# Invitation Template Spec — "Minimalism Dark Blue"

**Status: spec only. No visual-section code was written for this document.**

**[OWNER DECISION, later round]** Every hydrangea illustration (gate card, ceremony/reception/programme cards, page foot) was removed from the actual implementation and the two SVG files deleted. The hydrangea descriptions below remain as a factual record of what the reference screenshots show — they no longer describe what this template builds. The corresponding checklist items (§10) are unchecked/struck accordingly.

## 0. Sourcing and tagging key

Every detail below is tagged with where it came from:

- **[SCREENSHOT]** — directly visible in `docs/minimalism-dark-blue/*.jpg` (7 images, captured 2026-11-07, French locale, `chungdoi.com/fr/...`, mobile Chrome, ~390 CSS px wide / 1080px physical, DPR ≈ 2.77).
- **[INVESTIGATION DOC]** — from `docs/REA-CHUNGDOI-MARKETPLACE-INVESTIGATION.md`, a prior read-only Playwright investigation. **Important caveat: that investigation examined the sibling template "Minimalism - Brun Foncé" (dark brown, slug `minimalism-dark-brown` / `minimalism_darkbrown`), not the dark-blue variant in our screenshots.** Both are presumed to be the same product family (same `minimalism` layout engine, different palette), so mechanics are carried over here, but this is itself an **[ASSUMED]** bridge — the dark-blue variant's interaction code was never directly observed.
- **[ASSUMED]** — not visible in either source; inferred from the task brief's own description, general UX convention, or marked as an open question. Flagged explicitly so these can be confirmed or corrected.
- **[GAP]** — a discrepancy between the task brief's description and what the evidence actually shows.

No pixel/EyeDropper color-picker tool was used — hex values below are visually estimated from the on-screen rendering. They must be re-sampled with a color picker before any production CSS is written. This is noted again in §9.

## 1. IP / licensing note (read before building visuals)

chungdoi.com is a live commercial product (see investigation doc §2.1–2.4: paid plans, "Payez seulement si vous l'adorez" trial copy). Per the user's instruction on this task: layout, structure, copy, spacing, colors, fonts, and interaction *patterns* are being replicated exactly — these are generally not protectable (functional UI/UX patterns are common across this entire product category; dozens of competing wedding-invitation SaaS products share this exact feature set). The specific **illustration artwork** (hydrangea cluster paintings, the envelope/wax-seal graphic, the castle watermark line art, the gift-box illustration, the programme line icons) is more likely to be protectable creative expression. Per instruction: **these illustrations must not be traced or have their source files reused.** §6 below specs each illustration's composition, palette, and placement in enough detail for an illustrator/generator to produce new, original artwork matching the described style. Until that artwork exists, the template renders with simple placeholder shapes (described in §6.9).

## 2. Screen inventory and section order

Top to bottom, matching the task brief's 11-screen breakdown, cross-referenced to what the 7 screenshots actually show:

| # | Screen | Screenshot file | Confirmed in our screenshots? |
|---|---|---|---|
| 1 | Cover gate | `025410` | Yes |
| 2 | Hero (envelope + photos, "Our wedding", names) | `025452` (top) | Yes |
| 3 | Ceremony info card (parents, invitation line, names, ceremony+reception venue/time/date) | `025452` (bottom) + `025513` (top) | Yes |
| 4 | Photo gallery (3D coverflow) | `025513` (bottom) + `025525` (top) | Yes |
| 5 | Reception info (countdown, calendar, add-to-calendar, confirm presence) | `025525` + `025543` (top) | Yes |
| 6 | Venue map + itinerary | `025543` | Yes |
| 7 | Dress code | `025543` | Yes |
| 8 | Programme timeline | `025543` (bottom) + `025604` (top) | Yes |
| 9 | Guestbook (form + wishes list) | `025604` | Yes |
| 10 | Gift box → QR reveal | `025604` (teaser) + `030849` (opened modal) | Partially — see §2.1 gap below |
| 11 | Floating music button | Visible as a small circular icon, bottom-right, in `025452`, `025525`, `025543`, `025604`, `030849` | Icon visible; **behavior** not visible in a static screenshot |

### 2.1 [OWNER DECISION] Gift box and "Confirm Presence" are the same RSVP flow

Original finding (superseded): the screenshots show "CONFIRM PRESENCE" (Reception Information card) and "Gift Box" (§3.10 teaser → modal) as two visually separate triggers, with the gift-box modal going straight to a bank/QR screen and no accept/decline step visible in between either path.

**Owner ruling:** both triggers open the **same** RSVP flow. There are no bank details anywhere in this template. The flow is:
1. Accept or decline.
2. Generic-link mode: guest enters name and an optional message. Personalized mode: name is prefilled from `data.guest.name`.
3. On accept: a downloadable QR code is issued to the guest (the QR's payload is the guest's own RSVP/ticket credential, not a bank reference — exact payload contract left to whatever the project's existing ticket/RSVP QR issuance already uses elsewhere, not reinvented here).
4. On decline: no QR; a simple decline confirmation.

The bank-name/account-reference fields added in the first pass are removed from both the schema and the template (§4 below, updated).

---

## 3. Screen-by-screen detail

### 3.1 Cover gate

**[SCREENSHOT]** (`025410`)

- Full-bleed dark navy background (`#0E2847` approx, see §9), no texture visible on the gate itself.
- Scattered small 4-point sparkle/asterisk glyphs (✳) in a muted olive/gold tone (`#8C8260` approx), irregularly placed across the background — roughly 7 visible in the capture, varying in size (~8–14px) and opacity (~40–70%), no visible grid/pattern to their placement.
- A centered card, roughly 476×340px at this capture's physical resolution (≈ 172×123 CSS px at 390 width — this card is noticeably smaller than full content width, floating mid-screen with large navy margin above and below):
  - Cream/ivory card background (`#F3EFE4` approx), subtle rounded corners (~8–10px radius), soft drop shadow.
  - Centered navy circle (~56px diameter) containing a white heart glyph, positioned overlapping the card's top edge (half in / half out).
  - Couple's names below, display serif, navy ink, two lines: "Vincent" / "& Marie-Ève" (the "&" on its own short line, smaller size).
  - A thin horizontal rule with a small ornament glyph centered in it, below the names.
  - Date line: "April 7, 2027" (or per-locale format), smaller serif, muted navy/gray.
  - Personalization line: "Yours sincerely, Guest" (or guest's real name in personalized mode) — smaller still, muted.
  - A pill-shaped navy button, white text, "Open".
- Tapping/clicking "Open" reveals the full invitation. **[INVESTIGATION DOC, sibling template]** confirms this is a real gate (not a route change — likely a `?open=1`-style query param or local component state) and that opening it also triggers the floating music control to appear and (per that doc) music to autoplay.
- **[OWNER DECISION] "Open fly-away" animation**: the cover card flies away accompanied by sparkles, then the invitation is revealed underneath. `prefers-reduced-motion`: instant swap, no animation, no sparkles. Implementation: the card translates/scales off toward one edge while fading, with a small burst of the same sparkle glyph (§6.7) animating outward from the card at the same time; total duration ≤600ms so it never blocks the gate from being dismissed.
- Organizer-fillable fields: both names, wedding date, (optional) guest-personalized line.

### 3.2 Hero

**[SCREENSHOT]** (`025452` top)

- Background switches to cream/ivory (`#F2EEE3` approx) with a faint, low-contrast architectural line-drawing watermark (a European-style building with a domed/spired tower — "castle watermark") bleeding from upper-right down through the whole page behind the content, very low opacity (~8–12%), monochrome navy-on-cream.
- "OUR WEDDING" eyebrow: small caps, letter-spaced, navy, centered, with a thin flourish/ornament rule above it.
- Envelope illustration, centered, large (~spans most of the content width):
  - A navy envelope shape (open flap at back), with two overlapping photographs "tucked" into the opening, tilted slightly opposite directions (one photo rotated ~-6°, the other ~+4°), white polaroid-style borders.
  - A circular gold wax-seal medallion (~15% of envelope width) centered at the base of the envelope opening, with a heart motif embossed in it.
  - Hydrangea flower clusters (dusty/navy blue blossoms with a few cream accent flowers and green foliage) anchored at both lower corners of the envelope, overlapping onto the cream background.
- Couple's names in large display serif, uppercase, navy, two lines ("VINCENT" / "MARIE-ÈVE"), with a small decorative script ampersand overlapping between/behind the names (the "&" sits as a watermark-weight flourish behind the gap between the two name lines, not as a normal inline character — visible faintly in `025452`).
- Organizer-fillable: two photos (for the envelope), couple names, eyebrow text (localizable, not organizer-edited).

### 3.3 Ceremony information card

**[SCREENSHOT]** (`025452` bottom, `025513` top — this card spans two captures as the user scrolls)

- A large, full-width, rounded-corner **navy card** (`#0F2A4E` approx), generous internal padding (~24px), overlaid on the cream/watermark background from §3.2.
- Hydrangea corner illustrations bleed in from outside the card at the bottom-left and bottom-right/upper-right, overlapping the card edge (not contained inside it).
- Inside the card, top to bottom, all centered, all light/cream text on navy:
  - "CEREMONY INFORMATION" heading, small caps, letter-spaced.
  - Two-column parents block: left column "Mr. and Mrs." / bride's father name / bride's mother name; right column "Mr. and Mrs." / groom's father name / groom's mother name; a thin vertical divider between columns.
  - Invitation sentence: "Your presence will make / this unforgettable day" (two lines, regular weight, smaller serif).
  - Full name of partner 1, large serif.
  - Script ampersand "&" on its own line (same script-font family as the hero's watermark ampersand, but here a normal-weight inline glyph, not a watermark).
  - Full name of partner 2, large serif.
  - Ceremony row: "CEREMONY {venue name}" label, then a sub-row with time on the left ("AT 7:00 PM") and weekday on the right ("WEDNESDAY"), then a large date row: big "07" numeral, a vertical divider, "APRIL" / "2027" stacked.
  - Reception row: same structure, labelled "RECEPTION {venue name}".
- Organizer-fillable: both sets of parents' names (**4 distinct name fields**, not 1 — see §4 gap), invitation sentence (default-with-override), both full names, ceremony venue/time, reception venue/time, shared date.

### 3.4 Photo gallery (3D coverflow)

**[SCREENSHOT]** (`025513` bottom, `025525` top)

- Section heading "PHOTO GALLERY", small caps navy, centered, on the cream/watermark background.
- A 3D coverflow carousel: center photo rendered large and flat-on; adjacent photos visible at ~40–50% scale, rotated in perspective (left neighbor's right edge recedes, right neighbor's left edge recedes — classic iTunes-coverflow 3D tilt), partially cropped by the viewport edges, lower opacity than the center photo.
- Left/right circular arrow buttons (translucent dark circle, white chevron) overlaid at the vertical center, outside the center photo's edges.
- A "{current}/{total}" counter below the carousel (e.g. "1/8"), small, muted.
- Task brief says gallery supports 1–10 photos; this capture shows 8.
- **[OWNER DECISION]** Touch swipe and arrow taps are both required (regardless of whether chungdoi's own reference implements swipe — investigation doc marks that as unconfirmed). The already-built `BohoCoverflowGallery` component (reused for this template, see §4) already implements both, plus keyboard arrows and a lightbox — no new gallery code needed.
- Organizer-fillable: 1–10 photos with optional captions/alt text.

### 3.5 Reception information

**[SCREENSHOT]** (`025525` bottom, `025543` top)

- Another full-width navy card, same visual language as §3.3 (hydrangea corners bleeding in, cream text on navy).
- "RECEPTION INFORMATION" heading.
- "THE RECEPTION WILL TAKE PLACE AT:" line.
- Time + weekday row, then the large date row (same big-numeral treatment as §3.3).
- Two-column sub-times: "GUEST RECEPTION" (arrival time) / "RECEPTION" (start time) — e.g. 18:00 / 20:30.
- "Countdown" label, then a live ticking string: "{N} jours {N} heures {N} min {N} sec" in the captured French locale — **[SCREENSHOT]** for the string format at capture time (a single static sample, obviously not literally "live" in a screenshot); **[INVESTIGATION DOC]** confirms (on the sibling template) this is a genuinely ticking countdown, re-sampled and observed to change.
- An embedded cream/ivory calendar card nested inside the navy card: month/year header in script font ("April 2027"), a 7-column weekday header (French single/double-letter abbreviations in this capture: "Read, My, Me, I, Ve, Its, Di" — these look like truncated/abbreviated French weekday labels, not full words; our build must use `Intl.DateTimeFormat(locale, {weekday:'narrow'})` or similar rather than hand-copying this specific truncation), date grid with the wedding date highlighted via a small navy heart badge over the number.
- "Add to calendar" text link, underlined, below the calendar.
- "CONFIRM PRESENCE" pill button, outlined/ghost style on the cream background (not solid navy) — see the open question in §2.1 about what this actually opens.
- Organizer-fillable: reception venue/time, arrival/start sub-times, RSVP deadline/behavior (if any).

### 3.6 Venue + map

**[SCREENSHOT]** (`025543`)

- "RECEPTION VENUE" heading, then a muted subheading with the general area ("Saint-Roch Area Quebec").
- An embedded, real, interactive-looking Google Map (place card with name/address/rating + "Open in Maps" button visible inside the embed itself — this is the native Google Maps embed UI, not custom-built). **[INVESTIGATION DOC]** confirms this is a real `<iframe>` Google Maps embed, not a static image.
- "Itinerary" text link with a small arrow/paper-airplane glyph, below the map — **[INVESTIGATION DOC]**: generates a real `google.com/maps/dir` URL.
- Per `AUTHORING.md` §0 in this repo, maps must render with **no bordered/framed wrapper** ("the map is bare... no frame around a frame") — note this is a difference from the reference, which shows the map in a plain rounded-rect container; our implementation should still honor the house no-double-frame rule since the map's own Google chrome already provides the boundary.
- Organizer-fillable: venue name, address, coordinates.

### 3.7 Dress code

**[SCREENSHOT]** (`025543`)

- "DRESS CODE" heading, then a single line of dress-code text ("Evening wear" in this capture).
- Three circular color swatches in a row below, no labels visible. In this capture they're warm browns/tans (`#2B1E16`, `#6B5540`, `#D9C6A8` approx) — **note these are this specific demo's organizer-entered palette, not the template's own fixed color scheme** (the template's own identity is navy/dusty-blue; dress-code swatches are free-form per-wedding content, matching the existing `colorsOfTheDay` / `dressCodeSwatches` schema field already in this repo — see §4).
- Organizer-fillable: dress code text, up to a handful of swatches (existing field supports up to 5 per `dress_code_swatches` schema max).

### 3.8 Programme timeline

**[SCREENSHOT]** (`025543` bottom, `025604` top)

- Another navy card, hydrangea corner bleed (this time upper-right/lower-right).
- "TODAY'S PROGRAM" heading.
- A vertical timeline: left column = time ("19:00"), center = a small filled dot on a continuous vertical line connecting all rows, right column = event label ("Ceremony", "Cocktail", "Supper", "First dance", "Late-night buffet").
- Some rows have a small square monochrome line-icon to the left of the time (a church/building glyph for "Cocktail"'s row in this capture — actually appears next to the row above its label, worth re-checking against the live reference before final build since icon-to-label alignment isn't fully unambiguous in a static capture), a tiered-cake glyph, and a cloche/platter glyph for others. The first row ("Ceremony") and last row ("Late-night buffet") have no icon in this capture.
- Task brief frames programme icons as "optional" — consistent with only some rows having one.
- Organizer-fillable: ordered list of {time, label, optional icon}. Existing `InvitationScheduleItem.icon` enum (`"dining" | "champagne" | "cake" | "dancing" | "gift" | "hand"`) does **not** cover a church/ceremony icon or a cocktail-glass icon seen here — see §4 gap.

### 3.9 Guestbook

**[SCREENSHOT]** (`025604`)

- White/near-white card (not navy — a deliberate contrast against the navy program card above it), "GUESTBOOK" heading.
- Two inputs: "Enter your name*" (single line), "Enter your wishes*" (multi-line textarea), both with a thin navy outline/border style (not filled).
- **[OWNER DECISION]** The pencil/magic-wand button seen in the reference (bottom-left of the form) is left out of this build entirely — not replicated.
- "SEND A WISH" pill button, navy, right-aligned.
- Below the form, a scrollable(?) list of submitted wishes, each in a light blue-gray row: bold name + right-aligned timestamp, then the wish text below. 5 entries visible in this capture, all demo/placeholder content ("The cousins from Dakar", "Lefèvre family", etc.) per **[INVESTIGATION DOC]** which independently confirms these are "clearly demo placeholder content" on the sibling template too.
- **[OWNER DECISION]** Persistence (real guest submissions) is a later task — this entire feature still has no equivalent in this repo's schema (see §4, unchanged: needs its own table, no migrations in this pass). **In preview mode**, render the sample wishes read-only and disable the name/wishes form (fields present but non-interactive, submit button disabled) rather than hiding the section — this lets the sample content be reviewed without implying the form works.
- Organizer-fillable: none directly — this is guest-submitted content; organizer may toggle the section on/off.

### 3.10 Gift box

**[SCREENSHOT]** (`025604` teaser, `030849` opened)

- "GIFT BOX" heading, centered, on the cream/watermark background.
- A 3D-rendered navy gift box illustration with a matching navy ribbon/bow, scattered smaller gift-box icons of varying colors (red, pink, gold, cream) floating around it at different sizes, plus small gold sparkle accents. The faint castle watermark continues behind this section.
- "Tap to open" caption below the box.
- Closing line below that: "Your presence would be the greatest gift!"
- **[OWNER DECISION, supersedes screenshot]** Tapping the box opens the same RSVP modal as "Confirm Presence" (§2.1, §3.5) — accept/decline, name (prefilled or entered), optional message. On accept, a downloadable QR (the guest's RSVP/ticket credential, not bank details) replaces the bank-details screen shown in the raw reference screenshot (`030849`). No bank name, account number, or "not a payment code" disclaimer anywhere in this build.
- Organizer-fillable: whether this section is shown at all (reuses the same RSVP state as Confirm Presence — no separate gift-box-only fields).

### 3.11 Floating music button

- A small circular navy button, bottom-right, fixed position, persists across every section (visible in `025452`, `025525`, `025543`, `025604`, `030849`) — **[SCREENSHOT]** for the icon's presence/position only (a simple white music-note glyph on navy).
- **[INVESTIGATION DOC]**, sibling template: "a floating 'Mettre la musique en pause' button appears [after opening the gate] — background music autoplays once the invitation is opened"; tapping it toggles play/pause.
- **Conflict to flag explicitly:** this repo's own `InvitationPageData.musicAudioUrl` doc-comment states audio "Never autoplays." The reference's autoplay is gated behind the user's own "Open" tap on the cover gate (a real user gesture), which is browser-autoplay-policy-compliant and distinct from autoplay-on-page-load — but it is still a deliberate override of this repo's documented default. **This needs explicit confirmation before wiring real audio**, not a silent override. Until decided, spec the control as present but inert (no `<audio>` element, no autoplay) — consistent with "do not build visual/interactive sections yet."

---

## 4. Field mapping — what exists vs. what's missing

See the companion Step 2 report in the chat response for the full architecture read; summarized here for the checklist:

**Already covered by existing `InvitationPageData` / `template_data` fields** (reuse, no gap): couple names, event date/timezone, venue+address+city+lat/lng or `venues[]` (ceremony+reception), `gallery[]`, `schedule[]` (time/label/icon — icon enum gap noted below), `dressCode`/`dressCodeNotes`, `colorsOfTheDay`/`dressCodeSwatches` (swatch fields), `musicAudioUrl`/`musicTitle`, `guest.name`/`guest.rsvpStatus` (personalization), envelope-style photo slots (`envelopePhoto`, `envelopePhotoTwo`, `polaroidPhotoOne/Two` already modeled for the existing Evergreen Envelope template and directly reusable here), `monogramInitials` (unused by this design but harmless).

**Gaps requiring new `template_data` fields (schema code change only, no DB migration — `template_data` is JSONB, currently typed `.strict()` to the Evergreen shape and would need generalizing or a new sibling schema):**
- Four structured parent names (two sides × 2 names each) — current `parents_line` is one free-text string, not four discrete fields.
- Gate copy fields distinct from existing Evergreen gate fields if reused (`gate_heading` etc. already exist and may be reusable as-is).
- **[OWNER DECISION]** No gift-box bank/account fields — removed from this pass per §2.1/§3.10. Gift box and Confirm Presence share the existing RSVP data already on `InvitationPageData` (`guest.name`, `guest.rsvpStatus`) plus the shared `action_portal` block; no new persisted fields needed for the RSVP flow itself.

**Gap requiring a genuinely new, persisted, multi-row data model (out of scope — needs a future migration):**
- Guestbook wishes (guest-submitted name + message + timestamp, list, append-only, likely needs its own table rather than a JSON blob on the single invitation-page row, given concurrent anonymous writers). **Not building this now per the no-migrations constraint; flagging as a known follow-up.**

**Gap in a closed enum:**
- `InvitationScheduleItem.icon` is `"dining" | "champagne" | "cake" | "dancing" | "gift" | "hand"` — no ceremony/church or cocktail-glass icon. Needs 1–2 new enum values (code change, no migration, but touches a shared type other templates use — must stay additive/backward-compatible).

**Gap in gallery presentation:**
- `boho-coveflow` (`BohoCoverflowGallery` in `InvitationPresentationBlocks.tsx`) already implements a 3D coverflow with arrows + counter — very close to §3.4. Needs verification (not yet done) that it supports up to 10 images and matches the counter/arrow styling closely enough to reuse directly vs. needing a dedicated `minimalism-coverflow` presentation value.

**Open architecture question (flagged to user separately, not re-litigated here):** this template's navy **card-per-section** layout is a deliberate, explicit exception to `AUTHORING.md §1`'s card-free default — the user has confirmed exact replication is wanted, so this will be registered as a new allowlisted **custom full-page composition** (same mechanism as `romantic-envelope`/`botanical-reverie`/`luxe-editorial`), not a configuration variant of the shared card-free block canvas.

---

## 5. Fonts — [OWNER DECISION: chosen, visual match from screenshots, not computed-style-verified against the live site]

- **Display serif** (names, big headings: "VINCENT", "MARIE-ÈVE", "CEREMONY INFORMATION", full names in the ceremony card): **Cormorant Garamond**. Chosen over Playfair Display because the reference's capitals have moderate, classical stroke contrast and traditional old-style proportions, not Playfair's more dramatic hairline/thick contrast or its more geometric caps; Cormorant Garamond is also already referenced by name elsewhere in this registry (`gala-editorial`'s description), so it's a known-good, already-vetted choice for this design system.
- **Body serif** (paragraph copy, labels, parents' names, programme list): **EB Garamond**. Same type tradition/letterforms as Cormorant Garamond (so the pairing reads as one family at two optical sizes) but renders more legibly at small sizes than Cormorant does, which the reference's small label text needs.
- **Script** (ampersand watermark/inline ampersand, calendar month label "April 2027"): **Parisienne**. A flowing, moderately-flourished connected script matching the reference's script weight — less dramatic/swirly than Great Vibes, closer to what's visible in the screenshots.
- Implementation: loaded via `next/font/google` (the house pattern already used in `app/layout.tsx` for Geist) as CSS variables scoped to this template's root, applied with Tailwind v4's `font-(family-name:--var)` syntax — not the `font-serif`/`font-script` Tailwind utility classes, which are either Tailwind's unrelated generic-serif default or (for `font-script`) not a real defined utility anywhere in this codebase's CSS, confirmed by grep before use.

## 6. Illustration specs (for original artwork — do not trace chungdoi's files)

General style across all illustrations: soft painterly/watercolor-ish rendering (not flat vector, not photographic), muted/dusty color saturation, consistent "antique botanical plate" feel.

### 6.1 Hydrangea flower clusters
Composition: 1 large cluster + several smaller sprigs forming an irregular diagonal mass, always anchored to a corner and bleeding off the container edge. Blossom color range: dusty/muted blue `#5B7DA6` → deeper navy-blue `#3A5A82`, with 2–3 cream/white accent blossoms `#F5F0E6` mixed in for contrast. Foliage: muted sage-green `#7C8A6B`, soft/rounded leaf shapes, some fine stem linework in a darker green-brown. No hard outlines — soft-edged painterly blobs. Used at: hero envelope corners (§3.2), all three navy card corners (§3.3, §3.5, §3.8), guestbook card corner (§3.9).

### 6.2 Envelope + wax seal + tucked photos
Envelope: simple navy (`#14305A` approx) triangular-flap envelope shape, flap open/folded back, rendered with a subtle gradient/shading for a slight 3D fold illusion, not flat-color. Two photographs tucked into the opening: plain white-bordered polaroid-style rectangles, each holding a placeholder/sample photo, overlapping each other, each rotated a few degrees in opposite directions. Wax seal: a circular medallion in warm gold (`#C9A24B` → `#8A6A2E` shadow edge), centered at the envelope's V-notch, with a simple heart motif embossed/engraved into its face, plus a small drip/texture detail at its lower edge suggesting melted wax.

### 6.3 Castle watermark
A single-color (navy-on-cream, ~10% opacity) fine-line architectural illustration of a European civic/cathedral-style building: symmetrical facade, one or two spired/domed towers, rows of small arched windows, roofline balustrade. Rendered large enough to bleed off multiple edges of its container, positioned to drift diagonally (upper-right origin) across the hero/ceremony/venue/gift-box sections as a continuous faint background layer — not repeated/tiled, a single large watermark.

### 6.4 Gift box
A 3D-rendered (soft-shaded, not flat) box in navy with a subtle floral pattern printed on its faces (small white/cream blossom motifs scattered on the navy surface), topped with a matching navy ribbon tied in a bow, ribbon wrapping down over two visible faces of the box. Surrounding it: several smaller, simpler gift-box icons in varied accent colors (brick red, blush pink, gold, cream) and sizes, scattered at different depths/overlaps, plus a couple of small 4-point gold sparkle glyphs (same glyph family as the cover-gate sparkles in §3.1).

### 6.5 Programme line icons
Simple, single-weight, white/cream monochrome line-icon set (not filled, not multi-color) sized small enough to sit inline with timeline text: a church/building glyph (ceremony), a champagne/cocktail-glass glyph (cocktail), a tiered-cake glyph (supper/cake), a cloche/serving-platter glyph (late-night buffet). Consistent stroke weight across the set.

### 6.6 Cover-gate heart glyph
Simple solid white heart shape inside a filled navy circle — no gradient/texture, flat and minimal, contrasting with the painterly hydrangeas elsewhere.

### 6.7 Sparkle/asterisk accents
Small 4-point star/asterisk glyphs (✳-shaped, not 5-point stars), muted olive-gold `#8C8260`, used scattered on the cover-gate background (§3.1) and near the gift box (§3.10).

### 6.8 Paper texture
A very subtle off-white fine-grain paper/canvas texture is visible underlying the cream sections (most noticeable around the dress-code/program area in `025543`) — low-contrast, not a strong visible grain, closest to a light linen/cotton paper texture.

### 6.9 Placeholder strategy (this task only)
Until original artwork exists, every illustration above renders as a flat, labeled placeholder shape (e.g. a dashed-border box or simple SVG silhouette with a text label like "[hydrangea cluster placeholder]"), sized and positioned per the composition notes above, using the template's real color tokens (§9) so layout/spacing can be reviewed without needing final art.

## 7. Animations / interactions summary

| Interaction | Source | Notes |
|---|---|---|
| Cover gate → Open | [SCREENSHOT] + [INVESTIGATION DOC] | Reveal mechanism confirmed; exact transition ("fly-away") unconfirmed — see §3.1 |
| Gallery arrows (prev/next) | [INVESTIGATION DOC] | Confirmed functional on sibling template |
| Gallery dot/counter nav | [INVESTIGATION DOC] | Confirmed present; click-to-jump not separately isolated |
| Gallery swipe | [ASSUMED] | Explicitly UNKNOWN/BLOCKED per investigation doc — do not assume |
| Countdown | [SCREENSHOT] (static sample) + [INVESTIGATION DOC] (confirmed ticking) | Must render post-mount only, per this task's own rule 4 (no hydration mismatch) |
| Calendar heart-on-date | [SCREENSHOT] | Static highlight, no evidence of interactivity beyond display |
| Add to calendar | [INVESTIGATION DOC] | Confirmed real, correctly-populated Google Calendar URL on sibling template |
| Confirm presence / RSVP | [OWNER DECISION] | Accept/decline, name+optional message (generic) or prefilled name (personalized), QR on accept — see §2.1 |
| Itinerary link | [INVESTIGATION DOC] | Confirmed real Google Maps directions URL |
| Guestbook submit | [OWNER DECISION] | Preview mode: read-only sample wishes, form disabled. Real submission is a later task. |
| Gift box → RSVP modal | [OWNER DECISION, supersedes screenshot] | Same flow as Confirm Presence, not a bank/QR screen — see §3.10 |
| Music button | [SCREENSHOT] icon + [INVESTIGATION DOC] autoplay-on-open behavior (sibling template) | Autoplay conflicts with this repo's documented default — flagged in §3.11, not resolved here |

## 8. Fields organizer must fill in (checklist cross-reference)

Partner 1 name · Partner 2 name · wedding date · timezone · 4 parent names (2 per side) · ceremony venue/time · reception venue/time · reception arrival/start sub-times · gallery photos (1–10, each with optional caption) · programme items (time + label + optional icon, ordered) · dress code text · dress code swatches (≤5) · hero envelope photos (2) · guestbook on/off toggle · music track (title/URL) · optional guest personalization (accepts `guest.name` when known; generic-link mode collects name at RSVP — existing pattern, not new).

## 9. Colors (visually estimated — re-sample with a color picker before production CSS)

| Token | Hex (est.) | Used for |
|---|---|---|
| Navy ink / card background | `#0E2847`–`#14305A` | Cards, cover-gate background, envelope |
| Cream / ivory background | `#F2EEE3`–`#F3EFE4` | Page background, calendar card, gift-box modal body |
| Cream/white text on navy | `#F5F0E6` | Text inside navy cards |
| Gold wax seal | `#C9A24B` (highlight) / `#8A6A2E` (shadow) | Wax seal, sparkle accents (muted to `#8C8260`) |
| Hydrangea blue (main) | `#5B7DA6` | Flower clusters |
| Hydrangea blue (deep) | `#3A5A82` | Flower clusters, shadow blossoms |
| Hydrangea accent | `#F5F0E6` | Cream/white accent blossoms |
| Foliage green | `#7C8A6B` | Leaves/stems |
| Guestbook card bg | `#FFFFFF`–`#F7F7F5` | Guestbook card |
| Wish entry row bg | `#EEF1F5` | Individual wish rows |

## 10. Checklist (tick against the live screenshots)

- [ ] Cover gate: navy bg, sparkles, cream card, heart badge, names, date, personalization line, "Open" pill button
- [ ] Hero: eyebrow, envelope + 2 tucked photos + wax seal + hydrangea corners, castle watermark, large names, script ampersand watermark
- [ ] Ceremony card: navy card, hydrangea corners, 2-column parents, invitation line, full names + script ampersand, ceremony row (venue/time/weekday/big date), reception row (same)
- [ ] Gallery: 3D coverflow, prev/next arrows, counter, 1–10 photos
- [ ] Reception card: navy card, hydrangea corners, time/date, arrival+start sub-times, countdown, embedded calendar (script month label, narrow weekday headers, heart-on-date), add-to-calendar link, confirm-presence button
- [ ] Venue: heading, bare Google Maps embed, itinerary link
- [ ] Dress code: heading, text, swatches
- [ ] Programme: navy card, hydrangea corner, vertical timeline, optional icons
- [ ] Guestbook: white card, name + wishes inputs (disabled in preview), no pencil/magic button, submit button, wish list (name/timestamp/text rows, read-only sample in preview)
- [ ] Gift box: teaser illustration + "tap to open" + closing line, opens the same accept/decline RSVP modal as Confirm Presence (no bank label, no account ref)
- [ ] Floating music button present and persistent across all sections
- [ ] All illustrations are original placeholder/final art, never traced from chungdoi.com
- [ ] Fonts verified against live site, not just visually estimated
- [ ] Colors re-sampled with a color picker, not just visually estimated
