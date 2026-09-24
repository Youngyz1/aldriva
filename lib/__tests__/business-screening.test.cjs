const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");
const fs = require("node:fs");
const ts = require("typescript");
const Module = require("node:module");

const ROOT = path.resolve(__dirname, "../..");
require.extensions[".ts"] = function (module, filename) {
  const source = fs.readFileSync(filename, "utf8");
  const output = ts.transpileModule(source, { compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 }, fileName: filename }).outputText;
  module._compile(output, filename);
};
const originalResolve = Module._resolveFilename;
Module._resolveFilename = function(req, parent, isMain, opts) {
  if (req.startsWith("@/")) return originalResolve.call(this, path.join(ROOT, req.slice(2)), parent, isMain, opts);
  return originalResolve.call(this, req, parent, isMain, opts);
};
process.env.BUSINESS_AI_MODERATION = process.env.BUSINESS_AI_MODERATION || "off";
const { screenBusiness, SENSITIVE_CATEGORIES, APPROVE_THRESHOLD, REJECT_THRESHOLD, DISPOSABLE_EMAIL_DOMAINS } = require("../business-screening.ts");

const baseInput = {
  name: "Acme Coffee Shop",
  description: "A cozy neighborhood coffee shop serving fresh brewed coffee and pastries.",
  website: "https://acmecooffee.com",
  email: "hello@acmecooffee.com",
  phone: "+1 555 123 4567",
  industry: "Food & Beverage",
  category: "Café",
  business_type: "Coffee Shop",
  address: "123 Main St",
  city: "New York",
  state: "NY",
  country: "USA",
};
const baseContext = {
  ownerAccountAgeDays: 30,
  ownerEmailVerified: true,
  ownerPriorActiveListings: 2,
  ownerPriorRejectedListings: 0,
  listingsCreatedLast24h: 1,
  duplicateMatches: { byName: 0, byWebsite: 0, byPhone: 0 },
};

test("clean listing approves", () => {
  const res = screenBusiness(baseInput, baseContext);
  assert.equal(res.decision, "approve");
  assert.ok(res.riskScore <= APPROVE_THRESHOLD);
});

test("hard-block term rejects", () => {
  const input = { ...baseInput, description: "We offer crypto doubling guaranteed returns, invest now!" };
  const res = screenBusiness(input, baseContext);
  assert.equal(res.decision, "reject");
  assert.ok(res.riskScore >= REJECT_THRESHOLD);
  assert.ok(res.reasons.some(r => r.includes("Hard-block")));
});

test("disposable email raises score and not approve if other signals", () => {
  const input = { ...baseInput, email: "test@tempmail.com" };
  const ctx = { ownerAccountAgeDays: 1, ownerEmailVerified: false, ownerPriorActiveListings: 0, ownerPriorRejectedListings: 0, listingsCreatedLast24h: 0, duplicateMatches: { byName: 0, byWebsite: 0, byPhone: 0 } };
  const res = screenBusiness(input, ctx);
  assert.ok(res.reasons.some(r => r.includes("Disposable email")));
  const clean = screenBusiness(baseInput, ctx);
  assert.ok(res.riskScore > clean.riskScore);
});

test("duplicate queues", () => {
  const ctx = { ownerAccountAgeDays: 1, ownerEmailVerified: false, ownerPriorActiveListings: 0, ownerPriorRejectedListings: 0, listingsCreatedLast24h: 0, duplicateMatches: { byName: 1, byWebsite: 0, byPhone: 0 } };
  const res = screenBusiness(baseInput, ctx);
  assert.equal(res.decision, "queue");
  assert.ok(res.reasons.some(r => r.includes("Duplicate")));
});

test("sensitive category always queues even with perfect score", () => {
  const input = { ...baseInput, industry: "Health & Medical", category: "Clinic" };
  const perfectCtx = { ownerAccountAgeDays: 100, ownerEmailVerified: true, ownerPriorActiveListings: 5, ownerPriorRejectedListings: 0, listingsCreatedLast24h: 0, duplicateMatches: { byName: 0, byWebsite: 0, byPhone: 0 } };
  const res = screenBusiness(input, perfectCtx);
  assert.equal(res.decision, "queue");
  assert.ok(res.reasons.some(r => r.includes("Sensitive category")));
});

test(">20 listings in 24h rejects", () => {
  const ctx = { ...baseContext, listingsCreatedLast24h: 21 };
  const res = screenBusiness(baseInput, ctx);
  assert.equal(res.decision, "reject");
  assert.equal(res.riskScore, 100);
});

test("trust signals lower the score", () => {
  const riskyInput = { ...baseInput, email: "test@tempmail.com" };
  const untrusted = { ownerAccountAgeDays: 1, ownerEmailVerified: false, ownerPriorActiveListings: 0, ownerPriorRejectedListings: 0, listingsCreatedLast24h: 0, duplicateMatches: { byName: 0, byWebsite: 0, byPhone: 0 } };
  const trusted = { ownerAccountAgeDays: 30, ownerEmailVerified: true, ownerPriorActiveListings: 3, ownerPriorRejectedListings: 0, listingsCreatedLast24h: 0, duplicateMatches: { byName: 0, byWebsite: 0, byPhone: 0 } };
  const a = screenBusiness(riskyInput, untrusted);
  const b = screenBusiness(riskyInput, trusted);
  assert.ok(b.riskScore < a.riskScore, "trusted should have lower score");
});

test("deterministic", () => {
  const r1 = screenBusiness(baseInput, baseContext);
  const r2 = screenBusiness(baseInput, baseContext);
  assert.deepEqual(r1, r2);
});
