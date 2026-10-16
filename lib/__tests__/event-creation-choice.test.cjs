/**
 * lib/__tests__/event-creation-choice.test.cjs
 *
 * Round 3 COMMIT 3c (Part A): the Public / Invitation choice is reachable
 * for every logged-in user.
 * - No "Create event" entry point links straight to /create-event; all go
 *   through /dashboard/events/new. The only ?from=new link is the Public
 *   card on the choice page itself.
 * - The choice page carries no admin gate: non-admins see both cards.
 * - /create-event redirects to the choice unless the Public-card flag is
 *   present; logged-out users are sent to login with a return trip.
 */

const { describe, test } = require("node:test");
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
const { resolveOverviewModules } = require("../overview-resolver.ts");
const { classifyOrganizerDashboardTypes } = require("../organizer-dashboard-classifier.ts");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

describe("organizer overview creation choices follow owned types", () => {
  const input = (rows) => ({
    context: "organizer",
    organizerTypes: classifyOrganizerDashboardTypes(rows),
    capabilities: [],
    role: "owner",
    counts: { eventCount: rows.events.length, fundraiserCount: rows.fundraisers.length },
  });
  const actions = (rows) => {
    const widgets = resolveOverviewModules(input(rows));
    return widgets.find((widget) => widget.id === "quick_actions")?.data.map((action) => action.id) ?? [];
  };

  test("New Event appears only for organizers with event rows", () => {
    assert.ok(actions({ events: [{ status: "draft" }], fundraisers: [], businesses: [] }).includes("new_event"));
    assert.ok(!actions({ events: [], fundraisers: [{ status: "pending_review" }], businesses: [] }).includes("new_event"));
    assert.ok(!actions({ events: [], fundraisers: [], businesses: [{ status: "active" }] }).includes("new_event"));
  });

  test("none state offers Business, Event, and Fundraiser create choices", () => {
    const widgets = resolveOverviewModules(input({ events: [], fundraisers: [], businesses: [] }));
    assert.deepEqual(widgets.map((widget) => widget.id), ["empty_state"]);
    assert.deepEqual(widgets[0].data.createLinks.map((link) => link.href), [
      "/dashboard/businesses/new", "/dashboard/events/new", "/create-fundraiser",
    ]);
    const overviewClient = src("components/dashboard/overview/OrgOverviewClient.tsx");
    assert.ok(overviewClient.includes("emptyState.createLinks.map"));
    assert.ok(overviewClient.includes("<Link"));
  });

  test("legacy slug overview redirects to the canonical id route", () => {
    const page = src("app/dashboard/organizations/[slug]/overview/page.tsx");
    assert.ok(page.includes("redirect(`/dashboard/org/${org.id}/overview`)"));
  });
});

describe("choice page is visible to every logged-in user", () => {
  const NEW_PAGE = "app/dashboard/events/new/page.tsx";

  test("no admin gate hides the cards", () => {
    const s = src(NEW_PAGE);
    assert.ok(!s.includes("await isAdmin()"), "no admin check runs");
    assert.ok(!s.includes("requireAdmin"), "no admin requirement");
    assert.ok(!s.includes('redirect("/create-event")'), "no bypass redirect");
  });

  test("both cards render, Public card carries the flag", () => {
    const s = src(NEW_PAGE);
    assert.ok(s.includes("Create from scratch"), "public option present");
    assert.ok(s.includes("CreateInvitationCard"), "invitation option present");
    assert.ok(s.includes("/create-event?from=new"), "public flag set");
  });

  test("logged-out users are sent to login", () => {
    const s = src(NEW_PAGE);
    assert.ok(s.includes('redirect("/login")'), "login fallback present");
    const proxy = src("proxy.ts");
    assert.ok(
      proxy.includes('loginUrl.searchParams.set("redirect"'),
      "proxy returns logged-out users after sign-in"
    );
    const login = src("app/login/page.tsx");
    assert.ok(login.includes('searchParams.get("redirect")'), "login honors the return trip");
  });
});

describe("/create-event guard", () => {
  test("direct opens bounce to the choice; flagged opens render the form", () => {
    const s = src("app/create-event/page.tsx");
    assert.ok(s.includes('redirect("/dashboard/events/new")'), "guard redirect present");
    assert.ok(s.includes('from !== "new"'), "flag check present");
    assert.ok(s.includes("CreateEventForm"), "flagged opens render the form");
    const form = src("app/create-event/CreateEventForm.tsx");
    assert.ok(form.includes("Publish Event"), "public form intact in the client component");
  });
});
