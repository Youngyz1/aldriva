import React from "react";
import Link from "next/link";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import {
  IconCar,
  IconCalendar,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconShieldCheck,
  IconBuildingStore,
  IconMapPin,
  IconPhone,
  IconArrowLeft,
} from "@tabler/icons-react";
import { getRentalBookingByToken } from "@/lib/actions/rental-bookings";
import { getRentalPayInfo } from "@/lib/rental/checkout";
import { getRentalReceiptData } from "@/lib/rental/receipt-data";
import { startRentalPayment } from "@/lib/actions/rental-pay";
import RentalAutoRefresh from "@/components/RentalAutoRefresh";
import { RentalReceiptPanel } from "@/components/rental/RentalReceiptPanel";
import { formatMoney } from "@/lib/money";

// Prevent search engines from indexing or following links on this page.
// The token is a secret reference — we don't want it in search results.
export const metadata: Metadata = {
  robots: { index: false, follow: false },
};

interface PageProps {
  params: Promise<{ token: string }>;
  searchParams: Promise<{ paid?: string; cancelled?: string; pay?: string }>;
}

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    return d.toLocaleString("en-US", {
      weekday: "short",
      month: "short",
      day: "numeric",
      year: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  } catch {
    return iso;
  }
}

function getStatusBadge(status: string) {
  switch (status) {
    case "confirmed":
      return {
        label: "Confirmed",
        bg: "bg-emerald-50 text-emerald-700 border-emerald-200",
        icon: IconCheck,
        description: "Your reservation is confirmed. See you at pickup!",
      };
    case "active":
      return {
        label: "Active Rental",
        bg: "bg-blue-50 text-blue-700 border-blue-200",
        icon: IconCar,
        description: "Rental is in progress. Drive safely!",
      };
    case "completed":
      return {
        label: "Completed",
        bg: "bg-zinc-100 text-zinc-700 border-zinc-200",
        icon: IconCheck,
        description: "This rental has concluded. Thank you!",
      };
    case "cancelled":
      return {
        label: "Cancelled",
        bg: "bg-red-50 text-red-700 border-red-200",
        icon: IconAlertCircle,
        description: "This booking was cancelled.",
      };
    case "expired":
      return {
        label: "Expired",
        bg: "bg-zinc-100 text-zinc-600 border-zinc-200",
        icon: IconClock,
        description: "This booking hold has expired.",
      };
    case "awaiting_payment":
      return {
        label: "Payment Needed",
        bg: "bg-orange-50 text-orange-700 border-orange-200",
        icon: IconClock,
        description: "The host approved your request. Your booking is confirmed once payment is received.",
      };
    case "pending":
    default:
      return {
        label: "Pending Confirmation",
        bg: "bg-amber-50 text-amber-700 border-amber-200",
        icon: IconClock,
        description: "Awaiting host confirmation. You will receive an update once reviewed.",
      };
  }
}

export default async function RentalLookupPage({ params, searchParams }: PageProps) {
  const { token } = await params;
  const { paid, cancelled, pay } = await searchParams;

  if (!token) notFound();

  const res = await getRentalBookingByToken(token);
  if (!res.success || !res.data) {
    return (
      <main className="min-h-screen bg-zinc-50 flex items-center justify-center p-4">
        <div className="w-full max-w-md bg-white rounded-2xl border border-zinc-200 p-6 sm:p-8 text-center space-y-4">
          <div className="w-12 h-12 rounded-full bg-red-50 text-red-600 flex items-center justify-center mx-auto">
            <IconAlertCircle className="w-6 h-6" />
          </div>
          <h1 className="text-xl font-bold text-zinc-900">Booking Not Found</h1>
          <p className="text-sm text-zinc-600">
            We couldn&apos;t find a rental reservation matching this lookup token. Please check the link or contact customer support.
          </p>
          <Link
            href="/"
            className="inline-block px-5 py-2.5 rounded-xl bg-zinc-900 text-white font-medium text-sm hover:bg-zinc-800 transition"
          >
            Return Home
          </Link>
        </div>
      </main>
    );
  }

  const booking = res.data;
  const statusInfo = getStatusBadge(booking.status);
  const StatusIcon = statusInfo.icon;
  const currency = (booking.snapshot_currency || "USD").toUpperCase();
  const payInfo = await getRentalPayInfo(token);
  const receiptData = await getRentalReceiptData(token);

  const businessSlug = booking.business_slug;
  const businessName = booking.business_name;

  return (
    <div className="min-h-screen bg-zinc-50">
      <header className="border-b border-zinc-200 bg-white">
        <div className="mx-auto max-w-2xl px-4 sm:px-6 py-3 flex items-center justify-between gap-3">
          {businessSlug ? (
            <Link
              href={`/site/${businessSlug}`}
              className="inline-flex items-center gap-1.5 text-sm font-medium text-zinc-700 hover:text-zinc-900"
            >
              <IconArrowLeft className="w-4 h-4" />
              Back to {businessName || "business"}
            </Link>
          ) : (
            <div className="text-sm font-medium text-zinc-900">
              {businessName || "Rental booking"}
            </div>
          )}
          {businessName && !businessSlug && (
            <div className="text-sm text-zinc-500">{businessName}</div>
          )}
        </div>
      </header>
      <main className="py-6 sm:py-8 px-4 sm:px-6">
        <div className="max-w-2xl mx-auto space-y-6">
        {/* Alerts for Stripe return */}
        {paid === "true" && receiptData && (
          <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-emerald-900 flex items-start gap-3">
            <IconCheck className="w-5 h-5 text-emerald-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">
                {receiptData.balanceDue > 0 ? "Payment received" : "Payment successful"}
              </p>
              <p className="text-emerald-700 mt-0.5">
                Thank you! Your rental payment has been received and verified.
              </p>
            </div>
          </div>
        )}

        {paid === "true" && !receiptData && (
          <div className="rounded-xl border border-blue-200 bg-blue-50 p-4 text-blue-900 text-sm">
            <p className="font-semibold">Payment processing</p>
            <RentalAutoRefresh />
            <p className="mt-0.5 text-blue-800">We are waiting for the payment confirmation. Refresh this page in a moment.</p>
          </div>
        )}

        {pay && paid !== "true" && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-red-900 text-sm">
            <p className="font-semibold">Payment could not be started</p>
            <p className="mt-0.5 text-red-800">
              {pay === "window_closing"
                ? "The payment window is closing, so a new payment session cannot be started. Please contact the host."
                : pay === "not_payable"
                ? "This booking cannot be paid online right now. It may have expired or already been paid."
                : "We could not start the payment. Please try again in a moment."}
            </p>
          </div>
        )}

        {cancelled === "true" && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-amber-900 flex items-start gap-3">
            <IconAlertCircle className="w-5 h-5 text-amber-600 shrink-0 mt-0.5" />
            <div className="text-sm">
              <p className="font-semibold">Checkout Incomplete</p>
              <p className="text-amber-700 mt-0.5">
                You cancelled the checkout process. Your reservation will remain on temporary hold until it expires.
              </p>
            </div>
          </div>
        )}

        {payInfo && payInfo.payable && paid !== "true" && (
          <div className="rounded-xl border border-orange-200 bg-orange-50 p-4 space-y-3">
            <div className="text-sm text-orange-900">
              <p className="font-semibold">Payment needed</p>
              <p className="mt-0.5 text-orange-800">
                Pay {payInfo.amountLabel} online to confirm your booking.
                {payInfo.deadlineLabel ? " Pay before " + payInfo.deadlineLabel + "." : ""}
              </p>
            </div>
            <form action={startRentalPayment}>
              <input type="hidden" name="token" value={token} />
              <button type="submit" className="px-5 py-2.5 rounded-xl bg-zinc-900 text-white font-medium text-sm hover:bg-zinc-800 transition">
                Pay now
              </button>
            </form>
          </div>
        )}

        {receiptData && <RentalReceiptPanel data={receiptData} token={token} businessSlug={booking.business_slug} />}

        {/* Main Card */}
        <div className="bg-white rounded-2xl border border-zinc-200 overflow-hidden shadow-sm">
          {/* Header */}
          <div className="border-b border-zinc-100 p-6 sm:p-8 bg-zinc-50/50">
            <div className="flex items-center justify-between gap-4 flex-wrap">
              <div>
                <span className="text-xs font-semibold tracking-wider uppercase text-zinc-500">
                  Rental Reservation
                </span>
                <h1 className="text-2xl font-bold text-zinc-900 font-mono tracking-tight mt-0.5">
                  #{booking.booking_number}
                </h1>
              </div>
              <div
                className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border ${statusInfo.bg}`}
              >
                <StatusIcon className="w-3.5 h-3.5" />
                <span>{statusInfo.label}</span>
              </div>
            </div>
            <p className="text-sm text-zinc-600 mt-3">{statusInfo.description}</p>
          </div>

          {/* Details Body */}
          <div className="p-6 sm:p-8 space-y-6">
            {/* Business & Branch Info */}
            {(booking.business_name || booking.pickup_branch_label) && (
              <div className="space-y-2">
                <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                  Rental Host
                </h2>
                <div className="text-sm text-zinc-700 bg-zinc-50 rounded-xl p-3 border border-zinc-100 space-y-1.5">
                  {booking.business_name && (
                    <p className="font-semibold text-zinc-900 flex items-center gap-1.5">
                      <IconBuildingStore className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      {booking.business_name}
                    </p>
                  )}
                  {booking.pickup_branch_label && (
                    <p className="flex items-start gap-1.5 text-zinc-600">
                      <IconMapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-medium">Pickup:</span>{" "}
                        {booking.pickup_branch_label}
                        {booking.pickup_branch_address && (
                          <span className="text-zinc-400"> · {booking.pickup_branch_address}</span>
                        )}
                      </span>
                    </p>
                  )}
                  {booking.pickup_branch_phone && (
                    <p className="flex items-center gap-1.5 text-zinc-600">
                      <IconPhone className="w-3.5 h-3.5 text-zinc-400 shrink-0" />
                      <a href={`tel:${booking.pickup_branch_phone}`} className="hover:underline">
                        {booking.pickup_branch_phone}
                      </a>
                    </p>
                  )}
                  {booking.return_branch_label && booking.return_branch_label !== booking.pickup_branch_label && (
                    <p className="flex items-start gap-1.5 text-zinc-600">
                      <IconMapPin className="w-3.5 h-3.5 text-zinc-400 shrink-0 mt-0.5" />
                      <span>
                        <span className="font-medium">Return:</span>{" "}
                        {booking.return_branch_label}
                        {booking.return_branch_address && (
                          <span className="text-zinc-400"> · {booking.return_branch_address}</span>
                        )}
                      </span>
                    </p>
                  )}
                </div>
              </div>
            )}
            {/* Primary Schedule */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 bg-zinc-50 rounded-xl p-4 border border-zinc-100">
              <div className="space-y-1">
                <span className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                  <IconCalendar className="w-3.5 h-3.5" /> Pickup
                </span>
                <p className="text-sm font-semibold text-zinc-900">
                  {formatDate(booking.starts_at)}
                </p>
              </div>
              <div className="space-y-1">
                <span className="text-xs font-medium text-zinc-500 flex items-center gap-1.5">
                  <IconCalendar className="w-3.5 h-3.5" /> Return
                </span>
                <p className="text-sm font-semibold text-zinc-900">
                  {formatDate(booking.ends_at)}
                </p>
              </div>
            </div>

            {/* Financial Overview */}
            <div className="space-y-3">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Financial Summary
              </h2>
              <div className="space-y-2 text-sm">
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-600">Rental Charge</span>
                  <span className="font-semibold text-zinc-900">
                    {formatMoney(booking.rental_amount, currency)}
                  </span>
                </div>
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <span className="text-zinc-600">Rental Payment Status</span>
                  <span
                    className={`font-medium capitalize ${
                      booking.payment_status === "paid" ? "text-emerald-600" : "text-amber-600"
                    }`}
                  >
                    {booking.payment_status}
                  </span>
                </div>
                {(booking.late_fee_amount > 0 || booking.late_fee_status !== "none") && (
                  <div className="flex justify-between py-1 border-b border-zinc-100">
                    <span className="text-zinc-600">Late fee</span>
                    <div className="text-right">
                      <span className="font-medium text-zinc-900">{formatMoney(booking.late_fee_amount, currency)}</span>
                      <p className="text-[11px] text-zinc-500 capitalize">{String(booking.late_fee_status).replace(/_/g, " ")}</p>
                    </div>
                  </div>
                )}
                <div className="flex justify-between py-1 border-b border-zinc-100">
                  <div>
                    <span className="text-zinc-600">Security Deposit</span>
                    <p className="text-[11px] text-zinc-400">
                      Collected separately from rental payment
                    </p>
                  </div>
                  <div className="text-right">
                    <span className="font-medium text-zinc-900">
                      {formatMoney(booking.deposit_required_amount, currency)}
                    </span>
                    <p className="text-[11px] text-zinc-500 capitalize">
                      Status: {booking.deposit_status.replace(/_/g, " ")}
                    </p>
                    {booking.deposit_retained_amount > 0 && (
                      <p className="text-[11px] text-zinc-500">Retained: {formatMoney(booking.deposit_retained_amount, currency)}</p>
                    )}
                    {booking.deposit_retention_reason && (
                      <p className="text-[11px] text-zinc-500">Reason: {booking.deposit_retention_reason}</p>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Customer Reference */}
            <div className="space-y-2">
              <h2 className="text-xs font-semibold text-zinc-400 uppercase tracking-wider">
                Driver & Host Information
              </h2>
              <div className="text-sm text-zinc-700 bg-zinc-50 rounded-xl p-3 border border-zinc-100 space-y-1">
                <p>
                  <span className="text-zinc-400">Primary Driver:</span>{" "}
                  <strong className="text-zinc-900">{booking.customer_name}</strong>
                </p>
                <p className="text-xs text-zinc-500 flex items-center gap-1.5 pt-1">
                  <IconBuildingStore className="w-3.5 h-3.5 text-zinc-400" />
                  Please present your valid driver&apos;s license upon arrival at the branch.
                </p>
              </div>
            </div>

            {/* Privacy notice */}
            <div className="rounded-xl bg-blue-50/60 border border-blue-100 p-4 text-xs text-blue-800 flex items-start gap-2.5">
              <IconShieldCheck className="w-4 h-4 text-blue-600 shrink-0 mt-0.5" />
              <p>
                <strong>Privacy Guaranteed:</strong> For your security, sensitive identity numbers,
                date of birth, internal vehicle IDs, and license plates are never displayed on public links.
              </p>
            </div>
            <div className="pt-2">
              <a
                href={`/api/rentals/agreement/token/${encodeURIComponent(token)}`}
                className="inline-flex min-h-11 w-full items-center justify-center rounded-xl border border-zinc-300 bg-white px-5 text-sm font-semibold text-zinc-800 hover:bg-zinc-50"
              >
                Download rental agreement (PDF)
              </a>
            </div>
          </div>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-zinc-400">
          Need assistance with your booking? Contact host support or visit your branch.
        </p>
        {(businessSlug || businessName) && (
          <div className="text-center">
            <Link
              href={businessSlug ? `/site/${businessSlug}` : "#"}
              className="inline-flex items-center gap-1.5 text-xs font-medium text-zinc-600 hover:text-zinc-900"
            >
              <IconArrowLeft className="w-3.5 h-3.5" />
              Back to {businessName || "business"}
            </Link>
          </div>
        )}
      </div>
    </main>
    </div>
  );
}
