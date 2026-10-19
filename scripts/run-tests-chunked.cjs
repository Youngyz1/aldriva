/**
 * scripts/run-tests-chunked.cjs
 *
 * Runs the full test suite in chunks to avoid Windows command-line length limits.
 * Reads the "test" script from package.json, extracts the --test file list,
 * splits it into chunks of 30 files, runs each chunk with the same node flags,
 * and reports pass/fail counts per chunk plus a final summary.
 */

const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const PKG = path.join(ROOT, "package.json");
const pkg = JSON.parse(fs.readFileSync(PKG, "utf8"));
const testScript = pkg.scripts.test || "";

// Extract the node flags (everything before --test) and the file list
const testFlagIdx = testScript.indexOf("--test");
if (testFlagIdx === -1) {
  console.error("ERROR: Could not find '--test' in package.json test script");
  process.exit(1);
}

let nodeFlags = testScript.slice(0, testFlagIdx).trim();
// Strip leading "node " if present, since we use process.execPath explicitly
if (nodeFlags.startsWith("node ")) {
  nodeFlags = nodeFlags.slice(5).trim();
}
const nodeFlagArgs = nodeFlags ? nodeFlags.split(/\s+/) : [];

const fileListPart = testScript.slice(testFlagIdx + "--test".length).trim();
const testFiles = fileListPart.split(/\s+/).filter(Boolean);

console.log(`Total test files: ${testFiles.length}`);

const CHUNK_SIZE = 30;
const chunks = [];
for (let i = 0; i < testFiles.length; i += CHUNK_SIZE) {
  chunks.push(testFiles.slice(i, i + CHUNK_SIZE));
}

console.log(`Number of chunks: ${chunks.length}\n`);

let totalPass = 0;
let totalFail = 0;
const failingTests = [];

for (let i = 0; i < chunks.length; i++) {
  const chunk = chunks[i];
  const cmdArgs = [...nodeFlagArgs, "--test", ...chunk];

  console.log(`--- Chunk ${i + 1}/${chunks.length} (${chunk.length} files) ---`);

  try {
    const result = execFileSync(process.execPath, cmdArgs, {
      cwd: ROOT,
      encoding: "utf8",
      maxBuffer: 50 * 1024 * 1024,
      timeout: 300000,
    });

    const output = typeof result === "string" ? result : (String(result.stdout || "") + String(result.stderr || ""));

    // Parse pass/fail counts
    const passMatches = output.match(/ℹ pass (\d+)/g) || [];
    const failMatches = output.match(/ℹ fail (\d+)/g) || [];
    const passCount = passMatches.reduce((sum, s) => sum + parseInt(s.replace(/\D/g, ""), 10), 0);
    const failCount = failMatches.reduce((sum, s) => sum + parseInt(s.replace(/\D/g, ""), 10), 0);

    totalPass += passCount;
    totalFail += failCount;

    // Extract failing test names
    const failLines = output.match(/✖[^\n]*/g) || [];
    for (const line of failLines) {
      const trimmed = line.replace(/✖\s*/, "").trim();
      const nameMatch = trimmed.match(/^(.*?)\s*\(\d/);
      const testName = nameMatch ? nameMatch[1].trim() : trimmed;
      failingTests.push(`[chunk ${i + 1}] ${testName}`);
    }

    console.log(`  Pass: ${passCount}, Fail: ${failCount}`);
  } catch (err) {
    const output = String(err.stdout || "") + String(err.stderr || "");

    const passMatches = output.match(/ℹ pass (\d+)/g) || [];
    const failMatches = output.match(/ℹ fail (\d+)/g) || [];
    const passCount = passMatches.reduce((sum, s) => sum + parseInt(s.replace(/\D/g, ""), 10), 0);
    const failCount = failMatches.length > 0
      ? failMatches.reduce((sum, s) => sum + parseInt(s.replace(/\D/g, ""), 10), 0)
      : chunk.length;

    totalPass += passCount;
    totalFail += failCount;

    const failLines = output.match(/✖[^\n]*/g) || [];
    for (const line of failLines) {
      const trimmed = line.replace(/✖\s*/, "").trim();
      const nameMatch = trimmed.match(/^(.*?)\s*\(\d/);
      const testName = nameMatch ? nameMatch[1].trim() : trimmed;
      failingTests.push(`[chunk ${i + 1}] ${testName}`);
    }

    console.log(`  Pass: 0, Fail: ${failCount} (chunk execution error)`);
    console.log(`  Error: ${err.message}`);
  }

  console.log("");
}

// Summary
console.log("========================================");
console.log(`TOTAL PASS: ${totalPass}`);
console.log(`TOTAL FAIL: ${totalFail}`);
console.log("========================================");

if (failingTests.length > 0) {
  console.log("\nFailing tests:");
  for (const name of failingTests) {
    console.log(`  ✖ ${name}`);
  }
}

process.exit(totalFail > 0 ? 1 : 0);
