/**
 * P0 F-01 regression tests: server-authoritative ticket pricing.
 *
 * Previous exposure: POST /api/checkout trusted client-supplied `ticketPrice`
 * (amount === 0 minted a valid ticket with no payment; any underpriced value
 * was charged via Stripe while the tainted total was recorded).
 * Fixed: lib/ticket-pricing.ts derives the total ONLY from database rows
 * (tier → seat override → section default) and validates event/ticket/seat
 * relationships plus inventory. The helper takes no price input at all, so a
 * client price cannot influence the outcome by construction.
 */
const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

process.env.NEXT_PUBLIC_SUPABASE_URL ??= "http://localhost:54321";
process.env.SUPABASE_SERVICE_ROLE_KEY ??= "test-service-role-key";

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
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

const { resolveTicketCheckoutPricing } = require("../../../lib/ticket-pricing.ts");

const EVENT = { id: "ev1", title: "Paid Fest", slug: "paid-fest", status: "approved", deleted_at: null };
const TICKET = { id: "t1", name: "GA", price: 50, quantity: null, event_id: "ev1" };

// Minimal thenable query stub: canned per-table responses, chainable filters.
// `single` resolves one row (maybeSingle/single); awaiting the chain resolves
// a row list, mirroring postgrest-js behavior.
function makeAdmin(tables) {
  return {
    from(table) {
      const canned = tables[table] === undefined ? { single: null, many: [], error: null } : tables[table];
      const chain = {
        select() { return chain; },
        eq() { return chain; },
        in() { return chain; },
        maybeSingle() { return Promise.resolve({ data: canned.single ?? null, error: canned.error ?? null }); },
        single() { return Promise.resolve({ data: canned.single ?? null, error: canned.error ?? null }); },
        then(resolve, reject) {
          const rows = canned.many !== undefined ? canned.many : canned.single;
          return Promise.resolve({ data: rows ?? null, error: canned.error ?? null }).then(resolve, reject);
        },
      };
      return chain;
    },
  };
}

const baseTables = () => ({
  events: { single: { ...EVENT }, error: null },
  tickets: { single: { ...TICKET }, many: [{ ...TICKET }], error: null },
  ticket_orders: { single: null, many: [], error: null },
});

test("paid ticket: total comes from the database even when the client claims 0", async () => {
  // The helper signature accepts no price field — there is no channel left
  // for ticketPrice: 0 / 0.01 tampering. A $50 ticket resolves to 5000c.
  const res = await resolveTicketCheckoutPricing(makeAdmin(baseTables()), {
    eventId: "ev1",
    ticketId: "t1",
    quantity: 2,
  });
  assert.equal(res.ok, true);
  assert.equal(res.totalCents, 10000);
  assert.equal(res.unitPrice, 50);
});

test("free ticket: database price 0 resolves to a zero total", async () => {
  const tables = baseTables();
  tables.tickets = { single: { ...TICKET, price: 0 }, many: [{ ...TICKET, price: 0 }], error: null };
  const res = await resolveTicketCheckoutPricing(makeAdmin(tables), {
    eventId: "ev1",
    ticketId: "t1",
    quantity: 1,
  });
  assert.equal(res.ok, true);
  assert.equal(res.totalCents, 0);
});

test("ticket from another event is rejected", async () => {
  const tables = baseTables();
  tables.tickets = { single: null, many: [], error: null }; // .eq(event_id) finds nothing
  const res = await resolveTicketCheckoutPricing(makeAdmin(tables), {
    eventId: "ev1",
    ticketId: "other-event-ticket",
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
});

test("nonexistent event is rejected", async () => {
  const tables = baseTables();
  tables.events = { data: null, error: null };
  const res = await resolveTicketCheckoutPricing(makeAdmin(tables), {
    eventId: "nope",
    ticketId: "t1",
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 404);
});

test("seat belonging to another event is rejected", async () => {
  const tables = {
    ...baseTables(),
    seats: { single: { id: "s1", event_id: "OTHER", status: "available", price_override: null, ticket_type_id: null, ticket_id: null, section: "A" }, error: null },
    venue_layouts: { single: null, error: null },
  };
  const res = await resolveTicketCheckoutPricing(makeAdmin(tables), {
    eventId: "ev1",
    ticketId: "t1",
    seatId: "s1",
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test("sold seat is rejected", async () => {
  const tables = {
    ...baseTables(),
    seats: { single: { id: "s1", event_id: "ev1", status: "sold", reserved_until: null, price_override: null, ticket_type_id: null, ticket_id: null, section: "A" }, error: null },
    venue_layouts: { single: null, error: null },
  };
  const res = await resolveTicketCheckoutPricing(makeAdmin(tables), {
    eventId: "ev1",
    ticketId: "t1",
    seatId: "s1",
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 409);
});

test("seat bound to a different ticket tier is rejected", async () => {
  const tables = {
    ...baseTables(),
    seats: { single: { id: "s1", event_id: "ev1", status: "available", reserved_until: null, price_override: null, ticket_type_id: "vip-tier", ticket_id: null, section: "A" }, error: null },
    venue_layouts: { single: null, error: null },
  };
  const res = await resolveTicketCheckoutPricing(makeAdmin(tables), {
    eventId: "ev1",
    ticketId: "t1",
    seatId: "s1",
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 400);
});

test("seat price_override is authoritative (not the tier price)", async () => {
  const tables = {
    ...baseTables(),
    seats: { single: { id: "s1", event_id: "ev1", status: "available", reserved_until: null, price_override: 120, ticket_type_id: null, ticket_id: null, section: "A" }, error: null },
    venue_layouts: { single: { sections: [] }, error: null },
  };
  const res = await resolveTicketCheckoutPricing(makeAdmin(tables), {
    eventId: "ev1",
    ticketId: "t1",
    seatId: "s1",
    quantity: 1,
  });
  assert.equal(res.ok, true);
  assert.equal(res.unitPrice, 120);
  assert.equal(res.totalCents, 12000);
});

test("over-capacity request is rejected", async () => {
  const tables = baseTables();
  tables.tickets = { single: { ...TICKET, quantity: 10 }, many: [{ ...TICKET, quantity: 10 }], error: null };
  tables.ticket_orders = { single: null, many: [{ quantity: 9 }], error: null };
  const res = await resolveTicketCheckoutPricing(makeAdmin(tables), {
    eventId: "ev1",
    ticketId: "t1",
    quantity: 2,
  });
  assert.equal(res.ok, false);
  assert.equal(res.status, 409);
});

test("quantity is clamped to the 1..100 server range", async () => {
  const res = await resolveTicketCheckoutPricing(makeAdmin(baseTables()), {
    eventId: "ev1",
    ticketId: "t1",
    quantity: 999999,
  });
  assert.equal(res.ok, true);
  assert.equal(res.quantity, 100);
});
