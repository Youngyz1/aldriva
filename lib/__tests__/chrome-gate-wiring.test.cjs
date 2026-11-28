/**
 * lib/__tests__/chrome-gate-wiring.test.cjs
 *
 * F2 (Guest Scanner Fix Round): ChromeGate must actually be wired into
 * app/layout.tsx (around Navbar) and app/events/[slug]/layout.tsx (around
 * the compact footer), and CookieConsent must also suppress itself on the
 * guest scanner paths. These are client components with live usePathname()
 * / IndexedDB / next-intl dependencies, so — following the existing
 * convention (lib/__tests__/scanner-dataset-401-access-ended.test.cjs) —
 * wiring is verified with source assertions, not a rendered DOM.
 */
const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const ROOT = path.resolve(__dirname, "..", "..");
function src(rel) {
  return fs.readFileSync(path.join(ROOT, rel), "utf8");
}

test("app/layout.tsx wraps Navbar's Suspense boundary in ChromeGate, not the other way around", () => {
  const s = src("app/layout.tsx");
  assert.match(s, /import ChromeGate from "@\/components\/ChromeGate"/);
  const suspenseIdx = s.indexOf("<Suspense fallback={<NavbarFallback />}>");
  assert.ok(suspenseIdx > -1);
  const block = s.slice(suspenseIdx, suspenseIdx + 300);
  // ChromeGate must be INSIDE the Suspense boundary (not wrapping it from
  // the outside), so the dynamic usePathname() read stays isolated from
  // the root layout's static shell exactly as Navbar's own comment
  // describes for Cache Components.
  const chromeGateIdx = block.indexOf("<ChromeGate>");
  const navbarIdx = block.indexOf("<Navbar />");
  assert.ok(chromeGateIdx > -1 && navbarIdx > -1 && chromeGateIdx < navbarIdx, "ChromeGate must open before <Navbar />, inside the Suspense block");
});

test("app/events/[slug]/layout.tsx gates only the compact footer behind ChromeGate, never the page content", () => {
  const s = src("app/events/[slug]/layout.tsx");
  assert.match(s, /import ChromeGate from "@\/components\/ChromeGate"/);
  assert.match(s, /import \{ CompactFooter \} from "@\/components\/footers"/);
  const childrenIdx = s.indexOf("{children}");
  const chromeGateIdx = s.indexOf("<ChromeGate>");
  const footerIdx = s.indexOf("<CompactFooter");
  assert.ok(childrenIdx > -1 && chromeGateIdx > childrenIdx, "children must render OUTSIDE/before ChromeGate, never inside it");
  assert.ok(footerIdx > chromeGateIdx, "CompactFooter must be the thing ChromeGate wraps");
});

test("CookieConsent also suppresses itself on guest scanner paths, alongside the existing kitchen/courier check", () => {
  const s = src("components/CookieConsent.tsx");
  assert.match(s, /import \{ isGuestScannerPath \} from "@\/components\/ChromeGate"/);
  assert.match(s, /isWorkerPath = pathname === null \|\| isKitchenPrivatePath\(pathname\) \|\| isGuestScannerPath\(pathname\)/);
});

test("ScannerClient hides the Back to Events link for a guest session and shows an identity line instead", () => {
  const s = src("app/dashboard/events/[id]/scan/ScannerClient.tsx");
  const idx = s.indexOf("{guestSession ? (");
  assert.ok(idx > -1);
  const block = s.slice(idx, idx + 900);
  assert.match(block, /staffName \|\| translate\("eventStaff"\)/);
  assert.match(block, /Back to Events/);
  // The Link (Back to Events) must be in the ELSE branch, never rendered
  // when guestSession is true.
  const elseIdx = block.indexOf(") : (");
  const linkIdx = block.indexOf("<Link");
  assert.ok(elseIdx > -1 && linkIdx > elseIdx, "the Back to Events Link must only render in the non-guest branch");
});
