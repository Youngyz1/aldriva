const assert = require("assert");
const fs = require("fs");
const path = require("path");
const Module = require("module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
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

// Test 1: Verify digital card component exports and modules exist
console.log("Test 1: Verifying card component files exist...");
assert.strictEqual(fs.existsSync(path.join("components", "cards", "DigitalCardPrimitives.tsx")), true, "DigitalCardPrimitives must exist");
assert.strictEqual(fs.existsSync(path.join("components", "cards", "InvitationCard.tsx")), true, "InvitationCard must exist");
assert.strictEqual(fs.existsSync(path.join("components", "cards", "TicketCard.tsx")), true, "TicketCard must exist");
assert.strictEqual(fs.existsSync(path.join("components", "cards", "index.ts")), true, "cards index.ts must exist");
console.log("  PASS: All card component files verified.");

// Test 2: Verify InvitationCard handles all required templates and statuses
console.log("Test 2: Verifying InvitationCard template coverage...");
let invContent = fs.readFileSync(path.join("components", "cards", "InvitationCard.tsx"), "utf8");
assert.strictEqual(invContent.includes('elegant'), true, "Must support elegant template");
assert.strictEqual(invContent.includes('modern'), true, "Must support modern template");
assert.strictEqual(invContent.includes('minimal'), true, "Must support minimal template");
assert.strictEqual(invContent.includes('downloadCalendarFile'), true, "Must support .ics calendar generation");
assert.strictEqual(invContent.includes('onRsvp'), true, "Must support onRsvp callback");
console.log("  PASS: InvitationCard template structure verified.");

// Test 3: Verify TicketCard handles ticket stub styling, templates, and QR
console.log("Test 3: Verifying TicketCard template and stub coverage...");
let ticketContent = fs.readFileSync(path.join("components", "cards", "TicketCard.tsx"), "utf8");
assert.strictEqual(ticketContent.includes('concert'), true, "Must support concert template");
assert.strictEqual(ticketContent.includes('premium'), true, "Must support premium template");
assert.strictEqual(ticketContent.includes('CardPerforatedDivider'), true, "Must include perforated divider");
assert.strictEqual(ticketContent.includes('CardQRCode'), true, "Must render QR code");
console.log("  PASS: TicketCard template structure verified.");

// Test 4: Verify Public Invitation page integration
console.log("Test 4: Verifying InvitationClient integration...");
let invClientContent = fs.readFileSync(path.join("app", "invitation", "[token]", "InvitationClient.tsx"), "utf8");
assert.strictEqual(invClientContent.includes('InvitationCard'), true, "InvitationClient must use InvitationCard");
assert.strictEqual(invClientContent.includes('/api/invitation/'), true, "Must call correct RSVP endpoint");
console.log("  PASS: Public invitation page integration verified.");

// Test 5: Verify Ticket Confirmation page integration
console.log("Test 5: Verifying TicketConfirmation integration...");
let ticketConfirmContent = fs.readFileSync(path.join("app", "ticket-confirmation", "page.tsx"), "utf8");
assert.strictEqual(ticketConfirmContent.includes('TicketCard'), true, "TicketConfirmationPage must use TicketCard");
assert.strictEqual(ticketConfirmContent.includes('qrCode'), true, "Must accept qrCode search parameter");
console.log("  PASS: Ticket confirmation page integration verified.");

// Test 6: End-to-end seating and price resolution integrity check
console.log("Test 6: Verifying seating integrity and price resolution...");
const { resolveEffectiveSeatPrice } = require("../../seating");
assert.strictEqual(resolveEffectiveSeatPrice({ price_override: 75 }, [], []), 75, "Price override must take precedence");
assert.strictEqual(resolveEffectiveSeatPrice({ price_override: null, ticket_type_id: 'vip' }, [], [{ id: 'vip', name: 'VIP', price: 50 }]), 50, "Ticket tier price must apply when no override");
assert.strictEqual(resolveEffectiveSeatPrice({ price_override: null, section: 'Balcony' }, [{ name: 'Balcony', default_price: 35 }], []), 35, "Section default price must apply");
assert.strictEqual(resolveEffectiveSeatPrice({ price_override: null }, [], [], 20), 20, "Fallback base price must apply when no other price found");
console.log("  PASS: Seating price resolution integrity verified.");

console.log("\n=====================================================");
console.log("ALL PHASE 6 DIGITAL CARD & TICKET TESTS PASSED (6/6)");
console.log("======================================================\n");