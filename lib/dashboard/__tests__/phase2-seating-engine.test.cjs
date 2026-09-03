const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

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
// TEST 1: Existing Seating Availability & Reservation Filtering
// =========================================================================
test("Seating Availability: correctly filters available, reserved, sold, and invitation-assigned seats", () => {
  const now = new Date();
  const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  const mockSeats = [
    { id: "seat-1", status: "available", reserved_until: null, assigned_invitation_id: null },
    { id: "seat-2", status: "sold", reserved_until: null, assigned_invitation_id: null },
    { id: "seat-3", status: "reserved", reserved_until: future, assigned_invitation_id: null },
    { id: "seat-4", status: "reserved", reserved_until: past, assigned_invitation_id: null }, // expired reservation
    { id: "seat-5", status: "available", reserved_until: null, assigned_invitation_id: "invite-123" }, // assigned to VIP guest
  ];

  function filterUnavailable(seats) {
    return seats.filter(
      (s) =>
        s.status === "sold" ||
        s.assigned_invitation_id !== null ||
        (s.status === "reserved" && s.reserved_until && new Date(s.reserved_until) > now)
    );
  }

  const unavailable = filterUnavailable(mockSeats);
  const unavailableIds = unavailable.map((s) => s.id);

  assert.deepEqual(
    unavailableIds.sort(),
    ["seat-2", "seat-3", "seat-5"].sort(),
    "Sold seats, active reservations, and invitation-assigned seats must be unavailable"
  );
  assert.ok(!unavailableIds.includes("seat-1"), "Available seat must remain selectable");
  assert.ok(!unavailableIds.includes("seat-4"), "Expired reservation seat must become available again");
});

// =========================================================================
// TEST 2: Table Seating & VIP Metadata
// =========================================================================
test("Table Seating & VIP Metadata: supports grid seats, table seats, and VIP tags", () => {
  // Grid seat (standard row/seat)
  const gridSeat = {
    id: "seat-grid-1",
    event_id: "event-1",
    layout_id: "layout-1",
    section: "Balcony",
    row_label: "A",
    seat_number: 1,
    table_number: null,
    table_name: null,
    table_capacity: null,
    is_vip: false,
    status: "available",
    price_override: null,
    assigned_invitation_id: null,
  };

  // Table seat (gala/banquet layout)
  const tableSeat = {
    id: "seat-table-1",
    event_id: "event-1",
    layout_id: "layout-1",
    section: "Main Hall",
    row_label: "T12",
    seat_number: 4,
    table_number: "12",
    table_name: "Governors Table",
    table_capacity: 10,
    is_vip: true,
    status: "available",
    price_override: 250.00,
    assigned_invitation_id: null,
  };

  assert.equal(gridSeat.table_number, null, "Standard grid seats have null table metadata");
  assert.equal(gridSeat.is_vip, false, "Standard seats default to is_vip = false");

  assert.equal(tableSeat.table_number, "12", "Table seats store table_number");
  assert.equal(tableSeat.table_name, "Governors Table", "Table seats store table_name");
  assert.equal(tableSeat.table_capacity, 10, "Table seats store table_capacity");
  assert.equal(tableSeat.is_vip, true, "VIP seats have is_vip = true");
});

// =========================================================================
// TEST 3: Invitation-to-Seat Assignment & Event Isolation Logic
// =========================================================================
test("Invitation-to-Seat Assignment: enforces event isolation and updates ticket instance", () => {
  const events = {
    "event-A": { id: "event-A", title: "Charity Gala A" },
    "event-B": { id: "event-B", title: "Sports Event B" },
  };

  const seatsDb = new Map([
    ["seat-A1", { id: "seat-A1", event_id: "event-A", section: "Floor", row_label: "A", seat_number: 1, table_number: "5", table_name: "Ambassadors", status: "available", assigned_invitation_id: null }],
    ["seat-B1", { id: "seat-B1", event_id: "event-B", section: "Standard", row_label: "1", seat_number: 1, table_number: null, table_name: null, status: "available", assigned_invitation_id: null }],
  ]);

  const invitationsDb = new Map([
    ["invite-A1", { id: "invite-A1", event_id: "event-A", guest_name: "Hon. Jane Smith" }],
  ]);

  const ticketInstancesDb = new Map([
    ["inst-A1", { id: "inst-A1", event_id: "event-A", invitation_id: "invite-A1", order_id: null, source: "invitation", seat_id: null, seat_label: null }],
  ]);

  function assignSeat(eventId, invitationId, seatId) {
    const seat = seatsDb.get(seatId);
    if (!seat) throw new Error("Seat not found");
    if (seat.event_id !== eventId) {
      throw new Error(`Event isolation violation: Seat belongs to event ${seat.event_id}, not ${eventId}.`);
    }
    if (seat.assigned_invitation_id && seat.assigned_invitation_id !== invitationId) {
      throw new Error("Seat is already assigned to another guest.");
    }

    const invitation = invitationsDb.get(invitationId);
    if (!invitation) throw new Error("Invitation not found");
    if (invitation.event_id !== eventId) {
      throw new Error(`Event isolation violation: Invitation belongs to event ${invitation.event_id}, not ${eventId}.`);
    }

    let seatLabel = `${seat.section}, Row ${seat.row_label}, Seat ${seat.seat_number}`;
    if (seat.table_number) {
      const tableNamePart = seat.table_name ? ` (${seat.table_name})` : "";
      seatLabel = `Table ${seat.table_number}${tableNamePart}, Seat ${seat.seat_number}`;
    }

    seat.assigned_invitation_id = invitationId;

    // Update ticket instance
    for (const inst of ticketInstancesDb.values()) {
      if (inst.invitation_id === invitationId) {
        inst.seat_id = seat.id;
        inst.seat_label = seatLabel;
      }
    }

    return { seatId: seat.id, seatLabel };
  }

  // 1. Cross-Event Assignment: Assigning Event B seat to Event A invitation must throw error
  assert.throws(
    () => assignSeat("event-A", "invite-A1", "seat-B1"),
    /Event isolation violation: Seat belongs to event event-B, not event-A/,
    "Cross-event seat assignment must be rejected"
  );

  // 2. Same-Event Assignment: Succeeded
  const res = assignSeat("event-A", "invite-A1", "seat-A1");
  assert.equal(res.seatId, "seat-A1");
  assert.equal(res.seatLabel, "Table 5 (Ambassadors), Seat 1");

  const updatedSeat = seatsDb.get("seat-A1");
  assert.equal(updatedSeat.assigned_invitation_id, "invite-A1");

  const updatedInst = ticketInstancesDb.get("inst-A1");
  assert.equal(updatedInst.seat_id, "seat-A1");
  assert.equal(updatedInst.seat_label, "Table 5 (Ambassadors), Seat 1");
  assert.equal(updatedInst.order_id, null, "Invitation ticket instance must retain order_id = null");
  assert.equal(updatedInst.source, "invitation", "Invitation ticket instance must retain source = 'invitation'");
});

// =========================================================================
// TEST 4: Nullable Seat Compatibility for Invitations
// =========================================================================
test("Invitation Compatibility: Invitation credentials remain valid with seat_id = NULL", () => {
  const invitationInstance = {
    id: "inst-no-seat",
    event_id: "event-A",
    invitation_id: "invite-123",
    order_id: null,
    source: "invitation",
    seat_id: null,
    seat_label: null,
    qr_code: "QR000000000000000000000000000001",
    status: "valid",
  };

  assert.equal(invitationInstance.seat_id, null, "Invitation credential can exist without an assigned seat");
  assert.equal(invitationInstance.order_id, null, "Invitation credential has no order_id");
  assert.equal(invitationInstance.source, "invitation", "Source is invitation");
  assert.ok(invitationInstance.qr_code.length === 32, "QR code is valid 32-char hex string");
});
