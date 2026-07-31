"use client";

import Link from "next/link";

export default function EventsError({
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  return (
    <div className="min-h-[50vh] flex items-center justify-center px-4">
      <div className="max-w-md text-center">
        <p className="text-4xl font-black text-orange-500">Oops</p>
        <h2 className="mt-3 text-xl font-black">Could not load events</h2>
        <p className="mt-2 text-zinc-500 text-sm leading-6">
          Something went wrong while fetching events. Please try again.
        </p>
        <div className="mt-6 flex flex-col sm:flex-row justify-center gap-3">
          <button
            onClick={reset}
            className="rounded-xl bg-orange-500 px-5 py-2.5 font-bold text-white hover:bg-orange-600 transition"
          >
            Try again
          </button>
          <Link
            href="/"
            className="rounded-xl border border-zinc-200 px-5 py-2.5 font-bold text-zinc-700 hover:bg-zinc-50 transition"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}
