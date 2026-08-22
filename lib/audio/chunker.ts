import type { SpokenBlock } from "./types";

export type AudioChunk = {
  chunkIndex: number;
  text: string;
  blocks: SpokenBlock[];
};

const DEFAULT_MAX_CHUNK_CHARS = 800;

/**
 * Splits spoken blocks into TTS requests respecting max character limits.
 * Preferred splitting order:
 * 1. Paragraph / Block boundary
 * 2. Sentence boundary
 *
 * NEVER splits in the middle of a word (Correction 11).
 */
export function chunkSpokenBlocks(
  blocks: SpokenBlock[],
  maxChunkChars = DEFAULT_MAX_CHUNK_CHARS
): AudioChunk[] {
  const chunks: AudioChunk[] = [];
  let currentChunkBlocks: SpokenBlock[] = [];
  let currentChunkCharLength = 0;
  let chunkIndex = 0;

  for (const block of blocks) {
    // If a single block text exceeds maxChunkChars, split block by sentences
    if (block.text.length > maxChunkChars) {
      // Flush current pending chunk if non-empty
      if (currentChunkBlocks.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          text: currentChunkBlocks.map((b) => b.text).join(" "),
          blocks: [...currentChunkBlocks],
        });
        currentChunkBlocks = [];
        currentChunkCharLength = 0;
      }

      // Split large block into sentence sub-blocks
      const sentences = block.text.match(/[^.!?]+[.!?]+(?:\s+|$)|[^.!?]+$/g) || [block.text];
      let subChunkText = "";
      let subBlocks: SpokenBlock[] = [];

      for (const sentence of sentences) {
        const trimmed = sentence.trim();
        if (!trimmed) continue;

        if (subChunkText.length + trimmed.length + 1 > maxChunkChars && subChunkText.length > 0) {
          chunks.push({
            chunkIndex: chunkIndex++,
            text: subChunkText,
            blocks: [
              {
                ...block,
                text: subChunkText,
              },
            ],
          });
          subChunkText = trimmed;
        } else {
          subChunkText = subChunkText ? `${subChunkText} ${trimmed}` : trimmed;
        }
      }

      if (subChunkText.length > 0) {
        chunks.push({
          chunkIndex: chunkIndex++,
          text: subChunkText,
          blocks: [
            {
              ...block,
              text: subChunkText,
            },
          ],
        });
      }
      continue;
    }

    // Normal block accumulation
    if (currentChunkCharLength + block.text.length + 1 > maxChunkChars && currentChunkBlocks.length > 0) {
      chunks.push({
        chunkIndex: chunkIndex++,
        text: currentChunkBlocks.map((b) => b.text).join(" "),
        blocks: [...currentChunkBlocks],
      });
      currentChunkBlocks = [block];
      currentChunkCharLength = block.text.length;
    } else {
      currentChunkBlocks.push(block);
      currentChunkCharLength += block.text.length + 1;
    }
  }

  // Push final remaining chunk
  if (currentChunkBlocks.length > 0) {
    chunks.push({
      chunkIndex: chunkIndex++,
      text: currentChunkBlocks.map((b) => b.text).join(" "),
      blocks: [...currentChunkBlocks],
    });
  }

  return chunks;
}
