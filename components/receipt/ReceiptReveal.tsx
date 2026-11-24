"use client";

import { useEffect, useId, useRef, useState, type ReactNode } from "react";
import { IconReceipt2 } from "@tabler/icons-react";
import { cn } from "@/lib/utils";

/**
 * ReceiptReveal
 *
 * Keeps the printed receipt behind a "View receipt" button so the printer
 * animation is user-initiated: nothing prints until the receipt is asked for.
 * The first open plays the animation once; closing and reopening the same
 * receipt is static. `PrintedReceipt` still owns the reduced-motion handling.
 *
 * `defaultOpen` + `animateOnMount` cover surfaces whose receipt must be
 * visible immediately (an event pass the attendee has to scan): the sheet is
 * already on screen, and it prints once if the caller's "just arrived from
 * checkout" signal is on.
 */
export function ReceiptReveal({
  children,
  label = "View receipt",
  hideLabel = "Hide receipt",
  tone = "light",
  defaultOpen = false,
  animateOnMount = false,
  onOpen,
  onOpenChange,
  className,
}: {
  /** Receives the animation flag to pass to `PrintedReceipt`. */
  children: (state: { animate: boolean }) => ReactNode;
  label?: string;
  hideLabel?: string;
  /** Page background the button sits on. The paper itself is always white. */
  tone?: "light" | "dark";
  /** Render the receipt without waiting for a tap. */
  defaultOpen?: boolean;
  /** Play the print animation on mount, once. Ignored while closed. */
  animateOnMount?: boolean;
  /**
   * Called synchronously when the reveal opens. Use it to unlock audio in the
   * click handler before `PrintedReceipt` mounts and starts its feed.
   */
  onOpen?: () => void;
  /** Reports open/close so a page can scope print CSS to an open receipt. */
  onOpenChange?: (open: boolean) => void;
  className?: string;
}) {
  const [open, setOpen] = useState(defaultOpen);
  // Seed from the prop so an auto-opened receipt prints on its very first
  // frame instead of flashing the finished sheet for one paint.
  const [animate, setAnimate] = useState(defaultOpen && animateOnMount);
  const playedRef = useRef(false);
  const panelId = useId();

  // Arrival is only known after hydration (navigation type + referrer), so the
  // auto-print flag can turn on a frame after the receipt is already visible.
  useEffect(() => {
    if (!animateOnMount || !open || playedRef.current) return;
    playedRef.current = true;
    setAnimate(true);
  }, [animateOnMount, open]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  function toggle() {
    const next = !open;

    if (next && !playedRef.current) {
      playedRef.current = true;
      setAnimate(true);
    }
    if (next) onOpen?.();

    setOpen(next);
  }

  return (
    <div className={cn("w-full", className)}>
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        aria-controls={panelId}
        className={cn(
          "inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl border px-5 text-sm font-black transition-colors",
          tone === "dark"
            ? "border-zinc-700 bg-zinc-900 text-zinc-100 hover:bg-zinc-800"
            : "border-zinc-300 bg-white text-zinc-800 hover:bg-zinc-50",
        )}
      >
        <IconReceipt2 className="h-4 w-4" aria-hidden="true" />
        {open ? hideLabel : label}
      </button>

      <div id={panelId} hidden={!open} className={open ? "mt-5" : undefined}>
        {open ? children({ animate }) : null}
      </div>
    </div>
  );
}
