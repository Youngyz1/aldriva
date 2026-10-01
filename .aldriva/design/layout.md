# Aldriva Layout & Grid Patterns

---

## 1. Dashboard Layout Structure

Dashboard interfaces (under `app/dashboard/` and `app/admin/`) follow a predictable, highly functional layout:

```text
┌─────────────────────────────────────────────────────────────────────────┐
│ Global Top Navigation (Navbar.tsx)                                      │
├───────────────────┬─────────────────────────────────────────────────────┤
│ Collapsible       │ Page Header: Title + Context + Primary Action       │
│ Sidebar           ├─────────────────────────────────────────────────────┤
│ (AppSidebar.tsx)  │ Dominant Metric / Primary Action Workspace          │
│                   ├──────────────────────────┬──────────────────────────┤
│ - Nav Items       │ Primary Content Area     │ Secondary Sidebar        │
│ - Entity Selector │ (Filterable Data Table / │ (Quick Actions / Filter  │
│ - User Profile    │  Visual Builder / Feed)  │  Presets / Mini Feed)    │
└───────────────────┴──────────────────────────┴──────────────────────────┘
```

### Layout Rules
- **Header Action Alignment**: The primary action button sits at the top right of the Page Header (`flex items-center justify-between`).
- **Main/Sidebar Proportion**: On desktop (`lg`+), main content occupies `col-span-8` or `col-span-9`, sidebar occupies `col-span-4` or `col-span-3`.
- **Mobile Transition**: Below `1024px`, the sidebar collapses into a slide-over drawer or stacks cleanly beneath the main content. The mobile navigation bar (`MobilePillNav.tsx`) pins to the bottom.

---

## 2. Public Marketplace Layout (Events, Fundraisers, Shop)

Public detail and listing pages follow an asymmetric layout prioritizing the visual entity and purchase/donate flow:

- **Desktop (1024px+)**: 2-Column Split.
  - Left/Center (65% width): Hero media gallery, long-form story, organizer badge, comments, reviews.
  - Right (35% width, sticky): Checkout widget, ticket selector, donation goal card, or buy button.
- **Mobile (< 1024px)**: Single column with a sticky bottom action bar (`fixed bottom-0 inset-x-0 bg-white border-t p-3 z-40`) providing immediate one-tap checkout.
