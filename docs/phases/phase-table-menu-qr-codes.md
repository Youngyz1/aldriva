# Table & Menu QR Codes (Phases 5–6)

> **STATUS: PHASES 1, 2, 3, AND 4 IMPLEMENTED AND VERIFIED (2026-10-28).**
> - **Phase 1 (Database Foundation):** Migration 198 reconciled byte-identical (`db/migration_198_table_and_menu_qr_codes.sql` & `supabase/migrations/20261027180000_migration_198_table_and_menu_qr_codes.sql`), token hashing, active session constraints, security-definer RPCs.
> - **Phase 2 (Merchant Management & Staff Workflow):** `/q/[code]` redirect route, merchant table & QR manager (`app/dashboard/org/[id]/tables`), waiter confirmation/decline actions (`lib/actions/orders.ts`), dashboard OrderCard waiter controls with pending pulse badge and `payAtTable` badge.
> - **Phase 3 (Public Routing & Customer Journey):** Direct routing to published `/menu` or homepage storefront with table context; graceful error screens for unpublished sites, deleted/inactive tables, and disabled modes; customer confirmation modal with table badge; customer order tracking page (`/site/[slug]/orders/[token]`) with dine-in stepper and table info; server-side payment bypass protection (`pay_online_first` enforces card payment upfront).
> - **Phase 4 (Running Table Bill & Session Closure):** One authoritative running bill per table session (`lib/table-bill.ts`), aggregating multiple orders, line items, chosen options, item quantities, and financial totals (total, paid online, unpaid balance); excludes cancelled and declined orders; customer-facing "View Bill" modal and "Request Bill from Waiter" action (`requestTableBill`) with staff notification dispatch; merchant dashboard active table "Bill Requested" status and "Settle Bill" modal (`StaffTableBillModal`) with one-click "Mark Paid & Release Table" action (`markTablePaidAndCloseSession`); safe table session closure releasing `table_id` partial unique index for immediate next-party seating; split bills explicitly excluded.
> - **Test Suite:** 2,846 passed across 235 test files (0 regressions; 3 pre-existing unrelated failures preserved); 24/24 dedicated unit tests passed (6 `table-bill` + 18 `table-qr`); TypeScript (`tsconfig.build.json`) and ESLint 0 errors.
> Cross-references: `docs/phases/phase-05-products-services.md` (menu catalogue), `docs/phases/phase-06-commerce.md` (orders + kitchen flow), `docs/phases/phase-kitchen-delivery.md` (kitchen/delivery workstream, migration 185 — read before writing SQL), `docs/phases/phase-12-advanced-web.md` (custom domains).

## Regression verification update — 2026-10-28

- The live order schema contains `dine_in_confirmation`; the tracking page previously selected nonexistent `waiter_confirmation_state` and `waiter_confirmed_at` columns and then repeated them in its fallback, causing the observed `notFound()` result. The query now uses the schema field and the fallback uses only baseline columns.
- A synthetic normal-site staging delivery rendered its tracking page and item list after reload. It remained pending; no kitchen action was available from the anonymous browser session.
- The active QR code exercised in staging was a table QR and redirected to the published menu with the expected table context. The project had four active table codes and zero active menu-only codes, so a separate menu-QR order could not be submitted. The table-QR business requires online payment before preparation; no payment was initiated.
- No database migration or settings change was made. See `docs/CURRENT-STATE.md` for checks and remaining verification limits.

## Payment-state follow-up — 2026-10-29

- When online payment is unavailable, table checkout hides the card action and directs guests to ask staff to take the order and settle at the table. Payment-intent failures identify unsupported currency with `online_payment_unsupported_currency`; the settings UI warns when Pay Online First is unavailable.
- The customer tracking page derives its label from server-loaded `payment_method`, `payment_status`, and `payment_expires_at`. It reports Paid only for the authoritative `paid` status; online unpaid orders show awaiting payment or retry after expiry, and refunded orders remain distinct. English and French labels are present.
- Table running bills aggregate paid and outstanding totals from the same order payment status. Staff table settlement refuses to close while an online order remains unpaid; online orders already paid, or cancelled orders, do not block closure.
- Staff settlement requires the atomic `mark_table_paid_and_close_session(uuid, uuid, text, uuid)` RPC from migration 199. The migration register has its staging application status as unknown; verify the function exists before relying on the settlement action.
- Online card payment is USD-only. FCFA businesses can display XOF/XAF amounts, but cannot complete a table order in `pay_online_first`; choose a mode that permits payment at the table until a supported online currency is available.
- Focused local regression tests passed. No migration or staging data was changed.

## 0. Original plan-time codebase audit (2026-10-20)

All claims here are about **existing code** and are labelled.

- **Events QR system exists and is reusable.** `docs/technical/events/qr-system.md` describes the ticket QR flow; the `qrcode` npm package (`package.json:67`, types at `:49`) and `components/cards/ExpandableQr.tsx` (uses `QRCode.toString(...)`, line 117; `canvas.toDataURL("image/png")`, line 195) are the existing QR render/export code. (VERIFIED — files read.)
- **No business table or menu QR exists today.** (VERIFIED NOT FOUND — case-insensitive search for `table_qr`, `menu_qr`, `business…qr_code`, `table_session`, `table_label`, `order_type` across `app/`, `components/`, `lib/`, `db/` returns no matches.)
- **No `/q/<code>` short redirect route exists.** (VERIFIED NOT FOUND — `app/q/` does not exist.)
- **`dine_in` exists only as a marketing offering label**, not as an order type: `lib/business-offerings.ts:21` (`{ key: "dine_in", labelKey: "dine_in", kind: "fact" }`), used by business-offering validation/tests and website templates. (VERIFIED — `lib/business-offerings.ts`, `lib/__tests__/business-offerings.test.cjs`.) It is **not** a dine-in order type or table concept.
- **The kitchen/delivery workstream (migration 185) has not yet been checked for a dine-in type, table fields or confirmation states.** It is uncommitted; this doc's author did **not** open those files for this feature (per instruction). This is the mandatory first build step (§8). (NOT FOUND — not yet examined for this purpose.)

## 1. What the feature is

Restaurants put a printed QR code on their tables (and one for the menu point-of-entry). A customer scans it with their phone, sees the menu, orders, and the order flows into the restaurant's kitchen. Each table's code is stable — it points at a short redirect so the printed paper never goes dead if the site address or a custom domain changes.

## 2. Two kinds of QR

1. **Menu QR — per business.** Opens the business's menu (and, by ordering mode, either just the menu or the ordering flow). One per business.
2. **Table QR — per table.** Opens the menu scoped to that table, carrying that table's secret token so the order is attributed to the right table session.

Both are **printed codes pointing at a stable short redirect route `/q/<code>`** so they survive site-address or **custom-domain** changes (see Phase 12, `docs/phases/phase-12-advanced-web.md`). The redirect resolves `<code>` → the current live menu/table URL server-side; the printed code never contains the mutable destination. (PLANNED.)

**Approach:** reuse the events QR pattern and library (`docs/technical/events/qr-system.md`) rather than building a new QR renderer. **Verified by search that no business table/menu QR exists today** (§0). (VERIFIED — reuse target exists; feature itself NOT FOUND.)

## 3. Ordering modes (per business)

Exactly one mode per business (PLANNED):

| Mode | Behaviour |
|---|---|
| **Menu only** | QR shows the menu; no ordering (browse / call-a-waiter style). |
| **Order now & pay later** | **DEFAULT.** Customer orders from the table; pays at the end (cash or online via the running bill). |
| **Pay online first** | Customer must pay online before the order is fired to the kitchen. |

## 4. Three separate order types (dine-in / pickup / delivery)

(PLANNED.)

- **Dine-in** — the only type that carries a **table label**, a **table session**, and a **confirmation state**.
- **Pickup** and **Delivery** — **never show a table and never need table confirmation**. They use the **existing owner flow**: accept → preparing → ready → out for delivery → completed (`db/migration_175_owner_managed_delivery.sql` statuses; see `docs/phases/phase-06-commerce.md`). (Existing flow VERIFIED as the delivery/pickup path; the dine-in split is PLANNED.)

## 5. Dine-in confirmation is MANDATORY

(PLANNED.)

1. The **first** order from a table session is created as **"pending staff confirmation"** and does **not** reach the kitchen yet.
2. It goes to the kitchen only after a **waiter confirms** it.
3. **Later orders in an already-confirmed session are accepted automatically.**
4. Staff **can decline** an order.
5. The kitchen view has a dedicated **"needs confirmation" lane**.
6. The **table label shows only on dine-in tickets and dine-in notifications** — pickup/delivery tickets and notifications never carry a table.

## 6. Anti-fake-table design

(PLANNED.) A QR printed on paper can be photographed and used from anywhere, so the design assumes abuse:

- Each table has a **secret random token inside its QR** — **never a plain table number in the URL**.
- The **server validates the token against the business's own table list** (a token from business A can never open a session at business B).
- A **table session is tied to the browser** (session cookie), so a photographed code cannot be replayed from a different device as a different party.
- The **owner can regenerate a table's token** (invalidating old printed codes for that table).
- **Caps on unconfirmed orders per table and per session**, plus **rate limits on the order route**, bound damage from a leaked code.
- **Optional customer name or phone** (never required).
- **Optional reservation name** may be shown beside the table but is **never used as a gate**.

## 7. Running table bill (IN SCOPE for v1)

(PLANNED.)

- **One bill per table session**, itemised: quantity, item, options, price, with a **running total**.
- Visible to the **customer on their phone** and to **staff**.
- Customers may **pay online or in cash**.
- **Staff "mark table paid" closes the session.**
- A **"request bill" action notifies staff**.

### 7.1 Split bills — OUT OF SCOPE for v1

Splitting a bill so each person pays only for their own items is **not** in the first version. Recorded as a **later enhancement**. (PLANNED — explicitly deferred.)

## 8. Dashboard "QR codes" page (PLANNED)

A dashboard page (owner-facing) that lets the business:

- **define tables** (label + position/order, e.g. "Table 1"…);
- **generate** codes;
- **download PNG/SVG for one table**;
- **print a PDF sheet of all tables** showing the **business name, logo and table label**;
- **regenerate** a table's code (invalidates prior codes for that table).

## 9. Dependencies, open checks and migration numbering

- **Read the kitchen/delivery workstream first (mandatory).** Before writing any migration, read **migration 185** (`db/migration_185_kitchen_worker_access.sql`, uncommitted) and the kitchen files (`lib/kitchen/*`, `lib/actions/kitchen-management.ts`, `app/api/kitchen/*`) to find out **whether a dine-in order type, table fields, or order confirmation states already exist**. Only then design the new migration to avoid collisions with that work. (NOT YET DONE — this is the first build step.)
- **Migration number is assigned at build time from the register** (`docs/HANDOFF.md` §6 / `docs/DATABASE.md` §5). Do **not** invent a number now. Record it in the register when taken.
- **Migration 185's owner is the other (kitchen/delivery) agent.** Do not touch migration 185 or their branch.
- **Phase dependency:** depends on the order model (Phases 5–6) and the kitchen flow; the `/q/<code>` redirect interacts with Phase 12 (custom domains).

## 10. Owner to confirm

1. **Where does the staff confirmation screen live** — the existing owner dashboard (`app/dashboard/org/[id]/orders`), or the **lightweight kitchen/driver dashboard** from the kitchen workstream?
2. **How does a table session expire** — on "mark paid", on inactivity timeout, on a fixed duration, or on staff action (or a combination)?
3. **What happens to unpaid sessions at closing** — auto-close, flag for follow-up, or block the next session on that table until cleared?

## 11. Proposed first task

Author the design spike **without writing SQL yet**: read migration 185 + kitchen files and produce a short "what already exists / what is missing" note (dine-in type? table fields? confirmation states?), then draft the migration shape (business tables, table tokens, table sessions, order type + confirmation state, running-bill line items) for owner review. Number and file are assigned from the register at that point. (PLANNED — nothing built.)

---

*Spec authored 2026-10-20 from the owner's decisions. Not built. Evidence for the "current state" section is in §0; every feature statement is PLANNED. Maintainer: documentation agents.*
