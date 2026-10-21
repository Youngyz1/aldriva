"use client";

import { useState, type FormEvent } from "react";
import { useTranslations } from "next-intl";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
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

  function revealLink(name: string, path: string, token: string) {
    setOneTimeLink({ name, url: `${window.location.origin}${path}#${token}` });
  }

  async function perform(
    key: string,
    label: string,
    action: () => Promise<{ ok: boolean; error?: string; token?: string; path?: string }>
  ) {
    setBusyKey(key);
    setError("");
    try {
      const result = await action();
      if (!result.ok) setError(actionError(result.error ?? "unavailable"));
      else {
        if (result.token && result.path) revealLink(label, result.path, result.token);
        router.refresh();
      }
    } catch {
      setError(actionError("unavailable"));
    } finally {
      setBusyKey("");
    }
  }

  async function handleCreate(event: FormEvent<HTMLFormElement>, business: Business) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const formElement = event.currentTarget;
    await perform(`create:${business.id}`, `Courier invitation for ${business.name}`, () => createCourier({
      organizerId,
      businessId: business.id,
      fullName: String(form.get("fullName") ?? ""),
      phone: String(form.get("phone") ?? ""),
      whatsappNumber: String(form.get("whatsappNumber") ?? ""),
    }));
    formElement.reset();
  }

  return (
    <section className="space-y-5 rounded-xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6" aria-labelledby="courier-management-title">
      <div>
        <h2 id="courier-management-title" className="text-lg font-semibold text-zinc-900">{tOrganizer("couriers")}</h2>
        <p className="mt-1 text-sm text-zinc-500">Invite registered couriers. WhatsApp numbers are stored for reference; nothing is sent.</p>
      </div>

      {error && <p role="alert" className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">{error}</p>}
      {oneTimeLink && (
        <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-950">
          <p className="font-semibold">{oneTimeLink.name} (shown once)</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <a href={oneTimeLink.url} className="break-all underline">Open invitation</a>
            <Button type="button" size="sm" variant="outline" onClick={() => navigator.clipboard.writeText(oneTimeLink.url)}>Copy link</Button>
            <Button type="button" size="sm" variant="ghost" onClick={() => setOneTimeLink(null)}>Close</Button>
          </div>
        </div>
      )}

      {businesses.map((business) => (
        <div key={business.id} className="space-y-4 border-t border-zinc-100 pt-4">
          <h3 className="font-medium text-zinc-900">{business.name}</h3>
          <form className="grid gap-2 sm:grid-cols-2 lg:grid-cols-4" onSubmit={(event) => void handleCreate(event, business)}>
            <input name="fullName" required maxLength={100} placeholder="Courier name" aria-label={`Courier name for ${business.name}`} className="min-h-11 rounded-lg border border-zinc-200 px-3 text-sm" />
            <input name="phone" required maxLength={32} type="tel" placeholder="Phone" aria-label={`Courier phone for ${business.name}`} className="min-h-11 rounded-lg border border-zinc-200 px-3 text-sm" />
            <input name="whatsappNumber" required maxLength={32} type="tel" placeholder="WhatsApp number" aria-label={`Courier WhatsApp for ${business.name}`} className="min-h-11 rounded-lg border border-zinc-200 px-3 text-sm" />
            <Button type="submit" disabled={busyKey === `create:${business.id}`}>
              {busyKey === `create:${business.id}` ? "Creating…" : "Create and invite"}
            </Button>
          </form>

          {business.couriers.length === 0 ? (
            <p className="text-sm text-zinc-500">No couriers registered for this business.</p>
          ) : (
            <ul className="space-y-3">
              {business.couriers.map((courier) => (
                <li key={courier.id} className="flex flex-col gap-3 rounded-xl border border-zinc-200 p-3 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <p className="font-medium text-zinc-900">{courier.fullName}</p>
                    <p className="mt-1 text-sm text-zinc-600">Phone: {courier.phone} · WhatsApp: {courier.whatsappNumber} (stored only)</p>
                    <p className="mt-1 text-xs text-zinc-500">
                      {courier.active ? "Active" : "Deactivated"} · {courier.state} · {courier.invitationState}
                      {courier.expiresAt && courier.invitationState === "invited" ? ` · expires ${new Date(courier.expiresAt).toLocaleDateString()}` : ""}
                    </p>
                  </div>
                  <div className="flex flex-wrap gap-2">
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
                      <Button type="button" size="sm" variant="outline" disabled={busyKey === `revoke:${courier.id}`} onClick={() => void perform(`revoke:${courier.id}`, courier.fullName, () => revokeCourierInvitation(organizerId, courier.id))}>
                        {busyKey === `revoke:${courier.id}` ? "Revoking…" : "Revoke"}
                      </Button>
                    )}
                    {courier.active && (
                      <Button type="button" size="sm" variant="destructive" disabled={busyKey === `deactivate:${courier.id}`} onClick={() => void perform(`deactivate:${courier.id}`, courier.fullName, () => deactivateCourier(organizerId, courier.id))}>
                        {busyKey === `deactivate:${courier.id}` ? "Deactivating…" : "Deactivate"}
                      </Button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>
      ))}
    </section>
  );
}
