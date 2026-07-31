import Link from "next/link";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Page Not Found — Aldriva",
  description: "The page you are looking for does not exist.",
};

export default function NotFound() {
  return (
    <main className="min-h-screen bg-white text-zinc-950 flex items-center justify-center px-4">
      <div className="max-w-md w-full text-center">
        <p className="text-6xl font-black text-orange-500">404</p>
        <h1 className="mt-4 text-2xl font-black">Page not found</h1>
        <p className="mt-3 text-zinc-500 leading-7">
          The page you are looking for might have been removed, renamed, or
          never existed. Check the URL or head back to discover events near you.
        </p>
        <div className="mt-8 flex flex-col sm:flex-row items-center justify-center gap-3">
          <Link
            href="/events"
            className="w-full sm:w-auto rounded-xl bg-orange-500 px-6 py-3 font-black text-white hover:bg-orange-600 transition"
          >
            Browse events
          </Link>
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
