const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

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

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      jsx: ts.JsxEmit.ReactJSX,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
require.extensions[".tsx"] = require.extensions[".ts"];

// Test 1: Migration files integrity
console.log("Test 1: Verifying migration 119 files and check constraint...");
const migPath = path.join(ROOT, "db", "migration_119_event_ticket_template.sql");
const rollbackPath = path.join(ROOT, "db", "migration_119_event_ticket_template_rollback.sql");
const mirrorPath = path.join(ROOT, "supabase", "migrations", "20260914000000_migration_119_event_ticket_template.sql");

assert.strictEqual(fs.existsSync(migPath), true, "db/migration_119_event_ticket_template.sql must exist");
assert.strictEqual(fs.existsSync(rollbackPath), true, "db/migration_119_event_ticket_template_rollback.sql must exist");
assert.strictEqual(fs.existsSync(mirrorPath), true, "supabase mirror migration must exist");

const migContent = fs.readFileSync(migPath, "utf8");
assert.strictEqual(migContent.includes("ticket_template TEXT NOT NULL DEFAULT 'modern'"), true, "Must add ticket_template with modern default");
assert.strictEqual(migContent.includes("events_ticket_template_check"), true, "Must have check constraint");
assert.strictEqual(migContent.includes("'modern'"), true, "Check constraint must include modern");
assert.strictEqual(migContent.includes("'concert'"), true, "Check constraint must include concert");
assert.strictEqual(migContent.includes("'premium'"), true, "Check constraint must include premium");
assert.strictEqual(migContent.includes("'minimal'"), true, "Check constraint must include minimal");
console.log("  PASS: Migration 119 files and constraint verified.");

// Test 2: Event dashboard navigation tab
console.log("Test 2: Verifying event dashboard navigation tabs for ticket-design...");
const { getEventSubNavTabs } = require("../event-dashboard-navigation");

const ownerTabs = getEventSubNavTabs("evt-123", "owner");
assert.strictEqual(ownerTabs.some((t) => t.id === "ticket-design" && t.href === "/dashboard/events/evt-123/ticket-design"), true, "Owner must see ticket-design tab");

const managerTabs = getEventSubNavTabs("evt-123", "event_manager");
assert.strictEqual(managerTabs.some((t) => t.id === "ticket-design"), true, "Event manager must see ticket-design tab");

const scannerTabs = getEventSubNavTabs("evt-123", "ticket_scanner");
assert.strictEqual(scannerTabs.some((t) => t.id === "ticket-design"), false, "Ticket scanner must NOT see ticket-design tab");

const anonTabs = getEventSubNavTabs("evt-123", null);
assert.strictEqual(anonTabs.some((t) => t.id === "ticket-design"), false, "Anonymous user must NOT see ticket-design tab");
console.log("  PASS: Dashboard navigation access rules verified.");

// Test 3: TicketCard template resolution and allowTemplateSwitching default
console.log("Test 3: Verifying TicketCard template resolution and switcher exclusion...");
const ticketCardSource = fs.readFileSync(path.join(ROOT, "components", "cards", "TicketCard.tsx"), "utf8");
assert.strictEqual(ticketCardSource.includes("allowTemplateSwitching = false"), true, "TicketCard must default allowTemplateSwitching to false");
assert.strictEqual(ticketCardSource.includes("event.ticketTemplate"), true, "TicketCard must support event.ticketTemplate");
console.log("  PASS: TicketCard default posture verified.");

// Test 4: Ticket confirmation page passes event.ticketTemplate and hardcodes allowTemplateSwitching={false}
console.log("Test 4: Verifying TicketConfirmation page integration...");
const confirmSource = fs.readFileSync(path.join(ROOT, "app", "ticket-confirmation", "page.tsx"), "utf8");
assert.strictEqual(confirmSource.includes("allowTemplateSwitching={false}"), true, "Ticket confirmation must pass allowTemplateSwitching={false}");
assert.strictEqual(confirmSource.includes("event.ticketTemplate"), true, "Ticket confirmation must read event.ticketTemplate");
console.log("  PASS: Ticket confirmation page verified.");

// Test 5: Order-lookup API endpoint includes ticket_template
console.log("Test 5: Verifying order-lookup API route...");
const lookupSource = fs.readFileSync(path.join(ROOT, "app", "api", "tickets", "order-lookup", "route.ts"), "utf8");
assert.strictEqual(lookupSource.includes("ticket_template"), true, "order-lookup must query ticket_template");
assert.strictEqual(lookupSource.includes("ticketTemplate: eventData.ticket_template || \"modern\""), true, "order-lookup must return ticketTemplate defaulting to modern");
console.log("  PASS: Order-lookup API route verified.");

// Test 6: Verify-ticket API endpoint includes ticket_template
console.log("Test 6: Verifying verify-ticket API route...");
const verifySource = fs.readFileSync(path.join(ROOT, "app", "api", "verify-ticket", "route.ts"), "utf8");
assert.strictEqual(verifySource.includes("ticket_template"), true, "verify-ticket must query ticket_template");
console.log("  PASS: Verify-ticket API route verified.");

// Test 7: Ticket design API route and dashboard page exist
console.log("Test 7: Verifying ticket design page and route exist...");
assert.strictEqual(fs.existsSync(path.join(ROOT, "app", "api", "events", "[id]", "ticket-design", "route.ts")), true, "ticket-design API route must exist");
assert.strictEqual(fs.existsSync(path.join(ROOT, "app", "dashboard", "events", "[id]", "ticket-design", "page.tsx")), true, "ticket-design page.tsx must exist");
assert.strictEqual(fs.existsSync(path.join(ROOT, "app", "dashboard", "events", "[id]", "ticket-design", "TicketDesignClient.tsx")), true, "TicketDesignClient.tsx must exist");
console.log("  PASS: Ticket design dashboard page and API route verified.");

console.log("\n=====================================================");
console.log("ALL TICKET DESIGN SYSTEM TESTS PASSED (7/7)");
console.log("======================================================\n");
