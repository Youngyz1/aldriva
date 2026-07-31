"use client";

import { useCallback, useRef, useState } from "react";

/** Copies a URL to the clipboard and exposes a transient "copied" state. */
export function useShare(url: string, resetAfterMs = 1800) {
  const [copied, setCopied] = useState(false);
  const resetTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const copyLink = useCallback(async () => {
    await navigator.clipboard.writeText(url);
    setCopied(true);
    if (resetTimeoutRef.current) clearTimeout(resetTimeoutRef.current);
    resetTimeoutRef.current = setTimeout(() => setCopied(false), resetAfterMs);
  }, [url, resetAfterMs]);

  return { copied, copyLink };
}
