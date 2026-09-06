/**
 * H4 regression tests: GET /api/test-e2e.
 *
 * This test/mutation endpoint must never execute in production — for any
 * user, including admins. In non-production it keeps working (auth still
 * enforced) so E2E flows are unaffected.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(
      this,
      path.join(ROOT, request.slice(2)),
      parent,
      isMain,
      options
    );
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

class NextResponseShim extends Response {
  static json(body, init) {
    return Response.json(body, init);
  }
}

let getUserCalls = 0;

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "next/server") {
    return { NextResponse: NextResponseShim };
  }
  if (request === "@/lib/actions/articles") {
    return { createArticle: async () => ({}), updateArticle: async () => ({}) };
  }
  if (request === "@/lib/supabase-server") {
    return {
      createSupabaseServer: async () => ({
        auth: {
          getUser: async () => {
            getUserCalls += 1;
            return { data: { user: null } };
          },
        },
      }),
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const ROUTE_PATH = originalResolveFilename.call(
  module,
  path.join(ROOT, "app/api/test-e2e/route"),
  module,
  false
);

function loadRoute() {
  delete require.cache[ROUTE_PATH];
  return require(ROUTE_PATH);
}

test("H4: production disables the endpoint before auth", async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "production";
  try {
    getUserCalls = 0;
    const route = loadRoute();
    const res = await route.GET();
    assert.equal(res.status, 404);
    assert.equal(
      getUserCalls,
      0,
      "production guard must run before any session/database work"
    );
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});

test("H4: non-production keeps working with auth enforced", async () => {
  const previousEnv = process.env.NODE_ENV;
  process.env.NODE_ENV = "development";
  try {
    getUserCalls = 0;
    const route = loadRoute();
    const res = await route.GET();
    // No session in this harness → 401 from the route's own auth check.
    assert.equal(res.status, 401);
    assert.ok(getUserCalls > 0, "dev flow must still reach authentication");
  } finally {
    process.env.NODE_ENV = previousEnv;
  }
});
