/**
 * lib/__tests__/memories-route-integration.test.cjs
 *
 * Calls the REAL GET handler from
 * app/api/invitation/[token]/memories/route.ts with constructed Request
 * objects and asserts on the real Response (status, headers, body text).
 *
 * Module loading follows the repo convention used by
 * lib/__tests__/r2-media-amendment.test.cjs:6,22,80-90,107 and
 * lib/security/__tests__/certificate-authorization.test.cjs:13,22-32 —
 * register require.extensions[".ts"] with ts.transpileModule, alias "@/".
 *
 * The only things injected are the Supabase client (@/lib/supabase-admin) and
 * the storage client (@/lib/memories/storage). The route, the public-gallery
 * service, the core filtering/pagination and the rate-limit helper are real.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const Module = require("node:module");
const { describe, test } = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

// ---------------------------------------------------------------------------
// In-memory fixture the injected Supabase client serves from.
// ---------------------------------------------------------------------------

const tokenA = "a".repeat(64);
const tokenB = "b".repeat(64);
const tokenShareOff = "c".repeat(64);
const tokenToggleOff = "d".repeat(64);
const tokenDraft = "e".repeat(64);
const tokenUnknown = "f".repeat(64);

function memoryRow(overrides) {
  return Object.assign(
    {
      id: "m1",
      event_id: "evt-a",
      storage_provider: "supabase",
      object_key: "memories/evt-a/photo-1.jpg",
      width: 1600,
      height: 1067,
      status: "approved",
      report_count: 0,
      created_at: "2027-06-12T20:00:00.000Z",
    },
    overrides
  );
}

const pageRow = (eventId, shareToken, extra = {}) => ({
  event_id: eventId,
  page_status: "published",
  share_enabled: true,
  share_token: shareToken,
  published_snapshot: {
    blocks_layout: { template_data: { mf_show_memories: true } },
  },
  ...extra,
});

// 30 approved photos for evt-a (drives the two-page pagination assertions).
const evtARows = Array.from({ length: 30 }, (_, i) => {
  const n = 30 - i;
  return memoryRow({
    id: `a${String(n).padStart(2, "0")}`,
    event_id: "evt-a",
    created_at: `2027-06-12T20:${String(n).padStart(2, "0")}:00.000Z`,
  });
});

// evt-b: 4 approved + 1 pending + 1 rejected + 1 reported.
const evtBRows = [
  memoryRow({ id: "b4", event_id: "evt-b", created_at: "2027-06-12T19:04:00.000Z" }),
  memoryRow({ id: "b3", event_id: "evt-b", created_at: "2027-06-12T19:03:00.000Z" }),
  memoryRow({ id: "b2", event_id: "evt-b", created_at: "2027-06-12T19:02:00.000Z" }),
  memoryRow({ id: "b1", event_id: "evt-b", created_at: "2027-06-12T19:01:00.000Z" }),
  memoryRow({ id: "bPending", event_id: "evt-b", status: "pending", created_at: "2027-06-12T19:00:00.000Z" }),
  memoryRow({ id: "bRejected", event_id: "evt-b", status: "rejected", created_at: "2027-06-12T18:59:00.000Z" }),
  memoryRow({ id: "bReported", event_id: "evt-b", status: "approved", report_count: 2, created_at: "2027-06-12T18:58:00.000Z" }),
];

const fixture = {
  pages: [
    pageRow("evt-a", tokenA),
    pageRow("evt-b", tokenB),
    pageRow("evt-a", tokenShareOff, { share_enabled: false }),
    pageRow("evt-a", tokenToggleOff, {
      published_snapshot: { blocks_layout: { template_data: {} } },
    }),
    pageRow("evt-a", tokenDraft, { page_status: "draft" }),
  ],
  rows: [...evtARows, ...evtBRows],
};

// ---------------------------------------------------------------------------
// Fake Supabase client: only the query shapes public-gallery.ts and
// rate-limit.ts use. Everything else in the stack is the real module.
// ---------------------------------------------------------------------------

function applyEqFilters(rows, filters) {
  return rows.filter((row) => filters.every(([column, value]) => row[column] === value));
}

class FakeQuery {
  constructor(table) {
    this.table = table;
    this.filters = [];
    this.countRequested = false;
    this.headOnly = false;
    this.limitCount = null;
    this.orExpression = null;
  }

  select(_columns, options) {
    if (options && options.count) this.countRequested = true;
    if (options && options.head) this.headOnly = true;
    return this;
  }

  eq(column, value) {
    this.filters.push([column, value]);
    return this;
  }

  order() {
    return this;
  }

  limit(count) {
    this.limitCount = count;
    return this;
  }

  or(expression) {
    this.orExpression = expression;
    return this;
  }

  async maybeSingle() {
    return this.resolve();
  }

  then(resolve, reject) {
    try {
      resolve(this.resolve());
    } catch (error) {
      reject(error);
    }
  }

  resolve() {
    if (this.table === "event_invitation_pages") {
      const rows = applyEqFilters(fixture.pages, this.filters);
      return { data: rows[0] ?? null, error: null };
    }

    if (this.table === "event_memories") {
      const matching = applyEqFilters(fixture.rows, this.filters);
      if (this.countRequested && this.headOnly) {
        return { data: null, count: matching.length, error: null };
      }

      let rows = matching.slice().sort((a, b) => {
        const at = Date.parse(a.created_at);
        const bt = Date.parse(b.created_at);
        if (at !== bt) return bt - at;
        if (a.id === b.id) return 0;
        return a.id < b.id ? 1 : -1;
      });

      if (this.orExpression) {
        const match = this.orExpression.match(
          /^created_at\.lt\.([^,]+),and\(created_at\.eq\.([^,]+),id\.lt\.(.+)\)$/
        );
        assert.ok(match, `unexpected cursor expression: ${this.orExpression}`);
        const [, lt, eq, ltId] = match;
        rows = rows.filter((row) => {
          const t = Date.parse(row.created_at);
          return t < Date.parse(lt) || (t === Date.parse(eq) && row.id < ltId);
        });
      }

      if (typeof this.limitCount === "number") rows = rows.slice(0, this.limitCount);
      return { data: rows, error: null };
    }

    return { data: null, error: null };
  }
}

const fakeStorage = {
  getMemoryStorageDriverFor() {
    return {
      async signGet(key, ttlSeconds) {
        return `https://signed.test/${Buffer.from(key, "utf8").toString("base64url")}?ttl=${ttlSeconds}`;
      },
    };
  },
};

// ---------------------------------------------------------------------------
// Load the real route + real public-gallery with only the two clients injected.
// ---------------------------------------------------------------------------

const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const originalLoad = Module._load;
Module._load = function loadInjectedClients(request, parent, isMain) {
  if (request === "server-only") return {};
  if (request === "@/lib/supabase-admin") {
    return {
      createSupabaseAdmin: () => ({
        from: (table) => new FakeQuery(table),
        rpc: async () => ({
          data: [{ allowed: true, remaining: 100, retry_after: 0 }],
          error: null,
        }),
      }),
    };
  }
  if (request === "@/lib/memories/storage") return fakeStorage;
  return originalLoad.call(this, request, parent, isMain);
};

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
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

const { GET } = require("../../app/api/invitation/[token]/memories/route.ts");
const { getApprovedMemoriesCount } = require("../memories/public-gallery.ts");
const { resolveMemoriesProps } = require("../memories/resolve-memories-props.ts");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function callGet(token, { cursor } = {}) {
  const suffix = cursor === undefined ? "" : `?cursor=${encodeURIComponent(cursor)}`;
  const request = new Request(`http://localhost/api/invitation/${token}/memories${suffix}`);
  return GET(request, { params: Promise.resolve({ token }) });
}

async function callAndRead(token, options) {
  const response = await callGet(token, options);
  return { response, body: await response.text() };
}

// ---------------------------------------------------------------------------
// Assertions on the real Response
// ---------------------------------------------------------------------------

describe("real GET handler: status codes", () => {
  test("malformed cursor returns 400", async () => {
    const { response } = await callAndRead(tokenA, { cursor: "not-base64-json" });
    assert.equal(response.status, 400);
    assert.equal(response.headers.get("cache-control"), "no-store");
  });

  test("event slug returns 404", async () => {
    const { response } = await callAndRead("evt-a-slug");
    assert.equal(response.status, 404);
  });

  test("guest invitation token returns 404", async () => {
    const { response } = await callAndRead("inv-1234567890abcdef");
    assert.equal(response.status, 404);
  });

  test("unknown token returns 404", async () => {
    const { response } = await callAndRead(tokenUnknown);
    assert.equal(response.status, 404);
  });

  test("draft page returns 404", async () => {
    const { response } = await callAndRead(tokenDraft);
    assert.equal(response.status, 404);
  });

  test("mf_show_memories off returns 404", async () => {
    const { response } = await callAndRead(tokenToggleOff);
    assert.equal(response.status, 404);
  });

  test("share_enabled false returns 404", async () => {
    const { response } = await callAndRead(tokenShareOff);
    assert.equal(response.status, 404);
  });

  test("every 404 body is byte-identical", async () => {
    const tokens = ["evt-a-slug", "inv-1234567890abcdef", tokenUnknown, tokenDraft, tokenToggleOff, tokenShareOff];
    const bodies = [];
    for (const token of tokens) {
      const { response, body } = await callAndRead(token);
      assert.equal(response.status, 404);
      assert.equal(response.headers.get("cache-control"), "no-store");
      bodies.push(body);
    }
    for (const body of bodies) {
      assert.equal(body, bodies[0], `404 body differs: ${body} !== ${bodies[0]}`);
    }
  });
});

describe("real GET handler: happy path", () => {
  test("items are exactly {id,url,width,height,created_at} and Cache-Control is no-store", async () => {
    const response = await callGet(tokenA);
    assert.equal(response.status, 200);
    assert.equal(response.headers.get("cache-control"), "no-store");

    const body = await response.json();
    assert.equal(body.items.length, 24);
    for (const item of body.items) {
      assert.deepEqual(
        Object.keys(item).sort(),
        ["created_at", "height", "id", "url", "width"].sort()
      );
      assert.equal(typeof item.id, "string");
      assert.match(item.url, /^https:\/\/signed\.test\//);
      assert.equal(typeof item.width, "number");
      assert.equal(typeof item.height, "number");
      assert.equal(typeof item.created_at, "string");
    }
  });

  test("page 2 has no duplicates and is the correct last page", async () => {
    const first = await callGet(tokenA);
    assert.equal(first.status, 200);
    const page1 = await first.json();
    assert.equal(page1.items.length, 24);
    assert.ok(page1.nextCursor, "first page must carry a cursor");

    const second = await callGet(tokenA, { cursor: page1.nextCursor });
    assert.equal(second.status, 200);
    assert.equal(second.headers.get("cache-control"), "no-store");
    const page2 = await second.json();

    assert.equal(page2.items.length, 6, "last page holds the remaining 6 of 30");
    assert.equal(page2.nextCursor, null, "last page must not carry a cursor");

    const ids = [...page1.items, ...page2.items].map((item) => item.id);
    assert.equal(ids.length, 30);
    assert.equal(new Set(ids).size, 30, "no duplicate ids across pages");
  });
});

describe("resolveMemoriesProps: never advertises memories the route would 404 on", () => {
  test("draft page yields no token and count 0", async () => {
    // evt-b really has approved rows, so an unguarded count would be 4.
    assert.equal(await getApprovedMemoriesCount("evt-b", true), 4);

    const draft = await resolveMemoriesProps(true, tokenB, "evt-b", true, "draft");
    assert.deepEqual(draft, { memoriesToken: undefined, memoriesCount: 0 });
  });

  test("published page still yields the token and count", async () => {
    const published = await resolveMemoriesProps(true, tokenB, "evt-b", true, "published");
    assert.deepEqual(published, { memoriesToken: tokenB, memoriesCount: 4 });
  });
});

describe("real GET handler: count/route parity on a two-event fixture", () => {
  test("getApprovedMemoriesCount equals total items listed across all pages", async () => {
    const count = await getApprovedMemoriesCount("evt-b", true);
    assert.equal(count, 4, "4 approved, non-reported rows for evt-b");

    const listed = [];
    let cursor;
    for (let page = 0; page < 10; page += 1) {
      const response = await callGet(tokenB, { cursor });
      assert.equal(response.status, 200);
      const body = await response.json();
      listed.push(...body.items);

      // Cross-event isolation: evt-a ids never leak into evt-b responses.
      for (const item of body.items) {
        assert.ok(!item.id.startsWith("a"), `evt-a row leaked into evt-b: ${item.id}`);
      }

      if (!body.nextCursor) break;
      cursor = body.nextCursor;
    }

    assert.equal(
      listed.length,
      count,
      "route items across all pages must equal the count query"
    );
    assert.deepEqual(
      listed.map((item) => item.id).sort(),
      ["b1", "b2", "b3", "b4"],
      "pending/rejected/reported rows are excluded"
    );
  });
});
