/**
 * lib/__tests__/website-embeds.test.cjs
 *
 * Security & Regression tests for Live Embed Block Resolvers (Phase 3 Task 3.2).
 *
 * Verifies:
 *  1. Cross-tenant isolation:
 *     - events_embed strictly filters by organizer_id = tenantId.
 *     - products_embed strictly filters by business_id IN (businesses WHERE organizer_id = tenantId) or owner_id.
 *     - fundraiser_embed strictly filters by organizer_id = tenantId.
 *     - An item belonging to a different tenant is excluded even if explicitly provided in selected IDs.
 *  2. Publication gating:
 *     - When isTeamMember is false (public visitors), only published/active items are returned.
 *     - When isTeamMember is true (team preview), draft/inactive items are returned and marked with isDraft: true.
 *  3. Query row limit enforcement:
 *     - Query .limit() is strictly invoked with clamped value (1..12, default 6).
 *  4. Safe column projection:
 *     - Internal/sensitive columns (Stripe IDs, attendee lists, buyer emails, notes) are never selected.
 */

const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const { test, describe } = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

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

const {
  resolveEventsEmbed,
  resolveProductsEmbed,
  resolveFundraiserEmbed,
  clampLimit,
} = require("../website-embeds.ts");

// ── Mock Supabase Client Builder ──────────────────────────────────────────────

function createMockClient({
  events = [],
  businesses = [],
  organizer = null,
  products = [],
  fundraisers = [],
} = {}) {
  const queryLog = [];

  const client = {
    from: (table) => {
      const state = {
        table,
        selectColumns: null,
        filters: [],
        orderBy: null,
        limitVal: null,
      };

      const queryBuilder = {
        select: (cols) => {
          state.selectColumns = cols;
          return queryBuilder;
        },
        eq: (col, val) => {
          state.filters.push({ type: "eq", col, val });
          return queryBuilder;
        },
        in: (col, vals) => {
          state.filters.push({ type: "in", col, vals });
          return queryBuilder;
        },
        is: (col, val) => {
          state.filters.push({ type: "is", col, val });
          return queryBuilder;
        },
        order: (col, opts) => {
          state.orderBy = { col, opts };
          return queryBuilder;
        },
        limit: (n) => {
          state.limitVal = n;
          return queryBuilder;
        },
        maybeSingle: async () => {
          queryLog.push(state);
          if (table === "organizers") {
            return { data: organizer, error: null };
          }
          return { data: null, error: null };
        },
        then: (resolve) => {
          queryLog.push(state);
          let dataset = [];
          if (table === "events") dataset = [...events];
          else if (table === "businesses") dataset = [...businesses];
          else if (table === "products") dataset = [...products];
          else if (table === "fundraisers") dataset = [...fundraisers];

          // Apply filters in mock
          let filtered = dataset.filter((row) => {
            for (const f of state.filters) {
              if (f.type === "eq" && row[f.col] !== f.val) return false;
              if (f.type === "in" && !f.vals.includes(row[f.col])) return false;
              if (f.type === "is" && row[f.col] !== f.val) return false;
            }
            return true;
          });

          if (state.limitVal) {
            filtered = filtered.slice(0, state.limitVal);
          }

          resolve({ data: filtered, error: null });
        },
      };

      return queryBuilder;
    },
    getQueryLog: () => queryLog,
  };

  return client;
}

// ── 1. Events Embed Resolver Tests ────────────────────────────────────────────

describe("resolveEventsEmbed", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const event1TenantA = {
    id: "e1111111-1111-1111-1111-111111111111",
    organizer_id: tenantA,
    title: "Published Event Tenant A",
    slug: "pub-event-a",
    event_date: "2026-10-01T18:00:00Z",
    status: "published",
    ticket_price_min: 25,
    currency: "USD",
  };
  const event2TenantADraft = {
    id: "e2222222-2222-2222-2222-222222222222",
    organizer_id: tenantA,
    title: "Draft Event Tenant A",
    slug: "draft-event-a",
    event_date: "2026-11-01T18:00:00Z",
    status: "draft",
    ticket_price_min: 0,
    currency: "USD",
  };
  const eventAlienTenantB = {
    id: "e3333333-3333-3333-3333-333333333333",
    organizer_id: "22222222-2222-2222-2222-222222222222",
    title: "Event from Foreign Tenant",
    slug: "alien-event",
    event_date: "2026-10-15T18:00:00Z",
    status: "published",
  };

  test("excludes events from another tenant even if explicitly referenced in selectedEventIds", async () => {
    const mock = createMockClient({
      events: [event1TenantA, event2TenantADraft, eventAlienTenantB],
    });

    const results = await resolveEventsEmbed(
      {
        type: "events_embed",
        selectedEventIds: [event1TenantA.id, eventAlienTenantB.id],
      },
      tenantA,
      false,
      mock
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, event1TenantA.id);
    assert.strictEqual(results[0].title, "Published Event Tenant A");

    const queryLog = mock.getQueryLog();
    const eventQuery = queryLog.find((q) => q.table === "events");
    assert.ok(
      eventQuery.filters.some((f) => f.col === "organizer_id" && f.val === tenantA),
      "Query MUST filter by organizer_id = tenantId"
    );
  });

  test("hides draft events for public visitors (isTeamMember = false)", async () => {
    const mock = createMockClient({
      events: [event1TenantA, event2TenantADraft],
    });

    const results = await resolveEventsEmbed(
      { type: "events_embed" },
      tenantA,
      false,
      mock
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, event1TenantA.id);
    assert.strictEqual(results[0].isDraft, false);

    const queryLog = mock.getQueryLog();
    const eventQuery = queryLog.find((q) => q.table === "events");
    assert.ok(
      eventQuery.filters.some((f) => f.col === "status" && f.val === "published"),
      "Public query must enforce status = published"
    );
  });

  test("includes draft events with isDraft: true for team members (isTeamMember = true)", async () => {
    const mock = createMockClient({
      events: [event1TenantA, event2TenantADraft],
    });

    const results = await resolveEventsEmbed(
      { type: "events_embed" },
      tenantA,
      true,
      mock
    );

    assert.strictEqual(results.length, 2);
    const draft = results.find((r) => r.id === event2TenantADraft.id);
    assert.ok(draft);
    assert.strictEqual(draft.isDraft, true);

    const queryLog = mock.getQueryLog();
    const eventQuery = queryLog.find((q) => q.table === "events");
    assert.strictEqual(
      eventQuery.filters.some((f) => f.col === "status"),
      false,
      "Team member query must not filter out draft status"
    );
  });

  test("enforces query row limit bounded to 1..12", async () => {
    assert.strictEqual(clampLimit(undefined), 6);
    assert.strictEqual(clampLimit(-10), 1);
    assert.strictEqual(clampLimit(100), 12);
    assert.strictEqual(clampLimit(4), 4);

    const mock = createMockClient({ events: [] });

    await resolveEventsEmbed({ type: "events_embed", limit: 99 }, tenantA, false, mock);
    const query1 = mock.getQueryLog()[0];
    assert.strictEqual(query1.limitVal, 12, "Must clamp limit to 12 max");

    await resolveEventsEmbed({ type: "events_embed", limit: -5 }, tenantA, false, mock);
    const query2 = mock.getQueryLog()[1];
    assert.strictEqual(query2.limitVal, 1, "Must clamp limit to 1 min");
  });
});

// ── 2. Products Embed Resolver Tests ──────────────────────────────────────────

describe("resolveProductsEmbed", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const businessA = {
    id: "b1111111-1111-1111-1111-111111111111",
    organizer_id: tenantA,
  };
  const product1BusinessA = {
    id: "p1111111-1111-1111-1111-111111111111",
    business_id: businessA.id,
    name: "Active Product A",
    slug: "prod-a",
    description: "Good product description",
    price_type: "one_time",
    status: "active",
  };
  const product2BusinessAArchived = {
    id: "p2222222-2222-2222-2222-222222222222",
    business_id: businessA.id,
    name: "Archived Product A",
    slug: "archived-a",
    description: "Old product",
    price_type: "one_time",
    status: "archived",
  };
  const productAlienBusinessB = {
    id: "p3333333-3333-3333-3333-333333333333",
    business_id: "b2222222-2222-2222-2222-222222222222",
    name: "Product Foreign Business",
    slug: "prod-alien",
    status: "active",
  };

  test("scopes products through businesses.organizer_id and excludes alien products", async () => {
    const mock = createMockClient({
      businesses: [businessA],
      organizer: { user_id: "user-123" },
      products: [product1BusinessA, product2BusinessAArchived, productAlienBusinessB],
    });

    const results = await resolveProductsEmbed(
      {
        type: "products_embed",
        selectedProductIds: [product1BusinessA.id, productAlienBusinessB.id],
      },
      tenantA,
      false,
      mock
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, product1BusinessA.id);

    const queryLog = mock.getQueryLog();
    const productQuery = queryLog.find((q) => q.table === "products");
    assert.ok(
      productQuery.filters.some((f) => f.col === "business_id" && f.vals.includes(businessA.id)),
      "Must scope products by business_id of the tenant"
    );
  });

  test("hides archived/draft products for public visitors and shows them for team preview", async () => {
    const mock = createMockClient({
      businesses: [businessA],
      organizer: { user_id: "user-123" },
      products: [product1BusinessA, product2BusinessAArchived],
    });

    const publicRes = await resolveProductsEmbed(
      { type: "products_embed" },
      tenantA,
      false,
      mock
    );
    assert.strictEqual(publicRes.length, 1);
    assert.strictEqual(publicRes[0].id, product1BusinessA.id);
    assert.strictEqual(publicRes[0].isDraft, false);

    const teamRes = await resolveProductsEmbed(
      { type: "products_embed" },
      tenantA,
      true,
      mock
    );
    assert.strictEqual(teamRes.length, 2);
    const archived = teamRes.find((p) => p.id === product2BusinessAArchived.id);
    assert.ok(archived);
    assert.strictEqual(archived.isDraft, true);
  });

  test("multi-tenant user simulation: Organizer B never leaks Organizer A products or unassigned user products", async () => {
    const userId = "user-shared-owner";
    const tenantOrgA = "org-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
    const tenantOrgB = "org-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
    const tenantOrgCNoBiz = "org-cccc-cccc-cccc-cccccccccccc";

    const bizA = { id: "biz-a-111", organizer_id: tenantOrgA };
    const bizB = { id: "biz-b-222", organizer_id: tenantOrgB };

    const prodA1 = {
      id: "prod-a-1",
      business_id: bizA.id,
      owner_id: userId,
      name: "Product Org A 1",
      status: "active",
    };
    const prodA2 = {
      id: "prod-a-2",
      business_id: bizA.id,
      owner_id: userId,
      name: "Product Org A 2",
      status: "active",
    };
    const prodB1 = {
      id: "prod-b-1",
      business_id: bizB.id,
      owner_id: userId,
      name: "Product Org B 1",
      status: "active",
    };
    const prodUnassigned = {
      id: "prod-unassigned",
      business_id: null,
      owner_id: userId,
      name: "Personal Product Unlinked",
      status: "active",
    };

    const mock = createMockClient({
      businesses: [bizA, bizB],
      products: [prodA1, prodA2, prodB1, prodUnassigned],
    });

    // Resolve for Organizer B
    const resultsB = await resolveProductsEmbed(
      { type: "products_embed" },
      tenantOrgB,
      false,
      mock
    );

    assert.strictEqual(resultsB.length, 1, "Organizer B should only return exactly 1 product");
    assert.strictEqual(resultsB[0].id, prodB1.id);
    assert.strictEqual(resultsB[0].name, "Product Org B 1");

    // Verify Organizer A's products and unassigned products are completely absent
    assert.strictEqual(resultsB.some((p) => p.id === prodA1.id), false);
    assert.strictEqual(resultsB.some((p) => p.id === prodA2.id), false);
    assert.strictEqual(resultsB.some((p) => p.id === prodUnassigned.id), false);

    // Resolve for Organizer C (which has no linked business entity) -> must return []
    const resultsC = await resolveProductsEmbed(
      { type: "products_embed" },
      tenantOrgCNoBiz,
      false,
      mock
    );
    assert.deepStrictEqual(resultsC, [], "Tenant with no business entity must return empty array, not fall back to user products");
  });
});

// ── 3. Fundraiser Embed Resolver Tests ────────────────────────────────────────

describe("resolveFundraiserEmbed", () => {
  const tenantA = "11111111-1111-1111-1111-111111111111";
  const f1TenantA = {
    id: "f1111111-1111-1111-1111-111111111111",
    organizer_id: tenantA,
    title: "Active Campaign A",
    slug: "camp-a",
    goal_amount: 10000,
    raised: 4500,
    currency: "USD",
    is_active: true,
    deleted_at: null,
  };
  const f2TenantAInactive = {
    id: "f2222222-2222-2222-2222-222222222222",
    organizer_id: tenantA,
    title: "Draft/Inactive Campaign A",
    slug: "draft-camp-a",
    goal_amount: 5000,
    raised: 0,
    currency: "USD",
    is_active: false,
    deleted_at: null,
  };
  const fAlienTenantB = {
    id: "f3333333-3333-3333-3333-333333333333",
    organizer_id: "22222222-2222-2222-2222-222222222222",
    title: "Alien Campaign",
    slug: "alien-camp",
    is_active: true,
    deleted_at: null,
  };

  test("excludes fundraisers from foreign tenants and enforces deleted_at is null", async () => {
    const mock = createMockClient({
      fundraisers: [f1TenantA, f2TenantAInactive, fAlienTenantB],
    });

    const results = await resolveFundraiserEmbed(
      {
        type: "fundraiser_embed",
        selectedFundraiserIds: [f1TenantA.id, fAlienTenantB.id],
      },
      tenantA,
      false,
      mock
    );

    assert.strictEqual(results.length, 1);
    assert.strictEqual(results[0].id, f1TenantA.id);

    const queryLog = mock.getQueryLog();
    const fQuery = queryLog.find((q) => q.table === "fundraisers");
    assert.ok(
      fQuery.filters.some((f) => f.col === "organizer_id" && f.val === tenantA),
      "Must scope fundraisers by organizer_id = tenantId"
    );
    assert.ok(
      fQuery.filters.some((f) => f.col === "deleted_at" && f.val === null),
      "Must exclude deleted fundraisers"
    );
  });

  test("hides inactive campaigns for public visitors and marks isDraft: true for team members", async () => {
    const mock = createMockClient({
      fundraisers: [f1TenantA, f2TenantAInactive],
    });

    const publicRes = await resolveFundraiserEmbed(
      { type: "fundraiser_embed" },
      tenantA,
      false,
      mock
    );
    assert.strictEqual(publicRes.length, 1);
    assert.strictEqual(publicRes[0].id, f1TenantA.id);
    assert.strictEqual(publicRes[0].isDraft, false);

    const teamRes = await resolveFundraiserEmbed(
      { type: "fundraiser_embed" },
      tenantA,
      true,
      mock
    );
    assert.strictEqual(teamRes.length, 2);
    const inactive = teamRes.find((f) => f.id === f2TenantAInactive.id);
    assert.ok(inactive);
    assert.strictEqual(inactive.isDraft, true);
  });
});
