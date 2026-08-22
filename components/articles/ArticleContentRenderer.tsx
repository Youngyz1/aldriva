"use client";

import React, { useEffect, useRef, useMemo } from "react";

interface ArticleContentRendererProps {
  body: string;
  activeParagraphIndex: number | null;
  /**
   * The block index assigned to the FIRST body element in timing_data.
   *
   * extractSpokenBlocks() assigns indices sequentially:
   *   0 → title (always present)
   *   1 → excerpt (only when present)
   *   2 (or 1) → first body block
   *
   * This offset must be passed by the parent that knows the article structure,
   * so the renderer can annotate DOM elements with matching data-paragraph-index
   * values that align with timing_data.paragraphs[].index.
   *
   * Pass 2 when article has both title + excerpt.
   * Pass 1 when article has title only (no excerpt).
   * Pass 0 when neither is present (rare/edge case).
   */
  blockIndexOffset?: number;
  className?: string;
}

/**
 * Enhanced Article Content Renderer.
 * Extends existing article HTML rendering by annotating block elements
 * with data-paragraph-index and applying subtle paragraph highlighting & auto-scroll
 * when audio narration is active.
 *
 * CRITICAL: blockIndexOffset must match the actual block.index values in timing_data.
 * If it doesn't, every highlight will be on the wrong paragraph.
 */
export default function ArticleContentRenderer({
  body,
  activeParagraphIndex,
  blockIndexOffset = 2,
  className = "",
}: ArticleContentRendererProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);

  // Inject data-paragraph-index into block tags in HTML string.
  // Counter starts at blockIndexOffset to match timing_data block indices exactly.
  const annotatedHtml = useMemo(() => {
    if (!body) return "";

    let blockCounter = blockIndexOffset;
    const blockTagRegex = /<(p|h[1-6]|blockquote|li|figcaption)([^>]*)>/gi;

    return body.replace(blockTagRegex, (fullMatch, tagName, attrs) => {
      // Don't re-annotate if already present
      if (attrs.includes("data-paragraph-index")) {
        return fullMatch;
      }
      const idx = blockCounter++;
      return `<${tagName} data-paragraph-index="${idx}" ${attrs}>`;
    });
  }, [body, blockIndexOffset]);

  // Paragraph highlighting and off-screen auto-scroll
  useEffect(() => {
    if (!containerRef.current) return;

    // Remove existing highlights
    const highlighted = containerRef.current.querySelectorAll(".active-spoken-paragraph");
    highlighted.forEach((el) => {
      el.classList.remove(
        "active-spoken-paragraph",
        "bg-orange-50/80",
        "border-l-4",
        "border-orange-500",
        "pl-3.5",
        "py-1.5",
        "-ml-3.5",
        "rounded-r-xl",
        "shadow-sm",
        "text-zinc-950"
      );
    });

    if (activeParagraphIndex === null || activeParagraphIndex === undefined) return;

    const activeEl = containerRef.current.querySelector(
      `[data-paragraph-index="${activeParagraphIndex}"]`
    ) as HTMLElement | null;

    if (activeEl) {
      activeEl.classList.add(
        "active-spoken-paragraph",
        "bg-orange-50/80",
        "border-l-4",
        "border-orange-500",
        "pl-3.5",
        "py-1.5",
        "-ml-3.5",
        "rounded-r-xl",
        "shadow-sm",
        "text-zinc-950"
      );

      // Auto-scroll ONLY when active element is outside readable viewport region
      const rect = activeEl.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      // Top threshold 120px accounts for sticky header / nav bar
      const isOffScreen = rect.top < 120 || rect.bottom > viewportHeight - 80;

      if (isOffScreen) {
        const prefersReducedMotion = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
        activeEl.scrollIntoView({
          behavior: prefersReducedMotion ? "instant" : "smooth",
          block: "nearest",
        });
      }
    }
  }, [activeParagraphIndex]);

  return (
    <div
      ref={containerRef}
      className={`tiptap-editor mt-8 text-base sm:text-lg leading-8 text-zinc-800 break-words space-y-4 ${className}`}
      dangerouslySetInnerHTML={{ __html: annotatedHtml }}
    />
  );
}
