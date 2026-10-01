# Aldriva Responsive Design Strategy

> **Axiom**: *Mobile is not just a shrunk-down desktop; it is a distinct, touch-first context.*

---

## 1. Breakpoint Standards

Aldriva adheres to Tailwind's default breakpoint scale:
- **Mobile (`< 640px`)**: Single-column vertical stack, full-width buttons, bottom-pinned bars.
- **Tablet (`sm: 640px` to `md: 768px`)**: 2-column card grids, condensed sidebars.
- **Desktop (`lg: 1024px`)**: Full multi-column dashboard layouts, sticky split panels.
- **Wide Desktop (`xl: 1280px` and `2xl: 1536px`)**: Max-width capped canvases (`max-w-7xl`).

---

## 2. Mandatory Responsive Transformations

### A. Data Tables & Operational Lists
- Follow the canonical [Responsive Data Tables & Entity Lists Pattern](patterns/data-tables.md).
- **Desktop (Container width `>= @md` / 768px)**: Render clean multi-attribute comparison tables with `tabular-nums` for numeric alignment.
- **Mobile (Container width `< @md` / < 768px)**: Collapse rows into **Two-Line Structured Rows** (Line 1: Identity + Primary Value; Line 2: State Badge + Secondary Context).
- **Anti-Pattern Rule**: Do NOT default to `overflow-x-auto` horizontal swiping for standard operational data, and do NOT arbitrarily convert rows into bulky multi-column card grids.
- Progressive disclosure via inline expansion or `DashboardDrawer` reveals secondary and low-frequency details without full-page navigation.

### B. Navigation
- Desktop: Global top navbar + persistent dashboard sidebar.
- Mobile: Pinned bottom bar (`MobilePillNav.tsx`) or slide-over drawer with touch targets of at least 44x44px.

### C. Checkout & Donation CTAs
- Desktop: Sticky right-hand card (`sticky top-24`).
- Mobile: Fixed bottom bar (`fixed bottom-0 inset-x-0 bg-white border-t p-3 z-30`) with a prominent full-width CTA button.

### D. Horizontal Overflow Prevention
- Always ensure global layout preserves `overflow-x: clip` in `app/globals.css` so sticky headers do not lose their positioning container while eliminating horizontal scrollbars.
- Use `scrollbar-hide` utility on horizontal slider carousels.
