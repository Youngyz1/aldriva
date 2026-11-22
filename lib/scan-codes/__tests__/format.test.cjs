const test = require("node:test");
const assert = require("node:assert/strict");
const ts = require("typescript");
const path = require("node:path");
const fs = require("node:fs");

const SOURCE = path.resolve(__dirname, "..", "format.ts");
const output = ts.transpileModule(fs.readFileSync(SOURCE, "utf8"), {
  compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2020 },
  fileName: SOURCE,
}).outputText;
const moduleObj = { exports: {} };
new Function("module", "exports", "require", output)(moduleObj, moduleObj.exports, require);
const { normalizeScannedPayload, classifyScanPayload, ORDER_SCAN_CODE_RE, RESERVATION_SCAN_CODE_RE, TICKET_CODE_RE } = moduleObj.exports;

const VALID_TICKET = "0123456789ABCDEF0123456789ABCDEF";
const VALID_ORDER = "O1-23456789ABCDEFGH";
const VALID_RESERVATION = "R1-23456789ABCDEFGH";

test("a bare 32-hex ticket code stays classified as a ticket", () => {
  const ticket = "AB12CD34EF56AB12CD34EF56AB12CD34".slice(0, 32);
  assert.equal(classifyScanPayload(ticket), "ticket");
  assert.equal(classifyScanPayload(ticket.toLowerCase()), "ticket");
});

test("O1- and R1- codes are recognised by type", () => {
  assert.equal(classifyScanPayload(VALID_ORDER), "order");
  assert.equal(classifyScanPayload(VALID_RESERVATION), "reservation");
});

test("a URL wrapper is unwrapped to its last path segment before classification", () => {
  assert.equal(classifyScanPayload(`https://aldriva.app/scan/${VALID_ORDER}`), "order");
  assert.equal(classifyScanPayload(`https://aldriva.app/scan/${VALID_RESERVATION}?src=qr#x`), "reservation");
  assert.equal(classifyScanPayload(`https://aldriva.app/scan/${VALID_ORDER}/`), "order");
});

test("lowercase input is still classified correctly (normalized to uppercase)", () => {
  assert.equal(classifyScanPayload(VALID_ORDER.toLowerCase()), "order");
  assert.equal(classifyScanPayload(VALID_RESERVATION.toLowerCase()), "reservation");
});

test("forbidden Crockford letters I, L, O, U are rejected inside the code body", () => {
  for (const letter of ["I", "L", "O", "U"]) {
    const body = ("23456789ABCDEFG" + letter).slice(0, 16);
    assert.equal(classifyScanPayload(`O1-${body}`), "unknown", `O1- body containing ${letter} must be unknown`);
    assert.equal(classifyScanPayload(`R1-${body}`), "unknown", `R1- body containing ${letter} must be unknown`);
  }
});

test("wrong lengths are rejected", () => {
  assert.equal(classifyScanPayload(VALID_TICKET.slice(0, -1)), "unknown");
  assert.equal(classifyScanPayload(VALID_TICKET + "A"), "unknown");
  assert.equal(classifyScanPayload("O1-" + "2".repeat(15)), "unknown");
  assert.equal(classifyScanPayload("O1-" + "2".repeat(17)), "unknown");
});

test("junk input is unknown", () => {
  assert.equal(classifyScanPayload(""), "unknown");
  assert.equal(classifyScanPayload("not-a-code-at-all"), "unknown");
  assert.equal(classifyScanPayload("   "), "unknown");
  assert.equal(classifyScanPayload("X9-2345678901234A"), "unknown");
});

test("a payload over the max length is rejected rather than matched", () => {
  assert.equal(classifyScanPayload("A".repeat(200)), "unknown");
});

test("normalizeScannedPayload trims, strips trailing slashes, and uppercases", () => {
  assert.equal(normalizeScannedPayload(`  ${VALID_ORDER.toLowerCase()}  `), VALID_ORDER);
  assert.equal(normalizeScannedPayload(`${VALID_ORDER}///`), VALID_ORDER);
});

test("property check: no valid O1-/R1- code can ever match the ticket pattern", () => {
  const alphabet = "0123456789ABCDEFGHJKMNPQRSTVWXYZ";
  for (let trial = 0; trial < 200; trial++) {
    let body = "";
    for (let i = 0; i < 16; i++) {
      body += alphabet[Math.floor(Math.random() * alphabet.length)];
    }
    const order = `O1-${body}`;
    const reservation = `R1-${body}`;
    assert.equal(TICKET_CODE_RE.test(order), false);
    assert.equal(TICKET_CODE_RE.test(reservation), false);
    assert.equal(ORDER_SCAN_CODE_RE.test(order), true);
    assert.equal(RESERVATION_SCAN_CODE_RE.test(reservation), true);
  }
});
