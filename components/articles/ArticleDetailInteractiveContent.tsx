"use client";

import React, { useState, useMemo } from "react";
import ArticleAudioPlayer from "./ArticleAudioPlayer";
import ArticleContentRenderer from "./ArticleContentRenderer";

interface ArticleDetailInteractiveContentProps {
  articleId: string;
  body: string;
  excerpt?: string | null;
  headerContent?: React.ReactNode;
}

export default function ArticleDetailInteractiveContent({
  articleId,
  body,
  excerpt,
  headerContent,
}: ArticleDetailInteractiveContentProps) {
  const [activeParagraphIndex, setActiveParagraphIndex] = useState<number | null>(null);

  /**
   * Block index offset: how many spoken blocks precede the article body.
   * Title is always block 0.
   * Excerpt is block 1 when present.
   * First body block is therefore at index 1 (no excerpt) or 2 (with excerpt).
   */
  const blockIndexOffset = useMemo(() => {
    const hasExcerpt = typeof excerpt === "string" && excerpt.trim().length > 0;
    return hasExcerpt ? 2 : 1;
  }, [excerpt]);

  return (
    <>
      {/* 1. Audio Player Listener Component (Positioned above Title) */}
      <ArticleAudioPlayer
        articleId={articleId}
        onParagraphChange={setActiveParagraphIndex}
      />

      {/* 2. Article Title, Meta & Cover Image Header Content */}
      {headerContent}

      {/* 3. Article Body Content Renderer */}
      <ArticleContentRenderer
        body={body}
        activeParagraphIndex={activeParagraphIndex}
        blockIndexOffset={blockIndexOffset}
      />
    </>
  );
}
