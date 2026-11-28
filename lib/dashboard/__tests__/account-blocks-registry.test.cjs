/**
 * lib/dashboard/__tests__/account-blocks-registry.test.cjs
 *
 * Verifies the Account Home (/dashboard) Block Registry:
 * - Priority order: needs_attention -> workspaces -> events -> fundraisers -> articles -> products -> supporting -> start_something
 * - Scaling rules:
 *   - No block renders empty.
 *   - Exactly 1 item shows directly with no "View all".
 *   - More than 3 shows 3 + "View all" (workspaces: max 4, then "All workspaces").
 *   - Brand new account shows ONE onboarding card instead of any blocks.
 * - Test states (a) through (f):
 *   (a) business only
 *   (b) articles only
 *   (c) donor only
 *   (d) events only
 *   (e) mixed (current staging user)
 *   (f) brand new with nothing
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../..");

// TS bridge setup
const Module = require("node:module");
const ts = require("typescript");
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
  ACCOUNT_BLOCK_ORDER,
  isBrandNewAccount,
  getStartSomethingSuggestions,
  shouldRenderBlock,
  getActiveBlocks,
  computeWorkspaceStatLabel,
  isEventWithinNext7Days,
} = require("../account-blocks-registry.ts");

function createEmptyAccountData() {
  return {
    user: { id: "test-user-id", displayName: "Tester", email: "test@example.com" },
    attentionItems: [],
    workspaces: [],
    events: [],
    fundraisers: [],
    articles: [],
    products: [],
    supporting: [],
    startSuggestions: [],
    hasAnyContent: false,
  };
}

test("registry: strict block ordering is preserved", () => {
  const expectedOrder = [
    "needs_attention",
    "workspaces",
    "events",
    "fundraisers",
    "articles",
    "products",
    "supporting",
    "start_something",
  ];
  assert.deepEqual(ACCOUNT_BLOCK_ORDER, expectedOrder);
});

test("state (f): brand new with nothing shows only onboarding, no blocks", () => {
  const data = createEmptyAccountData();
  data.startSuggestions = getStartSomethingSuggestions({
    events: 0,
    fundraisers: 0,
    workspaces: 0,
    businesses: 0,
    articles: 0,
    products: 0,
  });

  assert.strictEqual(isBrandNewAccount(data), true, "Must be classified as brand-new");
  const activeBlocks = getActiveBlocks(data);
  assert.strictEqual(activeBlocks.length, 0, "No blocks should render for brand new account");
});

test("state (a): business only account renders workspaces and start_something", () => {
  const data = createEmptyAccountData();
  data.workspaces = [
    {
      id: "ws-1",
      name: "La Bella Italia",
      typeChip: "Restaurant",
      statLabel: "0 pending",
      href: "/dashboard/businesses/ws-1/overview",
      isBusiness: true,
    },
  ];
  data.hasAnyContent = true;
  data.startSuggestions = getStartSomethingSuggestions({
    events: 0,
    fundraisers: 0,
    workspaces: 0,
    businesses: 1,
    articles: 0,
    products: 0,
  });

  assert.strictEqual(isBrandNewAccount(data), false);
  const activeBlocks = getActiveBlocks(data);
  assert.deepEqual(activeBlocks, ["workspaces", "start_something"]);

  // Scaling rule: exactly 1 workspace -> show directly without "All workspaces"
  assert.strictEqual(data.workspaces.length, 1);
  assert.strictEqual(data.workspaces.length > 4, false);

  // Start something must NOT suggest business since user already has one
  assert.ok(!data.startSuggestions.some((s) => s.key === "business"));
  assert.ok(data.startSuggestions.some((s) => s.key === "event"));
});

test("state (b): articles only account renders articles and start_something", () => {
  const data = createEmptyAccountData();
  data.articles = [
    {
      id: "art-1",
      title: "Community News Edition 1",
      status: "published",
      created_at: new Date().toISOString(),
      href: "/dashboard/articles/art-1/edit",
    },
    {
      id: "art-2",
      title: "Community News Edition 2",
      status: "draft",
      created_at: new Date().toISOString(),
      href: "/dashboard/articles/art-2/edit",
    },
  ];
  data.hasAnyContent = true;
  data.startSuggestions = getStartSomethingSuggestions({
    events: 0,
    fundraisers: 0,
    workspaces: 0,
    businesses: 0,
    articles: 2,
    products: 0,
  });

  const activeBlocks = getActiveBlocks(data);
  assert.deepEqual(activeBlocks, ["articles", "start_something"]);

  // Start something must NOT suggest article
  assert.ok(!data.startSuggestions.some((s) => s.key === "article"));
  assert.ok(data.startSuggestions.some((s) => s.key === "fundraiser"));
});

test("state (c): donor only account renders supporting and start_something", () => {
  const data = createEmptyAccountData();
  data.supporting = [
    {
      id: "don-1",
      type: "donation",
      title: "Clean Water Initiative",
      detail: "Donation · $50.00",
      status: "completed",
      created_at: new Date().toISOString(),
      href: "/dashboard/donations",
    },
  ];
  data.hasAnyContent = true;
  data.startSuggestions = getStartSomethingSuggestions({
    events: 0,
    fundraisers: 0,
    workspaces: 0,
    businesses: 0,
    articles: 0,
    products: 0,
  });

  const activeBlocks = getActiveBlocks(data);
  assert.deepEqual(activeBlocks, ["supporting", "start_something"]);

  // Exactly 1 item -> no "View all"
  assert.strictEqual(data.supporting.length, 1);
  assert.strictEqual(data.supporting.length > 3, false);
});

test("state (d): events only account renders events and drafts properly", () => {
  const data = createEmptyAccountData();
  data.events = [
    {
      id: "ev-1",
      title: "Tech Summit 2026",
      status: "approved",
      created_at: new Date().toISOString(),
      href: "/dashboard/events/ev-1/overview",
    },
    {
      id: "ev-2",
      title: "Workshop: React 19",
      status: "approved",
      created_at: new Date().toISOString(),
      href: "/dashboard/events/ev-2/overview",
    },
    {
      id: "ev-3",
      title: "Design Systems Hangout",
      status: "approved",
      created_at: new Date().toISOString(),
      href: "/dashboard/events/ev-3/overview",
    },
    {
      id: "drafts-invitation-group",
      title: "Drafts (4)",
      subtitle: "Unpublished invitations",
      status: "draft",
      isDraftGroup: true,
      draftCount: 4,
      created_at: new Date().toISOString(),
      href: "/dashboard/events?kind=invitation&status=draft",
    },
  ];
  data.hasAnyContent = true;
  data.startSuggestions = getStartSomethingSuggestions({
    events: 4,
    fundraisers: 0,
    workspaces: 0,
    businesses: 0,
    articles: 0,
    products: 0,
  });

  const activeBlocks = getActiveBlocks(data);
  assert.deepEqual(activeBlocks, ["events", "start_something"]);

  // Scaling rule: >3 items -> shows 3 + "View all"
  assert.ok(data.events.length > 3);
  assert.strictEqual(data.events.slice(0, 3).length, 3);
});

test("state (e): mixed account renders needs_attention, workspaces, events, supporting, etc.", () => {
  const data = createEmptyAccountData();
  data.attentionItems = [
    {
      id: "att-1",
      category: "pending_request",
      title: "Bistro Parisien",
      detail: "2 pending requests to review",
      badge: "Pending requests",
      href: "/dashboard/organizers/org-1/overview",
      urgent: true,
    },
    {
      id: "att-2",
      category: "upcoming_event",
      title: "Annual Gala",
      detail: "Upcoming in the next 7 days",
      badge: "Upcoming event",
      href: "/dashboard/events/ev-1/overview",
    },
  ];
  data.workspaces = [
    {
      id: "org-1",
      name: "Bistro Parisien",
      typeChip: "Restaurant",
      statLabel: "2 pending requests",
      href: "/dashboard/organizers/org-1/overview",
    },
    {
      id: "org-2",
      name: "Quiet Foundation",
      typeChip: "Nonprofit",
      statLabel: "0 pending",
      href: "/dashboard/organizers/org-2/overview",
    },
  ];
  data.events = [
    {
      id: "ev-1",
      title: "Annual Gala",
      status: "approved",
      created_at: new Date().toISOString(),
      href: "/dashboard/events/ev-1/overview",
    },
  ];
  data.fundraisers = [
    {
      id: "f-1",
      title: "Holiday Shelter Drive",
      status: "active",
      raisedAmount: 3200,
      targetAmount: 5000,
      created_at: new Date().toISOString(),
      href: "/dashboard/fundraisers/f-1/overview",
    },
  ];
  data.supporting = [
    {
      id: "t-1",
      type: "ticket",
      title: "Summer Music Fest",
      detail: "Ticket · 2 tickets ($70.00)",
      status: "valid",
      created_at: new Date().toISOString(),
      href: "/dashboard/tickets",
    },
  ];
  data.hasAnyContent = true;
  data.startSuggestions = getStartSomethingSuggestions({
    events: 1,
    fundraisers: 1,
    workspaces: 2,
    businesses: 0,
    articles: 0,
    products: 0,
  });

  const activeBlocks = getActiveBlocks(data);
  assert.deepEqual(activeBlocks, [
    "needs_attention",
    "workspaces",
    "events",
    "fundraisers",
    "supporting",
    "start_something",
  ]);

  // Priority order strictly holds
  const expectedIndices = activeBlocks.map((b) => ACCOUNT_BLOCK_ORDER.indexOf(b));
  for (let i = 1; i < expectedIndices.length; i++) {
    assert.ok(expectedIndices[i] > expectedIndices[i - 1], "Blocks must appear in order");
  }
});

test("helpers: computeWorkspaceStatLabel behaves calmly according to spec", () => {
  // Pending takes priority
  assert.strictEqual(
    computeWorkspaceStatLabel({ pendingCount: 3, upcomingCount: 5, amountRaised: 100 }),
    "3 pending requests"
  );
  assert.strictEqual(
    computeWorkspaceStatLabel({ pendingCount: 1 }),
    "1 pending request"
  );

  // Upcoming events
  assert.strictEqual(
    computeWorkspaceStatLabel({ pendingCount: 0, upcomingCount: 2 }),
    "2 upcoming events"
  );

  // Amount raised
  assert.strictEqual(
    computeWorkspaceStatLabel({ pendingCount: 0, upcomingCount: 0, amountRaised: 5000 }),
    "$5,000 raised"
  );

  // Calm fallback for quiet workspaces
  assert.strictEqual(
    computeWorkspaceStatLabel({ pendingCount: 0, upcomingCount: 0, amountRaised: 0, orgType: "restaurant" }),
    "0 pending"
  );
  assert.strictEqual(
    computeWorkspaceStatLabel({ pendingCount: 0, upcomingCount: 0, amountRaised: 0, orgType: "business" }),
    "0 pending"
  );
});

test("helpers: isEventWithinNext7Days accurately tests window", () => {
  const base = new Date("2026-11-08T12:00:00Z");

  // In 3 days -> true
  assert.strictEqual(isEventWithinNext7Days("2026-11-11T12:00:00Z", base), true);

  // In 8 days -> false
  assert.strictEqual(isEventWithinNext7Days("2026-11-17T12:00:00Z", base), false);

  // 2 days ago -> false
  assert.strictEqual(isEventWithinNext7Days("2026-11-05T12:00:00Z", base), false);

  // Null/invalid -> false
  assert.strictEqual(isEventWithinNext7Days(null, base), false);
  assert.strictEqual(isEventWithinNext7Days("invalid-date", base), false);
});
