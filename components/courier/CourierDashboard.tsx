"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import {
  COURIER_FEED_POLL_MS,
  courierNavigationUrls,
  deriveCourierState,
  formatCourierItems,
} from "@/lib/courier/dashboard-model";

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
  customerName: string | null;
  customerPhone: string | null;
  pickupName: string | null;
  pickupAddress: string | null;
  deliveryAddress: string | null;
  items: unknown;
  amountToCollect: number;
  requiresCashCollection: boolean;
  currency: string | null;
};

type CourierFeed = {
  ok: true;
  isAvailable: boolean;
  state: string;
  offers: CourierOffer[];
  assignedOrder: AssignedOrder | null;
};

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
  if (!items.length) return <p className="text-sm text-muted-foreground">No item details provided.</p>;
  return (
    <ul className="list-inside list-disc space-y-1 text-sm text-foreground">
      {items.map((item, index) => <li key={`${index}-${item}`}>{item}</li>)}
    </ul>
  );
}

export default function CourierDashboard() {
  const [screen, setScreen] = useState<Screen>("loading");
  const [feed, setFeed] = useState<CourierFeed | null>(null);
  const [pageError, setPageError] = useState("");
  const [actionNotice, setActionNotice] = useState("");
  const [availabilityBusy, setAvailabilityBusy] = useState(false);
  const [busyOfferId, setBusyOfferId] = useState<string | null>(null);
  const [busyDelivery, setBusyDelivery] = useState(false);
  const [cashCollected, setCashCollected] = useState(false);
  const [declineMessages, setDeclineMessages] = useState<Record<string, string>>({});
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

  const assigned = feed?.assignedOrder ?? null;
  const derivedState = feed ? deriveCourierState(feed.isAvailable, Boolean(assigned)) : "Offline";

  return (
    <main className="mx-auto w-full max-w-3xl space-y-5 px-4 py-6 sm:py-10">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Courier</p>
          <h1 className="mt-1 text-2xl font-bold text-foreground">Your deliveries</h1>
        </div>
        {screen === "ready" && feed && (
          <div className="flex items-center gap-3 rounded-xl border border-border bg-card px-4 py-2.5">
            <div className="text-right">
              <p className="text-sm font-semibold text-foreground">{derivedState}</p>
              <p className="text-xs text-muted-foreground">Availability</p>
            </div>
            <Switch
              checked={feed.isAvailable}
              disabled={availabilityBusy}
              onCheckedChange={(checked) => void updateAvailability(checked)}
              aria-label="Available for delivery offers"
            />
          </div>
        )}
      </div>

      {actionNotice && <p role="status" className="rounded-lg border border-border bg-muted px-4 py-3 text-sm text-foreground">{actionNotice}</p>}

      {screen === "loading" && <p role="status" className="py-10 text-center text-sm text-muted-foreground">Loading your deliveries…</p>}
      {screen === "session-ended" && (
        <Card><CardContent className="space-y-3 p-6 text-center">
          <h2 className="text-lg font-semibold">Your courier session has ended</h2>
          <p className="text-sm text-muted-foreground">Ask the business owner for a new invitation to sign in again.</p>
          <Button variant="outline" onClick={() => void refresh()}>Check again</Button>
        </CardContent></Card>
      )}
      {screen === "error" && (
        <Card><CardContent className="space-y-3 p-6 text-center">
          <h2 className="text-lg font-semibold">We couldn’t load your deliveries</h2>
          <p role="alert" className="text-sm text-muted-foreground">{pageError}</p>
          <Button onClick={() => void refresh()}>Retry</Button>
        </CardContent></Card>
      )}

      {screen === "ready" && feed && (
        <>
          {assigned && <Card>
            <CardHeader className="pb-3"><CardTitle className="text-xl">Delivery {assigned.orderNumber}</CardTitle></CardHeader>
            <CardContent className="space-y-5">
              <section>
                <h2 className="text-sm font-bold text-foreground">Customer</h2>
                <p className="mt-1 text-sm text-foreground">{assigned.customerName || "Customer"}</p>
                {assigned.customerPhone && <a className="mt-1 inline-block text-sm font-medium text-primary underline" href={`tel:${assigned.customerPhone}`}>{assigned.customerPhone}</a>}
              </section>
              <section>
                <h2 className="text-sm font-bold text-foreground">Pickup</h2>
                {assigned.pickupName && <p className="mt-1 text-sm font-medium text-foreground">{assigned.pickupName}</p>}
                <p className="mt-1 text-sm text-foreground">{assigned.pickupAddress || "Pickup address not provided"}</p>
              </section>
              <section>
                <h2 className="text-sm font-bold text-foreground">Drop-off address</h2>
                <p className="mt-1 text-sm text-foreground">{assigned.deliveryAddress || "Address not provided"}</p>
                {assigned.deliveryAddress && (() => {
                  const urls = courierNavigationUrls(assigned.deliveryAddress);
                  return <div className="mt-3 flex flex-wrap gap-2">
                    <a className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted" href={urls.googleMaps} target="_blank" rel="noreferrer">Google Maps</a>
                    <a className="inline-flex h-9 items-center rounded-lg border border-border px-3 text-sm font-semibold hover:bg-muted" href={urls.waze} target="_blank" rel="noreferrer">Waze</a>
                  </div>;
                })()}
              </section>
              <section>
                <h2 className="mb-2 text-sm font-bold text-foreground">Order items</h2>
                <ItemList value={assigned.items} />
              </section>
              {assigned.requiresCashCollection && <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-950">
                <p className="font-semibold">Amount to collect: {formatAmount(assigned.amountToCollect, assigned.currency)}</p>
                <label className="mt-3 flex items-start gap-2">
                  <input type="checkbox" checked={cashCollected} onChange={(event) => setCashCollected(event.target.checked)} className="mt-0.5 h-4 w-4 rounded border-amber-500" />
                  <span>I confirm I collected this cash payment.</span>
                </label>
              </div>}
              <Button className="w-full sm:w-auto" disabled={busyDelivery || (assigned.requiresCashCollection && !cashCollected)} onClick={() => void markDelivered()}>
                {busyDelivery ? "Saving…" : "Mark delivered"}
              </Button>
            </CardContent>
          </Card>}

          {feed.offers.map((offer) => (
            <Card key={offer.offer_id}>
              <CardHeader className="pb-3">
                <CardTitle className="text-xl">Delivery offer</CardTitle>
                {offer.pickup_name && <p className="text-sm text-muted-foreground">Pickup from {offer.pickup_name}</p>}
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid gap-4 sm:grid-cols-2">
                  <section><h2 className="text-sm font-bold">Pickup</h2><p className="mt-1 text-sm">{offer.pickup_address || "Pickup address not provided"}</p></section>
                  <section><h2 className="text-sm font-bold">Drop-off</h2><p className="mt-1 text-sm">{offer.delivery_address || "Delivery address not provided"}</p></section>
                </div>
                <section><h2 className="mb-2 text-sm font-bold">Order items</h2><ItemList value={offer.items} /></section>
                <p className="rounded-lg bg-muted px-3 py-2 text-sm font-semibold">Amount to collect: {formatAmount(offer.amount_to_collect, offer.currency)}</p>
                <label className="block text-sm font-medium" htmlFor={`decline-${offer.offer_id}`}>Decline message (optional)</label>
                <textarea
                  id={`decline-${offer.offer_id}`}
                  maxLength={300}
                  value={declineMessages[offer.offer_id] || ""}
                  onChange={(event) => setDeclineMessages((current) => ({ ...current, [offer.offer_id]: event.target.value.slice(0, 300) }))}
                  rows={2}
                  placeholder="Add a short message"
                  className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm"
                />
                <div className="flex flex-wrap gap-2">
                  <Button disabled={busyOfferId === offer.offer_id} onClick={() => void respondToOffer(offer, "accept")}>
                    {busyOfferId === offer.offer_id ? "Saving…" : "Accept"}
                  </Button>
                  <Button variant="outline" disabled={busyOfferId === offer.offer_id} onClick={() => void respondToOffer(offer, "decline")}>Decline</Button>
                </div>
              </CardContent>
            </Card>
          ))}

          {!assigned && feed.offers.length === 0 && <Card><CardContent className="p-8 text-center">
            <h2 className="text-lg font-semibold">No deliveries right now</h2>
            <p className="mt-2 text-sm text-muted-foreground">New delivery offers will appear here while you’re available.</p>
          </CardContent></Card>}
        </>
      )}
    </main>
  );
}
