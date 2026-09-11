/**
 * Unit tests for lib/video-validation.ts (P1 F-09).
 *
 * Contract: upload paths must reject files whose *actual bytes* are not a
 * known video container, even when the filename extension and the
 * client-reported MIME type claim otherwise (both are attacker-controlled
 * on direct-to-Storage uploads). Pure byte fixtures below — no fixtures
 * from disk, no network, no DOM.
 */
const assert = require("node:assert/strict");
const test = require("node:test");
const ts = require("typescript");

require.extensions[".ts"] = function compileTs(module, filename) {
  const source = require("node:fs").readFileSync(filename, "utf8");
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

const {
  validateVideoMagicBytes,
  videoMimeToExtension,
  VIDEO_MAX_BYTES,
} = require("../video-validation.ts");

function bytes(arr) {
  return new Uint8Array(arr);
}
function ascii(s) {
  return [...s].map((c) => c.charCodeAt(0));
}
// Minimal ISO BMFF head: [u32 size][ftyp][4-char brand] + padding.
function ftypHead(brand) {
  return bytes([0, 0, 0, 24, 0x66, 0x74, 0x79, 0x70, ...ascii(brand), 0, 0, 0, 0]);
}

test("accepts MP4 (isom brand) as video/mp4", () => {
  const r = validateVideoMagicBytes(ftypHead("isom"), 1024);
  assert.equal(r.valid, true);
  assert.equal(r.mimeType, "video/mp4");
  assert.equal(r.sizeBytes, 1024);
});

test("accepts QuickTime (qt brand) as video/quicktime", () => {
  const r = validateVideoMagicBytes(ftypHead("qt  "), 1024);
  assert.equal(r.valid, true);
  assert.equal(r.mimeType, "video/quicktime");
});

test("accepts WebM by EBML magic + DocType", () => {
  const head = bytes([
    0x1a, 0x45, 0xdf, 0xa3, 0x9f, // EBML header, 31-byte content
    0x42, 0x82, 0x84, 0x77, 0x65, 0x62, 0x6d, // DocType(4) "webm"
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  const r = validateVideoMagicBytes(head, 2048);
  assert.equal(r.valid, true);
  assert.equal(r.mimeType, "video/webm");
});

test("accepts Ogg (OggS) and AVI (RIFF....AVI )", () => {
  const ogg = bytes([0x4f, 0x67, 0x67, 0x53, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(validateVideoMagicBytes(ogg, 100).mimeType, "video/ogg");
  const avi = bytes([
    0x52, 0x49, 0x46, 0x46, 0, 0, 0, 0, 0x41, 0x56, 0x49, 0x20,
  ]);
  assert.equal(validateVideoMagicBytes(avi, 100).mimeType, "video/x-msvideo");
});

test("rejects spoofed HTML renamed to .mp4", () => {
  const html = bytes([...ascii("<html><bod"), 0x79, 0x3e, 0, 0]);
  const r = validateVideoMagicBytes(html, 1024);
  assert.equal(r.valid, false);
  assert.ok(r.error);
});

test("rejects images (JPEG/PNG bytes are not video)", () => {
  const jpeg = bytes([0xff, 0xd8, 0xff, 0xe0, 0, 0, 0, 0, 0, 0, 0, 0]);
  assert.equal(validateVideoMagicBytes(jpeg, 100).valid, false);
  const png = bytes([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 0, 0, 0, 0]);
  assert.equal(validateVideoMagicBytes(png, 100).valid, false);
});

test("rejects audio-only ftyp brands (M4A) and Matroska posing as WebM", () => {
  assert.equal(validateVideoMagicBytes(ftypHead("M4A "), 100).valid, false);
  const mkv = bytes([
    0x1a, 0x45, 0xdf, 0xa3, 0xa3, // EBML header, 35-byte content
    0x42, 0x82, 0x88, ...ascii("matroska"),
    0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0,
  ]);
  assert.equal(validateVideoMagicBytes(mkv, 200).valid, false);
});

test("rejects empty, truncated, and oversized inputs", () => {
  assert.equal(validateVideoMagicBytes(bytes([]), 0).valid, false);
  assert.equal(validateVideoMagicBytes(bytes([0, 0, 0]), 3).valid, false);
  const over = validateVideoMagicBytes(ftypHead("isom"), VIDEO_MAX_BYTES + 1);
  assert.equal(over.valid, false);
  assert.match(over.error ?? "", /50MB/);
});

test("videoMimeToExtension derives safe extensions from detected bytes", () => {
  assert.equal(videoMimeToExtension("video/mp4"), "mp4");
  assert.equal(videoMimeToExtension("video/webm"), "webm");
  assert.equal(videoMimeToExtension("video/ogg"), "ogg");
  assert.equal(videoMimeToExtension("video/quicktime"), "mov");
  assert.equal(videoMimeToExtension("video/x-msvideo"), "avi");
  assert.equal(videoMimeToExtension("video/x-m4v"), "m4v");
  assert.equal(videoMimeToExtension("application/octet-stream"), "mp4");
});
