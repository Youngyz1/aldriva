# Pattern: Responsive Data Tables & Entity Lists (Reference Specification)

> **Status**: Canonical Design & Engineering Specification (Phase 1 Approved)  
> **Scope**: All data-heavy interfaces across Aldriva (`app/dashboard/*`, `app/dashboard/org/[id]/*`, `app/admin/*`, `app/site/*`)  
> **Primary Objective**: Establish a single, predictable, touch-ergonomic responsive data-display architecture for desktop and mobile without sacrificing scannability or comparative utility.

---

## 1. Problem Statement & UX Mental Model

Aldriva contains numerous data-intensive operational interfaces (Events, Fundraisers, Businesses, Products, Payouts, Donations, Attendees, Guests, Organizers, Users, Moderation Queues). 

Previously, responsive handling across these interfaces suffered from two opposing anti-patterns:
1. **The Shrunk Desktop Table**: Forcing a 6-to-10 column desktop table into a phone viewport via horizontal overflow (`overflow-x-auto min-w-[960px]`), requiring awkward side-swiping, obscuring status badges, and hiding action triggers off-screen.
2. **The Bloated Card Grid**: Arbitrarily converting tabular rows into large decorative cards (`grid sm:grid-cols-2 lg:grid-cols-3`) with redundant labels, heavy borders, progress bars, and oversized headers—destroying vertical scanability and comparison efficiency.

### The Core Paradigm Shift

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ DESKTOP (Container Width >= 768px / @md):                                  │
│ Table = Multi-Attribute Comparison Tool                                   │
│ Wide screen enables horizontal alignment across multiple structured fields.│
├────────────────────────────────────────────────────────────────────────────┤
│ MOBILE (Container Width < 768px / @md):                                    │
│ Row = Compact Record Summary                                               │
│ Narrow screen prioritizes record identity, primary metric, and state.      │
└────────────────────────────────────────────────────────────────────────────┘
```

> **Axiom**: *The data is never deleted on mobile; its presentation, priority, and progressive revelation change.*

---

## 2. Information Architecture & Field Priority Rules

Every data row in Aldriva must organize its attributes according to a strict 5-level hierarchy:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ PRIORITY 1 — IDENTITY: What record am I looking at?                        │
│ (e.g., Event Title, Campaign Name, Business Name, Product Name, User Name) │
├────────────────────────────────────────────────────────────────────────────┤
│ PRIORITY 2 — PRIMARY VALUE: What is the dominant quantitative metric?       │
│ (e.g., Revenue, Amount Raised, Ticket Count, Price, Total Scans, Balance)  │
├────────────────────────────────────────────────────────────────────────────┤
│ PRIORITY 3 — STATE: What is the operational / lifecycle status?            │
│ (e.g., Published, Draft, Active, Completed, Pending Review, Suspended)     │
├────────────────────────────────────────────────────────────────────────────┤
│ PRIORITY 4 — IMPORTANT SECONDARY CONTEXT: When, where, or who?             │
│ (e.g., Event Date, Due Date, Venue/City, Category, Organizer, Units)      │
├────────────────────────────────────────────────────────────────────────────┤
│ PRIORITY 5 — LOW-FREQUENCY DETAILS: Deep operational/technical metadata    │
│ (e.g., Database UUIDs, External Payout IDs, Timestamps, Audit Notes)       │
└────────────────────────────────────────────────────────────────────────────┘
```

Priority 1 through 4 are directly visible in the collapsed mobile row. Priority 5 details are revealed on-demand via inline expansion or the canonical entity inspection surface (`DashboardDrawer` or management route).

---

## 3. Mobile Row Standard: The Two-Line Structured Row

For mobile containers (< `@md` / 768px), tabular rows collapse into a **Two-Line Structured Row**.

### Conceptual Anatomy

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ [Line 1]  [Identity: Title / Name]                  [Primary Value / Metric]│
│ [Line 2]  [State Badge] · [Secondary Context 1] · [Secondary Context 2]  [›]│
└────────────────────────────────────────────────────────────────────────────┘
```

### Concrete Examples

#### A. Event Record
```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Abidjan Tech Summit 2026                                         $14,250.00│
│ [PUBLISHED] · Nov 14 · Palais de la Culture · 245 tickets                 ›│
└────────────────────────────────────────────────────────────────────────────┘
```

#### B. Fundraiser Campaign
```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Clean Water Initiative Cocody                                     $8,420.00│
│ [ACTIVE] · 84% of $10,000 · 112 donors                                    ›│
└────────────────────────────────────────────────────────────────────────────┘
```

#### C. Product Item
```text
┌────────────────────────────────────────────────────────────────────────────┐
│ VIP Access Pass - Digital Masterclass                                $49.00│
│ [ACTIVE] · Digital · 142 orders · $6,958 revenue                          ›│
└────────────────────────────────────────────────────────────────────────────┘
```

#### D. Payout / Disbursement
```text
┌────────────────────────────────────────────────────────────────────────────┐
│ Bank Transfer · CI034...901                                       $1,250.00│
│ [PROCESSING] · Requested Oct 02 · Ref: PAY-8912                           ›│
└────────────────────────────────────────────────────────────────────────────┘
```

### Mobile Row Layout Rules
1. **Line 1 (Identity & Value)**:
   - **Identity** is left-aligned, bold (`font-bold text-zinc-950`), truncated with ellipsis if exceeding available line width (`truncate flex-1 min-w-0 pr-3`).
   - **Primary Value** is right-aligned, bold, styled with tabular figures (`font-extrabold text-zinc-950 tabular-nums shrink-0`). For currency, positive financial values use `text-emerald-700` or neutral `text-zinc-950`.
2. **Line 2 (State & Supporting Context)**:
   - Left-aligned metadata strip (`flex items-center flex-wrap gap-1.5 text-xs text-zinc-500`).
   - **State Badge** renders first (compact status pill, e.g. `px-2 py-0.5 text-[10px] font-black uppercase rounded-full`).
   - Secondary attributes follow, separated by subtle center-dots (`·`).
   - Trailing chevron (`›` / `ChevronRight`) indicates inspectability.
3. **Single Record Boundary**:
   - The row uses hairline dividers (`divide-y divide-zinc-100` or `border-b border-zinc-100`).
   - **Zero standalone card wrapping**: Rows sit inside a single clean container without individual shadows, oversized borders, or nested paddings.

---

## 4. Explicit Anti-Patterns & Visual Rules

| Anti-Pattern | Why It Fails | Mandated Aldriva Solution |
|---|---|---|
| ❌ **Shrunk Desktop Table** (`overflow-x-auto` on standard CRUD) | Forces horizontal swiping on mobile; hides status and actions offscreen; breaks thumb ergonomics. | Collapse into Two-Line Structured Rows below container `@md`. |
| ❌ **Card Proliferation** (Turning every row into an independent card box) | 10 cards create 10 disconnected boxes with massive vertical scrolling, destroying scannability and comparison. | Single structured list with clean hairline dividers (`divide-y divide-zinc-100`). |
| ❌ **Value Drifting** (Placing prices/metrics unpredictably under text) | Makes scanning numbers down a list impossible. | Anchor Primary Value to the top-right slot of Line 1 (`shrink-0 text-right tabular-nums`). |
| ❌ **Ambiguous Data Strings** (e.g. printing raw `Nov 14` or `245`) | User cannot tell if `Nov 14` is created date, event date, or payout date. | Add concise contextual prefixes when needed: `Event Nov 14`, `Due Nov 14`, `245 tickets`. |
| ❌ **Redundant Obvious Labels** (e.g. `Amount: $500` or `Name: John`) | Wastes precious mobile horizontal space on self-evident semantics. | Keep self-evident symbols unlabelled (`$500.00`, `@username`). |
| ❌ **Mobile Table Column Headers for Sorting** | Tapping tiny 8px column headers on a 375px phone screen is an a11y failure. | Decouple sorting and filtering into `DashboardToolbar` / dropdown controls. |

---

## 5. Numeric & Currency Formatting Standard

1. **Tabular Figures**: All numeric columns, currency amounts, percentages, quantities, and dates MUST use CSS `tabular-nums` (via Geist Mono or `font-variant-numeric: tabular-nums`).
2. **Alignment Consistency**:
   - In desktop tables: Numerical values are right-aligned or cleanly column-aligned with headers.
   - In mobile rows: Primary values are anchored to the top-right corner of Line 1.
3. **Currency Display**:
   - Format: Symbol + standard thousand delimiters + 2 decimal places (e.g., `$1,250.00` or `12,500 XOF`).
   - Use standard Aldriva helpers (`formatAdminMoney()`, `formatCurrency()`).

---

## 6. Sorting, Filtering & Bulk Actions Strategy

- **Sorting**: Sorting controls live in `DashboardToolbar.tsx` or `AdminManagementToolbar.tsx`. On mobile, sorting is selected from a dedicated sort menu, not via table headers.
- **Filtering**: Quick filters render as pill tabs or a collapsible filter bar triggered via `onToggleFilters`.
- **Bulk Selection**: When bulk selection is active, each mobile row displays a standard 20x20px checkbox on the left of Line 1; floating/sticky bulk action bar renders at the bottom of the viewport above the mobile navigation bar.

---

## 7. Row Interaction & Inspection Architecture

Every row in Aldriva supports three levels of interaction:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ LEVEL 1: Quick Inline Inspection                                           │
│ Tap row on mobile / click chevron -> Expands secondary details in place    │
├────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 2: Operational Detail Drawer (DashboardDrawer)                       │
│ Tap title / "View Details" -> Opens slide-over drawer with full summary &   │
│ fast contextual actions without full-page navigation.                      │
├────────────────────────────────────────────────────────────────────────────┤
│ LEVEL 3: Canonical Workspace Navigation                                    │
│ Tap "Manage" / "Edit" -> Navigates to dedicated entity management route    │
│ (e.g., `/dashboard/events/[id]/overview`, `/events/edit/[id]`).            │
└────────────────────────────────────────────────────────────────────────────┘
```

> **Rule**: *Do NOT duplicate the full entity management suite inside every table row. The row provides situational awareness and fast actions; canonical routes provide deep configuration.*

---

## 8. Responsive Container Query Strategy

Aldriva utilizes Tailwind v4 container queries (`@container`). Breakpoints are evaluated relative to the **data container width**, not viewport width:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ CONTAINER WIDTH BREAKPOINTS:                                               │
│ - @sm  (>= 480px / 30rem):  Expanded mobile row with inline metadata pills │
│ - @md  (>= 768px / 48rem):  Reduced 4-5 column table                       │
│ - @lg  (>= 1024px / 64rem): Full multi-column comparison table             │
└────────────────────────────────────────────────────────────────────────────┘
```

### The 4 Canonical Responsive States

```mermaid
flowchart TD
    A[Container Width Available] --> B{Width Check}
    B -->|>= 1024px @lg| StateA[State A: Full Table\n7-10 Columns with Complete Metrics & Actions]
    B -->|768px - 1023px @md| StateB[State B: Reduced Table\n4-5 Core Columns: Identity, State, Value, Actions]
    B -->|< 768px| StateC[State C: Two-Line Structured Row\nLine 1: Identity + Value | Line 2: State + Secondary]
    StateC -->|User Taps Row| StateD[State D: Expanded Record\nInline disclosure of secondary fields & quick action buttons]
```

#### State A: Full Table (`@lg` / >= 1024px)
```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ ] Title         | Organizer   | Date        | Visibility | Status    | Tickets | Revenue | ... │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ] Tech Summit   | Dev Club    | Nov 14 2026 | Public     | Published | 245     | $14,250 | [•] │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### State B: Reduced Table (`@md` / 768px – 1023px)
```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ [ ] Title                       | Status    | Tickets | Revenue   | Actions                 │
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ [ ] Tech Summit                 | Published | 245     | $14,250   | [Actions ▾]             │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### State C: Two-Line Structured Row (`< @md` / < 768px)
```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Tech Summit 2026                                                                  $14,250.00│
│ [PUBLISHED] · Nov 14 · 245 tickets                                                         ›│
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

#### State D: Expanded Mobile Record (Active Tap / Disclosure)
```text
┌─────────────────────────────────────────────────────────────────────────────────────────────┐
│ Tech Summit 2026                                                                  $14,250.00│
│ [PUBLISHED] · Nov 14 · 245 tickets                                                         ⌵│
├─────────────────────────────────────────────────────────────────────────────────────────────┤
│ Organizer: Dev Club Côte d'Ivoire          Visibility: Public                              │
│ Venue: Palais de la Culture, Treichville   Created: Oct 01, 2026                           │
│ ─────────────────────────────────────────────────────────────────────────────────────────── │
│ [📷 Scan Tickets]   [Check-Ins]   [Edit Event]   [Row Actions ▾]                            │
└─────────────────────────────────────────────────────────────────────────────────────────────┘
```

---

## 9. Entity Field Priority Matrix

| Entity Type | Priority 1: Identity | Priority 2: Primary Value | Priority 3: State | Priority 4: Secondary Context | Priority 5: Low-Frequency / Expanded Details |
|---|---|---|---|---|---|
| **Events** (`dashboard/events`, `admin/events`) | Event Title (`title`) | Tickets Sold (`ticket_count`) / Revenue (`revenue`) | Status (`status`: draft, published, rejected) | Event Date (`event_date`), Venue/City (`venue`, `city`), Visibility (`visibility`) | Internal UUID, Organizer Name, Category/Subcategory, Featured Flag, Created Timestamp |
| **Fundraisers** (`dashboard/fundraisers`, `admin/fundraisers`) | Campaign Title (`title`) | Amount Raised (`raised`) / % Progress (`progress`) | Review Status / Campaign Status (`status`) | Goal Amount (`goal`), Donor Count (`donor_count`), Category (`category`) | Beneficiary Name, Organizer, Created At, Featured Flag, Slug, Updates Count |
| **Products** (`dashboard/products`, `admin/products`) | Product Name (`name`) + Thumbnail | Price (`price`) / Total Revenue (`revenue`) | Status (`status`: active, draft, out_of_stock) | Product Type (Digital/Physical), Price Type (One-time/Sub), Units Sold (`orders`) | Asset Files Count, Stock Quantity, SKU, Owner Email, Description, Created At |
| **Businesses** (`dashboard/businesses`, `admin/businesses`) | Business Name (`name`) | Listing Tier (`listing_tier`) / View Count | Status (`status`: pending, active, rejected) | Category (`category`), City/Location (`city`), Owner Name (`owner_name`) | Rejection Reason, Flagged Status, Featured Flag, Phone/Email, Address, Created At |
| **Attendees & Tickets** (`dashboard/attendees`, `events/[id]/guests`) | Attendee / Guest Name (`attendee_name`, `guest_name`) | Amount Paid (`paid`) / Ticket Quantity (`quantity`) | Ticket Status (`valid`, `used`, `cancelled`) | Event Title (`event_title`), Seat Label (`seat_label`), Email (`email`) | Check-in Timestamp, Scanned By Staff, Order ID, Ticket Code, Invitation Sent Date |
| **Door Check-Ins** (`events/[id]/checkins`) | Guest Name (`buyer_name`) | Quantity (`quantity`) / Seat (`seat_label`) | Scan Sync Status (`canonical`, `offline_sync`) | Checked In Time (`checked_in_at`), Scanner Staff (`scanned_by_name`) | Delegated Authority, Conflict ID, Device ID, Ticket Instance UUID |
| **Payouts & Ledger** (`dashboard/settings/payments`, `admin/finance/payouts`) | Payout ID (`id`) / Recipient Name (`recipientName`) | Payout Amount (`amount` + `currency`) | Payout Status (`requested`, `processing`, `completed`, `failed`) | Destination Type (`bank_account`, `crypto`), Request Date (`createdAt`) | Destination Reference, External Payout ID, Failure Reason, Authorized Staff Email |
| **Donations** (`dashboard/donations`, `admin/payments`) | Donor Name (`donor_name` / `donor_email`) | Donation Amount (`amount`) | Payment Status (`succeeded`, `completed`, `failed`) | Campaign Title (`campaign_title`), Date (`created_at`) | Donor Email, Anonymous Flag, Payment Method, Stripe Session ID, Receipt ID |
| **Organizations** (`dashboard/organizers`, `admin/organizers`) | Org Name (`name`) + Logo | Total Revenue (`revenue`) / Follower Count (`followers`) | Verification Status (`verified`, `pending`) | Events Count (`event_count`), Role (`user_role`) | Bank Payout Status, Contact Email, Slug, Created Date, Entity Members Count |
| **Users / Admins** (`admin/users`) | Full Name (`full_name`) + `@username` | Events / Campaigns Count | User Status (`active`, `suspended`) | User Role (`admin`, `organizer`, `user`), Email (`email`) | Joined Date, Verified ID Status, Identity Docs, Last Active Timestamp |
| **Articles / CMS** (`admin/articles`, `dashboard/articles`) | Article Title (`title`) | Read Count / Word Count | Editorial Status (`draft`, `pending_review`, `published`) | Author Name (`author_name`), Categories (`categories`) | Slug, Rejection Reason, Audio TTS Status, Created/Published Timestamps |
| **AI Guard Logs** (`admin/ai/rejections`) | Context / Scope (`context`) + Model | Verdict (`rejected`, `flagged`) | Moderation Status | Category (`category`), Timestamp (`created_at`) | Offending Excerpt, Rule ID, Content Type, Source ID, Full Audit Payload |

---

## 10. Audit of Existing Codebase Tables

The Aldriva repository currently contains 15 primary operational table implementations:

| Route | Component | Entity | Current Desktop Presentation | Current Mobile Presentation | Column Count | Current UX Failure | Recommended Phase 2 Transformation |
|---|---|---|---|---|---|---|---|
| `app/dashboard/events/page.tsx` | `EventsClient.tsx` | Events | 8 columns in `overflow-x-auto min-w-[960px]` | Horizontal swipe forced | 8 | Important actions and revenue hidden offscreen on mobile | Container query: `@lg` 8 cols -> `@md` 5 cols -> `< @md` Two-Line Structured Row with Quick Drawer |
| `app/dashboard/fundraisers/page.tsx` | `FundraisersClient.tsx` | Fundraisers | 8 columns in `overflow-x-auto min-w-[900px]` | Clunky toggle between full table & bloated cards | 8 | Grid cards are too tall and break comparison; table requires horizontal swipe | Replace manual toggle with single unified ResponsiveDataList; Two-Line row on mobile |
| `app/dashboard/products/page.tsx` | Server Page + `ProductRowActions` | Products | 8 columns in `overflow-x-auto` | Horizontal swipe forced | 8 | Price and stock columns misaligned on phone; actions offscreen | Two-Line row with Product name + price/sales top line, type + status + stock bottom line |
| `app/dashboard/attendees/page.tsx` | `AttendeesClient.tsx` | Attendees | 8 columns in `overflow-x-auto min-w-[900px]` | Horizontal swipe forced | 8 | Attendee email and quantity truncated or offscreen | Two-Line row: Name + Paid top line; Status + Event + Qty bottom line |
| `app/dashboard/donations/page.tsx` | `DonationsClient.tsx` | Donations | 5 columns in `overflow-x-auto min-w-[760px]` | Horizontal swipe forced | 5 | Simple 5-column list requires horizontal scrolling | Two-Line row: Donor + Amount top line; Status + Campaign + Date bottom line |
| `app/dashboard/organizers/page.tsx` | `OrganizersClient.tsx` | Organizations | 8 columns in `overflow-x-auto min-w-[960px]` | Horizontal swipe forced | 8 | Follower and event counts require scrolling | Two-Line row: Org name + Revenue top line; Verified status + Events + Role bottom line |
| `app/dashboard/events/[id]/guests/page.tsx` | `GuestsClient.tsx` | VIP Guests | 6 columns in `overflow-x-auto` | Horizontal swipe forced | 6 | Check-in actions and seat badges offscreen | Two-Line row: Guest name + Seat label top line; Status + Contact bottom line with Quick Action button |
| `app/dashboard/events/[id]/checkins/page.tsx` | `CheckinsClient.tsx` | Door Check-ins | 5 columns in `overflow-x-auto min-w-[720px]` | Horizontal swipe forced | 5 | Scanner staff and offline badges clipped | Two-Line row: Guest name + Seat/Qty top line; Checked In time + Staff badge bottom line |
| `app/dashboard/settings/payments/page.tsx` | `PaymentsClient.tsx` | Payout Ledger | 5 columns in `overflow-x-auto` | Horizontal swipe forced | 5 | Payout status and failure reason clipped | Two-Line row: Destination + Amount top line; Status + Date + Ref bottom line |
| `app/admin/finance/payouts/page.tsx` | `PayoutsAdminClient.tsx` | Admin Payouts | 6 columns in `overflow-x-auto` | Horizontal swipe forced | 6 | Payout processing actions clipped | Two-Line row: Recipient + Amount top line; Status + Destination + Date bottom line |
| `app/admin/events/page.tsx` | Server/Client Admin Page | Admin Events | 7 columns in `overflow-x-auto min-w-[960px]` | Horizontal swipe forced | 7 | Approve/Reject buttons hidden horizontally | Reduced table `@md`, Two-Line row `< @md` with approval action strip in expanded disclosure |
| `app/admin/fundraisers/page.tsx` | Server/Client Admin Page | Admin Campaigns | 9 columns in `overflow-x-auto min-w-[860px]` | Horizontal swipe forced | 9 | Featured toggles and review actions offscreen | Two-Line row: Title + Raised top line; Status + Organizer + Progress bottom line |
| `app/admin/businesses/page.tsx` | `BusinessesClient.tsx` | Businesses | 8 columns in `overflow-x-auto min-w-[960px]` | Horizontal swipe forced | 8 | Moderation actions offscreen | Two-Line row: Business + Tier top line; Status + Owner + Flagged bottom line |
| `app/admin/products/page.tsx` | `ProductsClient.tsx` | Admin Products | 8 columns in `overflow-x-auto min-w-[1120px]` | Severe horizontal swipe forced | 8 | 1120px min-width creates massive horizontal drift on phones | Two-Line row with quick approval/rejection actions |
| `app/admin/users/page.tsx` | `UsersClient.tsx` | Admin Users | 10 columns in `overflow-x-auto min-w-[1040px]` | Severe horizontal swipe forced | 10 | 10 columns completely unreadable on phone screens | Two-Line row: Full name + Event count top line; Role + Status + Email bottom line |

---

## 11. Implementation Architecture Recommendation

To deliver this standard without duplicating logic or inventing redundant layers, Phase 2 will introduce a single composable primitive pair in `components/dashboard/`:

```text
components/dashboard/
├── ResponsiveDataTable.tsx       <-- Unified container-query responsive wrapper
├── ResponsiveDataRow.tsx         <-- Two-Line mobile structured row & desktop <tr> slot
├── DashboardTableCard.tsx        <-- Existing card container (extended with @container)
├── DashboardToolbar.tsx          <-- Existing toolbar (extended with mobile sort sheet)
└── RowActionsMenu.tsx            <-- Existing Radix action menu (reused across rows)
```

### Component Architecture & Composition Pattern

```tsx
<DashboardTableCard
  loading={loading}
  page={page}
  totalPages={totalPages}
  total={totalCount}
  onPageChange={setPage}
  isEmpty={rows.length === 0}
  empty={<DashboardEmptyState ... />}
>
  <ResponsiveDataTable
    columns={[
      { id: "title", label: "Title", priority: "primary" },
      { id: "date", label: "Date", hideBelow: "md" },
      { id: "status", label: "Status", priority: "state" },
      { id: "tickets", label: "Tickets", hideBelow: "lg" },
      { id: "revenue", label: "Revenue", priority: "value", align: "right" },
      { id: "actions", label: "Actions", align: "right" },
    ]}
  >
    {rows.map((row) => (
      <ResponsiveDataRow
        key={row.id}
        // Slot 1: Primary Identity
        identity={
          <button type="button" onClick={() => openDrawer(row.id)} className="font-bold text-zinc-900 hover:text-orange-600">
            {row.title}
          </button>
        }
        // Slot 2: Primary Value
        primaryValue={<span className="font-black text-emerald-700 tabular-nums">{formatAdminMoney(row.revenue)}</span>}
        // Slot 3: State Badge
        state={<StatusBadge status={row.status} />}
        // Slot 4: Secondary Metadata Strip
        secondary={
          <>
            <span>{formatAdminDate(row.event_date)}</span>
            <span>{row.venue}</span>
            <span>{row.ticket_count} tickets</span>
          </>
        }
        // Slot 5: Quick Actions
        actions={<RowActionsMenu items={getActionItems(row)} />}
        // Slot 6: Expanded Record Details (Optional)
        expandedDetails={<EventRowQuickDetails event={row} />}
      />
    ))}
  </ResponsiveDataTable>
</DashboardTableCard>
```

### Benefits of This Architecture
1. **Zero Dual Data Fetching**: Single data array maps to semantic desktop `<tr>` cells above `@md` and structured mobile rows below `@md`.
2. **Built on Tailwind v4 `@container`**: Automatically adapts whether placed in a full-width page, a narrow split view, or a dashboard tab.
3. **Preserves Existing Radix & Authorization**: `RowActionsMenu`, `DashboardDrawer`, and Server Actions remain 100% authoritative and unchanged.

---

## 12. Accessibility & Interaction Specifications

1. **Touch Targets**: All interactive elements (chevrons, action triggers, checkboxes, buttons) must meet the minimum 44x44px touch target boundary (via `p-2.5` or `min-h-[44px]`).
2. **Keyboard Navigation**:
   - Tab sequence moves through selectable checkboxes -> record titles -> action menus.
   - Expandable rows support `Enter` / `Space` to toggle disclosure with `aria-expanded="true|false"` and `aria-controls`.
3. **Screen Reader Semantics**:
   - When rendered as a desktop table: Uses semantic `<table>`, `<thead>`, `<tbody>`, `<th scope="col">`, `<tr>`, `<td>`.
   - When rendered as a mobile entity list: Uses `<ul role="list">` and `<li role="article">` or accessible disclosure primitives.
4. **Color & Contrast**:
   - Status badges must never rely on color alone; every badge includes readable text (`Published`, `Draft`, `Rejected`).
   - All text must achieve WCAG AA contrast ratio (4.5:1 for body text, 3:1 for large bold headers).

---

## 13. Phase 2 Implementation Order & Migration Strategy

Phase 2 will roll out the standard incrementally in 4 disciplined batches:

```text
┌────────────────────────────────────────────────────────────────────────────┐
│ BATCH 1: Primitives & Foundation                                           │
│ 1. Enhance `DashboardTableCard.tsx` with `@container` container class.     │
│ 2. Create `components/dashboard/ResponsiveDataTable.tsx` and               │
│    `ResponsiveDataRow.tsx`.                                                │
│ 3. Add unit test suite in `lib/dashboard/__tests__/responsive-data.test.cjs│
├────────────────────────────────────────────────────────────────────────────┤
│ BATCH 2: Core User Dashboard Screens                                       │
│ 4. `app/dashboard/events/EventsClient.tsx`                                 │
│ 5. `app/dashboard/fundraisers/FundraisersClient.tsx`                       │
│ 6. `app/dashboard/products/page.tsx`                                       │
│ 7. `app/dashboard/attendees/AttendeesClient.tsx`                           │
│ 8. `app/dashboard/donations/DonationsClient.tsx`                           │
├────────────────────────────────────────────────────────────────────────────┤
│ BATCH 3: Event Sub-Workspaces & Operations                                 │
│ 9.  `app/dashboard/events/[id]/guests/GuestsClient.tsx`                    │
│ 10. `app/dashboard/events/[id]/checkins/CheckinsClient.tsx`                │
│ 11. `app/dashboard/settings/payments/PaymentsClient.tsx`                   │
│ 12. `app/dashboard/organizers/OrganizersClient.tsx`                        │
├────────────────────────────────────────────────────────────────────────────┤
│ BATCH 4: Admin Moderation & Operations                                     │
│ 13. `app/admin/finance/payouts/PayoutsAdminClient.tsx`                     │
│ 14. `app/admin/events/page.tsx`                                            │
│ 15. `app/admin/fundraisers/page.tsx`                                       │
│ 16. `app/admin/businesses/BusinessesClient.tsx`                            │
│ 17. `app/admin/products/ProductsClient.tsx`                                │
│ 18. `app/admin/users/UsersClient.tsx`                                      │
│ 19. `app/admin/articles/ArticlesClient.tsx`                                │
│ 20. `app/admin/ai/rejections/page.tsx`                                     │
└────────────────────────────────────────────────────────────────────────────┘
```

---

## 14. Phase 1 Verification & Acceptance Criteria

- [x] Aldriva's existing responsive and table architecture has been audited.
- [x] Existing reusable table/list primitives identified (`DashboardTableCard`, `DashboardToolbar`, `RowActionsMenu`, `DashboardDrawer`).
- [x] Existing mobile implementations and shortcomings identified.
- [x] 15+ data-heavy screens inventoried with column analysis and priority mappings.
- [x] Mobile information hierarchy formally defined (Priority 1: Identity, Priority 2: Primary Value, Priority 3: State, Priority 4: Secondary Context, Priority 5: Low-Frequency Details).
- [x] The Two-Line Mobile Structured Row pattern documented with concrete entity examples.
- [x] Horizontal scrolling explicitly designated as a deliberate exception, not default behavior.
- [x] Arbitrary card proliferation explicitly rejected.
- [x] Container-query strategy documented using Tailwind v4 `@container`.
- [x] Expanded-row and quick drawer interaction models defined.
- [x] Sorting and filtering separation from column headers documented.
- [x] Numeric and currency alignment standard documented with `tabular-nums`.
- [x] Accessibility requirements documented for touch targets, keyboard, and screen readers.
- [x] Entity-specific field priority matrix established for all Aldriva domains.
- [x] Zero changes made to database schemas, authorization gates, tenant isolation, or business logic.
- [x] Phase 2 migration plan and implementation order established.
- [x] No premature mass UI refactoring performed in Phase 1.
