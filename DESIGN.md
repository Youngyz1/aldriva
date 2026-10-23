# Aldriva DESIGN.md

Status: DRAFT v0.1, written from the 2026-10-17 codebase audit and the owner's answers.

Tags used in this file:
- [DECISION] chosen by the owner, do not change without asking.
- [ASSUMED] proposed default, owner to confirm.
- [OWNER] section the owner must fill in with their own words.

## 0. How agents must use this file

1. Read this file before building or changing any UI.
2. Reuse existing components (section 4). Do not invent new card, hero, button, or section styles.
3. Use design tokens and semantic classes. Never hardcode colors that already have a token.
4. This file is the single source of truth. `docs/DESIGN-SYSTEM.md` should only point here. The `.aldriva/design/` links in older docs are stale and must not be followed.
5. If this file conflicts with existing code, report the conflict. Do not silently pick one.
6. Tailwind v4, CSS-first: there is no `tailwind.config.*`. Tokens live in `app/globals.css`.

**Permanent platform rule:** Ordinary content belongs directly on the page background by default. Headings, descriptions, forms, filters, toolbars, tabs, tables, lists, and empty states use spacing, typography, and dividers instead of decorative wrappers. Reserve one card for a meaningful independent item, actionable record, selectable template, or metric. Nested cards require a clear functional justification, and new pages must follow these rules.

## 1. Visual theme and atmosphere [OWNER]

Source material that exists today: brand voice is warm, trustworthy, empowering, and direct (`docs/marketing/brand-voice.md`). Visual foundation is zinc neutrals with one orange brand accent.

[OWNER: describe the intended look and feel in 3 to 5 sentences. What should a visitor feel in the first 3 seconds? Name 2 or 3 sites whose feel you like and what you like about them.]

Aldriva has four design surfaces. Each one has its own rules:

| Surface | Look is owned by | Section |
|---|---|---|
| Platform (app, dashboards, builder, marketing pages) | This file | 2.1, 2.2, 3 |
| Fundraising | Frozen green/lime scheme | 2.3 |
| Public business websites | Template (V2 current, legacy compat) | 9 |
| Event invitations | Invitation template (own docs) | 9 |

## 2. Color

### 2.1 Platform brand (orange)

Defined in `app/globals.css`. Primary is `--brand-700`.

| Token | Value | Use |
|---|---|---|
| `--brand-50` to `--brand-950` | #fff7ed, #ffedd5, #fed7aa, #fdba74, #fb923c, #f97316, #ea580c, #c2410c, #9a3412, #7c2d12, #431407 | Full scale |
| `--primary` | `var(--brand-700)` = #c2410c | Solid buttons, primary actions |
| `--primary-foreground` | #ffffff | Text on primary |
| `--ring` | `var(--brand-500)` = #f97316 | Focus ring |
| Browser theme color | #c2410c | Both root layouts |

Rule: solid orange buttons with white text use `--brand-700` (#c2410c). `--brand-600` (#ea580c) does not meet AA contrast with white text.

### 2.2 Neutrals and semantic (light mode)

| Role | Value |
|---|---|
| Canvas / foreground | #ffffff / #171717 |
| Secondary / foreground | #09090b / #ffffff |
| Accent / foreground | #f4f4f5 / #18181b |
| Surface / subtle surface | #ffffff / #fafafa |
| Card / card foreground | #ffffff / #09090b |
| Muted / muted foreground | #fafafa / #71717a |
| Border / strong border / input | #e4e4e7 / #d4d4d8 / #e4e4e7 |
| Destructive | #dc2626 on #ffffff |
| Success | #15803d on #ffffff |
| Warning | #d97706 on #ffffff |

Dark counterparts currently defined in `app/globals.css`:

| Role | Value |
|---|---|
| Canvas / foreground | #09090b / #ededed |
| Primary / foreground | #fdba74 / #431407 |
| Secondary / foreground | #27272a / #fafafa |
| Accent / foreground | #27272a / #fafafa |
| Surface / subtle surface | #18181b / #27272a |
| Card / card foreground | #18181b / #fafafa |
| Muted / muted foreground | #27272a / #a1a1aa |
| Border / strong border / input | #27272a / #3f3f46 / #27272a |
| Destructive / foreground | #f87171 / #09090b |
| Success / foreground | #22c55e / #052e16 |
| Warning / foreground | #fbbf24 / #451a03 |
| Focus ring | #fb923c (`--brand-400`) |

### 2.3 Fundraising scheme [DECISION: FROZEN]

The green and lime colors on fundraising pages, including the donate and checkout buttons, stay exactly as they are. Do not recolor, unify, or "improve" them. They are component-level Tailwind classes; there is no theme switch, and the global `--primary` stays orange.

Existing CTA treatments, documented as they are today:

| Role | File | Classes |
|---|---|---|
| "Donate now" (campaign page) | `app/fundraisers/[slug]/page.tsx` | `flex min-h-[48px] flex-1 items-center justify-center whitespace-nowrap rounded-full bg-lime-400 px-4 py-3.5 text-base font-black text-emerald-950 transition hover:bg-lime-300 active:scale-[0.98] shadow-sm sm:px-6` |
| "Proceed" (checkout) | `app/fundraisers/[slug]/donate/DonatePage.tsx` | `w-full rounded-2xl bg-green-700 py-4 text-base font-black text-white transition hover:bg-green-800 disabled:cursor-not-allowed disabled:bg-green-300 active:scale-[.99]` |
| Landing CTA | `components/fundraisers/LandingHero.tsx` | `bg-emerald-600 hover:bg-emerald-700 rounded-xl px-6 py-3` with bold-black text |

Also frozen: fundraising artwork greens #02241e, #062A22, #154D40, #059669 (`components/FundraiserShare.tsx`).
Not a pattern: `app/fundraisers/[slug]/DonateButton.tsx` appears unused. Do not copy from it.
The localized checkout at `app/[locale]/fundraisers/[slug]/donate/DonatePage.tsx` must stay visually in sync with the non-localized one.
Agents may fix bugs and accessibility in fundraising UI but must not change its colors.
Tailwind 4 resolves the CTA utility colors from its installed `node_modules/tailwindcss/theme.css`; examples: `lime-400` is `oklch(84.1% 0.238 128.85)`, `lime-300` is `oklch(89.7% 0.196 126.665)`, `green-700` is `oklch(52.7% 0.154 150.069)`, and `green-800` is `oklch(44.8% 0.119 151.328)`. These classes and values are frozen together.

### 2.4 Website palettes

Business website block palettes (`lib/website-blocks.ts`): default, zinc_orange, dark, slate, warm_amber, forest. Primary values: #c2410c, #c2410c, #f97316, #0f172a, #d97706, #15803d. These belong to the website builder, not the platform or fundraising.

### 2.5 Color rules

- Platform UI uses tokens, not raw Tailwind colors (no `bg-white`, `text-black`, `bg-orange-600`).
- Orange is the only accent on platform surfaces. Green and lime belong to fundraising and the forest palette.
- Status colors are semantic only (success, warning, destructive). Never use them as decoration.
- Known mismatch to fix: the Business Starter template defaults to #ea580c, but solid buttons with white text should use #c2410c.
- Sidebar navigation labels, group labels, descriptions, and badges must meet WCAG AA contrast (4.5:1) against their actual surface, including alpha-composited backgrounds. Icons and visible focus indicators must meet 3:1; use clear active, hover, and keyboard-focus states in both light and dark variants.

## 3. Typography

### 3.1 Platform font [DECISION + ASSUMED]

[DECISION] Plus Jakarta Sans is not the platform font. The owner wants a standard, non-generic, product-grade font in the spirit of developer-tool UIs such as Codex and Claude Code.
[ASSUMED] Geist Sans for UI and headings, Geist Mono for code and numbers. Reasons: free, designed for product UI, supports French accents (the app has `[locale]` routes), and `docs/DESIGN-SYSTEM.md` and the CSS aliases already say Geist. Alternative if rejected: Inter.

Implementation:
- Both root layouts load Geist and Geist Mono with `next/font/google`. The font variables are `--font-ui` and `--font-code`; `app/globals.css` exposes them through `--font-geist-sans` and `--font-geist-mono` for platform and Tailwind use.
- Geist Mono now replaces the previous Courier New fallback as the loaded monospace face.
- The font change also reaches fundraising and public-site templates that inherit the platform sans stack. Template font overrides remain available; visual verification is still needed.

Websites and invitations may use their own fonts (section 9). Those fonts never become platform fonts.

### 3.2 Platform scale (current values)

| Style | Size |
|---|---|
| Display | clamp(1.875rem, 4vw, 2.5rem) (30 to 40px) |
| H1 | 1.5rem (24px) |
| H2 | 1.125rem (18px) |
| Eyebrow | 0.6875rem (11px) |
| Body | 16px |

### 3.3 Public-site scale (`.public-site`)

H1 40 to 48px, H2 32px, H3 24px, H4 20px, body 16px, small 14px, caption 12px. Weights: 400, 500, 600, 700. Heading font is chosen by the template: sans (loaded font) or a Georgia/Times serif stack.
The rich-text editor has its own scale (h1 32px/800, h2 24px/700, h3 20px/600). Keep it as is until the editor is reviewed.

### 3.4 Content, readability, and progressive disclosure

- Give each page one clear title. Keep supporting copy short, task-oriented, and non-repeating; omit subtitles when they add no useful context.
- Make the next required action easy to find. Keep information needed for the current task visible and disclose secondary details, history, and actions on request.
- Use approximately 15–16px for main content and form labels, 14–15px for secondary information, and comfortable responsive sizes in dense tables. Avoid faint text and ornamental tiny copy; preserve contrast, focus indicators, and readable disabled states.
- Add and invite forms start closed. Open them in the existing accessible dialog, sheet, or disclosure pattern. Preserve validation, loading, entered values after a recoverable failure, and success refresh/feedback.
- Personnel rows lead with a person’s name and one operationally useful status. Reveal contact details, invitation state, timestamps, and secondary actions in a keyboard-accessible disclosure. Keep operationally necessary statuses visible and confirm destructive actions. Do not nest clickable controls inside the disclosure trigger.
- Apply the same task-first approach to orders, kitchen, delivery, menu, promotions, settings, and builders without forcing every workflow into one layout.

### 3.5 Interface icon system

- Use @tabler/icons-react for platform interface icons. Import actual exported components such as IconSearch or IconChefHat; aliases may preserve a readable local name. The dashboard navigation semantic map lives in components/nav/platform-nav-icons.ts.
- Prefer Tabler outline icons. Keep comparable controls at consistent 16–20px sizes and the default 2px stroke; use 24px only when the control or visual hierarchy calls for it. Icons inherit currentColor and use a neutral foreground by default.
- Use Aldriva orange for active navigation or meaningful emphasis. Use success, warning, and destructive colors only when the icon communicates that state. Do not color ordinary icons individually or add multicolored decorative icon sets.
- Give icon-only controls an accessible name and visible keyboard focus. Dynamic icon names must resolve through an explicit, verified mapping or safe fallback; never construct package imports from user data.
- Keep the existing Aldriva logo and genuine brand marks. react-icons may remain for those brand assets; do not add another general-purpose interface icon library.
## 4. Components

Canonical components. Reuse them. Do not create look-alikes.

| Component | Path | Notes |
|---|---|---|
| Button | `components/ui/button.tsx` | Variants: default (orange), outline, secondary, ghost, link, destructive. rounded-xl, no default shadow, active scale 0.98 |
| Card | `components/ui/card.tsx` | One border and background for meaningful standalone items; no default shadow. Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter |
| Input, Label, Select, Textarea, Radio, Switch, Tabs | `components/ui/` | Focus ring and disabled styles built in |
| Dialog, ConfirmDialog, Sheet, Dropdown, Tooltip | `components/ui/` | Shared overlays |
| Badge, ProgressBar, ProgressRing | `components/ui/` | Use these for new work |
| Container | `components/layout/Container.tsx` | sm 42rem, md 64rem, lg 72rem, xl 80rem; px-4 sm:px-6 lg:px-8 |
| Section, PageHeader | `components/layout/` | Section is an unboxed semantic group by default; opt into `bordered` only for a distinct surface |
| Navbar | `components/Navbar.tsx` | Rendered globally by root layouts |

These shared primitives are already consumed across app and dashboard surfaces. Existing custom/parallel patterns include `components/Hero.tsx`, `components/fundraisers/LandingHero.tsx`, and the public-site `HeroBlockRenderer` in `components/site/blocks/BlockRenderer.tsx`; card families include `components/FundraiserCard.tsx`, `components/fundraisers/CampaignShowcaseCard.tsx`, and `CampaignShowcaseMobileCard.tsx`.

Rules:
- New buttons use `components/ui/button.tsx`. The only exception is the frozen fundraising CTAs (2.3).
- New pages compose Container, PageHeader, and unboxed Section groups. Use Card only for independent actionable records, product/menu/event items, selectable templates, or meaningful metrics/charts.
- Keep forms, filters, toolbars, tabs, tables, settings lists, headings, explanatory copy, and empty states directly on the page background. Use spacing, type hierarchy, alignment, and separators for structure.
- Do not place a Card inside another Card. If an operational or editor workflow needs a nested surface, keep one outer card and make inner structure plain unless it has a distinct functional purpose such as a map canvas or selectable record.
- Do not add a new hero, card, progress, or footer implementation. Extend an existing one or ask first.

## 5. Layout and spacing

- Container widths and gutters as in section 4.
- Public-site spacing scale: 4, 8, 12, 16, 24, 32, 48, 64px. Section vertical padding: 48px normal, 64px spacious.
- The shared `Section` component is unboxed and unpadded by default. Use `bordered` and `padded` only when the section is a distinct visual unit.
- Platform section rhythm: use consistent vertical spacing between semantic sections (typically `space-y-6` to `space-y-8`) and compact internal spacing for controls; do not add a surface to create separation.
- Primary mobile CTAs: min height 48px (as in the Donate button). Other touch targets at least 44px.

## 6. Radius and depth

[ASSUMED] Platform standard: `rounded-xl` = 12px for buttons, inputs, and justified cards, matching `AGENTS.md` and the existing docs. Ordinary sections have no radius because they have no container. The global token `--radius-xl: 20px` and the public-site override (8px on `.rounded-xl.border`) conflict with this and are in the cleanup backlog (section 11).
Fundraising keeps its existing radii (rounded-full, rounded-2xl, rounded-xl as listed in 2.3).

Shadow tokens remain available in `app/globals.css`, but they are not defaults for platform controls, sections, or cards. Use elevation for overlays and clearly elevated interaction states only.

```css
--shadow-xs: 0 1px 2px rgb(0 0 0 / 0.06);
--shadow-sm: 0 2px 8px rgb(0 0 0 / 0.08);
--shadow-md: 0 8px 24px rgb(0 0 0 / 0.10);
```

Public sites use their own card shadow: `0 1px 3px rgb(34 32 28 / 0.08)`.

## 7. Dark mode

Status: the mode engine and neutral palette foundation are implemented; visual coverage still needs review. Previously, the footer switch only changed local React state and the OS-dark CSS rule forced light values.

[DECISION] Dark mode must be a real theme that switches the whole interface from light to dark with its own palette. It must not be a dimmed or filtered light theme. Either it works properly or it is removed.

- User choice is Light / Dark / System, with System as the default and the selected mode saved in local storage.
- System follows `prefers-color-scheme`; the footer control can select an explicit Light or Dark override.
- Canvas is #09090b. The stylesheet applies a real dark palette and neutral utility compatibility mappings; it does not apply opacity or a filter.
- Theme switching is scoped away from fundraising (`/fundraisers/`), public business websites (`/site/`, `/website-preview/`), and invitations (`/invitation/`); those keep their own palettes. Public business sites continue to use `theme_config.darkMode`.
- Fundraising colors remain untouched; system dark mode does not activate on fundraising routes.
- Some UI still uses surface/color utilities outside the mapped zinc and gray families. Do not mark dark mode fully complete until those surfaces have been visually reviewed and corrected where needed.

## 8. Motion (interim, until `motion.md` exists)

- Library: Framer Motion (already installed). Do not add GSAP or Lottie without approval.
- Durations [ASSUMED]: fast 150ms (hover, press), base 200ms (state changes), slow 300ms (enter/exit). Ambient decorative loops may be longer but must be decorative only.
- Every animation, including CSS keyframes, sliders, and video backgrounds, must respect `prefers-reduced-motion`. Known gaps: auto-sliders and `video_bg` hero blocks.
- Animate `transform` and `opacity` only. Animated backgrounds must stay light enough for mid-range phones.
- Existing effects: invitation falling petals and botanical blooms, Growth Studio gradient blobs, global button ripple.

## 9. Template systems and ownership

Principle: templates control layout, typography, and colors. They never own business data.

| System | Status | Where | Owns |
|---|---|---|---|
| Business templates V2 | CURRENT. New work goes here | `lib/website-template-v2.ts`, `lib/website-v2-theme.ts` | Page and slot layout, background, heading font, locked theme, default accent. 4 templates: Table & Flame, DriveLine, Food Order, Store |
| Business templates legacy | COMPATIBILITY. Keep working, add nothing new | `lib/website-template-registry.ts` | Theme (name, primary, font family, radius, dark mode), header, footer, navigation, pages, blocks. 6 templates: Business Starter, Restaurant Delight, Retail Boutique, Service Pro, Creative Portfolio, Organization Impact |
| Invitation templates | Own specs | `lib/invitation-template-registry.ts`, `docs/technical/invitation-template-engine.md`, `components/invitation/templates/AUTHORING.md` | Theme preset, block order, effects, fonts, palettes. 8 page templates: Gala Editorial, Black Tie, Romantic Wedding, Romantic Envelope, Botanical Reverie, Bold Celebration, Cover Story, Luxe Editorial |

V1 website templates are retained as compatible content through the legacy registry and resolver. V2 is the current creation path. Website theme colors, heading fonts, layout slots, and section structure are stored in versioned code-owned template definitions and resolved by the public-site renderers. Invitation template data lives in the separate invitation registry; custom page renderers are allowlisted rather than named by persisted user content.

Mechanics:
- V1 definitions in `lib/website-template-registry.ts` store `ThemeConfig`, header/footer, navigation, and page block data. Theme settings include preset, primary color, sans/serif/mono family, border radius, and the legacy per-site dark-mode flag; `lib/website-template-resolver.ts` keeps saved compatible content renderable.
- V2 definitions in `lib/website-template-v2.ts` store pages, sections, editable slots, commerce bindings, and a theme configuration. `lib/website-v2-theme.ts` supplies template-scoped public-site variables such as accent, heading font, and surface treatment; template sections control layout.
- Invitation definitions in `lib/invitation-template-registry.ts` choose theme presets, supported palette/font-pack/text-scale customizations, block order, presentation variants, page renderer, and allowed motion effects. `lib/page-composition.ts` owns invitation theme presets; `lib/invitation-page-layout.ts` combines palette and font-pack classes. Shared-block pages and allowlisted custom React page templates provide layout.

Rules:
- Platform tokens never leak into templates. Template tokens never leak into the platform.
- `.public-site` scopes public-site styles; the accent comes from `--site-primary`, falling back to `--brand-700`.
- Invitation palettes and fonts stay in the invitation specs. This file only defines the boundary. Do not duplicate them here.
- Per-template-family design specs for new templates go in `design/templates/<family>.md` (palette, fonts, hero, sections, animated background, motion, static fallback).

## 10. Do and don't

Do:
- Reuse `components/ui` and `components/layout`.
- Use `--primary` for platform actions and `rounded-xl` for platform controls.
- Put ordinary content directly on the page background; create hierarchy with typography, spacing, alignment, and separators.
- Keep one surface around a genuinely independent item. Keep kitchen orders and delivery tasks individually identifiable and actionable.
- Keep generated pages consistent with the nearest existing page of the same type.
- Check reduced-motion, mobile width, and keyboard focus on every new screen.

Don't:
- Wrap ordinary text, forms, sections, lists, filters, tables, toolbars, or empty states in cards.
- Stack decorative borders/backgrounds around the same content or place one card inside another without a documented functional reason.
- Add default shadows to buttons or cards.
- Recolor fundraising (2.3).
- Use `bg-white`, `text-black`, or raw orange shades in platform UI.
- Introduce new fonts, radii, shadows, or spacing values without adding them here first.
- Redesign a hero, card, or section "to look nicer". Match the system or ask.
- Follow links to `.aldriva/design/`. They do not exist.

## 11. Known inconsistencies (cleanup backlog)

1. Geist is now loaded as the platform font; the change still needs visual review across the app, fundraising, and inherited website templates.
2. Business Starter default #ea580c vs the #c2410c rule.
3. Dark canvas mismatch is resolved to #09090b; broad visual coverage still needs review.
4. Radius: docs 12px vs `--radius-xl: 20px` vs public-site 8px override.
5. Three fundraising CTA treatments plus an unused `DonateButton.tsx` (colors frozen; only dead code may be removed).
6. Hero implemented three ways: `app/page.tsx`, `LandingHero.tsx`, `HeroBlockRenderer`.
7. Campaign cards implemented three ways: `FundraiserCard.tsx`, `CampaignShowcaseCard.tsx`, `CampaignShowcaseMobileCard.tsx`.
8. Multiple progress implementations, multiple footer variants.
9. Section padding differs per surface.
10. Reduced-motion not applied everywhere (sliders, video heroes).
11. `AGENTS.md`, `CLAUDE.md`, and `docs/DESIGN-SYSTEM.md` now point to this file; other older docs may still contain stale `.aldriva/design/` links.

## 12. Agent quick reference

- Platform primary: #c2410c (`--primary`). Focus ring: #f97316.
- Neutrals: zinc. Borders #e4e4e7. Muted text #71717a.
- Radius: `rounded-xl` (12px) on platform controls.
- Shadow: none on standard buttons, sections, and cards; use elevation for overlays or a justified elevated interaction.
- Font: Geist Sans and Geist Mono [ASSUMED family choice; loaded in both root layouts, visual review pending].
- Fundraising: green and lime stay untouched.
- Prompt to start any UI task: "Read DESIGN.md first. Use existing components from components/ui and components/layout. Match the nearest existing page of this type. Do not change fundraising colors. Report any conflict with DESIGN.md instead of choosing silently."

## Business sites

- Business site rules live in `design/business-sites/BASELINE.md`; each template's look lives in `design/business-sites/templates/`.
- Precedence: template spec > `BASELINE.md` > `DESIGN.md`.
- If they conflict, report it instead of choosing silently.
