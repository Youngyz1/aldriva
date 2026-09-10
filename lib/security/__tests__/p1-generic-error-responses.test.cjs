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
const ALLOW_RAW_MENTION = [
  "app/api/ai/chat/route.ts:114", // tool-loop model context + server log only
  "app/api/ai/chat/route.ts:149", // output-guard 422 keeps app-generated reason (see below)
  "app/api/ai/chat/route.ts:171", // status-classification temporary; generic returned
  "app/api/invitation/[token]/rsvp/route.ts:35", // status-classification temporary; generic returned
];

// Response lines that return app-generated (never provider/DB) text.
const ALLOW_RESPONSE = [
  "app/api/beneficiary/resolve/route.ts:47", // validateBeneficiary fixed field strings
  "app/api/import-url/route.ts:320", // SsrfBlockedError fixed guard strings
  "app/api/ai/chat/route.ts:152", // fixed 'Content rejected by Output Guard' + app guard reason
];

function rel(f) {
  return path.relative(ROOT, f).replace(/\\/g, "/");
}

function checkFile(f) {
  const lines = fs.readFileSync(f, "utf8").split("\n");
  const problems = [];
  lines.forEach((line, i) => {
    const loc = `${rel(f)}:${i + 1}`;
    const isLog = /console\.error/.test(line);
    // 1. Direct raw echoes in responses.
    if (!isLog && /error:\s*(err|error|e)\.message/.test(line) && !ALLOW_RESPONSE.includes(loc)) {
      problems.push(`${loc}: raw error text in response: ${line.trim()}`);
    }
    // 2. instanceof-ternary raw message outside the allowlisted temporaries.
    if (!isLog && /instanceof Error \?\s*(err|error|e|guardErr)\.message/.test(line) && !ALLOW_RAW_MENTION.includes(loc)) {
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
  });
  return problems;
}

test("no raw error echoes in app/api responses", () => {
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
  for (const loc of [...ALLOW_RAW_MENTION, ...ALLOW_RESPONSE]) {
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
