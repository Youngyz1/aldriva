const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");

function loadModel() {
  const filename = path.join(ROOT, "lib/courier/dashboard-model.ts");
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  const compiledModule = { exports: {} };
  new Function("module", "exports", "require", output)(compiledModule, compiledModule.exports, require);
  return compiledModule.exports;
}

test("mocked: courier feed poll interval is 15 seconds and pauses while hidden", () => {
  const model = loadModel();
  const component = fs.readFileSync(path.join(ROOT, "components/courier/CourierDashboard.tsx"), "utf8");
  assert.equal(model.COURIER_FEED_POLL_MS, 15_000);
  assert.match(component, /document\.visibilityState !== "visible"/);
  assert.match(component, /document\.addEventListener\("visibilitychange"/);
  assert.match(component, /setInterval\(\(\) => \{ void refresh\(\); \}, COURIER_FEED_POLL_MS\)/);
});

test("mocked: derived state stays on delivery when active and reports offline toggle", () => {
  const { deriveCourierState } = loadModel();
  assert.equal(deriveCourierState(true, true), "On delivery");
  assert.equal(deriveCourierState(false, true), "Offline, delivery in progress");
  assert.equal(deriveCourierState(true, false), "Available");
  assert.equal(deriveCourierState(false, false), "Offline");
});

test("mocked: Google Maps and Waze links encode the text address", () => {
  const { courierNavigationUrls } = loadModel();
  const address = "12 King St, Accra & Ghana";
  const links = courierNavigationUrls(address);
  const encoded = encodeURIComponent(address);
  assert.equal(links.googleMaps, `https://www.google.com/maps/search/?api=1&query=${encoded}`);
  assert.equal(links.waze, `https://waze.com/ul?q=${encoded}&navigate=yes`);
});

test("mocked: courier item summaries retain quantities and names", () => {
  const { formatCourierItems } = loadModel();
  assert.deepEqual(formatCourierItems([{ name: "Rice", quantity: 2 }, { name: "Water" }]), ["2 × Rice", "1 × Water"]);
  assert.deepEqual(formatCourierItems(null), []);
});

test("mocked: courier UI clears customer data on session end, taken offers, and reloads after accept", () => {
  const component = fs.readFileSync(path.join(ROOT, "components/courier/CourierDashboard.tsx"), "utf8");
  assert.match(component, /setFeed\(null\);\s*setScreen\("session-ended"\)/);
  assert.match(component, /offers: current\.offers\.filter\(\(item\) => item\.offer_id !== offer\.offer_id\),\s*assignedOrder: null/);
  assert.match(component, /Never keep the mutation response/);
  assert.match(component, /await refresh\(true\)/);
  assert.match(component, /maxLength=\{300\}/);
});

test("mocked: courier acceptance redirects existing and newly accepted sessions to the dashboard", () => {
  const acceptPage = fs.readFileSync(path.join(ROOT, "app/courier/accept/page.tsx"), "utf8");
  assert.equal(fs.existsSync(path.join(ROOT, "app/courier/page.tsx")), true);
  assert.equal((acceptPage.match(/window\.location\.replace\("\/courier"\)/g) || []).length, 2);
});

test("mocked: owner order card renders courier declines, cash confirmer, and offer count", () => {
  const orderCard = fs.readFileSync(path.join(ROOT, "components/dashboard/orders/OrderCard.tsx"), "utf8");
  const ownerPage = fs.readFileSync(path.join(ROOT, "app/dashboard/org/[id]/orders/page.tsx"), "utf8");
  assert.match(orderCard, /order\.courierDeclines\.map/);
  assert.match(orderCard, /confirmation\.worker_name/);
  assert.match(orderCard, /order\.courierOpenOfferCount/);
  assert.match(ownerPage, /\.from\("business_courier_offers"\)/);
  assert.match(ownerPage, /openOffersByOrder\.set/);
});

test("mocked: business branding displays business name, rejects platform name, and falls back safely", () => {
  const { formatCourierBusinessName } = loadModel();
  assert.equal(formatCourierBusinessName("Churchill Grill"), "Churchill Grill Delivery");
  assert.equal(formatCourierBusinessName("Churchill Grill Delivery"), "Churchill Grill Delivery");
  assert.equal(formatCourierBusinessName("Churchill Grill Livraison"), "Churchill Grill Livraison");
  assert.equal(formatCourierBusinessName("Aldriva"), "Your Business");
  assert.equal(formatCourierBusinessName("Aldriva Courier"), "Your Business");
  assert.equal(formatCourierBusinessName("Aldriva Delivery"), "Your Business");
  assert.equal(formatCourierBusinessName(null), "Your Business");
  assert.equal(formatCourierBusinessName(""), "Your Business");
  assert.equal(formatCourierBusinessName("   "), "Your Business");
  assert.equal(formatCourierBusinessName(null, "fr"), "Votre établissement");
  assert.equal(formatCourierBusinessName("Churchill Grill", "fr"), "Livraison Churchill Grill");
});

test("mocked: courier greeting personalizes by name, respects preferred name, and falls back time-based", () => {
  const { formatCourierGreeting, extractCourierName, getGreetingTimeOfDay } = loadModel();
  const morning = new Date("2026-10-23T09:00:00");
  const afternoon = new Date("2026-10-23T14:00:00");
  const evening = new Date("2026-10-23T19:00:00");

  assert.equal(getGreetingTimeOfDay(morning), "morning");
  assert.equal(getGreetingTimeOfDay(afternoon), "afternoon");
  assert.equal(getGreetingTimeOfDay(evening), "evening");

  // Name extraction: preferred name takes precedence over full name
  assert.equal(extractCourierName({ preferred_name: "Ahmed", full_name: "Ahmed Mansour" }), "Ahmed");
  assert.equal(extractCourierName({ preferredName: "Maria", fullName: "Maria Santos" }), "Maria");
  assert.equal(extractCourierName({ full_name: "David Smith" }), "David Smith");
  assert.equal(extractCourierName("Ahmed"), "Ahmed");
  assert.equal(extractCourierName(null), null);
  assert.equal(extractCourierName("   "), null);

  // Time-based personalized greetings (English)
  assert.equal(formatCourierGreeting("Ahmed", morning), "Good morning, Ahmed!");
  assert.equal(formatCourierGreeting("Maria", afternoon), "Good afternoon, Maria!");
  assert.equal(formatCourierGreeting("David", evening), "Good evening, David!");

  // Fallback when name is unavailable (English)
  assert.equal(formatCourierGreeting(null, morning), "Good morning!");
  assert.equal(formatCourierGreeting("", afternoon), "Good afternoon!");
  assert.equal(formatCourierGreeting(undefined, evening), "Good evening!");

  // Preferred name support in greeting
  assert.equal(formatCourierGreeting({ preferred_name: "Ahmed", full_name: "Ahmed Mansour" }, morning), "Good morning, Ahmed!");
  assert.equal(formatCourierGreeting({ full_name: "Ahmed Mansour" }, morning), "Good morning, Ahmed Mansour!");

  // Time-based personalized greetings (French)
  assert.equal(formatCourierGreeting("Ahmed", morning, "fr"), "Bonjour, Ahmed !");
  assert.equal(formatCourierGreeting("Maria", afternoon, "fr"), "Bonjour, Maria !");
  assert.equal(formatCourierGreeting("David", evening, "fr"), "Bonsoir, David !");
  assert.equal(formatCourierGreeting(null, morning, "fr"), "Bonjour !");
  assert.equal(formatCourierGreeting(null, evening, "fr"), "Bonsoir !");
});

test("mocked: courier dashboard component renders dynamic business branding and personalized greeting", () => {
  const component = fs.readFileSync(path.join(ROOT, "components/courier/CourierDashboard.tsx"), "utf8");
  assert.match(component, /formatCourierBusinessName/);
  assert.match(component, /formatCourierGreeting/);
  assert.doesNotMatch(component, /<span[^>]*>Aldriva Courier<\/span>/, "hardcoded Aldriva Courier banner is removed");
  assert.match(component, /\{businessDisplayName\}/);
  assert.match(component, /\{greeting\}/);
  assert.match(component, /Powered by Aldriva/);
  assert.match(component, /You're on duty • Available for new orders/);
  assert.match(component, /You're currently offline\. Switch on to receive offers\./);
});

