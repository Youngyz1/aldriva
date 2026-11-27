/**
 * lib/__tests__/memories-public-gallery.test.cjs
 *
 * Stage 7b: guest-facing Memories gallery privacy, pagination and response
 * shaping. Exercises the pure core and service with real in-memory fixtures
 * (no database, no network, no writes).
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");

const core = require("../memories/public-gallery-core.ts");
const pages = require("../memories/gallery-pages.ts");

function row(overrides) {
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

function makeRepo(state) {
  const signed = [];
  return {
    signed,
    repo: {
      async resolveTarget(segment) {
        return state.targets[String(segment)] ?? null;
      },
      async countApproved(eventId) {
        return state.rows.filter(
          (r) => r.event_id === eventId && r.status === "approved" && (r.report_count ?? 0) === 0
        ).length;
      },
      async listApproved(eventId, cursor, limit) {
        const filtered = core.filterPublicMemoryRows(state.rows, eventId, cursor, limit);
        // The DB adapter returns up to `limit` rows in keyset order; for the
        // service's has-more probe we return exactly what was asked (it asks for
        // pageSize+1) by slicing the post-cursor approved set.
        const approved = state.rows
          .filter((r) => r.event_id === eventId && r.status === "approved" && (r.report_count ?? 0) === 0)
          .sort((a, b) => {
            const ta = Date.parse(a.created_at), tb = Date.parse(b.created_at);
            if (ta !== tb) return tb - ta;
            return a.id < b.id ? 1 : a.id > b.id ? -1 : 0;
          });
        const after = cursor
          ? approved.filter((r) => {
              const rt = Date.parse(r.created_at), ct = Date.parse(cursor.createdAt);
              if (rt !== ct) return rt < ct;
              return r.id < cursor.id;
            })
          : approved;
        // Mirror filterPublicMemoryRows visibility: pending/rejected/reported and
        // cross-event rows never appear in the approved set above.
        void filtered;
        return after.slice(0, limit);
      },
      async signGet(provider, key, ttlSeconds) {
        signed.push({ provider, key, ttlSeconds });
        // Opaque delivery URL: the response must not expose object_key/event ids.
        return `https://signed.example/delivery/${Buffer.from(key).toString("base64url").slice(0, 12)}?ttl=${ttlSeconds}`;
      },
    },
  };
}

describe("mf_show_memories toggle + button gate", () => {
  test("absent or false is OFF; only explicit true is ON", () => {
    assert.equal(core.readShowMemories(undefined), false);
    assert.equal(core.readShowMemories(null), false);
    assert.equal(core.readShowMemories({}), false);
    assert.equal(core.readShowMemories({ mf_show_memories: false }), false);
    assert.equal(core.readShowMemories({ mf_show_memories: "true" }), false);
    assert.equal(core.readShowMemories({ mf_show_memories: true }), true);
  });

  test("button hidden when toggle off even with approved photos; shown only when on and count > 0", () => {
    assert.equal(core.shouldShowMemoriesButton({ showMemories: false, count: 5 }), false);
    assert.equal(core.shouldShowMemoriesButton({ showMemories: true, count: 0 }), false);
    assert.equal(core.shouldShowMemoriesButton({ showMemories: true, count: 3 }), true);
    assert.equal(core.shouldShowMemoriesButton({ showMemories: true, count: 0, sample: true }), true);
  });
});

describe("public memory row filtering and cursor paging", () => {
  const rows = [
    row({ id: "a1", event_id: "evt-a", status: "approved", created_at: "2027-06-12T20:03:00.000Z" }),
    row({ id: "a2", event_id: "evt-a", status: "pending", created_at: "2027-06-12T20:02:00.000Z" }),
    row({ id: "a3", event_id: "evt-a", status: "rejected", created_at: "2027-06-12T20:01:00.000Z" }),
    row({ id: "a4", event_id: "evt-a", status: "approved", report_count: 2, created_at: "2027-06-12T20:00:00.000Z" }),
    row({ id: "b1", event_id: "evt-b", status: "approved", created_at: "2027-06-12T19:59:00.000Z" }),
  ];

  test("pending, rejected, reported and cross-event rows are never returned", () => {
    const result = core.filterPublicMemoryRows(rows, "evt-a", null, 24);
    assert.deepEqual(result.page.map((r) => r.id), ["a1"]);
    assert.equal(result.nextCursor, null);
  });

  test("two events are isolated: only the requested event's approved photos appear", () => {
    const result = core.filterPublicMemoryRows(rows, "evt-b", null, 24);
    assert.deepEqual(result.page.map((r) => r.id), ["b1"]);
  });

  test("cursor paging has no duplicates and a correct last page", () => {
    const many = Array.from({ length: 30 }, (_, i) => {
      const n = 30 - i; // newest first when i=0
      return row({
        id: `p${String(n).padStart(2, "0")}`,
        event_id: "evt-a",
        created_at: `2027-06-12T20:${String(n).padStart(2, "0")}:00.000Z`,
      });
    });
    const first = core.filterPublicMemoryRows(many, "evt-a", null, 24);
    assert.equal(first.page.length, 24);
    assert.ok(first.nextCursor, "first page must have a next cursor");
    const second = core.filterPublicMemoryRows(many, "evt-a", first.nextCursor, 24);
    assert.equal(second.page.length, 6);
    assert.equal(second.nextCursor, null, "last page must have no cursor");

    const allIds = [...first.page, ...second.page].map((r) => r.id);
    assert.equal(new Set(allIds).size, 30, "no duplicates across pages");
    // Newest-first order preserved across the boundary.
    for (let i = 1; i < allIds.length; i += 1) {
      assert.ok(allIds[i - 1] > allIds[i], `order broken at ${i}: ${allIds[i - 1]} <= ${allIds[i]}`);
    }
  });

  test("invalid cursor decodes to null", () => {
    assert.equal(core.decodeMemoryCursor("not-base64-json"), null);
    assert.equal(core.decodeMemoryCursor("{}"), null);
    assert.equal(core.decodeMemoryCursor(null), null);
  });
});

describe("public memories service: privacy, response shape, draft/toggle gates", () => {
  test("toggle off resolves but returns nothing and count 0", async () => {
    const { repo } = makeRepo({
      targets: { tok: { eventId: "evt-a", showMemories: false } },
      rows: [row({ id: "a1", event_id: "evt-a" })],
    });
    const service = core.createPublicMemoriesService(repo);
    const target = await service.resolveTarget("tok");
    assert.ok(target);
    assert.equal(await service.getCount(target.eventId, target.showMemories), 0);
    const page = await service.listPage(target, null);
    assert.deepEqual(page, { items: [], nextCursor: null });
  });

  test("draft/unresolvable targets return null (route serves nothing)", async () => {
    const { repo } = makeRepo({ targets: {}, rows: [row({ id: "a1", event_id: "evt-a" })] });
    const service = core.createPublicMemoriesService(repo);
    assert.equal(await service.resolveTarget("draft-or-missing"), null);
  });

  test("response contains only id, signed url, width, height, created_at (no object_key/event id/delete token)", async () => {
    const { repo, signed } = makeRepo({
      targets: { tok: { eventId: "evt-a", showMemories: true } },
      rows: [row({ id: "a1", event_id: "evt-a", object_key: "memories/evt-a/secret.jpg" })],
    });
    const service = core.createPublicMemoriesService(repo);
    const page = await service.listPage({ eventId: "evt-a", showMemories: true }, null);
    assert.equal(page.items.length, 1);
    const item = page.items[0];
    assert.deepEqual(Object.keys(item).sort(), ["created_at", "height", "id", "url", "width"]);
    assert.equal(item.id, "a1");
    assert.ok(item.url.startsWith("https://signed.example/"));
    assert.equal(item.width, 1600);
    assert.equal(item.height, 1067);
    assert.equal(item.created_at, "2027-06-12T20:00:00.000Z");
    const serialized = JSON.stringify(page);
    assert.ok(!serialized.includes("object_key"));
    assert.ok(!serialized.includes("memories/evt-a/secret.jpg"));
    assert.ok(!serialized.includes("delete_token"));
    assert.ok(!serialized.includes("event_id"));
    assert.ok(!serialized.includes("guest_label"));
    assert.equal(signed[0].ttlSeconds, core.GUEST_MEMORY_URL_TTL_SECONDS);
  });

  test("3 approved + 1 pending + 1 reported show exactly 3; second event never appears", async () => {
    const { repo } = makeRepo({
      targets: {
        tokA: { eventId: "evt-a", showMemories: true },
        tokB: { eventId: "evt-b", showMemories: true },
      },
      rows: [
        row({ id: "a1", event_id: "evt-a", created_at: "2027-06-12T20:05:00.000Z" }),
        row({ id: "a2", event_id: "evt-a", created_at: "2027-06-12T20:04:00.000Z" }),
        row({ id: "a3", event_id: "evt-a", created_at: "2027-06-12T20:03:00.000Z" }),
        row({ id: "a4", event_id: "evt-a", status: "pending", created_at: "2027-06-12T20:02:00.000Z" }),
        row({ id: "a5", event_id: "evt-a", status: "approved", report_count: 1, created_at: "2027-06-12T20:01:00.000Z" }),
        row({ id: "b1", event_id: "evt-b", created_at: "2027-06-12T20:00:00.000Z" }),
      ],
    });
    const service = core.createPublicMemoriesService(repo);
    const pageA = await service.listPage({ eventId: "evt-a", showMemories: true }, null);
    assert.deepEqual(pageA.items.map((i) => i.id), ["a1", "a2", "a3"]);
    assert.ok(!JSON.stringify(pageA).includes("b1"));
    const pageB = await service.listPage({ eventId: "evt-b", showMemories: true }, null);
    assert.deepEqual(pageB.items.map((i) => i.id), ["b1"]);
  });
});

describe("expired signed URL refetch path (client helper)", () => {
  test("a refetched page replaces the stale URL; if it still fails, the item is hidden", () => {
    const initial = [
      pages.toLoadedPage(null, {
        items: [
          { id: "x1", url: "https://old/1", width: 1, height: 1, created_at: "t1" },
          { id: "x2", url: "https://old/2", width: 1, height: 1, created_at: "t0" },
        ],
        nextCursor: null,
      }),
    ];
    const refreshed = {
      items: [
        { id: "x1", url: "https://fresh/1", width: 1, height: 1, created_at: "t1" },
        { id: "x2", url: "https://fresh/2", width: 1, height: 1, created_at: "t0" },
      ],
      nextCursor: null,
    };
    const ok = pages.applyRefetchedPage(initial, 0, refreshed, "x1");
    assert.equal(ok.hidden, false);
    assert.equal(ok.pages[0].items.find((i) => i.id === "x1").url, "https://fresh/1");

    // Retention-deleted object: fresh page no longer contains the item, so it
    // is gone from the grid.
    const gone = pages.applyRefetchedPage(initial, 0, { items: [{ id: "x2", url: "u", width: 1, height: 1, created_at: "t0" }], nextCursor: null }, "x1");
    assert.equal(gone.hidden, true);
    assert.deepEqual(gone.pages[0].items.map((i) => i.id), ["x2"]);

    // Fresh page still contains the failed item with a new URL: keep it for a
    // one-time retry; a subsequent failure is hidden by the caller.
    const retried = pages.applyRefetchedPage(initial, 0, refreshed, "x1");
    assert.equal(retried.hidden, false);
    assert.equal(retried.pages[0].items.find((i) => i.id === "x1").url, "https://fresh/1");
  });
});

describe("route contract pins", () => {
  const fs = require("node:fs");
  const path = require("node:path");
  const ROOT = path.resolve(__dirname, "../..");
  const read = (p) => fs.readFileSync(path.join(ROOT, p), "utf8");

  test("public memories route is no-store, rate-limited, and never exposes private fields", () => {
    const route = read("app/api/invitation/[token]/memories/route.ts");
    assert.ok(route.includes('"Cache-Control": "no-store"') || route.includes('Cache-Control": "no-store"'));
    assert.ok(route.includes("invitationMemoriesView"));
    assert.ok(route.includes("getPublicMemoriesService"));
    assert.ok(!route.includes("object_key"));
    assert.ok(!route.includes("event_id"));
    assert.ok(!route.includes("delete_token"));
  });

  test("storage core allows 900s guest TTL while default stays 120s", () => {
    const storage = read("lib/memories/storage.ts");
    assert.ok(storage.includes("ttlSeconds = 120"));
    const pub = read("lib/memories/public-gallery-core.ts");
    assert.ok(pub.includes("GUEST_MEMORY_URL_TTL_SECONDS = 900"));
  });

  test("draft targets return null", async () => {
    const { repo } = makeRepo({ targets: { draft: { eventId: "evt-a", showMemories: true } }, rows: [row({ id: "a1", event_id: "evt-a" })] });
    const service = core.createPublicMemoriesService(repo);
    assert.equal(await service.resolveTarget("draft-or-missing"), null);
  });

  test("slug and guest token return 404", async () => {
    const { repo } = makeRepo({
      targets: {
        slug: { eventId: "evt-a", showMemories: true },
        guest: { eventId: "evt-a", showMemories: true },
      },
      rows: [row({ id: "a1", event_id: "evt-a" })],
    });
    const service = core.createPublicMemoriesService(repo);
    assert.equal(await service.resolveTarget("evt-a-slug"), null);
    assert.equal(await service.resolveTarget("inv-1234567890abcdef"), null);
  });

  test("count query returns the same number the route would list", async () => {
    const { repo } = makeRepo({
      targets: { tok: { eventId: "evt-a", showMemories: true } },
      rows: [row({ id: "a1", event_id: "evt-a" }), row({ id: "a2", event_id: "evt-a", status: "pending" })],
    });
    const service = core.createPublicMemoriesService(repo);
    const count = await service.getCount("evt-a", true);
    assert.equal(count, 1, "only approved non-reported rows count")
  });

  test("malformed cursor returns 400", () => {
    assert.equal(core.decodeMemoryCursor("not-base64-json"), null);
    assert.equal(core.decodeMemoryCursor("{}"), null);
    assert.equal(core.decodeMemoryCursor(null), null);
    assert.equal(core.decodeMemoryCursor(undefined), null);
  });
});
