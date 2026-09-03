/**
 * lib/ai/output-guard.ts
 *
 * Every tool result and every model response passes through this module
 * before it reaches:
 *   (a) the admin UI for display, or
 *   (b) any publish step (Facebook, etc.)
 *
 * This is NOT a prompt instruction to the model — it is a structural
 * post-processing filter that runs in application code, regardless of
 * what the model produces.
 *
 * V1 scope (Phase 2):
 *   - Strip echoed system prompts / internal instruction text
 *   - Reject output containing patterns resembling other users' PII
 *     (emails, phone numbers, UUIDs not in the original tool inputs)
 *   - Log every rejection so we can tell if this is ever triggered
 *
 * V3 hook points (per-user isolation — not implemented yet):
 *   All per-user data isolation checks would go in the function marked
 *   with [V3 HOOK]. When that phase arrives, pass the requesting user's
 *   profile into screenModelOutput / screenToolResult and enforce that
 *   no row belonging to a different user_id is present in the output.
 */

import { createClient } from '@supabase/supabase-js';

// ─────────────────────────────────────────────────────────────────────────────
// Types
// ─────────────────────────────────────────────────────────────────────────────

export type GuardVerdict = 'pass' | 'flagged' | 'rejected';

export interface GuardResult {
  verdict: GuardVerdict;
  /** Human-readable reason if verdict !== 'pass' */
  reason?: string;
  /** Which pattern category triggered the flag/rejection */
  category?: GuardCategory;
  /** Sanitised output (with system-prompt fragments stripped) when verdict === 'flagged' */
  sanitised?: string;
}

type GuardCategory =
  | 'system_prompt_echo'
  | 'pii_email'
  | 'pii_phone'
  | 'pii_uuid'
  | 'suspicious_pattern';

// ─────────────────────────────────────────────────────────────────────────────
// Detection patterns
// ─────────────────────────────────────────────────────────────────────────────

/** Patterns that indicate the model is echoing internal instruction text. */
const SYSTEM_PROMPT_ECHO_PATTERNS: RegExp[] = [
  /you are an? (ai|assistant|language model)/i,
  /as an? (ai|assistant|language model)/i,
  /my (system prompt|instructions|context window)/i,
  /i (was|have been) (told|instructed|asked) to/i,
  /ignore (previous|prior|earlier) instructions/i,
  /disregard (previous|prior|earlier) instructions/i,
  /\[INST\]|\[\/INST\]/,            // Llama instruction markers
  /<\|im_start\|>|<\|im_end\|>/,   // ChatML markers
  /<<SYS>>|<\/SYS>/,                // System block markers
];

/** PII detection patterns — conservative; intent is to flag, not to miss. */
const EMAIL_PATTERN =
  /[a-zA-Z0-9._%+\-]+@[a-zA-Z0-9.\-]+\.[a-zA-Z]{2,}/g;

// Requires at least one separator (space, dash, dot, paren) between digit groups
// so bare digit sequences inside UUIDs or other IDs are not flagged.
const PHONE_PATTERN =
  /(?:\+?1[-.\s])?(\([0-9]{3}\)[-.\s]|[0-9]{3}[-.\s])[0-9]{3}[-.\s][0-9]{4}/g;

/** UUID v4 pattern — used to detect UUIDs that weren't part of tool inputs. */
const UUID_PATTERN =
  /\b[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\b/gi;

// ─────────────────────────────────────────────────────────────────────────────
// Logging helper
// ─────────────────────────────────────────────────────────────────────────────

// ─────────────────────────────────────────────────────────────────────────────
// Logging helper
// ─────────────────────────────────────────────────────────────────────────────

export function logRejection(
  context: string,
  category: GuardCategory,
  reason: string,
  excerpt: string,
  options?: {
    contentType?: string;
    sourceId?: string;
    verdict?: 'flagged' | 'rejected';
  }
): void {
  const timestamp = new Date().toISOString();
  const verdict = options?.verdict ?? 'rejected';
  console.warn(
    `[output-guard] ${verdict.toUpperCase()} | ${timestamp} | context="${context}" | category="${category}" | reason="${reason}" | excerpt="${excerpt.slice(0, 120)}"`
  );

  // Persist to Supabase when service role is available (best-effort, non-blocking).
  // Failures here must never surface to the caller — the guard's own write cannot
  // itself become a DoS vector.
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (url && key) {
    const supabase = createClient(url, key);
    supabase
      .from('ai_guard_rejections')
      .insert({
        context,
        category,
        reason,
        excerpt: excerpt.slice(0, 500),
        content_type: options?.contentType ?? null,
        source_id: options?.sourceId ?? null,
        verdict,
      })
      .then(({ error }) => {
        if (error) {
          console.error('[output-guard] Failed to persist guard rejection log:', error.message);
        }
      });
  }
}

// ─────────────────────────────────────────────────────────────────────────────
// Core guard function for model text output
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Screens a model-generated text string.
 *
 * @param text         - The raw model output to screen.
 * @param context      - A label for logging (e.g. 'generatePromotionCaption').
 * @param knownUuids   - UUIDs that appeared in the original tool-call inputs
 *                       and are therefore safe to appear in output. Any UUID
 *                       in the output that is NOT in this set is treated as a
 *                       potential leak of a different user's data.
 *
 * // [V3 HOOK] Per-user isolation: when per-user scope is implemented in V3,
 * // pass the requesting admin's user_id here and verify that any UUID in the
 * // output is either in knownUuids or belongs to that admin's own records.
 * // The current single-admin gate means any admin can see all data, so UUID
 * // checking is about cross-user leakage prevention rather than role isolation.
 */
export function screenModelOutput(
  text: string,
  context: string,
  knownUuids: string[] = []
): GuardResult {
  if (!text || typeof text !== 'string') {
    return { verdict: 'pass' };
  }

  // ── 1. System-prompt echo detection ──────────────────────────────────────
  for (const pattern of SYSTEM_PROMPT_ECHO_PATTERNS) {
    if (pattern.test(text)) {
      const reason = `System prompt echo pattern matched: ${pattern.source}`;
      logRejection(context, 'system_prompt_echo', reason, text, { verdict: 'flagged' });
      // Attempt sanitisation by stripping the offending sentence
      const sanitised = text
        .split(/[.!?\n]/)
        .filter((sentence) => !SYSTEM_PROMPT_ECHO_PATTERNS.some((p) => p.test(sentence)))
        .join('. ')
        .trim();
      return { verdict: 'flagged', reason, category: 'system_prompt_echo', sanitised };
    }
  }

  // ── 2. Email PII detection ────────────────────────────────────────────────
  const emailMatches = text.match(EMAIL_PATTERN);
  if (emailMatches && emailMatches.length > 0) {
    const reason = `Output contains email address(es): ${emailMatches.join(', ')}`;
    logRejection(context, 'pii_email', reason, text, { verdict: 'rejected' });
    return { verdict: 'rejected', reason, category: 'pii_email' };
  }

  // ── 3. Phone number PII detection ─────────────────────────────────────────
  const phoneMatches = text.match(PHONE_PATTERN);
  if (phoneMatches && phoneMatches.length > 0) {
    const reason = `Output contains phone number(s): ${phoneMatches.join(', ')}`;
    logRejection(context, 'pii_phone', reason, text, { verdict: 'rejected' });
    return { verdict: 'rejected', reason, category: 'pii_phone' };
  }

  // ── 4. UUID leakage detection ─────────────────────────────────────────────
  const uuidMatches = [...text.matchAll(UUID_PATTERN)].map((m) => m[0].toLowerCase());
  const knownLower = knownUuids.map((u) => u.toLowerCase());
  const unknownUuids = uuidMatches.filter((u) => !knownLower.includes(u));

  if (unknownUuids.length > 0) {
    const reason = `Output contains UUID(s) not present in tool inputs: ${unknownUuids.join(', ')}`;
    logRejection(context, 'pii_uuid', reason, text, { verdict: 'flagged' });
    return { verdict: 'flagged', reason, category: 'pii_uuid' };
  }

  return { verdict: 'pass' };
}

// ─────────────────────────────────────────────────────────────────────────────
// Convenience wrapper for tool result arrays
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Screens every string field in an array of tool result rows.
 * Returns only rows that pass security screening (graceful row-level filtering).
 * Excludes (and logs) any row that contains a hard rejection (e.g., PII email or phone).
 *
 * The tool layer collects all UUIDs from each row so the UUID check
 * knows which IDs originated from the DB query and are therefore safe
 * to surface.
 *
 * // [V3 HOOK] Per-user isolation: when per-user scoping is implemented,
 * // verify here that row.user_id (or row.owner_id) matches the requesting
 * // admin's profile. For V1 single-admin scope this check is skipped.
 */
export function screenToolResult<T extends object>(
  toolName: string,
  rows: T[],
  contentType?: string
): T[] {
  // Collect all UUID-shaped values from the result set — these are the
  // "known" UUIDs that originated from this specific DB query.
  const knownUuids: string[] = [];
  for (const row of rows) {
    for (const value of Object.values(row)) {
      if (typeof value === 'string' && UUID_PATTERN.test(value)) {
        knownUuids.push(value);
        UUID_PATTERN.lastIndex = 0; // reset global regex state
      }
    }
  }

  const cleanRows: T[] = [];

  for (const row of rows) {
    let rowExcluded = false;
    const sourceId = (row as Record<string, unknown>).id as string | undefined;

    for (const [key, value] of Object.entries(row)) {
      if (typeof value !== 'string') continue;
      const result = screenModelOutput(value, `${toolName}.${key}`, knownUuids);

      if (result.verdict === 'rejected' || result.verdict === 'flagged') {
        logRejection(
          `${toolName}.${key}`,
          result.category ?? 'suspicious_pattern',
          result.reason ?? 'Tool result failed security screening',
          value,
          { contentType, sourceId, verdict: result.verdict }
        );
        rowExcluded = true;
        break; // Exclude row immediately if any field is rejected or flagged
      }
    }

    if (!rowExcluded) {
      cleanRows.push(row);
    }
  }

  return cleanRows;
}

// ─────────────────────────────────────────────────────────────────────────────
// Named export for use in admin-facing display and publish pipelines
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Call this at every point where AI-generated text will be:
 *   (a) displayed in the admin UI, or
 *   (b) sent to an external platform (Facebook, etc.)
 *
 * Both gates are required — not just the publish step — because displaying
 * a rejected string in the admin UI is itself a data leak, even if it's
 * never posted publicly.
 *
 * @returns The original text if it passes, or the sanitised version if flagged.
 * @throws  If the text is rejected (hard PII violation).
 */
export function guardBeforeDisplay(
  text: string,
  context: string,
  knownUuids: string[] = []
): string {
  const result = screenModelOutput(text, context, knownUuids);

  if (result.verdict === 'rejected') {
    throw new Error(
      `[output-guard] Content rejected before display in "${context}": ${result.reason}`
    );
  }

  if (result.verdict === 'flagged') {
    if (result.sanitised !== undefined) {
      console.warn(
        `[output-guard] Content flagged and sanitised before display in "${context}": ${result.reason}`
      );
      return result.sanitised;
    }
    throw new Error(
      `[output-guard] Content flagged without sanitisation in "${context}": ${result.reason}`
    );
  }

  return text;
}
