/**
 * lib/__tests__/operational-settings.test.cjs
 *
 * Behavior tests for the Settings hours/time-zone persistence path
 * (lib/operational-settings.ts cores, exercised through an in-memory mock
 * admin client — no database):
 * - save with no existing rows creates the minimal hours-only live doc and
 *   reads back exactly what was saved;
 * - save with live-only merges the hours key, preserving other keys;
 * - save with a draft merges hours there too, preserving other draft keys;
 * - failure paths return typed errors, never false success (incl. a write
 *   that silently drops hours, caught by verify-after-write);
 * - time-zone round trip, invalid zones rejected, metadata merge preserves
 *   unrelated keys (e.g. storefront).
 */

"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const {
  getOperationalSettingsWithClient,
  saveOperationalHoursWithClient,
  saveSiteTimezoneWithClient,
} = require("../operational-settings.ts");

// ── In-memory mock admin ─────────────────────────────────────────────────────

function makeMockDb(seed = {}, fail = {}) {
  const store = {
    tenant_websites: [],
    businesses: [],
    website_content: [],
    website_content_drafts: [],
    ...seed,
  };

  function matches(row, filters) {
    return filters.every(([c, v]) => row[c] === v);
  }

  function builder(table) {
    const filters = [];
    let orderCol = null;
    let orderAsc = true;
    let limitN = null;
    let pendingOp = null;
    const failSpec = fail[table] || {};

    function runRead() {
      if (failSpec.read) return { data: null, error: failSpec.read };
      let rows = store[table].filter((r) => matches(r, filters));
      if (orderCol) {
        rows = [...rows].sort((a, b) =>
          orderAsc
            ? String(a[orderCol] ?? "").localeCompare(String(b[orderCol] ?? ""))
            : String(b[orderCol] ?? "").localeCompare(String(a[orderCol] ?? ""))
        );
      }
      if (limitN != null) rows = rows.slice(0, limitN);
      return { data: rows[0] ?? null, error: null };
    }

    function runUpdate(payload) {
      if (failSpec.update) return { data: null, error: failSpec.update };
      const rows = store[table].filter((r) => matches(r, filters));
      for (const row of rows) {
        const effective = { ...payload };
        if (failSpec.dropHours && effective.content && typeof effective.content === "object") {
          const stripped = { ...effective.content };
          delete stripped.hours;
          effective.content = stripped;
        }
        Object.assign(row, effective);
      }
      return { data: rows, error: null };
    }

    function runInsert(payload) {
      if (failSpec.insert) return { data: null, error: failSpec.insert };
      const row = { ...payload };
      if (failSpec.dropHours && row.content && typeof row.content === "object") {
        const stripped = { ...row.content };
        delete stripped.hours;
        row.content = stripped;
      }
      store[table].push(row);
      return { data: row, error: null };
    }

    const terminal = (fn) => ({ then: (resolve) => Promise.resolve(fn()).then(resolve) });

    const q = {
      select: () => q,
      eq: (c, v) => {
        filters.push([c, v]);
        return q;
      },
      order: (c, o) => {
        orderCol = c;
        orderAsc = o?.ascending !== false;
        return q;
      },
      limit: (n) => {
        limitN = n;
        return q;
      },
      maybeSingle: async () => runRead(),
      update: (payload) => {
        pendingOp = { kind: "update", payload };
        return q;
      },
      insert: (payload) => terminal(() => runInsert(payload)),
      then: (resolve) => {
        if (!pendingOp) return Promise.resolve({ data: null, error: null }).then(resolve);
        const op = pendingOp;
        pendingOp = null;
        return Promise.resolve(op.kind === "update" ? runUpdate(op.payload) : runInsert(op.payload)).then(resolve);
      },
    };
    return q;
  }

  return { store, admin: { from: (table) => builder(table) } };
}

const SITE = {
  id: "ws-1",
  tenant_id: "org-1",
  slug: "aldriva-food",
  status: "published",
  published_at: "2026-09-01T00:00:00Z",
  metadata: {},
  created_at: "2026-08-01T00:00:00Z",
};

const BIZ = { id: "biz-1", country: "Côte d'Ivoire" };

const WEEK = {
  mon: { open: "09:00", close: "23:00" },
  tue: { open: "09:00", close: "23:00" },
  wed: { open: "09:00", close: "23:00" },
  thu: { open: "09:00", close: "23:00" },
  fri: { open: "09:00", close: "23:00" },
  sat: { open: "09:00", close: "23:00" },
  sun: { closed: true },
};

// ── Hours save/read ──────────────────────────────────────────────────────────

describe("operational hours persistence (mock persistence layer)", () => {
  test("save with no existing rows creates the minimal hours-only live doc and reads back equal", async () => {
    const { store, admin } = makeMockDb({
      tenant_websites: [{ ...SITE }],
      businesses: [{ ...BIZ }],
    });
    const saved = await saveOperationalHoursWithClient({ organizerId: "org-1", hours: WEEK }, admin);
    assert.equal(saved.success, true);

    const live = store.website_content.find((r) => r.website_id === "ws-1");
    assert.ok(live, "live row created");
    assert.deepEqual(Object.keys(live.content).sort(), ["hours"], "hours key only — template defaults untouched");
    assert.equal(store.website_content_drafts.length, 0, "no draft fabricated");

    const read = await getOperationalSettingsWithClient("org-1", admin);
    assert.equal(read.success, true);
    assert.deepEqual(read.data.hours, live.content.hours);
    assert.equal(read.data.hoursSource, "live");
    assert.equal(read.data.hasLiveHours, true);
    assert.equal(read.data.hasDraftHours, false);
  });

  test("save with live-only merges the hours key and preserves other live keys", async () => {
    const { store, admin } = makeMockDb({
      tenant_websites: [{ ...SITE }],
      businesses: [{ ...BIZ }],
      website_content: [{ website_id: "ws-1", content: { business_name: "Aldriva Food", hours: { mon: { open: "08:00", close: "20:00" } } } }],
    });
    const saved = await saveOperationalHoursWithClient({ organizerId: "org-1", hours: WEEK }, admin);
    assert.equal(saved.success, true);
    const live = store.website_content.find((r) => r.website_id === "ws-1");
    assert.equal(live.content.business_name, "Aldriva Food");
    assert.deepEqual(live.content.hours.mon, { open: "09:00", close: "23:00" });

    const read = await getOperationalSettingsWithClient("org-1", admin);
    assert.deepEqual(read.data.hours.mon, { open: "09:00", close: "23:00" });
  });

  test("save with an existing draft merges hours there too, preserving other draft keys", async () => {
    const { store, admin } = makeMockDb({
      tenant_websites: [{ ...SITE }],
      businesses: [{ ...BIZ }],
      website_content: [{ website_id: "ws-1", content: { business_name: "Aldriva Food" } }],
      website_content_drafts: [
        { website_id: "ws-1", content: { tagline: "Draft tagline", hours: { mon: { open: "01:00", close: "02:00" } } }, version: 3 },
      ],
    });
    const saved = await saveOperationalHoursWithClient({ organizerId: "org-1", hours: WEEK }, admin);
    assert.equal(saved.success, true);
    assert.equal(saved.data.hasDraftHours, true);

    const draft = store.website_content_drafts.find((r) => r.website_id === "ws-1");
    assert.equal(draft.content.tagline, "Draft tagline", "unrelated draft edits intact");
    assert.deepEqual(draft.content.hours.sun, { closed: true });

    const read = await getOperationalSettingsWithClient("org-1", admin);
    assert.equal(read.data.hoursSource, "draft", "builder-facing read prefers the draft");
    assert.deepEqual(read.data.hours.mon, { open: "09:00", close: "23:00" });
  });

  test("clearing hours removes the key from live and draft", async () => {
    const { store, admin } = makeMockDb({
      tenant_websites: [{ ...SITE }],
      businesses: [{ ...BIZ }],
      website_content: [{ website_id: "ws-1", content: { business_name: "A", hours: { mon: { open: "09:00", close: "23:00" } } } }],
    });
    const saved = await saveOperationalHoursWithClient({ organizerId: "org-1", hours: null }, admin);
    assert.equal(saved.success, true);
    assert.ok(!("hours" in store.website_content[0].content));
    const read = await getOperationalSettingsWithClient("org-1", admin);
    assert.equal(read.data.hasLiveHours, false);
  });

  test("no website row returns not_found, never success", async () => {
    const { admin } = makeMockDb({ businesses: [{ ...BIZ }] });
    const saved = await saveOperationalHoursWithClient({ organizerId: "org-1", hours: WEEK }, admin);
    assert.equal(saved.success, false);
    assert.equal(saved.code, "not_found");
  });

  test("invalid hours return validation_error without touching the store", async () => {
    const { store, admin } = makeMockDb({
      tenant_websites: [{ ...SITE }],
      businesses: [{ ...BIZ }],
      website_content: [{ website_id: "ws-1", content: { business_name: "A" } }],
    });
    const saved = await saveOperationalHoursWithClient({ organizerId: "org-1", hours: { mon: { open: "xx", close: "yy" } } }, admin);
    assert.equal(saved.success, false);
    assert.equal(saved.code, "validation_error");
    assert.deepEqual(store.website_content[0].content, { business_name: "A" });
  });

  test("write error returns db_error, never false success", async () => {
    const { admin } = makeMockDb(
      {
        tenant_websites: [{ ...SITE }],
        businesses: [{ ...BIZ }],
        website_content: [{ website_id: "ws-1", content: {} }],
      },
      { website_content: { update: { message: "boom", code: "XX000" } } }
    );
    const saved = await saveOperationalHoursWithClient({ organizerId: "org-1", hours: WEEK }, admin);
    assert.equal(saved.success, false);
    assert.equal(saved.code, "db_error");
  });

  test("verify-after-write catches a write that silently drops hours", async () => {
    const { admin } = makeMockDb(
      {
        tenant_websites: [{ ...SITE }],
        businesses: [{ ...BIZ }],
        website_content: [{ website_id: "ws-1", content: {} }],
      },
      { website_content: { dropHours: true } }
    );
    const saved = await saveOperationalHoursWithClient({ organizerId: "org-1", hours: WEEK }, admin);
    assert.equal(saved.success, false, "must not report success when the value is not readable");
    assert.equal(saved.code, "db_error");
  });
});

// ── Time zone ────────────────────────────────────────────────────────────────

describe("site time zone persistence (mock persistence layer)", () => {
  test("round trip: saved zone reads back; other metadata keys survive", async () => {
    const { store, admin } = makeMockDb({
      tenant_websites: [{ ...SITE, metadata: { storefront: { currency: "XOF" } } }],
      businesses: [{ ...BIZ }],
    });
    const saved = await saveSiteTimezoneWithClient({ organizerId: "org-1", timezone: "Africa/Abidjan" }, admin);
    assert.equal(saved.success, true);
    assert.deepEqual(store.tenant_websites[0].metadata.storefront, { currency: "XOF" });
    assert.equal(store.tenant_websites[0].metadata.timezone, "Africa/Abidjan");

    const read = await getOperationalSettingsWithClient("org-1", admin);
    assert.equal(read.data.timezone, "Africa/Abidjan");
    assert.equal(read.data.timezoneDefault, "Africa/Abidjan");
  });

  test("invalid zones are rejected before any write", async () => {
    const { store, admin } = makeMockDb({
      tenant_websites: [{ ...SITE, metadata: {} }],
      businesses: [{ ...BIZ }],
    });
    for (const bad of ["Mars/Olympus", "", "  ", null]) {
      const res = await saveSiteTimezoneWithClient({ organizerId: "org-1", timezone: bad }, admin);
      assert.equal(res.success, false);
      assert.equal(res.code, "validation_error");
    }
    assert.deepEqual(store.tenant_websites[0].metadata, {});
  });

  test("write error on timezone returns db_error", async () => {
    const { admin } = makeMockDb(
      { tenant_websites: [{ ...SITE, metadata: {} }], businesses: [{ ...BIZ }] },
      { tenant_websites: { update: { message: "boom", code: "XX000" } } }
    );
    const res = await saveSiteTimezoneWithClient({ organizerId: "org-1", timezone: "Africa/Abidjan" }, admin);
    assert.equal(res.success, false);
    assert.equal(res.code, "db_error");
  });
});
