/**
 * Format-safe audio chunk merging and WAV header normalization.
 * Handles WAV (RIFF/PCM) header rebuilding and raw PCM wrapping.
 * Ensures the concatenated audio file is 100% valid and browser-playable (Correction 2).
 */

export interface WavHeaderInfo {
  isWav: boolean;
  sampleRate: number;
  numChannels: number;
  bitsPerSample: number;
  byteRate: number;
  blockAlign: number;
  dataOffset: number;
  dataSize: number;
}

/**
 * Parses a WAV header or returns default PCM parameters if header is missing.
 */
export function parseWavHeader(buf: Buffer): WavHeaderInfo {
  const isWav =
    buf.length >= 44 &&
    buf.toString("ascii", 0, 4) === "RIFF" &&
    buf.toString("ascii", 8, 12) === "WAVE";

  if (!isWav) {
    // Default fallback parameters for raw PCM (22050Hz 16-bit Mono)
    return {
      isWav: false,
      sampleRate: 22050,
      numChannels: 1,
      bitsPerSample: 16,
      byteRate: 44100,
      blockAlign: 2,
      dataOffset: 0,
      dataSize: buf.length,
    };
  }

  // Find 'data' subchunk
  let dataOffset = -1;
  let dataSize = 0;
  for (let i = 12; i < buf.length - 8; i++) {
    if (
      buf[i] === 100 && // 'd'
      buf[i + 1] === 97 && // 'a'
      buf[i + 2] === 116 && // 't'
      buf[i + 3] === 97 // 'a'
    ) {
      dataOffset = i;
      dataSize = buf.readUInt32LE(i + 4);
      break;
    }
  }

  if (dataOffset === -1) {
    dataOffset = 36;
    dataSize = buf.length - 44;
  }

  const sampleRate = buf.readUInt32LE(24) || 22050;
  const numChannels = buf.readUInt16LE(22) || 1;
  const bitsPerSample = buf.readUInt16LE(34) || 16;
  const byteRate = buf.readUInt32LE(28) || (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = buf.readUInt16LE(32) || (numChannels * bitsPerSample) / 8;

  return {
    isWav: true,
    sampleRate,
    numChannels,
    bitsPerSample,
    byteRate,
    blockAlign,
    dataOffset,
    dataSize: Math.min(buf.length - (dataOffset + 8), dataSize),
  };
}

/**
 * Creates a standard 44-byte RIFF WAV header for a given PCM payload.
 */
export function createWavHeader(
  pcmLength: number,
  sampleRate = 22050,
  numChannels = 1,
  bitsPerSample = 16
): Buffer {
  const byteRate = (sampleRate * numChannels * bitsPerSample) / 8;
  const blockAlign = (numChannels * bitsPerSample) / 8;
  const header = Buffer.alloc(44);

  header.write("RIFF", 0);
  header.writeUInt32LE(36 + pcmLength, 4); // File size - 8
  header.write("WAVE", 8);
  header.write("fmt ", 12);
  header.writeUInt32LE(16, 16); // Subchunk1Size (16 for PCM)
  header.writeUInt16LE(1, 20); // AudioFormat (1 for PCM)
  header.writeUInt16LE(numChannels, 22);
  header.writeUInt32LE(sampleRate, 24);
  header.writeUInt32LE(byteRate, 28);
  header.writeUInt16LE(blockAlign, 32);
  header.writeUInt16LE(bitsPerSample, 34);
  header.write("data", 36);
  header.writeUInt32LE(pcmLength, 40);

  return header;
}

/**
 * Ensures buffer is a valid RIFF WAV file. If buffer is raw PCM, wraps it with a WAV header.
 */
export function ensureValidWavBuffer(
  buf: Buffer,
  defaultSampleRate = 22050,
  defaultNumChannels = 1,
  defaultBitsPerSample = 16
): Buffer {
  if (buf.length === 0) return buf;

  const headerInfo = parseWavHeader(buf);
  if (headerInfo.isWav) {
    return buf;
  }

  // Wrap raw PCM buffer in WAV header
  const header = createWavHeader(
    buf.length,
    defaultSampleRate,
    defaultNumChannels,
    defaultBitsPerSample
  );
  return Buffer.concat([header, buf]);
}

/**
 * Format-safe audio chunk merging.
 * Strips headers from subsequent WAV chunks, concatenates raw PCM payloads,
 * and builds a single valid RIFF header for the full audio stream.
 */
export function mergeWavBuffers(buffers: Buffer[]): Buffer {
  if (buffers.length === 0) return Buffer.alloc(0);

  const normalizedBuffers = buffers.map((b) => ensureValidWavBuffer(b));
  if (normalizedBuffers.length === 1) return normalizedBuffers[0];

  const primaryHeader = parseWavHeader(normalizedBuffers[0]);
  const pcmPayloads: Buffer[] = [];
  let totalPcmLength = 0;

  for (const buf of normalizedBuffers) {
    const info = parseWavHeader(buf);
    const payloadStart = info.dataOffset + 8;
    const payloadEnd = payloadStart + info.dataSize;
    const pcm = buf.subarray(payloadStart, Math.min(buf.length, payloadEnd));

    pcmPayloads.push(pcm);
    totalPcmLength += pcm.length;
  }

  // Ensure data length is even for RIFF spec compliance
  if (totalPcmLength % 2 !== 0) {
    pcmPayloads.push(Buffer.alloc(1));
    totalPcmLength += 1;
  }

  const finalHeader = createWavHeader(
    totalPcmLength,
    primaryHeader.sampleRate,
    primaryHeader.numChannels,
    primaryHeader.bitsPerSample
  );

  return Buffer.concat([finalHeader, ...pcmPayloads]);
}

/**
 * Calculates accurate audio duration in milliseconds from WAV buffer.
 */
export function calculateWavDurationMs(wavBuffer: Buffer): number {
  if (wavBuffer.length === 0) return 0;

  const normalized = ensureValidWavBuffer(wavBuffer);
  const info = parseWavHeader(normalized);

  if (info.byteRate > 0) {
    return Math.round((info.dataSize / info.byteRate) * 1000);
  }

  return Math.round((info.dataSize / 44100) * 1000);
}
