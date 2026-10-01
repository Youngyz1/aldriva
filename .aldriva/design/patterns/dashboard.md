# Pattern: User & Organizer Dashboards (Reference Specification)

> Scope: `app/dashboard/*`, `app/dashboard/org/[id]/*`  
> Reference Implementation: `app/dashboard/page.tsx` & `components/dashboard/adaptive/*`

---

## 1. Primary Purpose & User Mental Model

The User Dashboard is the central command center for creators, organizers, and business owners. It is engineered to answer two fundamental questions within 2 seconds of landing on the page:
1. **"What is my current performance & operational status?"** (Dominant insight, financial summary, active counts).
2. **"What immediate action do I need to take right now?"** (Manage entities, review recent activity, launch new initiatives).

---

## 2. Core Composition Reset Principles

### A. Containers Are Earned, Not Assumed
- Do NOT wrap every section inside a card.
- Do NOT place cards inside cards (e.g. metric boxes inside summary cards, or org cards inside an organization card container).
- Use typography, whitespace, hairline dividers, and proximity to structure content on the page surface.

### B. Level 1: Primary Outcome & Inline Supporting Numbers
- Financial total is unboxed and visually dominant (`text-4xl sm:text-5xl font-extrabold text-zinc-950 tabular-nums`).
- Supporting module counts (Events, Articles, Products, Businesses) render as clean, inline metadata separated by mid-dots (`78 Events Hosted · 2 Articles · 1 Product`), not separate boxes.

### C. Level 2: Organizations & Workspaces
- Open structured list with hairline dividers (`divide-y divide-zinc-200/70`).
- Each item displays the organization logo/initials, name, verified status badge, role (`Owner` / `Manager`), entity type, and direct `Open workspace →` link.

### D. Level 3: Real-Time Operations Activity Stream
- Open chronological activity list with semantic category badges (`Donation`, `Event`, `Article`, `Product`, `Business`), donor descriptions, and relative time.

### E. Mobile Ergonomics & Navigation Safety
- Viewport width at `375px`: 100vw minus padding with zero horizontal overflow.
- Bottom padding: `pb-[calc(96px+env(safe-area-inset-bottom))]` guarantees the fixed mobile bottom navigation bar (`MobilePillNav`) never obscures the last interactive element.

---

## 3. Established Reference Architecture Diagram

```text
┌────────────────────────────────────────────────────────────────────────┐
│ Page Header: Title ("Overview") + Greeting + Top Action Button         │
├────────────────────────────────────────────────────────────────────────┤
│ Primary Outcome Summary (Unboxed on Canvas):                           │
│   $9,054                                                               │
│   Total Raised across your campaigns · 8 active fundraisers            │
│   78 Events Hosted  ·  2 Articles Published  ·  1 Product in Shop      │
├───────────────────────────────────┬────────────────────────────────────┤
│ Main Workspace (Col 8/12):        │ Secondary Operations Rail (Col 4): │
│                                   │                                    │
│ 1. Your Organizations             │ 1. Quick Actions Hub               │
│    ──────────────────────────     │    - Dominant primary CTA          │
│    [logo] Venezuela Foundation    │    - Secondary launch actions      │
│           Owner · Open workspace→ │                                    │
│    ──────────────────────────     │ 2. Account Trust & Payout Status   │
│    [logo] Prevent Policy Org      │    - Security & payout links       │
│           Owner · Open workspace→ │                                    │
│                                   │                                    │
│ 2. Recent Activity                │                                    │
│    ──────────────────────────     │                                    │
│    [Heart] $50 from Jane Doe      │                                    │
│    [Cal]   Tech Summit created    │                                    │
└───────────────────────────────────┴────────────────────────────────────┘
```
