"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { saveDeliverySettings } from "@/lib/actions/orders";
import type { DeliverySettings } from "@/lib/delivery-settings";
import { IconSettings as Settings, IconX as X } from "@tabler/icons-react";

interface DeliverySettingsDialogProps {
  organizerId: string;
  websiteId: string;
  initialSettings: DeliverySettings;
  currency: string;
  canManage: boolean;
  hasDeliveryOffering: boolean;
  onSaved?: (settings: DeliverySettings) => void;
}

export function DeliverySettingsDialog({
  organizerId,
  websiteId,
  initialSettings,
  currency,
  canManage,
  hasDeliveryOffering,
  onSaved,
}: DeliverySettingsDialogProps) {
  const t = useTranslations("Orders");
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [fee, setFee] = useState<string>(String(initialSettings.fee ?? 0));
  const [freeAbove, setFreeAbove] = useState<string>(
    initialSettings.free_above != null ? String(initialSettings.free_above) : ""
  );
  const [courierWhatsapp, setCourierWhatsapp] = useState<string>(
    initialSettings.courier_whatsapp ?? ""
  );

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [noWebsite, setNoWebsite] = useState(false);
  const [success, setSuccess] = useState(false);

  const handleOpen = () => {
    setError(null);
    setNoWebsite(false);
    setSuccess(false);
    setFee(String(initialSettings.fee ?? 0));
    setFreeAbove(initialSettings.free_above != null ? String(initialSettings.free_above) : "");
    setCourierWhatsapp(initialSettings.courier_whatsapp ?? "");
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;

    setError(null);
    setNoWebsite(false);
    setSuccess(false);

    const numFee = Number(fee);
    if (isNaN(numFee) || numFee < 0) {
      setError(locale === "fr" ? "Frais de livraison invalides." : "Invalid delivery fee.");
      return;
    }

    let numFreeAbove: number | null = null;
    if (freeAbove.trim()) {
      numFreeAbove = Number(freeAbove);
      if (isNaN(numFreeAbove) || numFreeAbove <= 0) {
        setError(
          locale === "fr"
            ? "Le seuil de livraison gratuite doit être un montant positif."
            : "Free delivery threshold must be a positive number."
        );
        return;
      }
    }

    setIsSubmitting(true);
    try {
      const res = await saveDeliverySettings({
        organizerId,
        websiteId,
        fee: Math.round(numFee),
        free_above: numFreeAbove ? Math.round(numFreeAbove) : null,
        courier_whatsapp: courierWhatsapp.trim() || null,
      });

      if (!res.success) {
        if (res.error === "no_website") {
          // The website row is gone (e.g. deleted after the page loaded):
          // point the owner at the builder instead of a generic failure.
          setNoWebsite(true);
        } else {
          setError(res.message || "Failed to save delivery settings.");
        }
      } else {
        setSuccess(true);
        onSaved?.({
          fee: Math.round(numFee),
          free_above: numFreeAbove ? Math.round(numFreeAbove) : null,
          courier_whatsapp: courierWhatsapp.trim() || null,
        });
        setTimeout(() => {
          setIsOpen(false);
          setSuccess(false);
        }, 800);
      }
    } catch {
      setError("An unexpected error occurred.");
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={handleOpen}
        className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold text-zinc-700 hover:bg-zinc-50 shadow-xs transition-colors"
      >
        <Settings className="w-4 h-4 text-zinc-500" />
        <span>{locale === "fr" ? "Paramètres livraison" : "Delivery settings"}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-base font-bold text-zinc-900">
                {locale === "fr" ? "Paramètres de livraison" : "Delivery settings"}
              </h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!hasDeliveryOffering ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
                <p className="font-semibold">
                  {locale === "fr"
                    ? "La livraison n'est pas activée sur ce commerce."
                    : "Delivery is not enabled for this business."}
                </p>
                <p>
                  {locale === "fr"
                    ? "Cochez l'option « Livraison » dans les offres de votre commerce pour l'activer sur le storefront."
                    : "Check the 'Delivery' option in your business offerings to activate customer delivery on the storefront."}
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">
                    {locale === "fr"
                      ? `Frais de livraison (${currency})`
                      : `Delivery fee (${currency})`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    required
                    disabled={!canManage || isSubmitting}
                    value={fee}
                    onChange={(e) => setFee(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm focus:border-orange-500 focus:outline-none"
                    placeholder="e.g. 1500"
                  />
                  <p className="text-[11px] text-zinc-500">
                    {locale === "fr"
                      ? "Montant forfaitaire appliqué aux commandes livrées."
                      : "Flat fee added to delivery orders."}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">
                    {locale === "fr"
                      ? `Livraison gratuite au-dessus de (${currency}) (optionnel)`
                      : `Free delivery above (${currency}) (optional)`}
                  </label>
                  <input
                    type="number"
                    min="0"
                    step="1"
                    disabled={!canManage || isSubmitting}
                    value={freeAbove}
                    onChange={(e) => setFreeAbove(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm focus:border-orange-500 focus:outline-none"
                    placeholder={locale === "fr" ? "ex: 15000" : "e.g. 15000"}
                  />
                  <p className="text-[11px] text-zinc-500">
                    {locale === "fr"
                      ? "Laissez vide si vous n'offrez pas de seuil gratuit."
                      : "Leave empty if you do not offer a free threshold."}
                  </p>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">
                    {locale === "fr"
                      ? "Numéro WhatsApp du coursier (optionnel)"
                      : "Courier WhatsApp number (optional)"}
                  </label>
                  <input
                    type="tel"
                    disabled={!canManage || isSubmitting}
                    value={courierWhatsapp}
                    onChange={(e) => setCourierWhatsapp(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm focus:border-orange-500 focus:outline-none"
                    placeholder="e.g. +2250701020304"
                  />
                  <p className="text-[11px] text-zinc-500">
                    {locale === "fr"
                      ? "Utilisé par le bouton « Envoyer au coursier » pour pré-remplir le message WhatsApp."
                      : "Used by the 'Send to courier' button to pre-fill the WhatsApp dispatch message."}
                  </p>
                </div>

                {noWebsite && (
                  <div className="rounded-lg bg-amber-50 border border-amber-200 p-3 text-xs text-amber-900 space-y-2">
                    <p className="font-semibold">{t("createWebsiteFirst")}</p>
                    <a
                      href={`/dashboard/org/${organizerId}/website/new`}
                      className="inline-flex min-h-[44px] items-center rounded-lg bg-orange-700 px-3 py-1.5 font-bold text-white hover:bg-orange-800 transition"
                    >
                      {t("goToWebsiteBuilder")}
                    </a>
                  </div>
                )}

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
                    {error}
                  </div>
                )}

                {success && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 font-medium">
                    {locale === "fr" ? "Paramètres enregistrés !" : "Settings saved!"}
                  </div>
                )}

                <div className="flex gap-2 pt-2 border-t border-zinc-100">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    className="min-h-[44px] flex-1 rounded-xl border border-zinc-200 bg-white text-xs font-bold text-zinc-700 hover:bg-zinc-50"
                  >
                    {t("close")}
                  </button>

                  {canManage && (
                    <button
                      type="submit"
                      disabled={isSubmitting}
                      className="min-h-[44px] flex-1 rounded-xl bg-orange-700 text-xs font-bold text-white hover:bg-orange-800 disabled:opacity-50"
                    >
                      {isSubmitting
                        ? locale === "fr"
                          ? "Enregistrement..."
                          : "Saving..."
                        : locale === "fr"
                        ? "Enregistrer"
                        : "Save settings"}
                    </button>
                  )}
                </div>
              </form>
            )}
          </div>
        </div>
      )}
    </>
  );
}
