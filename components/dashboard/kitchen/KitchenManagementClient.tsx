"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { CourierManagementClient } from "@/components/dashboard/kitchen/CourierManagementClient";
import { CookPerformancePanel } from "@/components/dashboard/kitchen/CookPerformancePanel";
import { CourierPerformancePanel } from "@/components/dashboard/kitchen/CourierPerformancePanel";
import {
  createKitchen,
  deactivateCook,
  inviteCook,
  regenerateKitchenDisplayLink,
  reactivateWorker,
  resendCookInvitation,
  revokeCookInvitation,
  revokeKitchenDisplayLink,
} from "@/lib/actions/kitchen-management";

type Cook = {
  id: string;
  fullName: string;
  phone: string;
  whatsappNumber: string;
  active: boolean;
  invitationState: "not_invited" | "invited" | "expired" | "accepted" | "revoked";
  expiresAt: string | null;
};

type Business = {
  id: string;
  name: string;
  kitchen: {
    id: string;
    displayLink: { exists: boolean; revoked: boolean; createdAt: string } | null;
  } | null;
  cooks: Cook[];
};

type Props = {
  organizerId: string;
  businesses: Business[];
  courierBusinesses?: Array<{ id: string; name: string; couriers: Array<{
    id: string;
    fullName: string;
    phone: string;
    whatsappNumber: string;
    active: boolean;
    isAvailable: boolean;
    hasActiveOrder: boolean;
    state: string;
    invitationState: "not_invited" | "invited" | "expired" | "accepted" | "revoked";
    expiresAt: string | null;
  }> }>;
  unavailable?: boolean;
};

type OneTimeLink = { label: string; url: string };

const INVITATION_LABELS: Record<Cook["invitationState"], string> = {
  not_invited: "Not invited",
  invited: "Invitation sent",
  expired: "Invitation expired",
  accepted: "Accepted",
  revoked: "Revoked",
};

function friendlyError(code: string) {
  if (code === "invalid_phone") return "Enter valid phone and WhatsApp numbers with at least four digits each.";
  if (code === "invalid_name") return "Enter a name of 1 to 100 characters.";
  if (code === "unauthorized") return "Sign in to manage kitchen access.";
  if (code === "forbidden") return "You do not have permission to manage this business kitchen.";
  if (code === "inactive") return "Reactivate this cook before sending a new invitation.";
  if (code === "already_active") return "This worker is already active.";
  if (code === "reactivation_cooldown") return "Please wait a few seconds before requesting another invitation.";
  return "The change could not be saved. Please try again.";
}

export function KitchenManagementClient({ organizerId, businesses, courierBusinesses = [], unavailable = false }: Props) {
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [oneTimeLink, setOneTimeLink] = useState<OneTimeLink | null>(null);
  const [copied, setCopied] = useState(false);

  function revealLink(label: string, path: string, token: string) {
    setOneTimeLink({ label, url: `${window.location.origin}${path}#${token}` });
    setCopied(false);
  }

  async function copyLink() {
    if (!oneTimeLink) return;
    try {
      await navigator.clipboard.writeText(oneTimeLink.url);
      setCopied(true);
    } catch {
      setError("Copy was blocked by the browser. Select and copy the link above.");
    }
  }

  async function runAction(key: string, action: () => Promise<{ ok: boolean; error?: string }>) {
    setBusyKey(key);
    setError("");
    const result = await action();
    if (!result.ok) setError(friendlyError(result.error ?? "unavailable"));
    else router.refresh();
    setBusyKey("");
    return result.ok;
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>, business: Business) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const key = `invite:${business.id}`;
    setBusyKey(key);
    setError("");
    const result = await inviteCook(organizerId, business.id, {
      fullName: String(form.get("fullName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      whatsappNumber: String(form.get("whatsappNumber") ?? ""),
    });
    if (!result.ok) {
      setError(friendlyError(result.error ?? "unavailable"));
    } else {
      revealLink(`Invitation for ${String(form.get("fullName") ?? "cook")}`, result.path, result.token);
      formElement.reset();
      router.refresh();
    }
    setBusyKey("");
  }

  async function handleResend(cook: Cook) {
    setBusyKey(`resend:${cook.id}`);
    setError("");
    const result = await resendCookInvitation(organizerId, cook.id);
    if (!result.ok) setError(friendlyError(result.error ?? "unavailable"));
    else {
      // The action's raw token is returned once and held only in this component's
      // memory; it is never reconstructed from or persisted to the workspace data.
      revealLink(`New invitation for ${cook.fullName}`, result.path, result.token);
      router.refresh();
    }
    setBusyKey("");
  }

  async function handleReactivate(cook: Cook) {
    setBusyKey(`reactivate:${cook.id}`);
    setError("");
    const result = await reactivateWorker(organizerId, cook.id);
    if (!result.ok) setError(friendlyError(result.error ?? "unavailable"));
    else {
      revealLink(`New invitation for ${cook.fullName}`, result.path, result.token);
      router.refresh();
    }
    setBusyKey("");
  }

  async function handleRegenerateDisplay(business: Business) {
    if (!business.kitchen) return;
    setBusyKey(`display:${business.id}`);
    setError("");
    const result = await regenerateKitchenDisplayLink(organizerId, business.kitchen.id);
    if (!result.ok) setError(friendlyError(result.error ?? "unavailable"));
    else {
      revealLink(`Kitchen display for ${business.name}`, result.path, result.token);
      router.refresh();
    }
    setBusyKey("");
  }

  if (unavailable) {
    return <p role="alert" className="rounded-xl border border-zinc-200 bg-card p-5 text-sm text-muted-foreground">Kitchen information is unavailable. Refresh the page or check that migration 185 has been applied.</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <p className="text-sm font-semibold text-muted-foreground">Business operations</p>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Kitchen access</h1>
        <p className="mt-2 max-w-2xl text-sm text-muted-foreground">
          Set up one kitchen per business, invite cooks individually, and rotate the read-only display link.
          WhatsApp numbers are stored for a later phase; this phase sends no messages.
        </p>
      </header>

      {error && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

      {oneTimeLink && (
        <section className="rounded-xl border border-orange-200 bg-orange-50 p-4" aria-live="polite">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <h2 className="font-semibold text-zinc-950">{oneTimeLink.label} — copy now</h2>
              <p className="mt-1 break-all font-mono text-xs text-zinc-700">{oneTimeLink.url}</p>
            </div>
            <div className="flex gap-2">
              <Button type="button" size="sm" onClick={copyLink}>{copied ? "Copied" : "Copy link"}</Button>
              <Button type="button" size="sm" variant="outline" onClick={() => { setOneTimeLink(null); setCopied(false); }}>Dismiss</Button>
            </div>
          </div>
          <p className="mt-2 text-xs text-zinc-600">This secret is shown only now. Refreshing or dismissing it cannot recover the link.</p>
        </section>
      )}

      {businesses.length === 0 && (
        <section className="rounded-xl border border-zinc-200 bg-card p-5 text-sm text-muted-foreground">
          No business is linked to this organizer yet.
        </section>
      )}

      {businesses.map((business) => (
        <section key={business.id} className="rounded-xl border border-zinc-200 bg-card p-5 shadow-xs sm:p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{business.name}</h2>
              <p className="mt-1 text-sm text-muted-foreground">{business.kitchen ? "Kitchen created" : "Kitchen not created"}</p>
            </div>
            {!business.kitchen ? (
              <Button
                type="button"
                disabled={busyKey === `create:${business.id}`}
                onClick={() => runAction(`create:${business.id}`, () => createKitchen(organizerId, business.id))}
              >
                {busyKey === `create:${business.id}` ? "Creating…" : "Create kitchen"}
              </Button>
            ) : (
              <div className="flex flex-wrap gap-2">
                <Button type="button" variant="outline" disabled={busyKey === `display:${business.id}`} onClick={() => handleRegenerateDisplay(business)}>
                  {business.kitchen.displayLink ? "Regenerate display link" : "Create display link"}
                </Button>
                {business.kitchen.displayLink && !business.kitchen.displayLink.revoked && (
                  <Button
                    type="button"
                    variant="destructive"
                    disabled={busyKey === `revoke-display:${business.id}`}
                    onClick={() => runAction(`revoke-display:${business.id}`, () => revokeKitchenDisplayLink(organizerId, business.kitchen!.id))}
                  >
                    Revoke display link
                  </Button>
                )}
              </div>
            )}
          </div>

          {business.kitchen && (
            <>
              <CookPerformancePanel organizerId={organizerId} businessId={business.id} />
              <CourierPerformancePanel organizerId={organizerId} businessId={business.id} />
              <form className="mt-5 grid gap-3 rounded-xl border border-zinc-200 p-4 sm:grid-cols-2" onSubmit={(event) => handleInvite(event, business)}>
                <div className="sm:col-span-2">
                  <h3 className="font-semibold text-foreground">Invite a cook</h3>
                  <p className="mt-1 text-xs text-muted-foreground">Use phone numbers with at least four digits. No WhatsApp message will be sent.</p>
                </div>
                <label className="text-sm font-medium text-foreground">Name
                  <input name="fullName" autoComplete="name" maxLength={100} required className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-foreground">Phone
                  <input name="phone" type="tel" autoComplete="tel" minLength={4} maxLength={24} required className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                </label>
                <label className="text-sm font-medium text-foreground">WhatsApp number
                  <input name="whatsappNumber" type="tel" maxLength={24} required className="mt-1 min-h-11 w-full rounded-xl border border-input bg-background px-3 font-normal" />
                </label>
                <div className="flex items-end">
                  <Button type="submit" disabled={busyKey === `invite:${business.id}`} className="w-full sm:w-auto">
                    {busyKey === `invite:${business.id}` ? "Creating invitation…" : "Create invitation"}
                  </Button>
                </div>
              </form>

              <div className="mt-5 space-y-3">
                <h3 className="font-semibold text-foreground">Cooks ({business.cooks.length})</h3>
                {business.cooks.length === 0 && <p className="text-sm text-muted-foreground">No cooks have been invited.</p>}
                {business.cooks.map((cook) => (
                  <article key={cook.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-4 sm:flex-row sm:items-center sm:justify-between">
                    <div className="min-w-0">
                      <h4 className="truncate font-medium text-foreground">{cook.fullName}</h4>
                      <p className="mt-1 text-sm text-muted-foreground">Phone: {cook.phone} · WhatsApp: {cook.whatsappNumber}</p>
                      <p className="mt-1 text-xs text-muted-foreground">
                        {cook.active ? "Active" : "Deactivated"} · {INVITATION_LABELS[cook.invitationState]}
                        {cook.expiresAt && cook.invitationState === "invited" ? ` · expires ${new Date(cook.expiresAt).toLocaleDateString()}` : ""}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {cook.active ? (
                        <Button type="button" size="sm" variant="outline" disabled={busyKey === `resend:${cook.id}`} onClick={() => handleResend(cook)}>
                          Resend invitation
                        </Button>
                      ) : (
                        <Button type="button" size="sm" variant="outline" disabled={busyKey === `reactivate:${cook.id}`} onClick={() => handleReactivate(cook)}>
                          {busyKey === `reactivate:${cook.id}` ? "Reactivating…" : "Reactivate"}
                        </Button>
                      )}
                      {cook.invitationState !== "revoked" && (
                        <Button type="button" size="sm" variant="outline" disabled={busyKey === `revoke:${cook.id}`} onClick={() => runAction(`revoke:${cook.id}`, () => revokeCookInvitation(organizerId, cook.id))}>
                          Revoke
                        </Button>
                      )}
                      {cook.active && (
                        <Button type="button" size="sm" variant="destructive" disabled={busyKey === `deactivate:${cook.id}`} onClick={() => runAction(`deactivate:${cook.id}`, () => deactivateCook(organizerId, cook.id))}>
                          Deactivate cook
                        </Button>
                      )}
                    </div>
                  </article>
                ))}
              </div>
            </>
          )}
        </section>
      ))}
      <CourierManagementClient organizerId={organizerId} businesses={courierBusinesses} />
    </div>
  );
}
