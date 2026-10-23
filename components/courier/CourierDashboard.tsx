"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  Bike,
  MapPin,
  Store,
  Phone,
  CheckCircle2,
  AlertCircle,
  AlertTriangle,
  ShieldCheck,
  Navigation,
  RotateCw,
  XCircle,
  Package,
  DollarSign,
  Compass,
  MessageCircle,
} from "lucide-react";
import {
  COURIER_FEED_POLL_MS,
  courierNavigationUrls,
  deriveCourierState,
  formatCourierBusinessName,
  formatCourierGreeting,
  formatCourierItems,
} from "@/lib/courier/dashboard-model";
import DeliveryMap from "@/components/delivery/DeliveryMap";

type Screen = "loading" | "ready" | "session-ended" | "error";

type CourierOffer = {
  offer_id: string;
  order_id: string;
  offered_at: string;
  pickup_name: string | null;
  pickup_address: string | null;
  delivery_address: string | null;
  items: unknown;
  amount_to_collect: number | null;
  currency: string | null;
};

type AssignedOrder = {
  id: string;
  orderNumber: string;
  status: string;
  customerName: string | null;
  customerPhone: string | null;
  pickupName: string | null;
  pickupAddress: string | null;
  deliveryAddress: string | null;
  items: unknown;
  amountToCollect: number;
  requiresCashCollection: boolean;
  currency: string | null;
  deliveryIssue?: {
    category: string;
    note?: string | null;
    reported_at?: string;
    worker_name?: string;
  } | null;
};

type CompletedDelivery = {
  id: string;
  orderNumber: string;
  deliveryAddress: string | null;
  totalAmount: number;
  currency: string | null;
  paymentMethod: string;
  paymentStatus: string;
  deliveredAt: string;
};

type CourierFeed = {
  ok: true;
  isAvailable: boolean;
  state: string;
  businessName?: string | null;
  courierName?: string | null;
  offers: CourierOffer[];
  assignedOrder: AssignedOrder | null;
  recentDeliveries?: CompletedDelivery[];
  cashCollectedTotal?: number;
};

const QUICK_DECLINE_REASONS = [
  "Too far",
  "Vehicle issue",
  "Low battery",
  "Shift ending",
] as const;

const ISSUE_CATEGORIES = [
  { key: "customer_unavailable", label: "Customer unavailable" },
  { key: "invalid_address", label: "Incorrect / inaccessible address" },
  { key: "customer_unreachable", label: "Customer unreachable" },
  { key: "pickup_issue", label: "Pickup / restaurant problem" },
  { key: "vehicle_issue", label: "Vehicle or bike problem" },
  { key: "safety_concern", label: "Safety concern" },
  { key: "other", label: "Other" },
] as const;

function formatAmount(value: number | null | undefined, currency: string | null | undefined) {
  try {
    return new Intl.NumberFormat(undefined, {
      style: "currency",
      currency: currency || "XOF",
      maximumFractionDigits: 2,
    }).format(Number(value ?? 0));
  } catch {
    return `${Number(value ?? 0).toLocaleString()} ${currency || "XOF"}`;
  }
}

function ItemList({ value }: { value: unknown }) {
  const items = formatCourierItems(value);
  if (!items.length) return <p className="text-xs text-zinc-500">No item details provided.</p>;
  return (
    <ul className="divide-y divide-zinc-100 rounded-lg border border-zinc-100 bg-zinc-50/50 text-xs text-zinc-800 dark:border-zinc-800 dark:bg-zinc-900/50 dark:text-zinc-200">
      {items.map((item, index) => (
        <li key={`${index}-${item}`} className="flex items-center gap-2 px-3 py-2 font-medium">
          <Package className="h-3.5 w-3.5 text-zinc-400 shrink-0" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  );
}

export default function CourierDashboard({
  initialBusinessName,
  initialCourierName,
}: {
  initialBusinessName?: string | null;
  initialCourierName?: string | null;
} = {}) {
  const [screen, setScreen] = useState<Screen>("loading");
  const [feed, setFeed] = useState<CourierFeed | null>(null);
  const [pageError, setPageError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [busyDelivery, setBusyDelivery] = useState(false);
  const [cashCollected, setCashCollected] = useState(false);
  const [declineMessages, setDeclineMessages] = useState<Record<string, string>>({});
  const [busyPickup, setBusyPickup] = useState(false);
  const [busyDepart, setBusyDepart] = useState(false);
  const [showIssueModal, setShowIssueModal] = useState(false);
  const [issueCategory, setIssueCategory] = useState<string>("");
  const [issueNote, setIssueNote] = useState("");
  const [busyIssue, setBusyIssue] = useState(false);
  const [gpsStatus, setGpsStatus] = useState<"idle" | "acquiring" | "active" | "denied" | "error">("idle");
  const [courierCoords, setCourierCoords] = useState<{
    latitude: number;
    longitude: number;
    heading?: number | null;
    accuracy?: number | null;
  } | null>(null);
  const lastDispatchedRef = useRef<number>(0);
  const inFlight = useRef(0);
  const requestSequence = useRef(0);

  const refresh = useCallback(async (force = false) => {
    if (typeof document !== "undefined" && document.visibilityState !== "visible") return;
    if (inFlight.current > 0 && !force) return;
    inFlight.current += 1;
    const requestId = ++requestSequence.current;
    try {
      const response = await fetch("/api/courier/orders", { cache: "no-store" });
      const result = await response.json().catch(() => null);
      if (requestId !== requestSequence.current) return;
      if (response.status === 401) {
        setFeed(null);
        setScreen("session-ended");
        setPageError("");
        return;
      }
      if (!response.ok || !result?.ok || !Array.isArray(result.offers)) {
        throw new Error(result?.error || "Courier orders could not be loaded. Try again.");
      }
      setFeed(result as CourierFeed);
      setScreen("ready");
      setPageError("");
    } catch (error) {
      if (requestId !== requestSequence.current) return;
      setFeed(null);
      setScreen("error");
      setPageError(error instanceof Error ? error.message : "Courier orders could not be loaded. Try again.");
    } finally {
      inFlight.current = Math.max(0, inFlight.current - 1);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const interval = window.setInterval(() => { void refresh(); }, COURIER_FEED_POLL_MS);
    const onVisibilityChange = () => {
      if (document.visibilityState === "visible") void refresh();
    };
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", onVisibilityChange);
    };
  }, [refresh]);

  async function handleSessionFailure(response: Response) {
    if (response.status !== 401) return false;
    setFeed(null);
    setScreen("session-ended");
    setActionNotice("");
    return true;
  }

  async function updateAvailability(isAvailable: boolean) {
    setAvailabilityBusy(true);
    setActionNotice("");
    try {
      const response = await fetch("/api/courier/availability", {
        method: "PATCH",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ isAvailable }),
      });
      const result = await response.json().catch(() => null);
      if (await handleSessionFailure(response)) return;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Availability could not be updated.");
      setFeed((current) => current ? {
        ...current,
        isAvailable: result.isAvailable === true,
        state: result.state || deriveCourierState(result.isAvailable === true, Boolean(current.assignedOrder)),
      } : current);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Availability could not be updated.");
    } finally {
      setAvailabilityBusy(false);
    }
  }

  async function respondToOffer(offer: CourierOffer, action: "accept" | "decline") {
    setBusyOfferId(offer.offer_id);
    setActionNotice("");
    const endpoint = `/api/courier/offers/${encodeURIComponent(offer.order_id)}/${action}`;
    try {
      const response = await fetch(endpoint, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(action === "decline" ? { message: declineMessages[offer.offer_id] || "" } : {}),
      });
      const result = await response.json().catch(() => null);
      if (await handleSessionFailure(response)) return;
      if (!response.ok) {
        const taken = action === "accept" && response.status === 409 && /taken by another courier/i.test(result?.error || "");
        if (taken) {
          setFeed((current) => current ? {
            ...current,
            offers: current.offers.filter((item) => item.offer_id !== offer.offer_id),
            assignedOrder: null,
          } : current);
          setActionNotice("This delivery was taken by another courier.");
          void refresh(true);
          return;
        }
        throw new Error(result?.error || (action === "accept" ? "This offer could not be accepted." : "This offer could not be declined."));
      }
      // Never keep the mutation response: the accept endpoint contains customer
      // details. A fresh scoped feed supplies those details only after winning.
      setFeed((current) => current ? {
        ...current,
        offers: current.offers.filter((item) => item.offer_id !== offer.offer_id),
        assignedOrder: null,
      } : current);
      setDeclineMessages((current) => {
        const next = { ...current };
        delete next[offer.offer_id];
        return next;
      });
      setActionNotice(action === "accept" ? "Delivery accepted." : "Offer declined.");
      await refresh(true);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "The offer response could not be saved.");
    } finally {
      setBusyOfferId(null);
    }
  }

  async function markDelivered() {
    const assigned = feed?.assignedOrder;
    if (!assigned) return;
    if (assigned.requiresCashCollection && !cashCollected) {
      setActionNotice("Confirm that you collected the cash before marking this delivery complete.");
      return;
    }
    setBusyDelivery(true);
    setActionNotice("");
    try {
      const response = await fetch(`/api/courier/orders/${encodeURIComponent(assigned.id)}/delivered`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ cashCollectedConfirmed: cashCollected }),
      });
      const result = await response.json().catch(() => null);
      if (await handleSessionFailure(response)) return;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Delivery could not be marked complete.");
      setFeed((current) => current ? { ...current, assignedOrder: null } : current);
      setCashCollected(false);
      setActionNotice("Delivery marked complete.");
      await refresh(true);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Delivery could not be marked complete.");
    } finally {
      setBusyDelivery(false);
    }
  }

  async function confirmPickup() {
    const assigned = feed?.assignedOrder;
    if (!assigned) return;
    setBusyPickup(true);
    setActionNotice("");
    try {
      const response = await fetch(`/api/courier/orders/${encodeURIComponent(assigned.id)}/pickup`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json().catch(() => null);
      if (await handleSessionFailure(response)) return;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Pickup could not be confirmed.");
      setActionNotice("Pickup confirmed! You can now start delivery to the customer.");
      await refresh(true);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Pickup could not be confirmed.");
    } finally {
      setBusyPickup(false);
    }
  }

  async function startDelivery() {
    const assigned = feed?.assignedOrder;
    if (!assigned) return;
    setBusyDepart(true);
    setActionNotice("");
    try {
      const response = await fetch(`/api/courier/orders/${encodeURIComponent(assigned.id)}/depart`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
      });
      const result = await response.json().catch(() => null);
      if (await handleSessionFailure(response)) return;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Delivery could not be started.");
      setActionNotice("Delivery started. Heading to customer destination!");
      await refresh(true);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Delivery could not be started.");
    } finally {
      setBusyDepart(false);
    }
  }

  async function submitIssue() {
    const assigned = feed?.assignedOrder;
    if (!assigned || !issueCategory) return;
    setBusyIssue(true);
    try {
      const response = await fetch(`/api/courier/orders/${encodeURIComponent(assigned.id)}/issue`, {
        method: "POST",
        cache: "no-store",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category: issueCategory, note: issueNote }),
      });
      const result = await response.json().catch(() => null);
      if (await handleSessionFailure(response)) return;
      if (!response.ok || !result?.ok) throw new Error(result?.error || "Issue could not be reported.");
      setShowIssueModal(false);
      setIssueCategory("");
      setIssueNote("");
      setActionNotice("Delivery issue reported. Restaurant staff has been notified.");
      await refresh(true);
    } catch (error) {
      setActionNotice(error instanceof Error ? error.message : "Issue could not be reported.");
    } finally {
      setBusyIssue(false);
    }
  }

  const assigned = feed?.assignedOrder ?? null;
  const derivedState = feed ? deriveCourierState(feed.isAvailable, Boolean(assigned)) : "Offline";
  const isAvailable = feed?.isAvailable === true;

  useEffect(() => {
    const isTransit =
      assigned && (assigned.status === "picked_up" || assigned.status === "out_for_delivery");
    if (!isTransit || typeof window === "undefined" || !("geolocation" in navigator)) {
      setGpsStatus("idle");
      setCourierCoords(null);
      return;
    }

    setGpsStatus("acquiring");

    const watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const coords = {
          latitude: pos.coords.latitude,
          longitude: pos.coords.longitude,
          heading: pos.coords.heading,
          accuracy: pos.coords.accuracy,
        };
        setCourierCoords(coords);
        setGpsStatus("active");

        const now = Date.now();
        if (now - lastDispatchedRef.current >= 5000) {
          lastDispatchedRef.current = now;
          void fetch(`/api/courier/orders/${encodeURIComponent(assigned.id)}/location`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              latitude: pos.coords.latitude,
              longitude: pos.coords.longitude,
              accuracy: pos.coords.accuracy,
              heading: pos.coords.heading,
              speed: pos.coords.speed,
              recordedAt: new Date(pos.timestamp).toISOString(),
            }),
          }).catch(() => {});
        }
      },
      (err) => {
        if (err.code === 1) {
          setGpsStatus("denied");
        } else {
          setGpsStatus("error");
        }
      },
      {
        enableHighAccuracy: true,
        timeout: 15000,
        maximumAge: 3000,
      }
    );

    return () => {
      navigator.geolocation.clearWatch(watchId);
      setGpsStatus("idle");
      setCourierCoords(null);
    };
  }, [assigned]);

  const businessName =
    feed?.businessName ??
    feed?.assignedOrder?.pickupName ??
    feed?.offers?.[0]?.pickup_name ??
    initialBusinessName ??
    null;
  const businessDisplayName = formatCourierBusinessName(businessName);
  const courierName = feed?.courierName ?? initialCourierName ?? null;
  const greeting = formatCourierGreeting(courierName);

  return (
    <main className="mx-auto w-full max-w-5xl space-y-5 px-3.5 py-4 sm:px-6 sm:py-8">
      {/* ── Top Header Bar (Driver Profile & Availability) ─────────────── */}
      <header className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs sm:p-5">
        <div className="flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-orange-700 text-white shadow-xs">
              <Bike className="h-6 w-6" />
            </div>
            <div>
              <div className="flex items-center gap-2">
                <span className="text-xs font-bold uppercase tracking-wider text-orange-700">{businessDisplayName}</span>
                <span className="inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold border border-zinc-200 dark:border-zinc-700 bg-zinc-50 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-300">
                  <span
                    className={`h-2 w-2 rounded-full ${
                      derivedState === "Available"
                        ? "bg-emerald-500 animate-pulse"
                        : derivedState === "On delivery" || derivedState === "Offline, delivery in progress"
                        ? "bg-amber-500"
                        : "bg-zinc-400"
                    }`}
                  />
                  {derivedState}
                </span>
              </div>
              <h1 className="text-lg sm:text-xl font-bold text-zinc-950 dark:text-white">
                {greeting}
              </h1>
              <p className="text-xs text-zinc-500 dark:text-zinc-400">
                {isAvailable
                  ? "You're on duty • Available for new orders"
                  : "You're currently offline. Switch on to receive offers."}
              </p>
            </div>
          </div>

          {/* Availability Switch */}
          {screen === "ready" && feed && (
            <div className="flex items-center gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-950 px-3.5 py-2">
              <div className="text-right">
                <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                  {isAvailable ? "Online" : "Offline"}
                </p>
                <p className="text-[10px] text-zinc-500">Shift status</p>
              </div>
              <Switch
                checked={isAvailable}
                disabled={availabilityBusy}
                onCheckedChange={(checked) => void updateAvailability(checked)}
                aria-label="Available for delivery offers"
              />
            </div>
          )}
        </div>

        {/* Quick summary stats */}
        {screen === "ready" && feed && (
          <div className="mt-4 grid grid-cols-2 gap-2 border-t border-zinc-100 dark:border-zinc-800 pt-3 text-xs sm:grid-cols-4">
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 border border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-400 font-medium">Active Delivery</span>
              <p className="font-bold text-zinc-900 dark:text-zinc-100 mt-0.5 truncate">
                {assigned ? `#${assigned.orderNumber}` : "None"}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 border border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-400 font-medium">Available Offers</span>
              <p className="font-bold text-orange-700 dark:text-orange-400 mt-0.5">
                {feed.offers.length} {feed.offers.length === 1 ? "offer" : "offers"}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 border border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-400 font-medium">Cash in Hand</span>
              <p className="font-bold text-emerald-700 dark:text-emerald-400 mt-0.5">
                {formatAmount(feed.cashCollectedTotal ?? 0, assigned?.currency || "XOF")}
              </p>
            </div>
            <div className="rounded-lg bg-zinc-50 dark:bg-zinc-800/50 px-3 py-2 border border-zinc-100 dark:border-zinc-800">
              <span className="text-zinc-400 font-medium">GPS Signal</span>
              <p className="font-medium text-zinc-800 dark:text-zinc-200 mt-0.5 flex items-center gap-1.5 capitalize">
                <span
                  className={`h-2 w-2 rounded-full ${
                    gpsStatus === "active"
                      ? "bg-emerald-500 animate-pulse"
                      : gpsStatus === "acquiring"
                      ? "bg-amber-400"
                      : gpsStatus === "denied"
                      ? "bg-red-500"
                      : "bg-zinc-400"
                  }`}
                />
                {gpsStatus}
              </p>
            </div>
          </div>
        )}
      </header>

      {/* Action Notice feedback */}
      {actionNotice && (
        <div
          role="status"
          className="flex items-center justify-between gap-3 rounded-xl border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40 px-4 py-3 text-sm font-medium text-orange-950 dark:text-orange-200 shadow-xs"
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-orange-700 shrink-0" />
            <span>{actionNotice}</span>
          </div>
          <button
            type="button"
            onClick={() => setActionNotice("")}
            className="text-xs font-semibold text-orange-700 hover:underline cursor-pointer"
          >
            Dismiss
          </button>
        </div>
      )}

      {/* Loading Skeleton */}
      {screen === "loading" && (
        <div className="space-y-4">
          <div className="rounded-xl border border-zinc-200 bg-white p-6 shadow-xs animate-pulse space-y-4">
            <div className="h-5 w-48 rounded bg-zinc-200" />
            <div className="h-4 w-full rounded bg-zinc-100" />
            <div className="h-24 w-full rounded bg-zinc-50" />
          </div>
          <p role="status" className="py-4 text-center text-xs text-zinc-500">
            Connecting to courier service…
          </p>
        </div>
      )}

      {/* Session Ended State */}
      {screen === "session-ended" && (
        <Card className="rounded-xl border-zinc-200 shadow-xs">
          <CardContent className="space-y-3 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-amber-100 text-amber-700">
              <AlertCircle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-zinc-950">Your courier session has ended</h2>
            <p className="text-sm text-zinc-600 max-w-sm mx-auto">
              Your access link may have expired or been refreshed. Ask the business owner for a new invitation to sign in again.
            </p>
            <div className="pt-2">
              <Button variant="outline" className="rounded-xl font-semibold" onClick={() => void refresh()}>
                <RotateCw className="mr-2 h-4 w-4" /> Check again
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Error State */}
      {screen === "error" && (
        <Card className="rounded-xl border-red-200 bg-red-50/30 shadow-xs">
          <CardContent className="space-y-3 p-6 text-center sm:p-8">
            <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-red-100 text-red-700">
              <XCircle className="h-6 w-6" />
            </div>
            <h2 className="text-lg font-bold text-zinc-950">We couldn’t load your deliveries</h2>
            <p role="alert" className="text-sm text-red-700 max-w-md mx-auto">{pageError}</p>
            <div className="pt-2">
              <Button className="rounded-xl font-semibold bg-orange-700 text-white hover:bg-orange-800" onClick={() => void refresh()}>
                <RotateCw className="mr-2 h-4 w-4" /> Retry
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* ── Ready Screen: Responsive Multi-Column Layout ───────────────── */}
      {screen === "ready" && feed && (
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-3">
          {/* ── Left / Main Column (Active Delivery + Offers) ───────────── */}
          <div className="space-y-5 lg:col-span-2">
            {/* Active Delivery Card */}
            {assigned && (
              <Card className="rounded-xl border-2 border-orange-700/80 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
                <div className="bg-orange-700 px-4 py-3 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Bike className="h-4 w-4" />
                    <span className="text-xs font-bold uppercase tracking-wider">
                      {assigned.status === "ready"
                        ? "Pickup at Restaurant"
                        : assigned.status === "picked_up"
                        ? "Picked Up — Ready to Depart"
                        : "Out for Delivery"}
                    </span>
                  </div>
                  <span className="rounded-md bg-white/20 px-2 py-0.5 text-xs font-bold text-white">
                    #{assigned.orderNumber}
                  </span>
                </div>

                {/* Delivery Issue Alert Banner */}
                {assigned.deliveryIssue && (
                  <div className="mx-4 mt-4 rounded-xl border border-red-300 bg-red-50 p-3 text-xs text-red-950 flex items-start gap-2.5">
                    <AlertTriangle className="h-4 w-4 text-red-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-red-900">
                        Issue Reported: {assigned.deliveryIssue.category.replace(/_/g, " ")}
                      </p>
                      {assigned.deliveryIssue.note && (
                        <p className="mt-0.5 text-red-800">{assigned.deliveryIssue.note}</p>
                      )}
                      <p className="mt-0.5 text-[10px] text-red-700">
                        Restaurant staff has been notified.
                      </p>
                    </div>
                  </div>
                )}

                <CardContent className="space-y-4 p-4 sm:p-5">
                  {/* Embedded Live Map (when in transit) */}
                  {assigned.status !== "ready" && courierCoords && (
                    <div className="rounded-xl overflow-hidden border border-zinc-200 dark:border-zinc-800 shadow-2xs">
                      <DeliveryMap
                        courierLocation={courierCoords}
                        height="220px"
                        interactive={true}
                        className="w-full"
                      />
                    </div>
                  )}

                  {/* Pickup & Destination Stepper Box */}
                  <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-zinc-50/70 dark:bg-zinc-900/50 p-3.5 space-y-3">
                    <div className="flex items-start gap-3">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        assigned.status === "ready"
                          ? "bg-orange-700 text-white animate-pulse"
                          : "bg-emerald-600 text-white"
                      }`}>
                        {assigned.status === "ready" ? <Store className="h-4 w-4" /> : <CheckCircle2 className="h-4 w-4" />}
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Pickup</p>
                          {assigned.status !== "ready" && (
                            <span className="text-[10px] font-bold text-emerald-600">Picked up</span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-zinc-950 dark:text-white truncate">
                          {assigned.pickupName || "Restaurant"}
                        </p>
                        <p className="text-[11px] text-zinc-500 truncate">
                          {assigned.pickupAddress || "Address not specified"}
                        </p>
                      </div>
                    </div>

                    <div className="ml-3.5 border-l-2 border-dashed border-zinc-200 dark:border-zinc-700 h-3" />

                    <div className="flex items-start gap-3">
                      <div className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
                        assigned.status === "ready"
                          ? "bg-zinc-200 text-zinc-500 dark:bg-zinc-800"
                          : assigned.status === "picked_up"
                          ? "bg-amber-500 text-white"
                          : "bg-orange-700 text-white"
                      }`}>
                        <MapPin className="h-4 w-4" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between">
                          <p className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Destination</p>
                          {assigned.status === "out_for_delivery" && (
                            <span className="text-[10px] font-bold text-orange-700">In transit</span>
                          )}
                        </div>
                        <p className="text-xs font-bold text-zinc-950 dark:text-white">
                          {assigned.deliveryAddress || "Address not provided"}
                        </p>
                      </div>
                    </div>
                  </div>

                  {/* Customer Contact & Quick Actions (visible in transit) */}
                  {assigned.status !== "ready" && (
                    <div className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 dark:border-zinc-800 p-3 bg-white dark:bg-zinc-900">
                      <div>
                        <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Customer</span>
                        <p className="text-xs font-bold text-zinc-900 dark:text-zinc-100">
                          {assigned.customerName || "Customer"}
                        </p>
                      </div>

                      <div className="flex items-center gap-2">
                        {assigned.customerPhone && (
                          <>
                            <a
                              href={`tel:${assigned.customerPhone}`}
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-zinc-900 dark:bg-zinc-100 text-white dark:text-zinc-900 px-3 text-xs font-bold shadow-2xs hover:bg-zinc-800"
                            >
                              <Phone className="h-3 w-3" />
                              <span>Call</span>
                            </a>
                            <a
                              href={`https://wa.me/${assigned.customerPhone.replace(/[^\d]/g, "")}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-flex h-9 items-center gap-1.5 rounded-lg bg-emerald-600 text-white px-3 text-xs font-bold shadow-2xs hover:bg-emerald-700"
                            >
                              <MessageCircle className="h-3 w-3" />
                              <span>WhatsApp</span>
                            </a>
                          </>
                        )}
                      </div>
                    </div>
                  )}

                  {/* Navigation Launch Links */}
                  {(() => {
                    const navAddress = assigned.status === "ready" ? assigned.pickupAddress : assigned.deliveryAddress;
                    if (!navAddress) return null;
                    const urls = courierNavigationUrls(navAddress);
                    return (
                      <div className="grid grid-cols-2 gap-2">
                        <a
                          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 shadow-xs transition"
                          href={urls.googleMaps}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Navigation className="h-3.5 w-3.5 text-blue-600" />
                          <span>Google Maps</span>
                        </a>
                        <a
                          className="inline-flex min-h-[40px] items-center justify-center gap-2 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 text-xs font-bold text-zinc-800 dark:text-zinc-200 hover:bg-zinc-50 shadow-xs transition"
                          href={urls.waze}
                          target="_blank"
                          rel="noreferrer"
                        >
                          <Navigation className="h-3.5 w-3.5 text-sky-500" />
                          <span>Waze</span>
                        </a>
                      </div>
                    );
                  })()}

                  {/* Order Items Summary */}
                  <div className="space-y-1">
                    <span className="text-[10px] font-bold uppercase tracking-wider text-zinc-400">Items</span>
                    <ItemList value={assigned.items} />
                  </div>

                  {/* Cash Collection Confirmation if needed */}
                  {assigned.status === "out_for_delivery" && (
                    <>
                      {assigned.requiresCashCollection ? (
                        <div className="rounded-xl border border-amber-300 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 p-3.5 text-amber-950 dark:text-amber-200 space-y-2">
                          <div className="flex items-center gap-2 font-bold text-xs">
                            <DollarSign className="h-4 w-4 text-amber-700 shrink-0" />
                            <span>Cash to collect: {formatAmount(assigned.amountToCollect, assigned.currency)}</span>
                          </div>
                          <label className="flex items-start gap-2.5 text-xs font-medium cursor-pointer">
                            <input
                              type="checkbox"
                              checked={cashCollected}
                              onChange={(event) => setCashCollected(event.target.checked)}
                              className="mt-0.5 h-4 w-4 rounded border-amber-500 text-orange-700 focus:ring-orange-600"
                            />
                            <span>I confirm I have physically collected this cash payment from the customer.</span>
                          </label>
                        </div>
                      ) : (
                        <div className="rounded-xl border border-emerald-200 bg-emerald-50/80 dark:border-emerald-900 dark:bg-emerald-950/40 p-3 text-xs font-medium text-emerald-950 dark:text-emerald-300 flex items-center gap-2">
                          <ShieldCheck className="h-4 w-4 text-emerald-600 shrink-0" />
                          <span>Paid online · No cash collection needed.</span>
                        </div>
                      )}
                    </>
                  )}

                  {/* ── Workflow Action Buttons ────────────────────────────── */}
                  <div className="pt-2">
                    {assigned.status === "ready" && (
                      <Button
                        className="min-h-[46px] w-full rounded-xl bg-orange-700 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50 transition cursor-pointer"
                        disabled={busyPickup}
                        onClick={() => void confirmPickup()}
                      >
                        {busyPickup ? (
                          <span className="flex items-center gap-2">
                            <RotateCw className="h-4 w-4 animate-spin" /> Confirming pickup…
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Package className="h-4 w-4" /> Confirm Pickup from Restaurant
                          </span>
                        )}
                      </Button>
                    )}

                    {assigned.status === "picked_up" && (
                      <Button
                        className="min-h-[46px] w-full rounded-xl bg-orange-700 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50 transition cursor-pointer"
                        disabled={busyDepart}
                        onClick={() => void startDelivery()}
                      >
                        {busyDepart ? (
                          <span className="flex items-center gap-2">
                            <RotateCw className="h-4 w-4 animate-spin" /> Starting delivery…
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <Bike className="h-4 w-4" /> Start Delivery (Depart for Customer)
                          </span>
                        )}
                      </Button>
                    )}

                    {assigned.status === "out_for_delivery" && (
                      <Button
                        className="min-h-[46px] w-full rounded-xl bg-orange-700 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50 transition cursor-pointer"
                        disabled={busyDelivery || (assigned.requiresCashCollection && !cashCollected)}
                        onClick={() => void markDelivered()}
                      >
                        {busyDelivery ? (
                          <span className="flex items-center gap-2">
                            <RotateCw className="h-4 w-4 animate-spin" /> Saving delivery…
                          </span>
                        ) : (
                          <span className="flex items-center gap-2">
                            <CheckCircle2 className="h-4 w-4" /> Mark Delivery Complete
                          </span>
                        )}
                      </Button>
                    )}
                  </div>

                  {/* Issue Reporting Link */}
                  <div className="pt-2 border-t border-zinc-100 dark:border-zinc-800 flex items-center justify-between text-xs">
                    <span className="text-zinc-400">Order #{assigned.orderNumber}</span>
                    <button
                      type="button"
                      onClick={() => setShowIssueModal(true)}
                      className="inline-flex items-center gap-1.5 font-semibold text-amber-700 hover:text-amber-800 hover:underline cursor-pointer"
                    >
                      <AlertTriangle className="h-3.5 w-3.5" />
                      <span>Report issue with this delivery</span>
                    </button>
                  </div>
                </CardContent>
              </Card>
            )}

            {/* Available Orders Section */}
            <div className="space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Available Orders ({feed.offers.length})
                  </h2>
                </div>
                <button
                  type="button"
                  onClick={() => void refresh(true)}
                  className="text-xs font-bold text-orange-700 hover:underline inline-flex items-center gap-1 cursor-pointer"
                >
                  <RotateCw className="h-3 w-3" />
                  <span>Refresh</span>
                </button>
              </div>

              {feed.offers.map((offer) => {
                const hasCashToCollect = offer.amount_to_collect && offer.amount_to_collect > 0;
                return (
                  <Card key={offer.offer_id} className="rounded-xl border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs overflow-hidden">
                    <CardHeader className="border-b border-zinc-100 dark:border-zinc-800 pb-3 pt-4">
                      <div className="flex items-center justify-between">
                        <CardTitle className="text-sm font-bold text-zinc-950 dark:text-white flex items-center gap-2">
                          <Bike className="h-4 w-4 text-orange-700" />
                          <span>Delivery Offer</span>
                        </CardTitle>
                        <span className="rounded-full border border-orange-200 bg-orange-50 dark:border-orange-900 dark:bg-orange-950/40 px-2.5 py-0.5 text-[11px] font-bold text-orange-800 dark:text-orange-300">
                          Ready for pickup
                        </span>
                      </div>
                    </CardHeader>

                    <CardContent className="space-y-3.5 pt-4">
                      {/* Pickup & Drop-off */}
                      <div className="grid gap-2 sm:grid-cols-2 text-xs">
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-2.5">
                          <p className="text-[10px] font-bold uppercase text-zinc-400">Pickup</p>
                          <p className="font-bold text-zinc-900 dark:text-white mt-0.5 truncate">{offer.pickup_name || "Restaurant"}</p>
                          <p className="text-[11px] text-zinc-500 line-clamp-1">{offer.pickup_address || "Address not specified"}</p>
                        </div>
                        <div className="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-900/60 p-2.5">
                          <p className="text-[10px] font-bold uppercase text-orange-700">Drop-off Destination</p>
                          <p className="font-semibold text-zinc-900 dark:text-white mt-0.5 line-clamp-2">{offer.delivery_address || "Address not provided"}</p>
                        </div>
                      </div>

                      {/* Items */}
                      <ItemList value={offer.items} />

                      {/* Payment */}
                      <div className="rounded-lg border border-zinc-100 dark:border-zinc-800 bg-zinc-50/50 p-2.5 text-xs">
                        {hasCashToCollect ? (
                          <div className="flex items-center justify-between font-bold text-amber-900 dark:text-amber-300">
                            <span>Amount to collect:</span>
                            <span className="text-sm">{formatAmount(offer.amount_to_collect, offer.currency)}</span>
                          </div>
                        ) : (
                          <div className="flex items-center gap-1.5 font-medium text-emerald-700 dark:text-emerald-400">
                            <ShieldCheck className="h-4 w-4" />
                            <span>Prepaid online (0 to collect)</span>
                          </div>
                        )}
                      </div>

                      {/* Decline Reason Chips & Note */}
                      <div className="space-y-1.5 pt-1 border-t border-zinc-100 dark:border-zinc-800">
                        <label className="block text-[11px] font-medium text-zinc-500" htmlFor={`decline-${offer.offer_id}`}>
                          Decline reason (optional):
                        </label>
                        <div className="flex flex-wrap gap-1.5">
                          {QUICK_DECLINE_REASONS.map((reason) => (
                            <button
                              key={reason}
                              type="button"
                              onClick={() =>
                                setDeclineMessages((current) => ({
                                  ...current,
                                  [offer.offer_id]: reason,
                                }))
                              }
                              className={`rounded-lg border px-2 py-0.5 text-[10px] font-medium transition cursor-pointer ${
                                declineMessages[offer.offer_id] === reason
                                  ? "border-zinc-900 bg-zinc-900 text-white dark:border-zinc-100 dark:bg-zinc-100 dark:text-zinc-900"
                                  : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                              }`}
                            >
                              {reason}
                            </button>
                          ))}
                        </div>

                        <textarea
                          id={`decline-${offer.offer_id}`}
                          maxLength={300}
                          value={declineMessages[offer.offer_id] || ""}
                          onChange={(event) =>
                            setDeclineMessages((current) => ({
                              ...current,
                              [offer.offer_id]: event.target.value.slice(0, 300),
                            }))
                          }
                          rows={2}
                          placeholder="Add a custom note (optional, max 300 chars)"
                          className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 px-3 py-2 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-orange-600 focus:outline-hidden"
                        />
                      </div>

                      {/* Action buttons */}
                      <div className="flex gap-2 pt-1">
                        <Button
                          className="min-h-[42px] flex-1 rounded-xl bg-orange-700 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50 cursor-pointer"
                          disabled={busyOfferId === offer.offer_id}
                          onClick={() => void respondToOffer(offer, "accept")}
                        >
                          {busyOfferId === offer.offer_id ? "Saving…" : "Accept Delivery"}
                        </Button>
                        <Button
                          variant="outline"
                          className="min-h-[42px] rounded-xl border-zinc-200 dark:border-zinc-800 text-xs font-bold text-zinc-700 dark:text-zinc-300 hover:bg-zinc-50 cursor-pointer"
                          disabled={busyOfferId === offer.offer_id}
                          onClick={() => void respondToOffer(offer, "decline")}
                        >
                          Decline
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}

              {/* Empty state when no offers and no assignment */}
              {!assigned && feed.offers.length === 0 && (
                <Card className="rounded-xl border-dashed border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 shadow-xs">
                  <CardContent className="p-8 text-center sm:p-12 space-y-3">
                    <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-full bg-zinc-100 dark:bg-zinc-800 text-zinc-400">
                      <Bike className="h-6 w-6" />
                    </div>
                    <h3 className="text-sm font-bold text-zinc-950 dark:text-white">No deliveries right now</h3>
                    <p className="text-xs text-zinc-500 max-w-sm mx-auto">
                      {isAvailable
                        ? "You’re marked as available. New delivery orders will appear here automatically when kitchen orders are ready."
                        : "You are currently offline. Turn your availability switch ON above to receive delivery offers."}
                    </p>
                  </CardContent>
                </Card>
              )}
            </div>
          </div>

          {/* ── Right / Secondary Column (GPS Status & Delivery Progress) ─── */}
          <div className="space-y-5 lg:col-span-1">
            {/* GPS Status Card */}
            <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs space-y-3">
              <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2.5">
                <div className="flex items-center gap-2">
                  <Compass className="w-4 h-4 text-orange-700" />
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100">
                    GPS Status
                  </h3>
                </div>
                <span
                  className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${
                    gpsStatus === "active"
                      ? "bg-emerald-50 text-emerald-700 border border-emerald-200"
                      : gpsStatus === "acquiring"
                      ? "bg-amber-50 text-amber-700 border border-amber-200"
                      : gpsStatus === "denied"
                      ? "bg-red-50 text-red-700 border border-red-200"
                      : "bg-zinc-100 text-zinc-600 border border-zinc-200"
                  }`}
                >
                  <span
                    className={`h-1.5 w-1.5 rounded-full ${
                      gpsStatus === "active"
                        ? "bg-emerald-500 animate-ping"
                        : gpsStatus === "acquiring"
                        ? "bg-amber-500"
                        : gpsStatus === "denied"
                        ? "bg-red-500"
                        : "bg-zinc-400"
                    }`}
                  />
                  {gpsStatus.toUpperCase()}
                </span>
              </div>

              {gpsStatus === "active" && courierCoords ? (
                <div className="space-y-2 text-xs">
                  <div className="flex justify-between text-zinc-500">
                    <span>Accuracy:</span>
                    <span className="font-bold text-zinc-900 dark:text-zinc-100">
                      ±{Math.round(courierCoords.accuracy ?? 0)} m
                    </span>
                  </div>
                  <div className="flex justify-between text-zinc-500">
                    <span>Coordinates:</span>
                    <span className="font-mono text-[11px] text-zinc-700 dark:text-zinc-300">
                      {courierCoords.latitude.toFixed(4)}°, {courierCoords.longitude.toFixed(4)}°
                    </span>
                  </div>
                  <p className="text-[10px] text-zinc-400 pt-1">
                    Streaming live coordinates to customer tracking view.
                  </p>
                </div>
              ) : gpsStatus === "denied" ? (
                <div className="rounded-lg bg-red-50 p-2.5 text-xs text-red-900 dark:bg-red-950/40 dark:text-red-300 space-y-1">
                  <p className="font-bold">Location Permission Denied</p>
                  <p className="text-[11px]">
                    Please grant browser location access in your device settings so customers can see your live arrival.
                  </p>
                </div>
              ) : (
                <p className="text-xs text-zinc-500">
                  GPS tracking activates automatically during active pickup and transit.
                </p>
              )}
            </div>

            {/* Delivery Progress Timeline (Matching Mockup) */}
            {assigned && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs space-y-3">
                <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-900 dark:text-zinc-100 border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  Delivery Progress
                </h3>

                <div className="space-y-3 text-xs">
                  <div className="flex items-start gap-2.5">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-bold text-zinc-900 dark:text-zinc-100">Order Accepted</p>
                      <p className="text-[10px] text-zinc-400">Assigned to your shift</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div
                      className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                        assigned.status !== "ready"
                          ? "bg-emerald-600 text-white"
                          : "border-2 border-orange-700 text-orange-700"
                      }`}
                    >
                      {assigned.status !== "ready" ? "✓" : "2"}
                    </div>
                    <div>
                      <p className={`font-bold ${assigned.status !== "ready" ? "text-zinc-900 dark:text-zinc-100" : "text-orange-700"}`}>
                        Picked Up from Store
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {assigned.status !== "ready" ? "Order in your possession" : "Waiting for pickup confirmation"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div
                      className={`h-4 w-4 rounded-full flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold ${
                        assigned.status === "out_for_delivery"
                          ? "bg-orange-700 text-white"
                          : "border-2 border-zinc-300 text-zinc-400"
                      }`}
                    >
                      3
                    </div>
                    <div>
                      <p className={`font-bold ${assigned.status === "out_for_delivery" ? "text-orange-700" : "text-zinc-400"}`}>
                        Out for Delivery
                      </p>
                      <p className="text-[10px] text-zinc-400">
                        {assigned.status === "out_for_delivery" ? "Heading to customer destination" : "Pending transit"}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-start gap-2.5">
                    <div className="h-4 w-4 rounded-full border-2 border-zinc-200 text-zinc-300 flex items-center justify-center shrink-0 mt-0.5 text-[10px] font-bold">
                      4
                    </div>
                    <div>
                      <p className="font-bold text-zinc-400">Delivered</p>
                      <p className="text-[10px] text-zinc-400">Hand off to customer</p>
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Recent Deliveries list */}
            {feed.recentDeliveries && feed.recentDeliveries.length > 0 && (
              <div className="rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-4 shadow-xs space-y-3">
                <div className="flex items-center justify-between border-b border-zinc-100 dark:border-zinc-800 pb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
                    Recent Shift ({feed.recentDeliveries.length})
                  </h3>
                </div>

                <div className="divide-y divide-zinc-100 dark:divide-zinc-800 text-xs">
                  {feed.recentDeliveries.slice(0, 5).map((delivery) => (
                    <div key={delivery.id} className="py-2.5 flex items-center justify-between">
                      <div>
                        <p className="font-bold text-zinc-900 dark:text-zinc-100">#{delivery.orderNumber}</p>
                        <p className="text-[10px] text-zinc-400 truncate max-w-[140px]">{delivery.deliveryAddress || "Delivered"}</p>
                      </div>
                      <span className="font-bold text-zinc-900 dark:text-zinc-100">
                        {formatAmount(delivery.totalAmount, delivery.currency)}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Report Delivery Issue Modal */}
      {showIssueModal && (
        <div
          role="dialog"
          aria-modal="true"
          aria-labelledby="issue-modal-title"
          className="fixed inset-0 z-50 flex items-center justify-center bg-zinc-950/50 p-4 backdrop-blur-xs"
        >
          <div className="w-full max-w-md rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900 p-5 shadow-lg space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <AlertTriangle className="h-5 w-5 text-amber-600" />
                <h2 id="issue-modal-title" className="text-base font-bold text-zinc-950 dark:text-white">
                  Report Delivery Issue
                </h2>
              </div>
              <button
                type="button"
                onClick={() => setShowIssueModal(false)}
                className="rounded-lg p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 cursor-pointer"
                aria-label="Close"
              >
                <XCircle className="h-5 w-5" />
              </button>
            </div>

            <p className="text-xs text-zinc-600 dark:text-zinc-400">
              Select the problem you encountered. The restaurant manager will be alerted immediately.
            </p>

            {/* Category selection */}
            <div className="space-y-1.5">
              <label className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Issue Category *
              </label>
              <div className="grid grid-cols-1 gap-1.5 sm:grid-cols-2">
                {ISSUE_CATEGORIES.map((cat) => (
                  <button
                    key={cat.key}
                    type="button"
                    onClick={() => setIssueCategory(cat.key)}
                    className={`flex items-center justify-start rounded-xl border px-3 py-2 text-xs font-semibold text-left transition cursor-pointer ${
                      issueCategory === cat.key
                        ? "border-amber-600 bg-amber-50 text-amber-950 ring-1 ring-amber-600"
                        : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-300"
                    }`}
                  >
                    <span>{cat.label}</span>
                  </button>
                ))}
              </div>
            </div>

            {/* Note input */}
            <div className="space-y-1.5">
              <label htmlFor="issue-note" className="text-xs font-bold uppercase tracking-wider text-zinc-400">
                Additional Details (Optional)
              </label>
              <textarea
                id="issue-note"
                rows={3}
                maxLength={300}
                value={issueNote}
                onChange={(e) => setIssueNote(e.target.value.slice(0, 300))}
                placeholder="Describe what happened (e.g. customer phone turned off, gate locked...)"
                className="w-full rounded-xl border border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-950 p-3 text-xs text-zinc-900 dark:text-zinc-100 placeholder:text-zinc-400 focus:border-orange-600 focus:outline-hidden"
              />
              <div className="flex justify-end text-[10px] text-zinc-400">
                {issueNote.length} / 300
              </div>
            </div>

            {/* Modal actions */}
            <div className="flex items-center justify-end gap-2 pt-2 border-t border-zinc-100 dark:border-zinc-800">
              <Button
                variant="outline"
                className="rounded-xl border-zinc-200 text-xs font-bold text-zinc-700 hover:bg-zinc-50 cursor-pointer"
                onClick={() => {
                  setShowIssueModal(false);
                  setIssueCategory("");
                  setIssueNote("");
                }}
                disabled={busyIssue}
              >
                Cancel
              </Button>
              <Button
                className="rounded-xl bg-amber-600 text-xs font-bold text-white hover:bg-amber-700 disabled:opacity-50 cursor-pointer"
                onClick={() => void submitIssue()}
                disabled={!issueCategory || busyIssue}
              >
                {busyIssue ? (
                  <span className="flex items-center gap-1.5">
                    <RotateCw className="h-3.5 w-3.5 animate-spin" /> Submitting…
                  </span>
                ) : (
                  "Submit Report"
                )}
              </Button>
            </div>
          </div>
        </div>
      )}

      {/* ── Platform Attribution Footer ──────────────────────────────── */}
      <footer className="pt-6 pb-4 text-center">
        <p className="text-[11px] font-medium text-zinc-400 dark:text-zinc-500">
          Powered by Aldriva
        </p>
      </footer>
    </main>
  );
}
