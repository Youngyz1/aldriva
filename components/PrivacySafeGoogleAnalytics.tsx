"use client";

import { GoogleAnalytics } from "@next/third-parties/google";
import { useLayoutEffect } from "react";
import { usePathname } from "next/navigation";
import { isKitchenPrivatePath } from "@/lib/kitchen/worker-validation";

export function PrivacySafeGoogleAnalytics({ gaId }: { gaId?: string }) {
  const pathname = usePathname();
  const privateKitchenRoute = isKitchenPrivatePath(pathname);

  useLayoutEffect(() => {
    if (!gaId) return;
    const target = window as Window & Record<string, unknown>;
    const disableKey = `ga-disable-${gaId}`;
    const setRoutePermission = (url?: string | URL | null) => {
      const targetPath = url == null ? window.location.pathname : new URL(String(url), window.location.href).pathname;
      target[disableKey] = isKitchenPrivatePath(targetPath);
    };

    // GA reads this before sending automatic page views. Guard the history
    // methods before Next's own wrappers dispatch route-change notifications.
    setRoutePermission();
    const history = window.history;
    const originalPushState = history.pushState;
    const originalReplaceState = history.replaceState;
    const wrappedPushState = function (this: History, state: unknown, unused: string, url?: string | URL | null) {
      setRoutePermission(url);
      return originalPushState.call(this, state, unused, url);
    } as History["pushState"];
    const wrappedReplaceState = function (this: History, state: unknown, unused: string, url?: string | URL | null) {
      setRoutePermission(url);
      return originalReplaceState.call(this, state, unused, url);
    } as History["replaceState"];
    history.pushState = wrappedPushState;
    history.replaceState = wrappedReplaceState;
    const onPopState = () => setRoutePermission();
    window.addEventListener("popstate", onPopState, true);

    return () => {
      if (history.pushState === wrappedPushState) history.pushState = originalPushState;
      if (history.replaceState === wrappedReplaceState) history.replaceState = originalReplaceState;
      window.removeEventListener("popstate", onPopState, true);
    };
  }, [gaId]);

  if (!gaId || privateKitchenRoute) return null;
  return <GoogleAnalytics gaId={gaId} />;
}
