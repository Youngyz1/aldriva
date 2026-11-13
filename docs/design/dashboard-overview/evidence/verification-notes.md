# Evidence — Stage 2 verification

All commands were read-only. The only files created by this stage are under `docs/design/dashboard-overview/`.
No source, config, or migration was modified. Migrations 215/216/220 were read in place and not copied.

## Environment at session start

```
pwd                                   C:/Users/Youngyz/aldriva-scanner-p0   (a linked worktree:
                                      gitdir: .../fundraising-app/.git/worktrees/aldriva-scanner-p0)
git rev-parse --abbrev-ref HEAD        chore/remove-all-invitation-templates
git rev-parse HEAD                     303ed15ed
git branch --list feat/dashboard-overview-redesign   → (empty)
```

The brief said this worktree was on `feat/dashboard-overview-redesign`. It was not. The branch was created from
`303ed15ed` (`git checkout -b feat/dashboard-overview-redesign`) so the work is on the expected branch; no file
from another worktree was copied or edited.

`app/dashboard/org/[id]/bookings` does **not** exist here. It exists on `feat/fresh-home-redesign`:

```
$ git ls-tree -r --name-only feat/fresh-home-redesign | grep "org/\[id\]/bookings"
app/dashboard/org/[id]/bookings/page.tsx
```

## Booking model (correction to the audit)

```
$ grep -rn "booking_type" db/*.sql | grep -v rollback
db/migration_176_reservations.sql:40: booking_type text NOT NULL DEFAULT 'table'
  CHECK (booking_type IN ('table', 'rental', 'appointment'))
db/migration_218_reservation_capacity_booking_type_filter.sql (skips covers check when <> 'table')
```

```
$ grep -n "from(\"reservations\")\|booking_type\|booking_details\|GBK-" lib/actions/general-booking.ts
from("reservations") ... .eq("booking_type","appointment")   (dashboard page, fresh-home branch)
insert({ booking_type: "appointment", party_size: 1, booking_details: {...}, status: "pending", ... })
reservationNumber = `GBK-${dateStamp}-${...}`  (dateStamp = ISO.slice(2,10) without dashes)
```

Migration 217 (committed in `b1e099621`) adds `reservations.booking_details jsonb NOT NULL DEFAULT '{}'`.
Migration 216 (untracked) adds `reservation_staff`, `reservation_resources`, `reservation_service_catalog`,
staff/resource schedules + exceptions, `reservation_deposits`, the `staff_id/resource_id/service_id/
hold_expires_at` columns, and `pending_hold` in the status CHECK.

`reservation_service_catalog` has **no** application references:

```
$ grep -rn "reservation_service_catalog" --include=*.ts --include=*.tsx lib app components
(no output)
```

The dashboard Bookings page instead reads `services` with `is_active = true`.

## Why the Bookings nav entry disappeared from the audit's view

In this worktree: `lib/org-dashboard-modules.ts:64` has `routeExists: false` for `bookings`, so it never renders.
On `feat/fresh-home-redesign` the same line is `routeExists: true` with icon `CalendarClock` and
`existence: "activeServiceRows"`. That is the whole difference — the flag, not a capability change.

## Playwright / measurements

```
$ npx --no-install playwright --version
'playwright' is not recognized ...
```

No browser automation is installed, no authenticated dev server is running, and no staging URL is in the repo.
Consequently: no screenshots, and every height/width figure in `01`/`06` is Tailwind-class arithmetic, labelled
as such. The event-overview diagnosis in `08` §A is from source, not from rendering.

## Other verified facts used in the spec

| Fact | Command / file |
|---|---|
| `Button size="sm"` = `h-8` (32px) | `components/ui/button.tsx:25` |
| Navbar 56/64px | `components/Navbar.tsx:116` |
| Sub-headers `sticky top-16` (8px gap) | `ManagementShell.tsx:57`, `OrgMobileHeader.tsx:43` |
| Double gutter | org layout `px-4 pt-6 … lg:pb-6` + `OverviewShell.tsx:52` `p-4 sm:p-6` |
| No `viewportFit`; `maximumScale: 1` | `app/layout.tsx:14-19`, `app/[locale]/layout.tsx:24-29` |
| `orders.currency` default USD | `db/migration_171_orders.sql:40` |
| Order status CHECK widened | `db/migration_175_owner_managed_delivery.sql:62-69`, `189:18-19` |
| Reservation statuses incl. `pending_hold` | `db/migration_216_reservation_booking_schema.sql` §9 |
| Health score max 65; 90-day status assumption; 30-day default | `lib/fundraiser-dashboard.ts:9-23,29-34` |
| Fundraiser local `StatusBadge`, `$` goal, constant 30 days | `app/dashboard/fundraisers/[id]/overview/page.tsx:22,120,187` |
| Event overview Scan card + Quick actions | `app/dashboard/events/[id]/overview/page.tsx:32-48` |
| `businesses.offerings` is `text[]` | `db/migration_169_business_offerings.sql:4` |
| `services.price` nullable | `db/migration_219_services_price_nullable.sql` |
| No `expenses` table | `grep -rl expenses db lib app` → 0 files |
