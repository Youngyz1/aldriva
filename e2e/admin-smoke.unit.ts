/**
 * e2e/admin-smoke.unit.ts — node:test unit tests for the smoke rig's pure
 * parts (filesystem -> URL conversion, dynamic-id resolution, failure
 * classification). Wired into package.json "test"; invisible to Playwright's
 * default testMatch by name so the root staging config never runs it.
 */
import { test } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  discoverAdminRoutes,
  discoverPageFiles,
  pageFileToUrl,
  resolveDynamicId,
} from "./admin-smoke.routes.ts";
import { classifyRoute } from "./admin-smoke.classify.ts";

const here = path.dirname(fileURLToPath(import.meta.url));

test("pageFileToUrl converts filesystem paths to admin URLs", () => {
  assert.equal(pageFileToUrl("page.tsx"), "/admin");
  assert.equal(pageFileToUrl("ai/rejections/page.tsx"), "/admin/ai/rejections");
  assert.equal(
    pageFileToUrl("users\\[id]\\page.tsx"),
    "/admin/users/[id]"
  );
  assert.equal(
    pageFileToUrl("workforce/sentinel/incidents/[id]/page.tsx"),
    "/admin/workforce/sentinel/incidents/[id]"
  );
});

test("discoverPageFiles finds page.tsx recursively", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "smoke-routes-"));
  fs.mkdirSync(path.join(root, "users", "[id]"), { recursive: true });
  fs.writeFileSync(path.join(root, "page.tsx"), "");
  fs.writeFileSync(path.join(root, "users", "page.tsx"), "");
  fs.writeFileSync(path.join(root, "users", "[id]", "page.tsx"), "");
  fs.writeFileSync(path.join(root, "users", "helper.ts"), "");
  assert.deepEqual(discoverPageFiles(root), [
    "page.tsx",
    "users/[id]/page.tsx",
    "users/page.tsx",
  ]);
  fs.rmSync(root, { recursive: true, force: true });
});

test("discoverAdminRoutes marks dynamic routes with their list page", () => {
  assert.deepEqual(
    discoverAdminRoutes([
      "users/page.tsx",
      "users/[id]/page.tsx",
      "page.tsx",
      "notes.txt",
    ]),
    [
      { url: "/admin", dynamic: false, listPage: null },
      { url: "/admin/users", dynamic: false, listPage: null },
      { url: "/admin/users/[id]", dynamic: true, listPage: "/admin/users" },
    ]
  );
});

test("resolveDynamicId picks the first same-level link", () => {
  assert.equal(
    resolveDynamicId(
      ["/admin/users", "/admin/users/abc123", "/admin/users/x/y"],
      "/admin/users"
    ),
    "abc123"
  );
  assert.equal(
    resolveDynamicId(["/admin/users/a?tab=x", "/admin/other"], "/admin/users"),
    "a"
  );
  assert.equal(resolveDynamicId(["/admin", "/login", null], "/admin/users"), null);
  assert.equal(resolveDynamicId([], "/admin/users"), null);
});

const clean = {
  requestedPath: "/admin/users",
  finalPath: "/admin/users",
  status: 200,
  bodyText: "Users",
  pageError: null,
  consoleErrors: [],
};

test("classifyRoute passes a clean load", () => {
  assert.deepEqual(classifyRoute(clean), { result: "PASS", detail: null });
});

test("classifyRoute reports redirects as AUTH before anything else", () => {
  assert.deepEqual(
    classifyRoute({ ...clean, finalPath: "/login", status: 500 }),
    { result: "AUTH", detail: "redirected to /login" }
  );
  assert.deepEqual(
    classifyRoute({ ...clean, finalPath: "/" }),
    { result: "AUTH", detail: "redirected to /" }
  );
});

test("classifyRoute fails HTTP errors, error screens, pageerrors", () => {
  assert.equal(classifyRoute({ ...clean, status: 500 }).result, "FAIL");
  assert.equal(classifyRoute({ ...clean, status: 404 }).result, "FAIL");
  assert.deepEqual(
    classifyRoute({ ...clean, bodyText: "Something went wrong" }),
    { result: "FAIL", detail: "app error screen: Something went wrong" }
  );
  assert.deepEqual(
    classifyRoute({ ...clean, bodyText: "Error 500 occurred" }),
    { result: "FAIL", detail: "app error screen: 500 marker in body" }
  );
  assert.equal(
    classifyRoute({ ...clean, pageError: "boom" }).result,
    "FAIL"
  );
});

test("classifyRoute fails matching console errors only", () => {
  assert.equal(
    classifyRoute({
      ...clean,
      consoleErrors: ["Warning: something odd", "TypeError: x is undefined"],
    }).result,
    "FAIL"
  );
  assert.deepEqual(
    classifyRoute({ ...clean, consoleErrors: ["Warning: something odd"] }),
    { result: "PASS", detail: null }
  );
});

test("classifyRoute passes when the status is unknown but nothing else fires", () => {
  assert.deepEqual(
    classifyRoute({ ...clean, status: null }),
    { result: "PASS", detail: null }
  );
});

test("smoke context pins the server-default timezone and locale", () => {
  const src = fs.readFileSync(
    path.join(here, "admin-smoke.config.ts"),
    "utf8"
  );
  assert.ok(
    src.includes('timezoneId: "Africa/Lagos"'),
    "browser timezone matches the dev server"
  );
  assert.ok(src.includes('locale: "en-GB"'), "browser locale is pinned");
});
