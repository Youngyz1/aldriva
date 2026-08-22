import crypto from "crypto";
import type { SpokenBlock } from "./types";

/**
 * Normalizes text for spoken TTS generation and hashing.
 * Removes extra whitespace and HTML entities.
 */
export function normalizeSpokenText(text: string): string {
  return text
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts readable spoken content blocks from an article.
 * Order of spoken text:
 * 1. Title
 * 2. Excerpt / Subtitle (if present)
 * 3. Body blocks (Headings, Paragraphs, Blockquotes, List items, Captions)
 *
 * Excludes UI controls, metadata, navbar, comments, etc.
 */
export function extractSpokenBlocks(article: {
  title: string;
  excerpt?: string | null;
  body: string;
}): SpokenBlock[] {
  const blocks: SpokenBlock[] = [];
  let blockIndex = 0;

  // 1. Article Title
  const cleanTitle = normalizeSpokenText(article.title);
  if (cleanTitle) {
    blocks.push({
      index: blockIndex++,
      type: "title",
      text: cleanTitle,
      htmlTag: "h1",
    });
  }

  // 2. Article Excerpt / Subtitle
  if (article.excerpt) {
    const cleanExcerpt = normalizeSpokenText(article.excerpt);
    if (cleanExcerpt) {
      blocks.push({
        index: blockIndex++,
        type: "excerpt",
        text: cleanExcerpt,
        htmlTag: "p",
      });
    }
  }

  // 3. Body Blocks
  if (article.body) {
    // Regex matching block HTML tags: h1-h6, p, blockquote, li, figcaption
    const tagRegex = /<(h[1-6]|p|blockquote|li|figcaption)[^>]*>([\s\S]*?)<\/\1>/gi;
    let match: RegExpExecArray | null;

    while ((match = tagRegex.exec(article.body)) !== null) {
      const tagName = match[1].toLowerCase();
      const rawInnerHtml = match[2];

      // Strip inner tags (e.g. <span>, <strong>, <em>, <a>)
      const plainText = normalizeSpokenText(rawInnerHtml.replace(/<[^>]*>/g, " "));

      if (plainText.length > 0) {
        let type: SpokenBlock["type"] = "paragraph";
        if (tagName.startsWith("h")) type = "heading";
        else if (tagName === "blockquote") type = "blockquote";
        else if (tagName === "figcaption") type = "caption";
        else if (tagName === "li") type = "list_item";

        blocks.push({
          index: blockIndex++,
          type,
          text: plainText,
          htmlTag: tagName,
        });
      }
    }

    // Fallback: If no block tags matched, split raw text by double newlines or lines
    if (blocks.length <= (article.excerpt ? 2 : 1)) {
      const fallbackText = article.body.replace(/<[^>]*>/g, "\n");
      const paragraphs = fallbackText.split(/\n+/).map(normalizeSpokenText).filter(Boolean);

      for (const pText of paragraphs) {
        if (pText !== cleanTitle && pText !== normalizeSpokenText(article.excerpt || "")) {
          blocks.push({
            index: blockIndex++,
            type: "paragraph",
            text: pText,
            htmlTag: "p",
          });
        }
      }
    }
  }

  return blocks;
}

/**
 * Computes SHA-256 content hash strictly from normalized spoken content blocks.
 * Unrelated metadata changes (category, cover_image, SEO, tags, visibility)
 * will NOT change this hash, preserving audio cache (Correction 6 & 12).
 */
export function computeSpokenContentHash(blocks: SpokenBlock[]): string {
  const fullSpokenText = blocks.map((b) => b.text).join("\n\n");
  return crypto.createHash("sha256").update(fullSpokenText, "utf8").digest("hex");
}
