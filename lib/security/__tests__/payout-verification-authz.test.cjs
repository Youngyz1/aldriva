/**
 * lib/security/__tests__/payout-verification-authz.test.cjs
 *
 * Security Regression Test Suite (DEC-0016):
 * Asserts that requestRecipientPayout() strictly enforces KYC / identity verification
 * and organizer capability verification before invoking the request_payout_and_debit RPC.
 *
 * Gating Invariants:
 * 1. Unverified user (identity_status !== 'verified') is REJECTED before RPC invocation.
 * 2. Unverified organizer (payment_enabled !== true and status !== 'verified') is REJECTED.
 * 3. Verified user + verified entity proceeds and calls request_payout_and_debit RPC.
 * 4. Unauthenticated callers are rejected immediately.
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");

// Compile TypeScript modules on the fly
require.extensions[".ts"] = function compileTs(module, filename) {
  const fs = require("node:fs");
  const source = fs.readFileSync(filename, "utf8");
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

// Setup path alias resolution for "@/..."
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

// Mock states
let currentUser = null;
let currentProfile = null;
let currentOrganizer = null;
let currentBusiness = null;
let lastRpcCall = null;

const originalLoad = Module._load;
Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/auth" || request === path.join(ROOT, "lib/auth.ts")) {
    return {
      getCurrentUser: async () => currentUser,
      isAdmin: async () => currentUser?.role === "admin",
    };
  }

  if (request === "@/lib/entity-auth" || request === path.join(ROOT, "lib/entity-auth.ts")) {
    return {
      hasEntityAccess: async () => true,
    };
  }

  if (request === "@/lib/supabase-admin" || request === path.join(ROOT, "lib/supabase-admin.ts")) {
    return {
      createSupabaseAdmin: () => ({
        from: (table) => {
          if (table === "profiles") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: currentProfile, error: null }),
                }),
              }),
            };
          }
          if (table === "organizers") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: currentOrganizer, error: null }),
                }),
              }),
            };
          }
          if (table === "businesses") {
            return {
              select: () => ({
                eq: () => ({
                  maybeSingle: async () => ({ data: currentBusiness, error: null }),
                }),
              }),
            };
          }
          return {
            select: () => ({
              eq: () => ({
                maybeSingle: async () => ({ data: null, error: null }),
              }),
            }),
          };
        },
        rpc: async (fnName, params) => {
          lastRpcCall = { fnName, params };
          if (fnName === "resolve_recipient") {
            return { data: "00000000-0000-4000-a000-000000000055", error: null };
          }
          if (fnName === "request_payout_and_debit") {
            return {
              data: [
                {
                  payout_id: "00000000-0000-4000-a000-000000000088",
                  new_balance: 500,
                },
              ],
              error: null,
            };
          }
          return { data: null, error: null };
        },
      }),
    };
  }

  return originalLoad.call(this, request, parent, isMain);
};

// Import the real requestRecipientPayout function under test
const { requestRecipientPayout } = require("@/lib/payouts");

test("requestRecipientPayout rejects unauthenticated calls", async () => {
  currentUser = null;
  currentProfile = null;
  lastRpcCall = null;

  await assert.rejects(
    async () => {
      await requestRecipientPayout({
        recipientType: "user",
        amount: 100,
        currency: "usd",
        destinationType: "bank_transfer",
      });
    },
    /Unauthorized: Please sign in/
  );

  assert.equal(lastRpcCall, null, "RPC must not be called when unauthenticated");
});

test("requestRecipientPayout rejects unverified user before calling request_payout_and_debit RPC", async () => {
  const userId = "00000000-0000-4000-a000-000000000001";
  currentUser = { id: userId, email: "unverified@example.com" };
  // User profile with pending identity status
  currentProfile = { id: userId, identity_status: "pending", status: "active" };
  lastRpcCall = null;

  await assert.rejects(
    async () => {
      await requestRecipientPayout({
        recipientType: "user",
        amount: 150,
        currency: "usd",
        destinationType: "bank_transfer",
      });
    },
    /Identity verification is required before requesting payouts/
  );

  assert.equal(lastRpcCall, null, "request_payout_and_debit RPC must NOT be called for unverified user");
});

test("requestRecipientPayout rejects organizer when payment_enabled is false even if status is verified", async () => {
  const userId = "00000000-0000-4000-a000-000000000001";
  const orgId = "00000000-0000-4000-a000-000000000002";
  currentUser = { id: userId, email: "verified_user@example.com" };
  currentProfile = { id: userId, identity_status: "verified", status: "active" };
  // Disagreement: verified status but payment_enabled is false (e.g. suspended payout rail)
  currentOrganizer = { id: orgId, user_id: userId, payment_enabled: false, status: "verified" };
  lastRpcCall = null;

  await assert.rejects(
    async () => {
      await requestRecipientPayout({
        recipientType: "organizer",
        entityId: orgId,
        amount: 200,
        currency: "usd",
        destinationType: "bank_transfer",
      });
    },
    /Organizer payment capability is not enabled/
  );

  assert.equal(lastRpcCall, null, "request_payout_and_debit RPC must NOT be called when payment_enabled is false");
});

test("requestRecipientPayout rejects organizer when payment_enabled is true but status is draft/unverified", async () => {
  const userId = "00000000-0000-4000-a000-000000000001";
  const orgId = "00000000-0000-4000-a000-000000000002";
  currentUser = { id: userId, email: "verified_user@example.com" };
  currentProfile = { id: userId, identity_status: "verified", status: "active" };
  // Disagreement: payment_enabled is true but organizational review is still draft
  currentOrganizer = { id: orgId, user_id: userId, payment_enabled: true, status: "draft" };
  lastRpcCall = null;

  await assert.rejects(
    async () => {
      await requestRecipientPayout({
        recipientType: "organizer",
        entityId: orgId,
        amount: 200,
        currency: "usd",
        destinationType: "bank_transfer",
      });
    },
    /Organizer payment capability is not enabled/
  );

  assert.equal(lastRpcCall, null, "request_payout_and_debit RPC must NOT be called when organizer status is not verified");
});

test("requestRecipientPayout succeeds for verified user and executes request_payout_and_debit RPC", async () => {
  const userId = "00000000-0000-4000-a000-000000000001";
  const orgId = "00000000-0000-4000-a000-000000000002";
  currentUser = { id: userId, email: "verified_owner@example.com" };
  currentProfile = { id: userId, identity_status: "verified", status: "active" };
  // Both payment_enabled === true AND status === "verified"
  currentOrganizer = { id: orgId, user_id: userId, payment_enabled: true, status: "verified" };
  lastRpcCall = null;

  const result = await requestRecipientPayout({
    recipientType: "organizer",
    entityId: orgId,
    amount: 300,
    currency: "usd",
    destinationType: "bank_transfer",
  });

  assert.ok(result, "Payout request must succeed");
  assert.equal(result.payoutId, "00000000-0000-4000-a000-000000000088");
  assert.equal(result.newBalance, 500);

  assert.ok(lastRpcCall, "RPC must be invoked");
  assert.equal(lastRpcCall.fnName, "request_payout_and_debit");
  assert.equal(lastRpcCall.params.p_amount, 300);
  assert.equal(lastRpcCall.params.p_requested_by, userId);
});

test("requestRecipientPayout rejects business recipient when business is flagged", async () => {
  const userId = "00000000-0000-4000-a000-000000000001";
  const bizId = "00000000-0000-4000-a000-000000000003";
  currentUser = { id: userId, email: "verified_biz_owner@example.com" };
  currentProfile = { id: userId, identity_status: "verified", status: "active" };
  currentBusiness = { id: bizId, owner_id: userId, is_flagged: true, status: "published" };
  lastRpcCall = null;

  await assert.rejects(
    async () => {
      await requestRecipientPayout({
        recipientType: "business",
        entityId: bizId,
        amount: 250,
        currency: "usd",
        destinationType: "bank_transfer",
      });
    },
    /Business payout capability is restricted/
  );

  assert.equal(lastRpcCall, null, "request_payout_and_debit RPC must NOT be called for flagged business");
});

test("requestRecipientPayout rejects business recipient when caller is not the owner", async () => {
  const userId = "00000000-0000-4000-a000-000000000001";
  const strangerId = "00000000-0000-4000-a000-000000000099";
  const bizId = "00000000-0000-4000-a000-000000000003";
  currentUser = { id: userId, email: "verified_user@example.com" };
  currentProfile = { id: userId, identity_status: "verified", status: "active" };
  currentBusiness = { id: bizId, owner_id: strangerId, is_flagged: false, status: "published" };
  lastRpcCall = null;

  await assert.rejects(
    async () => {
      await requestRecipientPayout({
        recipientType: "business",
        entityId: bizId,
        amount: 250,
        currency: "usd",
        destinationType: "bank_transfer",
      });
    },
    /Unauthorized to access payouts for this business/
  );

  assert.equal(lastRpcCall, null, "request_payout_and_debit RPC must NOT be called for non-owner caller");
});

test("requestRecipientPayout succeeds for verified business owner with active listing", async () => {
  const userId = "00000000-0000-4000-a000-000000000001";
  const bizId = "00000000-0000-4000-a000-000000000003";
  currentUser = { id: userId, email: "verified_biz_owner@example.com" };
  currentProfile = { id: userId, identity_status: "verified", status: "active" };
  currentBusiness = { id: bizId, owner_id: userId, is_flagged: false, status: "published" };
  lastRpcCall = null;

  const result = await requestRecipientPayout({
    recipientType: "business",
    entityId: bizId,
    amount: 400,
    currency: "usd",
    destinationType: "bank_transfer",
  });

  assert.ok(result, "Payout request must succeed for verified business owner");
  assert.equal(result.payoutId, "00000000-0000-4000-a000-000000000088");
  assert.equal(result.newBalance, 500);

  assert.ok(lastRpcCall, "RPC must be invoked");
  assert.equal(lastRpcCall.fnName, "request_payout_and_debit");
  assert.equal(lastRpcCall.params.p_amount, 400);
  assert.equal(lastRpcCall.params.p_requested_by, userId);
});
