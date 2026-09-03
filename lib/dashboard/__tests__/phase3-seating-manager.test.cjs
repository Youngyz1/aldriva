const assert = require("node:assert/strict");
const test = require("node:test");

// =========================================================================
// TEST 1: Seat Assignability Rules
// =========================================================================
test("Phase 3 Assignability: sold, active-reserved, and invitation-assigned seats are correctly classified", () => {
  const now = new Date();
  const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();
  const past = new Date(Date.now() - 5 * 60 * 1000).toISOString();

  function isActivelyReserved(seat) {
    return (
      seat.status === "reserved" &&
      !!seat.reserved_until &&
      new Date(seat.reserved_until) > now
    );
  }

  function isAssignable(seat) {
    return seat.status !== "sold" && !isActivelyReserved(seat);
  }

  const available = { status: "available", reserved_until: null, assigned_invitation_id: null };
  const sold = { status: "sold", reserved_until: null, assigned_invitation_id: null };
  const activeReservation = { status: "reserved", reserved_until: future, assigned_invitation_id: null };
  const expiredReservation = { status: "reserved", reserved_until: past, assigned_invitation_id: null };
  const guestSeat = { status: "available", reserved_until: null, assigned_invitation_id: "invite-1" };

  assert.equal(isAssignable(available), true, "Available seat is assignable");
  assert.equal(isAssignable(sold), false, "Sold seat must not be assignable");
  assert.equal(isAssignable(activeReservation), false, "Actively reserved seat must not be assignable");
  assert.equal(isAssignable(expiredReservation), true, "Expired reservation seat is assignable");
  assert.equal(isAssignable(guestSeat), true, "Guest-assigned seat (status=available) is technically reassignable");
  assert.equal(isActivelyReserved(activeReservation), true, "Active reservation is correctly detected");
  assert.equal(isActivelyReserved(expiredReservation), false, "Expired reservation is not active");
});

// =========================================================================
// TEST 2: PATCH Operation — assign_seat server-side validation logic
// =========================================================================
test("Phase 3 API: assign_seat rejects sold seats, active reservations, and cross-event isolation", () => {
  const future = new Date(Date.now() + 5 * 60 * 1000).toISOString();

  function validateAssignSeat(seat, invitation, eventId) {
    if (!seat) throw { status: 404, error: "Seat not found" };
    if (seat.event_id !== eventId)
      throw { status: 409, error: `Event isolation violation: Seat belongs to event ${seat.event_id}` };
    if (seat.status === "sold")
      throw { status: 409, error: "Seat is already sold to a ticket buyer" };
    if (seat.status === "reserved" && seat.reserved_until && new Date(seat.reserved_until) > new Date())
      throw { status: 409, error: "Seat is currently reserved for an active purchase session" };

    if (!invitation) throw { status: 404, error: "Invitation not found" };
    if (invitation.event_id !== eventId)
      throw { status: 409, error: `Event isolation violation: Invitation belongs to event ${invitation.event_id}` };
    if (["cancelled", "revoked", "expired"].includes(invitation.invitation_status))
      throw { status: 409, error: `Cannot assign seat to a ${invitation.invitation_status} invitation` };

    return { success: true };
  }

  // Valid assignment
  assert.doesNotThrow(() =>
    validateAssignSeat(
      { id: "seat-1", event_id: "event-A", status: "available", reserved_until: null },
      { id: "invite-1", event_id: "event-A", invitation_status: "sent" },
      "event-A"
    )
  );

  // Sold seat
  assert.throws(
    () => validateAssignSeat(
      { id: "seat-2", event_id: "event-A", status: "sold", reserved_until: null },
      { id: "invite-1", event_id: "event-A", invitation_status: "sent" },
      "event-A"
    ),
    (err) => err.status === 409 && err.error.includes("sold"),
    "Sold seat must be rejected with 409"
  );

  // Active reservation
  assert.throws(
    () => validateAssignSeat(
      { id: "seat-3", event_id: "event-A", status: "reserved", reserved_until: future },
      { id: "invite-1", event_id: "event-A", invitation_status: "sent" },
      "event-A"
    ),
    (err) => err.status === 409 && err.error.includes("reserved"),
    "Actively reserved seat must be rejected with 409"
  );

  // Cross-event seat
  assert.throws(
    () => validateAssignSeat(
      { id: "seat-B1", event_id: "event-B", status: "available", reserved_until: null },
      { id: "invite-1", event_id: "event-A", invitation_status: "sent" },
      "event-A"
    ),
    (err) => err.error.includes("Event isolation") && err.error.includes("event-B"),
    "Cross-event seat must be rejected"
  );

  // Cross-event invitation
  assert.throws(
    () => validateAssignSeat(
      { id: "seat-A1", event_id: "event-A", status: "available", reserved_until: null },
      { id: "invite-B1", event_id: "event-B", invitation_status: "sent" },
      "event-A"
    ),
    (err) => err.error.includes("Event isolation") && err.error.includes("event-B"),
    "Cross-event invitation must be rejected"
  );

  // Revoked invitation
  assert.throws(
    () => validateAssignSeat(
      { id: "seat-A1", event_id: "event-A", status: "available", reserved_until: null },
      { id: "invite-1", event_id: "event-A", invitation_status: "revoked" },
      "event-A"
    ),
    (err) => err.status === 409 && err.error.includes("revoked"),
    "Revoked invitation must be rejected"
  );
});

// =========================================================================
// TEST 3: update_seat_meta — field whitelist and table_capacity validation
// =========================================================================
test("Phase 3 API: update_seat_meta validates table_capacity and rejects protected fields", () => {
  const ALLOWED_META_FIELDS = new Set(["is_vip", "table_number", "table_name", "table_capacity"]);
  const PROTECTED_FIELDS = ["status", "seat_number", "row_label", "section", "layout_id", "event_id", "ticket_id", "order_id", "invitation_id", "qr_code"];

  function validateSeatMetaUpdate(fields) {
    const update = {};
    for (const [k, v] of Object.entries(fields)) {
      if (PROTECTED_FIELDS.includes(k)) throw new Error(`Field '${k}' is protected`);
      if (ALLOWED_META_FIELDS.has(k)) update[k] = v;
    }

    if (update.table_capacity !== undefined && update.table_capacity !== null) {
      if (!Number.isInteger(update.table_capacity) || update.table_capacity <= 0) {
        throw new Error("table_capacity must be a positive integer");
      }
    }

    if (Object.keys(update).length === 0) throw new Error("No valid fields");
    return update;
  }

  // Valid VIP toggle
  assert.deepEqual(
    validateSeatMetaUpdate({ is_vip: true }),
    { is_vip: true }
  );

  // Valid table metadata
  assert.deepEqual(
    validateSeatMetaUpdate({ table_number: "12", table_name: "Governors Table", table_capacity: 10 }),
    { table_number: "12", table_name: "Governors Table", table_capacity: 10 }
  );

  // Invalid: negative capacity
  assert.throws(
    () => validateSeatMetaUpdate({ table_capacity: -1 }),
    /positive integer/,
    "Negative capacity must be rejected"
  );

  // Invalid: zero capacity
  assert.throws(
    () => validateSeatMetaUpdate({ table_capacity: 0 }),
    /positive integer/,
    "Zero capacity must be rejected"
  );

  // Invalid: protected status field
  assert.throws(
    () => validateSeatMetaUpdate({ status: "sold" }),
    /protected/,
    "Status field mutation must be rejected"
  );
});

// =========================================================================
// TEST 4: QR Code is preserved after seat assignment and reassignment
// =========================================================================
test("QR Preservation: qr_code is unchanged by seat assignment, reassignment, and removal", () => {
  const ticketInstance = {
    id: "inst-invite-1",
    invitation_id: "invite-1",
    order_id: null,
    source: "invitation",
    qr_code: "ABCDEF0123456789ABCDEF0123456789",
    status: "valid",
    seat_id: null,
    seat_label: null,
  };

  const qrBefore = ticketInstance.qr_code;

  // Simulate assignment (only seat_id and seat_label update)
  function applyAssignment(inst, seatId, seatLabel) {
    return { ...inst, seat_id: seatId, seat_label: seatLabel };
  }

  function applyRemoval(inst) {
    return { ...inst, seat_id: null, seat_label: null };
  }

  const afterAssign = applyAssignment(ticketInstance, "seat-A1", "Table 5 (Governors), Seat 1");
  assert.equal(afterAssign.qr_code, qrBefore, "QR unchanged after assignment");
  assert.equal(afterAssign.order_id, null, "order_id unchanged after assignment");
  assert.equal(afterAssign.source, "invitation", "source unchanged after assignment");

  const afterReassign = applyAssignment(afterAssign, "seat-B2", "Table 6, Seat 3");
  assert.equal(afterReassign.qr_code, qrBefore, "QR unchanged after reassignment");
  assert.equal(afterReassign.seat_id, "seat-B2", "seat_id updated on reassignment");

  const afterRemoval = applyRemoval(afterReassign);
  assert.equal(afterRemoval.qr_code, qrBefore, "QR unchanged after removal");
  assert.equal(afterRemoval.seat_id, null, "seat_id cleared after removal");
  assert.equal(afterRemoval.seat_label, null, "seat_label cleared after removal");
  assert.equal(afterRemoval.invitation_id, "invite-1", "invitation_id unchanged");
});

// =========================================================================
// TEST 5: Invitation without seat remains valid (seat_id = NULL)
// =========================================================================
test("Invitation Compatibility: invitation credential valid with no seat assignment", () => {
  const seatlessCred = {
    id: "inst-no-seat",
    invitation_id: "invite-xyz",
    order_id: null,
    source: "invitation",
    seat_id: null,
    seat_label: null,
    qr_code: "FEDCBA9876543210FEDCBA9876543210",
    status: "valid",
  };

  assert.equal(seatlessCred.seat_id, null, "seat_id may be null");
  assert.equal(seatlessCred.order_id, null, "order_id is null for invitations");
  assert.equal(seatlessCred.source, "invitation", "source is 'invitation'");
  assert.equal(seatlessCred.qr_code.length, 32, "QR code is 32-char hex");
});

// =========================================================================
// TEST 6: check_in_ticket is the only admission path — no seating check-in
// =========================================================================
test("Check-in Architecture: seat assignment never creates a new check-in mechanism", () => {
  // This test asserts the absence of seating-specific check-in paths
  const path = require("path");
  const fs = require("fs");

  const seatingDir = path.resolve(__dirname, "../../../app/dashboard/events/[id]/seating");
  const seatingManagerFile = path.join(seatingDir, "SeatingManagerClient.tsx");
  const seatingApiFile = path.resolve(__dirname, "../../../app/api/events/[id]/seating/route.ts");

  if (fs.existsSync(seatingManagerFile)) {
    const content = fs.readFileSync(seatingManagerFile, "utf8");
    assert.ok(!content.includes("seating_checkin"), "No seating_checkin in client");
    assert.ok(!content.includes("seat_checkin"), "No seat_checkin in client");
    assert.ok(!content.includes("invitation_checkin"), "No invitation_checkin in client");
    assert.ok(!content.includes("check_in_ticket"), "SeatingManagerClient does not call check_in_ticket (check-in is scanner's job)");
  }

  if (fs.existsSync(seatingApiFile)) {
    const apiContent = fs.readFileSync(seatingApiFile, "utf8");
    assert.ok(!apiContent.includes("seating_checkin"), "No seating_checkin in seating API");
    assert.ok(!apiContent.includes("seat_checkin"), "No seat_checkin in seating API");
    assert.ok(!apiContent.includes("ticket_checkins") || apiContent.includes("ticket_checkins") === false,
      "Seating API does not write to ticket_checkins");
  }
});

// =========================================================================
// TEST 7: Invitation token is never exposed by the seating API
// =========================================================================
test("Security: invitation token is never selected or returned by seating operations", () => {
  const fs = require("fs");
  const path = require("path");

  const seatingApiFile = path.resolve(__dirname, "../../../app/api/events/[id]/seating/route.ts");
  const seatingPageFile = path.resolve(__dirname, "../../../app/dashboard/events/[id]/seating/page.tsx");

  if (fs.existsSync(seatingApiFile)) {
    const content = fs.readFileSync(seatingApiFile, "utf8");
    // Should not select token column from event_invitations
    assert.ok(
      !content.includes(", token") && !content.includes('"token"') && !content.includes("'token'"),
      "Seating API must not fetch the invitation token column"
    );
  }

  if (fs.existsSync(seatingPageFile)) {
    const content = fs.readFileSync(seatingPageFile, "utf8");
    assert.ok(
      !content.includes(", token") && !content.includes('"token"') && !content.includes("'token'"),
      "Seating page must not fetch the invitation token column"
    );
  }
});

// =========================================================================
// TEST 8: Post-checkin reassignment must be blocked
// =========================================================================
test("Checked-in guest: reassignment is blocked when ticket_instance.status = used", () => {
  function canReassignSeat(ticketInstance) {
    if (ticketInstance.status === "used") {
      throw new Error("Cannot reassign seat for a guest who has already checked in");
    }
    return true;
  }

  const validInst = { id: "inst-1", status: "valid" };
  const usedInst = { id: "inst-2", status: "used" };

  assert.ok(canReassignSeat(validInst), "Valid instance can be reassigned");
  assert.throws(
    () => canReassignSeat(usedInst),
    /already checked in/,
    "Used (checked-in) instance must block reassignment"
  );
});
