/**
 * lib/dashboard/__tests__/date-range.test.cjs
 *
 * Unit tests for shared date range resolution across dashboard periods.
 */

"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");

const ROOT = path.resolve(__dirname, "../../..");

const Module = require("node:module");
const ts = require("typescript");
require.extensions[".ts"] = function compileTs(module, filename) {
  const output = ts.transpileModule(fs.readFileSync(filename, "utf8"), {
    compilerOptions: { esModuleInterop: true, module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
    fileName: filename,
  }).outputText;
  module._compile(output, filename);
};
const originalResolveFilename = Module._resolveFilename;
Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

const { resolvePeriodRange, parsePeriodSearchParams, PERIOD_OPTIONS } = require("../date-range.ts");

test("date-range: resolves today period boundaries", () => {
  const range = resolvePeriodRange("today", "Africa/Abidjan");
  assert.equal(range.kind, "today");
  assert.equal(range.label, "Today");
  assert.ok(range.from instanceof Date);
  assert.ok(range.to instanceof Date);
  assert.ok(range.from.getTime() < range.to.getTime());
  assert.equal(range.timezone, "Africa/Abidjan");
});

test("date-range: resolves 7d period covering 7 days", () => {
  const range = resolvePeriodRange("7d", "UTC");
  assert.equal(range.kind, "7d");
  assert.equal(range.label, "Last 7 days");
  const diffDays = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000);
  assert.ok(diffDays >= 6 && diffDays <= 8, `Expected ~7 days, got ${diffDays}`);
});

test("date-range: resolves 30d period covering 30 days", () => {
  const range = resolvePeriodRange("30d", "UTC");
  assert.equal(range.kind, "30d");
  assert.equal(range.label, "Last 30 days");
  const diffDays = Math.round((range.to.getTime() - range.from.getTime()) / 86_400_000);
  assert.ok(diffDays >= 29 && diffDays <= 31, `Expected ~30 days, got ${diffDays}`);
});

test("date-range: resolves custom range when valid", () => {
  const range = resolvePeriodRange("custom", "UTC", "2026-01-01", "2026-01-15");
  assert.equal(range.kind, "custom");
  assert.equal(range.label, "2026-01-01 – 2026-01-15");
  assert.ok(range.from.toISOString().startsWith("2026-01-01"));
  assert.ok(range.to.toISOString().startsWith("2026-01-15"));
});

test("date-range: falls back to today if custom range is invalid", () => {
  const range = resolvePeriodRange("custom", "UTC", "2026-05-15", "2026-01-01");
  assert.equal(range.kind, "today");
});

test("date-range: parses search parameters correctly", () => {
  const p1 = parsePeriodSearchParams({ period: "7d" });
  assert.equal(p1.kind, "7d");

  const p2 = parsePeriodSearchParams({ period: "custom", from: "2026-02-01", to: "2026-02-10" });
  assert.equal(p2.kind, "custom");
  assert.equal(p2.from, "2026-02-01");
  assert.equal(p2.to, "2026-02-10");

  const p3 = parsePeriodSearchParams({});
  assert.equal(p3.kind, "today");
});
