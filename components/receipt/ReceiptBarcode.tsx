"use client";

import { useEffect, useRef } from "react";
import JsBarcode from "jsbarcode";

/**
 * Code 128 rendered as inline SVG on a fixed white box.
 *
 * The component only prints the value it is handed; it never mints, signs or
 * derives a token. Callers must pass a signed scan code — never an order
 * number, tracking token or lookup token. Fixed paper colours are
 * intentional: the receipt stays white with black ink in both themes.
 */
export function ReceiptBarcode({
  value,
  caption,
  demo = false,
  height = 56,
  barWidth = 2,
}: {
  value: string;
  /** One line describing what scanning this code does. */
  caption?: string;
  /** Development-only placeholder. Marked so it can never read as real. */
  demo?: boolean;
  /** Bar height in px. */
  height?: number;
  /** Narrow-bar width in px. */
  barWidth?: number;
}) {
  const svgRef = useRef<SVGSVGElement>(null);

  useEffect(() => {
    const svg = svgRef.current;
    if (!svg || !value) return;

    try {
      JsBarcode(svg, value, {
        format: "CODE128",
        displayValue: false,
        margin: 0,
        width: barWidth,
        height,
        background: "#FFFFFF",
        lineColor: "#111111",
      });
    } catch {
      // A value that Code 128 cannot encode renders as an empty box instead
      // of a broken image. The human-readable value below stays visible.
      while (svg.firstChild) svg.removeChild(svg.firstChild);
    }
  }, [value, height, barWidth]);

  return (
    <div className="flex flex-col items-center">
      <div className="w-full border bg-white px-2 pb-1.5 pt-2" style={{ borderColor: "#C9C7BF" }}>
        <svg
          ref={svgRef}
          role="img"
          aria-label={`Barcode ${value}`}
          style={{ display: "block", width: "100%", height: "auto" }}
        />
        <p
          className="mt-1.5 text-center font-mono text-[11px] tracking-[0.16em]"
          style={{ color: "#111111" }}
        >
          {value}
        </p>
      </div>
      {caption ? (
        <p className="mt-2 text-center text-[10px] leading-relaxed" style={{ color: "#5F5E5A" }}>
          {caption}
        </p>
      ) : null}
      {demo ? (
        <p className="mt-1 text-center text-[9px] uppercase tracking-[0.16em]" style={{ color: "#5F5E5A" }}>
          Layout preview — not a real code
        </p>
      ) : null}
    </div>
  );
}
