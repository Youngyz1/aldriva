"use client";

import { useEffect } from "react";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Swallow logging failures so a broken/instrumented console.error can
    // never take down this boundary — it's the last line of defense for a
    // root-layout crash and has nowhere else to fall back to.
    try {
      console.error("[GlobalError:root-layout]", error);
    } catch {
      // ignore
    }
  }, [error]);

  return (
    <html lang="en">
      <body className="min-h-screen bg-white text-zinc-950 flex items-center justify-center px-4">
        <div className="max-w-md w-full text-center">
          <p className="text-6xl font-black text-orange-500">500</p>
          <h1 className="mt-4 text-2xl font-black">Something went wrong</h1>
          <p className="mt-3 text-zinc-500 leading-7">
            An unexpected error occurred. Our team has been notified. Please
            try again.
          </p>
          {error.digest && (
            <p className="mt-2 text-xs text-zinc-400 font-mono">
              Error ID: {error.digest}
            </p>
          )}
          <div className="mt-8 flex items-center justify-center">
            <button
              onClick={reset}
              className="w-full sm:w-auto rounded-xl bg-orange-500 px-6 py-3 font-black text-white hover:bg-orange-600 transition"
            >
              Try again
            </button>
          </div>
        </div>
      </body>
    </html>
  );
}
