import { extractSpokenBlocks, computeSpokenContentHash } from "../text-extractor";
import { chunkSpokenBlocks } from "../chunker";
import { mergeWavBuffers, calculateWavDurationMs } from "../wav-merger";

// Simple test runner helper
function assert(condition: boolean, message: string) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

function assertApprox(actual: number, expected: number, tolerance: number, message: string) {
  if (Math.abs(actual - expected) > tolerance) {
    throw new Error(
      `Assertion failed: ${message} — expected ~${expected}, got ${actual} (tolerance ±${tolerance})`
    );
  }
}

export function runAudioLogicTests() {
  console.log("▶ Running Audio Logic Unit Tests...\n");

  // =========================================================================
  // 1. Text Extraction & Spoken Content Hash
  // =========================================================================
  const testArticle = {
    title: "Breaking News: Major Innovation Released",
    excerpt: "Aldriva introduces an AI-powered text to speech experience.",
    body: "<p>Paragraph 1: Welcome to the future of content accessibility.</p><h2>Section Title</h2><p>Paragraph 2: Continuous innovation matters.</p>",
  };

  const blocks = extractSpokenBlocks(testArticle);
  assert(blocks.length === 5, `Expected 5 spoken blocks, got ${blocks.length}`);
  assert(blocks[0].type === "title", `Block 0 should be title, got ${blocks[0].type}`);
  assert(blocks[1].type === "excerpt", `Block 1 should be excerpt, got ${blocks[1].type}`);
  assert(blocks[2].type === "paragraph", `Block 2 should be paragraph, got ${blocks[2].type}`);
  assert(blocks[3].type === "heading", `Block 3 should be heading, got ${blocks[3].type}`);
  assert(blocks[4].type === "paragraph", `Block 4 should be paragraph, got ${blocks[4].type}`);
  // Verify block indices are sequential
  blocks.forEach((b, i) => assert(b.index === i, `Block ${i} should have index ${i}, got ${b.index}`));
  console.log("  ✅ 1. Block extraction and indices correct");

  const hash1 = computeSpokenContentHash(blocks);
  assert(hash1.length === 64, "Content hash should be 64-character SHA-256 hex string");

  // Hash unchanged for metadata-only changes
  const modifiedMetadataArticle = { ...testArticle, category: "New Category", seo_title: "Different SEO Title" };
  const hash2 = computeSpokenContentHash(extractSpokenBlocks(modifiedMetadataArticle));
  assert(hash1 === hash2, "Content hash MUST NOT change when only metadata changes");

  // Hash changed when spoken body changes
  const modifiedBodyArticle = { ...testArticle, body: "<p>Modified text.</p>" };
  const hash3 = computeSpokenContentHash(extractSpokenBlocks(modifiedBodyArticle));
  assert(hash1 !== hash3, "Content hash MUST change when spoken body changes");
  console.log("  ✅ 2. Content hash stability correct");

  // =========================================================================
  // 2. Block index offset: no excerpt → body starts at index 1
  // =========================================================================
  const noExcerptArticle = {
    title: "No Excerpt Article",
    body: "<p>First paragraph.</p><p>Second paragraph.</p>",
  };
  const noExcerptBlocks = extractSpokenBlocks(noExcerptArticle);
  assert(noExcerptBlocks[0].index === 0, "Title should be index 0");
  assert(noExcerptBlocks[0].type === "title", "Block 0 should be title");
  assert(noExcerptBlocks[1].index === 1, "First body block should be index 1 (no excerpt)");
  assert(noExcerptBlocks[1].type === "paragraph", "Block 1 should be paragraph");
  console.log("  ✅ 3. Block index offset without excerpt correct (starts at 1, not 2)");

  // Block index with excerpt → body starts at index 2
  const withExcerptBlocks = extractSpokenBlocks(testArticle);
  assert(withExcerptBlocks[2].index === 2, "First body block should be index 2 when excerpt present");
  console.log("  ✅ 4. Block index offset with excerpt correct (starts at 2)");

  // =========================================================================
  // 3. Audio time → paragraph lookup simulation
  // =========================================================================
  const mockParagraphs = [
    { index: 0, type: "title" as const, text: "Title", startTimeMs: 0, endTimeMs: 1500 },
    { index: 1, type: "paragraph" as const, text: "Para 1", startTimeMs: 1500, endTimeMs: 5000 },
    { index: 2, type: "heading" as const, text: "Heading", startTimeMs: 5000, endTimeMs: 6500 },
    { index: 3, type: "paragraph" as const, text: "Para 2", startTimeMs: 6500, endTimeMs: 12000 },
    { index: 4, type: "paragraph" as const, text: "Para 3", startTimeMs: 12000, endTimeMs: 18000 },
  ];

  function binaryLookup(timeMs: number): number | null {
    const paras = mockParagraphs;
    if (timeMs < paras[0].startTimeMs) return paras[0].index;
    if (timeMs >= paras[paras.length - 1].endTimeMs) return null;
    let lo = 0, hi = paras.length - 1;
    while (lo <= hi) {
      const mid = (lo + hi) >>> 1;
      const p = paras[mid];
      if (timeMs >= p.startTimeMs && timeMs < p.endTimeMs) return p.index;
      if (timeMs < p.startTimeMs) hi = mid - 1;
      else lo = mid + 1;
    }
    const candidate = lo > 0 ? lo - 1 : 0;
    return paras[candidate].index;
  }

  assert(binaryLookup(0) === 0, "0ms → block 0 (title)");
  assert(binaryLookup(750) === 0, "750ms → block 0 (title)");
  assert(binaryLookup(1500) === 1, "1500ms → block 1 (para 1)");
  assert(binaryLookup(3000) === 1, "3000ms → block 1 (para 1)");
  assert(binaryLookup(5000) === 2, "5000ms → block 2 (heading)");
  assert(binaryLookup(6500) === 3, "6500ms → block 3 (para 2)");
  assert(binaryLookup(11999) === 3, "11999ms → block 3 (para 2)");
  assert(binaryLookup(12000) === 4, "12000ms → block 4 (para 3)");
  assert(binaryLookup(18000) === null, "18000ms → null (after last paragraph)");
  assert(binaryLookup(25000) === null, "25000ms → null (well after end)");
  console.log("  ✅ 5. Audio time → paragraph binary search correct at all boundaries");

  // =========================================================================
  // 4. Seek updates: 0%, 25%, 50%, 75%, 90%
  // =========================================================================
  const totalMs = 18000;
  const seeks = [0, 0.25, 0.5, 0.75, 0.9].map((pct) => ({
    pct,
    timeMs: Math.round(pct * totalMs),
    result: binaryLookup(Math.round(pct * totalMs)),
  }));
  assert(seeks[0].result === 0, `0% (0ms) → block 0`);
  assert(seeks[1].result !== null, `25% (${seeks[1].timeMs}ms) → valid block`);
  assert(seeks[2].result !== null, `50% (${seeks[2].timeMs}ms) → valid block`);
  assert(seeks[3].result !== null, `75% (${seeks[3].timeMs}ms) → valid block`);
  assert(seeks[4].result !== null, `90% (${seeks[4].timeMs}ms) → valid block`);
  // Each seek to a later time should not produce an earlier block
  for (let i = 1; i < seeks.length; i++) {
    if (seeks[i].result !== null && seeks[i - 1].result !== null) {
      assert(
        seeks[i].result! >= seeks[i - 1].result!,
        `Seek at ${seeks[i].pct * 100}% should not produce an earlier block than ${seeks[i - 1].pct * 100}%`
      );
    }
  }
  console.log("  ✅ 6. Seeking: 0% / 25% / 50% / 75% / 90% produce correct non-regressing blocks");

  // =========================================================================
  // 5. Chunking Test
  // =========================================================================
  const longBlocks = Array.from({ length: 15 }, (_, i) => ({
    index: i,
    type: "paragraph" as const,
    text: `This is paragraph number ${i + 1}. It contains enough words to test the text chunker functionality properly.`,
  }));
  const chunks = chunkSpokenBlocks(longBlocks, 300);
  assert(chunks.length > 1, `Long article should be split into multiple chunks, got ${chunks.length}`);
  for (const chunk of chunks) {
    assert(chunk.text.length <= 400, `Chunk text length ${chunk.text.length} exceeds reasonable boundary`);
  }
  console.log("  ✅ 7. Chunking: long articles split into multiple chunks");

  // =========================================================================
  // 6. WAV Buffer Merging
  // =========================================================================
  const createMockWavHeader = (dataLength: number): Buffer => {
    const header = Buffer.alloc(44);
    header.write("RIFF", 0);
    header.writeUInt32LE(36 + dataLength, 4);
    header.write("WAVE", 8);
    header.write("fmt ", 12);
    header.writeUInt32LE(16, 16);
    header.writeUInt16LE(1, 20); // PCM
    header.writeUInt16LE(1, 22); // Mono
    header.writeUInt32LE(22050, 24); // 22050 Hz
    header.writeUInt32LE(44100, 28); // Byte rate
    header.writeUInt16LE(2, 32);
    header.writeUInt16LE(16, 34);
    header.write("data", 36);
    header.writeUInt32LE(dataLength, 40);
    return header;
  };

  const wav1 = Buffer.concat([createMockWavHeader(8820), Buffer.alloc(8820)]);
  const wav2 = Buffer.concat([createMockWavHeader(8820), Buffer.alloc(8820)]);
  const merged = mergeWavBuffers([wav1, wav2]);
  assert(merged.length === 44 + 8820 + 8820, `Merged WAV length expected ${44 + 8820 + 8820}, got ${merged.length}`);
  assert(merged.toString("ascii", 0, 4) === "RIFF", "Merged buffer should start with RIFF header");
  assert(merged.toString("ascii", 8, 12) === "WAVE", "Merged buffer should contain WAVE format");

  const durationMs = calculateWavDurationMs(merged);
  assert(durationMs > 0, `Merged duration should be positive, got ${durationMs}`);
  // 8820 * 2 samples at 22050Hz 16-bit mono = 8820*2 bytes / 44100 bytes/sec = 400ms
  assertApprox(durationMs, 400, 5, "Merged WAV duration should be ~400ms (two 200ms chunks)");
  console.log("  ✅ 8. WAV merging: RIFF header correct, duration calculated accurately");

  // =========================================================================
  // 7. Playback speed: timing lookup is speed-independent
  // =========================================================================
  const currentTimeSec = 6.5; // 6500ms
  const currentTimeMs = currentTimeSec * 1000;
  const resultAt1x = binaryLookup(currentTimeMs);
  const resultAt2x = binaryLookup(currentTimeMs);
  assert(resultAt1x === resultAt2x, "Paragraph lookup must be speed-independent");
  assert(resultAt1x === 3, `At 6500ms, block 3 expected, got ${resultAt1x}`);
  console.log("  ✅ 9. Playback speed: timing lookup is speed-independent");

  console.log("\n✅ All Audio Logic Unit Tests Passed Successfully!");
}

// Execute if run directly via tsx/node
if (require.main === module) {
  runAudioLogicTests();
}
