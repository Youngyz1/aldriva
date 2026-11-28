"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { IconX } from "@tabler/icons-react";

const DISMISS_MS = 4000;

/**
 * "Added to cart" confirmation — replaces the removed persistent order bar
 * as the way a successful add gets acknowledged. One toast at a time: a new
 * add always replaces whatever is showing (see `show()`).
 */
export function useCartAddedToast() {
  const [visible, setVisible] = useState(false);
  const timeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const remainingRef = useRef(DISMISS_MS);
  const startedAtRef = useRef(0);

  const clearTimer = useCallback(() => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
      timeoutRef.current = null;
    }
  }, []);

  const schedule = useCallback((ms: number) => {
    clearTimer();
    startedAtRef.current = Date.now();
    remainingRef.current = ms;
    timeoutRef.current = setTimeout(() => setVisible(false), ms);
  }, [clearTimer]);

  const show = useCallback(() => {
    setVisible(true);
    schedule(DISMISS_MS);
  }, [schedule]);

  const dismiss = useCallback(() => {
    clearTimer();
    setVisible(false);
  }, [clearTimer]);

  const pause = useCallback(() => {
    if (timeoutRef.current === null) return;
    remainingRef.current = Math.max(0, remainingRef.current - (Date.now() - startedAtRef.current));
    clearTimer();
  }, [clearTimer]);

  const resume = useCallback(() => {
    if (!visible) return;
    schedule(remainingRef.current || DISMISS_MS);
  }, [visible, schedule]);

  useEffect(() => clearTimer, [clearTimer]);

  return { visible, show, dismiss, pause, resume };
}

export interface CartAddedToastProps {
  visible: boolean;
  locale: "en" | "fr";
  onViewCart: () => void;
  onDismiss: () => void;
  onPause: () => void;
  onResume: () => void;
}

export function CartAddedToast({ visible, locale, onViewCart, onDismiss, onPause, onResume }: CartAddedToastProps) {
  return (
    <div
      role="status"
      aria-live="polite"
      aria-atomic="true"
      className={`pointer-events-none fixed inset-x-0 bottom-[var(--mobile-cart-bar-offset,1rem)] z-[95] flex justify-center px-4 transition-opacity duration-200 sm:inset-x-auto sm:right-6 sm:justify-end sm:px-0 ${visible ? "opacity-100" : "opacity-0"}`}
    >
      {visible ? (
        <div
          onMouseEnter={onPause}
          onMouseLeave={onResume}
          onFocus={onPause}
          onBlur={onResume}
          className="pointer-events-auto flex items-center gap-1 rounded-full bg-[var(--tf-ink)] py-2 pl-4 pr-2 text-[var(--tf-on-ink)] shadow-lg"
        >
          <span className="text-sm font-semibold whitespace-nowrap">
            {locale === "fr" ? "Ajouté au panier" : "Added to cart"}
          </span>
          <button
            type="button"
            onClick={onViewCart}
            className="ml-2 min-h-[44px] rounded-full px-2 text-sm font-semibold underline underline-offset-2 hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
          >
            {locale === "fr" ? "Voir le panier" : "View cart"}
          </button>
          <button
            type="button"
            onClick={onDismiss}
            aria-label={locale === "fr" ? "Fermer" : "Close"}
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--tf-accent)]"
          >
            <IconX size={16} aria-hidden="true" />
          </button>
        </div>
      ) : null}
    </div>
  );
}
