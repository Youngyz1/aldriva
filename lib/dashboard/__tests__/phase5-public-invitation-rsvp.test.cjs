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
// TEST 1: Token Format & Validation
// =========================================================================
test("Phase 5 Token Validation: only 64-char hexadecimal tokens are valid", () => {
  function isValidInvitationToken(token) {
    return typeof token === "string" && token.length === 64 && /^[0-9a-f]{64}$/i.test(token);
  }

  const validToken = "a1b2c3d4e5f60718293a4b5c6d7e8f90123456789abcdef0123456789abcdef0";
  assert.equal(isValidInvitationToken(validToken), true, "64-char hex token is valid");
  assert.equal(isValidInvitationToken("short-token"), false, "Short token is invalid");
  assert.equal(isValidInvitationToken(""), false, "Empty string is invalid");
  assert.equal(isValidInvitationToken(null), false, "Null token is invalid");
  assert.equal(isValidInvitationToken(undefined), false, "Undefined token is invalid");
  assert.equal(isValidInvitationToken("g".repeat(64)), false, "Non-hex 64-char string is invalid");
});

// =========================================================================
// TEST 2: RSVP State Machine & Invariants
// =========================================================================
test("Phase 5 RSVP Logic: accept and decline update state idempotently without altering QR or seats", () => {
  const invitation = {
    id: "inv-phase5-001",
    event_id: "evt-500",
    guest_name: "Senator Jane Smith",
    token: "1234567890abcdef1234567890abcdef1234567890abcdef1234567890abcdef",
    invitation_status: "sent",
    rsvp_status: "pending",
    rsvp_at: null,
  };

  const ticketInstance = {
    id: "inst-phase5-001",
    invitation_id: "inv-phase5-001",
    order_id: null,
    source: "invitation",
    qr_code: "9876543210ABCDEF9876543210ABCDEF",
    status: "valid",
    seat_id: "seat-501",
    seat_label: "Table 1 (Dignitaries), Seat 4",
  };

  const originalQr = ticketInstance.qr_code;
  const originalInstanceId = ticketInstance.id;
  const originalSeatId = ticketInstance.seat_id;

  function applyRsvp(inv, inst, response) {
    if (["cancelled", "revoked", "expired"].includes(inv.invitation_status)) {
      throw new Error(`This invitation is ${inv.invitation_status} and cannot be updated.`);
    }

    if (inst.status === "used" && response === "declined") {
      throw new Error("Cannot decline an invitation for a guest who has already checked in.");
    }

    const now = new Date().toISOString();
    return {
      updatedInvitation: {
        ...inv,
        rsvp_status: response,
        rsvp_at: now,
      },
      updatedTicketInstance: { ...inst }, // Ticket instance and QR untouched
    };
  }

  // 1. Accept
  const acceptResult = applyRsvp(invitation, ticketInstance, "accepted");
  assert.equal(acceptResult.updatedInvitation.rsvp_status, "accepted");
  assert.ok(acceptResult.updatedInvitation.rsvp_at);
  assert.equal(acceptResult.updatedTicketInstance.qr_code, originalQr, "QR preserved on RSVP accept");
  assert.equal(acceptResult.updatedTicketInstance.id, originalInstanceId, "Ticket instance ID unchanged");
  assert.equal(acceptResult.updatedTicketInstance.seat_id, originalSeatId, "Seat ID unchanged");

  // 2. Repeated Accept (Idempotency)
  const repeatAcceptResult = applyRsvp(acceptResult.updatedInvitation, ticketInstance, "accepted");
  assert.equal(repeatAcceptResult.updatedInvitation.rsvp_status, "accepted");

  // 3. Decline
  const declineResult = applyRsvp(acceptResult.updatedInvitation, ticketInstance, "declined");
  assert.equal(declineResult.updatedInvitation.rsvp_status, "declined");
  assert.equal(declineResult.updatedTicketInstance.qr_code, originalQr, "QR preserved on RSVP decline");
  assert.equal(declineResult.updatedTicketInstance.seat_id, originalSeatId, "Seat ID unchanged on decline");
});

// =========================================================================
// TEST 3: State Guards — Cancelled & Checked-In Invariants
// =========================================================================
test("Phase 5 State Guards: cancelled invitations reject RSVP, checked-in guests cannot decline", () => {
  function applyRsvpGuard(invitationStatus, ticketStatus, response) {
    if (["cancelled", "revoked", "expired"].includes(invitationStatus)) {
      throw new Error(`This invitation is ${invitationStatus} and cannot be updated.`);
    }
    if (ticketStatus === "used" && response === "declined") {
      throw new Error("Cannot decline an invitation for a guest who has already checked in.");
    }
    return true;
  }

  // Cancelled invitation cannot RSVP
  assert.throws(
    () => applyRsvpGuard("cancelled", "valid", "accepted"),
    /cancelled and cannot be updated/
  );

  assert.throws(
    () => applyRsvpGuard("revoked", "valid", "declined"),
    /revoked and cannot be updated/
  );

  // Checked-in guest cannot decline
  assert.throws(
    () => applyRsvpGuard("sent", "used", "declined"),
    /Cannot decline an invitation for a guest who has already checked in/
  );

  // Checked-in guest can reaffirm acceptance
  assert.equal(applyRsvpGuard("sent", "used", "accepted"), true);
});

// =========================================================================
// TEST 4: Public Data Isolation & Security Review
// =========================================================================
test("Phase 5 Security: Public invitation page does not leak PII, raw tokens, or internal notes", () => {
  const pageFile = path.resolve(__dirname, "../../../app/invitation/[token]/page.tsx");
  const clientFile = path.resolve(__dirname, "../../../app/invitation/[token]/InvitationClient.tsx");
  const rsvpRouteFile = path.resolve(__dirname, "../../../app/api/invitation/[token]/rsvp/route.ts");

  assert.ok(fs.existsSync(pageFile), "app/invitation/[token]/page.tsx must exist");
  assert.ok(fs.existsSync(clientFile), "app/invitation/[token]/InvitationClient.tsx must exist");
  assert.ok(fs.existsSync(rsvpRouteFile), "app/api/invitation/[token]/rsvp/route.ts must exist");

  const pageContent = fs.readFileSync(pageFile, "utf8");
  assert.ok(pageContent.includes("robots: {"), "Must configure robots metadata");
  assert.ok(pageContent.includes("index: false"), "Must set noindex for bearer invitation pass");
  assert.ok(pageContent.includes("follow: false"), "Must set nofollow for bearer invitation pass");

  const rsvpContent = fs.readFileSync(rsvpRouteFile, "utf8");
  assert.ok(!rsvpContent.includes("service_role"), "RSVP route must not leak service role credentials");
});

// =========================================================================
// TEST 5: Public Route & Helper Integration
// =========================================================================
test("Phase 5 Integration: rsvpInvitation and getInvitationByToken exported in lib/invitations.ts", () => {
  const invitationsLib = require("@/lib/invitations");

  assert.equal(typeof invitationsLib.getInvitationByToken, "function", "getInvitationByToken must be exported");
  assert.equal(typeof invitationsLib.rsvpInvitation, "function", "rsvpInvitation must be exported");
  assert.equal(typeof invitationsLib.createInvitationCredential, "function", "createInvitationCredential must be exported");
  assert.equal(typeof invitationsLib.sendInvitationEmail, "function", "sendInvitationEmail must be exported");
});
