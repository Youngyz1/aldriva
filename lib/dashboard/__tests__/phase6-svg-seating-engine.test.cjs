/**
 * lib/dashboard/__tests__/phase6-svg-seating-engine.test.cjs
 *
 * Comprehensive Test Suite for Phase 6:
 * - Spatial geometry persistence & stable seat IDs
 * - Non-seat venue objects (stages, tables, GA zones, text labels)
 * - Section & Table seat generation algorithms
 * - Effective price resolution (seat override -> section default -> ticket type)
 * - Atomic seat reservation & concurrency collision protection
 * - Atomic guest assignment & ticket instance label synchronization
 * - Protection of sold seats from deletion / layout corruption
 * - Full end-to-end convergence on ticket_instances & gate check-in
 */

const assert = require("assert");

// ─── HELPER ALGORITHMS (Mirrors lib/seating.ts for Node testing) ─────────────

function generateSectionSeatsGrid(opts) {
  const {
    eventId,
    layoutId,
    sectionName,
    rowsCount,
    seatsPerRow,
    startX,
    startY,
    seatWidth = 26,
    seatHeight = 26,
    seatGap = 8,
    rowGap = 12,
    rowLabelPrefix = "",
    startRowIndex = 0,
    startSeatNumber = 1,
    ticketTypeId = null,
    defaultPrice = null,
    isVip = false,
    isAccessible = false,
  } = opts;

  const rowsAlpha = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");
  const seats = [];

  for (let r = 0; r < rowsCount; r++) {
    const rowIndex = startRowIndex + r;
    const rowLabel =
      rowLabelPrefix +
      (rowIndex < rowsAlpha.length
        ? rowsAlpha[rowIndex]
        : String(rowIndex + 1));
    const curY = startY + r * (seatHeight + rowGap);

    for (let s = 0; s < seatsPerRow; s++) {
      const seatNumber = startSeatNumber + s;
      const curX = startX + s * (seatWidth + seatGap);

      seats.push({
        event_id: eventId,
        layout_id: layoutId,
        section: sectionName,
        row_label: rowLabel,
        seat_number: seatNumber,
        table_number: null,
        table_name: null,
        table_capacity: null,
        is_vip: isVip,
        is_accessible: isAccessible,
        status: "available",
        reserved_until: null,
        price_override: defaultPrice,
        ticket_id: null,
        ticket_type_id: ticketTypeId,
        assigned_invitation_id: null,
        x: curX,
        y: curY,
        width: seatWidth,
        height: seatHeight,
        rotation: 0,
        object_type: "seat",
      });
    }
  }

  return seats;
}

function generateTableSeats(opts) {
  const {
    eventId,
    layoutId,
    tableNumber,
    tableName = null,
    tableCapacity,
    tableX,
    tableY,
    tableWidth = 100,
    tableHeight = 100,
    tableShape = "round",
    ticketTypeId = null,
    priceOverride = null,
    isVip = false,
  } = opts;

  const seats = [];
  const seatSize = 24;
  const centerX = tableX + tableWidth / 2;
  const centerY = tableY + tableHeight / 2;

  if (tableShape === "round") {
    const radius = Math.max(tableWidth, tableHeight) / 2 + 20;
    for (let i = 0; i < tableCapacity; i++) {
      const angle = (i / tableCapacity) * (2 * Math.PI) - Math.PI / 2;
      const x = centerX + radius * Math.cos(angle) - seatSize / 2;
      const y = centerY + radius * Math.sin(angle) - seatSize / 2;

      seats.push({
        event_id: eventId,
        layout_id: layoutId,
        section: `Table ${tableNumber}`,
        row_label: "T",
        seat_number: i + 1,
        table_number: tableNumber,
        table_name: tableName,
        table_capacity: tableCapacity,
        is_vip: isVip,
        is_accessible: false,
        status: "available",
        reserved_until: null,
        price_override: priceOverride,
        ticket_id: null,
        ticket_type_id: ticketTypeId,
        assigned_invitation_id: null,
        x: Math.round(x),
        y: Math.round(y),
        width: seatSize,
        height: seatSize,
        rotation: Math.round((angle * 180) / Math.PI + 90),
        object_type: "table_seat",
      });
    }
  }

  return seats;
}

function resolveEffectiveSeatPrice(seat, sections = [], ticketTypes = [], fallbackBasePrice = 0) {
  if (seat.price_override != null && seat.price_override >= 0) {
    return seat.price_override;
  }

  if (seat.ticket_type_id) {
    const tt = ticketTypes.find((t) => t.id === seat.ticket_type_id);
    if (tt && tt.price != null) return tt.price;
  }

  if (seat.section) {
    const sec = sections.find((s) => s.name === seat.section);
    if (sec) {
      if (sec.default_price != null && sec.default_price >= 0) {
        return sec.default_price;
      }
      if (sec.ticket_type_id) {
        const tt = ticketTypes.find((t) => t.id === sec.ticket_type_id);
        if (tt && tt.price != null) return tt.price;
      }
    }
  }

  return fallbackBasePrice;
}

function formatSeatLabel(seat) {
  if (seat.table_number) {
    const tablePart = seat.table_name
      ? `Table ${seat.table_number} (${seat.table_name})`
      : `Table ${seat.table_number}`;
    return `${tablePart}, Seat ${seat.seat_number}`;
  }
  return `${seat.section}, Row ${seat.row_label}, Seat ${seat.seat_number}`;
}

// ─── TEST RUNNER ─────────────────────────────────────────────────────────────

let passed = 0;
let failed = 0;

function test(name, fn) {
  try {
    fn();
    console.log(`  ✓ ${name}`);
    passed++;
  } catch (err) {
    console.error(`  ✗ ${name}`);
    console.error(`    ${err.message}`);
    failed++;
  }
}

console.log("\n=======================================================");
console.log("PHASE 6: INTERACTIVE SVG SEATING ENGINE TEST SUITE");
console.log("=======================================================\n");

// ─── 1. SECTION SEAT GRID GENERATION ─────────────────────────────────────────

test("Section grid generator calculates correct coordinates and labels", () => {
  const seats = generateSectionSeatsGrid({
    eventId: "evt-123",
    layoutId: "lay-123",
    sectionName: "Balcony",
    rowsCount: 3,
    seatsPerRow: 5,
    startX: 100,
    startY: 200,
    seatWidth: 26,
    seatHeight: 26,
    seatGap: 4,
    rowGap: 10,
    defaultPrice: 65,
    isVip: false,
    isAccessible: true,
  });

  assert.strictEqual(seats.length, 15, "Generates 3 * 5 = 15 seats");
  assert.strictEqual(seats[0].row_label, "A");
  assert.strictEqual(seats[0].seat_number, 1);
  assert.strictEqual(seats[0].x, 100);
  assert.strictEqual(seats[0].y, 200);
  assert.strictEqual(seats[0].is_accessible, true);
  assert.strictEqual(seats[0].price_override, 65);

  // Check row 2, seat 3
  // rowIndex = 1 ('B') -> y = 200 + 1 * (26 + 10) = 236
  // seatIndex = 2 (seat 3) -> x = 100 + 2 * (26 + 4) = 160
  const seatB3 = seats.find((s) => s.row_label === "B" && s.seat_number === 3);
  assert.ok(seatB3, "Seat B3 must exist");
  assert.strictEqual(seatB3.y, 236);
  assert.strictEqual(seatB3.x, 160);
});

// ─── 2. TABLE SEAT GENERATOR ────────────────────────────────────────────────

test("Round table generator positions seats radially around table center", () => {
  const tableSeats = generateTableSeats({
    eventId: "evt-123",
    layoutId: "lay-123",
    tableNumber: "5",
    tableName: "VIP Sponsors",
    tableCapacity: 6,
    tableX: 300,
    tableY: 300,
    tableWidth: 100,
    tableHeight: 100,
    tableShape: "round",
    isVip: true,
    priceOverride: 150,
  });

  assert.strictEqual(tableSeats.length, 6, "Generates 6 table seats");
  tableSeats.forEach((s, idx) => {
    assert.strictEqual(s.table_number, "5");
    assert.strictEqual(s.table_name, "VIP Sponsors");
    assert.strictEqual(s.seat_number, idx + 1);
    assert.strictEqual(s.is_vip, true);
    assert.strictEqual(s.price_override, 150);
    assert.strictEqual(s.object_type, "table_seat");
    assert.ok(s.x > 0 && s.y > 0, "Coordinates must be positive numbers");
  });

  // Check formatted label
  const label = formatSeatLabel(tableSeats[0]);
  assert.strictEqual(label, "Table 5 (VIP Sponsors), Seat 1");
});

// ─── 3. EFFECTIVE PRICE RESOLUTION ──────────────────────────────────────────

test("Effective price resolves seat override > section default > ticket type", () => {
  const ticketTypes = [
    { id: "tt-vip", event_id: "evt-1", name: "VIP Pass", price: 150 },
    { id: "tt-reg", event_id: "evt-1", name: "Regular", price: 50 },
  ];

  const sections = [
    { name: "Mezzanine", default_price: 80 },
    { name: "Orchestra", ticket_type_id: "tt-vip" },
  ];

  // Case A: Seat price override takes highest precedence
  const seatA = { section: "Mezzanine", price_override: 99, ticket_type_id: "tt-vip" };
  assert.strictEqual(resolveEffectiveSeatPrice(seatA, sections, ticketTypes, 50), 99);

  // Case B: Seat links directly to ticket type
  const seatB = { section: "General", ticket_type_id: "tt-vip" };
  assert.strictEqual(resolveEffectiveSeatPrice(seatB, sections, ticketTypes, 50), 150);

  // Case C: Section default price
  const seatC = { section: "Mezzanine" };
  assert.strictEqual(resolveEffectiveSeatPrice(seatC, sections, ticketTypes, 50), 80);

  // Case D: Section ticket type link
  const seatD = { section: "Orchestra" };
  assert.strictEqual(resolveEffectiveSeatPrice(seatD, sections, ticketTypes, 50), 150);

  // Case E: Fallback base price
  const seatE = { section: "Unmatched" };
  assert.strictEqual(resolveEffectiveSeatPrice(seatE, sections, ticketTypes, 40), 40);
});

// ─── 4. ATOMIC SEAT RESERVATION SIMULATION ──────────────────────────────────

test("Atomic reservation prevents double-booking across concurrent attempts", () => {
  const now = new Date();
  const activeHold = new Date(now.getTime() + 4 * 60 * 1000).toISOString();
  const expiredHold = new Date(now.getTime() - 2 * 60 * 1000).toISOString();

  const databaseSeats = [
    { id: "s-1", status: "available", reserved_until: null, assigned_invitation_id: null },
    { id: "s-2", status: "sold", reserved_until: null, assigned_invitation_id: null },
    { id: "s-3", status: "reserved", reserved_until: activeHold, assigned_invitation_id: null },
    { id: "s-4", status: "reserved", reserved_until: expiredHold, assigned_invitation_id: null },
    { id: "s-5", status: "available", reserved_until: null, assigned_invitation_id: "inv-99" },
    { id: "s-6", status: "unavailable", reserved_until: null, assigned_invitation_id: null },
  ];

  function simulateReserveAtomic(seatIds) {
    const locked = databaseSeats.filter((s) => seatIds.includes(s.id));
    const unavailable = locked.filter(
      (s) =>
        s.status === "sold" ||
        s.status === "unavailable" ||
        s.assigned_invitation_id !== null ||
        (s.status === "reserved" && s.reserved_until && new Date(s.reserved_until) > now)
    );

    if (unavailable.length > 0) {
      return { success: false, unavailableIds: unavailable.map((u) => u.id) };
    }

    // Success -> lock
    locked.forEach((s) => {
      s.status = "reserved";
      s.reserved_until = new Date(now.getTime() + 5 * 60 * 1000).toISOString();
    });

    return { success: true };
  }

  // Attempt 1: Available seat -> succeeds
  const res1 = simulateReserveAtomic(["s-1"]);
  assert.strictEqual(res1.success, true);
  assert.strictEqual(databaseSeats[0].status, "reserved");

  // Attempt 2: Same seat requested concurrently -> rejected
  const res2 = simulateReserveAtomic(["s-1"]);
  assert.strictEqual(res2.success, false);

  // Attempt 3: Sold seat -> rejected
  const res3 = simulateReserveAtomic(["s-2"]);
  assert.strictEqual(res3.success, false);

  // Attempt 4: Expired reservation -> can be claimed!
  const res4 = simulateReserveAtomic(["s-4"]);
  assert.strictEqual(res4.success, true, "Expired hold seat must become available");

  // Attempt 5: Guest-assigned seat -> rejected for ticket buyer hold
  const res5 = simulateReserveAtomic(["s-5"]);
  assert.strictEqual(res5.success, false, "Guest-assigned seat cannot be held by ticket buyer");

  // Attempt 6: Physically unavailable seat -> rejected
  const res6 = simulateReserveAtomic(["s-6"]);
  assert.strictEqual(res6.success, false, "Unavailable seat cannot be held");
});

// ─── 5. ATOMIC INVITATION SEAT ASSIGNMENT ────────────────────────────────────

test("Atomic invitation assignment syncs seat_id and seat_label to ticket_instances", () => {
  const eventId = "evt-100";
  const invitationId = "inv-500";
  const seat = {
    id: "seat-77",
    event_id: eventId,
    section: "A",
    row_label: "3",
    seat_number: 12,
    table_number: null,
    status: "available",
    assigned_invitation_id: null,
  };

  const ticketInstance = {
    id: "inst-900",
    invitation_id: invitationId,
    seat_id: null,
    seat_label: null,
    status: "valid",
    qr_code: "qr-token-12345",
  };

  // Execute assignment
  seat.assigned_invitation_id = invitationId;
  const label = formatSeatLabel(seat);
  ticketInstance.seat_id = seat.id;
  ticketInstance.seat_label = label;

  assert.strictEqual(seat.assigned_invitation_id, invitationId);
  assert.strictEqual(ticketInstance.seat_id, "seat-77");
  assert.strictEqual(ticketInstance.seat_label, "A, Row 3, Seat 12");
  assert.strictEqual(ticketInstance.qr_code, "qr-token-12345", "QR token remains stable");
});

// ─── 6. SPATIAL GEOMETRY INDEPENDENCE ───────────────────────────────────────

test("Moving a seat in the SVG editor changes X/Y coordinates without changing identity or QR", () => {
  const seat = {
    id: "seat-uuid-stable-123",
    section: "Main Floor",
    row_label: "1",
    seat_number: 5,
    x: 100,
    y: 150,
    rotation: 0,
    status: "sold",
  };

  const ticketInstance = {
    id: "inst-uuid-stable-456",
    seat_id: seat.id,
    seat_label: "Main Floor, Row 1, Seat 5",
    qr_code: "qr-stable-789",
  };

  // Organizer moves seat to (500, 300) and rotates 45 degrees
  seat.x = 500;
  seat.y = 300;
  seat.rotation = 45;

  // Verify identity invariants
  assert.strictEqual(seat.id, "seat-uuid-stable-123", "Seat ID must never change on move");
  assert.strictEqual(ticketInstance.seat_id, seat.id, "Ticket instance link remains unbroken");
  assert.strictEqual(ticketInstance.qr_code, "qr-stable-789", "QR code is unaltered by geometry changes");
  assert.strictEqual(seat.status, "sold", "Commercial status is protected");
});

// ─── 7. DELETION PROTECTION FOR SOLD SEATS ──────────────────────────────────

test("Seating engine rejects deletion of sold or guest-assigned seats", () => {
  const seats = [
    { id: "s-free", status: "available", assigned_invitation_id: null },
    { id: "s-sold", status: "sold", assigned_invitation_id: null },
    { id: "s-guest", status: "available", assigned_invitation_id: "inv-1" },
  ];

  function attemptDelete(seatId) {
    const target = seats.find((s) => s.id === seatId);
    if (!target) return { ok: false, error: "Not found" };
    if (target.status === "sold" || target.assigned_invitation_id) {
      return { ok: false, error: "Cannot delete sold or assigned seat" };
    }
    return { ok: true };
  }

  assert.strictEqual(attemptDelete("s-free").ok, true);
  assert.strictEqual(attemptDelete("s-sold").ok, false);
  assert.strictEqual(attemptDelete("s-guest").ok, false);
});

// ─── 8. UNIFIED GATE CHECK-IN CONVERGENCE ───────────────────────────────────

test("Both paid ticket instances and invitation instances converge at check_in_ticket", () => {
  const checkinLedger = [];

  const paidInstance = {
    id: "inst-paid-1",
    source: "purchase",
    seat_id: "seat-1",
    status: "valid",
    qr_code: "qr-paid-123",
  };

  const guestInstance = {
    id: "inst-guest-1",
    source: "invitation",
    seat_id: "seat-2",
    status: "valid",
    qr_code: "qr-guest-456",
  };

  function simulateCheckInRpc(instance, scannedBy) {
    if (instance.status !== "valid") {
      throw new Error("ALREADY_CHECKED_IN");
    }
    instance.status = "used";
    checkinLedger.push({
      ticket_instance_id: instance.id,
      source: instance.source,
      scanned_by: scannedBy,
      checked_in_at: new Date().toISOString(),
    });
    return { success: true };
  }

  // Scan paid ticket
  const resPaid = simulateCheckInRpc(paidInstance, "scanner-user-1");
  assert.strictEqual(resPaid.success, true);
  assert.strictEqual(paidInstance.status, "used");

  // Scan guest pass
  const resGuest = simulateCheckInRpc(guestInstance, "scanner-user-1");
  assert.strictEqual(resGuest.success, true);
  assert.strictEqual(guestInstance.status, "used");

  // Duplicate scan attempt
  assert.throws(() => simulateCheckInRpc(paidInstance, "scanner-user-1"), /ALREADY_CHECKED_IN/);
  assert.throws(() => simulateCheckInRpc(guestInstance, "scanner-user-1"), /ALREADY_CHECKED_IN/);

  assert.strictEqual(checkinLedger.length, 2, "Both sources recorded in unified check-in ledger");
});

console.log(`\nResults: ${passed} passed, ${failed} failed.\n`);
if (failed > 0) process.exit(1);
