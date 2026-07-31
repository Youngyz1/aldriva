"use client";

import { CheckCircle2 } from "lucide-react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { useMemo, useState, useEffect, Suspense } from "react";
import { supabase } from "@/lib/supabase";

function DonationConfirmationContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const fundraiserSlug = searchParams.get("fundraiser_slug") || "";
  const donorName = searchParams.get("donor_name") || "";
  const amount = searchParams.get("amount") || "0";
  const fundraiserHref = fundraiserSlug
    ? `/fundraisers/${fundraiserSlug}`
    : "/fundraisers";
  const [name, setName] = useState(donorName);
  const [message, setMessage] = useState("");
  const [anonymous, setAnonymous] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");

  // Receipt state
  const [donationId, setDonationId] = useState<string | null>(null);
  const [isNonprofit, setIsNonprofit] = useState(false);
  const [loadingReceipt, setLoadingReceipt] = useState(false);
  const sessionId = searchParams.get("session_id");

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    if (!sessionId) return;

    setLoadingReceipt(true);
    let intervalId: any;
    let attempts = 0;

    async function pollLookup() {
      attempts++;
      try {
        const res = await fetch(`/api/receipts/lookup?session_id=${sessionId}`);
        if (res.ok) {
          const data = await res.json();
          setDonationId(data.id);
          setIsNonprofit(data.is_nonprofit);
          setLoadingReceipt(false);
          clearInterval(intervalId);
        } else if (attempts > 15) {
          setLoadingReceipt(false);
          clearInterval(intervalId);
        }
      } catch (err) {
        console.error("Receipt lookup error:", err);
      }
    }

    intervalId = setInterval(pollLookup, 2000);
    pollLookup();

    return () => clearInterval(intervalId);
  }, [sessionId]);

  const formattedAmount = useMemo(() => {
    return Number(amount || 0).toLocaleString("en-US", {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 0,
    });
  }, [amount]);

  async function resolveFundraiserId() {
    const storedId = window.localStorage.getItem(
      "last_donation_fundraiser_id"
    );
    const storedSlug = window.localStorage.getItem(
      "last_donation_fundraiser_slug"
    );

    if (storedId && (!storedSlug || storedSlug === fundraiserSlug)) {
      return storedId;
    }

    if (!fundraiserSlug) return "";

    const { data } = await supabase
      .from("fundraisers")
      .select("id")
      .eq("slug", fundraiserSlug)
      .maybeSingle();

    return data?.id || "";
  }

  async function shareSupport() {
    const body = message.trim();
    if (!body) {
      router.push(fundraiserHref);
      return;
    }

    setSubmitting(true);
    setError("");

    const fundraiserId = await resolveFundraiserId();
    if (!fundraiserId) {
      setError(
        "We could not find this fundraiser. Please return to the campaign."
      );
      setSubmitting(false);
      return;
    }

    const response = await fetch("/api/comments", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        body,
        fundraiser_id: fundraiserId,
        author_name: anonymous ? "Anonymous" : name.trim() || "Anonymous",
        type: "fundraiser",
      }),
    });

    if (!response.ok) {
      const result = await response.json().catch(() => ({}));
      setError(result.error || "Could not share your support.");
      setSubmitting(false);
      return;
    }

    router.push(fundraiserHref);
  }

  return (
    <main className="min-h-screen bg-zinc-50 px-4 pt-6 pb-12 text-zinc-950">
      <section className="mx-auto max-w-xl rounded-lg border border-zinc-200 bg-white p-6 shadow-sm sm:p-8">
        <div className="flex justify-center">
          <CheckCircle2 className="h-16 w-16 text-emerald-600" />
        </div>
        <h1 className="mt-5 text-center text-3xl font-black">
          Thank you for your donation!
        </h1>
        <p className="mt-3 text-center text-zinc-600">
          You donated {formattedAmount} to this campaign
        </p>

        {/* Receipt Download Panel */}
        <div className="mt-6 border-t border-zinc-100 pt-6">
          {loadingReceipt ? (
            <div className="flex flex-col items-center justify-center py-4">
              <div className="h-6 w-6 animate-spin rounded-full border-2 border-emerald-600 border-t-transparent" />
              <p className="mt-2 text-xs font-semibold text-zinc-400">Generating receipt…</p>
            </div>
          ) : donationId ? (
            <div className="space-y-4">
              <a
                href={`/api/receipts/${donationId}?session_id=${sessionId}`}
                className="block w-full text-center rounded-2xl bg-emerald-600 py-3.5 text-sm font-black text-white hover:bg-emerald-700 transition shadow-sm"
              >
                Download Receipt PDF
              </a>
              {isNonprofit ? (
                <div className="rounded-2xl bg-emerald-50 border border-emerald-100 p-4 text-left text-xs text-emerald-800 leading-relaxed">
                  <span className="font-black block mb-1">★ Tax-Deductible Donation</span>
                  This fundraiser is run by a registered nonprofit. Your contribution qualifies for tax-deductible benefits.
                </div>
              ) : (
                <div className="rounded-2xl bg-zinc-50 border border-zinc-200 p-4 text-left text-xs text-zinc-500 leading-relaxed">
                  <span className="font-bold block mb-1">Standard Donation</span>
                  This is a standard donation receipt. Donations to individuals are generally not tax-deductible.
                </div>
              )}
            </div>
          ) : (
            <p className="text-center text-xs text-zinc-400">
              Receipt will be emailed to you shortly.
            </p>
          )}
        </div>

        <hr className="my-8 border-zinc-200" />

        <div>
          <h2 className="text-xl font-black">
            Leave a word of support (optional)
          </h2>

          <div className="mt-4">
            <label className="block text-sm font-semibold text-zinc-700">
              Your name
            </label>
            <input
              type="text"
              value={anonymous ? "Anonymous" : name}
              onChange={(e) => setName(e.target.value)}
              disabled={anonymous}
              placeholder="Your name"
              className="mt-1 w-full rounded-lg border border-zinc-300 px-4 py-2.5 text-sm outline-none focus:border-emerald-500 disabled:bg-zinc-50 disabled:text-zinc-400"
            />
          </div>

          <textarea
            value={message}
            onChange={(event) =>
              setMessage(event.target.value.slice(0, 200))
            }
            maxLength={200}
            rows={5}
            placeholder="Write a message of support..."
            className="mt-4 w-full resize-none rounded-lg border border-zinc-300 bg-white px-4 py-3 text-sm text-zinc-900 placeholder-zinc-400 outline-none focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500"
          />
          <div className="mt-2 flex items-center justify-between gap-3">
            <label className="flex items-center gap-2 text-sm font-semibold text-zinc-700">
              <input
                type="checkbox"
                checked={anonymous}
                onChange={(event) => setAnonymous(event.target.checked)}
                className="accent-emerald-600"
              />
              Post anonymously
            </label>
            <span className="text-sm font-semibold text-zinc-500">
              {message.length}/200
            </span>
          </div>

          {error && (
            <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
              {error}
            </div>
          )}

          <button
            type="button"
            onClick={shareSupport}
            disabled={submitting}
            className="mt-5 w-full rounded-lg bg-emerald-600 px-5 py-3.5 text-base font-black text-white transition hover:bg-emerald-700 disabled:bg-emerald-300"
          >
            {submitting ? "Posting..." : "Post support"}
          </button>

          <Link
            href={fundraiserHref}
            className="mt-4 block text-center text-sm font-black text-zinc-600 hover:text-zinc-950"
          >
            Skip, return to fundraiser
          </Link>
        </div>
      </section>
    </main>
  );
}

export default function DonationConfirmationPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-zinc-50">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-emerald-500 border-t-transparent" />
        </div>
      }
    >
      <DonationConfirmationContent />
    </Suspense>
  );
}