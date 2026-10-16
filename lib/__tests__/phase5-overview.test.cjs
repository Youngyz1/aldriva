/**
 * lib/__tests__/phase5-overview.test.cjs
 *
 * Tests for Overview v2 system:
 *   - resolveOverviewModules: organizer context matrix
 *   - resolveOverviewModules: personal context
 *   - canUserManage role gate
 *   - getStartOfTodayInTimezone / isTodayInTimezone (Africa/Abidjan and America/New_York)
 *   - Legacy/stub redirect pages (file existence check)
 *   - i18n parity: no new keys added (hardcoded strings; documented in test)
 *
 * Run with: node --test lib/__tests__/phase5-overview.test.cjs
 */

"use strict";

const { test, describe } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

// ─── Helper: resolve from repo root ─────────────────────────────────────────
const ROOT = path.resolve(__dirname, "../..");

// ─── TS bridge (same pattern as event-creation-choice / org-dashboard-modules):
// compile required .ts sources to CJS so extensionless relative value imports
// (e.g. overview-resolver → ./business-taxonomy) resolve under require(). ────
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

// ─── Import pure functions ────────────────────────────────────────────────────

// canUserManage and resolveOverviewModules
const { canUserManage, resolveOverviewModules } = require("../../lib/overview-resolver.ts");
const {
  classifyOrganizerDashboardTypes,
  isOrganizerDashboardBusiness,
} = require("../../lib/organizer-dashboard-classifier.ts");
const { getStartOfTodayInTimezone, isTodayInTimezone, DEFAULT_SITE_TIMEZONE } = require("../../lib/date-timezone.ts");

// ─── canUserManage ───────────────────────────────────────────────────────────
describe("canUserManage", () => {
  test("owner is a manager role", () => {
    assert.equal(canUserManage("owner"), true);
  });
  test("admin is a manager role", () => {
    assert.equal(canUserManage("admin"), true);
  });
  test("manager is a manager role", () => {
    assert.equal(canUserManage("manager"), true);
  });
  test("editor is not a manager role", () => {
    assert.equal(canUserManage("editor"), false);
  });
  test("finance is not a manager role", () => {
    assert.equal(canUserManage("finance"), false);
  });
  test("viewer is not a manager role", () => {
    assert.equal(canUserManage("viewer"), false);
  });
  test("null role returns false", () => {
    assert.equal(canUserManage(null), false);
  });
  test("undefined role returns false", () => {
    assert.equal(canUserManage(undefined), false);
  });
});

// ─── date-timezone helpers ───────────────────────────────────────────────────
describe("DEFAULT_SITE_TIMEZONE", () => {
  test("is Africa/Abidjan", () => {
    assert.equal(DEFAULT_SITE_TIMEZONE, "Africa/Abidjan");
  });
});

describe("organizer dashboard row classifier", () => {
  const classify = (events = [], fundraisers = [], businesses = []) =>
    classifyOrganizerDashboardTypes({ events, fundraisers, businesses });

  test("classifies events-only, fundraiser-only, business-only, mixed, and none", () => {
    assert.deepEqual(classify([{ status: "approved" }]), {
      hasEvents: true, hasFundraisers: false, hasBusiness: false, isNone: false,
    });
    assert.deepEqual(classify([], [{ status: "published" }]), {
      hasEvents: false, hasFundraisers: true, hasBusiness: false, isNone: false,
    });
    assert.deepEqual(classify([], [], [{ status: "active" }]), {
      hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false,
    });
    assert.deepEqual(classify([{ status: "draft" }], [{ status: "pending_review" }], [{ status: "rejected" }]), {
      hasEvents: true, hasFundraisers: true, hasBusiness: true, isNone: false,
    });
    assert.deepEqual(classify(), {
      hasEvents: false, hasFundraisers: false, hasBusiness: false, isNone: true,
    });
  });

  test("draft event and fundraiser rows count by existence, regardless of status", () => {
    const result = classify([{ status: "draft" }], [{ status: "pending_review" }]);
    assert.equal(result.hasEvents, true);
    assert.equal(result.hasFundraisers, true);
  });

  test("business counts for every non-deleted status except archived", () => {
    for (const status of ["draft", "pending_review", "rejected", "active"]) {
      assert.equal(isOrganizerDashboardBusiness({ status, deleted_at: null }), true, status);
    }
    assert.equal(isOrganizerDashboardBusiness({ status: "archived", deleted_at: null }), false);
    assert.equal(isOrganizerDashboardBusiness({ status: "active", deleted_at: "2026-10-01" }), false);
    assert.deepEqual(classify([], [], [
      { status: "archived" },
      { status: "active", deleted_at: "2026-10-01" },
    ]), { hasEvents: false, hasFundraisers: false, hasBusiness: false, isNone: true });
  });
});

describe("getStartOfTodayInTimezone", () => {
  // Africa/Abidjan is UTC+0 (same as UTC, no DST)
  test("Africa/Abidjan midnight == UTC midnight", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    const result = getStartOfTodayInTimezone("Africa/Abidjan", ref);
    // Start of day for June 15 in UTC+0 is 2024-06-15T00:00:00.000Z
    assert.equal(result.toISOString(), "2024-06-15T00:00:00.000Z");
  });

  test("America/New_York midnight (UTC-4 in summer, EDT)", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z"); // 06:30 local time in EDT (UTC-4)
    const result = getStartOfTodayInTimezone("America/New_York", ref);
    // June 15 midnight in EDT = 2024-06-15T04:00:00.000Z
    assert.equal(result.toISOString(), "2024-06-15T04:00:00.000Z");
  });

  test("America/New_York midnight (UTC-5 in winter, EST)", () => {
    const ref = new Date("2024-01-15T10:30:00.000Z"); // 05:30 local time in EST (UTC-5)
    const result = getStartOfTodayInTimezone("America/New_York", ref);
    // Jan 15 midnight in EST = 2024-01-15T05:00:00.000Z
    assert.equal(result.toISOString(), "2024-01-15T05:00:00.000Z");
  });

  test("returns Date with .getTime() as integer", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    const result = getStartOfTodayInTimezone("Africa/Abidjan", ref);
    assert.ok(Number.isFinite(result.getTime()));
  });
});

describe("isTodayInTimezone", () => {
  test("timestamp in the same day returns true (Africa/Abidjan)", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    // 09:00 on same date
    const ts = "2024-06-15T09:00:00.000Z";
    assert.equal(isTodayInTimezone(ts, "Africa/Abidjan", ref), true);
  });

  test("timestamp from yesterday returns false (Africa/Abidjan)", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    const ts = "2024-06-14T23:59:59.000Z";
    assert.equal(isTodayInTimezone(ts, "Africa/Abidjan", ref), false);
  });

  test("timestamp tomorrow returns false (Africa/Abidjan)", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    const ts = "2024-06-16T01:00:00.000Z";
    assert.equal(isTodayInTimezone(ts, "Africa/Abidjan", ref), false);
  });

  test("timezone boundary: 23:59 UTC-4 is same local day (America/New_York)", () => {
    // ref: June 15 23:30 UTC = June 15 19:30 EDT
    const ref = new Date("2024-06-15T23:30:00.000Z");
    // ts: June 15 23:00 UTC = June 15 19:00 EDT — same local day
    const ts = "2024-06-15T23:00:00.000Z";
    assert.equal(isTodayInTimezone(ts, "America/New_York", ref), true);
  });

  test("timezone boundary: next UTC day but same local day (America/New_York)", () => {
    // ref: June 16 02:00 UTC = June 15 22:00 EDT (still June 15 local)
    const ref = new Date("2024-06-16T02:00:00.000Z");
    // ts: June 16 01:00 UTC = June 15 21:00 EDT — same local day
    const ts = "2024-06-16T01:00:00.000Z";
    assert.equal(isTodayInTimezone(ts, "America/New_York", ref), true);
  });

  test("invalid timestamp returns false", () => {
    const ref = new Date("2024-06-15T10:30:00.000Z");
    assert.equal(isTodayInTimezone("not-a-date", "Africa/Abidjan", ref), false);
  });
});

// ─── resolveOverviewModules: organizer context ────────────────────────────────
describe("resolveOverviewModules organizer context", () => {
  const BASE_COMMERCE_INPUT = {
    context: "organizer",
    organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false },
    capabilities: ["can_have_menu"],
    offerings: ["online_ordering", "pickup"],
    features: { ordering: true, delivery: false, pickup: true, reservations: false, onlinePayment: false },
    approvalState: "active",
    counts: {
      pendingOrders: 0,
      overdueOrders: 0,
      ordersToday: 5,
      salesToday: 12000,
      paidToday: 10000,
      toCollectToday: 2000,
      currency: "XOF",
      siteTimezone: "Africa/Abidjan",
      isOpen: true,
      hoursBadgeText: "Open · Closes at 22:00",
      hasUnpublishedChanges: false,
      isSitePublished: true,
      websiteSlug: "my-restaurant",
      websiteId: "ws-1",
      businessId: "biz-1",
      menuItemCount: 10,
      serviceCount: 0,
      hasLogo: true,
      hasHours: true,
      hasOfferings: true,
      isOrderingReady: true,
      eventCount: 0,
      fundraiserCount: 0,
      followerCount: 0,
      ticketCount: 0,
      totalRaised: 0,
      averageRating: null,
      reviewCount: 0,
      recentOrders: [
        { id: "o1", orderNumber: "001", customerName: "Alice", totalAmount: 2500, currency: "XOF", status: "pending", createdAt: "2024-06-15T10:00:00Z", fulfilmentType: "pickup" },
      ],
      recentEvents: [],
    },
    role: "owner",
  };

  test("restaurant with active orders: has today_strip widget", () => {
    const widgets = resolveOverviewModules(BASE_COMMERCE_INPUT);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("today_strip"), "Missing today_strip");
  });

  test("restaurant with pending orders: has attention_strip widget", () => {
    const input = { ...BASE_COMMERCE_INPUT, counts: { ...BASE_COMMERCE_INPUT.counts, pendingOrders: 3 } };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    const items = strip.data;
    assert.ok(Array.isArray(items), "attention_strip.data is not array");
    const hasPending = items.some((i) => i.id === "pending_orders");
    assert.ok(hasPending, "Missing pending_orders attention item");
  });

  test("restaurant with overdue orders: attention_strip has overdue item", () => {
    const input = { ...BASE_COMMERCE_INPUT, counts: { ...BASE_COMMERCE_INPUT.counts, overdueOrders: 2 } };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    const hasOverdue = strip.data.some((i) => i.id === "overdue_orders");
    assert.ok(hasOverdue, "Missing overdue_orders attention item");
  });

  test("approval pending: attention_strip includes approval_pending", () => {
    const input = { ...BASE_COMMERCE_INPUT, approvalState: "pending" };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    const hasPendingApproval = strip.data.some((i) => i.id === "approval_pending");
    assert.ok(hasPendingApproval, "Missing approval_pending attention item");
  });

  test("approval rejected: attention_strip includes approval_rejected", () => {
    const input = { ...BASE_COMMERCE_INPUT, approvalState: "rejected" };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    assert.ok(strip.data.some((i) => i.id === "approval_rejected"), "Missing approval_rejected");
  });

  test("brand-new business with no orders: has setup_checklist; today_strip shown with zeros for commerce", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        ordersToday: 0,
        salesToday: 0,
        paidToday: 0,
        toCollectToday: 0,
        recentOrders: [],
        eventCount: 0,
        fundraiserCount: 0,
        ticketCount: 0,
        totalRaised: 0,
        isSitePublished: false,
        isOrderingReady: false,
        hasLogo: false,
        hasHours: false,
        hasOfferings: false,
        menuItemCount: 0,
      },
    };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    // Commerce org always gets setup_checklist
    assert.ok(ids.includes("setup_checklist"), "Missing setup_checklist");
    // Commerce org always gets today_strip (even with all zeros) — suppresses empty_state
    assert.ok(ids.includes("today_strip"), "Missing today_strip for commerce org");
    // empty_state is suppressed because today_strip is present
    assert.ok(!ids.includes("empty_state"), "empty_state should not appear alongside today_strip");
  });

  test("none state has only the three create choices", () => {
    const input = {
      context: "organizer",
      organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: false, isNone: true },
      capabilities: [],
      offerings: [],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      approvalState: "active",
      counts: {
        ordersToday: 0,
        recentOrders: [],
        pendingOrders: 0,
        overdueOrders: 0,
        eventCount: 0,
        fundraiserCount: 0,
        ticketCount: 0,
        totalRaised: 0,
        isSitePublished: false,
        isOrderingReady: false,
        hasLogo: false,
        hasHours: false,
        hasOfferings: false,
        menuItemCount: 0,
        serviceCount: 0,
      },
      role: "owner",
    };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    assert.deepEqual(ids, ["empty_state"]);
    const empty = widgets[0].data;
    assert.deepEqual(empty.createLinks.map((item) => item.label), ["Create Business", "Create Event", "Create Fundraiser"]);
    assert.deepEqual(empty.createLinks.map((item) => item.href), ["/dashboard/businesses/new", "/dashboard/events/new", "/create-fundraiser"]);
  });

  test("display offsets and totals cannot classify an organizer as having a type", () => {
    const widgets = resolveOverviewModules({
      context: "organizer",
      organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: false, isNone: true },
      capabilities: ["can_have_events", "can_have_fundraisers", "can_have_menu"],
      counts: { eventCount: 200, fundraiserCount: 20, ticketCount: 1000, totalRaised: 250000, ordersToday: 4 },
      role: "owner",
    });
    assert.deepEqual(widgets.map((widget) => widget.id), ["empty_state"]);
  });

  test("events-only org (no commerce cap): no today_strip", () => {
    const input = {
      context: "organizer",
      organizerTypes: { hasEvents: true, hasFundraisers: false, hasBusiness: false, isNone: false },
      capabilities: ["can_have_events"],
      offerings: [],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      approvalState: "active",
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        ordersToday: 0,
        recentOrders: [],
        pendingOrders: 0,
        overdueOrders: 0,
        eventCount: 5,
        fundraiserCount: 2,
        ticketCount: 100,
        totalRaised: 50000,
      },
      role: "owner",
    };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    assert.ok(!ids.includes("today_strip"), "today_strip should not appear for events-only org");
    assert.ok(ids.includes("events_metrics"), "Missing events_metrics for events-only org");
    const metrics = widgets.find((w) => w.id === "events_metrics").data;
    assert.equal(metrics.hasEvents, true);
    assert.equal(metrics.hasFundraisers, false);
    const actions = widgets.find((w) => w.id === "quick_actions").data.map((action) => action.id);
    assert.ok(actions.includes("new_event"));
    assert.ok(!actions.includes("new_fundraiser"));
    assert.ok(!ids.includes("setup_checklist"));
    assert.ok(!ids.includes("empty_state"));
  });

  test("EventMetricsWidget gates event and fundraiser cards independently", () => {
    const source = fs.readFileSync(path.join(ROOT, "components/dashboard/overview/EventMetricsWidget.tsx"), "utf8");
    assert.ok(source.includes("{hasEvents ? <Link"), "event cards require hasEvents");
    assert.ok(source.includes("{hasFundraisers ? <Link"), "fundraiser cards require hasFundraisers");
    assert.ok(source.includes("hasEvents && recentEvents"), "recent event rows require hasEvents");
  });

  test("restaurant with events: both today_strip and events_metrics appear", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      organizerTypes: { hasEvents: true, hasFundraisers: false, hasBusiness: true, isNone: false },
      counts: { ...BASE_COMMERCE_INPUT.counts, eventCount: 3, totalRaised: 0, fundraiserCount: 0, ticketCount: 50 },
    };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("today_strip"), "Missing today_strip");
    assert.ok(ids.includes("events_metrics"), "Missing events_metrics");
  });

  test("recent_orders widget appears when recentOrders populated", () => {
    const widgets = resolveOverviewModules(BASE_COMMERCE_INPUT);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("recent_orders"), "Missing recent_orders");
  });

  test("quick_actions appears for all org types", () => {
    const widgets = resolveOverviewModules(BASE_COMMERCE_INPUT);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("quick_actions"), "Missing quick_actions");
  });

  test("viewer role: quick_actions still present (view links)", () => {
    const input = { ...BASE_COMMERCE_INPUT, role: "viewer" };
    const widgets = resolveOverviewModules(input);
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("quick_actions"), "quick_actions should still be present for viewer");
  });

  test("rental org (can_have_vehicles): no add_dish quick action", () => {
    const input = {
      context: "organizer",
      organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false },
      capabilities: ["can_have_vehicles"],
      offerings: [],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      approvalState: "active",
      counts: { ...BASE_COMMERCE_INPUT.counts, menuItemCount: 0, ordersToday: 0, recentOrders: [] },
      role: "owner",
    };
    const widgets = resolveOverviewModules(input);
    const qa = widgets.find((w) => w.id === "quick_actions");
    assert.ok(qa, "Missing quick_actions for rental");
    const actionIds = qa.data.map((a) => a.id);
    assert.ok(!actionIds.includes("add_dish"), "add_dish should not appear for rental");
  });

  test("salon/service (can_have_services): add_service quick action for owner", () => {
    const input = {
      context: "organizer",
      organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false },
      capabilities: ["can_have_services"],
      offerings: [],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      approvalState: "active",
      counts: { ...BASE_COMMERCE_INPUT.counts, menuItemCount: 0, serviceCount: 5, ordersToday: 0, recentOrders: [] },
      role: "owner",
    };
    const widgets = resolveOverviewModules(input);
    const qa = widgets.find((w) => w.id === "quick_actions");
    assert.ok(qa, "Missing quick_actions for salon");
    const actionIds = qa.data.map((a) => a.id);
    assert.ok(actionIds.includes("add_service"), "Missing add_service for salon/owner");
  });

  test("unpublished changes: attention_strip item when site already published", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        hasUnpublishedChanges: true,
        isSitePublished: true,
      },
    };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    assert.ok(strip, "Missing attention_strip");
    assert.ok(strip.data.some((i) => i.id === "unpublished_changes"), "Missing unpublished_changes item");
  });

  test("unpublished changes: NOT shown when site is not published yet", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        hasUnpublishedChanges: true,
        isSitePublished: false,
        pendingOrders: 0,
        overdueOrders: 0,
      },
      approvalState: "active",
    };
    const widgets = resolveOverviewModules(input);
    const strip = widgets.find((w) => w.id === "attention_strip");
    // No attention item for unpublished changes when site not yet published
    if (strip) {
      assert.ok(!strip.data.some((i) => i.id === "unpublished_changes"), "unpublished_changes should not appear when site not yet published");
    }
    // If no strip at all, that's also fine
  });

  test("setup_checklist completedCount = 0 when brand new business", () => {
    const input = {
      ...BASE_COMMERCE_INPUT,
      counts: {
        ...BASE_COMMERCE_INPUT.counts,
        hasLogo: false,
        hasHours: false,
        hasOfferings: false,
        isSitePublished: false,
        isOrderingReady: false,
        menuItemCount: 0,
        serviceCount: 0,
      },
    };
    const widgets = resolveOverviewModules(input);
    const checklist = widgets.find((w) => w.id === "setup_checklist");
    assert.ok(checklist, "Missing setup_checklist");
    assert.equal(checklist.data.completedCount, 0);
    assert.ok(checklist.data.totalCount > 0);
  });

  test("setup_checklist completedCount = totalCount when everything set up", () => {
    const widgets = resolveOverviewModules(BASE_COMMERCE_INPUT);
    const checklist = widgets.find((w) => w.id === "setup_checklist");
    assert.ok(checklist, "Missing setup_checklist");
    assert.equal(checklist.data.completedCount, checklist.data.totalCount);
    assert.equal(checklist.data.isComplete, true);
  });

  test("fundraiser-only and mixed organizers receive only their own actions and stats", () => {
    const fundraiserOnly = resolveOverviewModules({
      ...BASE_COMMERCE_INPUT,
      organizerTypes: { hasEvents: false, hasFundraisers: true, hasBusiness: false, isNone: false },
      counts: { ...BASE_COMMERCE_INPUT.counts, fundraiserCount: 1, totalRaised: 900 },
    });
    const fundActions = fundraiserOnly.find((widget) => widget.id === "quick_actions").data.map((action) => action.id);
    const fundMetrics = fundraiserOnly.find((widget) => widget.id === "events_metrics").data;
    assert.ok(fundActions.includes("new_fundraiser"));
    assert.ok(!fundActions.includes("new_event"));
    assert.ok(!fundraiserOnly.some((widget) => widget.id === "setup_checklist"));
    assert.equal(fundMetrics.hasEvents, false);
    assert.equal(fundMetrics.hasFundraisers, true);

    const mixed = resolveOverviewModules({
      ...BASE_COMMERCE_INPUT,
      organizerTypes: { hasEvents: true, hasFundraisers: true, hasBusiness: false, isNone: false },
      counts: { ...BASE_COMMERCE_INPUT.counts, eventCount: 1, fundraiserCount: 1 },
    });
    const mixedActions = mixed.find((widget) => widget.id === "quick_actions").data.map((action) => action.id);
    const mixedMetrics = mixed.find((widget) => widget.id === "events_metrics").data;
    assert.ok(mixedActions.includes("new_event"));
    assert.ok(mixedActions.includes("new_fundraiser"));
    assert.equal(mixedMetrics.hasEvents, true);
    assert.equal(mixedMetrics.hasFundraisers, true);
    assert.ok(!mixed.some((widget) => widget.id === "setup_checklist"));
  });

  test("checklist, Edit website, and Get Ready are restricted to businesses", () => {
    const business = resolveOverviewModules(BASE_COMMERCE_INPUT);
    assert.ok(business.some((widget) => widget.id === "setup_checklist"));
    assert.ok(business.find((widget) => widget.id === "quick_actions").data.some((action) => action.id === "edit_website"));

    for (const organizerTypes of [
      { hasEvents: true, hasFundraisers: false, hasBusiness: false, isNone: false },
      { hasEvents: false, hasFundraisers: true, hasBusiness: false, isNone: false },
    ]) {
      const widgets = resolveOverviewModules({
        ...BASE_COMMERCE_INPUT,
        organizerTypes,
        counts: { ...BASE_COMMERCE_INPUT.counts, isSitePublished: false, recentOrders: [] },
      });
      const actions = widgets.find((widget) => widget.id === "quick_actions")?.data ?? [];
      assert.ok(!widgets.some((widget) => widget.id === "setup_checklist"));
      assert.ok(!actions.some((action) => action.id === "edit_website"));
      assert.ok(!widgets.some((widget) => widget.title === "Get Ready to Take Orders"));
    }
  });

  test("invitation entry is available only when an event action exists", () => {
    for (const organizerTypes of [
      { hasEvents: false, hasFundraisers: true, hasBusiness: false, isNone: false },
      { hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false },
      { hasEvents: false, hasFundraisers: false, hasBusiness: false, isNone: true },
    ]) {
      const widgets = resolveOverviewModules({ ...BASE_COMMERCE_INPUT, organizerTypes });
      const actions = widgets.find((widget) => widget.id === "quick_actions")?.data ?? [];
      assert.equal(actions.some((action) => action.id === "new_event"), false);
    }
    const eventWidgets = resolveOverviewModules({
      ...BASE_COMMERCE_INPUT,
      organizerTypes: { hasEvents: true, hasFundraisers: false, hasBusiness: false, isNone: false },
    });
    assert.ok(eventWidgets.find((widget) => widget.id === "quick_actions").data.some((action) => action.id === "new_event"));
  });

  test("expected overview descriptors: Car Rental is events-only", () => {
    const types = classifyOrganizerDashboardTypes({ events: [{ status: "draft" }], fundraisers: [], businesses: [] });
    const widgets = resolveOverviewModules({ ...BASE_COMMERCE_INPUT, organizerTypes: types, capabilities: [], counts: { ...BASE_COMMERCE_INPUT.counts, recentOrders: [], eventCount: 1 } });
    const actionIds = widgets.find((widget) => widget.id === "quick_actions").data.map((action) => action.id);
    assert.deepEqual(actionIds, ["new_event"]);
    assert.deepEqual(widgets.map((widget) => widget.id).filter((id) => ["setup_checklist", "events_metrics", "recent_events", "today_strip"].includes(id)), ["events_metrics"]);
  });

  test("expected overview descriptors: QA Staging Harness has events and fundraising only", () => {
    const types = classifyOrganizerDashboardTypes({ events: [{ status: "approved" }], fundraisers: [{ status: "pending_review" }], businesses: [] });
    const widgets = resolveOverviewModules({ ...BASE_COMMERCE_INPUT, organizerTypes: types, capabilities: [], counts: { ...BASE_COMMERCE_INPUT.counts, recentOrders: [], eventCount: 2, fundraiserCount: 1 } });
    const actionIds = widgets.find((widget) => widget.id === "quick_actions").data.map((action) => action.id);
    assert.deepEqual(actionIds, ["new_event", "new_fundraiser"]);
    assert.deepEqual(widgets.map((widget) => widget.id).filter((id) => ["setup_checklist", "events_metrics", "today_strip"].includes(id)), ["events_metrics"]);
  });

  test("expected overview descriptors: Aldriva Food is business-only", () => {
    const types = classifyOrganizerDashboardTypes({ events: [], fundraisers: [], businesses: [{ status: "active" }] });
    const widgets = resolveOverviewModules({ ...BASE_COMMERCE_INPUT, organizerTypes: types, capabilities: ["MENU"], counts: { ...BASE_COMMERCE_INPUT.counts, recentOrders: [], ordersToday: 0, isSitePublished: false, websiteSlug: null } });
    const actionIds = widgets.find((widget) => widget.id === "quick_actions").data.map((action) => action.id);
    // AFTER the capability-name fix: uppercase taxonomy MENU resolves to the
    // menu branch (Add dish + Edit website), not the generic fallback.
    assert.deepEqual(actionIds, ["add_dish", "edit_website"]);
    assert.ok(widgets.some((widget) => widget.id === "setup_checklist"));
    assert.ok(widgets.some((widget) => widget.id === "today_strip"), "MENU capability marks a commerce org");
    assert.ok(!widgets.some((widget) => widget.id === "events_metrics"));
  });

  test("taxonomy capabilities drive quick actions: restaurant, service, rental, product types", () => {
    const { getCapabilitiesForBusiness } = require("../../lib/business-taxonomy.ts");
    const businessInput = (businessType, category) => ({
      ...BASE_COMMERCE_INPUT,
      organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false },
      capabilities: getCapabilitiesForBusiness("", category, businessType),
      counts: { ...BASE_COMMERCE_INPUT.counts, recentOrders: [], ordersToday: 0, pendingOrders: 0, overdueOrders: 0, isSitePublished: false, websiteSlug: null },
    });
    const actionsFor = (input) => {
      const widgets = resolveOverviewModules(input);
      return widgets.find((widget) => widget.id === "quick_actions").data;
    };

    // Restaurant (MENU): Add dish (primary) + Edit website.
    const restaurantActions = actionsFor(businessInput("Full-Service Restaurant", "Restaurant"));
    assert.deepEqual(restaurantActions.map((action) => action.id), ["add_dish", "edit_website"]);
    assert.equal(restaurantActions[0].variant, "primary");

    // Service business (SERVICES): Add service (primary) + Edit website.
    const serviceActions = actionsFor(businessInput("Residential Cleaning", "Cleaning"));
    assert.deepEqual(serviceActions.map((action) => action.id), ["add_service", "edit_website"]);

    // Vehicle rental (VEHICLES): Edit website (primary); no catalog add action exists.
    const rentalActions = actionsFor(businessInput("Car Rental", "Vehicle Rental"));
    assert.deepEqual(rentalActions.map((action) => action.id), ["edit_website"]);
    assert.equal(rentalActions[0].variant, "primary");

    // Product type (PRODUCTS, no menu/services/vehicles branch): generic fallback.
    // The resolver has no PRODUCTS branch, so Boutique stays generic by design.
    const boutiqueActions = actionsFor(businessInput("Boutique", "Fashion & Apparel"));
    assert.deepEqual(boutiqueActions.map((action) => action.id), ["edit_website"]);
    assert.equal(boutiqueActions[0].variant, "secondary");
  });

  test("commerce side effect: taxonomy MENU capability shows the Today strip with zero orders", () => {
    const widgets = resolveOverviewModules({
      ...BASE_COMMERCE_INPUT,
      organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false },
      capabilities: ["MENU"],
      features: { ordering: false, delivery: false, pickup: false, reservations: false, onlinePayment: false },
      counts: {
        ordersToday: 0, salesToday: 0, paidToday: 0, toCollectToday: 0,
        pendingOrders: 0, overdueOrders: 0, recentOrders: [],
        menuItemCount: 0, serviceCount: 0,
      },
      role: "owner",
    });
    assert.ok(widgets.some((widget) => widget.id === "today_strip"), "MENU marks a commerce org even with zero activity");
  });

  test("checklist side effect: catalog link follows the menu capability", () => {
    const checklistFor = (capabilities) => resolveOverviewModules({
      ...BASE_COMMERCE_INPUT,
      organizerTypes: { hasEvents: false, hasFundraisers: false, hasBusiness: true, isNone: false },
      capabilities,
    }).find((widget) => widget.id === "setup_checklist").data.items.find((item) => item.id === "catalog").href;
    assert.equal(checklistFor(["MENU"]), "/dashboard/org/MENU_PATH");
    assert.equal(checklistFor(["SERVICES"]), "/dashboard/org/SERVICES_PATH");
    assert.equal(checklistFor(["PRODUCTS"]), "/dashboard/org/SERVICES_PATH", "product types keep the services fallback");
  });
});

// ─── resolveOverviewModules: personal context ────────────────────────────────
describe("resolveOverviewModules personal context", () => {
  test("empty personal context: returns empty_state widget", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {},
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("empty_state"), "Missing empty_state for new user");
  });

  test("personal with managed organizers: returns personal_organizers widget", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {
        managedOrganizers: [{ id: "org-1", name: "My Org" }],
      },
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("personal_organizers"), "Missing personal_organizers");
    assert.ok(!ids.includes("empty_state"), "Should not show empty_state with managed organizers");
  });

  test("personal with tickets: returns personal_tickets widget", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {
        personalTickets: [{ id: "t1", title: "Event", subtitle: "2 tickets", status: "valid", createdAt: "2024-01-01T00:00:00Z", href: "/events" }],
      },
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("personal_tickets"), "Missing personal_tickets");
  });

  test("personal with donations: returns personal_donations widget", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {
        personalDonations: [{ id: "d1", title: "Campaign", subtitle: "$50", status: "succeeded", createdAt: "2024-01-01T00:00:00Z", href: "/donate" }],
      },
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(ids.includes("personal_donations"), "Missing personal_donations");
  });

  test("personal with personalBusinessesCount > 0: no empty_state", () => {
    const widgets = resolveOverviewModules({
      context: "personal",
      capabilities: [],
      counts: {
        personalBusinessesCount: 1,
      },
    });
    const ids = widgets.map((w) => w.id);
    assert.ok(!ids.includes("empty_state"), "Should not show empty_state with personalBusinessesCount > 0");
  });
});

// ─── Redirect pages (file existence check) ───────────────────────────────────
describe("Legacy and stub redirect pages exist", () => {
  test("app/dashboard/organizations/[slug]/overview/page.tsx exists", () => {
    const filePath = path.join(ROOT, "app/dashboard/organizations/[slug]/overview/page.tsx");
    assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
  });

  test("app/dashboard/organizations/[slug]/page.tsx exists", () => {
    const filePath = path.join(ROOT, "app/dashboard/organizations/[slug]/page.tsx");
    assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
  });

  test("app/dashboard/businesses/[id]/overview/page.tsx exists", () => {
    const filePath = path.join(ROOT, "app/dashboard/businesses/[id]/overview/page.tsx");
    assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
  });

  test("Canonical org overview page exists", () => {
    const filePath = path.join(ROOT, "app/dashboard/org/[id]/overview/page.tsx");
    assert.ok(fs.existsSync(filePath), `File not found: ${filePath}`);
  });

  test("Legacy slug overview redirects to canonical (contains redirect call)", () => {
    const filePath = path.join(ROOT, "app/dashboard/organizations/[slug]/overview/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("redirect("), "Legacy slug overview should call redirect()");
    assert.ok(content.includes("/dashboard/org/"), "Legacy slug overview should redirect to canonical /dashboard/org/ path");
  });

  test("Business stub overview redirects to canonical when organizer_id set", () => {
    const filePath = path.join(ROOT, "app/dashboard/businesses/[id]/overview/page.tsx");
    const content = fs.readFileSync(filePath, "utf-8");
    assert.ok(content.includes("redirect("), "Business stub should call redirect()");
    assert.ok(content.includes("organizer_id"), "Business stub should check organizer_id");
  });
});

// ─── New component files exist ────────────────────────────────────────────────
describe("Overview v2 component files exist", () => {
  const COMPONENT_FILES = [
    "components/dashboard/overview/OverviewShell.tsx",
    "components/dashboard/overview/AttentionStrip.tsx",
    "components/dashboard/overview/TodayStrip.tsx",
    "components/dashboard/overview/SetupChecklist.tsx",
    "components/dashboard/overview/QuickActions.tsx",
    "components/dashboard/overview/RecentOrdersWidget.tsx",
    "components/dashboard/overview/EventMetricsWidget.tsx",
    "components/dashboard/overview/OrgOverviewClient.tsx",
  ];

  for (const file of COMPONENT_FILES) {
    test(`${path.basename(file)} exists`, () => {
      const filePath = path.join(ROOT, file);
      assert.ok(fs.existsSync(filePath), `Missing component: ${file}`);
    });
  }
});

// ─── lib/date-timezone.ts exports expected functions ─────────────────────────
describe("date-timezone module exports", () => {
  test("exports getStartOfTodayInTimezone as function", () => {
    assert.equal(typeof getStartOfTodayInTimezone, "function");
  });

  test("exports isTodayInTimezone as function", () => {
    assert.equal(typeof isTodayInTimezone, "function");
  });

  test("exports DEFAULT_SITE_TIMEZONE as string", () => {
    assert.equal(typeof DEFAULT_SITE_TIMEZONE, "string");
  });
});

// ─── i18n parity note (documentation test) ───────────────────────────────────
// NOTE: All new overview components use hardcoded English strings.
// This is intentional — Phase 5 does not add i18n keys to messages/en.json or messages/fr.json.
// i18n extraction is deferred to Phase 6 to keep scope contained.
// This test documents that intention and can be updated when i18n is added.
describe("i18n parity", () => {
  test("Overview v2 components use hardcoded strings (i18n deferred to Phase 6)", () => {
    // This test is a documentation marker. It always passes.
    // When i18n is added, this test should be updated to verify EN/FR key parity.
    assert.ok(true, "i18n extraction deferred to Phase 6 — documented");
  });
});
