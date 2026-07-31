"use client";

import { useState, useEffect, Suspense } from "react";
import { useSearchParams } from "next/navigation";
import Link from "next/link";
import { CheckCircle2, Loader2, AlertCircle, Award, Ticket, ArrowLeft, Download } from "lucide-react";

function CryptoPendingContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId") || searchParams.get("paymentId");

  const [status, setStatus] = useState<"loading" | "waiting" | "confirmed" | "failed">("loading");
  const [paymentDetails, setPaymentDetails] = useState<{
    type: "donation" | "ticket" | "product" | null;
    recordId: string | null;
    slug: string | null;
    qrCode: string | null;
    productName: string | null;
  }>({
    type: null,
    recordId: null,
    slug: null,
    qrCode: null,
    productName: null,
  });

  const [error, setError] = useState<string | null>(null);
  const [dots, setDots] = useState("");

  // Animated dots for waiting state
  useEffect(() => {
    if (status !== "waiting" && status !== "loading") return;
    const interval = setInterval(() => {
      setDots((prev) => (prev.length >= 3 ? "" : prev + "."));
    }, 800);
    return () => clearInterval(interval);
  }, [status]);

  useEffect(() => {
    if (!orderId) {
      setError("Missing payment ID. Please check the URL.");
      setStatus("failed");
      return;
    }

    let isMounted = true;
    let pollInterval: any;

    async function checkStatus() {
      try {
        const res = await fetch(`/api/crypto/status?orderId=${orderId}`);
        if (!res.ok) {
          throw new Error("Failed to check status.");
        }
        const data = await res.json();
        
        if (!isMounted) return;

        if (data.status === "confirmed") {
          setStatus("confirmed");
          setPaymentDetails({
            type: data.type,
            recordId: data.recordId,
            slug: data.slug,
            qrCode: data.qrCode,
            productName: data.productName,
          });
          clearInterval(pollInterval);
        } else if (data.status === "failed") {
          setStatus("failed");
          clearInterval(pollInterval);
        } else {
          setStatus("waiting");
          setPaymentDetails({
            type: data.type,
            recordId: data.recordId,
            slug: data.slug,
            qrCode: data.qrCode,
            productName: data.productName,
          });
        }
      } catch (err) {
        console.error("Error checking crypto status:", err);
      }
    }

    checkStatus();
    pollInterval = setInterval(checkStatus, 10000); // Poll every 10 seconds

    return () => {
      isMounted = false;
      clearInterval(pollInterval);
    };
  }, [orderId]);

  if (status === "loading") {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] text-center px-4">
        <Loader2 className="h-12 w-12 text-zinc-400 animate-spin mb-4" />
        <h1 className="text-xl font-bold text-zinc-900">Loading details{dots}</h1>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="w-full max-w-md mx-auto rounded-3xl border border-red-200 bg-white p-8 text-center shadow-xl">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-red-100 mb-6">
          <AlertCircle className="h-8 w-8 text-red-600" />
        </div>
        <h1 className="text-2xl font-black text-zinc-900">Payment Failed</h1>
        <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
          {error || "We could not confirm your crypto payment. The invoice may have expired or was cancelled."}
        </p>
        <Link
          href="/"
          className="mt-8 flex items-center justify-center gap-2 w-full rounded-2xl bg-zinc-900 py-3.5 text-sm font-black text-white hover:bg-zinc-800 transition shadow-sm"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to Homepage
        </Link>
      </div>
    );
  }

  if (status === "confirmed") {
    const isDonation = paymentDetails.type === "donation";
    const isProduct = paymentDetails.type === "product";

    return (
      <div className="w-full max-w-md mx-auto rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-2xl relative overflow-hidden">
        {/* Colorful top border bar */}
        <div className={`absolute top-0 left-0 right-0 h-2 ${isDonation ? "bg-green-600" : "bg-orange-500"}`} />

        <div className={`mx-auto flex h-16 w-16 items-center justify-center rounded-full mb-6 ${isDonation ? "bg-green-100" : "bg-orange-100"}`}>
          <CheckCircle2 className={`h-10 w-10 ${isDonation ? "text-green-600" : "text-orange-500"}`} />
        </div>

        <h1 className="text-3xl font-black text-zinc-900">Payment Confirmed!</h1>
        <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
          {isDonation
            ? "Your crypto donation has been successfully processed. Thank you for your support!"
            : isProduct
            ? `Your order${paymentDetails.productName ? ` for "${paymentDetails.productName}"` : ""} has been confirmed. A confirmation email has been sent.`
            : "Your tickets have been successfully booked. A confirmation email has been sent."}
        </p>

        <hr className="my-8 border-zinc-100" />

        {isDonation ? (
          <div className="space-y-4">
            {paymentDetails.recordId && (
              <a
                href={`/api/certificates/${paymentDetails.recordId}?paymentId=${orderId}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center gap-2 w-full rounded-2xl bg-green-700 hover:bg-green-800 py-4 text-sm font-black text-white transition shadow-md"
              >
                <Award className="h-4 w-4" />
                Download Certificate (PDF)
              </a>
            )}
            {paymentDetails.slug && (
              <Link
                href={`/fundraisers/${paymentDetails.slug}`}
                className="block text-sm font-bold text-zinc-500 hover:text-zinc-800 transition py-2"
              >
                Back to Fundraiser
              </Link>
            )}
          </div>
        ) : isProduct ? (
          <div className="space-y-4">
            {paymentDetails.slug && (
              <Link
                href={`/products/${paymentDetails.slug}`}
                className="flex items-center justify-center gap-2 w-full rounded-2xl bg-orange-500 hover:bg-orange-600 py-4 text-sm font-black text-white transition shadow-md"
              >
                View Product →
              </Link>
            )}
            <Link
              href="/products"
              className="block text-sm font-bold text-zinc-500 hover:text-zinc-800 transition py-2"
            >
              Back to Shop
            </Link>
          </div>
        ) : (
          <div className="space-y-4">
            {paymentDetails.qrCode && paymentDetails.slug && (
              <Link
                href={`/ticket-confirmation?qr=${paymentDetails.qrCode}&event=${paymentDetails.slug}`}
                className="flex items-center justify-center gap-2 w-full rounded-2xl bg-orange-500 hover:bg-orange-600 py-4 text-sm font-black text-white transition shadow-md"
              >
                <Ticket className="h-4 w-4" />
                View Ticket Details →
              </Link>
            )}
            {paymentDetails.slug && (
              <Link
                href={`/events/${paymentDetails.slug}`}
                className="block text-sm font-bold text-zinc-500 hover:text-zinc-800 transition py-2"
              >
                Back to Event
              </Link>
            )}
          </div>
        )}
      </div>
    );
  }

  // Waiting / Confirming State
  const isDonation = paymentDetails.type === "donation";

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-xl relative overflow-hidden">
      <div className={`absolute top-0 left-0 right-0 h-2 bg-amber-500 animate-pulse`} />

      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-amber-50 mb-6 relative">
        <Loader2 className="h-10 w-10 text-amber-500 animate-spin" />
      </div>

      <h1 className="text-2xl font-black text-zinc-900">Confirming Payment{dots}</h1>
      <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
        Your cryptocurrency transaction has been detected and is being confirmed on the blockchain. 
        This page will automatically update once finalized.
      </p>

      <div className="mt-6 rounded-2xl bg-zinc-50 border border-zinc-200/50 p-4 text-left space-y-2">
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-zinc-400 uppercase">Payment Method</span>
          <span className="font-black text-zinc-700">Cryptocurrency</span>
        </div>
        {orderId && (
          <div className="flex justify-between text-xs">
            <span className="font-semibold text-zinc-400 uppercase">Payment Reference</span>
            <span className="font-mono text-zinc-500 truncate max-w-[150px]">{orderId}</span>
          </div>
        )}
        <div className="flex justify-between text-xs">
          <span className="font-semibold text-zinc-400 uppercase">Status</span>
          <span className="font-bold text-amber-600 flex items-center gap-1">
            <Loader2 className="h-3 w-3 animate-spin" />
            Awaiting Confirmation
          </span>
        </div>
      </div>

      <p className="mt-8 text-xs text-zinc-400">
        You may safely bookmark this page. You will also receive an email confirmation once the transaction is complete.
      </p>
    </div>
  );
}

export default function CryptoPendingPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center text-center">
          <Loader2 className="h-12 w-12 text-zinc-400 animate-spin mb-4" />
          <h1 className="text-xl font-bold text-zinc-900">Loading details...</h1>
        </div>
      }>
        <CryptoPendingContent />
      </Suspense>
    </main>
  );
}
