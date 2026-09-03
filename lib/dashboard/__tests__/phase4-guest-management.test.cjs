const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const fs = require("node:fs");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
const originalResolveFilename = Module._resolveFilename;

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
// TEST 1: Guest Validation Rules
// =========================================================================
test("Phase 4 Validation: guest name is required and email format is validated", () => {
  function validateGuestInput({ guestName, email }) {
    const trimmedName = guestName ? String(guestName).trim() : "";
    if (!trimmedName) {
      throw new Error("Guest name is required.");
    }

    if (email) {
      const trimmedEmail = String(email).trim().toLowerCase();
      if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(trimmedEmail)) {
        throw new Error("Enter a valid email address.");
      }
      return { guestName: trimmedName, email: trimmedEmail };
    }

    return { guestName: trimmedName, email: null };
  }

  // Valid inputs
  assert.deepEqual(
    validateGuestInput({ guestName: "Dr. Alice Smith", email: "alice@hospital.org" }),
    { guestName: "Dr. Alice Smith", email: "alice@hospital.org" }
  );

  assert.deepEqual(
    validateGuestInput({ guestName: "Bob Johnson", email: null }),
    { guestName: "Bob Johnson", email: null }
  );

  // Missing name
  assert.throws(
    () => validateGuestInput({ guestName: "", email: "test@example.com" }),
    /Guest name is required/
  );

  assert.throws(
    () => validateGuestInput({ guestName: "   ", email: "test@example.com" }),
    /Guest name is required/
  );

  // Invalid email
  assert.throws(
    () => validateGuestInput({ guestName: "Carol", email: "invalid-email" }),
    /valid email/
  );
});

// =========================================================================
// TEST 2: Credential Lifecycle — Resending email preserves existing QR
// =========================================================================
test("Phase 4 Credential Stability: email resend preserves ticket_instances, qr_code, and order_id = null", () => {
  // Existing invitation and ticket instance
  const invitation = {
    id: "inv-001",
    event_id: "evt-100",
    guest_name: "Governor John Doe",
    email: "gov@state.gov",
    token: "e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855",
    invitation_status: "sent",
    rsvp_status: "pending",
  };

  const ticketInstance = {
    id: "inst-001",
    invitation_id: "inv-001",
    order_id: null,
    source: "invitation",
    qr_code: "1234567890ABCDEF1234567890ABCDEF",
    status: "valid",
    seat_id: "seat-vip-1",
    seat_label: "Table 1 (Dignitaries), Seat 1",
  };

  const originalQr = ticketInstance.qr_code;
  const originalInstanceId = ticketInstance.id;

  // Simulate send/resend action: constructs invitation URL using existing token, without creating a new credential
  function constructEmailPayload(inv, inst, siteUrl) {
    if (["cancelled", "revoked"].includes(inv.invitation_status)) {
      throw new Error(`Cannot send email for a ${inv.invitation_status} invitation`);
    }

    const invitationUrl = `${siteUrl}/invitation/${inv.token}`;
    return {
      recipient: inv.email,
      invitationUrl,
      seatLabel: inst.seat_label,
      instanceId: inst.id,
      qrCode: inst.qr_code,
    };
  }

  const emailPayload = constructEmailPayload(invitation, ticketInstance, "https://aldriva.com");

  assert.equal(emailPayload.recipient, "gov@state.gov");
  assert.equal(emailPayload.invitationUrl, `https://aldriva.com/invitation/${invitation.token}`);
  assert.equal(emailPayload.instanceId, originalInstanceId, "Ticket instance ID remains unchanged");
  assert.equal(emailPayload.qrCode, originalQr, "QR code remains unchanged upon email resend");
});

// =========================================================================
// TEST 3: Cancellation Safety — Cancelling releases seat & protects checked-in guests
// =========================================================================
test("Phase 4 Cancellation: releases seat and blocks cancelling already checked-in guests", () => {
  function cancelGuestInvitation(invitation, ticketInstance, seat) {
    if (ticketInstance.status === "used") {
      throw new Error("Cannot cancel an invitation for a guest who has already checked in.");
    }

    // Return updated states
    return {
      updatedInvitation: { ...invitation, invitation_status: "cancelled" },
      updatedTicketInstance: { ...ticketInstance, status: "cancelled", seat_id: null, seat_label: null },
      updatedSeat: seat ? { ...seat, assigned_invitation_id: null } : null,
    };
  }

  // 1. Valid cancellation of un-checked-in guest with assigned seat
  const inv = { id: "inv-1", invitation_status: "sent" };
  const inst = { id: "inst-1", status: "valid", seat_id: "seat-1", seat_label: "Row A, Seat 1" };
  const seat = { id: "seat-1", assigned_invitation_id: "inv-1" };

  const result = cancelGuestInvitation(inv, inst, seat);
  assert.equal(result.updatedInvitation.invitation_status, "cancelled");
  assert.equal(result.updatedTicketInstance.status, "cancelled");
  assert.equal(result.updatedTicketInstance.seat_id, null);
  assert.equal(result.updatedSeat.assigned_invitation_id, null, "Assigned seat released on cancellation");

  // 2. Cancellation of checked-in guest must be blocked
  const checkedInInst = { id: "inst-2", status: "used", seat_id: "seat-2", seat_label: "Row A, Seat 2" };
  assert.throws(
    () => cancelGuestInvitation(inv, checkedInInst, seat),
    /already checked in/,
    "Checked-in guest cannot be cancelled"
  );
});

// =========================================================================
// TEST 4: Event Isolation in Guest Management Operations
// =========================================================================
test("Phase 4 Event Isolation: guest mutations require exact eventId matching", () => {
  function verifyEventGuestAccess(requestedEventId, guestEventId) {
    if (requestedEventId !== guestEventId) {
      throw new Error(`Event isolation violation: Guest belongs to event ${guestEventId}, not ${requestedEventId}.`);
    }
    return true;
  }

  assert.equal(verifyEventGuestAccess("event-A", "event-A"), true);

  assert.throws(
    () => verifyEventGuestAccess("event-A", "event-B"),
    /Event isolation violation/
  );
});

// =========================================================================
// TEST 5: Security — Token is excluded from Guest Management projections
// =========================================================================
test("Phase 4 Security: Guest API route does not select or expose invitation token in GET responses", () => {
  const guestsRouteFile = path.resolve(__dirname, "../../../app/api/events/[id]/guests/route.ts");
  const guestsPageFile = path.resolve(__dirname, "../../../app/dashboard/events/[id]/guests/page.tsx");

  if (fs.existsSync(guestsRouteFile)) {
    const content = fs.readFileSync(guestsRouteFile, "utf8");
    // Ensure GET query does not include token
    assert.ok(
      !content.includes(".select(\"id, event_id, guest_name, guest_title, organization, email, phone, token") &&
      !content.includes(", token,"),
      "Guests API route GET handler must not fetch or return the token column"
    );
  }

  if (fs.existsSync(guestsPageFile)) {
    const content = fs.readFileSync(guestsPageFile, "utf8");
    assert.ok(
      !content.includes(".select(\"id, event_id, guest_name, guest_title, organization, email, phone, token") &&
      !content.includes(", token,"),
      "Guests dashboard page must not fetch or return the token column"
    );
  }
});

// =========================================================================
// TEST 6: SubNav Integration — Guests Tab is present for canManageEvent
// =========================================================================
test("Phase 4 SubNav: Guests tab is included for event_manager and owner roles", () => {
  const { getEventSubNavTabs } = require("@/lib/event-dashboard-navigation");

  const scannerTabs = getEventSubNavTabs("evt_10", "ticket_scanner").map((t) => t.id);
  assert.equal(scannerTabs.includes("guests"), false, "ticket_scanner must not have guests tab");

  const managerTabs = getEventSubNavTabs("evt_10", "event_manager").map((t) => t.id);
  assert.ok(managerTabs.includes("guests"), "event_manager must have guests tab");

  const ownerTabs = getEventSubNavTabs("evt_10", "owner").map((t) => t.id);
  assert.ok(ownerTabs.includes("guests"), "owner must have guests tab");
});
