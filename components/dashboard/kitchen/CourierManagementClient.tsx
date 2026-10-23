"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
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
import { ExpandablePersonnelRecord } from "@/components/dashboard/kitchen/ExpandablePersonnelRecord";
import {
  createCourier,
  deactivateCourier,
  inviteCourier,
  reactivateCourier,
  resendCourierInvitation,
  revokeCourierInvitation,
} from "@/lib/actions/courier-management";

type Courier = {
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
};

type Business = { id: string; name: string; couriers: Courier[] };
type Props = { organizerId: string; businesses: Business[] };
type OneTimeLink = { name: string; url: string };
type PendingCourierAction = { kind: "revoke" | "deactivate"; id: string; name: string } | null;

const INVITATION_LABELS: Record<Courier["invitationState"], string> = {
  not_invited: "Not invited",
  invited: "Invitation sent",
  expired: "Invitation expired",
  accepted: "Accepted",
  revoked: "Revoked",
};

function actionError(code: string) {
  if (code === "unauthorized") return "Sign in to manage couriers.";
  if (code === "forbidden") return "You do not have permission to manage couriers for this business.";
  if (code === "inactive") return "Reactivate this courier before sending a new invitation.";
  if (code === "already_active") return "This courier is already active.";
  if (code === "reactivation_cooldown") return "Please wait a few seconds before requesting another invitation.";
  if (code === "invalid_name") return "Enter a name of 1 to 100 characters.";
  if (code === "invalid_phone") return "Enter valid phone and WhatsApp numbers with at least four digits each.";
  return "The change could not be saved. Please try again.";
}

export function CourierManagementClient({ organizerId, businesses }: Props) {
  const tOrganizer = useTranslations("Organizer");
  const router = useRouter();
  const [busyKey, setBusyKey] = useState("");
  const [error, setError] = useState("");
  const [oneTimeLink, setOneTimeLink] = useState<OneTimeLink | null>(null);
  const [addCourierBusinessId, setAddCourierBusinessId] = useState<string | null>(null);
  const [pendingCourierAction, setPendingCourierAction] = useState<PendingCourierAction>(null);

  function revealLink(name: string, path: string, token: string) {
    setOneTimeLink({ name, url: `${window.location.origin}${path}#${token}` });
  }

  async function perform(
    key: string,
    label: string,
    action: () => Promise<{ ok: boolean; error?: string; token?: string; path?: string }>
  ): Promise<boolean> {
    setBusyKey(key);
    setError("");
    try {
      const result = await action();
      if (!result.ok) {
        setError(actionError(result.error ?? "unavailable"));
        return false;
      }
      if (result.token && result.path) revealLink(label, result.path, result.token);
      router.refresh();
      return true;
    } catch {
      setError(actionError("unavailable"));
      return false;
    } finally {
      setBusyKey("");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>, business: Business) {
    event.preventDefault();
    if (busyKey === `create:${business.id}`) return;
    const form = new FormData(event.currentTarget);
    const formElement = event.currentTarget;
    const succeeded = await perform(`create:${business.id}`, `Courier invitation for ${business.name}`, () => createCourier({
      organizerId,
      businessId: business.id,
      fullName: String(form.get("fullName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      whatsappNumber: String(form.get("whatsappNumber") ?? ""),
    }));
    if (succeeded) {
      formElement.reset();
      setAddCourierBusinessId(null);
    }
  }

  async function confirmCourierAction() {
    if (!pendingCourierAction) return;
    const action = pendingCourierAction;
    await perform(
      `${action.kind}:${action.id}`,
      action.name,
      () => action.kind === "revoke"
        ? revokeCourierInvitation(organizerId, action.id)
        : deactivateCourier(organizerId, action.id),
    );
    setPendingCourierAction(null);
  }

  return (
    <section className="space-y-5" aria-labelledby="courier-management-title">
      <div>
        <h2 id="courier-management-title" className="text-lg font-semibold text-zinc-900">{tOrganizer("couriers")}</h2>
        <p className="mt-1 text-sm text-zinc-600">Manage courier invitations.</p>
      </div>

      {error && !addCourierBusinessId && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
      {oneTimeLink && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950" aria-live="polite">
          <p className="font-semibold">{oneTimeLink.name} — copy now</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a href={oneTimeLink.url} className="break-all underline">Open invitation</a>
            <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(oneTimeLink.url)}>Copy link</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOneTimeLink(null)}>Close</Button>
          </div>
        </div>
      )}

      {businesses.map((business) => (
        <div key={business.id} className="space-y-4 border-t border-zinc-100 pt-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <h3 className="text-[15px] font-semibold text-zinc-950">{business.name}</h3>
            <Button type="button" size="sm" onClick={() => { setError(""); setAddCourierBusinessId(business.id); }}>
              <IconPlus aria-hidden="true" className="mr-1.5 h-4 w-4" />
              Add courier
            </Button>
          </div>

          {business.couriers.length === 0 ? (
            <p className="text-sm text-zinc-500">No couriers registered for this business.</p>
          ) : (
            <ul className="divide-y divide-zinc-200 dark:divide-zinc-800">
              {business.couriers.map((courier) => (
                <ExpandablePersonnelRecord
                  key={courier.id}
                  name={courier.fullName}
                  status={!courier.active
                    ? "Deactivated"
                    : courier.hasActiveOrder
                      ? courier.isAvailable ? "On delivery" : "Delivery active · offline"
                      : courier.isAvailable ? "Available" : "Offline"}
                  details={[
                    { label: "Access", value: courier.active ? "Active" : "Deactivated" },
                    { label: "Availability", value: courier.state },
                    { label: "Invitation", value: INVITATION_LABELS[courier.invitationState] },
                    { label: "Phone", value: courier.phone },
                    { label: "WhatsApp", value: courier.whatsappNumber },
                    ...(courier.expiresAt && courier.invitationState === "invited"
                      ? [{ label: "Invitation expires", value: new Date(courier.expiresAt).toLocaleDateString() }]
                      : []),
                  ]}
                >
                  {courier.active ? (
                    <Button type="button" size="sm" variant="outline" disabled={busyKey === `invite:${courier.id}`} onClick={() => void perform(`invite:${courier.id}`, `Courier invitation for ${courier.fullName}`, () => courier.invitationState === "not_invited" ? inviteCourier(organizerId, courier.id) : resendCourierInvitation(organizerId, courier.id))}>
                      {busyKey === `invite:${courier.id}` ? "Sending…" : courier.invitationState === "not_invited" ? "Invite" : "Resend invitation"}
                    </Button>
                  ) : (
                    <Button type="button" size="sm" variant="outline" disabled={busyKey === `reactivate:${courier.id}`} onClick={() => void perform(`reactivate:${courier.id}`, `New courier invitation for ${courier.fullName}`, () => reactivateCourier(organizerId, courier.id))}>
                      {busyKey === `reactivate:${courier.id}` ? "Reactivating…" : "Reactivate"}
                    </Button>
                  )}
                  {courier.invitationState !== "revoked" && (
                    <Button type="button" size="sm" variant="outline" disabled={busyKey === `revoke:${courier.id}`} onClick={() => setPendingCourierAction({ kind: "revoke", id: courier.id, name: courier.fullName })}>
                      Revoke invitation
                    </Button>
                  )}
                  {courier.active && (
                    <Button type="button" size="sm" variant="destructive" disabled={busyKey === `deactivate:${courier.id}`} onClick={() => setPendingCourierAction({ kind: "deactivate", id: courier.id, name: courier.fullName })}>
                      Deactivate
                    </Button>
                  )}
                </ExpandablePersonnelRecord>
              ))}
            </ul>
          )}

          <Dialog
            open={addCourierBusinessId === business.id}
            onOpenChange={(open) => {
              if (busyKey !== `create:${business.id}`) setAddCourierBusinessId(open ? business.id : null);
            }}
          >
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Add a courier</DialogTitle>
                <DialogDescription>Enter the courier’s contact details to create an invitation for {business.name}.</DialogDescription>
              </DialogHeader>
              <form className="space-y-4" onSubmit={(event) => void handleCreate(event, business)}>
                {error && addCourierBusinessId === business.id && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800">{error}</p>}
                <label className="block text-sm font-medium text-zinc-900">Name
                  <input name="fullName" autoComplete="name" required maxLength={100} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 font-normal text-zinc-950" />
                </label>
                <label className="block text-sm font-medium text-zinc-900">Phone
                  <input name="phone" type="tel" autoComplete="tel" required minLength={4} maxLength={32} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 font-normal text-zinc-950" />
                </label>
                <label className="block text-sm font-medium text-zinc-900">WhatsApp number
                  <input name="whatsappNumber" type="tel" required minLength={4} maxLength={32} className="mt-1 min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 font-normal text-zinc-950" />
                  <span className="mt-1 block text-sm font-normal text-zinc-600">Stored for reference. No message is sent.</span>
                </label>
                <DialogFooter>
                  <Button type="submit" disabled={busyKey === `create:${business.id}`}>
                    {busyKey === `create:${business.id}` ? "Creating invitation…" : "Create and invite"}
                  </Button>
                </DialogFooter>
              </form>
            </DialogContent>
          </Dialog>
        </div>
      ))}
      <ConfirmDialog
        open={pendingCourierAction !== null}
        onOpenChange={(open) => { if (!open) setPendingCourierAction(null); }}
        title={pendingCourierAction?.kind === "deactivate" ? "Deactivate courier?" : "Revoke invitation?"}
        description={pendingCourierAction?.kind === "deactivate"
          ? `${pendingCourierAction.name} will lose access and be marked offline.`
          : `The current invitation for ${pendingCourierAction?.name ?? "this courier"} will stop working.`}
        confirmLabel={pendingCourierAction?.kind === "deactivate" ? "Deactivate" : "Revoke invitation"}
        variant="destructive"
        loading={pendingCourierAction ? busyKey === `${pendingCourierAction.kind}:${pendingCourierAction.id}` : false}
        onConfirm={confirmCourierAction}
      />
    </section>
  );
}
