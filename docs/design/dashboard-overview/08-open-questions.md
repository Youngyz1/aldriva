# 08 — Open Questions (new only)

Audit `11-open-questions.md` already covers registry ownership, multi-business scoping (answered: explicit
selector + persisted default), bookings (answered: reservations), period semantics, dark mode and i18n. Below
are only questions that appeared **while writing this specification**, plus two environment findings.

---

## A. Resolved here: the event overview "two identical blocks"

**Answer: it is not a duplicate render, and it is not BUG-19.** There is no `EventOverviewClient` (the file does
not exist); the page is server-rendered once. The two blocks are two different things that share one visual
grammar:

1. A `Card` in a `sm:grid-cols-3` row (`app/dashboard/events/[id]/overview/page.tsx:34-37`). `Guests` and
   `Tickets` contain a number + a small `outline size="sm"` button; the third card, `Scan`, contains **no
   number** — only the sentence "Door scanner for this event" and the button "Open scanner". It is an action
   block sitting inside a KPI row.
2. Immediately below, a bordered section (`:40`, `border-t pt-5`) whose first child is "Quick actions" with
   three `outline size="sm"` buttons (`:42-48`).

At 360–414px the 3-column grid has collapsed, so the `Scan` card is the last card before the `Quick actions`
block; both are white, 1px-bordered, `rounded-xl`, same padding, same heading size, same 32px outline buttons,
separated only by 20px and a hairline. They read as the same component rendered twice. A third copy of the same
destinations lives in the `ManagementShell` drawer, built from `getEventSubNavTabs` (`scan`, `team`, `seating`,
`operations`).

Contributing cause: `Button size="sm"` is `h-8` = 32px (`components/ui/button.tsx:25`), so six action buttons
of identical weight appear in one viewport with no primary/secondary hierarchy.

Spec resolution (`01` §1.9, `03` §2.5): `Scan` stops being a KPI card; scanning is a **Live ops** destination
and a first-class quick action; `Quick actions` disappears from page chrome in favour of the Manage grid. The
overview keeps numbers only.

**If the screenshots show two literally identical button rows** (Team/Seating/Operations twice), then the
duplicate is the drawer's tab list rendered open behind the page, not a page-level duplicate — the drawer is
`MobileDrawer` mounted in `ManagementShell.tsx:65-73`. That would be a z-index/overlay issue, not content.
This distinction needs the screenshot to settle; the page source contains exactly one Quick actions block.

## B. Environment findings (must be resolved before PR 5)

**Q1. This worktree was not on the stated branch.** At session start it was
`chore/remove-all-invitation-templates` at `303ed15ed`; no `feat/dashboard-overview-redesign` branch existed.
It was created from that HEAD so the branch name matches the brief. Nothing was copied from another tree.

**Q2. The Bookings page is not in this worktree.** `app/dashboard/org/[id]/bookings` does not exist here; it
exists on `feat/fresh-home-redesign` (`git ls-tree -r --name-only feat/fresh-home-redesign`). The general
booking **action** and migrations 216/217/218 *are* here. Consequence: the spec is written against the action
and schema; PR 5 needs the page merged or re-implemented.

## C. Data-model questions

**Q3. Two service catalogs.** Bookings read `services` (`is_active`), while migration 216 adds
`reservation_service_catalog` (duration, buffer, price, currency) and **no app code references it**. Which is
the source of truth for what a customer can book?
*Decision (RESOLVED):* `services` is the canonical service catalog; recommend removing `reservation_service_catalog` from migration 216 before it is applied.

**Q4. One toggle, two products.** `isGeneralBookingsLive` uses `tenant_websites.metadata.reservations.enabled`
— the same flag that gates table reservations (`lib/storefront-features.ts:459-469`). Turning off table
reservations therefore also disables bookings.
*Decision (RESOLVED):* Keep the shared reservations flag for now.

**Rental track deferred:** Rental is deferred to a separate later track. `booking_type='rental'` has no confirmed writer in application code. Car/motorcycle/van rental and any rental business type use the generic fallback (03 §2.8) until then.

**Q6. Fundraiser goal currency.** `fundraisers.goal` has no currency column (audit `03`), while `donations`
records currency per row.
*Decision (RESOLVED):* Percent-of-goal is shown only in the campaign's primary currency.

**Q7. `end_date` semantics.** Migration 230 adds a nullable date.
*Decision (RESOLVED):* `fundraisers.end_date` is a display-only deadline: it never auto-closes donations or auto-completes a campaign.

**Q8. Event money columns.** `ticket_orders` exists, but its amount/currency columns were not verified
offline.
*Decision (RESOLVED):* `ticket_orders` has `total_amount`, `currency`, and `status`. Paid-equivalent statuses (`valid`, `used`) from DDL are counted toward revenue; unverified against live DB.

## D. Product/behaviour questions

**Q9. "See all" destination does not exist.** The attention card wants `See all N` → `/dashboard/org/{id}/attention`.
*Decision (RESOLVED):* "See all" expands the attention card in place; the `/attention` route is dropped (updated 01 §1.2 and 05).

**Q10. Attention dismissal.** There is no persistence table for "dismissed".
*Decision (RESOLVED):* No dismissal; rules stop firing when the condition clears.

**Q11. Multi-currency KPI.** `orders.currency` defaults to `USD` (`db/migration_171_orders.sql:40`) and can
vary per order.
*Decision (RESOLVED):* Largest-total currency plus "+N currencies".

**Q12. `businesses.offerings` (text[], migration 169) vs capabilities.** The registry keeps `anyOfOfferings`
as a legacy gate because nav currently uses it (`lib/org-dashboard-modules.ts:157-161`).
*Decision (RESOLVED):* Keep offerings and capabilities; add a test that flags businesses where they disagree.

**Q13. Live data without a websocket.** The overview refreshes every 60s (`OverviewShell.tsx:22-32`).
*Decision (RESOLVED):* 60s polling with a visible "Updated N min ago" label; do not call it realtime.

## E. Verification constraints

**Q14. No rendering harness.** `npx --no-install playwright --version` fails (not installed); there is no
authenticated dev server and no staging URL in the repo.
*Decision (RESOLVED):* Playwright may be run through npx, outside package.json, against localhost:3001.

**Q15. Live CHECK constraints.** The status map (PR 1) must be generated from the live constraints, and
migrations 185/186/215/216/220 application status is owner-reported only. Migration 216 is confirmed NOT applied on staging (live `reservations_status_check` has no `pending_hold`). Verified live values are documented in `07` PR 1 and `evidence/status-vocabularies.md`.
