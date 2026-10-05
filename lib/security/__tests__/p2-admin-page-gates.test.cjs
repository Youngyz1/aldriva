/**
 * P2 F-10 regression tests: admin pages must not rely solely on the
 * proxy's x-admin-verified header shortcut.
 *
 * Previous exposure: proxy.ts set `x-admin-verified: 1` on the verified
 * path and app/[locale]/admin/layout.tsx skipped requireAdmin() when present. The
 * header could not be spoofed through the proxy (non-admins redirect
 * first), but the pattern was fragile — a matcher gap or proxy bypass
 * plus a spoofed header would have skipped authorization entirely, and
 * several server pages read platform-wide data with the service-role key.
 *
 * Fixed: proxy.ts deletes any incoming header before setting it fresh, and
 * every server-rendered admin page calls requireAdmin() explicitly.
 * ("use client" pages — events, fundraisers, reviews — cannot call the
 * server-only gate; they fetch exclusively from /api/admin/* routes that
 * each re-check admin server-side, which these tests pin down below.)
 */
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");
const ADMIN = path.join(ROOT, "app", "admin");

// Every server-component page under app/[locale]/admin (client pages listed separately).
const SERVER_PAGES = [
  "app/admin/page.tsx",
  "app/admin/payments/page.tsx",
  "app/admin/homepage/page.tsx",
  "app/admin/fundraisers/[id]/page.tsx",
  "app/admin/articles/page.tsx",
  "app/admin/businesses/page.tsx",
  "app/admin/businesses/review/page.tsx",
  "app/admin/organizers/page.tsx",
  "app/admin/products/page.tsx",
  "app/admin/settings/page.tsx",
  "app/admin/users/page.tsx",
  "app/admin/users/[id]/page.tsx",
  "app/admin/users/identity-verifications/page.tsx",
  "app/admin/ai/page.tsx",
  "app/admin/ai/rejections/page.tsx",
  "app/admin/finance/payouts/page.tsx",
];

// Stage 10.11: Workforce pages live in the ROOT tree (app/admin/workforce)
// because proxy.ts strips the locale prefix before routing, so the
// app/[locale] tree is never matched. Same requireAdmin() bar as above.
const WORKFORCE_PAGES = [
  "app/admin/workforce/page.tsx",
  "app/admin/workforce/agents/page.tsx",
  "app/admin/workforce/agents/[id]/page.tsx",
  "app/admin/workforce/tasks/page.tsx",
  "app/admin/workforce/tasks/[id]/page.tsx",
  "app/admin/workforce/approvals/page.tsx",
  "app/admin/workforce/approvals/[id]/page.tsx",
  "app/admin/workforce/reports/[id]/page.tsx",
  "app/admin/workforce/reports/page.tsx",
  "app/admin/workforce/activity/page.tsx",
  "app/admin/workforce/knowledge/page.tsx",
  "app/admin/workforce/knowledge/[id]/page.tsx",
  "app/admin/workforce/knowledge/retrieval/page.tsx",
  "app/admin/workforce/memory/page.tsx",
  "app/admin/workforce/memory/[id]/page.tsx",
  "app/admin/workforce/office/page.tsx",
  "app/admin/workforce/sentinel/page.tsx",
  "app/admin/workforce/sentinel/incidents/page.tsx",
  "app/admin/workforce/sentinel/incidents/[id]/page.tsx",
  "app/admin/workforce/qa/page.tsx",
  "app/admin/workforce/qa/[id]/page.tsx",
];

// "use client" pages: enforcement lives in the API routes they call.
const CLIENT_PAGES = {
  "app/admin/events/page.tsx": ["app/api/admin/events/route.ts", "app/api/admin/events/[id]/route.ts"],
  "app/admin/fundraisers/page.tsx": ["app/api/admin/fundraisers/route.ts", "app/api/admin/fundraisers/[id]/route.ts"],
  "app/admin/reviews/page.tsx": ["app/api/admin/reviews/route.ts", "app/api/admin/reviews/[id]/route.ts"],
};

test("proxy strips any incoming header before setting it fresh", () => {
  const proxy = fs.readFileSync(path.join(ROOT, "proxy.ts"), "utf8");
  const del = proxy.indexOf('requestHeaders.delete("x-admin-verified")');
  const set = proxy.indexOf('requestHeaders.set("x-admin-verified", "1")');
  assert.ok(del !== -1, "proxy must delete the incoming header");
  assert.ok(set !== -1, "proxy must set the header on the verified path");
  assert.ok(del < set, "delete must come before set");
});

test("every server-rendered admin page calls requireAdmin() explicitly", () => {
  for (const rel of [...SERVER_PAGES, ...WORKFORCE_PAGES]) {
    const src = fs.readFileSync(path.join(ROOT, rel), "utf8");
    assert.ok(!/^"use client"/m.test(src), `${rel} must be a server component for this test`);
    assert.ok(src.includes("await requireAdmin()"), `${rel} must call requireAdmin()`);
  }
});

test("client admin pages fetch only from admin-gated API routes", () => {
  for (const [page, routes] of Object.entries(CLIENT_PAGES)) {
    const src = fs.readFileSync(path.join(ROOT, page), "utf8");
    assert.ok(/^"use client"/m.test(src), `${page} is expected to be a client component`);
    const fetched = [...src.matchAll(/fetch\(\s*[`'"]([^`'"]+)[`'"]/g)].map((m) => m[1]);
    assert.ok(fetched.length > 0, `${page} must fetch something`);
    for (const url of fetched) {
      assert.ok(
        url.startsWith("/api/admin/"),
        `${page} must only call admin API routes (found ${url})`
      );
    }
    for (const routeRel of routes) {
      const route = fs.readFileSync(path.join(ROOT, routeRel), "utf8");
      assert.ok(
        /isAdmin\(\)|requireAdminUser\(\)|requireAdmin\(\)/.test(route),
        `${routeRel} must enforce admin server-side`
      );
    }
  }
});

test("admin page inventory is complete (no untracked page.tsx)", () => {
  const found = [];
  (function walk(dir) {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) walk(full);
      else if (entry.name === "page.tsx") found.push(path.relative(ROOT, full).replace(/\\/g, "/"));
    }
  })(ADMIN);
  // The locale mirror is gone: app/admin is the single tree, so the
  // workforce pages (covered by the requireAdmin tests above) are part of
  // the walked inventory too.
  const tracked = [...SERVER_PAGES, ...Object.keys(CLIENT_PAGES), ...WORKFORCE_PAGES].sort();
  assert.deepEqual(found.sort(), tracked, "new admin pages must be added to this test's inventory");
});

test("workforce pages live in the root tree (Stage 10.11 structure)", () => {
  for (const rel of WORKFORCE_PAGES) {
    assert.ok(
      fs.existsSync(path.join(ROOT, rel)),
      `${rel} must exist under app/admin/workforce (reachable at /admin/workforce/*)`
    );
  }
  assert.ok(
    !fs.existsSync(path.join(ROOT, "app", "[locale]", "admin", "workforce")),
    "app/admin/workforce must not exist (unreachable: proxy strips the locale prefix)"
  );
});

// Stage 21 (P0): the workforce shell layout is a gated, read-only server
// shell. It owns the left tree + {children} only: no client directive,
// no fetch, no server actions, no service-role, no writes, and exactly
// one data import (the aggregated tree helper, which gates requireAdmin
// itself). Interactive leaves it renders (e.g. active-link highlighting
// via usePathname) must be props-only: no fetch, no actions, no data
// imports. Skipped until the shell is built.
const WORKFORCE_LAYOUT = "app/admin/workforce/layout.tsx";
const WORKFORCE_TREE_HELPER = "@/lib/workforce/tree";

function workforceClientLeaves(layoutSrc) {
  const leaves = [];
  for (const m of layoutSrc.matchAll(/from\s+["'](\.[^"']+)["']/g)) {
    const base = m[1].replace(/\.(tsx|ts|jsx|js)$/, "");
    for (const ext of [".tsx", ".ts", ".jsx", ".js"]) {
      const full = path.join(ROOT, "app", "admin", "workforce", `${base}${ext}`);
      if (fs.existsSync(full)) {
        leaves.push(full);
        break;
      }
    }
  }
  return leaves;
}

test("workforce shell layout (if present) is a read-only server component", () => {
  const full = path.join(ROOT, WORKFORCE_LAYOUT);
  if (!fs.existsSync(full)) return;
  const src = fs.readFileSync(full, "utf8");
  assert.ok(!/^"use client"/m.test(src), `${WORKFORCE_LAYOUT} must be a server component`);
  assert.ok(!src.includes("fetch("), `${WORKFORCE_LAYOUT} must not fetch; the tree helper is its only data access`);
  for (const banned of ["lib/actions", "supabase-admin", "createSupabaseAdmin", "revalidatePath", "@/lib/ai/"]) {
    assert.ok(!src.includes(banned), `${WORKFORCE_LAYOUT} must not import ${banned}`);
  }
  assert.ok(
    !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(src),
    `${WORKFORCE_LAYOUT} must contain no writes`
  );
  const dataImports = [...src.matchAll(/from\s+["'](@\/lib\/workforce\/[^"']+)["']/g)].map((m) => m[1]);
  assert.ok(
    dataImports.length > 0 && dataImports.every((imp) => imp === WORKFORCE_TREE_HELPER),
    `${WORKFORCE_LAYOUT} may import only ${WORKFORCE_TREE_HELPER} (found: ${dataImports.join(", ") || "none"})`
  );
  for (const leaf of workforceClientLeaves(src)) {
    const leafSrc = fs.readFileSync(leaf, "utf8");
    // `import type` is erased at runtime: props stay typed without a
    // runtime data dependency. Strip those lines before scanning.
    const runtimeSrc = leafSrc.replace(/^import\s+type\s+[^;]+;/gm, "");
    const rel = path.relative(ROOT, leaf).replace(/\\/g, "/");
    assert.ok(!runtimeSrc.includes("fetch("), `${rel} must receive data through props, never fetch`);
    for (const banned of ["lib/actions", "supabase", "@/lib/workforce/", "@/lib/ai/"]) {
      assert.ok(!runtimeSrc.includes(banned), `${rel} must not import ${banned} (props only)`);
    }
    assert.ok(
      !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(runtimeSrc),
      `${rel} must contain no writes`
    );
  }
});

// Stage 21 (P3): the office ?agent= selection panel is a read-only server
// surface; its close leaf is props-only (Link clears without JS, Esc via
// router.replace). Same bar as the shell tree leaves above.
const OFFICE_PANEL = [
  "app/admin/workforce/office/AgentPanel.tsx",
  "app/admin/workforce/office/PanelCloseButton.tsx",
];

test("office selection panel is read-only; close leaf is props-only", () => {
  for (const rel of OFFICE_PANEL) {
    const full = path.join(ROOT, rel);
    assert.ok(fs.existsSync(full), `${rel} must exist`);
    const src = fs.readFileSync(full, "utf8");
    assert.ok(!src.includes("fetch("), `${rel} must not fetch`);
    for (const banned of ["lib/actions", "supabase", "@/lib/ai/"]) {
      assert.ok(!src.includes(banned), `${rel} must not import ${banned}`);
    }
    assert.ok(
      !/\.insert\(|\.update\(|\.upsert\(|\.delete\(|\.rpc\(/.test(src),
      `${rel} must contain no writes`
    );
    assert.ok(!/<form[\s>]/.test(src), `${rel} must contain no forms`);
  }
  const panel = fs.readFileSync(path.join(ROOT, OFFICE_PANEL[0]), "utf8");
  assert.ok(!/^"use client"/m.test(panel), "AgentPanel must be a server component");
  assert.ok(!panel.includes("useRouter") && !panel.includes("usePathname"), "AgentPanel has no router hooks");
  assert.ok(panel.includes("read-only"), "panel labels its snapshot read-only");
  assert.ok(panel.includes("Open full page"), "panel links to the full agents/[id] route fallback");
  const runtimeLeaf = fs
    .readFileSync(path.join(ROOT, OFFICE_PANEL[1]), "utf8")
    .replace(/^import\s+type\s+[^;]+;/gm, "");
  assert.ok(/^"use client"/m.test(runtimeLeaf), "close leaf is the only client piece");
  assert.ok(!runtimeLeaf.includes("@/lib/workforce/"), "close leaf imports no data modules");
  assert.ok(runtimeLeaf.includes("Escape"), "Esc clears the selection");
  assert.ok(runtimeLeaf.includes("router.replace"), "Esc dismissal avoids a scroll jump");
});
