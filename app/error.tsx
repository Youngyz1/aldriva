"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    // Log to your error reporting service here. Swallow logging failures so a
    // broken/instrumented console.error can never take down the error boundary
    // itself — that would leave the user with no recovery UI at all.
    try {
      console.error("[GlobalError]", error);
    } catch {
      // ignore
    }
  }, [error]);

  return (
    <main className="min-h-screen bg-white text-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <p className="text-6xl font-black text-orange-500">500</p>
        <h1 className="mt-4 text-2xl font-black">Something went wrong</h1>
        <p className="mt-3 text-zinc-500 leading-7">
          An unexpected error occurred. Our team has been notified. Please try
          again, or return to the home page.
        </p>
        {error.digest && (
          <p className="mt-2 text-xs text-zinc-400 font-mono">
            Error ID: {error.digest}
          </p>
        )}
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <button
            onClick={reset}
            className="w-full sm:w-auto rounded-xl bg-orange-500 px-6 py-3 font-black text-white hover:bg-orange-600 transition"
          >
            Try again
          </button>
          <Link
            href="/"
            className="w-full sm:w-auto rounded-xl border border-zinc-200 px-6 py-3 font-bold text-zinc-700 hover:bg-zinc-50 transition"
          >
            Go home
          </Link>
        </div>
      </div>
    </main>
  );
}
