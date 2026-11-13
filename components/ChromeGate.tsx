"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";

/**
 * Account-less guest scanner pages have no use for site chrome: the guest
 * never navigates the rest of Aldriva, and the invitation link / redeem
 * flow must reveal nothing about the event behind it, which a global
 * navbar's search/account UI would undercut. Locale-prefix aware, same
 * shape as lib/kitchen/worker-validation.ts's isKitchenPrivatePath.
 */
export function isGuestScannerPath(pathname: string | null | undefined): boolean {
  const withoutLocale = (pathname ?? "").replace(/^\/(?:en|fr)(?=\/|$)/, "");
  return (
    /^\/events\/[^/]+\/staff-scanner(?:\/|$)/.test(withoutLocale) ||
    /^\/events\/team\/redeem(?:\/|$)/.test(withoutLocale)
  );
}

/**
 * Renders children everywhere except the guest scanner pages, where it
 * renders nothing. Use to gate shared chrome (navbar, footer) that those
 * pages must never show.
 */
export default function ChromeGate({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  if (isGuestScannerPath(pathname)) return null;
  return <>{children}</>;
}
