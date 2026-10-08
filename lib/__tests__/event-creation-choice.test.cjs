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

const ROOT = path.resolve(__dirname, "../..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

// Every surface that offers event creation. None may link straight to the
// public form: href-shaped /create-event links bypass the choice. (Comments
// may still mention the route, e.g. SmartCTAButton docs.)
const ENTRY_POINTS = [
  "app/about/page.tsx",
  "app/page.tsx",
  "app/platform/page.tsx",
  "app/events/EventsHero.tsx",
  "app/events/EventsResultsSection.tsx",
  "app/things-to-do/[city]/page.tsx",
  "components/articles/ArticleCtaBanner.tsx",
  "components/SmartCTAButton.tsx",
  "app/cookies/page.tsx",
  "app/privacy/page.tsx",
  "app/terms/page.tsx",
  "app/sitemap.ts",
  "app/admin/homepage/HomepageCmsTabs.tsx",
  "lib/homepage-hero.ts",
  "lib/dashboard-activity.ts",
  "lib/entity-registry.ts",
  "lib/my-things.ts",
  "app/dashboard/org/[id]/events/page.tsx",
  "app/dashboard/org/[id]/overview/page.tsx",
  "app/dashboard/organizations/[slug]/events/page.tsx",
  "app/dashboard/organizations/[slug]/overview/page.tsx",
  "app/external-events/ticketmaster/[id]/page.tsx",
];

describe("create-event entry points go through the choice", () => {
  for (const f of ENTRY_POINTS) {
    test(`${f} never links straight to the public form`, () => {
      const s = src(f);
      assert.ok(!s.includes('href="/create-event"'), "no bare href");
      assert.ok(!s.includes('href: "/create-event"'), "no bare href prop");
      assert.ok(!s.includes('"/create-event"'), "no bare destination string");
      assert.ok(!s.includes("'/create-event'"), "no bare destination string");
    });
  }

  test("surfaces that should offer the choice link it", () => {
    for (const f of ENTRY_POINTS) {
      assert.ok(
        src(f).includes("/dashboard/events/new"),
        `${f} links the choice page`
      );
    }
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
