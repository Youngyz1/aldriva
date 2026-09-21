/**
 * lib/sanitize-html.ts
 *
 * Single shared HTML sanitizer for user-authored rich content (P0 F-02).
 *
 * Backed by `isomorphic-dompurify` (already a project dependency), so the
 * SAME profile runs server-side (write path, before persistence) and
 * client-side (defensive render path). Do not create parallel sanitization
 * systems — extend the profiles here.
 *
 * Security properties of the article profile:
 * - Script execution removed (`<script>`, event-handler attributes, SVG/MathML
 *   executable content, `javascript:`/`data:text/html` URLs).
 * - Framing/plugin abuse removed (`iframe`, `object`, `embed`, `form`).
 * - Only inert formatting tags/attributes survive (see allowlists below).
 * - `data-paragraph-index` is explicitly permitted so the article renderer's
 *   audio-highlight annotation survives sanitization.
 */

import DOMPurify from "isomorphic-dompurify";

// Semantic formatting emitted by the Tiptap editor (starter-kit + image,
// link, underline extensions) plus basic tables for legacy content.
const ARTICLE_ALLOWED_TAGS = [
  "p",
  "br",
  "hr",
  "h1",
  "h2",
  "h3",
  "h4",
  "h5",
  "h6",
  "blockquote",
  "pre",
  "code",
  "ul",
  "ol",
  "li",
  "strong",
  "b",
  "em",
  "i",
  "u",
  "s",
  "strike",
  "del",
  "a",
  "img",
  "video",
  "source",
  "figure",
  "figcaption",
  "table",
  "thead",
  "tbody",
  "tfoot",
  "tr",
  "th",
  "td",
  "span",
  "div",
];

const ARTICLE_ALLOWED_ATTR = [
  "href",
  "src",
  "srcset",
  "alt",
  "title",
  "width",
  "height",
  "controls",
  "target",
  "rel",
  "colspan",
  "rowspan",
  "class",
  // Audio-narration highlight annotation added by ArticleContentRenderer.
  // Values are server-computed integers; the attribute itself is inert.
  "data-paragraph-index",
  // Aldriva entity embed references and callout styling attributes.
  "data-entity-type",
  "data-entity-id",
  "data-entity-slug",
  "data-entity-title",
  "data-callout-type",
];

// Belt-and-braces: even if a tag above is ever widened, these can never survive.
const ARTICLE_FORBID_TAGS = [
  "script",
  "style",
  "iframe",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "svg",
  "math",
  "link",
  "meta",
  "base",
  "title",
  "noscript",
];

/** Upper bound on stored/rendered article HTML (DoS guard). ~200k chars. */
export const MAX_ARTICLE_HTML_LENGTH = 200_000;

/**
 * Sanitize article body HTML. Always returns a string ("" for non-strings).
 * Safe to call on already-sanitized content (idempotent for clean input).
 */
export function sanitizeArticleHtml(dirty: unknown): string {
  if (typeof dirty !== "string" || dirty.length === 0) return "";
  return DOMPurify.sanitize(dirty, {
    ALLOWED_TAGS: ARTICLE_ALLOWED_TAGS,
    ALLOWED_ATTR: ARTICLE_ALLOWED_ATTR,
    FORBID_TAGS: ARTICLE_FORBID_TAGS,
    // Keep DOMPurify's default URI scheme checks (strips `javascript:`,
    // `data:text/html`, `vbscript:` while permitting http/https/mailto and
    // benign `data:image/*` thumbnails).
    ALLOW_DATA_ATTR: false,
  });
}

/**
 * Strict allowlist-based URL sanitizer for href and src attributes.
 * Allows: http:, https:, mailto:, tel:, and relative paths (/, #, ?, ./, ../).
 * Strips dangerous schemes like javascript:, data:, vbscript:.
 * Always returns a safe URL string or the fallback string (default: "").
 */
export function sanitizeUrl(url: unknown, fallback = ""): string {
  if (typeof url !== "string") return fallback;
  const trimmed = url.trim();
  if (!trimmed) return fallback;

  // Relative URLs and anchor targets are safe
  if (
    trimmed.startsWith("/") ||
    trimmed.startsWith("#") ||
    trimmed.startsWith("?") ||
    trimmed.startsWith("./") ||
    trimmed.startsWith("../")
  ) {
    // Extra safety: block protocol-relative //evil.com if not intended or sanitize
    if (trimmed.startsWith("//")) {
      return fallback;
    }
    return trimmed;
  }

  // Absolute URLs must start with allowed protocols
  const isAllowedScheme = /^(https?:|mailto:|tel:)/i.test(trimmed);
  if (!isAllowedScheme) {
    return fallback;
  }

  try {
    const parsed = new URL(trimmed);
    const proto = parsed.protocol.toLowerCase();
    if (proto === "http:" || proto === "https:" || proto === "mailto:" || proto === "tel:") {
      return trimmed;
    }
  } catch {
    return fallback;
  }

  return fallback;
}

