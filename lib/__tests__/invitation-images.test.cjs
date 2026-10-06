/**
 * lib/__tests__/invitation-images.test.cjs
 *
 * Unit tests for the invitation image uploader helpers
 * (lib/invitation-images.ts): resize math, EXIF orientation parsing and
 * canvas mapping, focal-point normalization, gallery bounds/reordering,
 * and output MIME selection.
 *
 * Covers: portrait, landscape, square, very large, EXIF-rotated, and tiny
 * images. All helpers are DOM-free so they run in plain Node.
 */

const { describe, test } = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");
const fs = require("node:fs");
const Module = require("node:module");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");
const originalResolveFilename = Module._resolveFilename;

Module._resolveFilename = function resolveAliases(request, parent, isMain, options) {
  if (request.startsWith("@/")) {
    return originalResolveFilename.call(this, path.join(ROOT, request.slice(2)), parent, isMain, options);
  }
  return originalResolveFilename.call(this, request, parent, isMain, options);
};

if (!require.extensions[".ts"]) {
  require.extensions[".ts"] = function compileTs(module, filename) {
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
}

const {
  computeResizeTarget,
  exifSwapsDimensions,
  exifToCanvasTransform,
  focalToObjectPosition,
  formatImageBytes,
  invitationOutputExtension,
  invitationOutputMime,
  canAddGalleryItem,
  moveGalleryItem,
  normalizeFocalPoint,
  orientedDimensions,
  pointerToFocalPoint,
  readExifOrientation,
  INVITATION_GALLERY_MAX,
  INVITATION_MAX_LONG_EDGE_PX,
} = require("../invitation-images.ts");

// ── Minimal JPEG fixture builder (SOI + APP1/EXIF + EOI) ────────────────

function jpegWithExifOrientation(orientation, littleEndian = true) {
  const bytes = [
    0xff, 0xd8, // SOI
    0xff, 0xe1, // APP1
    0x00, 0x22, // segment length = 34 (includes these 2 bytes)
    0x45, 0x78, 0x69, 0x66, 0x00, 0x00, // "Exif\0\0"
  ];
  // TIFF header
  if (littleEndian) bytes.push(0x49, 0x49, 0x2a, 0x00, 0x08, 0x00, 0x00, 0x00);
  else bytes.push(0x4d, 0x4d, 0x00, 0x2a, 0x00, 0x00, 0x00, 0x08);
  // IFD: 1 entry
  bytes.push(littleEndian ? 0x01 : 0x00, littleEndian ? 0x00 : 0x01);
  // Entry: tag 0x0112, type SHORT (3), count 1, value
  const put16 = (v) =>
    littleEndian ? bytes.push(v & 0xff, (v >> 8) & 0xff) : bytes.push((v >> 8) & 0xff, v & 0xff);
  put16(0x0112);
  put16(3);
  bytes.push(...(littleEndian ? [0x01, 0x00, 0x00, 0x00] : [0x00, 0x00, 0x00, 0x01]));
  put16(orientation);
  bytes.push(0x00, 0x00); // pad to 4-byte value field
  bytes.push(0x00, 0x00, 0x00, 0x00); // next IFD offset = 0
  bytes.push(0xff, 0xd9); // EOI
  return new Uint8Array(bytes).buffer;
}

describe("computeResizeTarget (1600px long edge, never upscale)", () => {
  test("landscape photo scales the long edge to 1600", () => {
    assert.deepEqual(computeResizeTarget({ width: 4000, height: 3000 }), { width: 1600, height: 1200 });
  });

  test("portrait photo scales the long edge to 1600", () => {
    assert.deepEqual(computeResizeTarget({ width: 3000, height: 4000 }), { width: 1200, height: 1600 });
  });

  test("square photo scales both edges to 1600", () => {
    assert.deepEqual(computeResizeTarget({ width: 3000, height: 3000 }), { width: 1600, height: 1600 });
  });

  test("very large panorama scales proportionally", () => {
    assert.deepEqual(computeResizeTarget({ width: 12000, height: 3000 }), { width: 1600, height: 400 });
  });

  test("tiny image is never upscaled", () => {
    assert.deepEqual(computeResizeTarget({ width: 400, height: 300 }), { width: 400, height: 300 });
  });

  test("image exactly at the ceiling is unchanged", () => {
    assert.deepEqual(computeResizeTarget({ width: 1600, height: 1200 }), { width: 1600, height: 1200 });
  });

  test("degenerate dimensions fail closed to zero", () => {
    assert.deepEqual(computeResizeTarget({ width: 0, height: 100 }), { width: 0, height: 0 });
  });

  test("ceiling constant is 1600", () => {
    assert.equal(INVITATION_MAX_LONG_EDGE_PX, 1600);
  });
});

describe("EXIF orientation parsing from raw JPEG bytes", () => {
  test("reads orientations 1-8 (little-endian)", () => {
    for (let o = 1; o <= 8; o++) {
      assert.equal(readExifOrientation(jpegWithExifOrientation(o, true)), o, `orientation ${o}`);
    }
  });

  test("reads orientations 1-8 (big-endian)", () => {
    for (let o = 1; o <= 8; o++) {
      assert.equal(readExifOrientation(jpegWithExifOrientation(o, false)), o, `orientation ${o} BE`);
    }
  });

  test("JPEG without EXIF defaults to 1", () => {
    const plain = new Uint8Array([0xff, 0xd8, 0xff, 0xd9]).buffer;
    assert.equal(readExifOrientation(plain), 1);
  });

  test("non-JPEG bytes default to 1", () => {
    const png = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]).buffer;
    assert.equal(readExifOrientation(png), 1);
  });

  test("truncated input never throws and defaults to 1", () => {
    assert.equal(readExifOrientation(new Uint8Array([0xff]).buffer), 1);
    assert.equal(readExifOrientation(new Uint8Array([]).buffer), 1);
  });
});

describe("EXIF orientation geometry (rotated sources)", () => {
  test("orientations 5-8 swap width and height", () => {
    for (const o of [5, 6, 7, 8]) assert.equal(exifSwapsDimensions(o), true, `orientation ${o}`);
    for (const o of [1, 2, 3, 4]) assert.equal(exifSwapsDimensions(o), false, `orientation ${o}`);
  });

  test("EXIF-rotated portrait (orientation 6) resizes against swapped dims", () => {
    // 3000x4000 stored sideways with orientation 6 displays as 4000x3000
    const oriented = orientedDimensions({ width: 3000, height: 4000 }, 6);
    assert.deepEqual(oriented, { width: 4000, height: 3000 });
    assert.deepEqual(computeResizeTarget(oriented), { width: 1600, height: 1200 });
  });

  test("canvas transform covers all 8 orientations without mirroring errors", () => {
    const expected = {
      1: { rotateDeg: 0, flip: "none" },
      2: { rotateDeg: 0, flip: "horizontal" },
      3: { rotateDeg: 180, flip: "none" },
      4: { rotateDeg: 0, flip: "vertical" },
      5: { rotateDeg: 90, flip: "vertical" },
      6: { rotateDeg: 90, flip: "none" },
      7: { rotateDeg: 270, flip: "vertical" },
      8: { rotateDeg: 270, flip: "none" },
    };
    for (const [o, want] of Object.entries(expected)) {
      assert.deepEqual(exifToCanvasTransform(Number(o)), want, `orientation ${o}`);
    }
  });
});

describe("focal point helpers (replace the X/Y sliders)", () => {
  test("normalizes and clamps to integer 0-100", () => {
    assert.deepEqual(normalizeFocalPoint(50, 50), { x: 50, y: 50 });
    assert.deepEqual(normalizeFocalPoint(-12.7, 140.2), { x: 0, y: 100 });
    assert.deepEqual(normalizeFocalPoint(33.4, 66.6), { x: 33, y: 67 });
    assert.deepEqual(normalizeFocalPoint(NaN, Infinity), { x: 50, y: 50 });
  });

  test("produces the same object-position string templates use", () => {
    assert.equal(focalToObjectPosition({ x: 25, y: 75 }), "25% 75%");
  });

  test("pointer position maps to focal percentages", () => {
    const rect = { left: 100, top: 50, width: 200, height: 100 };
    assert.deepEqual(pointerToFocalPoint(150, 100, rect), { x: 25, y: 50 });
    assert.deepEqual(pointerToFocalPoint(0, 0, { left: 0, top: 0, width: 0, height: 0 }), { x: 50, y: 50 });
  });
});

describe("gallery bounds and reordering (12 max, up/down)", () => {
  test("cap is 12 and enforced", () => {
    assert.equal(INVITATION_GALLERY_MAX, 12);
    assert.equal(canAddGalleryItem(11), true);
    assert.equal(canAddGalleryItem(12), false);
    assert.equal(canAddGalleryItem(13), false);
  });

  test("move up/down swaps neighbours", () => {
    assert.deepEqual(moveGalleryItem(["a", "b", "c"], 1, -1), ["b", "a", "c"]);
    assert.deepEqual(moveGalleryItem(["a", "b", "c"], 1, 1), ["a", "c", "b"]);
  });

  test("boundary moves return the array unchanged", () => {
    const items = ["a", "b"];
    assert.equal(moveGalleryItem(items, 0, -1), items);
    assert.equal(moveGalleryItem(items, 1, 1), items);
    assert.equal(moveGalleryItem(items, 9, 1), items);
  });
});

describe("output encoding and size display", () => {
  test("JPEG stays JPEG, PNG/WebP become WebP", () => {
    assert.equal(invitationOutputMime("image/jpeg"), "image/jpeg");
    assert.equal(invitationOutputExtension("image/jpeg"), "jpg");
    assert.equal(invitationOutputMime("image/png"), "image/webp");
    assert.equal(invitationOutputExtension("image/png"), "webp");
    assert.equal(invitationOutputMime("image/webp"), "image/webp");
  });

  test("before/after sizes render human-readable", () => {
    assert.equal(formatImageBytes(6_400_000), "6.1 MB");
    assert.equal(formatImageBytes(820_000), "801 KB");
    assert.equal(formatImageBytes(512), "512 B");
  });
});
