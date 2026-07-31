"use client";

import { CheckCircle2, Loader2 } from "lucide-react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useState, Suspense } from "react";

function OrderConfirmationContent() {
  const searchParams = useSearchParams();
  const orderId = searchParams.get("orderId");

  const [status, setStatus] = useState<"loading" | "pending" | "paid" | "failed">("loading");
  const [order, setOrder] = useState<{
    productName: string | null;
    productSlug: string | null;
    quantity: number | null;
    totalAmount: number | null;
    currency: string | null;
  }>({ productName: null, productSlug: null, quantity: null, totalAmount: null, currency: null });

  useEffect(() => {
    window.scrollTo({ top: 0, behavior: "instant" });
  }, []);

  useEffect(() => {
    if (!orderId) {
      setStatus("failed");
      return;
    }

    let isMounted = true;
    let intervalId: any;
    let attempts = 0;

    async function pollLookup() {
      attempts++;
      try {
        const res = await fetch(`/api/products/order-lookup?orderId=${orderId}`);
        if (!res.ok) {
          if (attempts > 15 && isMounted) {
            setStatus("failed");
            clearInterval(intervalId);
          }
          return;
        }
        const data = await res.json();
        if (!isMounted) return;

        setOrder({
          productName: data.productName,
          productSlug: data.productSlug,
          quantity: data.quantity,
          totalAmount: data.totalAmount,
          currency: data.currency,
        });

        if (data.status === "paid") {
          setStatus("paid");
          clearInterval(intervalId);
        } else if (data.status === "cancelled" || data.status === "refunded") {
          setStatus("failed");
          clearInterval(intervalId);
        } else {
          setStatus("pending");
        }
      } catch (err) {
        console.error("Order lookup error:", err);
      }
    }

    intervalId = setInterval(pollLookup, 2000);
    pollLookup();

    return () => {
      isMounted = false;
      clearInterval(intervalId);
    };
  }, [orderId]);

  const formattedAmount = order.totalAmount !== null
    ? Number(order.totalAmount).toLocaleString("en-US", {
        style: "currency",
        currency: order.currency?.toUpperCase() || "USD",
      })
    : null;

  if (status === "loading" || status === "pending") {
    return (
      <div className="w-full max-w-md mx-auto rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-xl">
        <Loader2 className="mx-auto h-12 w-12 text-orange-400 animate-spin mb-4" />
        <h1 className="text-xl font-bold text-zinc-900">Confirming your order...</h1>
        <p className="mt-2 text-sm text-zinc-500">
          This usually takes a few seconds. Please don&apos;t close this page.
        </p>
      </div>
    );
  }

  if (status === "failed") {
    return (
      <div className="w-full max-w-md mx-auto rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-xl">
        <h1 className="text-xl font-bold text-zinc-900">We couldn&apos;t confirm this order</h1>
        <p className="mt-2 text-sm text-zinc-500">
          If you completed payment, check your email for a receipt, or contact support with your order reference.
        </p>
        <Link
          href="/products"
          className="mt-8 inline-flex items-center justify-center w-full rounded-2xl bg-zinc-900 py-3.5 text-sm font-black text-white hover:bg-zinc-800 transition"
        >
          Back to Shop
        </Link>
      </div>
    );
  }

  return (
    <div className="w-full max-w-md mx-auto rounded-3xl border border-zinc-200 bg-white p-10 text-center shadow-2xl relative overflow-hidden">
      <div className="absolute top-0 left-0 right-0 h-2 bg-orange-500" />

      <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-orange-100 mb-6">
        <CheckCircle2 className="h-10 w-10 text-orange-500" />
      </div>

      <h1 className="text-3xl font-black text-zinc-900">Order Confirmed!</h1>
      <p className="mt-3 text-sm text-zinc-500 leading-relaxed">
        {order.productName
          ? `Thanks for your order of "${order.productName}". A confirmation email has been sent.`
          : "Thanks for your order. A confirmation email has been sent."}
      </p>

      {(order.quantity || formattedAmount) && (
        <div className="mt-6 rounded-2xl bg-zinc-50 border border-zinc-200/50 p-4 text-left space-y-2">
          {order.quantity && (
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-zinc-400 uppercase">Quantity</span>
              <span className="font-black text-zinc-700">{order.quantity}</span>
            </div>
          )}
          {formattedAmount && (
            <div className="flex justify-between text-xs">
              <span className="font-semibold text-zinc-400 uppercase">Total</span>
              <span className="font-black text-zinc-700">{formattedAmount}</span>
            </div>
          )}
        </div>
      )}

      <hr className="my-8 border-zinc-100" />

      <div className="space-y-4">
        {order.productSlug && (
          <Link
            href={`/products/${order.productSlug}`}
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
    </div>
  );
}

export default function OrderConfirmationPage() {
  return (
    <main className="flex min-h-screen items-center justify-center bg-zinc-50 px-4 py-12">
      <Suspense fallback={
        <div className="flex flex-col items-center justify-center text-center">
          <Loader2 className="h-12 w-12 text-zinc-400 animate-spin mb-4" />
          <h1 className="text-xl font-bold text-zinc-900">Loading details...</h1>
        </div>
      }>
        <OrderConfirmationContent />
      </Suspense>
    </main>
  );
}
