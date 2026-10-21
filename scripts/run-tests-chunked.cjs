/**
 * Run the explicit full test list in bounded child-process argument batches.
 * Direct spawn (no cmd.exe shell) and a conservative command-size cap keep the
 * runner within Windows CreateProcess limits while preserving exact totals.
 */

const fs = require("node:fs");
const path = require("node:path");
const { spawnSync } = require("node:child_process");

const ROOT = path.resolve(__dirname, "..");
const TEST_FILES = JSON.parse(fs.readFileSync(path.join(ROOT, "test-files.json"), "utf8"));
const ALIAS_SETUP = path.join(__dirname, "test-server-only-alias.cjs");
const MAX_ARGUMENT_CHARS = 6_000;
const BASE_ARGS = ["--require", ALIAS_SETUP, "--test", "--test-reporter=tap"];

if (!Array.isArray(TEST_FILES) || TEST_FILES.length === 0 || TEST_FILES.some((file) => typeof file !== "string")) {
  console.error("Invalid test-files.json: expected a non-empty array of paths.");
  process.exit(1);
}

const missingFiles = TEST_FILES.filter((file) => !fs.existsSync(path.join(ROOT, file)));
if (missingFiles.length) {
  console.error(`Missing test files: ${missingFiles.join(", ")}`);
  process.exit(1);
}

const chunks = [];
let chunk = [];
let chunkChars = BASE_ARGS.reduce((sum, arg) => sum + arg.length + 1, process.execPath.length + 1);
for (const file of TEST_FILES) {
  const fileChars = file.length + 1;
  if (chunk.length && chunkChars + fileChars > MAX_ARGUMENT_CHARS) {
    chunks.push(chunk);
    chunk = [];
    chunkChars = BASE_ARGS.reduce((sum, arg) => sum + arg.length + 1, process.execPath.length + 1);
  }
  chunk.push(file);
  chunkChars += fileChars;
}
if (chunk.length) chunks.push(chunk);

function unquoteTapScalar(value) {
  const scalar = value.trim();
  if (scalar.startsWith("'") && scalar.endsWith("'")) return scalar.slice(1, -1).replace(/''/g, "'");
  if (scalar.startsWith('"') && scalar.endsWith('"')) {
    try { return JSON.parse(scalar); } catch { return scalar.slice(1, -1); }
  }
  return scalar;
}

function summarizeTapFailures(output) {
  const lines = output.split(/\r?\n/);
  const failures = [];
  for (let index = 0; index < lines.length; index += 1) {
    const start = lines[index].match(/^not ok \d+ - (.*)$/);
    if (!start) continue;
    let end = index + 1;
    while (end < lines.length && lines[end].trim() !== "..." && !/^not ok \d+ - /.test(lines[end])) end += 1;
    const block = lines.slice(index + 1, end).join("\n");
    const location = block.match(/^\s*location:\s*(.+)$/m)?.[1];
    const error = block.match(/^\s*error:\s*(.+)$/m)?.[1];
    failures.push({ name: start[1], location: location ? unquoteTapScalar(location) : "location unavailable", error: error ? unquoteTapScalar(error) : "assertion details unavailable" });
    index = end;
  }
  return failures;
}

function reportBatchFailure(output, batchNumber, batchCount) {
  const failures = summarizeTapFailures(output);
  if (failures.length) {
    console.error(`Batch ${batchNumber}/${batchCount} failing tests (${failures.length}):`);
    for (const failure of failures) {
      console.error(`- ${failure.name}`);
      console.error(`  File: ${failure.location}`);
      console.error(`  Error: ${failure.error}`);
    }
    return;
  }

  const testNames = output.split(/\r?\n/).filter((line) => /^not ok \d+ - /.test(line));
  if (testNames.length) {
    console.error(`Batch ${batchNumber}/${batchCount} failing test names:`);
    for (const name of testNames) console.error(`- ${name}`);
  } else {
    console.error(`Batch ${batchNumber}/${batchCount} failed without TAP test details. Last output lines:`);
    console.error(output.split(/\r?\n/).slice(-30).join("\n"));
  }
}

let totalTests = 0;
let totalPass = 0;
let totalFail = 0;
let totalSkipped = 0;
let executionErrors = 0;

console.log(`Full test suite: ${TEST_FILES.length} files in ${chunks.length} bounded batches.`);

for (let index = 0; index < chunks.length; index += 1) {
  const files = chunks[index];
  const args = [...BASE_ARGS, ...files];
  const result = spawnSync(process.execPath, args, {
    cwd: ROOT,
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
    timeout: 300_000,
    windowsHide: true,
  });
  const output = `${result.stdout ?? ""}${result.stderr ?? ""}`;
  const count = (label) => {
    const match = output.match(new RegExp(`^# ${label} (\\d+)$`, "m"));
    return match ? Number(match[1]) : null;
  };
  const tests = count("tests");
  const pass = count("pass");
  const fail = count("fail");
  const skipped = count("skipped");

  if (tests === null || pass === null || fail === null || skipped === null || result.error) {
    executionErrors += 1;
    totalFail += fail ?? 1;
    console.error(`Batch ${index + 1}/${chunks.length}: execution/counting error (${files.length} files).`);
    if (result.error) console.error(result.error.message);
    if (output) reportBatchFailure(output, index + 1, chunks.length);
    continue;
  }

  totalTests += tests;
  totalPass += pass;
  totalFail += fail;
  totalSkipped += skipped;
  console.log(`Batch ${index + 1}/${chunks.length}: ${files.length} files, ${pass} passed, ${fail} failed, ${skipped} skipped.`);
  if (result.status !== 0 || fail > 0) reportBatchFailure(output, index + 1, chunks.length);
}

console.log("\nFull suite summary");
console.log(`Files: ${TEST_FILES.length}`);
console.log(`Tests: ${totalTests}`);
console.log(`Passed: ${totalPass}`);
console.log(`Failed: ${totalFail}`);
console.log(`Skipped: ${totalSkipped}`);
console.log(`Batch execution/count errors: ${executionErrors}`);

if (executionErrors > 0 || totalFail > 0 || totalTests !== totalPass + totalFail + totalSkipped) {
  process.exitCode = 1;
}
