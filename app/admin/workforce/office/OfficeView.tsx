/**
 * OfficeView — "use client" wrapper for the 3D office.
 *
 * Owns: 3D/2D mode (toggle + WebGL/small-screen auto-fallback), 30s polling
 * via router.refresh() paused while the tab is hidden, screen-reader text.
 * No data fetching here: the snapshot arrives as props from the server page.
 * three.js is imported ONLY inside the lazy scene component below.
 */
"use client";

import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import type { OfficeSnapshot } from "@/lib/workforce/office";
import { OfficeFallback } from "./OfficeFallback";

const OfficeScene = dynamic(() => import("./OfficeScene").then((m) => m.OfficeScene), {
  ssr: false,
  loading: () => <p className="text-sm text-zinc-500">Loading 3D office…</p>,
});

function webglAvailable(): boolean {
  try {
    const canvas = document.createElement("canvas");
    return !!(canvas.getContext("webgl") || canvas.getContext("experimental-webgl"));
  } catch {
    return false;
  }
}

export function OfficeView({ snapshot }: { snapshot: OfficeSnapshot }) {
  const router = useRouter();
  const [mode, setMode] = useState<"3d" | "2d">("3d");
  const [reducedMotion] = useState(() =>
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function" &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches
  );

  // Auto-fallback: no WebGL or small screens get the 2D list.
  useEffect(() => {
    const small =
      typeof window !== "undefined" &&
      typeof window.matchMedia === "function" &&
      window.matchMedia("(max-width: 768px)").matches;
    if (!webglAvailable() || small || reducedMotion) setMode("2d");
  }, [reducedMotion]);

  // Polling: re-render from the server every 30s; paused while hidden.
  useEffect(() => {
    if (typeof document === "undefined") return;
    let timer: ReturnType<typeof setInterval> | null = null;
    const start = () => {
      if (timer !== null) return;
      timer = setInterval(() => router.refresh(), 30_000);
    };
    const stop = () => {
      if (timer !== null) {
        clearInterval(timer);
        timer = null;
      }
    };
    const onVisibility = () => {
      if (document.hidden) stop();
      else start();
    };
    document.addEventListener("visibilitychange", onVisibility);
    if (!document.hidden) start();
    return () => {
      document.removeEventListener("visibilitychange", onVisibility);
      stop();
    };
  }, [router]);

  const show3D = useCallback(() => setMode("3d"), []);
  const show2D = useCallback(() => setMode("2d"), []);

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={show3D}
          aria-pressed={mode === "3d"}
          className="rounded-xl bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 shadow-xs hover:text-white"
        >
          3D office
        </button>
        <button
          type="button"
          onClick={show2D}
          aria-pressed={mode === "2d"}
          className="rounded-xl bg-zinc-900 px-3 py-1.5 text-sm text-zinc-300 shadow-xs hover:text-white"
        >
          List view
        </button>
      </div>
      {mode === "3d" ? (
        <OfficeScene snapshot={snapshot} reducedMotion={reducedMotion} />
      ) : (
        <OfficeFallback snapshot={snapshot} />
      )}
      <ul className="sr-only">
        {snapshot.agents.map((a) => (
          <li key={a.id}>
            {a.name}, {a.department}, {a.statusLabel},{' '}
            {a.presence === "busy" ? "currently busy" : a.presence === "awaiting" ? "awaiting approval" : a.presence === "neutral" ? "state unknown" : "idle"}
            {a.currentTaskTitle ? `, current task: ${a.currentTaskTitle}` : ", no current task"}
          </li>
        ))}
      </ul>
    </div>
  );
}
