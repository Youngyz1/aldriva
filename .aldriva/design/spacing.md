# Aldriva Spacing & Layout Architecture

---

## 1. Spacing Scale & Rhythm

Aldriva uses a strict 4px/8px-based spacing scale:

| Token | Pixels | Common Tailwind Class | Usage Context |
|---|---|---|---|
| **Tight** | 4px | `p-1`, `gap-1`, `space-y-1` | Badge padding, micro button gaps, tight metadata clusters |
| **Compact** | 8px | `p-2`, `gap-2`, `space-y-2` | List item spacing, form field label-to-input gap |
| **Component** | 12px–16px | `p-3`, `p-4`, `gap-3`, `gap-4` | Card header padding on mobile, table cell padding, toolbar item gaps |
| **Card / Container** | 24px | `p-6`, `gap-6`, `space-y-6` | Standard desktop card interior padding, grid gutter |
| **Section** | 32px–48px | `py-8`, `py-12`, `space-y-8` | Separation between distinct page blocks on dashboard / public pages |
| **Page / Hero** | 64px–96px | `py-16`, `py-24` | Landing page hero spacing, public marketing sections |

---

## 2. Layout Grid & Container Rules

### Max Width Constraints
- **Application Dashboard**: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8` (full desktop canvas with generous guttering).
- **Public Marketplace (Events / Fundraisers / Shop)**: `max-w-7xl mx-auto px-4 sm:px-6 lg:px-8`.
- **Editorial / Article Reading**: `max-w-3xl mx-auto px-4 sm:px-6` (optimal line length of 65–75 characters).
- **Settings & Single Form Focus**: `max-w-4xl mx-auto px-4`.
- **Checkout & Auth Screens**: `max-w-md mx-auto px-4` (distraction-free single column).

### Page Skeleton Hierarchy
Every main view follows a standard 3-tier structure:
1. **Page Header**: Title, breadcrumb or back link, context description, and primary page action (e.g. "Create Event", "Save Changes").
2. **Key Insight / Primary Focus Area**: The core content (e.g., live table, seating canvas, editor workspace, dominant KPI).
3. **Secondary Actions / Activity Feeds**: Placed in secondary columns or below the primary workspace.
