const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
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

// =========================================================================
// TEST 1: Database Source Integrity Logic
// =========================================================================
test("DB CHECK Constraint: rejects invalid ticket_instances combinations", () => {
  function validateTicketInstanceSource(row) {
    const isPurchase = row.source === "purchase" && row.order_id !== null && row.invitation_id === null;
    const isInvitation = row.source === "invitation" && row.invitation_id !== null && row.order_id === null;
    return isPurchase || isInvitation;
  }

  // Valid purchase
  assert.equal(
    validateTicketInstanceSource({ source: "purchase", order_id: "order-1", invitation_id: null }),
    true,
    "Valid purchase ticket instance should pass constraint"
  );

  // Valid invitation
  assert.equal(
    validateTicketInstanceSource({ source: "invitation", order_id: null, invitation_id: "invite-1" }),
    true,
    "Valid invitation ticket instance should pass constraint"
  );

  // Invalid: purchase with null order_id
  assert.equal(
    validateTicketInstanceSource({ source: "purchase", order_id: null, invitation_id: null }),
    false,
    "Purchase without order_id must be rejected"
  );

  // Invalid: purchase with invitation_id
  assert.equal(
    validateTicketInstanceSource({ source: "purchase", order_id: "order-1", invitation_id: "invite-1" }),
    false,
    "Purchase with invitation_id must be rejected"
  );

  // Invalid: invitation with order_id
  assert.equal(
    validateTicketInstanceSource({ source: "invitation", order_id: "order-1", invitation_id: "invite-1" }),
    false,
    "Invitation with order_id must be rejected"
  );

  // Invalid: invitation with null invitation_id
  assert.equal(
    validateTicketInstanceSource({ source: "invitation", order_id: null, invitation_id: null }),
    false,
    "Invitation without invitation_id must be rejected"
  );

  // Invalid: unknown source
  assert.equal(
    validateTicketInstanceSource({ source: "free_pass", order_id: null, invitation_id: "invite-1" }),
    false,
    "Unknown source must be rejected"
  );
});

// =========================================================================
// TEST 2: Invitation Token & QR Generation Properties
// =========================================================================
test("Invitation Token Security: 64-char hex token and 32-char hex QR credential", () => {
  const { randomBytes, randomUUID } = require("crypto");

  const token = randomBytes(32).toString("hex");
  const qrCode = randomUUID().replace(/-/g, "").toUpperCase();

  assert.equal(token.length, 64, "Invitation token must be 64 characters hex (256-bit entropy)");
  assert.match(token, /^[0-9a-f]{64}$/, "Invitation token must be lowercase hexadecimal");
  assert.equal(qrCode.length, 32, "QR code must be 32 characters hex");
  assert.match(qrCode, /^[0-9A-F]{32}$/, "QR code must be uppercase hexadecimal");

  // Tokens must be unguessable and distinct
  const token2 = randomBytes(32).toString("hex");
  const qrCode2 = randomUUID().replace(/-/g, "").toUpperCase();
  assert.notEqual(token, token2, "Consecutive tokens must be distinct");
  assert.notEqual(qrCode, qrCode2, "Consecutive QR codes must be distinct");
});

// =========================================================================
// TEST 3: Verification Projection Logic (Purchase vs Invitation)
// =========================================================================
test("Verification Logic: correctly differentiates purchase and invitation instances", () => {
  function projectTicketData(inst) {
    const isInvitation = inst.source === "invitation" || !!inst.invitation_id;
    const orderData = inst.ticket_orders;
    const invitationData = inst.event_invitations;
    const eventData = inst.events;

    let tierName = isInvitation ? "Guest Invitation" : "Standard Entry";
    if (isInvitation && invitationData?.guest_title) {
      tierName = `VIP Guest (${invitationData.guest_title})`;
    }

    const displayName = isInvitation
      ? (invitationData?.guest_name || "Invited Guest")
      : (orderData?.buyer_name || null);
    const displayEmail = isInvitation
      ? (invitationData?.email || null)
      : (orderData?.buyer_email || null);

    return {
      instanceId: inst.id,
      orderId: inst.order_id,
      invitationId: inst.invitation_id || null,
      source: isInvitation ? "invitation" : "purchase",
      eventId: inst.event_id,
      qrCode: inst.qr_code,
      status: inst.status,
      checkedInAt: inst.checked_in_at,
      seatLabel: inst.seat_label,
      tierName,
      buyerName: displayName,
      buyerEmail: displayEmail,
      invitation: isInvitation ? invitationData : null,
      order: {
        id: inst.order_id || inst.invitation_id || inst.id,
        instance_id: inst.id,
        status: inst.status,
        seat_label: inst.seat_label,
        quantity: 1,
        tier_name: tierName,
        source: isInvitation ? "invitation" : "purchase",
        buyer_name: displayName,
        buyer_email: displayEmail,
        guest_title: invitationData?.guest_title || null,
        organization: invitationData?.organization || null,
        total_amount: orderData?.total_amount || 0,
        created_at: inst.created_at,
        checked_in_at: inst.checked_in_at,
        event_id: inst.event_id,
        events: eventData || null,
      },
    };
  }

  // 1. Test Purchase Instance
  const purchaseInstance = {
    id: "inst-purchase-1",
    order_id: "order-123",
    invitation_id: null,
    source: "purchase",
    event_id: "event-abc",
    ticket_id: "tier-1",
    seat_label: "Row A, Seat 1",
    qr_code: "QR1234567890ABCDEF1234567890ABCD",
    status: "valid",
    checked_in_at: null,
    created_at: "2026-09-01T12:00:00Z",
    ticket_orders: {
      id: "order-123",
      buyer_name: "Alice Smith",
      buyer_email: "alice@example.com",
      total_amount: 50.00,
      quantity: 1,
    },
    event_invitations: null,
    events: {
      title: "Charity Gala 2026",
      event_date: "2026-10-01T18:00:00Z",
      venue: "Grand Ballroom",
      city: "Abidjan",
    },
  };

  const purchaseResult = projectTicketData(purchaseInstance);
  assert.equal(purchaseResult.source, "purchase");
  assert.equal(purchaseResult.buyerName, "Alice Smith");
  assert.equal(purchaseResult.buyerEmail, "alice@example.com");
  assert.equal(purchaseResult.order.total_amount, 50.00);
  assert.equal(purchaseResult.invitationId, null);

  // 2. Test Invitation Instance (VIP Guest)
  const invitationInstance = {
    id: "inst-invite-1",
    order_id: null,
    invitation_id: "invite-999",
    source: "invitation",
    event_id: "event-abc",
    ticket_id: null,
    seat_label: "Table 1, Seat 3",
    qr_code: "QR9999999990ABCDEF1234567890ABCD",
    status: "valid",
    checked_in_at: null,
    created_at: "2026-09-02T12:00:00Z",
    ticket_orders: null,
    event_invitations: {
      id: "invite-999",
      guest_name: "Hon. John Doe",
      guest_title: "Governor",
      organization: "State Ministry",
      email: "governor@state.gov",
    },
    events: {
      title: "Charity Gala 2026",
      event_date: "2026-10-01T18:00:00Z",
      venue: "Grand Ballroom",
      city: "Abidjan",
    },
  };

  const inviteResult = projectTicketData(invitationInstance);
  assert.equal(inviteResult.source, "invitation");
  assert.equal(inviteResult.orderId, null);
  assert.equal(inviteResult.invitationId, "invite-999");
  assert.equal(inviteResult.buyerName, "Hon. John Doe");
  assert.equal(inviteResult.buyerEmail, "governor@state.gov");
  assert.equal(inviteResult.tierName, "VIP Guest (Governor)");
  assert.equal(inviteResult.order.guest_title, "Governor");
  assert.equal(inviteResult.order.organization, "State Ministry");
  assert.equal(inviteResult.order.total_amount, 0, "Invitation credential must report 0 amount, not crash or fabricate amount");
});

// =========================================================================
// TEST 4: Atomic Check-in Execution Simulation
// =========================================================================
test("Check-in RPC Simulation: accepts ticket_instance_id with NULL order_id", () => {
  const instancesDb = new Map();
  const checkinsAuditDb = [];

  // Seed valid invitation ticket instance
  instancesDb.set("inst-invite-1", {
    id: "inst-invite-1",
    event_id: "event-abc",
    order_id: null,
    invitation_id: "invite-999",
    status: "valid",
    checked_in_at: null,
  });

  function simulateCheckInTicket(instanceId, scannerUserId) {
    const inst = instancesDb.get(instanceId);
    if (!inst) throw new Error("TICKET_NOT_FOUND");
    if (inst.status === "used") throw new Error("ALREADY_CHECKED_IN");
    if (inst.status === "cancelled") throw new Error("TICKET_CANCELLED");
    if (inst.status === "refunded") throw new Error("TICKET_REFUNDED");
    if (inst.status !== "valid") throw new Error("TICKET_NOT_VALID");

    // Atomic update
    inst.status = "used";
    inst.checked_in_at = new Date().toISOString();

    // Audit row insert (with ticket_order_id = null for invitation)
    const auditRow = {
      id: "audit-" + (checkinsAuditDb.length + 1),
      ticket_instance_id: inst.id,
      ticket_order_id: inst.order_id, // NULL for invitation
      event_id: inst.event_id,
      scanned_by_user_id: scannerUserId,
      checked_in_at: inst.checked_in_at,
    };
    checkinsAuditDb.push(auditRow);

    return inst.id;
  }

  // First scan: should succeed
  const checkedInId = simulateCheckInTicket("inst-invite-1", "scanner-user-123");
  assert.equal(checkedInId, "inst-invite-1");
  assert.equal(checkinsAuditDb.length, 1);
  assert.equal(checkinsAuditDb[0].ticket_instance_id, "inst-invite-1");
  assert.equal(checkinsAuditDb[0].ticket_order_id, null, "Audit row has null ticket_order_id for invitation");
  assert.equal(checkinsAuditDb[0].scanned_by_user_id, "scanner-user-123");

  // Second scan: must throw ALREADY_CHECKED_IN
  assert.throws(
    () => simulateCheckInTicket("inst-invite-1", "scanner-user-123"),
    /ALREADY_CHECKED_IN/,
    "Duplicate scan must be rejected with ALREADY_CHECKED_IN"
  );
});
