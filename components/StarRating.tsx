/**
 * components/StarRating.tsx
 * Reusable star rating widget.
 * - Read-only mode: renders filled/empty stars based on `value`
 * - Interactive mode: hoverable + clickable stars for rating input
 */
"use client";

import { useState } from "react";

interface StarRatingProps {
  /** Current rating value (1–5). 0 = no rating. */
  value: number;
  /** Max stars (default 5). */
  max?: number;
  /** If true the stars are interactive (hoverable/clickable). */
  interactive?: boolean;
  /** Called when user clicks a star in interactive mode. */
  onChange?: (rating: number) => void;
  /** Size of each star in pixels (default 20). */
  size?: number;
  /** Extra class applied to the wrapper. */
  className?: string;
}

export default function StarRating({
  value,
  max = 5,
  interactive = false,
  onChange,
  size = 20,
  className = "",
}: StarRatingProps) {
  const [hovered, setHovered] = useState(0);

  const displayValue = interactive && hovered > 0 ? hovered : value;

  return (
    <span
      className={`inline-flex items-center gap-0.5 ${className}`}
      role={interactive ? "group" : undefined}
      aria-label={`Rating: ${value} out of ${max}`}
    >
      {Array.from({ length: max }, (_, i) => {
        const starValue = i + 1;
        const filled = displayValue >= starValue;
        const half =
          !filled && displayValue >= starValue - 0.5 && displayValue < starValue;

        return (
          <span
            key={starValue}
            style={{ width: size, height: size }}
            className={`relative inline-flex shrink-0 ${
              interactive ? "cursor-pointer" : "cursor-default"
            }`}
            onMouseEnter={() => interactive && setHovered(starValue)}
            onMouseLeave={() => interactive && setHovered(0)}
            onClick={() => interactive && onChange?.(starValue)}
            aria-label={interactive ? `Rate ${starValue} out of ${max}` : undefined}
            role={interactive ? "button" : undefined}
            tabIndex={interactive ? 0 : undefined}
            onKeyDown={(e) => {
              if (interactive && (e.key === "Enter" || e.key === " ")) {
                onChange?.(starValue);
              }
            }}
          >
            {/* Background (empty) star */}
            <svg
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth={1.5}
              className="absolute inset-0 text-zinc-300"
              style={{ width: size, height: size }}
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                d="M11.48 3.499a.562.562 0 011.04 0l2.125 5.111a.563.563 0 00.475.345l5.518.442c.499.04.701.663.321.988l-4.204 3.602a.563.563 0 00-.182.557l1.285 5.385a.562.562 0 01-.84.61l-4.725-2.885a.563.563 0 00-.586 0L6.982 20.54a.562.562 0 01-.84-.61l1.285-5.386a.562.562 0 00-.182-.557l-4.204-3.602a.562.562 0 01.321-.988l5.518-.442a.563.563 0 00.475-.345L11.48 3.5z"
              />
            </svg>

            {/* Filled star (full or partial) */}
            <svg
              viewBox="0 0 24 24"
              fill="currentColor"
              className={`absolute inset-0 transition-colors ${
                filled || half ? "text-amber-400" : "text-transparent"
              }`}
              style={{
                width: size,
                height: size,
                clipPath: half ? "inset(0 50% 0 0)" : undefined,
              }}
              aria-hidden="true"
            >
              <path
                fillRule="evenodd"
                d="M10.788 3.21c.448-1.077 1.976-1.077 2.424 0l2.082 5.007 5.404.433c1.164.093 1.636 1.545.749 2.305l-4.117 3.527 1.257 5.273c.271 1.136-.964 2.033-1.96 1.425L12 18.354 7.373 21.18c-.996.608-2.231-.29-1.96-1.425l1.257-5.273-4.117-3.527c-.887-.76-.415-2.212.749-2.305l5.404-.433 2.082-5.006z"
                clipRule="evenodd"
              />
            </svg>
          </span>
        );
      })}
    </span>
  );
}
