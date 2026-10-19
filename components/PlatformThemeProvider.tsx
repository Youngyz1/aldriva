"use client";

import * as React from "react";
import { usePathname } from "next/navigation";

export type PlatformThemeMode = "system" | "light" | "dark";

const STORAGE_KEY = "aldriva-theme-mode";
const ThemeContext = React.createContext<{
  mode: PlatformThemeMode;
  setMode: (mode: PlatformThemeMode) => void;
} | null>(null);

function isThemeMode(value: string | null): value is PlatformThemeMode {
  return value === "system" || value === "light" || value === "dark";
}

function isThemeOwnedRoute(pathname: string | null): boolean {
  const path = pathname?.replace(/^\/(en|fr)(?=\/|$)/, "") ?? "";
  return Boolean(
    path.startsWith("/site/") ||
      path.startsWith("/invitation/") ||
      path.startsWith("/website-preview/") ||
      path === "/fundraisers" ||
      path.startsWith("/fundraisers/")
  );
}

function applyPlatformTheme(mode: PlatformThemeMode, systemDark: boolean, themeOwnedRoute: boolean) {
  const dark = !themeOwnedRoute && (mode === "dark" || (mode === "system" && systemDark));
  const root = document.documentElement;
  root.classList.toggle("dark", dark);
  root.classList.toggle("light", !dark);
}

function ThemeRouteSync({ mode, systemDark, ready }: { mode: PlatformThemeMode; systemDark: boolean; ready: boolean }) {
  const pathname = usePathname();

  React.useEffect(() => {
    if (!ready) return;
    applyPlatformTheme(mode, systemDark, isThemeOwnedRoute(pathname));
  }, [mode, pathname, ready, systemDark]);

  return null;
}

export function PlatformThemeProvider({ children }: { children: React.ReactNode }) {
  const [mode, setModeState] = React.useState<PlatformThemeMode>("system");
  const [systemDark, setSystemDark] = React.useState(false);
  const [ready, setReady] = React.useState(false);

  React.useEffect(() => {
    const media = window.matchMedia("(prefers-color-scheme: dark)");
    setSystemDark(media.matches);

    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (isThemeMode(stored)) setModeState(stored);
    } catch {
      // The in-memory preference still works when browser storage is unavailable.
    }
    setReady(true);

    const handleSystemChange = (event: MediaQueryListEvent) => setSystemDark(event.matches);
    const handleStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY && event.key !== null) return;
      setModeState(isThemeMode(event.newValue) ? event.newValue : "system");
    };
    media.addEventListener("change", handleSystemChange);
    window.addEventListener("storage", handleStorage);

    return () => {
      media.removeEventListener("change", handleSystemChange);
      window.removeEventListener("storage", handleStorage);
    };
  }, []);

  const setMode = React.useCallback((nextMode: PlatformThemeMode) => {
    setModeState(nextMode);
    try {
      window.localStorage.setItem(STORAGE_KEY, nextMode);
    } catch {
      // Keep the selected theme for this session when storage is unavailable.
    }
  }, []);

  return (
    <ThemeContext.Provider value={{ mode, setMode }}>
      {children}
      <React.Suspense fallback={null}>
        <ThemeRouteSync mode={mode} systemDark={systemDark} ready={ready} />
      </React.Suspense>
    </ThemeContext.Provider>
  );
}

export function usePlatformTheme() {
  const context = React.useContext(ThemeContext);
  if (!context) throw new Error("usePlatformTheme must be used inside PlatformThemeProvider");
  return context;
}
