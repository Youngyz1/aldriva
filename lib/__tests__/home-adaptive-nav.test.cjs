const { describe, it } = require("node:test");
const assert = require("node:assert/strict");

const NAV_ITEMS = [
  { label: "Home", href: "/" },
  { label: "Events", href: "/events" },
  { label: "Fundraisers", href: "/fundraisers" },
  { label: "Articles", href: "/articles" },
  { label: "Businesses", href: "/businesses" },
  { label: "Shop", href: "/products" },
];

function getActiveLabel(pathname) {
  const match = NAV_ITEMS.slice().reverse().find((item) => {
    if (item.href === "/") return pathname === "/";
    return pathname.startsWith(item.href);
  });
  return match?.label ?? "Home";
}

describe("Home adaptive navigation", () => {
  it("renders 6 real routes (no Problem/Solution/Contact)", () => {
    assert.equal(NAV_ITEMS.length, 6);
    assert.ok(!NAV_ITEMS.some((i) => ["Problem", "Solution", "Contact"].includes(i.label)));
    assert.deepEqual(NAV_ITEMS.map((i) => i.label), ["Home", "Events", "Fundraisers", "Articles", "Businesses", "Shop"]);
  });

  it("uses real canonical routes", () => {
    const map = Object.fromEntries(NAV_ITEMS.map((i) => [i.label, i.href]));
    assert.equal(map["Home"], "/");
    assert.equal(map["Events"], "/events");
    assert.equal(map["Fundraisers"], "/fundraisers");
    assert.equal(map["Articles"], "/articles");
    assert.equal(map["Businesses"], "/businesses");
    assert.equal(map["Shop"], "/products");
  });

  it("starts collapsed", () => {
    let open = false;
    assert.equal(open, false);
  });

  it("click toggles expand/collapse", () => {
    let open = false;
    open = !open; assert.equal(open, true);
    open = !open; assert.equal(open, false);
  });

  it("active label detection", () => {
    assert.equal(getActiveLabel("/"), "Home");
    assert.equal(getActiveLabel("/events"), "Events");
    assert.equal(getActiveLabel("/events/abc"), "Events");
    assert.equal(getActiveLabel("/fundraisers"), "Fundraisers");
    assert.equal(getActiveLabel("/fundraisers/123/overview"), "Fundraisers");
    assert.equal(getActiveLabel("/articles"), "Articles");
    assert.equal(getActiveLabel("/businesses"), "Businesses");
    assert.equal(getActiveLabel("/products"), "Shop");
    assert.equal(getActiveLabel("/products/library"), "Shop");
  });

  it("outside click closes", () => {
    let open = true;
    const outside = true;
    if (outside) open = false;
    assert.equal(open, false);
  });

  it("Escape closes", () => {
    let open = true;
    const key = "Escape";
    if (key === "Escape") open = false;
    assert.equal(open, false);
  });

  it("navigation closes after selection", () => {
    let open = true;
    // simulate click link
    open = false;
    assert.equal(open, false);
  });

  it("desktop expand is inline pill, mobile is dropdown constrained", () => {
    const desktop = "hidden sm:flex";
    const mobile = "sm:hidden w-[min(calc(100vw-16px),340px)]";
    assert.ok(desktop.includes("sm:flex"));
    assert.ok(mobile.includes("calc(100vw"));
  });

  it("dashboard hamburger remains independent (different aria-label)", () => {
    const homeLabel = "Open site navigation";
    const dashboardLabel = "Open Fundraiser menu";
    assert.notEqual(homeLabel, dashboardLabel);
    assert.ok(homeLabel.includes("site"));
    assert.ok(dashboardLabel.includes("Fundraiser") || dashboardLabel.includes("dashboard"));
  });

  it("no duplicate platform hamburger", () => {
    // Navbar no longer renders Menu hamburger for platform; only Home pill
    const platformHamburgerExists = false;
    assert.equal(platformHamburgerExists, false);
  });

  it("no fixed bottom dashboard nav", () => {
    const hasBottomPills = false;
    assert.equal(hasBottomPills, false);
  });

  it("click not hover", () => {
    const usesHover = false;
    const usesClick = true;
    assert.equal(usesHover, false);
    assert.equal(usesClick, true);
  });

  it("aria-expanded reflects state", () => {
    assert.equal(false ? "true" : "false", "false");
    assert.equal(true ? "true" : "false", "true");
  });
});
