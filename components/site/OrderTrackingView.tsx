"use client";

import { useEffect, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import {
  Clock,
  CheckCircle2,
  Bike,
  Store,
  Phone,
  XCircle,
  RotateCw,
  ArrowLeft,
} from "lucide-react";
import { formatCurrency } from "@/lib/format-locale";
import type { Locale } from "@/i18n/routing";
import type { DashboardOrderItem } from "@/components/dashboard/orders/OrderCard";

export interface OrderTrackingData {
  orderNumber: string;
  businessName: string;
  businessPhone: string | null;
  siteSlug: string;
  status: string;
  fulfilmentType: "pickup" | "delivery" | string;
  deliveryAddress: string | null;
  customerNote: string | null;
  currency: string;
  subtotal: number;
  deliveryFee: number;
  totalAmount: number;
  paymentMethod: string;
  paymentStatus: string;
  scheduledFor: string | null;
  estimatedReadyAt: string | null;
  cancellationReason: string | null;
  riderName?: string | null;
  riderPhone?: string | null;
  statusHistory: Array<{
    status: string;
    at: string;
    reason?: string | null;
    note?: string | null;
    estimated_ready_at?: string | null;
  }>;
  items: DashboardOrderItem[];
  createdAt: string;
  maskedCustomerName: string;
  maskedCustomerPhone: string;
}

interface OrderTrackingViewProps {
  order: OrderTrackingData;
}

const PICKUP_STEPS = [
  { key: "pending", labelKey: "timelineReceived" },
  { key: "accepted", labelKey: "timelineAccepted" },
  { key: "preparing", labelKey: "timelinePreparing" },
  { key: "ready", labelKey: "timelineReady" },
  { key: "completed", labelKey: "timelineCompleted" },
] as const;

const DELIVERY_STEPS = [
  { key: "pending", labelKey: "timelineReceived" },
  { key: "accepted", labelKey: "timelineAccepted" },
  { key: "preparing", labelKey: "timelinePreparing" },
  { key: "ready", labelKey: "timelineReady" },
  { key: "out_for_delivery", labelKey: "timelineOutForDelivery" },
  { key: "delivered", labelKey: "timelineDelivered" },
] as const;

export function OrderTrackingView({ order }: OrderTrackingViewProps) {
  const t = useTranslations("Orders");
  const locale = useLocale() as Locale;
  const router = useRouter();
  const [isRefreshing, startTransition] = useTransition();

  // 30s auto-refresh
  useEffect(() => {
    const interval = setInterval(() => {
      if (typeof document !== "undefined" && document.visibilityState === "visible") {
        startTransition(() => {
          router.refresh();
        });
      }
    }, 30000);

    return () => clearInterval(interval);
  }, [router]);

  const handleManualRefresh = () => {
    startTransition(() => {
      router.refresh();
    });
  };

  const isCancelled = order.status === "cancelled";
  const isTerminal = ["completed", "delivered", "cancelled"].includes(order.status);
  const isOutForDelivery = order.status === "out_for_delivery";

  // Hide the "Estimated ready at" banner when completed, delivered, cancelled, or out_for_delivery
  const showEstimatedReadyBanner = Boolean(order.estimatedReadyAt) && !isTerminal && !isOutForDelivery;

  // Keep the "Scheduled for" banner only while still pending, accepted, preparing, or ready
  const showScheduledBanner = Boolean(order.scheduledFor) && ["pending", "accepted", "preparing", "ready"].includes(order.status);

  // Stepper steps based on fulfilment type
  const isDelivery = order.fulfilmentType === "delivery";
  const activeSteps = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const stepIndex = activeSteps.findIndex((s) => s.key === order.status);
  const currentStep = stepIndex >= 0 ? stepIndex : 0;

  const totalFormatted = formatCurrency(order.totalAmount, order.currency, locale);
  const subtotalFormatted = formatCurrency(order.subtotal, order.currency, locale);
  const deliveryFeeFormatted = formatCurrency(order.deliveryFee, order.currency, locale);

  const cleanBusinessPhone = order.businessPhone
    ? order.businessPhone.replace(/[^\d+]/g, "")
    : null;

  const cleanRiderPhone = order.riderPhone
    ? order.riderPhone.replace(/[^\d+]/g, "")
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 py-8 px-4 sm:px-6">
      <div className="max-w-2xl mx-auto space-y-6">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <a
            href={`/site/${order.siteSlug}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900 transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{order.businessName}</span>
          </a>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl border border-zinc-200 bg-white text-xs font-medium text-zinc-700 hover:bg-zinc-50 shadow-xs disabled:opacity-50 transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 text-zinc-500 ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{t("refresh")}</span>
          </button>
        </div>

        {/* Order Card Container */}
        <div className="rounded-2xl border border-zinc-200 bg-white shadow-xs overflow-hidden">
          {/* Hero Banner */}
          <div className="p-6 border-b border-zinc-100 bg-linear-to-b from-zinc-50/50 to-white">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-zinc-400">
                  {t("trackingPageTitle")}
                </p>
                <h1 className="text-2xl font-black text-zinc-900 mt-0.5 tracking-tight">
                  {order.orderNumber}
                </h1>
                <p className="text-xs text-zinc-500 mt-1">
                  {new Date(order.createdAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-semibold border bg-zinc-100 text-zinc-700 border-zinc-200 capitalize">
                  {order.fulfilmentType === "delivery" ? (
                    <Bike className="w-3.5 h-3.5 text-zinc-500" />
                  ) : (
                    <Store className="w-3.5 h-3.5 text-zinc-500" />
                  )}
                  {order.fulfilmentType}
                </span>

                <span
                  className={`inline-flex items-center px-3 py-1 rounded-full text-xs font-semibold border ${
                    order.paymentStatus === "paid"
                      ? "bg-emerald-50 text-emerald-700 border-emerald-200"
                      : "bg-amber-50 text-amber-700 border-amber-200"
                  }`}
                >
                  {order.paymentStatus === "paid"
                    ? t("paid")
                    : order.paymentMethod === "online"
                    ? t("awaitingPayment")
                    : order.fulfilmentType === "delivery"
                    ? t("payOnDelivery")
                    : t("payOnPickup")}
                </span>
              </div>
            </div>

            {/* Promised Time / Scheduled Banner */}
            {isCancelled ? (
              <div className="mt-5 rounded-xl border border-red-200 bg-red-50 p-4">
                <div className="flex items-start gap-3">
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-0.5" />
                  <div>
                    <h3 className="text-sm font-bold text-red-900">{t("timelineCancelled")}</h3>
                    <p className="text-xs text-red-800 mt-0.5">
                      {order.cancellationReason
                        ? t(
                            `reason${order.cancellationReason
                              .split("_")
                              .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                              .join("")}` as any
                          )
                        : t("timelineCancelled")}
                    </p>
                  </div>
                </div>
              </div>
            ) : showEstimatedReadyBanner ? (
              <div className="mt-5 rounded-xl border border-orange-200 bg-orange-50/80 p-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-orange-600 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-orange-800">{t("estimatedReadyTime")}</p>
                    <p className="text-base font-extrabold text-orange-950 mt-0.5">
                      {new Date(order.estimatedReadyAt!).toLocaleTimeString(
                        locale === "fr" ? "fr-FR" : "en-US",
                        { hour: "2-digit", minute: "2-digit" }
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : showScheduledBanner ? (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/80 p-4">
                <div className="flex items-center gap-3">
                  <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-blue-800">{t("scheduledFor")}</p>
                    <p className="text-sm font-bold text-blue-950 mt-0.5">
                      {new Date(order.scheduledFor!).toLocaleString(
                        locale === "fr" ? "fr-FR" : "en-US",
                        {
                          weekday: "short",
                          month: "short",
                          day: "numeric",
                          hour: "2-digit",
                          minute: "2-digit",
                        }
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : null}

            {/* Rider Details Card (Visible only during out_for_delivery) */}
            {isOutForDelivery && order.riderName && (
              <div className="mt-5 rounded-xl border border-blue-200 bg-blue-50/90 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Bike className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-blue-800">
                        {locale === "fr" ? "Coursier assigné" : "Assigned Rider"}
                      </p>
                      <p className="text-sm font-bold text-blue-950 truncate mt-0.5">
                        {order.riderName.split(/\s+/)[0] || order.riderName}
                      </p>
                    </div>
                  </div>

                  {cleanRiderPhone && (
                    <a
                      href={`tel:${cleanRiderPhone}`}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-blue-600 text-white text-xs font-bold hover:bg-blue-700 shadow-xs transition-colors shrink-0"
                    >
                      <Phone className="w-3.5 h-3.5" />
                      <span>{locale === "fr" ? "Appeler coursier" : "Call rider"}</span>
                    </a>
                  )}
                </div>
              </div>
            )}
          </div>

          {/* Stepper Progress (if not cancelled) */}
          {!isCancelled && (
            <div className="p-6 border-b border-zinc-100">
              <div className="relative">
                <div className="space-y-6">
                  {activeSteps.map((step, idx) => {
                    const isPassed = currentStep > idx;
                    const isCurrent = currentStep === idx;

                    return (
                      <div key={step.key} className="flex items-start gap-4 relative">
                        {idx < activeSteps.length - 1 && (
                          <div
                            className={`absolute left-3.5 top-7 bottom-0 w-0.5 -mb-6 ${
                              isPassed ? "bg-orange-600" : "bg-zinc-200"
                            }`}
                            aria-hidden="true"
                          />
                        )}

                        <div
                          className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 z-10 transition-colors ${
                            isPassed
                              ? "bg-orange-600 text-white"
                              : isCurrent
                              ? "bg-orange-600 text-white ring-4 ring-orange-100"
                              : "bg-zinc-100 text-zinc-400 border border-zinc-200"
                          }`}
                        >
                          {isPassed ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>

                        <div className="pt-0.5 min-w-0 flex-1">
                          <p
                            className={`text-sm font-bold ${
                              isCurrent
                                ? "text-orange-950 font-black"
                                : isPassed
                                ? "text-zinc-900"
                                : "text-zinc-400"
                            }`}
                          >
                            {t(step.labelKey)}
                          </p>
                          {isCurrent && (
                            <p className="text-xs text-orange-700 mt-0.5 font-medium">
                              {step.key === "pending"
                                ? "Awaiting review from the business"
                                : step.key === "accepted"
                                ? "Order confirmed and in queue"
                                : step.key === "preparing"
                                ? "Your order is being freshly prepared"
                                : step.key === "ready"
                                ? order.fulfilmentType === "delivery"
                                  ? "Order is ready for rider pickup"
                                  : "Order is ready for collection!"
                                : step.key === "out_for_delivery"
                                ? "Your rider is on the way with your order"
                                : step.key === "delivered"
                                ? "Order delivered. Enjoy your meal!"
                                : "Order completed. Thank you!"}
                            </p>
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>
          )}

          {/* Customer & Fulfilment Details (Masked PII) */}
          <div className="p-6 border-b border-zinc-100 bg-zinc-50/50">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">
              {t("customer")} & {t("fulfilment")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs">
              <div>
                <p className="text-zinc-500 font-medium">Customer</p>
                <p className="font-semibold text-zinc-900 mt-0.5">{order.maskedCustomerName}</p>
                <p className="text-zinc-600 font-mono mt-0.5">{order.maskedCustomerPhone}</p>
              </div>

              <div>
                <p className="text-zinc-500 font-medium">
                  {order.fulfilmentType === "delivery" ? t("address") : t("fulfilment")}
                </p>
                {order.fulfilmentType === "delivery" && order.deliveryAddress ? (
                  <p className="font-semibold text-zinc-900 mt-0.5">{order.deliveryAddress}</p>
                ) : (
                  <p className="font-semibold text-zinc-900 mt-0.5 capitalize">
                    {order.fulfilmentType}
                  </p>
                )}
              </div>

              {order.customerNote && (
                <div className="sm:col-span-2">
                  <p className="text-zinc-500 font-medium">{t("note")}</p>
                  <p className="text-zinc-700 italic mt-0.5">&ldquo;{order.customerNote}&rdquo;</p>
                </div>
              )}
            </div>
          </div>

          {/* Items breakdown */}
          <div className="p-6 space-y-4">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400">
              {t("items")}
            </h2>

            <ul className="divide-y divide-zinc-100">
              {order.items.map((item, idx) => (
                <li key={idx} className="py-2.5 flex items-start justify-between text-xs">
                  <div>
                    <p className="font-bold text-zinc-900">
                      {item.quantity} × {item.name}
                    </p>
                    {item.chosen_options && item.chosen_options.length > 0 && (
                      <p className="text-zinc-500 mt-0.5">
                        {item.chosen_options.map((o) => o.name).join(", ")}
                      </p>
                    )}
                  </div>
                  <p className="font-semibold text-zinc-800 tabular-nums ml-4">
                    {formatCurrency(item.line_total, order.currency, locale)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="border-t border-zinc-100 pt-3 space-y-1.5 text-xs">
              <div className="flex justify-between text-zinc-500">
                <span>{locale === "fr" ? "Sous-total" : "Subtotal"}</span>
                <span className="font-semibold text-zinc-800 tabular-nums">
                  {subtotalFormatted}
                </span>
              </div>

              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-zinc-500">
                  <span>{locale === "fr" ? "Frais de livraison" : "Delivery fee"}</span>
                  <span className="font-semibold text-zinc-800 tabular-nums">
                    {deliveryFeeFormatted}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-zinc-500 pt-1.5 border-t border-zinc-100">
                <span>{t("total")}</span>
                <span className="font-bold text-zinc-900 text-sm tabular-nums">
                  {totalFormatted}
                </span>
              </div>
            </div>
          </div>

          {/* Need help footer with business contact */}
          {cleanBusinessPhone && (
            <div className="p-6 border-t border-zinc-100 bg-zinc-50/50 flex flex-col sm:flex-row items-center justify-between gap-3">
              <div className="text-center sm:text-left">
                <p className="text-xs font-bold text-zinc-800">Questions about your order?</p>
                <p className="text-xs text-zinc-500">Contact {order.businessName} directly</p>
              </div>

              <a
                href={`tel:${cleanBusinessPhone}`}
                className="inline-flex items-center gap-2 px-4 py-2 rounded-xl bg-zinc-900 text-white text-xs font-bold hover:bg-zinc-800 shadow-xs transition-colors"
              >
                <Phone className="w-3.5 h-3.5" />
                <span>{t("callBusiness")}</span>
              </a>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
