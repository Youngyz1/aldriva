# Event Invitation Template System — Read-Only Audit

> **Scope:** how existing full-page animated invitation templates are built, so a **new, more elaborate wedding template** can follow the same architecture instead of inventing a parallel one.
> **Method:** read-only inspection of the working tree on `2026-10-20`. No files modified except this one. Every claim carries a file path and line reference; anything unestablished is stated plainly.
> **Caveat:** the working tree contains uncommitted work from other agents (kitchen/delivery). Invitation files read here are **tracked and committed** unless noted. Where a fact could not be established, it says **NOT FOUND** or **UNDETERMINED**.

---

## 1. Template architecture

### 1.1 Where templates live

There are **three separate registries** for invitations, plus a shared renderer. This separation is deliberate and documented in `components/invitation/templates/AUTHORING.md:8-16`.

| Registry | File | Owns | Nature |
|---|---|---|---|
| **Code-owned page definitions** | `lib/invitation-template-registry.ts` | Stable page IDs, metadata, theme presets, default/supported block order, page-renderer choice, supported effects/customizations, `$bind` binding paths | **Source of truth** (data-only module) |
| **Picker catalog** | `components/invitation/templates/registry.ts` | Picker labels, categories, descriptions | Derived from the page registry (`registry.ts:15-19`) |
| **Custom full-page components** | `components/invitation/templates/InvitationPageComponentRegistry.tsx` | Allowlisted lazy imports of bespoke page compositions | Explicit allowlist (`:23-30`) |
| **Block → component map** | `components/invitation/blocks/InvitationBlockRegistry.tsx` | Maps approved block *types* to shared presentation components | Code-owned, never JSON-selected (`:1-26`) |

Supporting pieces:
- Authorship guide: `components/invitation/templates/AUTHORING.md` (134 lines).
- Engine design + history: `docs/technical/invitation-template-engine.md` (167 lines).
- Unified card/page **pairing** catalog (a *different* catalog from `registry.ts`): `lib/unified-invitation-templates.ts` (per `docs/technical/invitation-template-engine.md:9`).
- Shared page layout compiler: `lib/invitation-page-layout.ts` (390 lines).
- Invitation-only validation layer: `lib/invitation-template-schema.ts` (172 lines).
- Typed data contract: `types/invitation-template.ts` (250 lines).

### 1.2 How a template is registered, named, categorized, selected

**Registered:** as an entry in `INVITATION_TEMPLATE_REGISTRY` (`lib/invitation-template-registry.ts`). The definition shape (`:88-135`) includes `id`, `version`, `name`, `category`, `description`, `defaultThemePreset`, `detailsPresentation`, `galleryPresentation`, `composition`, `pageRenderer`, `defaultBlockTypes`, `supportedBlockTypes`, `requiredBlockTypes`, `supportedCustomizations`, `supportedEffects`, `defaultEffects`.

**Named/categorized:** `category` is one of `gala_corporate | wedding | birthday | universal` (`lib/invitation-template-registry.ts:26`). Category labels/descriptions live in `components/invitation/templates/registry.ts:30-…` (`INVITATION_CATEGORIES`).

**Existing page templates (8, VERIFIED from the registry):**
`gala-editorial`, `black-tie`, `wedding-romantic`, `romantic-envelope`, `botanical-reverie`, `birthday-bold`, `cover`, `luxe-editorial` (`lib/invitation-template-registry.ts:143,152,161,170,192,212,221,229`).

**Selected:** the organizer picks from the UI (`components/invitation/InvitationTemplateSelect.tsx`, which renders grouped options from the picker catalog at `:83`), and the chosen `templateId` is persisted with the draft. `templateId` is passed explicitly by every render path — public, shared, preview, builder-preview, sandbox, picker (`docs/technical/invitation-template-engine.md:146`).

### 1.3 How the public invitation page picks and renders a template

Route: `app/invitation/[token]/page.tsx` (299 lines).

Flow (VERIFIED):
1. `generateMetadata` builds OG/Twitter tags including the card PNG (`app/invitation/[token]/page.tsx:17-…`, `:58`, `:64`).
2. The page validates the token and loads the invitation via `getInvitationByToken` (`app/invitation/[token]/page.tsx:6`).
3. It loads the **published** page snapshot with `getPublishedInvitationPage` (`:9`) and assembles typed data with `assembleInvitationPageData` (`:10`).
4. Legacy flat snapshots are normalized into the block layout via `legacyInvitationSnapshotToLayout` (`:13`, and `lib/invitation-page-layout.ts`).
5. Rendering goes through **`UniversalPageRenderer`** with `kind:"invitation"` (`components/site/UniversalPageRenderer.tsx:50-53`), which dispatches to `InvitationBlocksLayoutClient`.
6. `InvitationBlocksLayoutClient` (`components/invitation/blocks/InvitationBlocksLayoutClient.tsx:14-107`) compiles the layout theme, filters effects to those the template supports (`:36-40`), detects the envelope gate (`:41-47`), renders each block through `renderInvitationBlock` (`:53`), and — if the template's `pageRenderer.kind === "custom"` — wraps the standard canvas in the allowlisted custom page component (`:95-104`).

**Nine block types** are renderable (`lib/invitation-template-registry.ts:11-23`): `interactive_envelope`, `hero`, `romantic_hero`, `story`, `details`, `countdown`, `location_map`, `schedule`, `gallery`, `music`, `action_portal`.

**Key architectural rule:** templates **never own business data**. They control layout, typography and color only (`DESIGN.md:206-211`). RSVP and data loading stay in the route/action layer; a custom template "receives already-authorized page data and the shared block output; it never loads invitation records or owns RSVP behavior" (`components/invitation/templates/romantic-envelope/RomanticEnvelopePageTemplate.tsx:9-13`).

---

## 2. Data model

### 2.1 Three distinct invitation concepts (do not conflate)

VERIFIED. These are separate tables/stores:

**(A) `event_invitations` — per-guest personal invitations + tokens.**
Created in `db/migration_92_event_invitations_and_ticket_instances.sql` (lines 8-24). Structured columns include: `id`, `event_id`, `guest_name`, `guest_title`, `organization`, `email`, `phone`, `token` (UNIQUE, NOT NULL), `invitation_status` (draft/sent/cancelled/revoked/expired), `rsvp_status` (default `'pending'`), `rsvp_at`, `notes`. Token SELECT is revoked from anon/authenticated (line 32). Extended by `db/migration_99_*` (per sub-investigation).

**(B) `event_invitation_pages` — the microsite draft + published snapshot.**
- `blocks_layout` JSONB is the **draft** column, added by migration 178 (`docs/technical/invitation-template-engine.md:6,15`).
- `published_snapshot.blocks_layout` JSONB is the **frozen published** layout (`:6`).
- Flat legacy fields remain as a compatibility source (`:6`).
> **Note:** the exact full column list of `event_invitation_pages` was not enumerated line-by-line in this audit. The two JSONB columns above are VERIFIED; other columns are **UNDETERMINED** here (see §8).

**(C) Invitation card catalog (seeded table).**
Design variants seeded by migrations **179/180/181** (`docs/technical/invitation-template-engine.md:54,70`); `layout_config` holds `slots`, `colorPalette`, `typography` (`app/api/invitation/[token]/card.png/route.tsx:82`, `:85-87`). This catalog is **separate from** the code registry — the docs call out that the pair registry and page-template catalog "can drift from the renderer's supported template IDs" (`docs/technical/invitation-template-engine.md:20`).

### 2.2 Structured columns vs JSON blob

- **Structured columns:** the per-guest fields on `event_invitations` (§2.1A) — name/title/organization/email/phone/token/status/rsvp.
- **JSON blob:** the **page layout** — draft (`blocks_layout`) and published (`published_snapshot.blocks_layout`), both version-1 `{ theme, effects, layout_blocks: [{ id, type, content }] }` (`docs/technical/invitation-template-engine.md:7`; schema in `lib/page-composition.ts` as `PageBlocksLayoutSchema`).
- **Event content** (title, dates, venues, dress code, registry note, accommodations, schedule, gallery, etc.) is carried as **flat typed fields** on `InvitationPageData` (`types/invitation-template.ts`), with each field tiered as REQUIRED / DEFAULT-WITH-OVERRIDE / HIDE-IF-EMPTY (`types/invitation-template.ts:7-10`).

### 2.3 Guest-specific data today

- **Personalized links exist.** Per-guest `token` (64-char) on `event_invitations`; the public route is `/invitation/[token]`.
- **Personalized display does NOT appear to be a "Reserved for [name], N guests" line.** What exists:
  - The guest's name is used on the **standalone invitation card** (`components/invitation/InvitationCardRenderer.tsx:11,106,108`) and in the RSVP portal prefill (`components/invitation/blocks/ActionPortalBlock.tsx:19,29,36`; wired at `InvitationBlockRegistry.tsx:101` via `data.guest.name`).
  - A **seat label** is shown as "Reserved: {seat.label}" via the `reservedSeat` i18n key (`components/invitation/blocks/ActionPortalBlock.tsx:126`; `lib/invitation-i18n.ts:160,282,421`). This is a *seat*, not a party-size line.
- **"Reserved for [name]" / "N guests" / plus-one count: NOT FOUND.** Searches for `reserved for` and `guest_count` across invitation code returned **0 matches**. So a personalized "Reserved for … , N guests" treatment would be **new work**.
- **General (non-personalized) share links exist separately:** `app/invitation/shared/[token]/page.tsx` (shared mode shows a neutral note and no RSVP submit; `docs/technical/invitation-template-engine.md:8`).

---

## 3. Builder (`?edit=1`)

### 3.1 Where the builder is

- Route: `app/dashboard/events/[id]/invitation-page/page.tsx` (handles the edit context) and client `InvitationPageDashboardClient.tsx`.
- The builder UI: `app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx` (867 lines) — "collapsible sections on the left, sticky …" (`:6`).
- Sections are individual components under `.../builder/sections/`: `BasicsSection`, `HeroSection`, `StorySection`, `DetailsSection`, `GallerySection`, `MusicSection`, `ExtrasSection`, `DesignSection`, `PublishSection` (imports `:43-51`).

### 3.2 How form fields map to template props

- The builder holds a **`draft`** state (`InvitationPageBuilder.tsx:281`) initialized via `draftFromData(initialData)` and passed to section components. Field edits call `updateDraft(...)` (e.g. `HeroSection.tsx:45`).
- The draft fields correspond to the flat typed fields on `InvitationPageData` (`types/invitation-template.ts`) and to declared **`$bind` binding paths** in `lib/invitation-template-registry.ts` (`INVITATION_BINDING_PATHS`). `$bind` values "resolve only through a finite reader map; no arbitrary path evaluation occurs" (`docs/technical/invitation-template-engine.md:7`; resolver `lib/invitation-page-layout.ts`).
- **Validation:** invitation-only schema `lib/invitation-template-schema.ts` layers on the shared envelope and permits **only registered block types**, rejects duplicate IDs, unknown binding paths, unsafe keys, oversized/deep content, and non-RSVP actions (`docs/technical/invitation-template-engine.md:96`).
  - *Known limit:* historical note says draft validation does **not reject unknown invitation block types**; the renderer returns `null` for unknowns, "which can conceal invalid saved configuration" (`docs/technical/invitation-template-engine.md:11`). (The later slice added an allowlist per `:96`, so the current behavior may differ — see §8.)

### 3.3 How the live preview panel gets its data

**Same-origin `postMessage`.** Protocol in `lib/invitation-preview-channel.ts` (208 lines):
- Parent → iframe: `{ source, kind: "draft", templateId, locale, draft, event, candidatePreview?, savedTemplateId? }` (`:18-29`).
- Iframe → parent: `kind: "ready"`, `kind: "scroll-to"`, `kind: "block-select"` (`:31-47`).
- Both sides validate `event.origin` and message shape; malformed messages are ignored (`:1-12`, `isPreviewMessage` `:60-88`).
- The builder posts via `postToPreview(...)` → `iframeRef.current.contentWindow.postMessage(msg, window.location.origin)` (`InvitationPageBuilder.tsx:389-390`).
- **Switching templates re-renders inside the iframe with no reload and no scroll reset** — `template_id` travels inside the draft payload (`lib/invitation-preview-channel.ts:10-12`).
- Preview uses **sample** guest/ticket data only (`SAMPLE_PREVIEW_GUEST` `:118-127`, `SAMPLE_PREVIEW_TICKET` `:135-139`) — real guest data never enters the preview iframe.
- Preview route: `app/invitation/builder-preview/[eventId]/page.tsx` + `LivePreviewFrame.tsx`. There is also a render-only sandbox at `/invitation/preview` (`docs/technical/invitation-template-engine.md:166`).

### 3.4 How a template declares supported fields/sections; fixed vs configurable

- A template declares `supportedBlockTypes` (what it *may* show) and `defaultBlockTypes` (what it shows *initially*), plus `requiredBlockTypes` and `supportedCustomizations`/`supportedEffects` (`lib/invitation-template-registry.ts:104-111`).
- The **editor's section list is fixed** (`SECTION_IDS` in `InvitationPageBuilder.tsx:119-133`: `type, template, design, basics, hero, story, details, gallery, music, extras, publish`) with titles from `SECTION_TITLES` (`:135`). These are **not** per-template reorderable.
- **Reordering applies to items *inside* sections, not to top-level sections:** the gallery and story managers support up/down reorder (`sections/GallerySection.tsx:5`; `sections/StorySection.tsx:4,96,120,129`). There is **no evidence of drag-reorder or per-template section toggling of the whole page** (NOT FOUND — no `sortable`/drag handlers on the section list; only `toggleSection` to collapse/expand, `InvitationPageBuilder.tsx:516,718`).
- **Design controls are template-gated:** `DesignSection` uses the template definition's supported-customization flags to decide which controls to show (`docs/technical/invitation-template-engine.md:97`). Customizations are `palette | fontPack | textScale` (`lib/invitation-template-registry.ts:27`).

---

## 4. Rendering and motion

### 4.1 Section composition: shared blocks vs one monolith

**Both patterns exist, by design:**
- **Shared blocks (default):** each section is a component in `components/invitation/blocks/InvitationPresentationBlocks.tsx` (1012 lines) — `HeroBlock`, `RomanticHeroBlock`, `StoryBlock`, `DetailsBlock`, `CountdownBlock`, `LocationMapBlock`, `ScheduleBlock`, `GalleryBlock`, `MusicBlock`; plus `ActionPortalBlock.tsx` (203 lines) and `InvitationImageAccordion.tsx`. The map is in `InvitationBlockRegistry.tsx:53-…`.
- **Bespoke full-page composition (allowlisted):** `romantic-envelope` and `botanical-reverie` (and `luxe-editorial` uses a custom pageRenderer per the registry `:233`) render through `InvitationPageComponentRegistry.tsx` (`:23-30`), wrapping the same shared block children (`InvitationBlocksLayoutClient.tsx:95-104`).
- So a **new elaborate wedding template can be either**: configuration-driven blocks (no new React chunk) or an allowlisted custom page composition. The docs recommend starting configuration-driven and escalating to a custom composition only for a genuinely distinct journey (`docs/technical/invitation-template-engine.md:31,78-90,109-121`).

### 4.2 Animation approach

- **Libraries installed:** `framer-motion ^12.40.0` (`package.json:57`). **GSAP/Lottie: NOT present** (`package.json` grep returns only framer-motion).
- **But invitation blocks/formats do NOT use Framer Motion today.** They use **CSS transitions** and an **`IntersectionObserver`** reveal. `docs/technical/invitation-template-engine.md:10` states: "these invitation blocks currently use CSS transitions rather than Motion components"; `:159` adds "Motion is intentionally CSS/Observer based; adding Framer Motion or GSAP would add weight without improving these three effects."
- **Scroll handling:** `components/invitation/animation/InvitationScrollReveal.tsx` (68 lines) — an IntersectionObserver with `threshold: 0.08`, `rootMargin: "0px 0px -4% 0px"` (`:44`), a **2.4 s fail-safe** timeout so content never stays faded (`:49`), and content **visible by default** (`:5-8`).
- **Entrance/reveal pattern:** block wrapper applies reveal per block when the `scroll-reveal` effect is enabled (`InvitationBlocksLayoutClient.tsx:78`).
- **Envelope/opening/intro pattern EXISTS.** Two implementations:
  1. `components/invitation/templates/romantic-envelope/RomanticEnvelopePageTemplate.tsx` (103 lines) — full-screen `#E6DEC9` gate with an SVG envelope + **wax-seal button** (`:78-95`), "CLICK THE SEAL TO OPEN THE ENVELOPE" (`:97`), opens on click and fades/scales out (`:72-73`).
  2. `botanical-reverie` custom page (registered `lib/invitation-template-registry.ts:192-204`; implemented in `components/invitation/templates/botanical-reverie/BotanicalReveriePageTemplate.tsx`).
- **Effect contract (bounded, typed):** `docs/technical/invitation-template-engine.md:150-159` —
  `envelope-reveal` (0–3000 ms), `scroll-reveal` (0–1600 ms), `falling-petals` (density 1–12). Missing effects fall back to registry defaults; the builder derives controls only from `supportedEffects`.

### 4.3 `prefers-reduced-motion` and mobile performance

- **Reduced motion is handled in the invitation reveal and the envelope:**
  - `InvitationScrollReveal.tsx:30-34` bails to visible/no-transition when `(prefers-reduced-motion: reduce)` matches; the class list also carries `motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none` (`:60`).
  - The envelope gate uses `motion-reduce:transition-none` (`RomanticEnvelopePageTemplate.tsx:72`).
  - `InvitationImageAccordion.tsx:17` documents that expansion and image zoom "stop animating" under reduced motion.
  - `docs/technical/invitation-template-engine.md:44` states Botanical Reverie reduced-motion users get content with bloom/reveal/petal motion removed.
- **Known gap (repo-wide, not invitation-specific):** DESIGN.md lists "Reduced-motion not applied everywhere (sliders, video heroes)" as a cleanup-backlog item (`DESIGN.md:255`) and notes auto-sliders/`video_bg` as known gaps (`DESIGN.md:202`).
- **Mobile performance measures in place:** petals capped at ≤12 pointer-transparent SVG nodes (`docs/technical/invitation-template-engine.md:159`); reveal animations limited to `transform`/`opacity` (`DESIGN.md:203`); the custom envelope chunk is lazy-split so it is not in the standard page bundle (`docs/technical/invitation-template-engine.md:145`); public bundle avoids eager imports of the legacy full-page TSX files (`:145`).

---

## 5. Existing capabilities vs. requested list

Legend: **Exists** = implemented for the live invitation page (or card). **Partial** = implemented only in a legacy/unused component, or only as a variant. **Missing** = not found.

| # | Capability | Status | Evidence |
|---|---|---|---|
| 1 | Envelope-open intro with **wax seal** | **Exists** (for `romantic-envelope` and `botanical-reverie`) | `components/invitation/templates/romantic-envelope/RomanticEnvelopePageTemplate.tsx:78-97` (SVG wax seal button + envelope + "open the seal"); effect `envelope-reveal` in `lib/invitation-template-registry.ts:184,204` |
| 2 | Full-bleed cover photo | **Exists** | `HeroBlock` w/ `image` (block registry `InvitationBlockRegistry.tsx:54-58`); hero image presentation helpers `lib/invitation-image-presentation.ts`; focal picker `components/invitation/InvitationFocalPicker.tsx:18` (arch/banner/polaroid) |
| 3 | Invitation card with **parents line** | **Partial / UNDETERMINED** | Card renderer supports host/guest name slots (`components/invitation/InvitationCardRenderer.tsx:106-108`). A dedicated "parents line" field was **NOT FOUND** as a named field in `types/invitation-template.ts` (grep showed no `parents`) |
| 4 | Date and city | **Exists** | `data.eventDate`, `data.city`, `data.venue`, `data.address`, `data.timezone` used in `HeroBlock`/`DetailsBlock` (`InvitationBlockRegistry.tsx:58`; `types/invitation-template.ts`) |
| 5 | Live countdown | **Exists** | `CountdownBlock` (`InvitationBlockRegistry.tsx:74-76`); disable-able via `STANDARD_BLOCKS_WITHOUT_COUNTDOWN` for `cover` (`lib/invitation-template-registry.ts:224`) |
| 6 | Polaroid / photo scatter | **Partial** | Polaroid **frame shape** exists (`components/invitation/InvitationFocalPicker.tsx:18,25,36,42`) and the **legacy** `InvitationTemplateBirthday.tsx:17,542` has a tilted polaroid gallery — but that legacy file "is not imported by the active invitation route" (`docs/technical/invitation-template-engine.md:9`). No polaroid scatter in the **active** shared blocks (NOT FOUND in `InvitationPresentationBlocks.tsx`) |
| 7 | Venue cards (ceremony + reception) with **map buttons** | **Exists** | `DetailsBlock`/`LocationMapBlock`; venue data + `map` usage across blocks (grep `map`: 135 hits incl. `InvitationPresentationBlocks.tsx`); `InvitationVenueItem` in `types/invitation-template.ts` |
| 8 | Day schedule timeline **with icons** | **Exists (icons: Partial)** | `ScheduleBlock` renders `timeline` (`InvitationBlockRegistry.tsx:82-84`; `InvitationScheduleItem` in `types/invitation-template.ts:14-24`). Per-item `badge`/`description` exist (`:21-23`). Dedicated per-item **icon** field: **NOT FOUND** |
| 9 | Dress code with **color swatches** | **Partial** | `dressCode` + `dressCodeNotes` render as details rows (`InvitationPresentationBlocks.tsx:819-820`; sample data `invitation-sample-data.ts:113,229,374`). **Color swatches for dress code: NOT FOUND** — the only "swatch" code is the template-picker palette swatch (`components/invitation/InvitationTemplateSelect.tsx:36-62`), unrelated to dress code |
| 10 | Info cards: gift registry note, adults-only note | **Partial** | `registryNote` renders as a details row (`InvitationPresentationBlocks.tsx:822`; sample `invitation-sample-data.ts:233-234`). **Adults-only note: NOT FOUND** (grep `adults`: 0 matches) |
| 11 | Love-story section with **lace / photo frame** | **Exists (frame: Partial)** | `StoryBlock` (block registry `:66-…`); "lace" appears in theme/section copy across `InvitationPresentationBlocks.tsx` (grep `lace`: 54 hits). A dedicated lace **frame** decoration is style-level, not a distinct configurable field — **treat as Partial** |
| 12 | Accommodations link | **Exists** | `InvitationAccommodationItem` (`types/invitation-template.ts:61`), optional list (`:194-195`), rendered `InvitationPresentationBlocks.tsx:809`; grep `accommodation`: 39 hits |
| 13 | Shared photo album link | **Exists** | Album gallery section (legacy `InvitationTemplateWedding.tsx:644-646`); active gallery via `GalleryBlock` + `InvitationGalleryManager`. A distinct **external "shared album link"** field is **NOT FOUND** — this is a gallery, not an external album link |
| 14 | RSVP modal (names, attending yes/no, guest count, wishes) **with submit** | **Partial** | RSVP submit **exists** via `ActionPortalBlock` → server action, live-only (`components/invitation/blocks/ActionPortalBlock.tsx`; wired `InvitationBlockRegistry.tsx:101`; `docs/technical/invitation-template-engine.md:8`). Stored response is **accepted/declined only** (`lib/invitations.ts:209-211`). Prefilled **guest name** exists (`ActionPortalBlock.tsx:19,36`). **Guest-count field and free-text "wishes" field: NOT FOUND** in the request shape |
| 15 | Monogram badge | **Partial** | Referenced as a designed fallback in the **legacy** wedding template (`InvitationTemplateWedding.tsx:350`: "Monogram Arch & Botanical Ornament"). No monogram field in the active registry/types (grep `monogram`: 1 hit) |
| 16 | Background music pill | **Exists** | `FloatingMusicControl` (`components/invitation/FloatingMusicControl.tsx`; imported `InvitationPresentationBlocks.tsx:20`); `MusicBlock` (`InvitationBlockRegistry.tsx:78-80`); audio upload API §6 |

**Summary:** of the 16 items — **9 Exists**, **6 Partial**, and several sub-features explicitly **Missing** (dress-code swatches, adults-only note, guest-count/wishes in RSVP, monogram field, external shared-album link field, personalized "Reserved for … N guests" line, parents line field).

---

## 6. Assets and infrastructure

### 6.1 Images / fonts / audio

**Images (invitation photos):**
- Uploaded by the organizer via `components/invitation/InvitationImageUploadField.tsx`; gallery manager `InvitationGalleryManager.tsx` ("up to 12 featured photos", `:64`).
- Downscaling helpers: `lib/invitation-images.ts` — `INVITATION_MAX_LONG_EDGE_PX = 1600` (`:43`), output mime JPEG or WebP (`invitationOutputMime(...)`, `:49`).
> **UNDETERMINED:** the exact **storage bucket** for invitation *images* (R2 vs Supabase Storage) — see §8. The audio path is confirmed below.

**Audio (background music):**
- **Server-side upload route:** `app/api/invitation-media/upload/route.ts` (79 lines). VERIFIED behavior:
  - Auth required (`getCurrentUser`, `:29-32`); event/organizer access required (`:42-47`).
  - `eventId` read from the query string (not the body) to avoid client-controlled paths (`:34-39`).
  - **5 MB hard limit** enforced server-side before magic-byte check (`:25,57-62`).
  - **Magic-byte validation** (`validateAudioBytes`, `:64-69`); only MP3 (`audio/mpeg`) and M4A (`audio/mp4`) accepted (`:13`).
  - Written to the **private `invitation-media` Supabase bucket** at `{eventId}/{uuid}.ext` (`:6,71-74`) via `uploadInvitationAudio` in `lib/uploadAudio`.
  - `maxDuration = 60` (`:23`).

**Fonts:** **code-defined, not uploaded.** `lib/invitation-fonts.ts` reads font binaries from `assets/fonts/` on the server (`:27`) with a magic-byte check and Plus Jakarta Sans fallback (`:13-50`). Supported families: **Plus Jakarta Sans** (always), **Cinzel**, **Playfair Display**, **Montserrat** (`:52-97`). These match the card PNG route's font choices (`app/api/invitation/[token]/card.png/route.tsx:85-87,276,299,322,346`). No font-upload path was found (NOT FOUND).

### 6.2 RSVP storage, API route, validation, rate limiting, notification email

- **API route:** `app/api/invitation/[token]/rsvp/route.ts` (46 lines).
  - Token must be a **64-char string** (`:11-13`).
  - **Rate limiting:** per-IP + per-token buckets via `isRateLimited(req, "invitationRsvp", \`token:${token}\`)`, **fail-open** (`:15-19`).
  - Body must be JSON; `response` must be `"accepted"` or `"declined"` (`:21-35`).
  - Persists via `rsvpInvitation({ token, response })` (`:38`); error mapping 404 vs 409 (`:43-44`).
  - Action: `lib/invitations.ts:200-…` — re-validates token shape and response (`:205-211`), fetches by token via the **admin (service-role) client** (`:213-224`), rejects cancelled/revoked/expired (`:226-228`), then checks the linked ticket instance for check-in state (`:230-…`).
- **Stored fields:** `rsvp_status` + `rsvp_at` on `event_invitations` (§2.1A). **No guest-count or wishes columns found.**
- **Notification email to organizer on RSVP: NOT FOUND.** Resend is used to send **invitations to guests** (`lib/invitations.ts:418,500-524,611`), but no RSVP-triggered organizer email was found in the RSVP path.

### 6.3 OG / share preview

- **Metadata:** `app/invitation/[token]/page.tsx:17-…` sets `openGraph` (`:58`) and `twitter` (`:64`).
- **Card PNG (1200×630):** `app/api/invitation/[token]/card.png/route.tsx` (366 lines) using `next/og` `ImageResponse` (`:2`), `size = {width:1200,height:630}` (`:19`), `contentType = "image/png"` (`:20`). It reads `layout_config` (`:82`) and uses **published-snapshot hero art only, no guest-identifying text**, with token validation retained (`docs/technical/invitation-template-engine.md:50-53,73-74`).
- URL builder: `lib/invitation-card-url.ts` (15 lines).

---

## 7. Design specs

- **`DESIGN.md` exists** at repo root (source of truth for platform UI). **`docs/motion.md` does NOT exist**; DESIGN.md §8 is explicitly "interim, until `motion.md` exists" (`DESIGN.md:198`). `docs/DESIGN-SYSTEM.md` and `docs/phases/phase-03-design-system.md` also exist; DESIGN.md §11 notes other older docs may hold stale `.aldriva/design/` links (`DESIGN.md:256`).
- **Invitation-specific spec:** `docs/technical/invitation-template-engine.md` (engine + authoring workflow) and `components/invitation/templates/AUTHORING.md` (how to build/restyle a page). **`design/templates/<family>.md` for invitation families: does NOT exist** — the only files under `design/` are `design/business-sites/BASELINE.md` and two business template specs. DESIGN.md §9 says per-family specs for *new* templates should go in `design/templates/<family>.md` (`DESIGN.md:225`).

**What applies to invitations:**
- **Templates own layout/typography/colors only, never business data** (`DESIGN.md:206-211`).
- **Motion:** library = **Framer Motion** installed, "Do not add GSAP or Lottie without approval" (`DESIGN.md:200`); durations fast 150 / base 200 / slow 300 ms default (`:201`); **every animation must respect `prefers-reduced-motion`** (`:202`); animate `transform`/`opacity` only (`:203`).
- **Palette/font boundary:** "Invitation palettes and fonts stay in the invitation specs. This file only defines the boundary. Do not duplicate them here." (`DESIGN.md:222`).
- **Allowed invitation fonts (code-defined):** Cinzel, Playfair Display, Montserrat, Plus Jakarta Sans (`lib/invitation-fonts.ts:52-97`) — plus any web font referenced by a template's theme preset in `lib/page-composition.ts`. **UNDETERMINED:** the full list of font-pack options is defined in the shared color/font registries (`lib/invitation-page-layout.ts` presets, e.g. `PALETTE_ROSE` `:30-…`; `lib/invitation-colors.ts`) — not exhaustively enumerated here.
- **Allowed invitation colors:** theme presets/palettes live in `lib/page-composition.ts` and `lib/invitation-page-layout.ts` (`ThemeUtilityPreset`, `:21-…`); normalization via `lib/invitation-colors.ts`. DESIGN.md states the palette list is authoritative **in the invitation specs**, not DESIGN.md (`DESIGN.md:222`).
- **Platform-level rules that still apply to builder screens:** `rounded-xl`, `shadow-xs`, no gradients on interactive elements, zinc+orange tokens (`DESIGN.md:162-185,258-266`).

---

## 8. Data-flow summary: builder form → stored data → public render

```
Organizer (builder, ?edit=1)
  app/dashboard/events/[id]/invitation-page/builder/InvitationPageBuilder.tsx
    ├─ draft state (:281)  ← sections/*Section.tsx field inputs → updateDraft()
    ├─ template picked via InvitationTemplateSelect.tsx → draft.templateId
    └─ live preview: postMessage({kind:"draft", templateId, locale, draft, event})
           └─ iframe: app/invitation/builder-preview/[eventId] (+ LivePreviewFrame)
                └─ UniversalPageRenderer kind="invitation"
                     └─ InvitationBlocksLayoutClient → InvitationBlockRegistry → shared blocks
─────────────────────────────────────────────────────────────────────────────
Save / Publish (server action)
  draft  →  event_invitation_pages.blocks_layout (JSONB, draft)         [migration 178]
  publish→  published_snapshot.blocks_layout (JSONB, frozen)           [docs engine :6]
  validation: lib/invitation-template-schema.ts (registered block types, $bind allowlist)
─────────────────────────────────────────────────────────────────────────────
Guest opens /invitation/[token]
  app/invitation/[token]/page.tsx
    ├─ generateMetadata → OG/Twitter + /api/invitation/[token]/card.png (1200×630)
    ├─ getInvitationByToken(token)            → event_invitations (guest row)
    ├─ getPublishedInvitationPage(event)      → published_snapshot.blocks_layout
    └─ assembleInvitationPageData(...)        → InvitationPageData (flat, typed)
         └─ UniversalPageRenderer kind="invitation"
              └─ InvitationBlocksLayoutClient (compile theme, filter effects to supportedEffects)
                   ├─ standard blocks → InvitationPresentationBlocks.tsx
                   └─ if pageRenderer.kind==="custom" → InvitationPageComponentRegistry (lazy TSX)
Guest RSVP → ActionPortalBlock (live mode only) → POST /api/invitation/[token]/rsvp
              → rsvpInvitation() → event_invitations.rsvp_status / rsvp_at
```

---

## 9. Minimal set of files to add or touch to ship ONE new wedding template

Two viable routes. **Recommended route (configuration-driven) is smaller and matches the "floral wedding" workflow** in `docs/technical/invitation-template-engine.md:109-114` and `AUTHORING.md`.

### Route A — Configuration-driven wedding template (no new React page)

| Action | File | What |
|---|---|---|
| **Edit** | `lib/invitation-template-registry.ts` | Add one `INVITATION_TEMPLATE_REGISTRY` entry: new stable `id`, `category:"wedding"`, `defaultThemePreset`, `detailsPresentation`, `galleryPresentation`, `composition:"standard"`, `pageRenderer:{kind:"blocks"}`, `defaultBlockTypes` (reuse shared blocks incl. `countdown`, `schedule`, `details`, `gallery`, `location_map`, `story`, `music`, `action_portal`), `supportedBlockTypes`, `supportedEffects`, `supportedCustomizations` |
| **Edit (maybe)** | `lib/page-composition.ts` / `lib/invitation-page-layout.ts` | Add a theme preset and/or palette+font-pack classes **if** the design needs a new one (otherwise reuse an existing preset) |
| **Edit (conditional)** | `components/invitation/templates/registry.ts` | Only if the picker copy/category grouping needs a new label (it derives from the page registry, `:15-19` — often no change needed) |
| **Edit (conditional)** | `lib/unified-invitation-templates.ts` | Only if the template must appear as a **unified card/page pair** in the picker (`docs/technical/invitation-template-engine.md:113`) |
| **Edit** | `components/invitation/templates/invitation-sample-data.ts` | EN/FR sample fixture so preview/sandbox renders it |
| **Edit** | `messages/en.json`, `messages/fr.json` | Picker copy (name/description) |
| **Add** | a new `*.test.cjs` **and append it to the explicit test list in `package.json`** | Registry/schema/adapter test: default layout, saved-layout compatibility, unknown IDs, reduced-motion (pattern per `docs/technical/invitation-template-engine.md:114`) |

### Route B — Genuinely custom full-page composition (adds a React chunk)

All of Route A **plus**:
| Action | File | What |
|---|---|---|
| **Add** | `components/invitation/templates/<new-id>/<Name>PageTemplate.tsx` | Presentation-only component taking `{ layout, data, children, mode, isEditMode, wrapperClassName }` (contract in `InvitationPageComponentRegistry.tsx:8-15`) |
| **Edit** | `components/invitation/templates/InvitationPageComponentRegistry.tsx` | Add a **literal** `lazy(() => import(...))` path (`:23-30`) — never a DB-driven import |
| **Edit** | `lib/invitation-template-registry.ts` | Set `pageRenderer:{kind:"custom", componentId:"<new-id>"}` and add any new allowed effects |
| **Edit (only if new block types)** | `lib/invitation-template-registry.ts` (`INVITATION_BLOCK_TYPES`), `InvitationBlockRegistry.tsx`, `lib/invitation-template-schema.ts`, `InvitationPresentationBlocks.tsx` | Register + render a new block, and bound its content/effect schema |

**Do NOT touch:** `app/invitation/[token]/page.tsx` data loading, the RSVP route/action, token/check-in logic, or the legacy self-submitting TSX pages — they are compatibility-only (`docs/technical/invitation-template-engine.md:103`).

---

## 10. Risks / things that could break existing invitations or ticketing/check-in

1. **Duplicating RSVP / data loading in a custom template.** The legacy full-page TSX files embed their own RSVP handlers and must not be wired into the active renderer — doing so creates a second RSVP implementation (`docs/technical/invitation-template-engine.md:22,103`). *Mitigation:* custom pages must be presentation-only and reuse the shared `PageActionHandler` (`AUTHORING.md:8-16`).
2. **Selector drift / unknown IDs.** The picker catalog, unified pair registry, and page registry can drift from renderer-supported IDs (`docs/technical/invitation-template-engine.md:20`). Adding an ID in one place but not the renderer yields blank/`null` blocks.
3. **Unknown block types silently render `null`.** Historical limit: validation may accept arbitrary block strings and the renderer silently drops unknowns, "which can conceal invalid saved configuration" (`docs/technical/invitation-template-engine.md:11`).
4. **Template switching in the preview.** Template changes travel in the draft payload and re-render in-place (`lib/invitation-preview-channel.ts:10-12`); a candidate template that fails must fall back to `savedTemplateId` (`:28`). A new template that throws could destabilize the preview.
5. **Publish/legacy compatibility.** Existing published `blocks_layout.version` stays self-contained; legacy records flow through the adapter (`docs/technical/invitation-template-engine.md:98`). Changing shared block defaults or the adapter could alter already-published invitations.
6. **Effect schema bounds.** `envelope-reveal` (0–3000), `scroll-reveal` (0–1600), `falling-petals` density (1–12) are validated; exceeding them fails draft validation (`docs/technical/invitation-template-engine.md:150-159`). A new effect not registered for the template is filtered out (`InvitationBlocksLayoutClient.tsx:36-40`).
7. **Reduced-motion regressions.** Every new animation must honor `prefers-reduced-motion` (`DESIGN.md:202`) and repos have known gaps (`DESIGN.md:255`). New motion shipped without a guard is a design-system violation.
8. **Card PNG / OG.** The card route reads only the published snapshot and must not render guest-identifying text (`docs/technical/invitation-template-engine.md:50-53,73-74`); a template that requires guest data in the card would leak PII into a crawlable OG image.
9. **Ticketing/check-in coupling.** The RSVP action reads the **linked ticket instance** and blocks changes when the ticket is checked in (`lib/invitations.ts:230-…`). Any change to invitation status handling risks breaking check-in semantics. QR/ticket behavior must stay in the existing invitation pass/action flow (`docs/technical/invitation-template-engine.md:53`).
10. **Fonts/audio size limits.** Audio is capped at 5 MB and MP3/M4A only (`app/api/invitation-media/upload/route.ts:13,25`); images downscale to 1600 px (`lib/invitation-images.ts:43`). New templates must not assume other formats/sizes.
11. **Test-list trap (repo rule).** New `.test.cjs`/`.test.ts` files **must be appended to the explicit list in `package.json`** or they silently never run (per `AGENTS.md` testing rules).

---

## 11. Could not determine (stated plainly — no guessing)

1. **`event_invitation_pages` full column list.** Confirmed only `blocks_layout` (draft) and `published_snapshot.blocks_layout` (VERIFIED via `docs/technical/invitation-template-engine.md:6`). Other columns were not enumerated.
2. **Invitation *image* storage backend (R2 vs Supabase Storage).** The **audio** path is confirmed (Supabase `invitation-media` bucket). The image upload component/path's bucket was **not** traced to a concrete storage call in this pass (`lib/invitation-images.ts` is a downscale helper only). **NOT CONFIRMED.**
3. **Exact migration filenames for the invitation pages table and card catalog.** `docs/technical/invitation-template-engine.md` names **migration 178** (`blocks_layout`) and **179/180/181** (card seeds), but the audit did not open every one of those SQL files line-by-line to confirm the table DDL.
4. **Current behavior of unknown-block-type validation.** The engine doc has both an older statement (validation does not reject unknown types, `:11`) and a later statement (invitation-only allowlist added, `:96`). Which reflects the **current** code was not re-verified by reading `lib/invitation-template-schema.ts` in full.
5. **Complete font-pack / palette option lists.** Defined in shared registries (`lib/invitation-page-layout.ts`, `lib/invitation-colors.ts`, `lib/page-composition.ts`); not exhaustively enumerated.
6. **Whether the legacy full-page TSX files (`InvitationTemplateWedding.tsx`, `InvitationTemplateBirthday.tsx`, etc.) are referenced anywhere reachable.** The engine doc says they are not imported by the active route (`:9,103`); this audit did not exhaustively map their import graph beyond that statement.
7. **RSVP modal field reality vs. the requested list.** Only `accepted`/`declined` + prefilled name are confirmed; whether the UI *shows* a names/guest-count/wishes form that is then discarded was not confirmed from the component read (the ActionPortalBlock was read only in part).
8. **Production data inventory / applied-migration state.** Not in scope and not checked.

---

*Report written 2026-10-20. Read-only; the only file created is this one. All paths are relative to the repository root. Line numbers refer to the working-tree state at audit time; uncommitted work by other agents may shift line numbers in unrelated files.*
