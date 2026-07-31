"use client";

import { useRef, useState, useEffect } from "react";
import DOMPurify from "isomorphic-dompurify";

const LINE_HEIGHT = 28; // px — matches leading-relaxed at 1rem font
const COLLAPSED_LINES = 5;

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

export default function AboutSection({
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
    // If the natural height exceeds the collapsed limit, show the toggle
    const fullHeight = contentRef.current.scrollHeight;
    const collapsedHeight = LINE_HEIGHT * COLLAPSED_LINES;
    if (fullHeight > collapsedHeight + 8) {
      setNeedsToggle(true);
    }
  }, [trimmed]);

  if (!trimmed) {
    return (
      <p className="text-zinc-500">
        Details are being finalized by the organizer.
      </p>
    );
  }

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

  const collapsedHeight = LINE_HEIGHT * COLLAPSED_LINES;

  return (
    <div>
      {/* Text body */}
      <div
        ref={contentRef}
        className="leading-relaxed text-zinc-700 overflow-hidden transition-[max-height] duration-500 ease-in-out"
        style={{
          maxHeight: expanded || !needsToggle ? "9999px" : `${collapsedHeight}px`,
        }}
      >
        {isHtml ? (
          <div
            className="tiptap-editor mt-4 text-base leading-7 text-zinc-700 break-words"
            dangerouslySetInnerHTML={{ __html: sanitizedHtml }}
          />
        ) : (
          <div className="space-y-4">
            {trimmed
              .split(/\n{2,}/)
              .map((p) => p.trim())
              .filter(Boolean)
              .map((p, i) => (
                <p key={i} style={{ whiteSpace: "pre-wrap" }}>
                  {p}
                </p>
              ))}
          </div>
        )}
      </div>

      {/* Read more / Read less */}
      {needsToggle && (
        <button
          type="button"
          onClick={() => setExpanded((v) => !v)}
          className="mt-3 font-bold text-orange-600 hover:text-orange-700 transition"
        >
          {expanded ? "Read less" : "Read more"}
        </button>
      )}
    </div>
  );
}
