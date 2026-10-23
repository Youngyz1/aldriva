"use client";

import { useEffect, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTranslations, useLocale } from "next-intl";
import DeliveryMap from "@/components/delivery/DeliveryMap";
import {
  IconClock as Clock,
  IconCircleCheck as CheckCircle2,
  IconBike as Bike,
  IconBuildingStore as Store,
  IconPhone as Phone,
  IconCircleX as XCircle,
  IconRotateClockwise as RotateCw,
  IconArrowLeft as ArrowLeft,
  IconPackage as Package,
  IconMapPin as MapPin,
  IconChefHat as ChefHat,
  IconToolsKitchen2 as Utensils,
  IconCalendarClock as CalendarClock,
  IconStar as Star,
  IconHelpCircle as HelpCircle,
  IconSparkles as Sparkles,
  IconInfoCircle as Info,
} from "@tabler/icons-react";
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
  trackingToken?: string;
  deliveryRating?: number | null;
  deliveryRatingComment?: string | null;
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
  { key: "preparing", labelKey: "timelinePreparing" },
  { key: "ready", labelKey: "timelineReady" },
  { key: "picked_up", labelKey: "timelinePickedUp" },
  { key: "out_for_delivery", labelKey: "timelineOutForDelivery" },
  { key: "delivered", labelKey: "timelineDelivered" },
] as const;

/* ── Step icon mapping ──────────────────────────────────────────────────── */
function StepIcon({ stepKey, className }: { stepKey: string; className?: string }) {
  switch (stepKey) {
    case "pending":
      return <Clock className={className} />;
    case "accepted":
      return <CheckCircle2 className={className} />;
    case "preparing":
      return <ChefHat className={className} />;
    case "ready":
      return <Package className={className} />;
    case "picked_up":
      return <Package className={className} />;
    case "out_for_delivery":
      return <Bike className={className} />;
    case "delivered":
    case "completed":
      return <Utensils className={className} />;
    default:
      return <Clock className={className} />;
  }
}

/* ── Status summary helpers ─────────────────────────────────────────────── */
function getStatusDescription(
  status: string,
  fulfilmentType: string,
  t: (key: string) => string
): string {
  switch (status) {
    case "pending":
      return t("statusDescPending");
    case "accepted":
      return t("statusDescAccepted");
    case "preparing":
      return t("statusDescPreparing");
    case "ready":
      return fulfilmentType === "delivery"
        ? t("statusDescReadyDelivery")
        : t("statusDescReadyPickup");
    case "picked_up":
      return t("statusDescPickedUp");
    case "out_for_delivery":
      return t("statusDescOutForDelivery");
    case "delivered":
      return t("statusDescDelivered");
    case "completed":
      return t("statusDescCompleted");
    default:
      return "";
  }
}

function getStepTime(
  stepKey: string,
  history: OrderTrackingData["statusHistory"],
  createdAt: string,
  locale: string
): string | null {
  const match = history.find((h) => h.status === stepKey);
  const timeStr = match?.at || (stepKey === "preparing" || stepKey === "pending" ? createdAt : null);
  if (!timeStr) return null;
  try {
    const d = new Date(timeStr);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US", {
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return null;
  }
}

export function OrderTrackingView({ order }: OrderTrackingViewProps) {
  const t = useTranslations("Orders") as unknown as (key: string) => string;
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
  const isDelivered = order.status === "delivered" || order.status === "completed";

  // Hide the "Estimated ready at" banner when completed, delivered, cancelled, or out_for_delivery
  const showEstimatedReadyBanner = Boolean(order.estimatedReadyAt) && !isTerminal && !isOutForDelivery;

  // Keep the "Scheduled for" banner only while still pending, accepted, preparing, or ready
  const showScheduledBanner = Boolean(order.scheduledFor) && ["pending", "accepted", "preparing", "ready"].includes(order.status);

  // Stepper steps based on fulfilment type
  const isDelivery = order.fulfilmentType === "delivery";
  const activeSteps = isDelivery ? DELIVERY_STEPS : PICKUP_STEPS;
  const stepIndex = activeSteps.findIndex((s) => s.key === order.status);
  const currentStep = stepIndex >= 0 ? stepIndex : (isDelivered ? activeSteps.length - 1 : 0);

  const totalFormatted = formatMoney(order.totalAmount, order.currency, locale);
  const subtotalFormatted = formatMoney(order.subtotal, order.currency, locale);
  const deliveryFeeFormatted = formatMoney(order.deliveryFee, order.currency, locale);

  const cleanBusinessPhone = order.businessPhone
    ? order.businessPhone.replace(/[^\d+]/g, "")
    : null;

  const cleanRiderPhone = order.riderPhone
    ? order.riderPhone.replace(/[^\d+]/g, "")
    : null;

  const [courierLocation, setCourierLocation] = useState<{
    latitude: number;
    longitude: number;
    accuracy?: number | null;
    heading?: number | null;
    speed?: number | null;
    isStale?: boolean;
    label?: string;
  } | null>(null);
  const [liveTrackingLoading, setLiveTrackingLoading] = useState(false);

  // Delivery rating state
  const [ratingValue, setRatingValue] = useState(order.deliveryRating || 0);
  const [ratingHover, setRatingHover] = useState(0);
  const [ratingComment, setRatingComment] = useState(order.deliveryRatingComment || "");
  const [ratingSubmitting, setRatingSubmitting] = useState(false);
  const [ratingSubmitted, setRatingSubmitted] = useState(Boolean(order.deliveryRating));
  const [ratingError, setRatingError] = useState("");

  useEffect(() => {
    if (!isOutForDelivery || !isDelivery || !order.trackingToken) {
      setCourierLocation(null);
      return;
    }

    let active = true;

    async function fetchLiveLocation() {
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        return;
      }
      try {
        const res = await fetch(`/api/orders/${order.trackingToken}/location`);
        if (!res.ok) return;
        const data = await res.json();
        if (!active) return;
        if (data.liveTrackingActive && data.location) {
          setCourierLocation({
            ...data.location,
            label: "Courier is here",
          });
        } else {
          setCourierLocation(null);
        }
      } catch {
        // Network or fetch error
      }
    }

    setLiveTrackingLoading(true);
    void fetchLiveLocation().finally(() => {
      if (active) setLiveTrackingLoading(false);
    });

    const interval = setInterval(fetchLiveLocation, 10000);
    return () => {
      active = false;
      clearInterval(interval);
    };
  }, [isOutForDelivery, isDelivery, order.trackingToken]);

  // Compute estimated arrival display
  const arrivalTimeDisplay = order.estimatedReadyAt
    ? new Date(order.estimatedReadyAt).toLocaleTimeString(locale === "fr" ? "fr-FR" : "en-US", {
        hour: "2-digit",
        minute: "2-digit",
      })
    : null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950 py-5 px-3.5 sm:px-6">
      <div className="max-w-xl mx-auto space-y-4">
        {/* ── Top Navigation Bar ─────────────────────────────────────────── */}
        <header className="flex items-center justify-between">
          <a
            href={`/site/${order.siteSlug}`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-700 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-white transition-colors"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>{t("trackYourOrder") || "Track Your Order"}</span>
          </a>

          <div className="flex items-center gap-2">
            {cleanBusinessPhone && (
              <a
                href={`tel:${cleanBusinessPhone}`}
                className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-orange-700 transition-colors px-2.5 py-1 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs"
              >
                <HelpCircle className="w-3.5 h-3.5 text-zinc-400" />
                <span>{t("help") || "Help"}</span>
              </a>
            )}

            <button
              type="button"
              onClick={handleManualRefresh}
              disabled={isRefreshing}
              className="inline-flex items-center gap-1 text-xs font-medium text-zinc-600 dark:text-zinc-400 hover:text-zinc-950 dark:hover:text-white transition-colors p-1.5 rounded-lg border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-2xs disabled:opacity-50"
              aria-label={t("refresh")}
            >
              <RotateCw className={`w-3.5 h-3.5 ${isRefreshing ? "animate-spin text-orange-700" : ""}`} />
            </button>
          </div>
        </header>

        {/* ── 1. Order Status Hero Card ──────────────────────────────────── */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
          <div className="p-5 sm:p-6 text-center border-b border-zinc-100 dark:border-zinc-800">
            {/* Status Icon Badge */}
            <div className="flex justify-center mb-3">
              <div
                className={`w-14 h-14 rounded-2xl flex items-center justify-center shadow-xs ${
                  isCancelled
                    ? "bg-red-50 text-red-600 dark:bg-red-950/40 dark:text-red-400"
                    : isDelivered
                    ? "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40 dark:text-emerald-400"
                    : isOutForDelivery
                    ? "bg-orange-50 text-orange-700 dark:bg-orange-950/40 dark:text-orange-400"
                    : "bg-zinc-100 text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                }`}
              >
                {isCancelled ? (
                  <XCircle className="w-7 h-7" />
                ) : isDelivered ? (
                  <CheckCircle2 className="w-7 h-7" />
                ) : isOutForDelivery ? (
                  <Bike className="w-7 h-7" />
                ) : (
                  <ChefHat className="w-7 h-7" />
                )}
              </div>
            </div>

            {/* Status Title */}
            <h1 className="text-xl font-bold tracking-tight text-zinc-950 dark:text-white">
              {isCancelled
                ? t("timelineCancelled")
                : isDelivered
                ? (t("orderDeliveredTitle") || "Delivered!")
                : isOutForDelivery
                ? t("timelineOutForDelivery")
                : stepIndex >= 0
                ? t(activeSteps[stepIndex].labelKey)
                : order.status.replace(/_/g, " ")}
            </h1>

            {/* Subtitle / Description */}
            <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1 font-medium max-w-sm mx-auto">
              {isCancelled && order.cancellationReason
                ? t(
                    `reason${order.cancellationReason
                      .split("_")
                      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
                      .join("")}`
                  )
                : isDelivered
                ? (t("orderDeliveredThanks") || "Your order has been delivered. Thank you for your support!")
                : getStatusDescription(order.status, order.fulfilmentType, t)}
            </p>

            {/* Order Number & Meta */}
            <div className="mt-3.5 flex items-center justify-center gap-2 flex-wrap text-xs">
              <span className="inline-flex items-center px-2.5 py-0.5 rounded-full font-bold bg-zinc-100 dark:bg-zinc-800 text-zinc-900 dark:text-zinc-100 border border-zinc-200 dark:border-zinc-700">
                {order.orderNumber}
              </span>
              <span className="text-zinc-400">·</span>
              <span className="text-zinc-500 dark:text-zinc-400 capitalize">
                {order.fulfilmentType === "delivery" ? "Delivery" : "Pickup"}
              </span>
            </div>
          </div>

          {/* ── Estimated Ready / Scheduled Alerts ────────────────────────── */}
          {showEstimatedReadyBanner && (
            <div className="mx-4 mt-4 rounded-xl border border-orange-200 bg-orange-50/70 p-3.5 dark:border-orange-900 dark:bg-orange-950/30">
              <div className="flex items-center gap-3">
                <Clock className="w-5 h-5 text-orange-700 dark:text-orange-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-orange-800 dark:text-orange-300">{t("estimatedReadyTime")}</p>
                  <p className="text-base font-extrabold text-orange-900 dark:text-orange-200 mt-0.5">
                    {arrivalTimeDisplay}
                  </p>
                </div>
              </div>
            </div>
          )}

          {showScheduledBanner && (
            <div className="mx-4 mt-4 rounded-xl border border-blue-200 bg-blue-50/80 p-3.5 dark:border-blue-900 dark:bg-blue-950/30">
              <div className="flex items-center gap-3">
                <CalendarClock className="w-5 h-5 text-blue-600 dark:text-blue-400 shrink-0" />
                <div>
                  <p className="text-xs font-medium text-blue-800 dark:text-blue-300">{t("scheduledFor")}</p>
                  <p className="text-sm font-bold text-blue-950 dark:text-blue-100 mt-0.5">
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
          )}

          {/* ── Status Stepper (Horizontal with Timestamps) ────────────────── */}
          {!isCancelled && (
            <div className="p-4 sm:p-5">
              <div className="flex items-start justify-between w-full" role="list" aria-label={t("trackingPageTitle")}>
                {activeSteps.map((step, idx) => {
                  const isPassed = currentStep > idx;
                  const isCurrent = currentStep === idx;
                  const stepTime = getStepTime(step.key, order.statusHistory, order.createdAt, locale);

                  return (
                    <div key={step.key} className="flex-1 flex flex-col items-center relative text-center" role="listitem">
                      {/* Connector Line */}
                      {idx > 0 && (
                        <div
                          className={`absolute top-4 -left-1/2 w-full h-0.5 -translate-y-1/2 z-0 ${
                            isPassed || isCurrent ? "bg-orange-700" : "bg-zinc-200 dark:bg-zinc-800"
                          }`}
                          aria-hidden="true"
                        />
                      )}

                      {/* Step Circle */}
                      <div
                        className={`relative z-10 flex items-center justify-center w-8 h-8 rounded-full text-xs font-bold transition-all shadow-2xs ${
                          isPassed
                            ? "bg-orange-700 text-white"
                            : isCurrent
                            ? "bg-orange-700 text-white ring-4 ring-orange-100 dark:ring-orange-950"
                            : "bg-zinc-100 text-zinc-400 border border-zinc-200 dark:bg-zinc-800 dark:border-zinc-700"
                        }`}
                        aria-current={isCurrent ? "step" : undefined}
                      >
                        {isPassed ? (
                          <CheckCircle2 className="w-4 h-4 text-white" />
                        ) : (
                          <StepIcon stepKey={step.key} className="w-4 h-4" />
                        )}
                      </div>

                      {/* Step Label */}
                      <p
                        className={`mt-2 text-[11px] font-semibold leading-tight line-clamp-1 ${
                          isPassed || isCurrent ? "text-zinc-900 dark:text-zinc-100" : "text-zinc-400 dark:text-zinc-500"
                        }`}
                      >
                        {t(step.labelKey)}
                      </p>

                      {/* Step Timestamp */}
                      <span className="text-[10px] text-zinc-400 dark:text-zinc-500 mt-0.5 tabular-nums">
                        {stepTime || "–"}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {/* ── 2. Live Map Section (Only during transit) ──────────────────── */}
        {isOutForDelivery && isDelivery && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <span className="relative flex h-2.5 w-2.5">
                  <span
                    className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                      courierLocation?.isStale ? "bg-amber-400" : "bg-emerald-400"
                    }`}
                  />
                  <span
                    className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                      courierLocation?.isStale ? "bg-amber-500" : "bg-emerald-500"
                    }`}
                  />
                </span>
                <p className="text-xs font-bold text-zinc-950 dark:text-white">
                  {t("liveTracking")}
                </p>
              </div>

              <div>
                {courierLocation?.isStale ? (
                  <span className="inline-flex items-center rounded-md bg-amber-50 dark:bg-amber-950/40 px-2 py-0.5 text-[10px] font-semibold text-amber-800 dark:text-amber-300 border border-amber-200 dark:border-amber-800">
                    {t("liveTrackingReconnecting")}
                  </span>
                ) : courierLocation ? (
                  <span className="inline-flex items-center rounded-md bg-emerald-50 dark:bg-emerald-950/40 px-2 py-0.5 text-[10px] font-semibold text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800">
                    {t("liveTrackingActive")}
                  </span>
                ) : null}
              </div>
            </div>

            {courierLocation ? (
              <DeliveryMap
                courierLocation={courierLocation}
                height="280px"
                interactive={true}
                className="rounded-lg"
              />
            ) : (
              <div className="flex flex-col items-center justify-center rounded-lg border border-dashed border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/50 py-10 px-4 text-center">
                <Bike className="h-7 w-7 text-zinc-400 animate-pulse mb-2" />
                <p className="text-xs text-zinc-600 dark:text-zinc-400 font-medium">
                  {liveTrackingLoading ? t("liveTrackingWaiting") : t("liveTrackingWaiting")}
                </p>
              </div>
            )}
          </div>
        )}

        {/* ── 3. Courier Information & Quick Contact ─────────────────────── */}
        {isOutForDelivery && order.riderName && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs">
            <div className="flex items-center justify-between gap-3">
              <div className="flex items-center gap-3 min-w-0">
                <div className="w-11 h-11 rounded-full bg-orange-700 text-white flex items-center justify-center shrink-0 text-sm font-bold shadow-xs">
                  {(order.riderName.split(/\s+/)[0] || order.riderName).charAt(0).toUpperCase()}
                </div>
                <div className="min-w-0">
                  <h3 className="text-sm font-bold text-zinc-950 dark:text-white truncate">
                    {order.riderName.split(/\s+/)[0] || order.riderName}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-0.5">
                    {t("yourDeliveryCourier") || "Your delivery courier"}
                  </p>
                </div>
              </div>

              {cleanRiderPhone && (
                <a
                  href={`tel:${cleanRiderPhone}`}
                  className="w-10 h-10 rounded-full border border-orange-200 bg-orange-50 hover:bg-orange-100 text-orange-700 dark:border-orange-800 dark:bg-orange-950/50 dark:text-orange-400 flex items-center justify-center transition-colors shrink-0 shadow-2xs"
                  aria-label={t("callRider")}
                  title={t("callRider")}
                >
                  <Phone className="w-4 h-4" />
                </a>
              )}
            </div>

            {/* Estimated Arrival / Order reference bar */}
            <div className="mt-3.5 pt-3 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs text-zinc-500 dark:text-zinc-400">
              <span>Order #{order.orderNumber}</span>
              {arrivalTimeDisplay && (
                <span className="font-semibold text-zinc-900 dark:text-zinc-100">
                  {t("estimatedArrival") || "Estimated arrival"}: {arrivalTimeDisplay}
                </span>
              )}
            </div>
          </div>
        )}

        {/* ── 4. Delivered Confirmation & Interactive Rating Experience ──── */}
        {isDelivery && isDelivered && (
          <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
            {!ratingSubmitted ? (
              /* Screen 2: Rate Experience Form */
              <div className="p-5 sm:p-6 text-center">
                <h2 className="text-base font-bold text-zinc-950 dark:text-white">
                  {t("rateDeliveryTitle") || "Rate Your Delivery Experience"}
                </h2>
                <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                  {t("rateDeliveryDescription") || "Rate your courier and delivery experience"}
                </p>

                {/* 5-Star Selector */}
                <div
                  className="flex items-center justify-center gap-2 mt-4"
                  role="radiogroup"
                  aria-label={t("rateDeliveryTitle")}
                >
                  {[1, 2, 3, 4, 5].map((star) => (
                    <button
                      key={star}
                      type="button"
                      role="radio"
                      aria-checked={ratingValue === star}
                      aria-label={`${star} ${star === 1 ? "star" : "stars"}`}
                      disabled={ratingSubmitting}
                      onClick={() => setRatingValue(star)}
                      onMouseEnter={() => setRatingHover(star)}
                      onMouseLeave={() => setRatingHover(0)}
                      className="p-1.5 transition-transform hover:scale-115 focus:outline-hidden disabled:opacity-50 cursor-pointer"
                    >
                      <Star
                        className={`w-8 h-8 transition-colors ${
                          star <= (ratingHover || ratingValue)
                            ? "fill-amber-400 text-amber-400 drop-shadow-xs"
                            : "fill-transparent text-zinc-300 dark:text-zinc-700"
                        }`}
                      />
                    </button>
                  ))}
                </div>
                <p className="text-[11px] font-medium text-zinc-400 mt-1">
                  {t("tapToRate") || "Tap a star to rate"}
                </p>

                {/* Optional Comment */}
                <div className="mt-4 text-left">
                  <label htmlFor="delivery-comment" className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">
                    {locale === "fr" ? "Ajouter un commentaire (optionnel)" : "Add a comment (optional)"}
                  </label>
                  <textarea
                    id="delivery-comment"
                    value={ratingComment}
                    onChange={(e) => setRatingComment(e.target.value.slice(0, 500))}
                    placeholder={t("rateDeliveryCommentPlaceholder") || "Tell us about your delivery experience..."}
                    maxLength={500}
                    rows={3}
                    disabled={ratingSubmitting}
                    className="mt-1.5 w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:outline-hidden focus:ring-2 focus:ring-orange-700/30 disabled:opacity-50 resize-none transition"
                  />
                  <div className="flex justify-between items-center mt-1 text-[10px] text-zinc-400">
                    <span className="flex items-center gap-1">
                      <Info className="w-3 h-3 text-zinc-400" />
                      {t("feedbackHelps") || "Your feedback helps us improve!"}
                    </span>
                    <span>{ratingComment.length}/500</span>
                  </div>
                </div>

                {ratingError && (
                  <p className="mt-3 text-xs text-red-600 font-medium">{ratingError}</p>
                )}

                {/* Submit Action */}
                <button
                  type="button"
                  disabled={ratingSubmitting || ratingValue === 0}
                  onClick={async () => {
                    if (ratingValue === 0) return;
                    setRatingSubmitting(true);
                    setRatingError("");
                    try {
                      const res = await fetch(`/api/orders/${order.trackingToken}/rating`, {
                        method: "POST",
                        headers: { "Content-Type": "application/json" },
                        body: JSON.stringify({
                          rating: ratingValue,
                          comment: ratingComment.trim() || null,
                        }),
                      });
                      const data = await res.json();
                      if (res.ok && (data.ok || !data.error)) {
                        setRatingSubmitted(true);
                      } else {
                        setRatingError(data.error || t("rateDeliveryError"));
                      }
                    } catch {
                      setRatingError(t("rateDeliveryError"));
                    } finally {
                      setRatingSubmitting(false);
                    }
                  }}
                  className="mt-4 w-full min-h-11 rounded-xl bg-orange-700 hover:bg-orange-800 text-white font-bold text-xs shadow-xs transition-colors disabled:opacity-50 cursor-pointer"
                >
                  {ratingSubmitting ? t("rateDeliverySubmitting") : (t("rateDeliverySubmit") || "Submit Rating")}
                </button>
              </div>
            ) : (
              /* Screen 3: Rating Submitted Confirmation */
              <div className="p-6 text-center space-y-4">
                <div className="w-14 h-14 rounded-full bg-emerald-100 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 mx-auto flex items-center justify-center">
                  <Sparkles className="w-7 h-7" />
                </div>
                <div>
                  <h3 className="text-lg font-bold text-zinc-950 dark:text-white">
                    {t("thankYou") || "Thank you!"}
                  </h3>
                  <p className="text-xs text-zinc-500 dark:text-zinc-400 mt-1">
                    {t("ratingSubmittedDesc") || "Your rating has been submitted."}
                  </p>
                </div>

                {/* Rating Card Display */}
                <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/60 dark:bg-zinc-950/50 p-4 max-w-sm mx-auto text-left">
                  <div className="flex items-center justify-between">
                    <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                      {t("yourRating") || "Your Rating"}
                    </p>
                    <span className="text-xs font-bold text-amber-500">
                      {ratingValue}.0 ★
                    </span>
                  </div>

                  <div className="flex items-center gap-1 mt-1.5">
                    {[1, 2, 3, 4, 5].map((star) => (
                      <Star
                        key={star}
                        className={`w-4 h-4 ${
                          star <= ratingValue
                            ? "fill-amber-400 text-amber-400"
                            : "fill-transparent text-zinc-300 dark:text-zinc-700"
                        }`}
                      />
                    ))}
                  </div>

                  {ratingComment && (
                    <p className="mt-2 text-xs italic text-zinc-600 dark:text-zinc-400">
                      &ldquo;{ratingComment}&rdquo;
                    </p>
                  )}
                </div>

                {/* Back to Home Button */}
                <a
                  href={`/site/${order.siteSlug}`}
                  className="inline-block w-full min-h-11 leading-11 text-center rounded-xl bg-orange-700 hover:bg-orange-800 text-white font-bold text-xs shadow-xs transition-colors"
                >
                  {t("backToHome") || "Back to Home"}
                </a>
              </div>
            )}
          </div>
        )}

        {/* ── 5. Delivery & Restaurant Details ───────────────────────────── */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden p-4 sm:p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-3">
            <div className="flex items-center gap-2.5">
              <Store className="w-4 h-4 text-orange-700" />
              <div>
                <h3 className="text-xs font-bold text-zinc-950 dark:text-white">{order.businessName}</h3>
                {order.businessPhone && (
                  <p className="text-[11px] text-zinc-500 dark:text-zinc-400">{order.businessPhone}</p>
                )}
              </div>
            </div>
            {cleanBusinessPhone && (
              <a
                href={`tel:${cleanBusinessPhone}`}
                className="text-xs font-semibold text-orange-700 hover:underline"
              >
                {t("callBusiness")}
              </a>
            )}
          </div>

          <div className="flex items-start gap-2.5">
            <MapPin className="w-4 h-4 text-zinc-400 shrink-0 mt-0.5" />
            <div className="text-xs">
              <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                {order.fulfilmentType === "delivery" ? t("address") : t("fulfilment")}
              </p>
              <p className="text-zinc-600 dark:text-zinc-400 mt-0.5">
                {order.deliveryAddress || order.maskedCustomerName}
              </p>
              {order.customerNote && (
                <p className="mt-1 text-zinc-500 italic">
                  &ldquo;{order.customerNote}&rdquo;
                </p>
              )}
            </div>
          </div>
        </div>

        {/* ── 6. Order Items & Receipt Breakdown ─────────────────────────── */}
        <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden p-4 sm:p-5">
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-400 dark:text-zinc-500 flex items-center gap-2 mb-3">
            <Package className="w-3.5 h-3.5" />
            <span>
              {t("items")} · {order.items.length} {order.items.length === 1 ? "item" : "items"}
            </span>
          </h2>

          <ul className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
            {order.items.map((item, idx) => (
              <li key={idx} className="py-2.5 flex items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-zinc-900 dark:text-zinc-100">
                    <span className="font-bold text-zinc-500 mr-1.5">{item.quantity}×</span>
                    {item.name}
                  </p>
                  {item.chosen_options && item.chosen_options.length > 0 && (
                    <p className="text-zinc-500 mt-0.5 pl-5 text-[11px]">
                      {item.chosen_options.map(formatChosenMenuOption).join(", ")}
                    </p>
                  )}
                  {item.promotion?.name ? (
                    <p className="mt-0.5 text-[11px] font-medium text-emerald-700 pl-5">
                      {item.promotion.name}
                      {item.promotion.discount_per_unit > 0
                        ? ` · saved ${formatMoney(item.promotion.discount_per_unit * item.quantity, order.currency, locale)}`
                        : " applied"}
                    </p>
                  ) : null}
                </div>
                <p className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums whitespace-nowrap">
                  {formatMoney(item.line_total, order.currency, locale)}
                </p>
              </li>
            ))}
          </ul>

          {/* Pricing Totals */}
          <div className="border-t border-zinc-100 dark:border-zinc-800 pt-3 mt-2 space-y-2 text-xs">
            <div className="flex justify-between text-zinc-500">
              <span>{locale === "fr" ? "Sous-total" : "Subtotal"}</span>
              <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                {subtotalFormatted}
              </span>
            </div>

            {order.deliveryFee > 0 && (
              <div className="flex justify-between text-zinc-500">
                <span>{locale === "fr" ? "Frais de livraison" : "Delivery fee"}</span>
                <span className="font-semibold text-zinc-900 dark:text-zinc-100 tabular-nums">
                  {deliveryFeeFormatted}
                </span>
              </div>
            )}

            <div className="flex justify-between pt-2 border-t border-zinc-100 dark:border-zinc-800 text-sm">
              <span className="font-bold text-zinc-950 dark:text-white">{t("total")}</span>
              <span className="font-extrabold text-zinc-950 dark:text-white tabular-nums">
                {totalFormatted}
              </span>
            </div>
          </div>
        </div>

        {/* ── Auto-refresh note ──────────────────────────────────────────── */}
        {!isTerminal && (
          <p className="text-center text-[10px] text-zinc-400 pb-2">
            {locale === "fr" ? "Mise à jour automatique toutes les 30 secondes" : "Auto-refreshing every 30 seconds"}
            {isRefreshing && <RotateCw className="w-2.5 h-2.5 inline-block animate-spin ml-1 text-orange-700" />}
          </p>
        )}
      </div>
    </div>
  );
}
