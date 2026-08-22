import {
  type ParagraphTiming,
  type ArticleAudioTimingData,
} from "./types";
import { type AudioChunk } from "./chunker";
import {
  mergeWavBuffers,
  calculateWavDurationMs,
  ensureValidWavBuffer,
} from "./wav-merger";

const DEFAULT_NVIDIA_VOICE = "Magpie-Multilingual.EN-US.Aria";
const DEFAULT_NVCF_ENDPOINT =
  "https://877104f7-e885-42b9-8de8-f6e4c6303969.invocation.api.nvcf.nvidia.com/v1/audio/synthesize";

/**
 * Synthesizes a single text chunk via NVIDIA Magpie TTS NVCF API.
 * Server-side invocation using NVIDIA_API_KEY.
 * Strictly requires real NVIDIA response; throws on error (no fallback noise).
 */
export async function synthesizeNvidiaChunk(
  text: string,
  voice = DEFAULT_NVIDIA_VOICE,
  language = "en-US"
): Promise<{ audioBuffer: Buffer; mimeType: string; durationMs: number }> {
  const apiKey = process.env.NVIDIA_API_KEY;

  if (!apiKey || apiKey.trim().length < 5) {
    throw new Error(
      "[NVIDIA-TTS] Missing NVIDIA_API_KEY in environment. Set NVIDIA_API_KEY in .env.local."
    );
  }

  const endpointUrl = process.env.NVIDIA_TTS_ENDPOINT || DEFAULT_NVCF_ENDPOINT;

  const formData = new FormData();
  formData.append("text", text);
  formData.append("language", language);
  formData.append("voice", voice);
  formData.append("encoding", "LINEAR_PCM");
  formData.append("sample_rate_hz", "22050");
  formData.append("enable_word_time_offsets", "true");

  const res = await fetch(endpointUrl, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      Accept: "audio/wav, application/json",
    },
    body: formData,
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(
      `[NVIDIA-TTS] API call failed with HTTP ${res.status} ${res.statusText}: ${errText.slice(0, 300)}`
    );
  }

  const contentType = res.headers.get("content-type") || "";
  let audioBuf: Buffer;

  if (contentType.includes("json")) {
    const data = await res.json();
    if (data.audio_content) {
      audioBuf = Buffer.from(data.audio_content, "base64");
    } else if (data.audio) {
      audioBuf = Buffer.from(data.audio, "base64");
    } else {
      throw new Error("[NVIDIA-TTS] JSON response contained no audio payload.");
    }
  } else {
    const arrayBuf = await res.arrayBuffer();
    audioBuf = Buffer.from(arrayBuf);
  }

  if (audioBuf.length === 0) {
    throw new Error("[NVIDIA-TTS] Received zero-byte audio payload from NVIDIA API.");
  }

  const validWavBuf = ensureValidWavBuffer(audioBuf, 22050, 1, 16);
  const durationMs = calculateWavDurationMs(validWavBuf);

  console.log(
    `[NVIDIA-TTS] Synthesized ${validWavBuf.length} bytes, duration=${durationMs}ms via NVIDIA Magpie API.`
  );

  return {
    audioBuffer: validWavBuf,
    mimeType: "audio/wav",
    durationMs,
  };
}

/**
 * Derives paragraph-level timing from actual synthesized chunk audio boundaries.
 *
 * Strategy — in priority order:
 *
 * A. Single-block chunk: the block receives the exact real chunk WAV duration.
 *    startTimeMs = chunkOffsetMs
 *    endTimeMs   = chunkOffsetMs + chunkDurationMs
 *    → 100% real, no estimation.
 *
 * B. Multi-block chunk: the real chunk duration is distributed by character-count
 *    proportion among the blocks in that chunk.
 *    → Anchored to real audio boundary, approximate within the chunk.
 *
 * C. Sentence-split block (same block.index appears in consecutive sub-chunks):
 *    The timing spans from the first sub-chunk offset to the last sub-chunk end.
 *    → Exact real timing for the paragraph as a whole.
 *
 * No word timestamps are generated. No external speech-to-text is used.
 */
function buildParagraphTimings(
  chunks: AudioChunk[],
  chunkOffsets: number[],
  chunkDurations: number[]
): ParagraphTiming[] {
  // Collect every (chunkIdx, block) pair in spoken order
  type BlockChunkEntry = {
    chunkIdx: number;
    block: AudioChunk["blocks"][number];
  };

  const allEntries: BlockChunkEntry[] = [];
  for (let ci = 0; ci < chunks.length; ci++) {
    for (const block of chunks[ci].blocks) {
      allEntries.push({ chunkIdx: ci, block });
    }
  }

  // Group entries by block.index, preserving first-appearance order
  const blockOrder: number[] = [];
  const blockGroups = new Map<number, BlockChunkEntry[]>();
  for (const entry of allEntries) {
    if (!blockGroups.has(entry.block.index)) {
      blockGroups.set(entry.block.index, []);
      blockOrder.push(entry.block.index);
    }
    blockGroups.get(entry.block.index)!.push(entry);
  }

  const timings: ParagraphTiming[] = [];

  for (const blockIdx of blockOrder) {
    const entries = blockGroups.get(blockIdx)!;
    const representativeBlock = entries[0].block;

    if (entries.length > 1) {
      // Case C: sentence-split block — spans all its sub-chunks
      const firstCi = entries[0].chunkIdx;
      const lastCi = entries[entries.length - 1].chunkIdx;
      timings.push({
        index: blockIdx,
        type: representativeBlock.type,
        text: representativeBlock.text,
        startTimeMs: chunkOffsets[firstCi],
        endTimeMs: chunkOffsets[lastCi] + chunkDurations[lastCi],
      });
      continue;
    }

    // Single-chunk block
    const ci = entries[0].chunkIdx;
    const chunk = chunks[ci];

    if (chunk.blocks.length === 1) {
      // Case A: block exclusively owns this chunk — exact real WAV timing
      timings.push({
        index: blockIdx,
        type: representativeBlock.type,
        text: representativeBlock.text,
        startTimeMs: chunkOffsets[ci],
        endTimeMs: chunkOffsets[ci] + chunkDurations[ci],
      });
    } else {
      // Case B: block shares a chunk — distribute real chunk duration by char proportion
      const totalChars = chunk.blocks.reduce(
        (s, b) => s + Math.max(1, b.text.length),
        0
      );
      let charsBefore = 0;
      for (const b of chunk.blocks) {
        if (b.index === blockIdx) break;
        charsBefore += Math.max(1, b.text.length);
      }
      const fraction = Math.max(1, representativeBlock.text.length) / totalChars;
      const startMs =
        chunkOffsets[ci] +
        Math.round((charsBefore / totalChars) * chunkDurations[ci]);
      const endMs = startMs + Math.round(fraction * chunkDurations[ci]);
      timings.push({
        index: blockIdx,
        type: representativeBlock.type,
        text: representativeBlock.text,
        startTimeMs: startMs,
        endTimeMs: endMs,
      });
    }
  }

  return timings;
}

/**
 * Synthesizes all article chunks via NVIDIA TTS, merges audio, and derives
 * paragraph-level timing from actual chunk WAV boundaries.
 *
 * Timing source: real measured chunk durations from decoded WAV.
 * No word-level synchronization. No external speech-to-text service.
 */
export async function generateFullArticleAudio(
  chunks: AudioChunk[],
  voice = DEFAULT_NVIDIA_VOICE,
  language = "en-US"
): Promise<{
  mergedAudioBuffer: Buffer;
  mimeType: string;
  timingData: ArticleAudioTimingData;
}> {
  const audioBuffers: Buffer[] = [];
  const chunkDurations: number[] = [];

  // Synthesize all chunks sequentially (NVIDIA endpoint, unchanged)
  for (const chunk of chunks) {
    const synthesis = await synthesizeNvidiaChunk(chunk.text, voice, language);
    audioBuffers.push(synthesis.audioBuffer);
    chunkDurations.push(synthesis.durationMs);
  }

  // Build cumulative offsets from actual decoded WAV durations
  const chunkOffsets: number[] = [];
  let cumulative = 0;
  for (const dur of chunkDurations) {
    chunkOffsets.push(cumulative);
    cumulative += dur;
  }

  const mergedAudioBuffer = mergeWavBuffers(audioBuffers);
  const actualFinalDurationMs = calculateWavDurationMs(mergedAudioBuffer);

  const paragraphTimings = buildParagraphTimings(chunks, chunkOffsets, chunkDurations);

  const fullText = chunks.map((c) => c.text).join("\n\n");

  return {
    mergedAudioBuffer,
    mimeType: "audio/wav",
    timingData: {
      durationMs: Math.max(cumulative, actualFinalDurationMs),
      paragraphs: paragraphTimings,
      fullText,
      source: "estimated",
    },
  };
}
