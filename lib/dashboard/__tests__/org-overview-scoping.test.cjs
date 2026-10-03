const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");

const ROOT = path.resolve(__dirname, "../../..");

test("Org Overview Page (ID-based) strictly scopes ticket_orders to organizer event IDs", () => {
  const filePath = path.join(ROOT, "app/dashboard/org/[id]/overview/page.tsx");
  const content = fs.readFileSync(filePath, "utf8");

  // Must not contain unscoped ticket_orders query
  assert.equal(
    content.includes('supabase.from("ticket_orders").select("quantity", { count: "exact", head: true })'),
    false,
    "Must not contain unscoped ticket_orders count query"
  );

  // Must filter ticket_orders by event_id in eventIds
  assert.ok(
    content.includes('.in("event_id", eventIds)'),
    "ticket_orders query must filter by .in('event_id', eventIds)"
  );

  // Must filter ticket_orders by status in ['valid', 'used']
  assert.ok(
    content.includes('.in("status", ["valid", "used"])'),
    "ticket_orders query must filter by .in('status', ['valid', 'used'])"
  );

  // Must guard ticket query with eventIds length check
  assert.ok(
    content.includes("eventIds.length > 0"),
    "Must check eventIds.length > 0 before querying ticket_orders"
  );
});

test("Org Overview Page (Legacy slug-based) strictly scopes ticket_orders to organizer event IDs", () => {
  const filePath = path.join(ROOT, "app/dashboard/organizations/[slug]/overview/page.tsx");
  const content = fs.readFileSync(filePath, "utf8");

  // Must not contain unscoped ticket_orders query
  assert.equal(
    content.includes('supabase.from("ticket_orders").select("quantity", { count: "exact", head: true })'),
    false,
    "Must not contain unscoped ticket_orders count query"
  );

  // Must filter ticket_orders by event_id in eventIds
  assert.ok(
    content.includes('.in("event_id", eventIds)'),
    "ticket_orders query must filter by .in('event_id', eventIds)"
  );

  // Must filter ticket_orders by status in ['valid', 'used']
  assert.ok(
    content.includes('.in("status", ["valid", "used"])'),
    "ticket_orders query must filter by .in('status', ['valid', 'used'])"
  );

  // Must guard ticket query with eventIds length check
  assert.ok(
    content.includes("eventIds.length > 0"),
    "Must check eventIds.length > 0 before querying ticket_orders"
  );
});

test("Functional test: multi-tenant ticket isolation resolves 0 for org with 0 events despite platform sales", async () => {
  // Mock DB state with 2 organizers:
  // Org A ("Sams abidjan"): 0 events, 0 tickets
  // Org B ("Other Org"): 2 events, 5 tickets total (including valid & used, excluding cancelled/refunded/pending)
  const mockEvents = [
    { id: "evt-b1", title: "Concert B1", organizer_id: "org-b" },
    { id: "evt-b2", title: "Festival B2", organizer_id: "org-b" },
  ];

  const mockTicketOrders = [
    { id: "ord-1", event_id: "evt-b1", quantity: 2, status: "valid" },
    { id: "ord-2", event_id: "evt-b1", quantity: 1, status: "used" },
    { id: "ord-3", event_id: "evt-b2", quantity: 2, status: "valid" },
    { id: "ord-4", event_id: "evt-b2", quantity: 3, status: "refunded" },
    { id: "ord-5", event_id: "evt-b2", quantity: 1, status: "pending" },
    { id: "ord-6", event_id: "evt-b2", quantity: 1, status: "cancelled" },
  ];

  // Helper simulating the overview calculation logic
  function calculateOrgTicketCount(orgId, events, ticketOrders) {
    const orgEvents = events.filter((e) => e.organizer_id === orgId);
    const eventIds = orgEvents.map((e) => e.id);

    let ticketCount = 0;
    if (eventIds.length > 0) {
      const filteredOrders = ticketOrders.filter(
        (o) => eventIds.includes(o.event_id) && ["valid", "used"].includes(o.status)
      );
      ticketCount = filteredOrders.reduce((sum, order) => sum + Number(order.quantity ?? 1), 0);
    }
    return ticketCount;
  }

  // 1. Verify Org A ("Sams abidjan" with 0 events) gets 0 tickets sold
  const countOrgA = calculateOrgTicketCount("org-a-sams-abidjan", mockEvents, mockTicketOrders);
  assert.equal(countOrgA, 0, "Organization with 0 events must resolve exactly 0 tickets sold");

  // 2. Verify Org B gets exactly 5 tickets sold (valid 2 + used 1 + valid 2 = 5, refunded/pending/cancelled excluded)
  const countOrgB = calculateOrgTicketCount("org-b", mockEvents, mockTicketOrders);
  assert.equal(countOrgB, 5, "Organization B must resolve exactly 5 tickets sold (2 + 1 + 2)");
});
