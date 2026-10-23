"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { IconPlus } from "@tabler/icons-react";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { CourierManagementClient } from "@/components/dashboard/kitchen/CourierManagementClient";
import { CookPerformancePanel } from "@/components/dashboard/kitchen/CookPerformancePanel";
import { CourierPerformancePanel } from "@/components/dashboard/kitchen/CourierPerformancePanel";
import { ExpandablePersonnelRecord } from "@/components/dashboard/kitchen/ExpandablePersonnelRecord";
import { ProgressiveDisclosure } from "@/components/dashboard/kitchen/ProgressiveDisclosure";
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
type PendingCookAction = { kind: "revoke" | "deactivate"; id: string; name: string } | null;

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
  const [addCookBusinessId, setAddCookBusinessId] = useState<string | null>(null);
  const [pendingCookAction, setPendingCookAction] = useState<PendingCookAction>(null);

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
    try {
      const result = await action();
      if (!result.ok) {
        setError(friendlyError(result.error ?? "unavailable"));
        return false;
      }
      router.refresh();
      return true;
    } catch {
      setError(friendlyError("unavailable"));
      return false;
    } finally {
      setBusyKey("");
    }
  }

  async function handleInvite(event: FormEvent<HTMLFormElement>, business: Business) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const key = `invite:${business.id}`;
    if (busyKey === key) return;
    setBusyKey(key);
    setError("");
    try {
      const result = await inviteCook(organizerId, business.id, {
        fullName: String(form.get("fullName") ?? ""),
        phone: String(form.get("phone") ?? ""),
        whatsappNumber: String(form.get("whatsappNumber") ?? ""),
      });
      if (!result.ok) {
        setError(friendlyError(result.error ?? "unavailable"));
        return;
      }
      revealLink(`Invitation for ${String(form.get("fullName") ?? "cook")}`, result.path, result.token);
      formElement.reset();
      setAddCookBusinessId(null);
      router.refresh();
    } catch {
      setError(friendlyError("unavailable"));
    } finally {
      setBusyKey("");
    }
  }

  async function handleResend(cook: Cook) {
    await runTokenAction(
      `resend:${cook.id}`,
      `New invitation for ${cook.fullName}`,
      () => resendCookInvitation(organizerId, cook.id),
    );
  }

  async function handleReactivate(cook: Cook) {
    await runTokenAction(
      `reactivate:${cook.id}`,
      `New invitation for ${cook.fullName}`,
      () => reactivateWorker(organizerId, cook.id),
    );
  }

  async function runTokenAction(
    key: string,
    label: string,
    action: () => Promise<{ ok: boolean; error?: string; token?: string; path?: string }>,
  ) {
    if (busyKey === key) return;
    setBusyKey(key);
    setError("");
    try {
      const result = await action();
      if (!result.ok) {
        setError(friendlyError(result.error ?? "unavailable"));
        return;
      }
      if (result.token && result.path) revealLink(label, result.path, result.token);
      router.refresh();
    } catch {
      setError(friendlyError("unavailable"));
    } finally {
      setBusyKey("");
    }
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

  async function confirmCookAction() {
    if (!pendingCookAction) return;
    const action = pendingCookAction;
    await runAction(
      `${action.kind}:${action.id}`,
      () => action.kind === "revoke"
        ? revokeCookInvitation(organizerId, action.id)
        : deactivateCook(organizerId, action.id),
    );
    setPendingCookAction(null);
  }

  if (unavailable) {
    return <p role="alert" className="text-sm text-muted-foreground">Kitchen information is unavailable. Refresh the page or check that migration 185 has been applied.</p>;
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="mt-1 text-2xl font-bold text-foreground">Kitchen access</h1>
        <p className="mt-1 text-sm text-muted-foreground">Manage kitchens and invite cooks for each business.</p>
      </header>

      {error && !addCookBusinessId && <p role="alert" className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}

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
        <section className="text-sm text-muted-foreground">
          No business is linked to this organizer yet.
        </section>
      )}

      {businesses.map((business) => (
        <section key={business.id} className="space-y-5 border-t border-border pt-5 first:border-0 first:pt-0">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-semibold text-foreground">{business.name}</h2>
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
              <ProgressiveDisclosure title="Cook performance" summary={`${business.cooks.length} cooks`}>
                <CookPerformancePanel organizerId={organizerId} businessId={business.id} />
              </ProgressiveDisclosure>
              <ProgressiveDisclosure title="Courier performance" summary="View metrics">
                <CourierPerformancePanel organizerId={organizerId} businessId={business.id} />
              </ProgressiveDisclosure>

              <section aria-labelledby={`cooks-heading-${business.id}`}>
                <div className="mb-2 flex flex-wrap items-center justify-between gap-3">
                  <h3 id={`cooks-heading-${business.id}`} className="text-[15px] font-semibold text-foreground">Cooks ({business.cooks.length})</h3>
                  <Button type="button" size="sm" onClick={() => { setError(""); setAddCookBusinessId(business.id); }}>
                    <IconPlus aria-hidden="true" className="mr-1.5 h-4 w-4" />
                    Add cook
                  </Button>
                </div>
                {business.cooks.length === 0 ? (
                  <p className="py-3 text-sm text-muted-foreground">No cooks yet.</p>
                ) : (
                  <ul className="divide-y divide-border">
                    {business.cooks.map((cook) => (
                      <ExpandablePersonnelRecord
                        key={cook.id}
                        name={cook.fullName}
                        status={!cook.active ? "Deactivated" : cook.invitationState === "accepted" ? "Active" : INVITATION_LABELS[cook.invitationState]}
                        details={[
                          { label: "Access", value: cook.active ? "Active" : "Deactivated" },
                          { label: "Invitation", value: INVITATION_LABELS[cook.invitationState] },
                          { label: "Phone", value: cook.phone },
                          { label: "WhatsApp", value: cook.whatsappNumber },
                          ...(cook.expiresAt && cook.invitationState === "invited"
                            ? [{ label: "Invitation expires", value: new Date(cook.expiresAt).toLocaleDateString() }]
                            : []),
                        ]}
                      >
                        {cook.active ? (
                          <Button type="button" size="sm" variant="outline" disabled={busyKey === `resend:${cook.id}`} onClick={() => handleResend(cook)}>
                            {busyKey === `resend:${cook.id}` ? "Sending…" : "Resend invitation"}
                          </Button>
                        ) : (
                          <Button type="button" size="sm" variant="outline" disabled={busyKey === `reactivate:${cook.id}`} onClick={() => handleReactivate(cook)}>
                            {busyKey === `reactivate:${cook.id}` ? "Reactivating…" : "Reactivate"}
                          </Button>
                        )}
                        {cook.invitationState !== "revoked" && (
                          <Button type="button" size="sm" variant="outline" disabled={busyKey === `revoke:${cook.id}`} onClick={() => setPendingCookAction({ kind: "revoke", id: cook.id, name: cook.fullName })}>
                            Revoke invitation
                          </Button>
                        )}
                        {cook.active && (
                          <Button type="button" size="sm" variant="destructive" disabled={busyKey === `deactivate:${cook.id}`} onClick={() => setPendingCookAction({ kind: "deactivate", id: cook.id, name: cook.fullName })}>
                            Deactivate
                          </Button>
                        )}
                      </ExpandablePersonnelRecord>
                    ))}
                  </ul>
                )}
                {business.kitchen && (
                  <Dialog
                    open={addCookBusinessId === business.id}
                    onOpenChange={(open) => {
                      if (busyKey !== `invite:${business.id}`) setAddCookBusinessId(open ? business.id : null);
                    }}
                  >
                    <DialogContent>
                      <DialogHeader>
                        <DialogTitle>Add a cook</DialogTitle>
                        <DialogDescription>Enter the cook’s contact details to create an invitation for {business.name}.</DialogDescription>
                      </DialogHeader>
                      <form className="space-y-4" onSubmit={(event) => handleInvite(event, business)}>
                        {error && addCookBusinessId === business.id && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                        <label className="block text-sm font-medium text-foreground">Name
                          <input name="fullName" autoComplete="name" maxLength={100} required className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                        </label>
                        <label className="block text-sm font-medium text-foreground">Phone
                          <input name="phone" type="tel" autoComplete="tel" minLength={4} maxLength={24} required className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                        </label>
                        <label className="block text-sm font-medium text-foreground">WhatsApp number
                          <input name="whatsappNumber" type="tel" maxLength={24} required className="mt-1 min-h-11 w-full rounded-lg border border-input bg-background px-3 font-normal" />
                          <span className="mt-1 block text-sm text-muted-foreground">Stored for reference. No message is sent.</span>
                        </label>
                        <DialogFooter>
                          <Button type="submit" disabled={busyKey === `invite:${business.id}`}>
                            {busyKey === `invite:${business.id}` ? "Creating invitation…" : "Create and invite"}
                          </Button>
                        </DialogFooter>
                      </form>
                    </DialogContent>
                  </Dialog>
                )}
              </section>
            </>
          )}
        </section>
      ))}
      <CourierManagementClient organizerId={organizerId} businesses={courierBusinesses} />
      <ConfirmDialog
        open={pendingCookAction !== null}
        onOpenChange={(open) => { if (!open) setPendingCookAction(null); }}
        title={pendingCookAction?.kind === "deactivate" ? "Deactivate cook?" : "Revoke invitation?"}
        description={pendingCookAction?.kind === "deactivate"
          ? `${pendingCookAction.name} will lose access to the kitchen.`
          : `The current invitation for ${pendingCookAction?.name ?? "this cook"} will stop working.`}
        confirmLabel={pendingCookAction?.kind === "deactivate" ? "Deactivate" : "Revoke invitation"}
        variant="destructive"
        loading={pendingCookAction ? busyKey === `${pendingCookAction.kind}:${pendingCookAction.id}` : false}
        onConfirm={confirmCookAction}
      />
    </div>
  );
}
