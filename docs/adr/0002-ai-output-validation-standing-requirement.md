# ADR 0002: AI Output Validation as a Permanent Structural Requirement

**Status:** Active — standing architectural requirement, applies to all current and future phases  
**Date:** 2026-09-01  
**V1 Complete:** 2026-09-01 — Phases 0.5 through 4 closed. All structural guards, admin UI, provider abstraction, caption generation, promotion engine, and documentation delivered and verified. See conversation `6e5d16a3-3972-4395-a2ee-ea4d5f5670ad` for full phase history and evidence record.  
**Scope:** All AI generation paths (`lib/ai/`), all publish paths (Facebook, etc.), all admin-facing AI output surfaces  
**Author:** Platform owner  

---

## 1. Decision

Every AI-generated response and every AI controlled-tool result must pass through
`lib/ai/output-guard.ts` before it reaches either:

- the admin UI for display, or
- any external publish step (Facebook, or any future channel)

**Both gates are required independently.** Displaying a rejected string in the admin UI is
itself a data leak even if it is never posted externally. Wiring only the publish path is
not compliant with this ADR.

This is a permanent architectural requirement, equivalent in standing to `requireAdmin()`:
any new tool, provider, or publish path added in any future phase is not considered complete
until it is wired into `output-guard.ts`.

---

## 2. Rationale

Prompt injection cannot be reliably prevented at the model layer. A sufficiently crafted
input — whether from an admin, from scraped web content introduced in V2's research
features, or from a future V3 end-user — can cause a model to:

- echo system instructions back in its output,
- hallucinate data that resembles PII from other records, or
- ignore its framing and produce content outside its intended scope.

The defense is **structural, not persuasive**. The model is never trusted to self-police.
The system is designed so that even a fully "successful" injection attack has nothing
meaningful to expose:

1. **Data scoping** (`lib/ai/tools/`): every tool uses a hard-coded column allowlist in
   its `.select()` call. The model is structurally incapable of receiving a column not
   explicitly listed — this is a database constraint, not a prompt instruction.

2. **Output screening** (`lib/ai/output-guard.ts`): every string that exits the AI layer
   is scanned for system-prompt echoes, PII patterns (email, phone, unknown UUIDs), and
   instruction-injection markers before any human or downstream system sees it.

Neither layer alone is sufficient. Both must be present on every path.

---

## 3. Scope of the requirement

### Covered by this ADR

| Path | Guard location |
|------|----------------|
| AI tool results → admin display | `screenToolResult()` in each tool file + `guardBeforeDisplay()` before render |
| Model output → admin display | `guardBeforeDisplay()` before passing text to any React component |
| Model output → Facebook post | `guardBeforeDisplay()` before calling `lib/facebook.js` |
| Model output → any future channel | Same: `guardBeforeDisplay()` must be called before any external write |

### Not yet covered (future phases)

- V2 research features (web scraping → AI summarisation): web-scraped content must be
  treated as untrusted input and screened on both the way into the prompt and the way out
  of the model before display. A dedicated input-sanitisation step will be needed in
  addition to the existing output guard.
- V3 end-user-facing AI features: see Section 5 (V3 hook points).

---

## 4. What "reviewable" means

A validation layer nobody looks at is a compliance artifact, not a security control.
The current implementation logs rejections via `console.warn` and persists them to
the dedicated `ai_guard_rejections` audit table (created in `db/migration_89_ai_guard_rejections.sql`,
written by the service-role client bypassing RLS so rejection logs are recorded reliably regardless
of session state).

**Hard gate on Phase 3 completion**: Phase 3 cannot be marked complete without an
admin-facing panel at `/admin/ai/rejections` (or equivalent route) that surfaces
rows from `ai_guard_rejections` sorted by `created_at DESC`, displaying context, category,
reason, excerpt, content_type, and source_id as readable details.

This is not a "nice to have before launch." It is a required deliverable in the same
sense that `requireAdmin()` on a new route is required: the guard exists but is not
operationally complete until a human can see its output. Until the panel ships,
Phase 3 status is "in progress" regardless of any other criteria being met.

---

## 5. V3 hook points (per-end-user authorization — not yet implemented)

The current implementation enforces admin-level scoping only. V1 and V2 have a single
class of authorized user (platform admin), so there is no cross-user leakage risk at
the tool-result level.

V3 will introduce multiple real end-users with AI access. At that point, two changes
are required:

**5a. Tool layer** (`lib/ai/tools/*.ts`)  
Each tool executor must accept a `requestingUserId` parameter and apply an additional
`.eq('owner_id', requestingUserId)` (or equivalent FK) filter **before** the `.select()`
runs. This ensures a user's tool call can only surface their own records, regardless of
what the model requests.

The hook point in each tool is marked with the comment:
```typescript
// [V3 HOOK] Per-user isolation: add .eq('owner_id', requestingUserId) here
```

**5b. Output guard** (`lib/ai/output-guard.ts`)  
`screenModelOutput` and `screenToolResult` must accept an optional `requestingUserId`
and verify that no UUID in the output belongs to a different user's records. The current
UUID check compares against `knownUuids` collected from the query result; in V3 this
must additionally be cross-referenced against a list of UUIDs the requesting user is
authorized to see.

The hook point in the guard is marked with the comment:
```typescript
// [V3 HOOK] Per-user isolation: verify row ownership against requestingUserId here
```

These hook points must not be removed during any refactor — they are forward references
to a security requirement, not dead code.

---

## 6. Format compliance: documented asymmetry

The output guard (`lib/ai/output-guard.ts`) covers **security and data-leakage concerns**:
system-prompt echo, PII patterns (email, phone), and unknown UUID leakage. These have
both prompt-level instructions and a hard structural backstop.

Format compliance — no markdown, word limits, emoji limits, no hashtags — is enforced
**by prompt instruction only**. There is no structural layer that verifies a generated
string is under 120 words or contains no `**bold**` markers before it is posted.

This is a real asymmetry, acknowledged here rather than obscured:

- A model that correctly follows prompt format instructions produces clean output through both paths equally.
- A model that ignores format instructions will produce malformed output (markdown, excess length) that the guard does not catch, because that is not the guard's job.

**Current narrow patch**: `lib/generateCaption.js` runs `stripMarkdownFormatting()` on
the raw model output before calling `guardBeforeDisplay()`. This strips `**bold**`,
`*italic*`, `[text](url)`, and inline backticks from text going to the Facebook posting
path. It is a symptom fix on one output path, not a structural format-compliance layer.

**Future improvement**: if format violations become frequent, a lightweight structural
check (word count, regex for markdown constructs, emoji count) should be added as a
separate `formatCheck()` step, distinct from the security guard, on all publish paths.

---

## 7. Checklist for any new AI feature (all phases)

A new tool, provider integration, or publish path is not considered complete until:

- [ ] Tool uses a hard-coded `SAFE_COLUMNS` constant in its `.select()` — no `select('*')`
- [ ] Tool result passes through `screenToolResult()` before returning
- [ ] Model output passes through `guardBeforeDisplay()` before reaching the admin UI
- [ ] Model output passes through `guardBeforeDisplay()` before any external publish call
- [ ] Rejection logging is verified to produce a row in `ai_content_items` (or a
      dedicated `ai_guard_rejections` table if volume requires it)
- [ ] If V3: `requestingUserId` is threaded through tool and guard (V3 hook points activated)

---

## 8. Relation to existing ADRs and patterns

- `requireAdmin()` (`lib/auth.ts`): enforces who can initiate an AI workflow.
  Output-guard enforces what the AI can produce regardless of who initiated it.
  These are complementary, not redundant.
- ADR 0001 (Marketplace Ownership): covers data ownership on the Supabase/RLS side.
  Output-guard is the application-layer complement — it catches what RLS cannot, namely
  what the model constructs from data it was legitimately given.
