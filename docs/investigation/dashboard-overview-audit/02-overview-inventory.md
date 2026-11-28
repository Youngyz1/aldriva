# 02 — Overview Pages Inventory

Every organizer/business dashboard overview, its route, file, components, data sources, metrics, actions, and
the defects visible on the surface. Nothing here is fixed.

## B0. Route map (dashboard area)

```
app/dashboard/                                  → personal "My Things" (getMyThingsData)
app/dashboard/org/[id]/overview                 → CANONICAL organizer/business overview
app/dashboard/org/[id]/{website,events,fundraisers,products,services,menu,promotions,
                        orders,reservations,tables,kitchen,reviews,analytics,settings,blog,
                        gallery,volunteers,verify}
app/dashboard/events/[id]/overview              → event overview (79 lines)
app/dashboard/fundraisers/[id]/overview         → fundraiser overview (470 lines, quality reference)
app/dashboard/businesses/[id]/overview          → redirect to org, or unlinked-business stub
app/dashboard/organizations/[slug]/overview     → redirect to /dashboard/org/[id]/overview
```
**CONFIRMED** from `find app/dashboard`, `find app/dashboard/org/[id]`, page line counts.

Line counts of the org workspace pages (from `wc -l`):
`overview 518`, `settings 590`, `orders 218`, `reservations 215`, `website/builder 155`, `tables 100`,
`fundraisers 98`, `products 97`, `events 96`, `promotions 78`, `blog 74`, `website/new 64`, `reviews 61`,
`verify 60`, `website 48`, `services 45`, `services/[id] 44`, `menu 37`, `analytics 32`, `kitchen 32`,
`services/new 23`, `gallery 10`, `volunteers 10`, `page 11`. **CONFIRMED**

---

## B1. Organizer overview — `app/dashboard/org/[id]/overview/page.tsx`

**Shell:** `OrgOverviewClient` → `OverviewShell` (`components/dashboard/overview/`). 60s `router.refresh()`
auto-refresh + manual Refresh button (`OverviewShell.tsx:20-52`). **CONFIRMED**

**Data sources (server component, service-role client):**

| Query | Table / columns | Lines |
|---|---|---|
| org | `organizers(id,name,slug,follower_offset,events_offset,average_rating,review_count)` | `:62-75` |
| businesses | `businesses(id,name,slug,status,industry,category,business_type,offerings,logo,country)` | `:66-78` |
| websites | `tenant_websites(id,slug,status,published_at,metadata,template_id)` | `:67-79` |
| hours | `website_content.content`, `website_content_drafts.content` | `:96-118` |
| orders | `orders` ×3 (active, today, recent 5) | `:139-243` |
| reservations | `reservations` ×3 (pending count, today, any-row) | `:262-303` |
| catalog | `menu_items` count, `services` count | `:322-337` |
| events/fundraisers/follows/raised | `events`, `fundraisers`, `organizer_follows` | `:339-390` |
| ticket sales | `ticket_orders.quantity` for latest 5 events | `:378-390` |

**Modules rendered (in order):**

1. `attention_strip` — pending orders, overdue orders, pending table requests, approval pending/rejected/archived,
   unpublished website changes (`lib/overview-resolver.ts:141-219`). Rendered by `AttentionStrip.tsx`.
2. `setup_checklist` — 6 fixed items: logo, hours, ≥3 catalog items, offerings, publish, ordering & payments
   (`lib/overview-resolver.ts:226-291`). Collapsible, dismissible via `localStorage`
   (`SetupChecklist.tsx:23-44`).
3. `today_strip` — orders count, orders value, paid vs to-collect, open/closed hours, upcoming tables
   (`TodayStrip.tsx`).
4. `quick_actions` — Add dish / Add service / Edit website / View live site / Copy site link / New Event /
   New Fundraiser / New Invitation. **Which ones appear depends on capability and role**
   (`lib/overview-resolver.ts:322-402`).
5. `recent_orders` — last 5, columns order number, fulfilment type, first name, relative time, total, status chip
   (`RecentOrdersWidget.tsx:60-92`).
6. `events_metrics` — Events, Fundraisers, Followers, Total Raised, Tickets Sold, Avg Rating; gated per flag
   (`EventMetricsWidget.tsx:31-140`).
7. `recent_events` — last 5 events with Manage link (`EventMetricsWidget.tsx:141-166`).
8. `empty_state` — either "What would you like to create?" (isNone) or "Get Ready to Take Orders"
   (`OrgOverviewClient.tsx:100-142`).

**Defects on this surface (see `09` for severity):**
- Today strip appears for service/product/vehicle businesses with order-centric wording — CONFIRMED
  (`lib/overview-resolver.ts:132-140`).
- `isOpen` defaults to `true` with "Hours not configured" — CONFIRMED (`page.tsx:403-404`,
  `TodayStrip.tsx:90`).
- `reservationsToday` is rendered as "Upcoming tables today" for **any** business where the reservations module is
  visible, including `booking_type='appointment'` and `'rental'` rows. CONFIRMED
  (`TodayStrip.tsx:112`, `lib/overview-resolver.ts:293-315`).
- Raw enum values shown to users: `RecentOrdersWidget.tsx:70` prints `order.fulfilmentType`
  (`pickup`/`delivery`), `:88` prints `order.status` (`pending`, `out_for_delivery`, …).
  Resolver attention copy is sentence-cased, but the chips are not. CONFIRMED.
- Events & Community / metrics title says "Events & Community" while the card set is per-flag. Cosmetic mismatch.
  CONFIRMED (`lib/overview-resolver.ts:467`).
- `OverviewShell` accepts no period selector; every metric is either "today" or lifetime. CONFIRMED
  (`OverviewShell.tsx:36-52`; there is no date control anywhere in the widget tree).

---

## B2. Event overview — `app/dashboard/events/[id]/overview/page.tsx` (79 lines)

**Shell:** `ManagementShell` with tabs from `lib/event-dashboard-navigation.ts` — Overview, Operations,
Check-Ins & Roster, Door Scanner, Guests & Invites, Memories, Ticket Design, Invitation Page, Seating,
Team & Staff, Edit Details (role-filtered). Mobile = hamburger drawer + `EventSwitcher`
(`app/dashboard/events/[id]/layout.tsx:47-139`). **CONFIRMED**

**Modules / metrics:**
1. Header: `event.title`, `city`, `event_date`, **`event.status` raw** (`:31`).
2. Three stat cards: Guests (`guests` count), Tickets (`tickets` count), Scan (static text + button) (`:35-39`).
3. Quick actions: Team, Seating, Operations (`:44-50`).
4. Invitation page section (invitation-kind events only): Preview / Builder, Guests & RSVPs (`:55-70`).
5. Public/private page link (`:71-83`).

**No** period selector, revenue, ticket value, check-in rate, guest RSVP breakdown, or "needs attention".
**CONFIRMED** (whole file read).

**Duplication — what actually happens.** The claim "Scan and Quick actions render twice" is **partly CONFIRMED
and partly not**:
- The page renders **one** Scan card and **one** Quick actions section. They are not literally repeated in the
  same file. **CONFIRMED** (`:35-50`).
- The destinations *are* duplicated: the Scan card links to the same `…/scan` route as the persistent
  "Door Scanner" tab (`lib/event-dashboard-navigation.ts:49-55`), and two of the three quick actions
  (Seating, Team) are also persistent tabs (`:59-64`, `:100-115`). On desktop the user sees the same actions in
  the sidebar and in the page body; on mobile the drawer repeats them again. **CONFIRMED** as
  "same action on nav + page", **INFERRED** as the source of the double-render impression.
- A second Scan duplication exists one level up: the personal dashboard's event rows render Check-Ins / Scan /
  Team chips per event (`app/dashboard/DashboardView.tsx:238-260`). **CONFIRMED**

---

## B3. Fundraiser overview — `app/dashboard/fundraisers/[id]/overview/page.tsx` (470 lines)

The stated quality reference.

**Data sources:** `fundraisers` (+ resilient column fallback, `:34-49`), `fundraisers.beneficiary` (`:52-58`),
`donations` via `getFundraiserDonationStats` (`:76`), `fundraiser_updates` (`:83-91`),
`organizer_follows` count (`:94-101`), `organizers.name` (`:63-67`).

**Modules:** header card (category chip, status badge, beneficiary chip, org name, title, raw `statusRaw`,
goal, progress bar, 4 mini-stats), Campaign Health (progress ring, health score, projected finish, current vs
required pace, recommended action banner), 4 primary KPI cards, 6 "More stats" cards (Goal, Remaining, Followers,
**Shares — Not tracked yet**, **Conversion Rate — Not tracked yet**, **Page Views — Not tracked yet**),
Quick Actions rail, Fundraising Insights, Analytics chart, Recent Donations, Recent Activity, Beneficiary card.
**CONFIRMED** (whole file read).

**Hardcoded / placeholder / contradictory elements:**
- `const daysRemaining = 30; // no end_date column — honest default` (`:120`). The UI then labels it
  **"Days Left 30 / days remaining"** (`:230-235`) and uses it in `dailyPaceRequired`. A campaign that started a
  week ago and one that started a year ago show the same "30 days left". CONFIRMED.
- Goal is formatted with a literal dollar sign while raised/avg use `formatMoney`
  (`:187` vs `:172`). For XOF/XAF this prints `$5,000,000` next to `FCFA 1,200,000`. CONFIRMED.
- `statusRaw` printed raw (`:187`) and `category` printed raw (`:185`). CONFIRMED.
- Health score formula has no upper-bound on pace and returns 100 whenever `dailyPaceRequired <= 0`
  (`lib/fundraiser-dashboard.ts:29-34`). CONFIRMED.
- `inferStatus` is called with `endDate = null` (`:124`), so it uses the 90-day model against a real
  `created_at`, not against an end date. CONFIRMED (`lib/fundraiser-dashboard.ts:19-27`).
- 3 of 6 "More stats" are `—` + "Not tracked yet" (`:349-367`). CONFIRMED.
- Quick actions contain **three disabled "Coming soon" buttons** (Email Donors, Invite Team, Boost Campaign)
  and two buttons that do the same thing (Share Campaign and Copy Link both copy the URL):
  `components/fundraisers/FundraiserQuickActions.client.tsx:76-105`. CONFIRMED.
- Layout uses a 3-column CSS grid with `lg:col-start-*` on children (`:379-460`), so on mobile everything
  linearises in DOM order: Quick Actions → Insights → Analytics → Recent Donations → Recent Activity →
  Beneficiary. Quick Actions therefore appears *before* the analytics on mobile, which is arguably right, but the
  visual order on desktop differs from DOM order — a keyboard/screen-reader mismatch. CONFIRMED (class names).
- Header has a `shadow-xs` button class (`:246`) despite the design rule "no default shadow on buttons".
  CONFIRMED (`:246`).

---

## B4. Business overview stubs

- `app/dashboard/businesses/[id]/overview/page.tsx:37-39` → `redirect('/dashboard/org/${organizer_id}/overview')`
  when linked. CONFIRMED.
- Unlinked fallback shows Products count, Orders link, Public link (`:45-78`). CONFIRMED.
- Sibling business pages are thin: `analytics/page.tsx` and `reviews/page.tsx` are **8-line placeholders**
  rendering `Business analytics for {id.slice(0,8)}` / `Reviews for business {id.slice(0,8)}`;
  `products/page.tsx` is a 13-line name list; `branches/page.tsx` is real (reads `business_branches`).
  CONFIRMED. **These are visible "coming soon"-class dead ends with no data and no empty state.**

---

## B5. Personal dashboard — `app/dashboard/page.tsx` → `MyThingsView`

Not in the "overview per category" scope, but it is the entry point and the mobile chrome owner.
`getDashboardContext` + `getMyThingsData` (`:1-16`). `DashboardView.tsx` is an older, separate overview with
stats (Events, Fundraisers, Tickets Sold, Revenue, Donations, Organization Profiles), 3 recent lists, 3 charts,
and quick-create actions; it hardcodes `USD` (`:99-101,105`). Status: is it still rendered? `app/dashboard/page.tsx`
renders `MyThingsView`, so `DashboardView` appears **unused**. **INFERRED** from the two files (no import of
`DashboardView` found in `app/dashboard/page.tsx`). CONFIRMED that `page.tsx` imports `MyThingsView`.

---

## B6. Gating logic placement — answer

| Decision | Where |
|---|---|
| Is this org an events / fundraiser / business org? | `lib/organizer-dashboard-classifier.ts` (central, row-based) |
| Which nav items exist? | `lib/org-dashboard-modules.ts` + `app/dashboard/org/[id]/org-nav-items.ts` (central) |
| Which business-shell items exist? | `lib/business-dashboard-modules.ts` (central, different rules) |
| Which overview widgets exist? | `lib/overview-resolver.ts` (central, different rules again) |
| Which actions are role-gated? | `lib/overview-resolver.ts:24-28`, per page `MANAGE_ROLES` arrays |
| Which dashboard shell renders (global vs entity)? | `app/dashboard/DashboardLayoutClient.tsx:36-44` (path-prefix regexes, client-side) |

So gating is **centralised but triplicated**, and the shell decision is **not** central at all — it is a
client-side `pathname` regex (`DashboardLayoutClient.tsx:37-41`). CONFIRMED.
