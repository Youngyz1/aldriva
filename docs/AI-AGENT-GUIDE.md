# Aldriva AI Agent Developer Guide

> **How autonomous coding agents (Claude Code, OpenAI Codex, Google Antigravity, OpenCode) develop software in Aldriva.**

---

## 1. Universal Agent Startup Sequence

Every agent session must execute in order before touching code:

1. **Read `AGENTS.md`**: Master repository rules and facts.
2. **Read `docs/CURRENT-STATE.md`**: Current phase and active blockers.
3. **Read `docs/ROADMAP.md`**: 14-phase master sequence.
4. **Read Active Phase Document**: Located in `docs/phases/`.
5. **Read `docs/DESIGN-SYSTEM.md` & `.aldriva/design/principles.md`**: UI guidelines.
6. **Inspect Actual Code & Migrations**: Verify assertions on disk.
7. **Declare Scope**: State what will be built and what will NOT be touched.
8. **Minimal Surgical Changes**: Preserve existing functionality.
9. **Verify**: Run `npx eslint` → `npx tsc --noEmit` → `npm test`.
10. **Update Living Docs**: Update `docs/CURRENT-STATE.md`, active phase doc, and `docs/CHANGELOG.md`.

---

## 2. Agent Configuration & Compatibility Map

| Agent | Config File | Instructions | MCP Support |
|---|---|---|---|
| **Claude Code** | `CLAUDE.md` | Reads `CLAUDE.md` which imports `@AGENTS.md` | Reads `.mcp.json` (Vercel, Figma, Supabase) |
| **Google Antigravity** | `AGENTS.md` | Reads `AGENTS.md` + `.agents/skills/` | Built-in MCP + `.agents/mcp_config.json` |
| **OpenAI Codex** | `AGENTS.md` | Reads `AGENTS.md` directly | Standard CLI tools |
| **OpenCode** | `opencode.json` | Reads `opencode.json` + `AGENTS.md` | OpenRouter API integration |

---

## 3. Testing Rules for AI Agents

- **Test Suite**: `npm test` runs Node's native test runner (`node --test`).
- **Explicit Test Registration**: `package.json` contains an explicit file list for `npm test`. If you add a new test file (`lib/**/__tests__/*.test.cjs`), **you MUST append it to the `test` script in `package.json`**, otherwise it will silently never run.
- **Pass Rate**: Must maintain 100% pass rate (304+ passing tests).

---

## 4. Security Rules for AI Agents

- **No Raw SQL by Models**: AI models must never construct raw SQL against production tables. All queries use server-side safe-column allowlists (`SAFE_COLUMNS`).
- **Output Guard**: All AI-generated strings must pass through `guardBeforeDisplay()` (`lib/ai/output-guard.ts`).
- **Supabase Service Role**: `lib/supabase-admin.ts` is restricted to server files; never import into client components.
- **Tenant Isolation**: Tenant identity is rooted in `organizers.id`, validated via `entity_members`.
