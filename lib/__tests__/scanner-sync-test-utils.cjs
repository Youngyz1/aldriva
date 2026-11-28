/**
 * Shared no-network test harness for lib/__tests__/scanner-sync-*.test.cjs.
 * Not itself a test file (not listed in test-files.json) - required by both.
 *
 * Mirrors the TS-loader/module-alias plumbing in scanner-phase-1.test.cjs,
 * plus a fake Supabase admin that actually mutates an in-memory table store
 * on .update()/.insert() (the existing fake in scanner-phase-1.test.cjs only
 * supports reads, which is why this is a separate harness).
 */
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");
const crypto = require("crypto");

const ROOT = path.resolve(__dirname, "../..");

function installTsLoader() {
  const originalResolveFilename = Module._resolveFilename;
  Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
    if (request.startsWith("@/")) {
      return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
    }
    return originalResolveFilename.call(this, request, parent, isMain, options);
  };
  require.extensions[".ts"] = function compileTs(mod, filename) {
    const source = fs.readFileSync(filename, "utf8");
    const output = ts.transpileModule(source, {
      compilerOptions: {
        esModuleInterop: true,
        module: ts.ModuleKind.CommonJS,
        target: ts.ScriptTarget.ES2020,
      },
      fileName: filename,
    }).outputText;
    mod._compile(output, filename);
  };
}

function rowMatches(row, filters) {
  return Object.entries(filters).every(([k, v]) => row[k] === v);
}

/**
 * db: { [table]: row[], insertFailures?: { [table]: errorObj | (payload => errorObj|null) } }
 * writeLog: array that every update()/insert() call appends {type, table, payload} to.
 */
function makeFakeAdmin(db, writeLog = []) {
  return {
    auth: {
      getUser: async (token) => ({ data: { user: (db.authUsers || {})[token] || null } }),
    },
    rpc: async () => ({ data: null, error: null }),
    from(table) {
      const rows = db[table] || (db[table] = []);
      const eqFilters = {};
      let mode = "select";
      let payload = null;

      const builder = {
        select() {
          return builder;
        },
        eq(k, v) {
          eqFilters[k] = v;
          return builder;
        },
        is(k, v) {
          eqFilters[k] = v;
          return builder;
        },
        update(p) {
          mode = "update";
          payload = p;
          writeLog.push({ type: "update", table, payload: p, filters: { ...eqFilters } });
          return builder;
        },
        insert(p) {
          mode = "insert";
          payload = p;
          writeLog.push({ type: "insert", table, payload: p });
          return resolve();
        },
        maybeSingle() {
          return resolve();
        },
        then(onResolve, onReject) {
          return resolve().then(onResolve, onReject);
        },
      };

      function resolve() {
        if (mode === "insert") {
          const failure = (db.insertFailures || {})[table];
          const err = typeof failure === "function" ? failure(payload) : failure;
          if (err) return Promise.resolve({ data: null, error: err });
          rows.push({ id: payload.id || crypto.randomUUID(), ...payload });
          return Promise.resolve({ data: null, error: null });
        }
        if (mode === "update") {
          const idx = rows.findIndex((r) => rowMatches(r, eqFilters));
          if (idx === -1) return Promise.resolve({ data: null, error: null });
          const failure = (db.updateFailures || {})[table];
          const err = typeof failure === "function" ? failure(payload, rows[idx]) : failure;
          if (err) return Promise.resolve({ data: null, error: err });
          rows[idx] = { ...rows[idx], ...payload };
          return Promise.resolve({ data: { ...rows[idx] }, error: null });
        }
        const matches = rows.filter((r) => rowMatches(r, eqFilters));
        return Promise.resolve({ data: matches[0] ?? null, error: null });
      }

      return builder;
    },
  };
}

function freshDb(overrides = {}) {
  return {
    ticket_instances: [],
    ticket_checkins: [],
    offline_scan_conflicts: [],
    scanner_token_revocations: [],
    authUsers: {},
    insertFailures: {},
    ...overrides,
  };
}

module.exports = { ROOT, installTsLoader, makeFakeAdmin, freshDb, rowMatches };
