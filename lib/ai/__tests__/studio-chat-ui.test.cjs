/**
 * Stage 22 (P4b) — Studio chat UI tests (hermetic).
 *
 * No database, no network, no rendering. The grouping helper is imported
 * for real (pure, dependency-free); the client component is pinned by
 * source scan: no service-role/data imports, plain-text rendering only
 * (never dangerouslySetInnerHTML, no markdown dependency), tool chips by
 * name only, conversation list/create/rename/delete wiring through the
 * admin-gated endpoints, and the persisted-flag notice. package.json
 * dependency keys are pinned so no new runtime dependency can sneak in.
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const Module = require("node:module");
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function (request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};
require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  module._compile(
    ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020, jsx: ts.JsxEmit.ReactJSX },
    }).outputText,
    filename
  );
};

const { groupConversations } = require("../studio-chat-groups");

const CLIENT = fs.readFileSync(path.join(ROOT, "app", "admin", "ai", "GrowthStudioClient.tsx"), "utf8");
const PKG = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));

// ── 1. Grouping is a pure function ───────────────────────────────────────

function convo(id, updated_at, title = id) {
  return { id, title, updated_at };
}

test("groupConversations: buckets, newest-first, empty buckets omitted", () => {
  const now = new Date("2026-10-05T12:00:00");
  const groups = groupConversations(
    [
      convo("old", "2026-09-01T09:00:00"),
      convo("now-b", "2026-10-05T08:00:00"),
      convo("now-a", "2026-10-05T11:00:00"),
      convo("yday", "2026-10-04T15:00:00"),
      convo("week", "2026-10-01T10:00:00"),
    ],
    now
  );
  assert.deepEqual(
    groups.map((g) => g.key),
    ["today", "yesterday", "previous7", "older"],
    "all four buckets in order"
  );
  assert.deepEqual(
    groups.find((g) => g.key === "today").items.map((c) => c.id),
    ["now-a", "now-b"],
    "newest first within a bucket"
  );
  assert.deepEqual(
    groups.map((g) => g.label),
    ["Today", "Yesterday", "Previous 7 days", "Older"],
    "exact bucket labels"
  );
});

test("groupConversations: boundaries and invalid timestamps", () => {
  const now = new Date("2026-10-05T12:00:00");
  // Exactly 7 days back stays in Previous 7 days; 8 days back is Older.
  const groups = groupConversations(
    [convo("edge7", "2026-09-28T12:00:00"), convo("edge8", "2026-09-27T11:59:59"), convo("junk", "not-a-date")],
    now
  );
  assert.ok(groups.find((g) => g.key === "previous7").items.some((c) => c.id === "edge7"), "day 7 included");
  const older = groups.find((g) => g.key === "older").items.map((c) => c.id);
  assert.ok(older.includes("edge8"), "day 8 is older");
  assert.ok(older.includes("junk"), "unparseable timestamps fall into Older, never vanish");
  assert.deepEqual(groupConversations([], now), [], "empty in, empty out");
});

// ── 2. Client stays free of service-role/data imports ───────────────────

test("client imports: fetch-only, no service role or data layer", () => {
  for (const banned of [
    "supabase-admin",
    "service_role",
    "serviceRole",
    "supabase-server",
    "createSupabaseServer",
    "getCurrentUser",
    "requireAdmin",
    "executeAITool",
    "getAIProvider",
    "lib/ai/studio-chat\"",
    "lib/ai/tools",
  ]) {
    assert.ok(!CLIENT.includes(banned), `client never imports ${banned}`);
  }
  assert.ok(CLIENT.includes("lib/ai/studio-chat-groups"), "grouping comes from the pure helper");
  assert.ok(CLIENT.includes("/api/ai/conversations"), "list/create path used");
  assert.ok(CLIENT.includes("/api/ai/conversations/${"), "read/rename/delete path used");
  assert.ok(CLIENT.includes("conversationId"), "chat posts carry conversationId");
});

// ── 3. Plain-text rendering only ─────────────────────────────────────────

test("model text is never raw HTML", () => {
  assert.ok(!CLIENT.includes("dangerouslySetInnerHTML"), "no raw HTML injection");
  for (const banned of ["react-markdown", "from \"marked\"", "from 'marked'", "rehype", "remark"]) {
    assert.ok(!CLIENT.includes(banned), `no markdown renderer ${banned}`);
  }
  assert.ok(CLIENT.includes("whitespace-pre-wrap"), "plain-text wrapping preserved");
  // Tool chips carry the tool NAME only — args must not reach the thread.
  assert.ok(CLIENT.includes("toolNames"), "chips render from a names-only list");
  assert.ok(!CLIENT.includes("tc.args") && !CLIENT.includes(".toolArgs"), "no tool args in JSX");
});

// ── 4. Required UI wiring ────────────────────────────────────────────────

test("conversation management and composer wiring", () => {
  for (const needle of [
    "New chat",
    "Previous 7 days",
    "Yesterday",
    "Older",
    "drawerOpen",
    "AdminConfirmDialog",
    "Delete this chat?",
    "Rename chat",
    "method: \"PATCH\"",
    "method: \"DELETE\"",
    "Shift+Enter",
    "e.shiftKey",
    "Thinking",
    "persisted === false",
    "Not stored",
    "200 most recent",
    "prefers-reduced-motion",
    "visibilitychange",
    "Guard: Pass",
    "Guard: Sanitised",
    "Guard: Rejected",
  ]) {
    assert.ok(CLIENT.includes(needle), `client wires ${needle}`);
  }
});

test("all 9 allowlisted tools stay reachable as grouped chips", () => {
  const tools = [
    "get_upcoming_events",
    "get_active_fundraisers",
    "get_featured_businesses",
    "get_recent_articles",
    "get_available_products",
    "get_content_history",
    "fetch_url_summary",
    "fetch_rss_feed",
    "search_trends",
  ];
  for (const tool of tools) assert.ok(CLIENT.includes(tool), `chip for ${tool}`);
  for (const label of ["Catalog", "Research", "Content"]) {
    assert.ok(CLIENT.includes(label), `chip group ${label}`);
  }
  assert.ok(CLIENT.includes("directTool"), "chips call the directTool path");
  assert.ok(!CLIENT.includes("memory_propose") && !CLIENT.includes("sentinel"), "no workforce writers on chips");
});

// ── 5. Only the approved storage dependencies were added ─────────────────

test("package.json adds only the approved AWS SDK and Sharp dependencies", () => {
  assert.deepEqual(Object.keys(PKG.dependencies).sort(), [
    "@aws-sdk/client-s3",
    "@aws-sdk/s3-request-presigner",
    "@next/third-parties",
    "@radix-ui/react-avatar",
    "@radix-ui/react-collapsible",
    "@radix-ui/react-dialog",
    "@radix-ui/react-dropdown-menu",
    "@radix-ui/react-label",
    "@radix-ui/react-radio-group",
    "@radix-ui/react-separator",
    "@radix-ui/react-slot",
    "@radix-ui/react-switch",
    "@radix-ui/react-tabs",
    "@radix-ui/react-tooltip",
    "@stripe/react-stripe-js",
    "@stripe/stripe-js",
    "@supabase/ssr",
    "@supabase/supabase-js",
    "@tiptap/core",
    "@tiptap/extension-image",
    "@tiptap/extension-link",
    "@tiptap/extension-underline",
    "@tiptap/pm",
    "@tiptap/react",
    "@tiptap/starter-kit",
    "@types/leaflet",
    "@types/qrcode",
    "axios",
    "browser-image-compression",
    "class-variance-authority",
    "clsx",
    "date-fns",
    "date-fns-tz",
    "embla-carousel-react",
    "framer-motion",
    "idb",
    "isomorphic-dompurify",
    "jspdf",
    "jsqr",
    "leaflet",
    "lucide-react",
    "next",
    "next-intl",
    "qrcode",
    "react",
    "react-dom",
    "react-easy-crop",
    "react-icons",
    "react-leaflet",
    "recharts",
    "resend",
    "sharp",
    "stripe",
    "tailwind-merge",
    "three",
  ]);
  for (const banned of ["react-markdown", "marked", "rehype", "remark"]) {
    assert.ok(!PKG.dependencies[banned], `no ${banned} dependency`);
  }
});
