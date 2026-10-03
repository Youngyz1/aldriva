<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->

# Aldriva — Universal Agent Engineering Reference

> **For all AI agents: Claude Code, OpenAI Codex, Google Antigravity, OpenCode.**
> The repository is the single source of truth. Any agent must be able to resume work with ZERO access to previous conversations.

---

## Repo Facts (Verified, High-Signal)

- **Stack**: Next.js 16.3.4 (App Router, Turbopack), React 19.2.4, Supabase (Postgres + Auth + Storage), Stripe + NOWPayments crypto, Tailwind v4, TipTap editor, Resend email, Framer Motion v12.
- **Proxy**: Root `proxy.ts` (NOT `middleware.ts`) handles session refresh, protected-route redirects (`/dashboard/*`, `/admin`), account suspension blocks, and pre-stream status gates for articles/businesses/products (real 404s before streaming begins). See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- **Auth/RBAC**: Use `getCurrentUser()`, `getCurrentUserProfile()`, `isAdmin()`, `isOrganizer()`, `requireAuth()`, `requireAdmin()` from `lib/auth.ts` (all `React.cache()`-memoized). Client session: `lib/supabase.ts`; server: `lib/supabase-server.ts`; admin service-role: `lib/supabase-admin.ts` (bypasses RLS — admin ops only).
- **Tenant Model**: Tenant identity is rooted in `organizers.id`. Entity memberships and roles via `entity_members`; resolved in `lib/entity-auth.ts` / `lib/tenant-context.ts`.
- **Migrations**: `db/` is canonical (`migration_NNN_*.sql` + `_rollback` twin; never put rollbacks in `supabase/migrations/`). `supabase/migrations/` mirrors a subset. Latest migration: `migration_126`. Always check the latest number before drafting a new migration.
- **Storage**: Private `product-assets` bucket (200 MB, signed URLs ~120s) + public buckets (`event-banners`, `profile-images`, `cms-media`, `videos`). Entitlement checks: `lib/product-access.ts` + `lib/digital-products.ts`. Never trust client payment state.
- **Testing**: `npm test` runs `node --test` against an **explicit file list** in `package.json` (~38 test files, 304 tests). New `.test.cjs` files MUST be appended to that list or they silently never run.
- **Run order after changes**: `npx eslint <files>` → `npx tsc --noEmit` → `npm run build` → `npm test`.
- **Server components**: For pages that read `searchParams` + Supabase, prefer static shell → `<Suspense>` → data component. Don't add `export const dynamic` blindly.
- **Always read** `node_modules/next/dist/docs/` before writing Next.js routing/caching/streaming code.

---

## Mandatory Agent Startup Procedure

Every agent starting a session MUST execute in order:

1. **Read `AGENTS.md`** (this file) — non-negotiable rules.
2. **Read `docs/CURRENT-STATE.md`** — exact current development position and active blockers.
3. **Read `docs/ROADMAP.md`** — current phase and upcoming milestones.
4. **Read the relevant Phase Document** in `docs/phases/`.
5. **For UI/design work**: Read `docs/DESIGN-SYSTEM.md` and `.aldriva/design/principles.md`.
6. **Inspect actual code & migrations** — do NOT trust documentation blindly.
7. **State intended work and scope** before touching any file.
8. **Implement minimal, high-quality changes** — preserve existing functionality and tests.
9. **Test thoroughly**: `npx eslint <files>` → `npx tsc --noEmit` → `npm test`.
10. **Update repository documentation**: `docs/CURRENT-STATE.md`, active phase doc, `docs/CHANGELOG.md`, and `docs/DECISIONS.md` for architectural decisions.

---

## Core Non-Negotiable Rules

### A. Evidence Over Assumption
- Never claim something is complete without code/test evidence.
- Mark unverified work as `PARTIALLY COMPLETE` or `NEEDS VERIFICATION`.
- Never delete or rewrite working functionality merely because a new plan uses different terminology.

### B. Security & Tenant Isolation
- Tenant identity is rooted in `organizers.id`.
- AI models must never construct raw SQL against production tables. All AI tool executions go through server-side tools with hard-coded column allowlists (`SAFE_COLUMNS`) and output guard validation (`lib/ai/output-guard.ts`).
- Database tables must enforce Row Level Security. Never grant blanket public `INSERT`/`UPDATE`/`DELETE`. Authenticated roles must be verified via `profiles` / `entity_members`.

### C. Database Migrations
- `db/` is canonical (`migration_NNN_*.sql` + rollback twin).
- Mirror to `supabase/migrations/` with timestamped names. Never place rollbacks in `supabase/migrations/`.
- Always check latest migration number before drafting new ones. Never alter applied migrations.

### D. Testing & Quality
- `npm test` runs `node --test` against an explicit file list in `package.json`.
- Any new `.test.cjs` or `.test.ts` file **must** be appended to that list.
- Maintain 100% test pass rate.

### E. Design & UI Quality
- **Design system**: Follow `.aldriva/design/principles.md` and `docs/DESIGN-SYSTEM.md` for all UI work.
- **Design tokens**: Zinc neutral base + Orange accent. `--primary` = `--brand-700` (#c2410c). Full token list in `app/globals.css` and `docs/DESIGN-SYSTEM.md`.
- **Component radius**: `rounded-xl` (not `rounded-2xl`) is the standard for cards and buttons.
- **Shadows**: `shadow-xs` standard. No elevation stacking without purpose.
- **No gradients** on interactive elements (buttons are solid). No glassmorphism.
- **Existing UI is not automatically good UI.** See `.aldriva/design/legacy-ui.md`.
- **Component reuse**: Always check `components/ui/` → `components/dashboard/` → `components/` before creating a new component.
- **Visual review**: Implementation is not complete when TypeScript compiles. Open in browser. Test at 375px, 768px, 1024px, 1440px.

---

## Key Documentation References

| Document | Purpose |
|---|---|
| `docs/CURRENT-STATE.md` | What is built, what is in-progress, what is blocked |
| `docs/ROADMAP.md` | 14-phase platform roadmap |
| `docs/ARCHITECTURE.md` | Full technical architecture diagram |
| `docs/DECISIONS.md` | Architectural Decision Records (ADR-0001 through DEC-0012) |
| `docs/DESIGN-SYSTEM.md` | Aldriva design system reference |
| `docs/AI-AGENT-GUIDE.md` | How coding agents work in this repo |
| `docs/AI-MCP.md` | MCP tooling, configuration, agent compatibility |
| `.aldriva/design/` | Full design knowledge base |
| `.aldriva/workflows/` | Agent workflow guides |
| `.aldriva/architecture/agent-system.md` | Agent system architecture |
| `docs/phases/` | Per-phase execution plans |

---

## Agent-Specific Entry Points

| Agent | Primary Instructions |
|---|---|
| Claude Code | `CLAUDE.md` (references this file via `@AGENTS.md`) |
| Google Antigravity | This file + `.agents/skills/` (managed via `skills-lock.json`) |
| OpenAI Codex | This file |
| OpenCode | This file + `opencode.json` |
