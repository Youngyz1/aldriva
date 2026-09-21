# CLAUDE.md

This file provides guidance specific to Claude Code (claude.ai/code) when working with code in this repository.

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

- Follow `.aldriva/design/principles.md` and `docs/DESIGN-SYSTEM.md`.
- **Existing UI is not automatically good UI**: See `.aldriva/design/legacy-ui.md` before copying older page layouts.
- Reusable primitives live in `components/ui/` (`button.tsx`, `card.tsx`, `dialog.tsx`, etc.). Use `rounded-xl` and `shadow-xs`.

---

## Development Workspace

- `scratch/` is git-ignored and intended for throwaway debug/simulation scripts — do not place permanent production code there.
- `hooks/` houses shared client hooks (`use-dashboard-export`, `use-dashboard-params`, `use-image-upload`).
