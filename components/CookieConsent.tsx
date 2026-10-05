"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Cookie } from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

const CONSENT_KEY = "Aldriva-cookie-consent";

export default function CookieConsent() {
  const pathname = usePathname();
  const [isVisible, setIsVisible] = useState(false);
  const [mounted, setMounted] = useState(false);
  const isInvitation = pathname?.includes("/invitation");

  useEffect(() => {
    setMounted(true);
    const consent = window.localStorage.getItem(CONSENT_KEY);
    if (!consent) {
      // Small delay for better transition effect after page load
      const timer = setTimeout(() => setIsVisible(true), 800);
      return () => clearTimeout(timer);
    }
  }, []);

  function dismiss(choice: "accepted" | "declined") {
    window.localStorage.setItem(CONSENT_KEY, choice);
    setIsVisible(false);
  }

  if (!mounted) return null;

  return (
    <AnimatePresence>
      {isVisible && (
        <motion.div
          initial={{ opacity: 0, y: 100 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 100 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className={
            isInvitation
              ? "fixed bottom-4 left-4 z-50 max-w-sm rounded-2xl border border-zinc-200 bg-white/95 p-4 shadow-2xl backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95"
              : "fixed bottom-0 left-0 right-0 z-50 w-full border-t border-zinc-200 bg-white/95 px-6 py-4 shadow-[0_-8px_30px_rgb(0,0,0,0.08)] backdrop-blur-md dark:border-zinc-800 dark:bg-zinc-950/95"
          }
          role="dialog"
          aria-modal="false"
          aria-label="Cookie preferences"
        >
          <div
            className={
              isInvitation
                ? "flex flex-col gap-3"
                : "mx-auto flex max-w-7xl flex-col gap-4 sm:flex-row sm:items-center sm:justify-between"
            }
          >
            <div className="flex items-start gap-3">
              <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-orange-100 text-orange-600 dark:bg-orange-950/50 dark:text-orange-400">
                <Cookie className="h-4 w-4" />
              </div>
              <p className="text-xs leading-4 text-zinc-600 dark:text-zinc-400">
                We use essential cookies to support this invitation.{" "}
                <Link
                  href="/cookies"
                  className="font-semibold text-orange-600 underline hover:text-orange-700 dark:text-orange-400"
                >
                  Cookie Policy
                </Link>
                .
              </p>
            </div>

            <div className="flex shrink-0 items-center justify-end gap-2">
              {/* Decline — ghost / secondary */}
              <button
                id="cookie-decline"
                onClick={() => dismiss("declined")}
                className="rounded-full border border-zinc-300 px-3.5 py-1.5 text-xs font-bold text-zinc-700 transition-all hover:border-zinc-400 hover:bg-zinc-50 active:scale-[0.98] dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                Decline
              </button>

              {/* Accept — primary */}
              <button
                id="cookie-accept"
                onClick={() => dismiss("accepted")}
                className="rounded-full bg-orange-600 px-4 py-1.5 text-xs font-black text-white shadow-sm transition-all hover:scale-[1.02] hover:bg-orange-700 active:scale-[0.98]"
              >
                Accept
              </button>
            </div>
          </div>
        </motion.div>
      )}
    </AnimatePresence>
  );
}

/**
 * Helper you can import anywhere to read the current consent decision.
 *
 * Returns:
 *   "accepted"  – visitor accepted all cookies
 *   "declined"  – visitor declined non-essential cookies
 *   null        – no decision recorded yet (banner not yet shown / dismissed)
 *
 * Usage (client components only):
 *   import { getCookieConsent } from "@/components/CookieConsent";
 *   const consent = getCookieConsent();
 *   if (consent === "accepted") { // load analytics ... }
 */
export function getCookieConsent(): "accepted" | "declined" | null {
  if (typeof window === "undefined") return null;
  const value = window.localStorage.getItem(CONSENT_KEY);
  if (value === "accepted" || value === "declined") return value;
  return null;
}
