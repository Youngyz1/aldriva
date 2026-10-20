"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { formatMoney as formatCurrency } from "@/lib/money";
import type { Locale } from "@/i18n/routing";
import { resolveDetailedPaymentBadge } from "@/lib/order-payment-label";
import { computeOrderOverdue } from "@/lib/order-overdue";
import { formatChosenMenuOption } from "@/lib/order-option-display";
import {
  updateOrderStatus,
  adjustEstimatedReadyTime,
  updateRiderDetails,
  type OrderStatus,
  type CancellationReasonCode,
} from "@/lib/actions/orders";
import { buildCourierWhatsAppUrl } from "@/lib/courier/whatsapp-message";
import { Bike, MessageSquare } from "lucide-react";

export interface DashboardOrderItem {
  item_id: string;
  name: string;
  unit_price: number;
  quantity: number;
  line_total: number;
  chosen_options?: Array<{
    id?: string;
    name: string;
    price_delta?: number;
    price?: number;
    group_id?: string;
    group_name?: string;
    group_kind?: "variant" | "addon";
    qty?: number;
  }>;
}

export interface DashboardOrderRow {
  id: string;
  order_number: string;
  customer_name: string;
  customer_phone: string;
  customer_email: string | null;
  fulfilment_type: "pickup" | "delivery" | string;
  delivery_address: string | null;
  customer_note: string | null;
  currency: string;
  subtotal: number;
  delivery_fee: number;
  total_amount: number;
  status: OrderStatus | string;
  payment_method: string;
  payment_status: string;
  payment_expires_at: string | null;
  scheduled_for: string | null;
  estimated_ready_at: string | null;
  cancellation_reason: string | null;
  rider_name?: string | null;
  rider_phone?: string | null;
  status_history: Array<{
    status: string;
    at: string;
    by_user_id?: string;
    reason?: string | null;
    note?: string | null;
    estimated_ready_at?: string | null;
    rider_name?: string | null;
    rider_phone?: string | null;
  }> | unknown;
  items: unknown;
  created_at: string;
  provider?: string | null;
  provider_reference?: string | null;
}

interface OrderCardProps {
  order: DashboardOrderRow;
  organizerId: string;
  canManage: boolean;
  courierWhatsapp?: string | null;
  businessName?: string | null;
  businessAddress?: string | null;
  businessPhone?: string | null;
  recentRiderSuggestions?: string[];
  onRefresh?: () => void;
}

export function OrderCard({
  order,
  organizerId,
  canManage,
  courierWhatsapp,
  businessName,
  businessAddress,
  businessPhone,
  recentRiderSuggestions = [],
  onRefresh,
}: OrderCardProps) {
  const t = useTranslations("Orders");
  const locale = useLocale() as Locale;
  const [isExpanded, setIsExpanded] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);

  // Modals state
  const [showAcceptModal, setShowAcceptModal] = useState(false);
  const [showCancelModal, setShowCancelModal] = useState(false);
  const [showAdjustModal, setShowAdjustModal] = useState(false);
  const [showCollectPaymentModal, setShowCollectPaymentModal] = useState(false);
  const [showRiderModal, setShowRiderModal] = useState(false);
  // Rider dialog errors render INSIDE the dialog (localized); the dialog stays
  // open on failure so the owner can correct and retry.
  const [riderError, setRiderError] = useState<string | null>(null);

  // Accept modal state
  const [prepMinutes, setPrepMinutes] = useState<number>(20);
  const [customTime, setCustomTime] = useState<string>("");

  // Cancel modal state
  const [cancelReason, setCancelReason] = useState<CancellationReasonCode>("out_of_stock");
  const [cancelNote, setCancelNote] = useState<string>("");

  // Rider modal state
  const [riderNameInput, setRiderNameInput] = useState<string>(order.rider_name || "");
  const [riderPhoneInput, setRiderPhoneInput] = useState<string>(order.rider_phone || "");

  // Address copy state
  const [addressCopied, setAddressCopied] = useState(false);

  const overdue = computeOrderOverdue(order);
  const paymentBadgeKey = resolveDetailedPaymentBadge(order);

  const cleanPhone = order.customer_phone.replace(/[^\d+]/g, "");
  const whatsappUrl = `https://wa.me/${cleanPhone.replace(/^\+/, "")}`;

  const isPaidOnline = order.payment_method === "online" && order.payment_status === "paid";
  const items = Array.isArray(order.items) ? (order.items as DashboardOrderItem[]) : [];
  const statusHistory = Array.isArray(order.status_history)
    ? (order.status_history as Array<{
        status: string;
        at: string;
        reason?: string | null;
        note?: string | null;
        estimated_ready_at?: string | null;
        rider_name?: string | null;
        rider_phone?: string | null;
      }>)
    : [];

  const formattedTotal = formatCurrency(order.total_amount, order.currency || "XOF", locale);

  const timeAgo = formatTimeAgo(order.created_at);

  const handleCopyAddress = async (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!order.delivery_address) return;
    try {
      await navigator.clipboard.writeText(order.delivery_address);
      setAddressCopied(true);
      setTimeout(() => setAddressCopied(false), 2000);
    } catch {
      // ignore clipboard error
    }
  };

  const handleAdvanceStatus = async (nextStatus: OrderStatus) => {
    setActionError(null);
    if (nextStatus === "accepted") {
      setShowAcceptModal(true);
      return;
    }
    if (nextStatus === "out_for_delivery") {
      setRiderNameInput(order.rider_name || "");
      setRiderPhoneInput(order.rider_phone || "");
      setRiderError(null);
      setShowRiderModal(true);
      return;
    }
    const isTerminal = nextStatus === "completed" || nextStatus === "delivered";
    if (isTerminal && order.payment_status !== "paid" && order.payment_method !== "online") {
      setShowCollectPaymentModal(true);
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await updateOrderStatus({
        orderId: order.id,
        organizerId,
        expectedCurrentStatus: order.status as OrderStatus,
        nextStatus,
      });
      if (!res.success) {
        setActionError(res.message || "Failed to update order status.");
      } else {
        onRefresh?.();
      }
    } catch {
      setActionError("An unexpected network error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmAccept = async () => {
    let targetDate: Date;
    if (customTime) {
      targetDate = new Date(customTime);
    } else {
      targetDate = new Date(Date.now() + prepMinutes * 60 * 1000);
    }

    if (isNaN(targetDate.getTime())) {
      setActionError("Please choose a valid estimated ready time.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await updateOrderStatus({
        orderId: order.id,
        organizerId,
        expectedCurrentStatus: "pending",
        nextStatus: "accepted",
        estimatedReadyAt: targetDate.toISOString(),
      });
      if (!res.success) {
        setActionError(res.message || "Failed to accept order.");
      } else {
        setShowAcceptModal(false);
        onRefresh?.();
      }
    } catch {
      setActionError("Failed to accept order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmCancel = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await updateOrderStatus({
        orderId: order.id,
        organizerId,
        expectedCurrentStatus: order.status as OrderStatus,
        nextStatus: "cancelled",
        cancellationReason: cancelReason,
        cancellationNote: cancelNote.trim() || null,
      });
      if (!res.success) {
        setActionError(res.message || "Failed to cancel order.");
      } else {
        setShowCancelModal(false);
        onRefresh?.();
      }
    } catch {
      setActionError("Failed to cancel order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleConfirmPaymentAndComplete = async () => {
    setIsSubmitting(true);
    setActionError(null);
    try {
      const nextTerminal = order.status === "out_for_delivery" ? "delivered" : "completed";
      const res = await updateOrderStatus({
        orderId: order.id,
        organizerId,
        expectedCurrentStatus: order.status as OrderStatus,
        nextStatus: nextTerminal,
        markPaymentCollected: true,
      });
      if (!res.success) {
        setActionError(res.message || "Failed to complete order.");
      } else {
        setShowCollectPaymentModal(false);
        onRefresh?.();
      }
    } catch {
      setActionError("Failed to complete order.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSaveRiderModal = async () => {
    if (!riderNameInput.trim()) {
      setRiderError(t("riderNameRequired"));
      return;
    }

    // Rider edits are only valid from ready (assign) or out_for_delivery
    // (edit). Any other status is rejected with an in-dialog error — the
    // dialog stays open and nothing is written.
    if (order.status !== "ready" && order.status !== "out_for_delivery") {
      setRiderError(t("riderWrongStatus"));
      return;
    }

    setIsSubmitting(true);
    setRiderError(null);
    const riderErrorMessage = (error?: string, fallback?: string | null): string => {
      switch (error) {
        case "missing_rider_name":
          return t("riderNameRequired");
        case "invalid_rider_phone":
          return t("riderPhoneInvalid");
        case "invalid_status":
        case "invalid_transition":
          return t("riderWrongStatus");
        case "order_already_updated":
          return t("orderAlreadyUpdated");
        case "forbidden":
        case "unauthorized":
          return t("riderNotAllowed");
        default:
          return fallback || t("riderSaveFailed");
      }
    };
    try {
      if (order.status === "ready") {
        // Transition to out_for_delivery
        const res = await updateOrderStatus({
          orderId: order.id,
          organizerId,
          expectedCurrentStatus: "ready",
          nextStatus: "out_for_delivery",
          riderName: riderNameInput.trim(),
          riderPhone: riderPhoneInput.trim() || null,
        });
        if (!res.success) {
          setRiderError(riderErrorMessage(res.error, res.message));
        } else {
          setShowRiderModal(false);
          onRefresh?.();
        }
      } else if (order.status === "out_for_delivery") {
        // Update rider details on current out_for_delivery order
        const res = await updateRiderDetails({
          orderId: order.id,
          organizerId,
          riderName: riderNameInput.trim(),
          riderPhone: riderPhoneInput.trim() || null,
        });
        if (!res.success) {
          setRiderError(riderErrorMessage(res.error, res.message));
        } else {
          setShowRiderModal(false);
          onRefresh?.();
        }
      }
    } catch {
      setRiderError(t("riderSaveFailed"));
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleSendToCourier = (e: React.MouseEvent) => {
    e.stopPropagation();
    const url = buildCourierWhatsAppUrl(
      {
        orderNumber: order.order_number,
        businessName: businessName || "Restaurant",
        businessAddress: businessAddress ?? null,
        businessPhone: businessPhone ?? null,
        customerName: order.customer_name,
        customerPhone: order.customer_phone,
        deliveryAddress: order.delivery_address || "",
        deliveryNote: order.customer_note ?? null,
        itemsCount: items.length,
        currency: order.currency || "XOF",
        totalAmount: order.total_amount,
        deliveryFee: order.delivery_fee || 0,
        isPaid: isPaidOnline,
        promisedTime: order.estimated_ready_at ?? order.scheduled_for ?? null,
        locale,
      },
      courierWhatsapp ?? null
    );
    window.open(url, "_blank", "noopener,noreferrer");
  };

  const handleAdjustTime = async () => {
    let targetDate: Date;
    if (customTime) {
      targetDate = new Date(customTime);
    } else {
      targetDate = new Date(Date.now() + prepMinutes * 60 * 1000);
    }

    if (isNaN(targetDate.getTime())) {
      setActionError("Please specify a valid time.");
      return;
    }

    setIsSubmitting(true);
    setActionError(null);
    try {
      const res = await adjustEstimatedReadyTime({
        orderId: order.id,
        organizerId,
        newEstimatedReadyAt: targetDate.toISOString(),
      });
      if (!res.success) {
        setActionError(res.message || "Failed to adjust prep time.");
      } else {
        setShowAdjustModal(false);
        onRefresh?.();
      }
    } catch {
      setActionError("Failed to adjust prep time.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="rounded-xl border border-zinc-200 bg-white shadow-xs overflow-hidden transition-colors">
      {/* CARD HEADER - Always displays all primary summary data */}
      <div
        onClick={() => setIsExpanded(!isExpanded)}
        className="cursor-pointer p-4 sm:p-5 hover:bg-zinc-50/70 transition-colors select-none"
        role="button"
        tabIndex={0}
        aria-expanded={isExpanded}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setIsExpanded(!isExpanded);
          }
        }}
      >
        <div className="flex flex-col gap-3">
          {/* Top Line: Order #, Time Ago, Badges */}
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-2 flex-wrap">
              <span className="font-mono text-sm font-bold text-zinc-900 tracking-tight">
                #{order.order_number}
              </span>
              <span className="text-xs text-zinc-500">• {timeAgo}</span>
              {overdue.isOverdue && (
                <span className="inline-flex items-center rounded-full bg-red-100 border border-red-300 px-2.5 py-0.5 text-xs font-bold text-red-800 animate-pulse">
                  {t("overdueBadge", { minutes: overdue.minutesLate })}
                </span>
              )}
              {overdue.isWaitingForCourier && (
                <span className="inline-flex items-center rounded-full bg-amber-50 border border-amber-300 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                  {t("waitingForRiderBadge")} ({overdue.waitingMinutes}m)
                </span>
              )}
            </div>

            <div className="flex items-center gap-1.5 flex-wrap">
              <StatusBadge status={order.status} />
              <span className="inline-flex items-center rounded-full border border-zinc-200 bg-zinc-50 px-2.5 py-0.5 text-xs font-medium text-zinc-700 capitalize">
                {order.fulfilment_type === "delivery" ? t("delivery") : t("pickup")}
              </span>
            </div>
          </div>

          {/* Sub Line: Customer Name, Rider pill (if assigned), Total Amount, Payment Badge */}
          <div className="flex flex-wrap items-center justify-between gap-2 border-t border-zinc-100 pt-2.5">
            <div className="flex items-center gap-2 flex-wrap min-w-0">
              <p className="text-sm font-semibold text-zinc-800 truncate">{order.customer_name}</p>
              {order.fulfilment_type === "delivery" &&
              order.status === "out_for_delivery" &&
              order.rider_name && (
                <div className="inline-flex items-center gap-1 text-xs text-sky-800 bg-sky-50 border border-sky-200 rounded-lg px-2 py-0.5">
                  <Bike className="w-3.5 h-3.5 text-sky-600 shrink-0" />
                  <span className="font-semibold">{order.rider_name}</span>
                  {order.rider_phone && (
                    <span className="text-sky-600 font-mono text-[11px]">• {order.rider_phone}</span>
                  )}
                </div>
              )}
            </div>
            <div className="flex items-center gap-2">
              <span className="font-bold text-zinc-900 text-sm tabular-nums">{formattedTotal}</span>
              <PaymentBadge badgeKey={paymentBadgeKey} />
            </div>
          </div>

          {/* Primary Action Button Bar */}
          {canManage && (
            <div
              className="mt-1 flex flex-wrap items-center gap-2 pt-2 border-t border-zinc-100"
              onClick={(e) => e.stopPropagation()}
            >
              {order.status === "pending" && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAdvanceStatus("accepted")}
                    className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-orange-700 px-4 py-2 text-xs font-bold text-white hover:bg-orange-800 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("accept")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => setShowCancelModal(true)}
                    className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-bold text-zinc-700 hover:bg-zinc-50 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("decline")}
                  </button>
                </>
              )}

              {order.status === "accepted" && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAdvanceStatus("preparing")}
                    className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-blue-600 px-4 py-2 text-xs font-bold text-white hover:bg-blue-700 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("startPreparing")}
                  </button>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAdvanceStatus("ready")}
                    className="min-h-[44px] rounded-xl border border-blue-200 bg-blue-50 px-3 py-2 text-xs font-bold text-blue-700 hover:bg-blue-100 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("markReady")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(true)}
                    className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition"
                  >
                    {t("adjustReadyTime")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="min-h-[44px] rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition"
                  >
                    {t("cancelOrder")}
                  </button>
                </>
              )}

              {order.status === "preparing" && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAdvanceStatus("ready")}
                    className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-emerald-700 px-4 py-2 text-xs font-bold text-white hover:bg-emerald-800 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("markReady")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowAdjustModal(true)}
                    className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-medium text-zinc-600 hover:bg-zinc-50 transition"
                  >
                    {t("adjustReadyTime")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="min-h-[44px] rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition"
                  >
                    {t("cancelOrder")}
                  </button>
                </>
              )}

              {order.status === "ready" && (
                <>
                  {order.fulfilment_type === "delivery" ? (
                    <>
                      <button
                        type="button"
                        disabled={isSubmitting}
                        onClick={() => handleAdvanceStatus("out_for_delivery")}
                        className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-sky-600 px-4 py-2 text-xs font-bold text-white hover:bg-sky-700 transition active:scale-95 disabled:opacity-50 flex items-center justify-center gap-1.5"
                      >
                        <Bike className="w-4 h-4" />
                        <span>{t("markOutForDelivery")}</span>
                      </button>
                      <button
                        type="button"
                        onClick={handleSendToCourier}
                        className="min-h-[44px] rounded-xl border border-emerald-300 bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800 hover:bg-emerald-100 transition active:scale-95 flex items-center gap-1.5"
                        title={t("sendToCourier")}
                      >
                        <MessageSquare className="w-4 h-4 text-emerald-600" />
                        <span>{t("sendToCourier")}</span>
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      disabled={isSubmitting}
                      onClick={() => handleAdvanceStatus("completed")}
                      className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 transition active:scale-95 disabled:opacity-50"
                    >
                      {t("completeOrder")}
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="min-h-[44px] rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition"
                  >
                    {t("cancelOrder")}
                  </button>
                </>
              )}

              {order.status === "out_for_delivery" && (
                <>
                  <button
                    type="button"
                    disabled={isSubmitting}
                    onClick={() => handleAdvanceStatus("delivered")}
                    className="min-h-[44px] flex-1 sm:flex-initial rounded-xl bg-zinc-900 px-4 py-2 text-xs font-bold text-white hover:bg-zinc-800 transition active:scale-95 disabled:opacity-50"
                  >
                    {t("markDelivered")}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setRiderNameInput(order.rider_name || "");
                      setRiderPhoneInput(order.rider_phone || "");
                      setRiderError(null);
                      setShowRiderModal(true);
                    }}
                    className="min-h-[44px] rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 transition"
                  >
                    {t("editRider")}
                  </button>
                  <button
                    type="button"
                    onClick={() => setShowCancelModal(true)}
                    className="min-h-[44px] rounded-xl border border-red-200 bg-white px-3 py-2 text-xs font-bold text-red-600 hover:bg-red-50 transition"
                  >
                    {t("cancelOrder")}
                  </button>
                </>
              )}
            </div>
          )}

          {!canManage && (
            <p className="text-[11px] text-zinc-400 italic pt-1 border-t border-zinc-100">{t("readOnlyNote")}</p>
          )}

          {actionError && (
            <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
              {actionError}
            </div>
          )}
        </div>
      </div>

      {/* EXPANDED DETAILS */}
      {isExpanded && (
        <div className="border-t border-zinc-100 bg-zinc-50/50 p-4 sm:p-5 space-y-5">
          {/* Contact & Fulfilment Row */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4 text-sm">
            {/* Customer Details & Tap-To-Call */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("customer")}</span>
              <p className="font-semibold text-zinc-900">{order.customer_name}</p>
              <div className="flex flex-wrap items-center gap-2 pt-1">
                <a
                  href={`tel:${cleanPhone}`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-800 hover:bg-zinc-100 transition"
                >
                  📞 {t("callCustomer")}
                </a>
                <a
                  href={whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-1.5 text-xs font-bold text-emerald-700 hover:bg-emerald-100 transition"
                >
                  💬 {t("whatsappCustomer")}
                </a>
              </div>
              {order.customer_email && <p className="text-xs text-zinc-500 pt-1">{order.customer_email}</p>}
            </div>

            {/* Fulfilment & Address Copy */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("fulfilment")}</span>
              <p className="font-semibold text-zinc-900 capitalize">
                {order.fulfilment_type === "delivery" ? t("delivery") : t("pickup")}
              </p>
              {order.delivery_address && (
                <div className="pt-1">
                  <p className="text-xs text-zinc-600 line-clamp-2">{order.delivery_address}</p>
                  <button
                    type="button"
                    onClick={handleCopyAddress}
                    className="mt-2 inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1 text-xs font-bold text-zinc-700 hover:bg-zinc-100 transition"
                  >
                    📋 {addressCopied ? t("copied") : t("copyAddress")}
                  </button>
                </div>
              )}
            </div>

            {/* Rider Details: only actionable while ready (assign) or
                out_for_delivery (edit). Completed/delivered/cancelled orders
                never show rider UI — the record lives in history. */}
            {order.fulfilment_type === "delivery" &&
            (order.status === "ready" || order.status === "out_for_delivery") && (
              <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">{t("rider")}</span>
                  {canManage && (
                    <button
                      type="button"
                      onClick={() => {
                        setRiderNameInput(order.rider_name || "");
                        setRiderPhoneInput(order.rider_phone || "");
                        setRiderError(null);
                        setShowRiderModal(true);
                      }}
                      className="text-[11px] font-semibold text-orange-700 hover:underline"
                    >
                      {order.status === "out_for_delivery" ? t("editRider") : t("assignRider")}
                    </button>
                  )}
                </div>
                {order.rider_name ? (
                  <>
                    <p className="font-semibold text-zinc-900">{order.rider_name}</p>
                    {order.rider_phone ? (
                      <div className="pt-1">
                        <a
                          href={`tel:${order.rider_phone.replace(/[^\d+]/g, "")}`}
                          className="inline-flex min-h-[44px] items-center gap-1.5 rounded-lg border border-zinc-200 bg-zinc-50 px-3 py-1.5 text-xs font-bold text-zinc-800 hover:bg-zinc-100 transition"
                        >
                          📞 {t("callRider")}
                        </a>
                      </div>
                    ) : (
                      <p className="text-xs text-zinc-400 italic">No phone recorded</p>
                    )}
                  </>
                ) : (
                  <p className="text-xs text-zinc-400 italic">No rider assigned yet</p>
                )}
              </div>
            )}

            {/* Timing Information */}
            <div className="rounded-xl border border-zinc-200 bg-white p-3.5 space-y-2">
              <span className="text-[11px] font-bold uppercase tracking-wider text-zinc-400">Timing</span>
              {order.scheduled_for ? (
                <div>
                  <span className="text-xs text-zinc-500">{t("scheduledFor")}:</span>
                  <p className="font-semibold text-zinc-800 text-xs">
                    {new Date(order.scheduled_for).toLocaleString("en-US", { dateStyle: "medium", timeStyle: "short" })}
                  </p>
                </div>
              ) : (
                <p className="text-xs text-zinc-600 font-medium">As soon as possible (ASAP)</p>
              )}
              {order.estimated_ready_at && (
                <div className="pt-1">
                  <span className="text-xs text-zinc-500">{t("estimatedReadyTime")}:</span>
                  <p className="font-bold text-orange-700 text-xs">
                    {new Date(order.estimated_ready_at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                  </p>
                </div>
              )}
            </div>
          </div>

          {/* Customer Note */}
          {order.customer_note && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-3.5 text-sm">
              <span className="text-[11px] font-bold uppercase tracking-wider text-amber-800">{t("note")}</span>
              <p className="mt-1 text-xs text-amber-950 font-medium">{order.customer_note}</p>
            </div>
          )}

          {/* Items breakdown with options tags, subtotal, delivery fee, total */}
          <div className="rounded-xl border border-zinc-200 bg-white p-4">
            <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400 mb-3">{t("items")}</h4>
            <ul className="divide-y divide-zinc-100">
              {items.map((item, idx) => (
                <li key={idx} className="flex items-start justify-between py-2.5 text-sm">
                  <div>
                    <p className="font-semibold text-zinc-900">
                      {item.quantity} × {item.name}
                    </p>
                    {item.chosen_options && item.chosen_options.length > 0 && (
                      <div className="flex flex-wrap gap-1 mt-1">
                        {item.chosen_options.map((opt, oIdx) => (
                          <span
                            key={oIdx}
                            className="inline-flex rounded-md bg-zinc-100 px-2 py-0.5 text-[11px] font-medium text-zinc-600"
                          >
                            {formatChosenMenuOption(opt)}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <span className="font-medium text-zinc-800 tabular-nums ml-4">
                    {formatCurrency(item.line_total, order.currency || "XOF", locale)}
                  </span>
                </li>
              ))}
            </ul>
            <div className="pt-3 mt-2 border-t border-zinc-100 space-y-1.5 text-xs">
              <div className="flex items-center justify-between text-zinc-600">
                <span>{t("subtotal")}</span>
                <span className="tabular-nums font-medium">
                  {formatCurrency(
                    order.subtotal || Math.max(0, order.total_amount - (order.delivery_fee || 0)),
                    order.currency || "XOF",
                    locale
                  )}
                </span>
              </div>
              {order.fulfilment_type === "delivery" && (
                <div className="flex items-center justify-between text-zinc-600">
                  <span>{t("deliveryFee")}</span>
                  <span className="tabular-nums font-medium">
                    {order.delivery_fee > 0
                      ? formatCurrency(order.delivery_fee, order.currency || "XOF", locale)
                      : t("freeDelivery")}
                  </span>
                </div>
              )}
              <div className="flex items-center justify-between pt-1 border-t border-zinc-100 text-sm font-bold text-zinc-900">
                <span>{t("total")}</span>
                <span className="tabular-nums text-base">{formattedTotal}</span>
              </div>
            </div>
          </div>

          {/* Status History Timeline */}
          {statusHistory.length > 0 && (
            <div className="rounded-xl border border-zinc-200 bg-white p-4 space-y-2">
              <h4 className="text-xs font-bold uppercase tracking-wider text-zinc-400">History</h4>
              <ul className="space-y-2 text-xs">
                {statusHistory.map((hist, idx) => (
                  <li key={idx} className="flex items-start justify-between gap-2 text-zinc-600 border-b border-zinc-50 pb-1.5 last:border-none">
                    <div>
                      <span className="font-semibold text-zinc-800 capitalize">{hist.status}</span>
                      {hist.reason && <span className="ml-1 text-zinc-500">({hist.reason})</span>}
                      {hist.rider_name && <span className="ml-1 text-zinc-500">[Rider: {hist.rider_name}]</span>}
                      {hist.note && <span className="ml-1 text-zinc-500">— {hist.note}</span>}
                    </div>
                    <span className="text-[11px] text-zinc-400 shrink-0 tabular-nums">
                      {new Date(hist.at).toLocaleTimeString("en-US", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}

      {/* ACCEPT MODAL */}
      {showAcceptModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">{t("acceptModalTitle")}</h3>
            <p className="text-xs text-zinc-500">{t("readyIn")}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {[10, 20, 30, 45, 60].map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => {
                    setPrepMinutes(min);
                    setCustomTime("");
                  }}
                  className={`min-h-[44px] rounded-lg border text-xs font-bold transition ${
                    prepMinutes === min && !customTime
                      ? "border-orange-600 bg-orange-50 text-orange-700"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  +{min}m
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">{t("customTime")}</label>
              <input
                type="datetime-local"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-zinc-200 px-3 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAcceptModal(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmAccept}
                className="min-h-[44px] flex-1 rounded-xl bg-orange-700 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                {t("accept")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ADJUST TIME MODAL */}
      {showAdjustModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">{t("adjustReadyTime")}</h3>
            <p className="text-xs text-zinc-500">{t("readyIn")}</p>
            <div className="grid grid-cols-5 gap-1.5">
              {[10, 20, 30, 45, 60].map((min) => (
                <button
                  key={min}
                  type="button"
                  onClick={() => {
                    setPrepMinutes(min);
                    setCustomTime("");
                  }}
                  className={`min-h-[44px] rounded-lg border text-xs font-bold transition ${
                    prepMinutes === min && !customTime
                      ? "border-orange-600 bg-orange-50 text-orange-700"
                      : "border-zinc-200 bg-zinc-50 text-zinc-700 hover:bg-zinc-100"
                  }`}
                >
                  +{min}m
                </button>
              ))}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">{t("customTime")}</label>
              <input
                type="datetime-local"
                value={customTime}
                onChange={(e) => setCustomTime(e.target.value)}
                className="w-full min-h-[44px] rounded-lg border border-zinc-200 px-3 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowAdjustModal(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleAdjustTime}
                className="min-h-[44px] flex-1 rounded-xl bg-orange-700 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                Save
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CANCEL / DECLINE MODAL */}
      {showCancelModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">{t("cancelModalTitle")}</h3>

            {isPaidOnline && (
              <div className="rounded-xl border border-amber-300 bg-amber-50 p-3 text-xs text-amber-900 space-y-1">
                <p className="font-bold">⚠️ Warning: Paid Online</p>
                <p>
                  {t("onlineRefundWarning", {
                    ref: order.provider_reference || "N/A",
                  })}
                </p>
              </div>
            )}

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">{t("cancelReasonLabel")}</label>
              <select
                value={cancelReason}
                onChange={(e) => setCancelReason(e.target.value as CancellationReasonCode)}
                className="w-full min-h-[44px] rounded-lg border border-zinc-200 px-3 text-xs"
              >
                <option value="out_of_stock">{t("reasonOutOfStock")}</option>
                <option value="kitchen_closed">{t("reasonKitchenClosed")}</option>
                <option value="cannot_deliver_there">{t("reasonCannotDeliverThere")}</option>
                <option value="other">{t("reasonOther")}</option>
              </select>
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-500 font-medium">Note (optional)</label>
              <textarea
                value={cancelNote}
                maxLength={300}
                onChange={(e) => setCancelNote(e.target.value)}
                placeholder={t("cancelNotePlaceholder")}
                className="w-full min-h-[80px] rounded-lg border border-zinc-200 p-2.5 text-xs"
              />
            </div>

            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCancelModal(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmCancel}
                className="min-h-[44px] flex-1 rounded-xl bg-red-600 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
              >
                {t("cancelOrder")}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* COLLECT PAYMENT CONFIRMATION MODAL */}
      {showCollectPaymentModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">{t("paymentCollectionConfirmTitle")}</h3>
            <p className="text-xs text-zinc-600">
              {t("paymentCollectionConfirmPrompt", { total: formattedTotal })}
            </p>
            <div className="flex gap-2 pt-2">
              <button
                type="button"
                onClick={() => setShowCollectPaymentModal(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={isSubmitting}
                onClick={handleConfirmPaymentAndComplete}
                className="min-h-[44px] flex-1 rounded-xl bg-emerald-700 text-xs font-bold text-white hover:bg-emerald-800 disabled:opacity-50"
              >
                {t("confirmAndComplete")}
              </button>
            </div>
          </div>
        </div>
      )}
      {/* RIDER ASSIGNMENT / EDIT MODAL */}
      {showRiderModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-sm rounded-xl bg-white p-5 shadow-xl space-y-4">
            <h3 className="text-base font-bold text-zinc-900">
              {order.status === "ready" ? t("markOutForDelivery") : t("editRider")}
            </h3>
            <p className="text-xs text-zinc-500">
              {order.status === "ready"
                ? "Assign a courier or rider to take this order to the customer."
                : "Update the rider details for this order."}
            </p>

            <div className="space-y-1">
              <label className="text-xs text-zinc-600 font-semibold">{t("riderName")} *</label>
              <input
                type="text"
                required
                maxLength={80}
                value={riderNameInput}
                onChange={(e) => setRiderNameInput(e.target.value)}
                placeholder="e.g. Kouamé, Moussa…"
                className="w-full min-h-[44px] rounded-lg border border-zinc-200 px-3 text-xs focus:outline-none focus:border-orange-500"
              />
              {recentRiderSuggestions.length > 0 && (
                <div className="pt-1 flex flex-wrap items-center gap-1.5">
                  <span className="text-[10px] text-zinc-400 font-medium">Recent:</span>
                  {recentRiderSuggestions.map((name) => (
                    <button
                      key={name}
                      type="button"
                      onClick={() => setRiderNameInput(name)}
                      className="rounded-md border border-zinc-200 bg-zinc-50 px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100"
                    >
                      {name}
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="space-y-1">
              <label className="text-xs text-zinc-600 font-semibold">{t("riderPhone")} (optional)</label>
              <input
                type="tel"
                maxLength={32}
                value={riderPhoneInput}
                onChange={(e) => setRiderPhoneInput(e.target.value)}
                placeholder="e.g. +225 07000000"
                className="w-full min-h-[44px] rounded-lg border border-zinc-200 px-3 text-xs focus:outline-none focus:border-orange-500"
              />
            </div>

            {riderError && (
              <div
                role="alert"
                className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium"
              >
                {riderError}
              </div>
            )}

            <div className="flex gap-2 pt-2 border-t border-zinc-100">
              <button
                type="button"
                onClick={() => setShowRiderModal(false)}
                className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
              >
                {t("close")}
              </button>
              <button
                type="button"
                disabled={isSubmitting || !riderNameInput.trim()}
                onClick={handleSaveRiderModal}
                className="min-h-[44px] flex-1 rounded-xl bg-orange-700 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
              >
                {isSubmitting
                  ? "Saving…"
                  : order.status === "ready"
                  ? t("markOutForDelivery")
                  : "Save details"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const t = useTranslations("Orders");
  const variants: Record<string, string> = {
    pending: "bg-amber-50 text-amber-800 border-amber-200 font-semibold",
    accepted: "bg-blue-50 text-blue-700 border-blue-200 font-semibold",
    preparing: "bg-blue-50 text-blue-800 border-blue-200 font-semibold",
    ready: "bg-emerald-50 text-emerald-800 border-emerald-200 font-semibold",
    out_for_delivery: "bg-sky-50 text-sky-800 border-sky-200 font-semibold",
    delivered: "bg-zinc-100 text-zinc-600 border-zinc-200 font-medium",
    completed: "bg-zinc-100 text-zinc-600 border-zinc-200 font-medium",
    cancelled: "bg-red-50 text-red-600 border-red-200 font-medium",
  };
  const labelMap: Record<string, string> = {
    out_for_delivery: t("outForDelivery"),
    delivered: t("delivered"),
  };
  const cls = variants[status] ?? "bg-zinc-100 text-zinc-500 border-zinc-200";
  const label = labelMap[status] ?? status;
  return (
    <span className={`inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs capitalize ${cls}`}>
      {label}
    </span>
  );
}

function PaymentBadge({ badgeKey }: { badgeKey: string }) {
  const t = useTranslations("Orders");
  const map: Record<string, { cls: string; label: string }> = {
    paidOnline: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: t("paidOnline") },
    paid: { cls: "bg-emerald-50 text-emerald-700 border-emerald-200", label: t("paid") },
    payOnPickup: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200", label: t("payOnPickup") },
    payOnDelivery: { cls: "bg-zinc-100 text-zinc-700 border-zinc-200", label: t("payOnDelivery") },
    awaitingPayment: { cls: "bg-amber-50 text-amber-700 border-amber-200", label: t("awaitingPayment") },
    expired: { cls: "bg-red-50 text-red-600 border-red-200", label: t("expired") },
  };

  const badge = map[badgeKey] || { cls: "bg-zinc-100 text-zinc-600 border-zinc-200", label: badgeKey };
  return (
    <span className={`inline-flex items-center rounded-full border px-2 py-0.5 text-[11px] font-medium ${badge.cls}`}>
      {badge.label}
    </span>
  );
}

function formatTimeAgo(isoDate: string): string {
  const diffSec = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  if (diffSec < 60) return "just now";
  const diffMin = Math.floor(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.floor(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDays = Math.floor(diffHr / 24);
  return `${diffDays}d ago`;
}
