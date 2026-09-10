/**
 * Unit tests for lib/imageFit.ts contain math (fit-mode banner editor).
 *
 * Contract under test: the COMPLETE source image is always preserved — the
 * drawn rect must lie fully inside the output frame at every setting, the
 * frame must keep the requested aspect, zoom may only shrink (never magnify
 * past fit, which would force cropping), and pan must clamp to the available
 * padding. No DOM is needed: computeContainLayout is pure.
 */
const assert = require("node:assert/strict");
const Module = require("node:module");
const path = require("node:path");
const test = require("node:test");
const ts = require("typescript");

const ROOT = path.resolve(__dirname, "../..");

// Minimal TS loader (same approach as lib/dashboard/__tests__/*): transpile
// the dependency-free lib/imageFit.ts on require.
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
  computeContainLayout,
  FIT_MAX_LONG_EDGE,
  FIT_BACKGROUND,
  FIT_MIN_ZOOM,
} = require("../imageFit.ts");

const SIXTEEN_NINE = 16 / 9;

function assertFullyInside(t, layout, label) {
  t.assert.ok(layout.offsetX >= -1e-9, `${label}: offsetX inside frame`);
  t.assert.ok(layout.offsetY >= -1e-9, `${label}: offsetY inside frame`);
  t.assert.ok(
    layout.offsetX + layout.imageWidth <= layout.frameWidth + 1e-9,
    `${label}: right edge inside frame`
  );
  t.assert.ok(
    layout.offsetY + layout.imageHeight <= layout.frameHeight + 1e-9,
    `${label}: bottom edge inside frame`
  );
}

test("wide landscape image is fully preserved in a 16:9 frame", (t) => {
  const layout = computeContainLayout({
    srcWidth: 1920,
    srcHeight: 1080,
    frameAspect: SIXTEEN_NINE,
  });
  // Same aspect: no padding, image fills the frame edge-to-edge.
  t.assert.equal(layout.imageWidth, layout.frameWidth);
  t.assert.equal(layout.imageHeight, layout.frameHeight);
  assertFullyInside(t, layout, "landscape");
});

test("tall portrait image is fully preserved (letterboxed, not cropped)", (t) => {
  const layout = computeContainLayout({
    srcWidth: 1080,
    srcHeight: 1920,
    frameAspect: SIXTEEN_NINE,
  });
  t.assert.equal(layout.frameWidth / layout.frameHeight, SIXTEEN_NINE);
  // Full height visible; padding appears left/right instead of cropping.
  t.assert.equal(layout.imageHeight, layout.frameHeight);
  t.assert.ok(layout.imageWidth < layout.frameWidth, "portrait gets side padding");
  t.assert.ok(layout.offsetX > 0, "image centered with padding");
  assertFullyInside(t, layout, "portrait");
});

test("square image is fully preserved", (t) => {
  const layout = computeContainLayout({
    srcWidth: 1200,
    srcHeight: 1200,
    frameAspect: SIXTEEN_NINE,
  });
  t.assert.equal(layout.imageHeight, layout.frameHeight);
  assertFullyInside(t, layout, "square");
});

test("zoom-out keeps the entire image visible", (t) => {
  for (const zoom of [1, 0.75, FIT_MIN_ZOOM, 0.5]) {
    const layout = computeContainLayout({
      srcWidth: 1080,
      srcHeight: 1920,
      frameAspect: SIXTEEN_NINE,
      zoom,
    });
    assertFullyInside(t, layout, `zoom ${zoom}`);
    t.assert.ok(
      layout.imageWidth <= layout.frameWidth && layout.imageHeight <= layout.frameHeight,
      `zoom ${zoom}: image never exceeds the frame`
    );
  }
});

test("zoom above 1 is clamped to fit (zoom-in cannot crop)", (t) => {
  const layout = computeContainLayout({
    srcWidth: 1920,
    srcHeight: 1080,
    frameAspect: SIXTEEN_NINE,
    zoom: 3,
  });
  t.assert.equal(layout.zoom, 1);
  assertFullyInside(t, layout, "clamped zoom");
});

test("pan clamps so the image never leaves the frame", (t) => {
  const layout = computeContainLayout({
    srcWidth: 1080,
    srcHeight: 1920,
    frameAspect: SIXTEEN_NINE,
    zoom: 0.5,
    panX: 100000,
    panY: -100000,
  });
  assertFullyInside(t, layout, "extreme pan");
  t.assert.ok(
    Math.abs(layout.panX) <= (layout.frameWidth - layout.imageWidth) / 2 + 1e-9,
    "panX clamped to padding"
  );
  t.assert.ok(
    Math.abs(layout.panY) <= (layout.frameHeight - layout.imageHeight) / 2 + 1e-9,
    "panY clamped to padding"
  );
});

test("output never upscales and caps the long edge", (t) => {
  const big = computeContainLayout({
    srcWidth: 4000,
    srcHeight: 3000,
    frameAspect: SIXTEEN_NINE,
  });
  t.assert.ok(
    Math.max(big.frameWidth, big.frameHeight) <= FIT_MAX_LONG_EDGE,
    "large source capped"
  );
  const small = computeContainLayout({
    srcWidth: 400,
    srcHeight: 300,
    frameAspect: SIXTEEN_NINE,
  });
  t.assert.ok(
    small.imageWidth <= 400 && small.imageHeight <= 300,
    "small source keeps natural pixels (padding instead of upscale)"
  );
  assertFullyInside(t, small, "small source");
});

test("frame keeps the requested aspect ratio", (t) => {
  for (const [w, h] of [[1920, 1080], [1080, 1920], [1200, 1200], [400, 300]]) {
    const layout = computeContainLayout({ srcWidth: w, srcHeight: h, frameAspect: SIXTEEN_NINE });
    const ratio = layout.frameWidth / layout.frameHeight;
    t.assert.ok(Math.abs(ratio - SIXTEEN_NINE) < 0.01, `${w}x${h}: frame is 16:9`);
  }
});

test("invalid inputs throw instead of producing a corrupt layout", (t) => {
  t.assert.throws(() =>
    computeContainLayout({ srcWidth: 0, srcHeight: 100, frameAspect: SIXTEEN_NINE })
  );
  t.assert.throws(() =>
    computeContainLayout({ srcWidth: 100, srcHeight: 100, frameAspect: 0 })
  );
});

test("fit constants are sane", (t) => {
  t.assert.equal(FIT_BACKGROUND, "#f4f4f5");
  t.assert.ok(FIT_MIN_ZOOM > 0 && FIT_MIN_ZOOM <= 1, "min zoom allows zoom-out only");
});
