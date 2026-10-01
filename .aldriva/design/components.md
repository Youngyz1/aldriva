# Aldriva Component Governance & Primitive Catalog

> **Rule**: Search and reuse existing primitives before writing new components.  
> `components/ui/` → `components/dashboard/` → `components/` → (New Component)

---

## 1. Core UI Primitives (`components/ui/`)

| Component | Path | Description & Standards |
|---|---|---|
| **Button** | `components/ui/button.tsx` | CVA-powered with variants: `default` (orange solid), `outline` (white bg, zinc border), `secondary` (zinc-50), `ghost`, `link`, `destructive`. Standard radius: `rounded-xl`. |
| **Card** | `components/ui/card.tsx` | `Card`, `CardHeader`, `CardTitle`, `CardDescription`, `CardContent`, `CardFooter`. Standard border: `border-zinc-200/70`, standard radius: `rounded-xl`, shadow: `shadow-xs`. |
| **Dialog / Modal** | `components/ui/dialog.tsx` | Radix UI dialog with animated overlay backdrop (`bg-black/50`) and centered modal content card. |
| **Dropdown Menu** | `components/ui/dropdown-menu.tsx` | Radix UI popover menu with keyboard navigation and subtle hover highlights. |
| **Badge** | `components/ui/badge.tsx` | Status indicators and tags. Variants: `default`, `secondary`, `destructive`, `outline`. |
| **Tabs** | `components/ui/tabs.tsx` | Radix UI tabs with underline or pill styling. |
| **Input / Textarea** | `components/ui/input.tsx`, `textarea.tsx` | Accessible form fields with consistent border, focus ring, and disabled states. |
| **Switch & Radio** | `components/ui/switch.tsx`, `radio-group.tsx` | Toggle switches and radio groups using brand focus rings. |
| **Progress** | `components/ui/progress.tsx`, `ProgressBar.tsx`, `ProgressRing.tsx` | Visual goal trackers for fundraising campaigns and file uploads. |
| **Route Loading** | `components/ui/RouteLoading.tsx` | Full-page and route-level skeleton loader. |

---

## 2. Dashboard Primitives (`components/dashboard/`)

- `DashboardPageHeader.tsx`: Title, subtitle, breadcrumb, and action button slots.
- `DashboardToolbar.tsx`: Search bar, filter dropdowns, view switchers, and export trigger.
- `DashboardTableCard.tsx`: Standard container wrapping data tables with pagination footer.
- `DashboardEmptyState.tsx`: High-clarity empty state illustration with primary action button.
- `DashboardFilters.tsx`: Filter presets and search query param synchronization.
- `RowActionsMenu.tsx`: Contextual 3-dot dropdown menu for table row actions.

---

## 3. Order of Precedence for New UI

```text
1. Existing UI Primitive in components/ui/
   ↓ (If insufficient)
2. Existing Domain Component in components/dashboard/ or components/
   ↓ (If insufficient)
3. Compose Existing Primitives into a Component
   ↓ (If completely new shared pattern)
4. Author New Primitive in components/ui/
   ↓ (If strictly unique to one route)
5. Page-Specific Component (co-located in app/ route folder)
```
