"use client";

/**
 * CheckoutShell
 * ─────────────
 * Full-page checkout layout shell used for standalone checkout pages
 * (e.g. the donation page). Provides:
 *   - Top bar with back link + "Secure checkout" badge
 *   - Two-column grid (form left, summary right) that stacks on mobile
 *   - Consistent max-width / padding
 *
 * For inline checkout (event ticket widget), use the components
 * directly without CheckoutShell.
 *
 * Props
 *   backHref     – URL the ← Back link points to
 *   backLabel    – text for back link, defaults to "Back"
 *   left         – left column content (form, amount picker, etc.)
 *   right        – right column content (order summary, fundraiser progress, etc.)
 *   legalText    – optional small print below the form
 */

import Link from "next/link";
import { Lock, ArrowLeft } from "lucide-react";

type Props = {
  backHref: string;
  backLabel?: string;
  left: React.ReactNode;
  right: React.ReactNode;
  legalText?: React.ReactNode;
};

export default function CheckoutShell({
  backHref,
  backLabel = "Back",
  left,
  right,
  legalText,
}: Props) {
  return (
    <main className="min-h-screen bg-zinc-50">
      {/* Top bar */}
      <div className="sticky top-0 z-10 border-b border-zinc-200 bg-white/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between">
          <Link
            href={backHref}
            className="flex items-center gap-1.5 text-sm font-semibold text-zinc-500 transition hover:text-zinc-900"
          >
            <ArrowLeft className="h-4 w-4" />
            {backLabel}
          </Link>
          <div className="flex items-center gap-1.5 text-xs font-semibold text-zinc-400">
            <Lock className="h-3.5 w-3.5" />
            Secure checkout
          </div>
        </div>
      </div>

      {/* Content grid — stacks as summary-first on mobile, side-by-side on lg */}
      <div className="mx-auto max-w-5xl px-4 py-8 lg:py-14">
        <div className="flex flex-col-reverse gap-6 lg:grid lg:grid-cols-[1fr_360px] lg:gap-10">
          {/* Left — form column */}
          <div className="min-w-0 space-y-5">
            {left}
            {legalText && (
              <p className="text-center text-xs leading-5 text-zinc-400">
                {legalText}
              </p>
            )}
          </div>

          {/* Right — summary column (renders first visually on mobile via flex-col-reverse) */}
          <div className="h-fit space-y-4 lg:sticky lg:top-20">{right}</div>
        </div>
      </div>
    </main>
  );
}
