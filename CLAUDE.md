# CLAUDE.md

This file provides guidance specific to Claude Code (claude.ai/code) when working with code in this repository.

> **Read `docs/HANDOFF.md` FIRST.** It is the start-here document: what Aldriva is, the status board for every phase and workstream, the execution order, and the exact next task. `docs/DATABASE.md` §5 holds the migration register (latest forward migration: **185**, uncommitted).

@AGENTS.md

---

## ⚠️ Non-Standard Next.js 16 — Read Vendored Docs Before Writing Code

This repository pins `next@16.3.4` (App Router, Turbopack, React 19.2.4).
Before touching routing, caching, streaming, or navigation code, consult the relevant guides in `node_modules/next/dist/docs/` rather than relying on training data.

Key conventions:
- **`proxy.ts` replaces `middleware.ts`**: Root-level proxy file is `proxy.ts`, exporting `proxy` (not `middleware`). See `node_modules/next/dist/docs/01-app/03-api-reference/03-file-conventions/proxy.md`.
- **Pre-stream status gating**: Dynamic content gating (/articles, /businesses, /products) happens in `proxy.ts` via lightweight Supabase REST calls to ensure genuine 404s before response streaming starts with 200.
- Check for inline `{/* AI agent hint: ... */}` comments in `node_modules/next/dist/docs` before making caching or streaming modifications.

---

## Testing & Quality Assurance

- **Test Suite**: Run `npm test` (`node --test`).
- **Explicit Test List**: Test files are explicitly enumerated in `package.json`. When creating new test files (`*.test.cjs` or `*.test.ts`), you **MUST** append them to `package.json`'s `test` script or they will silently never execute.
- **Verification Chain**: Always execute in order after changes:
  1. `npx eslint <changed-files>`
  2. `npx tsc --noEmit`
  3. `npm test`

---

## Supabase Client Selection

- `lib/supabase.ts` — Browser client (`createBrowserClient`), for Client Components (`"use client"`).
- `lib/supabase-server.ts` — Server client (`createSupabaseServer()`), async cookie-bound, for Server Components, Server Actions, Route Handlers.
- `lib/supabase-admin.ts` — Service-role client (`createAdminClient()`), bypasses RLS. Restricted to privileged backend operations (webhooks, background crons, admin mutations). **Never import into client components.**

---

## UI & Design System

- Use @tabler/icons-react for interface icons: verified exports, consistent monochrome outline/currentColor, and orange only for active or meaningful emphasis. Keep secondary information on demand; add/invite forms start closed and personnel rows disclose details accessibly. Use readable 15–16px main/label text and 14–15px secondary text. See DESIGN.md for details.
- Follow the repository-root `DESIGN.md`.
- **Existing UI is not automatically good UI**: Check `DESIGN.md`'s known inconsistencies before copying older page layouts.
- Ordinary content belongs directly on the page background by default. Headings, descriptions, forms, filters, toolbars, tabs, tables, lists, and empty states use spacing, typography, and dividers instead of decorative wrappers. Reserve one card for a meaningful independent item, actionable record, selectable template, or metric; nested cards require a clear functional justification. New pages must follow these rules. Sidebar text meets 4.5:1 contrast and icons/focus indicators meet 3:1 against the actual surface, including light and dark variants. Use `rounded-xl` for controls and justified cards, and omit default shadows. See `DESIGN.md`.

---

## Development Workspace

- `scratch/` is git-ignored and intended for throwaway debug/simulation scripts — do not place permanent production code there.
- `hooks/` houses shared client hooks (`use-dashboard-export`, `use-dashboard-params`, `use-image-upload`).
