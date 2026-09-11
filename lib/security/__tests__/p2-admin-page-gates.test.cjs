/**
 * P2 F-10 regression tests: admin pages must not rely solely on the
 * proxy's x-admin-verified header shortcut.
 *
 * Previous exposure: proxy.ts set `x-admin-verified: 1` on the verified
 * path and app/admin/layout.tsx skipped requireAdmin() when present. The
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

// Every server-component page under app/admin (client pages listed separately).
const SERVER_PAGES = [
  "app/admin/page.tsx",
  "app/admin/payments/page.tsx",
  "app/admin/homepage/page.tsx",
  "app/admin/fundraisers/[id]/page.tsx",
  "app/admin/articles/page.tsx",
  "app/admin/businesses/page.tsx",
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
  for (const rel of SERVER_PAGES) {
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
  const tracked = [...SERVER_PAGES, ...Object.keys(CLIENT_PAGES)].sort();
  assert.deepEqual(found.sort(), tracked, "new admin pages must be added to this test's inventory");
});
