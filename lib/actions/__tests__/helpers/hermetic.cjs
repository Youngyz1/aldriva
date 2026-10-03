/**
 * Hermetic harness for behavioral tests of TS server actions and routes.
 *
 * - Installs the TypeScript transpile hook + `@/` alias (claim.test.cjs precedent).
 * - Pre-populates require.cache with boundary stubs (auth, database clients,
 *   rate limiter, next/cache, next/navigation). ONLY boundaries are stubbed:
 *   the action/route under test and its real lib chain execute.
 * - Fake Supabase client: thenable query builder over in-memory tables,
 *   recording every read/write/rpc for outcome assertions.
 */
const Module = require("node:module");
const path = require("node:path");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../../..");

let installed = false;
const originalResolveFilename = Module._resolveFilename;

function installHook() {
  if (installed) return;
  installed = true;
  require.extensions[".ts"] = function compileTs(module, filename) {
    const source = require("node:fs").readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
      fileName: filename,
    }).outputText;
    module._compile(output, filename);
  };
  Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
}

function resolveInRoot(rel) {
  return path.join(ROOT, rel);
}

/** Thenable fake query builder: .select/.eq/.or/.order/.limit/.update + await. */
class FakeQuery {
  constructor(db, table) {
    this.db = db;
    this.table = table;
    this.filters = [];
    this.patch = null;
  }
  select() { return this; }
  eq(k, v) { this.filters.push([k, v]); return this; }
  neq(k, v) { this.filters.push([k, v, false, "neq"]); return this; }
  gt(k, v) { this.filters.push([k, v, false, "gt"]); return this; }
  gte(k, v) { this.filters.push([k, v, false, "gte"]); return this; }
  lt(k, v) { this.filters.push([k, v, false, "lt"]); return this; }
  lte(k, v) { this.filters.push([k, v, false, "lte"]); return this; }
  in(k, vs) { this.filters.push([k, vs, false, "in"]); return this; }
  in(k, vs) { this.filters.push([k, vs, false, "in"]); return this; }
  is(k, v) { this.filters.push([k, v === null ? null : v, true]); return this; }
  or() { return this; }
  order() { return this; }
  limit() { return this; }
  update(patch) { this.patch = patch; return this; }
  upsert(row, opts = {}) {
    const table = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    const conflict = String(opts.onConflict ?? "").split(",").map((s) => s.trim()).filter(Boolean);
    const idx = conflict.length
      ? table.findIndex((r) => conflict.every((k) => r[k] === row[k]))
      : -1;
    if (idx >= 0) table[idx] = { ...table[idx], ...row };
    else table.push({ ...row });
    this.db.calls.upserts = this.db.calls.upserts ?? [];
    this.db.calls.upserts.push({ table: this.table, row, replaced: idx >= 0 });
    return Promise.resolve({ error: null });
  }
  single() { return this; }
  maybeSingle() { return this; }
  insert(row) {
    const table = this.db.tables[this.table] ?? (this.db.tables[this.table] = []);
    const rows = Array.isArray(row) ? row : [row];
    for (const r of rows) table.push({ ...r });
    this.db.calls.inserts = this.db.calls.inserts ?? [];
    this.db.calls.inserts.push({ table: this.table, count: rows.length });
    const inserted = rows;
    return {
      select() { return this; },
      single() { return this; },
      then(resolve) { resolve({ data: inserted, error: null }); },
    };
  }
  matched() {
    const rows = this.db.tables[this.table] ?? [];
    return rows.filter((r) => this.filters.every(([k, v, isNull, op]) => {
      if (isNull) return r[k] === null || r[k] === undefined;
      if (op === "neq") return r[k] !== v;
      if (op === "gt") return r[k] > v;
      if (op === "gte") return r[k] >= v;
      if (op === "lt") return r[k] < v;
      if (op === "lte") return r[k] <= v;
      if (op === "in") return Array.isArray(v) && v.includes(r[k]);
      return r[k] === v;
    }));
  }
  then(resolve) {
    const rows = this.matched();
    if (this.patch) {
      // Stage 17: optional per-table write failure injection (transition
      // failure must not fail the decision). Resolves an error like PostgREST.
      if (this.db.failTables && this.db.failTables.has(this.table)) {
        resolve({ data: null, error: { message: "injected write failure" } });
        return;
      }
      for (const r of rows) Object.assign(r, this.patch);
      this.db.calls.updates.push({ table: this.table, patch: this.patch, count: rows.length });
    } else {
      this.db.calls.selects.push({ table: this.table, filters: this.filters });
    }
    resolve({ data: rows, error: null });
  }
}

function makeFakeDb(seedTables = {}, rpcHandler = null) {
  const db = {
    tables: JSON.parse(JSON.stringify(seedTables)),
    calls: { selects: [], updates: [], rpcs: [] },
    from(table) { return new FakeQuery(db, table); },
    rpc(fn, params) {
      db.calls.rpcs.push({ fn, params });
      if (rpcHandler) return Promise.resolve(rpcHandler(fn, params, db));
      return Promise.resolve({ data: null, error: { message: "no rpc handler" } });
    },
  };
  return db;
}

/**
 * Install boundary stubs, then require the real target module.
 * opts: { auth: {mode:'admin'|'reject', userId}, rate: {allowed:boolean},
 *         adminDb: FakeDb, serverDb: FakeDb, events: array }
 * Returns { mod, stubs } where stubs records calls (adminFactoryCalls,
 * redirects, revalidations, events).
 *
 * Stub objects are module-level singletons mutated per call: required
 * targets are cached by Node after first load and keep referencing these
 * same objects, so per-test behavior flags must mutate — never replace.
 */
const shared = {
  authMode: "admin",
  userId: "admin-user-id",
  rateAllowed: true,
  adminDb: null,
  serverDb: null,
  adminFactoryCalls: 0,
  serverFactoryCalls: 0,
  redirects: [],
  revalidations: [],
  events: [],
};

const authExports = {
  requireAdmin: async () => {
    if (shared.authMode === "reject") {
      const e = new Error("NEXT_REDIRECT: not admin");
      e.digest = "NEXT_REDIRECT;push;/sign-in;307;";
      throw e;
    }
  },
  getCurrentUser: async () => (shared.authMode === "reject" ? null : { id: shared.userId }),
  isAdmin: async () => shared.authMode === "admin",
};
const rateExports = {
  checkRateLimit: async () => ({ allowed: shared.rateAllowed, remaining: 0, retryAfter: 0 }),
  enforceRateLimit: async () => null,
  clientIp: () => "127.0.0.1",
  identifierFor: () => "ip:127.0.0.1",
};
const eventsExports = {
  insertSystemEvent: async (input) => { shared.events.push(input); return "event-id"; },
  logThrottledAuthDenial: async (...args) => {
    shared.events.push({ denialArgs: args.map((a) => (typeof a === "string" ? a : "[request]")) });
  },
};
const cacheExports = {
  revalidatePath: (p) => { shared.revalidations.push(p); },
};
const navExports = {
  redirect: (url) => {
    shared.redirects.push(url);
    const e = new Error("NEXT_REDIRECT");
    e.digest = `NEXT_REDIRECT;push;${url};307;`;
    throw e;
  },
};

function loadWithStubs(targetRel, opts = {}) {
  installHook();
  shared.authMode = opts.auth?.mode ?? "admin";
  shared.userId = opts.auth?.userId ?? "admin-user-id";
  shared.rateAllowed = opts.rate?.allowed ?? true;
  shared.adminDb = opts.adminDb ?? makeFakeDb();
  shared.serverDb = opts.serverDb ?? makeFakeDb();
  shared.adminFactoryCalls = 0;
  shared.serverFactoryCalls = 0;
  shared.redirects = [];
  shared.revalidations = [];
  shared.events = opts.events ?? [];

  require.cache[resolveInRoot("lib/auth.ts")] = { exports: authExports };
  require.cache[resolveInRoot("lib/supabase-admin.ts")] = {
    exports: { createSupabaseAdmin: () => { shared.adminFactoryCalls += 1; return shared.adminDb; } },
  };
  require.cache[resolveInRoot("lib/supabase-server.ts")] = {
    exports: { createSupabaseServer: async () => { shared.serverFactoryCalls += 1; return shared.serverDb; } },
  };
  require.cache[resolveInRoot("lib/rate-limit.ts")] = { exports: rateExports };
  require.cache[resolveInRoot("lib/observability/system-events.ts")] = { exports: eventsExports };
  require.cache[require.resolve("next/cache")] = { exports: cacheExports };
  require.cache[require.resolve("next/navigation")] = { exports: navExports };

  const mod = require(resolveInRoot(targetRel));
  return { mod, stubs: shared, adminDb: shared.adminDb, serverDb: shared.serverDb };
}

function redirectUrl(err) {
  const m = /NEXT_REDIRECT;push;([^;]+);/.exec(String(err && err.digest));
  if (!m) throw new Error(`expected a redirect, got: ${err && err.message}`);
  return m[1];
}

module.exports = { ROOT, installHook, makeFakeDb, loadWithStubs, redirectUrl };
