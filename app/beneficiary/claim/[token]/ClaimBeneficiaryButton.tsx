"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function ClaimBeneficiaryButton({ token }: { token: string }) {
  const router = useRouter();
  const [claiming, setClaiming] = useState(false);
  const [error, setError] = useState("");

  async function claim() {
    setClaiming(true);
    setError("");
    try {
      const res = await fetch("/api/beneficiary/claim", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not claim this profile.");
      router.push("/dashboard/beneficiary");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not claim this profile.");
      setClaiming(false);
    }
  }

  return (
    <div>
      {error && (
        <p className="mb-3 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </p>
      )}
      <button
        type="button"
        onClick={claim}
        disabled={claiming}
        className="inline-flex min-h-[48px] items-center justify-center rounded-full bg-brand-700 px-6 py-3 text-sm font-black text-white transition hover:bg-brand-800 disabled:opacity-60"
      >
        {claiming ? "Claiming…" : "Claim this profile"}
      </button>
    </div>
  );
}
