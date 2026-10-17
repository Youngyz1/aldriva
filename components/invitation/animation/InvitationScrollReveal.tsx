"use client";

import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * A small CSS/IntersectionObserver reveal. Content is rendered visible by
 * default and only transitions after the browser confirms motion is allowed.
 */
export function InvitationScrollReveal({
  children,
  enabled,
  durationMs = 500,
}: {
  children: ReactNode;
  enabled: boolean;
  durationMs?: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [motionReady, setMotionReady] = useState(false);
  const [isRevealed, setIsRevealed] = useState(false);

  useEffect(() => {
    const element = ref.current;
    if (!enabled || !element || !("IntersectionObserver" in window)) {
      setMotionReady(false);
      setIsRevealed(true);
      return;
    }

    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      setMotionReady(false);
      setIsRevealed(true);
      return;
    }

    setIsRevealed(false);
    setMotionReady(true);

    const observer = new IntersectionObserver(([entry]) => {
      if (entry?.isIntersecting) {
        setIsRevealed(true);
        observer.disconnect();
      }
    }, { threshold: 0.08, rootMargin: "0px 0px -4% 0px" });
    observer.observe(element);

    // A page-level fail-safe prevents content remaining faded if an observer
    // stops reporting (for example, when a host preview is resized repeatedly).
    const failSafe = window.setTimeout(() => setIsRevealed(true), 2400);
    return () => {
      observer.disconnect();
      window.clearTimeout(failSafe);
    };
  }, [enabled]);

  return (
    <div
      ref={ref}
      className={motionReady && !isRevealed
        ? "translate-y-4 opacity-0 transition-[opacity,transform] ease-out motion-reduce:translate-y-0 motion-reduce:opacity-100 motion-reduce:transition-none focus-within:translate-y-0 focus-within:opacity-100"
        : "translate-y-0 opacity-100"}
      style={{ transitionDuration: `${Math.min(1600, Math.max(0, durationMs))}ms` }}
      onFocusCapture={() => setIsRevealed(true)}
    >
      {children}
    </div>
  );
}
