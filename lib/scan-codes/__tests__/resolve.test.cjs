const { test, beforeEach } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "..", "..", "..");
const SERVER_ONLY_STUB = path.join(ROOT, "scripts", "server-only.stub.cjs");
const originalResolveFilename = Module._resolveFilename;
const originalLoad = Module._load;

require.extensions[".ts"] = function compileTs(mod, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, {
    compilerOptions: {
      esModuleInterop: true,
      module: ts.ModuleKind.CommonJS,
      target: ts.ScriptTarget.ES2020,
    },
    fileName: filename,
  }).outputText;
  mod._compile(output, filename);
};

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request === "server-only") return SERVER_ONLY_STUB;
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

let fakeLookupResult = null;
let lookupCalls = [];

Module._load = function loadMocks(request, parent, isMain) {
  if (request === "@/lib/scan-codes/issue") {
    return {
      lookupScanCode: async (_admin, code) => {
        lookupCalls.push(code);
        return fakeLookupResult;
      },
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const { resolveScannedCode } = require("@/lib/scan-codes/resolve.ts");

const FAKE_ADMIN = {};
const ORDER_LOOKUP = {
  codeType: "order",
  subjectId: "order-1",
  tenantId: "tenant-1",
  businessId: "business-1",
  branchId: null,
  status: "active",
  subjectNumber: "ORD-0001",
  subjectStatus: "pending",
};

let consoleWarnLines = [];
const originalConsoleWarn = console.warn;

beforeEach(() => {
  fakeLookupResult = null;
  lookupCalls = [];
  consoleWarnLines = [];
  console.warn = (line) => consoleWarnLines.push(line);
});

test("ticket delegation: a bare 32-hex code never calls the lookup RPC", async () => {
  const ticket = "AB12CD34EF56AB12CD34EF56AB12CD34".slice(0, 32);
  const result = await resolveScannedCode(FAKE_ADMIN, ticket, { requestId: "req-1" });
  console.warn = originalConsoleWarn;
  assert.deepEqual(result, { kind: "ticket", code: ticket });
  assert.equal(lookupCalls.length, 0);
});

test("unknown: an unrecognised format never calls the lookup RPC", async () => {
  const result = await resolveScannedCode(FAKE_ADMIN, "not-a-real-code", { requestId: "req-2" });
  console.warn = originalConsoleWarn;
  assert.deepEqual(result, { kind: "unknown" });
  assert.equal(lookupCalls.length, 0);
});

test("unknown: a well-formed code the registry has never heard of", async () => {
  fakeLookupResult = null;
  const result = await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", { requestId: "req-3" });
  console.warn = originalConsoleWarn;
  assert.deepEqual(result, { kind: "unknown" });
  assert.equal(lookupCalls.length, 1);
});

test("code_type_mismatch: principal's codeType does not include the resolved type", async () => {
  fakeLookupResult = ORDER_LOOKUP;
  const principal = { codeType: ["ticket", "reservation"], actions: ["check_in"] };
  const result = await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", {
    requestId: "req-4",
    principal,
  });
  console.warn = originalConsoleWarn;
  assert.deepEqual(result, { kind: "code_type_mismatch" });
});

test("scope_mismatch: scope.tenantId present and different from the code's tenant", async () => {
  fakeLookupResult = ORDER_LOOKUP;
  const result = await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", {
    requestId: "req-5",
    scope: { tenantId: "some-other-tenant" },
  });
  console.warn = originalConsoleWarn;
  assert.deepEqual(result, { kind: "scope_mismatch" });
});

test("scope_mismatch: scope.businessId or branchId present and different also rejects", async () => {
  fakeLookupResult = ORDER_LOOKUP;
  const resultBusiness = await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", {
    requestId: "req-6a",
    scope: { businessId: "wrong-business" },
  });
  assert.deepEqual(resultBusiness, { kind: "scope_mismatch" });

  const resultBranch = await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", {
    requestId: "req-6b",
    scope: { branchId: "wrong-branch" },
  });
  console.warn = originalConsoleWarn;
  assert.deepEqual(resultBranch, { kind: "scope_mismatch" });
});

test("scope matching values (or absent scope) do not reject", async () => {
  fakeLookupResult = ORDER_LOOKUP;
  const result = await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", {
    requestId: "req-7",
    scope: { tenantId: "tenant-1", businessId: "business-1" },
  });
  console.warn = originalConsoleWarn;
  assert.equal(result.kind, "subject");
});

test("revoked: a resolved code with status revoked is rejected", async () => {
  fakeLookupResult = { ...ORDER_LOOKUP, status: "revoked" };
  const result = await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", { requestId: "req-8" });
  console.warn = originalConsoleWarn;
  assert.deepEqual(result, { kind: "revoked" });
});

test("subject: a valid, active, in-scope code resolves to its subject with identifiers only", async () => {
  fakeLookupResult = ORDER_LOOKUP;
  const result = await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", { requestId: "req-9" });
  console.warn = originalConsoleWarn;
  assert.deepEqual(result, { kind: "subject", ...ORDER_LOOKUP });
});

test("every rejection writes exactly one structured console line that never contains the scanned code or a token", async () => {
  fakeLookupResult = { ...ORDER_LOOKUP, status: "revoked" };
  const code = "O1-23456789ABCDEFGH";
  await resolveScannedCode(FAKE_ADMIN, code, { requestId: "req-10" });
  console.warn = originalConsoleWarn;

  assert.equal(consoleWarnLines.length, 1);
  const parsed = JSON.parse(consoleWarnLines[0]);
  assert.equal(parsed.event, "scan_code_rejected");
  assert.equal(parsed.requestId, "req-10");
  assert.equal(parsed.reason, "revoked");
  const serialized = JSON.stringify(parsed);
  assert.ok(!serialized.includes(code), "the rejection log must never contain the scanned code");
  assert.ok(!serialized.toLowerCase().includes("token"), "the rejection log must never contain a token field");
});

test("a successful resolution (ticket or subject) writes no rejection log line", async () => {
  fakeLookupResult = ORDER_LOOKUP;
  await resolveScannedCode(FAKE_ADMIN, "O1-23456789ABCDEFGH", { requestId: "req-11" });
  console.warn = originalConsoleWarn;
  assert.equal(consoleWarnLines.length, 0);
});
