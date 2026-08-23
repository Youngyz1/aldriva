"use client";

import { useEffect, useState, useCallback } from "react";

interface BeforeInstallPromptEvent extends Event {
  readonly platforms: string[];
  readonly userChoice: Promise<{
    outcome: "accepted" | "dismissed";
    platform: string;
  }>;
  prompt(): Promise<void>;
}

function detectIsIOS(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  const userAgent =
    navigator.userAgent || navigator.vendor || (window as unknown as { opera?: string }).opera || "";

  // Direct UA check for iPhone, iPod, iPad
  const isIOSUA = /iPhone|iPod|iPad/i.test(userAgent);

  // Modern iPadOS 13+ (reports as MacIntel, but has multi-touch points)
  const isIPadOS =
    navigator.platform === "MacIntel" &&
    navigator.maxTouchPoints > 1 &&
    !userAgent.includes("Windows");

  return isIOSUA || isIPadOS;
}

function detectIsStandalone(): boolean {
  if (typeof window === "undefined") return false;
  return (
    window.matchMedia("(display-mode: standalone)").matches ||
    (window.navigator as unknown as { standalone?: boolean }).standalone === true
  );
}

export function usePWA() {
  const [deferredPrompt, setDeferredPrompt] = useState<BeforeInstallPromptEvent | null>(null);
  const [isInstalled, setIsInstalled] = useState(false);
  const [isIOS, setIsIOS] = useState(false);
  const [showIOSInstructions, setShowIOSInstructions] = useState(false);

  useEffect(() => {
    // Detect platform and standalone status on mount
    setIsIOS(detectIsIOS());
    setIsInstalled(detectIsStandalone());

    // Register service worker safely on client mount
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then((reg) => {
          if (process.env.NODE_ENV === "development") {
            console.log("[PWA] Service Worker registered:", reg.scope);
          }
        })
        .catch((err) => {
          console.warn("[PWA] Service Worker registration failed:", err);
        });
    }

    const handleBeforeInstallPrompt = (e: Event) => {
      // Prevent browser default mini-infobar from forcing popups
      e.preventDefault();
      const promptEvent = e as BeforeInstallPromptEvent;
      setDeferredPrompt(promptEvent);
    };

    const handleAppInstalled = () => {
      setDeferredPrompt(null);
      setIsInstalled(true);
      setShowIOSInstructions(false);
    };

    window.addEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
    window.addEventListener("appinstalled", handleAppInstalled);

    return () => {
      window.removeEventListener("beforeinstallprompt", handleBeforeInstallPrompt);
      window.removeEventListener("appinstalled", handleAppInstalled);
    };
  }, []);

  const promptInstall = useCallback(async (): Promise<boolean> => {
    if (isIOS) {
      setShowIOSInstructions(true);
      return true;
    }
    if (!deferredPrompt) return false;
    try {
      await deferredPrompt.prompt();
      const choiceResult = await deferredPrompt.userChoice;
      if (choiceResult.outcome === "accepted") {
        setIsInstalled(true);
        setDeferredPrompt(null);
        return true;
      }
    } catch (err) {
      console.warn("[PWA] Install prompt failed:", err);
    }
    return false;
  }, [isIOS, deferredPrompt]);

  const isInstallable = !isInstalled && (isIOS || deferredPrompt !== null);

  return {
    isInstallable,
    isInstalled,
    isIOS,
    promptInstall,
    showIOSInstructions,
    setShowIOSInstructions,
  };
}
