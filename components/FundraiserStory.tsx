"use client";

import { useState, useEffect, useRef } from "react";
import DOMPurify from "isomorphic-dompurify";

const COLLAPSED_HEIGHT = 200; // px

// Add a hook to ensure all external links have target="_blank" and rel, and restrict iframes
DOMPurify.addHook("afterSanitizeAttributes", (node) => {
  if (node.tagName === "A") {
    node.setAttribute("target", "_blank");
    node.setAttribute("rel", "noopener noreferrer nofollow");
  }
  if (node.tagName === "IFRAME") {
    const src = node.getAttribute("src") || "";
    const isYoutube =
      src.startsWith("https://www.youtube.com/") ||
      src.startsWith("https://www.youtube-nocookie.com/") ||
      src.startsWith("https://youtube.com/");
    const isVimeo = src.startsWith("https://player.vimeo.com/") || src.startsWith("https://vimeo.com/");
    if (!isYoutube && !isVimeo) {
      node.removeAttribute("src");
    }
  }
});

export default function FundraiserStory({
  description,
}: {
  description: string;
}) {
  const contentRef = useRef<HTMLDivElement>(null);
  const [expanded, setExpanded] = useState(false);
  const [needsToggle, setNeedsToggle] = useState(false);

  const trimmed = (description || "").trim();
  const isHtml = /<[a-z][\s\S]*>/i.test(trimmed);

  useEffect(() => {
    if (!contentRef.current) return;
    // Check if the scroll height exceeds our collapsed height limit
    const fullHeight = contentRef.current.scrollHeight;
    if (fullHeight > COLLAPSED_HEIGHT + 10) {
      setNeedsToggle(true);
    }
  }, [trimmed]);

  // Sanitize HTML content
  const sanitizedHtml = isHtml
    ? DOMPurify.sanitize(trimmed, {
        ADD_TAGS: ["iframe", "video", "source"],
        ADD_ATTR: [
          "src",
          "controls",
          "width",
          "height",
          "frameborder",
          "allow",
          "allowfullscreen",
          "class",
          "style",
          "target",
          "rel",
        ],
      })
    : "";

  return (
    <section id="fundraiser-story" className="border-b border-zinc-200 pb-8">
      {/* Content wrapper with CSS-based clamping */}
      <div
        ref={contentRef}
        className="overflow-hidden transition-[max-height] duration-500 ease-in-out"
        style={{
          maxHeight: expanded || !needsToggle ? "9999px" : `${COLLAPSED_HEIGHT}px`,
        }}
      >
        {isHtml ? (
          <div
            className="tiptap-editor mt-4 text-base leading-7 text-zinc-700 break-words"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <div className="mt-4 space-y-4 text-base leading-7 text-zinc-700">
            {(trimmed || "No story has been added yet.")
              .split(/\n{2,}/)
              .map((paragraph) => paragraph.trim())
              .filter(Boolean)
              .map((paragraph, index) => (
                <p key={index} className="whitespace-pre-wrap break-words">
                  {paragraph}
                </p>
              ))}
          </div>
        )}
      </div>

      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((value) => !value)}
          className="mt-4 text-sm font-bold text-emerald-700 hover:text-emerald-800 transition"
        >
          {expanded ? "Show less" : "Read more"}
        </button>
      )}
    </section>
  );
}
