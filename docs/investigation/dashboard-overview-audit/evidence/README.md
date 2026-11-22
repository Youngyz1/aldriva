# Evidence Folder — Index & Method

This folder documents how every claim in `../` was produced. Nothing here is a source change.
No database was queried and no personal data was collected.

## Method constraints (verified)

| Constraint | Result | How verified |
|---|---|---|
| Read-only | Only `docs/investigation/dashboard-overview-audit/**` was created. No other file touched. | tool history; `git status` shows this folder as the only new path from this audit |
| Live DB / SELECT-only | **No connection available.** `.vscode/mcp.json` contains only a placeholder Unsplash MCP server (`UNSPLASH_ACCESS_KEY: "PASTE_YOUR_ACCESS_KEY_HERE"`). No DB URL is readable (env files are excluded from search by policy). | `.vscode/mcp.json` |
| Schema evidence substitute | `prod_schema.sql` (757 KB, 2026-10-30), `staging_schema.sql` (975 KB, same date), `db/migration_*.sql` | file listing |
| Browser / Playwright | **Not installed** (`ls node_modules/.bin` → no `playwright`; `package.json` has no e2e script) and no staging URL in `.env.example`/`.env.local.example` | `ls`, `grep` |
| Screenshots | **Not produced** — no browser harness. No placeholder images were created. | — |
| Secrets / PII | None read or printed. No emails/phones appear in any report. | review of generated files |

## Files in this folder

| File | Contents |
|---|---|
| `git-state.txt` | branch, `git status --short`, last 10 commits (verbatim) |
| `schema-tables.txt` | table names present in `staging_schema.sql`; the absence of `expenses`, `refunds`, `bookings`, `vehicles`, `inventory_items`, `customers` |
| `orders-reservations-ddl.txt` | extracted DDL, indexes and RLS policy names for `orders` and `reservations` |
| `safe-area-usage.txt` | all 27 `env(safe-area-inset-bottom)` usages, and the proof that `viewportFit` is never set |
| `nav-label-arrays.txt` | the exact nav label arrays asserted by `lib/__tests__/org-dashboard-modules.test.cjs` (they constrain any redesign) |
| `i18n-organizer-keys.txt` | `Organizer` and `Dashboard` key sets in `messages/en.json` and `messages/fr.json` |
| `unused-mobile-nav-proof.txt` | the `grep` showing `DashboardMobileNav` / `OrgMobileNav` are imported by nothing |

## Commands used (all read-only)

```
git rev-parse --abbrev-ref HEAD
git status --short
git log --oneline -10
find app/dashboard -maxdepth 3 -type d
find "app/dashboard/org/[id]" -name page.tsx | wc -l
grep -n "CREATE TABLE public.<table>" prod_schema.sql
grep -rln "expenses" db/ lib/ app/            # → no matches
awk '/CREATE TABLE public.orders \(/,/^\);/' prod_schema.sql   # → not in dump; used db/migration_171
sed -n '20,140p' db/migration_171_orders.sql
sed -n '30,120p' db/migration_176_reservations.sql
grep -rn "env(safe-area-inset" --include=*.tsx app components
grep -rn "viewportFit" --include=*.ts* . --exclude-dir=node_modules --exclude-dir=.kilo  # → no matches
grep -rn "DashboardMobileNav\|OrgMobileNav" --include=*.tsx app components
grep -n "recharts\|chart.js\|visx\|nivo" package.json components/fundraisers/*.tsx
ls node_modules/.bin | grep -i playwright
python -c "json load messages/en.json, messages/fr.json; print Organizer/Dashboard keys"
```

## Known gaps in this evidence (carry into Stage 2)

1. **No live catalog.** Whether migrations 174 (composite orders index), 185/186/200s are applied is
   **owner-reported only** (AGENTS.md). `orders.status` may have been widened after migration 171 — the
   `out_for_delivery` / `delivered` badges cannot be validated offline (BUG-11).
2. **No rendered layout.** Chrome heights in `07` are Tailwind-class arithmetic, not measurements.
3. **No `businesses.offerings` column type.** It is read as an array in two places but the DDL was not located;
   text[] vs jsonb is **UNKNOWN**.
4. **No dark-mode screenshot.** The conclusion in `04` is from `app/globals.css:490-520` + absence of `dark:`
   variants, not from rendering.
5. **Fundraiser analytics component internals** (`FundraiserAnalytics.client.tsx`, `FundraiserHeaderActions.client.tsx`,
   `components/ui/ProgressRing.tsx`) were not read — marked UNKNOWN in `04`.
