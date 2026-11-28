# 06 — Mobile Navigation Specification

Decisions already made (not reopened): bottom bar = **Overview · Live ops · Manage · More**; remove the top
"Explore" entry and the mobile hamburger; delete `DashboardMobileNav` and `OrgMobileNav`; one shared bar.

---

## 1. Bottom bar

| Property | Spec |
|---|---|
| Height | 56px + `env(safe-area-inset-bottom)` |
| Background | `#fff`, 1px top border `zinc-200`, **no shadow** |
| Items | 4, equal width, each ≥48×48 hit area |
| Icon | 22px Tabler outline, `currentColor`; active = `--primary`, inactive `zinc-500` |
| Label | 12px/600; active `--primary`; meets 4.5:1 on white (zinc-600 for inactive) |
| Active | by pathname prefix, not exact match (`live` tab active on `/orders`, `/bookings`, `/events/*`) |
| Badges | count from the attention payload only; never a decorative dot |
| Position | `fixed inset-x-0 bottom-0 z-20` |
| Mount | entity workspace layouts only (§5) |

Tabs (always 4 tabs):

1. **Overview** → `/dashboard/org/{id}/overview` (event: `/dashboard/events/{id}/overview`). Overview pages keep an `sr-only <h1>` for screen reader accessibility and document outline.
2. **Live ops / Website** → a segment page at `/dashboard/org/{id}/live` listing Orders / Bookings / Reservations /
   Events / Donations **by capability**. If exactly one domain is live, the tab links straight to it.
   **The bottom bar always has 4 tabs:** when no live domain exists (e.g. generic business with no orders/bookings),
   the second tab becomes **Website** (`/dashboard/org/{id}/website`).
3. **Manage** → `/dashboard/org/{id}/manage`, a grid of catalog sections (Menu / Services / Products /
   Tickets / Website) by capability — same tiles as `QuickActionTile`, 44px+.
4. **More** → bottom sheet (below).

What the bar deliberately is **not**: a per-page tab mirror. `ManagementShell` currently renders entity tabs in
a drawer; the bar carries the four workspace-level destinations and the sheet carries the rest.

## 2. More sheet

- Bottom sheet, max-height 80vh, `rounded-t-2xl`, drag handle, backdrop `z-30`, sheet `z-40`.
- Inset: `padding-bottom: calc(1rem + env(safe-area-inset-bottom))`.
- Contents, in order:
  1. Remaining workspace sections not in the bar (Website, Reviews, Analytics, Settings, Kitchen, Tables & QR,
     Promotions, Branches) — from the registry, so it cannot drift.
  2. Divider.
  3. **Back to Aldriva** → `/dashboard`.
  4. Sign out is **not** here (it belongs to account settings, which exists).
- Row height 48, icon 20, label 15, chevron; section count > 8 → the sheet scrolls inside itself.
- Focus trapped; `Esc` and backdrop close; returns focus to the More tab.
- The sheet replaces the hamburger drawer for dashboard workspaces. `MobileDrawer` remains for the **public
  site** nav only.

## 3. Safe areas

`viewportFit: "cover"` is required for any `env(safe-area-inset-*)` to be non-zero. Today neither root sets it
(`app/layout.tsx:14-19`, `app/[locale]/layout.tsx:24-29`) while 27 files consume the inset — so all bottom
padding is currently 0 on iOS.

Plan (PR 8):

```ts
// app/layout.tsx and app/[locale]/layout.tsx
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: [/* existing values */],
};
```

- Remove `maximumScale: 1` (audit BUG-07; WCAG 1.4.4).
- `theme-color` stays per surface; no change to the palette.

Elements that must consume `env(safe-area-inset-bottom)` **after** cover is enabled:

| Element | File | Handling |
|---|---|---|
| New bottom bar | `components/nav/DashboardBottomBar.tsx` | height + inset; content padded by `--bottom-bar-h` |
| More sheet | `components/nav/DashboardMoreSheet.tsx` | sheet bottom padding |
| Existing drawers | `components/nav/MobileDrawer.tsx` | sheet bottom padding |
| Cookie consent | `components/CookieConsent.tsx:59` | offset above the bar, inset-aware |
| Public profile bar | `app/profile/[id]/ProfileClient.tsx:723-760` | already fixed; keep inset, raise z (§4) |
| Toasts / banners | any `fixed bottom-*` | must use `bottom-[calc(var(--bottom-bar-h))]` inside a workspace |
| Content wrapper | org/event/fundraiser layout | `padding-bottom: calc(var(--bottom-bar-h) + 1rem)` |

Audit `evidence/safe-area-usage.txt` lists all 27 current usages; each must be re-checked in PR 8 with cover
enabled, because a value that was inert becomes live and can double-pad (e.g. a wrapper that already adds
`pb-24` plus a bar that adds inset).

## 4. z-index scale (fixes BUG-20 and BUG-21)

Define once in `app/globals.css` as CSS custom properties and use only these:

| Layer | Value | Examples |
|---|---|---|
| Content | 0 | page |
| Sticky headers | 10 | `Navbar`, `EntityHeader`, `ManagementShell` mobile header |
| Bottom bar | 20 | new bar; public profile bar |
| Cookie consent | 25 | above the bar, below any sheet |
| Drawer / sheet backdrop | 30 | `MobileDrawer`, More sheet backdrop |
| Drawer / sheet panel | 40 | drawer panel, More sheet, public site mobile panel |
| Dialog / modal | 50 | `ConfirmDialog`, settings dialogs |
| Toast | 60 | transient messages |

- BUG-20: `CookieConsent.tsx:59` is `z-50` and the profile bar is `z-40`; consent becomes `z-25` and offsets
  itself above the bar, so it never covers navigation and never sits over a dialog.
- BUG-21: `HomeAdaptiveNav.tsx:172` is `z-[200]` and `MobileDrawer.tsx:41` is `z-[100]`; both become 40. They
  never co-exist (public vs dashboard), but the scale removes the guesswork.

## 5. Sticky offsets (fixes BUG-05)

- Root `Navbar`: `h-14 sm:h-16` (56/64) — `components/Navbar.tsx:116`.
- Every dashboard sub-header uses `top-[var(--app-navbar-h)]`, with
  `--app-navbar-h: 3.5rem` and `@media (min-width:640px){ --app-navbar-h: 4rem }`.
- Applies to: `ManagementShell.tsx:57`, `OrgMobileHeader.tsx:43`, new `EntityHeader`.
- No other `top-16` may be added; grep in review (`grep -rn "sticky top-16" app components` must return 0).
- `scroll-margin-top` on anchored sections (`#hours`) = navbar + header + 8.

## 6. Which layouts mount the bar

| Route tree | Mounts | Notes |
|---|---|---|
| `/dashboard/org/[id]/*` | yes | Overview tab = org overview; Manage = catalog grid |
| `/dashboard/events/[id]/*` | yes | Live ops = check-ins/scan; Manage = tickets/guests/seating |
| `/dashboard/fundraisers/[id]/*` | yes | Live ops = donations; Manage = updates/beneficiaries |
| `/dashboard/businesses/[id]/*` | yes | branches + edit only (Q13: duplicate overview/orders retired) |
| `/dashboard/*` personal | **no** | unchanged in this effort (`MobileGlobalNav` stays for now) |
| `/dashboard/org/[id]/website/builder` | no | full-canvas editor; has its own chrome |
| `/site/*`, `/events/{slug}`, `/fundraisers/{slug}`, `/profile/*` | no | public surfaces keep their own nav; the dashboard bar must never leak |

Mount rule: one `<DashboardBottomBar>` per entity layout, rendered **after** `{children}` in the layout, not in
each page. This guarantees it survives nested route changes and cannot be double-rendered.

## 7. Public site vs dashboard separation

- The public site's `HomeAdaptiveNav` and `MobileDrawer` are unchanged in behaviour; only z-index normalisation
  (§4) and cover/inset handling (if it has fixed bottom elements) apply.
- The dashboard bar is hidden by construction (not mounted) on public routes; it must not be conditionally
  rendered from a shared layout, because that reintroduces the "bar flashes on the storefront" failure.
- "Back to Aldriva" in the More sheet is the only public-site-adjacent link, and it points to `/dashboard`,
  never to `/site/{slug}`.

## 8. Deletions

- `app/dashboard/DashboardMobileNav.tsx` — imported by nothing (audit `evidence/unused-mobile-nav-proof.txt`).
- `app/dashboard/org/[id]/OrgMobileNav.tsx` — imported by nothing; its comment claiming the layout reserves
  69px is false (`app/dashboard/org/[id]/layout.tsx:186-189` reserves nothing).
- `MobileHamburgerButton` imports from `OrgMobileHeader` and `ManagementShell` are removed in the same PR as
  the bar, so the drawer and the bar never co-exist.

## 9. Verification (PR 8)

- 360 / 390 / 414 / 768 widths; bar present on the four entity trees, absent on `/site` and `/profile`.
- With cover enabled: last card is fully visible above the bar on every entity page; no double padding.
- Cookie banner appears above the bar and below a dialog; More sheet opens above the bar, closes on Esc.
- `grep -rn "sticky top-16"` → 0; `grep -rn "z-\[100\]\|z-\[200\]"` → 0.
- Keyboard: tab order reaches all four tabs, Enter opens More, focus returns to the tab on close.
