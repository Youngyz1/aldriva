# Aldriva Model Context Protocol (MCP) Architecture

> **Living Technical Specification**: Model Context Protocol configuration, server endpoints, agent compatibility, and security boundaries.

---

## 1. Configured MCP Servers

| MCP Server | Transport | Endpoint / Spec | Config File | Agent Compatibility | Purpose | Safe to Commit? |
|---|---|---|---|---|---|---|
| **Supabase** | HTTP | `https://mcp.supabase.com/mcp?project_ref=...` | `.mcp.json`, `.agents/mcp_config.json` | Claude Code, Antigravity | Inspect database schema, run SQL queries, test migrations | ✅ Yes (Contains public project ref, no secrets) |
| **Vercel** | HTTP | `https://mcp.vercel.com` | `.mcp.json` | Claude Code | Inspect deployments, runtime logs, project configuration | ✅ Yes (No secrets embedded) |
| **Figma** | HTTP | `https://mcp.figma.com/mcp` | `.mcp.json` | Claude Code | Inspect design tokens, layout frames, and component specs | ✅ Yes (No secrets embedded) |
| **Chrome / Playwright** | Stdio / Extension | Local browser control | User settings | Claude Code, Antigravity | Automated visual inspection and DOM review | ✅ Local only |

---

## 2. Configuration Ownership & Storage

- **Shared Project Configuration**: [`.mcp.json`](../.mcp.json) sits at the repository root and is committed to source control. It declares the common HTTP endpoints (Supabase, Vercel, Figma) without embedding secrets or API tokens.
- **Antigravity Agent Skills**: [`.agents/skills/`](../.agents/skills/) holds specialized AI skills (`supabase`, `supabase-postgres-best-practices`, `aldriva-ui-engineer`). Managed via [`skills-lock.json`](../skills-lock.json).
- **Claude Code Permissions**: [`.claude/settings.local.json`](../.claude/settings.local.json) is git-ignored and holds developer-specific command and tool approval allowlists.

---

## 3. Credential & Secret Hygiene

- ❌ **NEVER commit API keys, service role tokens, or passwords to MCP config files.**
- Authentication for cloud MCP endpoints (Supabase, Vercel) is resolved through developer CLI sessions or environment variables (`SUPABASE_ACCESS_TOKEN`, `VERCEL_TOKEN`), never hardcoded JSON.
- If an MCP tool requires private tenant credentials, pass them via runtime function parameters, not static configuration.
