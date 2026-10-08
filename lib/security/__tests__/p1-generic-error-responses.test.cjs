/**
 * P1 F-08 static regression tests: API routes and server actions must not
 * return raw error internals to clients.
 *
 * Previous exposure: dozens of catch blocks and Supabase-error branches
 * across app/api/** returned `{ error: err.message }` (or the
 * `err instanceof Error ? err.message : fallback` variant) directly to the
 * client, exposing Stripe/Supabase internals, DB error text, and provider
 * SDK messages. Server actions in lib/actions/* had the same shape.
 *
 * Convention enforced here: server-side `console.error` with the full error
 * object, generic client-facing message, unchanged status codes. Three
 * deliberate exceptions are allowlisted below (fixed app-generated strings,
 * never provider/DB internals): validateBeneficiary field messages,
 * SsrfBlockedError guard messages, and internal status-classification
 * temporaries in ai/chat + invitation RSVP (generic text is returned).
 *
 * Two structural exemptions (same rationale as console.error — these never
 * reach a client response):
 * - server-side logging via console.log/console.warn (e.g. sweep diagnostics);
 * - `message:` arguments to insertSystemEvent({...}) audit writes (the
 *   Sentinel observability pipeline needs the raw text server-side; the
 *   client responses alongside them are generic — verified by rules 1/3/4).
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const API = path.join(ROOT, "app", "api");
const ACTIONS = path.join(ROOT, "lib", "actions");

function walk(dir, out = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

// Lines that still mention raw error text but provably do NOT return it:
// - internal classification temporaries (generic message is returned)
// - server-side console.error logging (full object, never sent to client)
// - audit temporaries feeding insertSystemEvent + the documented 422 guard reason
const ALLOW_RAW_MENTION = [
  "app/api/ai/chat/route.ts:306", // tool error temporary; server log only (Stage 22 allowlist shifted)
  "app/api/ai/chat/route.ts:355", // guard reason: audit write + documented 422 app guard reason (Stage 22 allowlist shifted)
  "app/api/ai/chat/route.ts:412", // status-classification temporary; generic returned (Stage 22 allowlist shifted)
  "app/api/ai/gateway/route.ts:196", // audit temporary; console.error + audit; generic returned
  "app/api/qa/poll/route.ts:48", // audit temporary; console.error only; generic returned (server-only import shift)
  "app/api/qa/ingest/route.ts:135", // audit temporary; console.error only; generic returned (Stage 15 import shift)
  "app/api/cron/sentinel-sweep/route.ts:91", // audit temporary; console.error + audit; generic returned
  "app/api/invitation/[token]/rsvp/route.ts:35", // status-classification temporary; generic returned
  "app/api/exec/claim/route.ts:70", // audit temporary; console.error only; generic returned (server-only import shift)
  "app/api/exec/heartbeat/route.ts:57", // audit temporary; console.error only; generic returned (server-only import shift)
  "app/api/exec/ingest/route.ts:77", // audit temporary; console.error only; generic returned (Stage 15 import shift)
  "app/api/exec/run/route.ts:134", // audit temporary; console.error only; generic returned (server-only import shift)
];

// Response lines that return app-generated (never provider/DB) text.
const ALLOW_RESPONSE = [
  "app/api/beneficiary/resolve/route.ts:47", // validateBeneficiary fixed field strings
  "app/api/import-url/route.ts:241", // SsrfBlockedError fixed guard strings
  "app/api/ai/chat/route.ts:369", // fixed 'Content rejected by Output Guard' (+ documented guard reason) (Stage 22 allowlist shifted)
];

// Pre-existing template-literal raw messages (Stage 15 S-14 discovery).
// Out of Stage 15 scope (non-Workforce surfaces) — pinned so the shape-6
// check guards against NEW leaks; fix separately.
const ALLOW_TEMPLATE_LITERAL = [
  "app/api/admin/fundraisers/[id]/import/route.ts:79", // pre-existing: Donation import failed
  "app/api/admin/fundraisers/[id]/import/route.ts:98", // pre-existing: Comment import failed
  "app/api/cron/promotion-engine/route.js:107", // pre-existing: Failed posting text
  "app/api/cron/promotion-engine/route.js:149", // pre-existing: Failed to query promotion
  "app/api/cron/promotion-engine/route.js:184", // pre-existing: Caption generation failed
  "app/api/cron/promotion-engine/route.js:271", // pre-existing: Failed posting text
];

function rel(f) {
  return path.relative(ROOT, f).replace(/\\/g, "/");
}

function checkFile(f) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  const problems = [];
  let auditDepth = 0; // >0 while inside an insertSystemEvent({...}) audit block
  let logDepth = 0; // >0 while inside a multi-line console.* server-log call
  lines.forEach((line, i) => {
    const loc = `${rel(f)}:${i + 1}`;
    const opens = (line.match(/\(/g) || []).length;
    const closes = (line.match(/\)/g) || []).length;
    const startsLog = /console\.(error|log|warn)\s*\(/.test(line);
    const startsAudit = /insertSystemEvent\s*\(/.test(line);
    // Server-side logging and audit writes never reach a client response
    // (same rationale — exempt the whole call, including multi-line blocks).
    const isLog = startsLog || logDepth > 0;
    const inAuditBlock = startsAudit || auditDepth > 0;
    if (startsLog) logDepth = opens - closes;
    else if (logDepth > 0) logDepth = Math.max(0, logDepth + opens - closes);
    // Track audit-write blocks: the opening line always carries unbalanced
    // parens; the block ends when depth returns to zero. Single-line calls
    // resolve immediately and exempt nothing extra.
    if (startsAudit) auditDepth = opens - closes;
    else if (auditDepth > 0) auditDepth = Math.max(0, auditDepth + opens - closes);
    // 1. Direct raw echoes in responses.
    if (!isLog && /error:\s*(err|error|e)\.message/.test(line) && !ALLOW_RESPONSE.includes(loc)) {
      problems.push(`${loc}: raw error text in response: ${line.trim()}`);
    }
    // 2. instanceof-ternary raw message outside the allowlisted temporaries
    // and outside audit-write blocks (raw text belongs in the audit trail).
    if (!isLog && !inAuditBlock && /instanceof Error \?\s*(err|error|e|guardErr)\.message/.test(line) && !ALLOW_RAW_MENTION.includes(loc)) {
      problems.push(`${loc}: instanceof raw-message pattern: ${line.trim()}`);
    }
    // 3. details/debug fields in client responses.
    if (!isLog && /details:\s*(err|error|createRes|updateRes)/.test(line)) {
      problems.push(`${loc}: details field leaks internals: ${line.trim()}`);
    }
    // 4. Lib-layer raw error propagation into client responses.
    if (!isLog && /error:\s*result\.error/.test(line) && !ALLOW_RESPONSE.includes(loc)) {
      problems.push(`${loc}: lib result.error echoed: ${line.trim()}`);
    }
    // 5. Optional-chaining variants of the same leak (in responses only —
    // server-side `const errorMessage = ...?.message` temporaries that feed
    // console.error / alert emails, e.g. the Stripe webhook RPC guards, are
    // safe and intentionally out of scope).
    if (!isLog && /\w\?\.message/.test(line) && /json\(|return\s*\{/.test(line)) {
      problems.push(`${loc}: optional-chain raw message: ${line.trim()}`);
    }
    // 6. Stage 15 (S-14): template-literal raw messages interpolated into a
    // response line (e.g. error: `${err.message}`). Audit blocks stay exempt
    // (raw text belongs in the audit trail, clients get generics).
    if (!isLog && !inAuditBlock && /\$\{(err|error|e|guardErr)\.message\}/.test(line) && /json\(|return\s|error:/.test(line) && !ALLOW_TEMPLATE_LITERAL.includes(loc)) {
      problems.push(`${loc}: template-literal raw message: ${line.trim()}`);
    }
  });
  return problems;
}

test("no raw error echoes in app/[locale]/api responses", () => {
  const problems = [];
  for (const f of walk(API)) problems.push(...checkFile(f));
  assert.deepEqual(problems, [], `raw error leaks found:\n${problems.join("\n")}`);
});

test("no raw error echoes in lib/actions returns", () => {
  const problems = [];
  for (const f of walk(ACTIONS)) problems.push(...checkFile(f));
  assert.deepEqual(problems, [], `raw error leaks found:\n${problems.join("\n")}`);
});

test("allowlisted lines still exist as documented (no silent drift)", () => {
  for (const loc of [...ALLOW_RAW_MENTION, ...ALLOW_RESPONSE, ...ALLOW_TEMPLATE_LITERAL]) {
    const lastColon = loc.lastIndexOf(":");
    const file = path.join(ROOT, loc.slice(0, lastColon));
    const lineNo = Number(loc.slice(lastColon + 1));
    const line = fs.readFileSync(file, "utf8").split("\n")[lineNo - 1];
    assert.ok(
      /message|reason|result\.error|Content rejected/.test(line),
      `${loc} changed — re-evaluate whether the allowlist entry is still valid`
    );
  }
});
