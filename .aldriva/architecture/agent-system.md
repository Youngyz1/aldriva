# Aldriva Universal Agent Architecture

> **Axiom**: The repository is the single source of truth for all autonomous coding agents.

---

## 1. Multi-Agent Ecosystem Model

Aldriva supports four primary AI coding agents operating seamlessly across the same codebase:

```text
                                 ┌─────────────────────────────┐
                                 │     Aldriva Repository      │
                                 │   (Single Source of Truth)  │
                                 └──────────────┬──────────────┘
                                                │
         ┌──────────────────────┬───────────────┴──────────────┬──────────────────────┐
         ▼                      ▼                              ▼                      ▼
┌──────────────────┐  ┌──────────────────┐           ┌──────────────────┐  ┌──────────────────┐
│   Claude Code    │  │   OpenAI Codex   │           │Google Antigravity│  │     OpenCode     │
│   (CLAUDE.md)    │  │   (AGENTS.md)    │           │(AGENTS.md+Skills)│  │ (opencode.json)  │
└──────────────────┘  └──────────────────┘           └──────────────────┘  └──────────────────┘
         │                      │                              │                      │
         └──────────────────────┴───────────────┬──────────────┴──────────────────────┘
                                                ▼
                               ┌─────────────────────────────────┐
                               │       Universal Guidance        │
                               │ - AGENTS.md (Root Rules)        │
                               │ - .aldriva/design/ (UI Rules)   │
                               │ - docs/ (Architecture & Specs)  │
                               │ - .mcp.json (Unified Tooling)   │
                               └─────────────────────────────────┘
```

---

## 2. Agent Specifics & Adapters

| Agent | Entry File | Tooling / Protocol | Notes |
|---|---|---|---|
| **Universal (All)** | `AGENTS.md` | Common CLI / Git | Canonical rulebook and startup sequence |
| **Claude Code** | `CLAUDE.md` | `@AGENTS.md`, `.mcp.json` | Uses project-level `.mcp.json` (Vercel, Figma, Supabase) |
| **Google Antigravity** | `AGENTS.md` + `.agents/skills/` | Agent Skills + MCP | Reads `skills-lock.json` and loads `supabase` and `aldriva-ui-engineer` skills |
| **OpenAI Codex** | `AGENTS.md` | Standard CLI | Interprets `AGENTS.md` directly |
| **OpenCode** | `opencode.json` + `AGENTS.md` | OpenRouter / Provider | Reads configuration from `opencode.json` with env var keys |

---

## 3. Continuity Protocol

Every agent starting work must follow the 10-step startup procedure in `AGENTS.md`:
1. Read `AGENTS.md`.
2. Read `docs/CURRENT-STATE.md`.
3. Read `docs/ROADMAP.md`.
4. Read active phase plan in `docs/phases/`.
5. Read `docs/DESIGN-SYSTEM.md` and `.aldriva/design/principles.md`.
6. Verify code & migrations on disk.
7. Declare scope before touching files.
8. Implement minimal, high-quality changes.
9. Verify via `npm test` and `npx tsc --noEmit`.
10. Update living documentation.
