"use client";

import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";

export default function KitchenDisplayBootstrapPage() {
  const router = useRouter();
  const [error, setError] = useState("");

  useEffect(() => {
    const token = window.location.hash.slice(1);
    // Display secrets are fragments, so they are not sent in requests or referrers.
    window.history.replaceState(null, "", `${window.location.pathname}${window.location.search}`);
    if (!/^[0-9a-f]{64}$/i.test(token)) {
      setError("This kitchen display link is invalid or has expired.");
      return;
    }

    fetch("/api/kitchen/display/bootstrap", {
      method: "POST",
      cache: "no-store",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    })
      .then(async (response) => {
        if (!response.ok) throw new Error("This kitchen display link is invalid or has expired.");
        router.replace("/kitchen");
      })
      .catch((cause: unknown) => {
        setError(cause instanceof Error ? cause.message : "Unable to open the kitchen display.");
      });
  }, [router]);

  return (
    <main className="mx-auto flex min-h-[calc(100vh-4rem)] w-full max-w-lg items-center px-4 py-10">
      <section className="w-full rounded-xl border border-zinc-200 bg-white p-6 shadow-sm">
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-800">Kitchen display</p>
        <h1 className="mt-2 text-2xl font-bold text-zinc-950">Opening the order board</h1>
        {error ? <p role="alert" className="mt-4 text-sm text-red-700">{error}</p> : <p role="status" className="mt-4 text-sm text-zinc-600">Checking this display link…</p>}
      </section>
    </main>
  );
}
