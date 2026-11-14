"use client";

import { useEffect, useState } from "react";

/**
 * One print per document. Module state (not storage) so it resets on every
 * full page load, which is exactly the lifetime we want: a second receipt
 * mounted on the same screen must not print twice.
 */
let printedInThisDocument = false;

/**
 * "Just completed" arrival signal for the receipt printer animation.
 *
 * The celebration is tied to *how the user got here*, not to which order they
 * are looking at. Callers pass `eligible = true` only when the URL carries the
 * checkout return parameters (payment intent id, checkout session id, …), so a
 * pass opened from "My tickets", an email link, or history never qualifies.
 *
 * On top of that we require a real forward navigation with a referrer:
 *
 *   - refresh            → `navigation.type === "reload"`      → static
 *   - back / forward     → `navigation.type === "back_forward"` → static
 *   - bookmark or typed  → no `document.referrer`               → static
 *   - checkout redirect  → new document, referrer present       → prints once
 *
 * That makes the signal short-lived without writing anything to storage and
 * without touching the checkout redirect itself.
 */
export function useJustCompletedArrival(eligible: boolean): boolean {
  const [justCompleted, setJustCompleted] = useState(false);

  // Computed after mount, never during render, so server and client markup
  // match and the animation starts from the first client frame.
  useEffect(() => {
    if (!eligible || printedInThisDocument) return;
    if (typeof window === "undefined" || typeof performance === "undefined") return;

    const navigation = performance.getEntriesByType("navigation")[0] as
      | PerformanceNavigationTiming
      | undefined;

    if (navigation && (navigation.type === "reload" || navigation.type === "back_forward")) {
      return;
    }
    if (!document.referrer) return;

    printedInThisDocument = true;
    setJustCompleted(true);
  }, [eligible]);

  return justCompleted;
}
