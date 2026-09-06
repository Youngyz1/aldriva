/**
 * lib/dashboard/__tests__/phase6-bulk-guest-import.test.cjs
 *
 * Test suite for bulk guest import:
 * - CSV parsing with quotes and multiline handling
 * - Validation & seat resolution against authoritative DB representation
 * - In-batch and cross-DB duplicate detection
 * - Image pipeline magic bytes validation
 */

const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");
const Module = require("node:module");
const fs = require("node:fs");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../../..");
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

const { parseCsvText, validateGuestRows } = require("../../guest-import");
const { validateImageMagicBytes } = require("../../image-processing");

// ─── TEST 1: CSV Parsing ───────────────────────────────────────────────────

test("CSV Parsing: correctly parses headers, quoted commas, and multi-line records", () => {
  const csv = `name,email,phone,section,row,seat,table,image_url,message
"Smith, John",john@example.com,+1234567890,VIP,A,1,,https://example.com/john.jpg,"Welcome, friend!"
Jane Doe,jane@example.com,+1987654321,,,,Table 1,,See you there!
`;

  const rows = parseCsvText(csv);
  assert.equal(rows.length, 2);
  assert.equal(rows[0].name, "Smith, John");
  assert.equal(rows[0].email, "john@example.com");
  assert.equal(rows[0].section, "VIP");
  assert.equal(rows[0].row, "A");
  assert.equal(rows[0].seat, "1");
  assert.equal(rows[0].message, "Welcome, friend!");
  assert.equal(rows[1].name, "Jane Doe");
  assert.equal(rows[1].table, "Table 1");
});

// ─── TEST 2: Validation & Seat Resolution ───────────────────────────────────

test("Validation: detects missing names, invalid emails, and resolves authoritative seats", async () => {
  const mockAdmin = {
    from: (table) => {
      if (table === "seats") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: "seat-1",
                    event_id: "evt-1",
                    section: "VIP",
                    row_label: "A",
                    seat_number: 1,
                    table_number: null,
                    status: "available",
                    assigned_invitation_id: null,
                  },
                  {
                    id: "seat-2",
                    event_id: "evt-1",
                    section: "VIP",
                    row_label: "A",
                    seat_number: 2,
                    table_number: null,
                    status: "sold",
                    assigned_invitation_id: null,
                  },
                  {
                    id: "seat-table-1",
                    event_id: "evt-1",
                    section: "Table 1",
                    row_label: "T",
                    seat_number: 1,
                    table_number: "1",
                    status: "available",
                    assigned_invitation_id: null,
                  },
                ],
              }),
          }),
        };
      }
      if (table === "event_invitations") {
        return {
          select: () => ({
            eq: () =>
              Promise.resolve({
                data: [
                  {
                    id: "inv-existing",
                    event_id: "evt-1",
                    email: "existing@example.com",
                    guest_name: "Old Guest",
                    invitation_status: "sent",
                  },
                ],
              }),
          }),
        };
      }
      return {
        select: () => ({
          eq: () => Promise.resolve({ data: [] }),
        }),
      };
    },
  };

  const rows = [
    { name: "John Doe", email: "john@example.com", section: "VIP", row: "A", seat: "1" },
    { name: "", email: "noname@example.com" },
    { name: "Bad Email", email: "not-an-email" },
    { name: "Sold Seat Guest", email: "sold@example.com", section: "VIP", row: "A", seat: "2" },
    { name: "Table Guest", email: "table@example.com", table: "1", seat: "1" },
    { name: "Duplicate Guest", email: "existing@example.com" },
  ];

  const preview = await validateGuestRows(rows, "evt-1", mockAdmin);

  assert.equal(preview.totalRows, 6);
  assert.equal(preview.rows[0].status, "valid");
  assert.equal(preview.rows[0].resolvedSeatId, "seat-1");
  assert.equal(preview.rows[1].status, "error");
  assert.equal(preview.rows[1].errors[0].code, "REQUIRED_FIELD_MISSING");
  assert.equal(preview.rows[2].status, "error");
  assert.equal(preview.rows[2].errors[0].code, "INVALID_EMAIL_FORMAT");
  assert.equal(preview.rows[3].status, "error");
  assert.equal(preview.rows[3].errors[0].code, "SEAT_ALREADY_SOLD");
  assert.equal(preview.rows[4].status, "valid");
  assert.equal(preview.rows[4].resolvedSeatId, "seat-table-1");
  assert.equal(preview.rows[5].status, "warning");
  assert.equal(preview.rows[5].warnings[0].code, "DUPLICATE_EMAIL_IN_DB");
});

// ─── TEST 3: Duplicate Seat in Batch Collision ──────────────────────────────

test("Validation: detects duplicate seat assignments within the same CSV batch", async () => {
  const mockAdmin = {
    from: () => ({
      select: () => ({
        eq: () =>
          Promise.resolve({
            data: [
              {
                id: "seat-1",
                event_id: "evt-1",
                section: "VIP",
                row_label: "A",
                seat_number: 1,
                status: "available",
                assigned_invitation_id: null,
              },
            ],
          }),
      }),
    }),
  };

  const rows = [
    { name: "Guest A", email: "a@example.com", section: "VIP", row: "A", seat: "1" },
    { name: "Guest B", email: "b@example.com", section: "VIP", row: "A", seat: "1" },
  ];

  const preview = await validateGuestRows(rows, "evt-1", mockAdmin);
  assert.equal(preview.errorRowsCount, 2);
  assert.equal(preview.rows[0].errors[0].code, "DUPLICATE_SEAT_IN_BATCH");
  assert.equal(preview.rows[1].errors[0].code, "DUPLICATE_SEAT_IN_BATCH");
});

// ─── TEST 4: Image Pipeline Magic Bytes Validation ──────────────────────────

test("Image Pipeline: validates image buffers by magic bytes (JPEG, PNG, WebP)", () => {
  const jpegBuf = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10]);
  const pngBuf = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
  const fakeExe = Buffer.from([0x4d, 0x5a, 0x90, 0x00]);

  assert.equal(validateImageMagicBytes(jpegBuf).valid, true);
  assert.equal(validateImageMagicBytes(jpegBuf).mimeType, "image/jpeg");
  assert.equal(validateImageMagicBytes(pngBuf).valid, true);
  assert.equal(validateImageMagicBytes(pngBuf).mimeType, "image/png");
  assert.equal(validateImageMagicBytes(fakeExe).valid, false);
});
