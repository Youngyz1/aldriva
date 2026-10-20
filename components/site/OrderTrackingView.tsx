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
import { formatMoney } from "@/lib/money";
import type { Locale } from "@/i18n/routing";
import type { DashboardOrderItem } from "@/components/dashboard/orders/OrderCard";
import { formatChosenMenuOption } from "@/lib/order-option-display";

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

  const totalFormatted = formatMoney(order.totalAmount, order.currency, locale);
  const subtotalFormatted = formatMoney(order.subtotal, order.currency, locale);
  const deliveryFeeFormatted = formatMoney(order.deliveryFee, order.currency, locale);

  const cleanBusinessPhone = order.businessPhone
    ? order.businessPhone.replace(/[^\d+]/g, "")
    : null;

  const cleanRiderPhone = order.riderPhone
    ? order.riderPhone.replace(/[^\d+]/g, "")
    : null;

  return (
    <div className="public-site min-h-screen bg-[var(--ps-neutral)] py-[var(--ps-space-8)] px-[var(--ps-space-4)] sm:px-[var(--ps-space-6)]">
      <div className="max-w-2xl mx-auto space-y-[var(--ps-space-6)]">
        {/* Navigation & Header */}
        <div className="flex items-center justify-between">
          <a
            href={`/site/${order.siteSlug}`}
            className="inline-flex items-center gap-[var(--ps-space-2)] text-xs font-semibold text-[var(--ps-muted)] hover:text-[var(--ps-text)] transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{order.businessName}</span>
          </a>

          <button
            type="button"
            onClick={handleManualRefresh}
            disabled={isRefreshing}
            className="ps-button ps-button-secondary inline-flex items-center gap-[var(--ps-space-2)] text-xs font-medium shadow-xs disabled:opacity-50 transition-colors"
          >
            <RotateCw className={`w-3.5 h-3.5 text-[var(--ps-muted)] ${isRefreshing ? "animate-spin" : ""}`} />
            <span>{t("refresh")}</span>
          </button>
        </div>

        {/* Order Card Container */}
        <div className="rounded-2xl border border-[var(--ps-border)] bg-[var(--ps-surface)] shadow-xs overflow-hidden">
          {/* Hero Banner */}
          <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)] bg-linear-to-b from-[var(--ps-neutral)]/50 to-[var(--ps-surface)]">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-[var(--ps-space-3)]">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wider text-[var(--ps-muted)]">
                  {t("trackingPageTitle")}
                </p>
                <h1 className="text-2xl font-black text-[var(--ps-text)] mt-[var(--ps-space-1)] tracking-tight">
                  {order.orderNumber}
                </h1>
                <p className="text-xs text-[var(--ps-muted)] mt-[var(--ps-space-1)]">
                  {new Date(order.createdAt).toLocaleDateString(locale === "fr" ? "fr-FR" : "en-US", {
                    weekday: "short",
                    month: "short",
                    day: "numeric",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-[var(--ps-space-2)]">
                <span className="inline-flex items-center gap-[var(--ps-space-2)] px-[var(--ps-space-3)] py-[var(--ps-space-1)] rounded-full text-xs font-semibold border bg-[var(--ps-neutral)] text-[var(--ps-muted)] border-[var(--ps-border)] capitalize">
                  {order.fulfilmentType === "delivery" ? (
                    <Bike className="w-3.5 h-3.5 text-[var(--ps-muted)]" />
                  ) : (
                    <Store className="w-3.5 h-3.5 text-[var(--ps-muted)]" />
                  )}
                  {order.fulfilmentType}
                </span>

                <span
                  className={`inline-flex items-center px-[var(--ps-space-3)] py-[var(--ps-space-1)] rounded-full text-xs font-semibold border ${
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
              <div className="mt-[var(--ps-space-6)] rounded-xl border border-red-200 bg-red-50 p-[var(--ps-space-4)]">
                <div className="flex items-start gap-[var(--ps-space-3)]">
                  <XCircle className="w-5 h-5 text-red-600 shrink-0 mt-[var(--ps-space-1)]" />
                  <div>
                    <h3 className="text-sm font-bold text-red-900">{t("timelineCancelled")}</h3>
                    <p className="text-xs text-red-800 mt-[var(--ps-space-1)]">
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
              <div className="mt-[var(--ps-space-6)] rounded-xl border border-[var(--ps-accent-light)] bg-[var(--ps-accent-light)]/80 p-[var(--ps-space-4)]">
                <div className="flex items-center gap-[var(--ps-space-3)]">
                  <Clock className="w-5 h-5 text-[var(--ps-accent-hover)] shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-[var(--ps-accent-hover)]">{t("estimatedReadyTime")}</p>
                    <p className="text-base font-extrabold text-[var(--ps-accent-hover)] mt-[var(--ps-space-1)]">
                      {new Date(order.estimatedReadyAt!).toLocaleTimeString(
                        locale === "fr" ? "fr-FR" : "en-US",
                        { hour: "2-digit", minute: "2-digit" }
                      )}
                    </p>
                  </div>
                </div>
              </div>
            ) : showScheduledBanner ? (
              <div className="mt-[var(--ps-space-6)] rounded-xl border border-blue-200 bg-blue-50/80 p-[var(--ps-space-4)]">
                <div className="flex items-center gap-[var(--ps-space-3)]">
                  <Clock className="w-5 h-5 text-blue-600 shrink-0" />
                  <div>
                    <p className="text-xs font-medium text-blue-800">{t("scheduledFor")}</p>
                    <p className="text-sm font-bold text-blue-950 mt-[var(--ps-space-1)]">
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
              <div className="mt-[var(--ps-space-6)] rounded-xl border border-blue-200 bg-blue-50/90 p-[var(--ps-space-4)]">
                <div className="flex items-center justify-between gap-[var(--ps-space-3)]">
                  <div className="flex items-center gap-[var(--ps-space-3)] min-w-0">
                    <div className="w-9 h-9 rounded-full bg-blue-600 text-white flex items-center justify-center shrink-0">
                      <Bike className="w-5 h-5" />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-medium text-blue-800">
                        {locale === "fr" ? "Coursier assigné" : "Assigned Rider"}
                      </p>
                      <p className="text-sm font-bold text-blue-950 truncate mt-[var(--ps-space-1)]">
                        {order.riderName.split(/\s+/)[0] || order.riderName}
                      </p>
                    </div>
                  </div>

                  {cleanRiderPhone && (
                    <a
                      href={`tel:${cleanRiderPhone}`}
                      className="ps-button ps-button-primary inline-flex shrink-0 items-center gap-[var(--ps-space-2)] text-xs font-bold shadow-xs transition-colors"
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
            <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)]">
              <div className="relative">
                <div className="space-y-[var(--ps-space-6)]">
                  {activeSteps.map((step, idx) => {
                    const isPassed = currentStep > idx;
                    const isCurrent = currentStep === idx;

                    return (
                      <div key={step.key} className="flex items-start gap-[var(--ps-space-4)] relative">
                        {idx < activeSteps.length - 1 && (
                          <div
                            className={`absolute left-[var(--ps-space-4)] top-7 bottom-0 w-0.5 -mb-[var(--ps-space-6)] ${
                              isPassed ? "bg-[var(--ps-accent)]" : "bg-[var(--ps-neutral)]"
                            }`}
                            aria-hidden="true"
                          />
                        )}

                        <div
                          className={`flex items-center justify-center w-7 h-7 rounded-full text-xs font-bold shrink-0 z-10 transition-colors ${
                            isPassed
                              ? "bg-[var(--ps-accent)] text-[var(--ps-accent-foreground)]"
                              : isCurrent
                              ? "bg-[var(--ps-accent)] text-[var(--ps-accent-foreground)] ring-4 ring-[var(--ps-accent-hover)]"
                              : "bg-[var(--ps-neutral)] text-[var(--ps-muted)] border border-[var(--ps-border)]"
                          }`}
                        >
                          {isPassed ? (
                            <CheckCircle2 className="w-4 h-4" />
                          ) : (
                            <span>{idx + 1}</span>
                          )}
                        </div>

                        <div className="pt-[var(--ps-space-1)] min-w-0 flex-1">
                          <p
                            className={`text-sm font-bold ${
                              isCurrent
                                ? "text-[var(--ps-accent-hover)] font-black"
                                : isPassed
                                ? "text-[var(--ps-text)]"
                                : "text-[var(--ps-muted)]"
                            }`}
                          >
                            {t(step.labelKey)}
                          </p>
                          {isCurrent && (
                            <p className="text-xs text-[var(--ps-accent-hover)] mt-[var(--ps-space-1)] font-medium">
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
          <div className="p-[var(--ps-space-6)] border-b border-[var(--ps-border)] bg-[var(--ps-neutral)]/50">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ps-muted)] mb-[var(--ps-space-3)]">
              {t("customer")} & {t("fulfilment")}
            </h2>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-[var(--ps-space-4)] text-xs">
              <div>
                <p className="text-[var(--ps-muted)] font-medium">Customer</p>
                <p className="font-semibold text-[var(--ps-text)] mt-[var(--ps-space-1)]">{order.maskedCustomerName}</p>
                <p className="text-[var(--ps-muted)] font-mono mt-[var(--ps-space-1)]">{order.maskedCustomerPhone}</p>
              </div>

              <div>
                <p className="text-[var(--ps-muted)] font-medium">
                  {order.fulfilmentType === "delivery" ? t("address") : t("fulfilment")}
                </p>
                {order.fulfilmentType === "delivery" && order.deliveryAddress ? (
                  <p className="font-semibold text-[var(--ps-text)] mt-[var(--ps-space-1)]">{order.deliveryAddress}</p>
                ) : (
                  <p className="font-semibold text-[var(--ps-text)] mt-[var(--ps-space-1)] capitalize">
                    {order.fulfilmentType}
                  </p>
                )}
              </div>

              {order.customerNote && (
                <div className="sm:col-span-2">
                  <p className="text-[var(--ps-muted)] font-medium">{t("note")}</p>
                  <p className="text-[var(--ps-muted)] italic mt-[var(--ps-space-1)]">&ldquo;{order.customerNote}&rdquo;</p>
                </div>
              )}
            </div>
          </div>

          {/* Items breakdown */}
          <div className="p-[var(--ps-space-6)] space-y-[var(--ps-space-4)]">
            <h2 className="text-xs font-bold uppercase tracking-wider text-[var(--ps-muted)]">
              {t("items")}
            </h2>

            <ul className="divide-y divide-[var(--ps-border)]">
              {order.items.map((item, idx) => (
                <li key={idx} className="py-[var(--ps-space-3)] flex items-start justify-between text-xs">
                  <div>
                    <p className="font-bold text-[var(--ps-text)]">
                      {item.quantity} × {item.name}
                    </p>
                    {item.chosen_options && item.chosen_options.length > 0 && (
                      <p className="text-[var(--ps-muted)] mt-[var(--ps-space-1)]">
                        {item.chosen_options.map(formatChosenMenuOption).join(", ")}
                      </p>
                    )}
                    {item.promotion?.name ? (
                      <p className="mt-[var(--ps-space-1)] text-[11px] font-medium text-emerald-700">
                        {item.promotion.name}{item.promotion.discount_per_unit > 0 ? ` · saved ${formatMoney(item.promotion.discount_per_unit * item.quantity, order.currency, locale)}` : " applied"}
                      </p>
                    ) : null}
                  </div>
                  <p className="font-semibold text-[var(--ps-text)] tabular-nums ml-[var(--ps-space-4)]">
                    {formatMoney(item.line_total, order.currency, locale)}
                  </p>
                </li>
              ))}
            </ul>

            <div className="border-t border-[var(--ps-border)] pt-[var(--ps-space-3)] space-y-[var(--ps-space-2)] text-xs">
              <div className="flex justify-between text-[var(--ps-muted)]">
                <span>{locale === "fr" ? "Sous-total" : "Subtotal"}</span>
                <span className="font-semibold text-[var(--ps-text)] tabular-nums">
                  {subtotalFormatted}
                </span>
              </div>

              {order.deliveryFee > 0 && (
                <div className="flex justify-between text-[var(--ps-muted)]">
                  <span>{locale === "fr" ? "Frais de livraison" : "Delivery fee"}</span>
                  <span className="font-semibold text-[var(--ps-text)] tabular-nums">
                    {deliveryFeeFormatted}
                  </span>
                </div>
              )}

              <div className="flex justify-between text-[var(--ps-muted)] pt-[var(--ps-space-2)] border-t border-[var(--ps-border)]">
                <span>{t("total")}</span>
                <span className="font-bold text-[var(--ps-text)] text-sm tabular-nums">
                  {totalFormatted}
                </span>
              </div>
            </div>
          </div>

          {/* Need help footer with business contact */}
          {cleanBusinessPhone && (
            <div className="p-[var(--ps-space-6)] border-t border-[var(--ps-border)] bg-[var(--ps-neutral)]/50 flex flex-col sm:flex-row items-center justify-between gap-[var(--ps-space-3)]">
              <div className="text-center sm:text-left">
                <p className="text-xs font-bold text-[var(--ps-text)]">Questions about your order?</p>
                <p className="text-xs text-[var(--ps-muted)]">Contact {order.businessName} directly</p>
              </div>

              <a
                href={`tel:${cleanBusinessPhone}`}
                className="ps-button ps-button-secondary inline-flex items-center gap-[var(--ps-space-2)] text-xs font-bold shadow-xs transition-colors"
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
