"use client";

import { useState } from "react";

export default function DonateButton({
  fundraiserTitle,
  fundraiserSlug,
}: {
  fundraiserTitle: string;
  fundraiserSlug: string;
}) {
  const [amount, setAmount] = useState(25);
  const [custom, setCustom] = useState("");
  const [donorName, setDonorName] = useState("");
  const [donorEmail, setDonorEmail] = useState("");
  const [loading, setLoading] = useState(false);

  const presets = [10, 25, 50, 100];

  async function handleDonate() {
    const finalAmount = custom ? Number(custom) : amount;
    if (!finalAmount || finalAmount < 1) return;

    setLoading(true);

    const res = await fetch("/api/donate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        amount: finalAmount,
        fundraiserTitle,
        fundraiserSlug,
        donorName,
        donorEmail,
      }),
    });

    const data = await res.json();

    if (data.url) {
      window.location.href = data.url;
    } else {
      alert("Something went wrong. Please try again.");
      setLoading(false);
    }
  }

  return (
    <div className="space-y-4">

      {/* PRESET AMOUNTS */}
      <div className="grid grid-cols-4 gap-2">
        {presets.map((p) => (
          <button
            key={p}
            onClick={() => { setAmount(p); setCustom(""); }}
            className={`py-2 rounded-xl font-semibold text-sm border transition ${
              amount === p && !custom
                ? "bg-green-500 text-white border-green-500"
                : "border-zinc-300 hover:border-green-500"
            }`}
          >
            ${p}
          </button>
        ))}
      </div>

      {/* CUSTOM AMOUNT */}
      <input
        type="number"
        value={custom}
        onChange={(e) => { setCustom(e.target.value); setAmount(0); }}
        placeholder="Custom amount ($)"
        className="w-full border border-zinc-300 rounded-2xl px-5 py-3 outline-none focus:border-green-500"
      />

      <input
        type="text"
        value={donorName}
        onChange={(e) => setDonorName(e.target.value)}
        placeholder="Your name (optional)"
        className="w-full border border-zinc-300 rounded-2xl px-5 py-3 outline-none focus:border-green-500"
      />

      <input
        type="email"
        value={donorEmail}
        onChange={(e) => setDonorEmail(e.target.value)}
        placeholder="Email receipt (optional)"
        className="w-full border border-zinc-300 rounded-2xl px-5 py-3 outline-none focus:border-green-500"
      />

      <button
        onClick={handleDonate}
        disabled={loading}
        className="w-full bg-green-500 hover:bg-green-600 disabled:bg-green-300 text-white py-4 rounded-2xl font-bold text-lg transition"
      >
        {loading ? "Redirecting..." : `Donate $${custom || amount}`}
      </button>

    </div>
  );
}
