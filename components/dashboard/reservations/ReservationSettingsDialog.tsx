"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { saveReservationSettings } from "@/lib/actions/reservations";
import type { ReservationSettings } from "@/lib/reservation-settings";
import { IconSettings as Settings, IconX as X } from "@tabler/icons-react";

interface ReservationSettingsDialogProps {
  organizerId: string;
  websiteId: string;
  initialSettings: ReservationSettings;
  canManage: boolean;
  hasReservationOffering: boolean;
  businessId?: string | null;
  onSaved?: (settings: ReservationSettings) => void;
}

export function ReservationSettingsDialog({
  organizerId,
  websiteId,
  initialSettings,
  canManage,
  hasReservationOffering,
  businessId,
  onSaved,
}: ReservationSettingsDialogProps) {
  const t = useTranslations("Reservations");
  const locale = useLocale();
  const [isOpen, setIsOpen] = useState(false);
  const [enabled, setEnabled] = useState(initialSettings.enabled);
  const [maxParty, setMaxParty] = useState(String(initialSettings.max_party_size));
  const [leadMinutes, setLeadMinutes] = useState(String(initialSettings.min_lead_minutes));
  const [daysAhead, setDaysAhead] = useState(String(initialSettings.max_days_ahead));
  const [slotMinutes, setSlotMinutes] = useState<string>(String(initialSettings.slot_minutes));
  const [note, setNote] = useState(initialSettings.note ?? "");
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  const handleOpen = () => {
    setError(null);
    setSuccess(false);
    setEnabled(initialSettings.enabled);
    setMaxParty(String(initialSettings.max_party_size));
    setLeadMinutes(String(initialSettings.min_lead_minutes));
    setDaysAhead(String(initialSettings.max_days_ahead));
    setSlotMinutes(String(initialSettings.slot_minutes));
    setNote(initialSettings.note ?? "");
    setIsOpen(true);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!canManage) return;
    setError(null);
    setSuccess(false);

    const numParty = Math.round(Number(maxParty));
    const numLead = Math.round(Number(leadMinutes));
    const numDays = Math.round(Number(daysAhead));
    const numSlot = Number(slotMinutes);
    if (!Number.isFinite(numParty) || numParty < 1 || numParty > 50) {
      setError(locale === "fr" ? "Nombre de convives invalide (1 à 50)." : "Invalid party size (1 to 50).");
      return;
    }

    setIsSubmitting(true);
    try {
      const res = await saveReservationSettings({
        organizerId,
        websiteId,
        enabled,
        max_party_size: numParty,
        min_lead_minutes: Number.isFinite(numLead) ? numLead : 60,
        max_days_ahead: Number.isFinite(numDays) ? numDays : 30,
        slot_minutes: numSlot,
        note: note.trim() || null,
      });
      if (!res.success) {
        setError(res.message || "Failed to save reservation settings.");
      } else {
        const saved: ReservationSettings = {
          enabled,
          max_party_size: numParty,
          min_lead_minutes: Number.isFinite(numLead) ? numLead : 60,
          max_days_ahead: Number.isFinite(numDays) ? numDays : 30,
          slot_minutes: (numSlot === 15 || numSlot === 60 ? numSlot : 30) as 15 | 30 | 60,
          note: note.trim() || null,
        };
        setSuccess(true);
        onSaved?.(saved);
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
        <span>{t("settingsButton")}</span>
      </button>

      {isOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4">
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-xl space-y-4 max-h-[90dvh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
              <h3 className="text-base font-bold text-zinc-900">{t("settingsTitle")}</h3>
              <button
                type="button"
                onClick={() => setIsOpen(false)}
                className="rounded-lg p-1 text-zinc-400 hover:text-zinc-600"
                aria-label="Close"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {!hasReservationOffering ? (
              <div className="rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900 space-y-2">
                <p className="font-semibold">{t("settingsHintNoOffering")}</p>
                {businessId && (
                  <a
                    href={`/dashboard/businesses/${businessId}/edit`}
                    className="inline-flex min-h-[44px] items-center rounded-lg bg-amber-700 px-3 py-1.5 font-bold text-white hover:bg-amber-800 transition"
                  >
                    {t("editOfferings")}
                  </a>
                )}
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="space-y-4">
                <label className="flex items-center justify-between gap-3 rounded-xl border border-zinc-200 px-3 py-2.5">
                  <span className="text-xs font-semibold text-zinc-700">{t("enableReservations")}</span>
                  <input
                    type="checkbox"
                    checked={enabled}
                    disabled={!canManage || isSubmitting}
                    onChange={(e) => setEnabled(e.target.checked)}
                    className="h-5 w-5 accent-orange-700"
                  />
                </label>

                <div className="grid grid-cols-2 gap-3">
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-700">{t("maxPartySize")}</label>
                    <input
                      type="number"
                      min="1"
                      max="50"
                      step="1"
                      required
                      disabled={!canManage || isSubmitting}
                      value={maxParty}
                      onChange={(e) => setMaxParty(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-700">{t("minLeadMinutes")}</label>
                    <input
                      type="number"
                      min="0"
                      max="1440"
                      step="1"
                      required
                      disabled={!canManage || isSubmitting}
                      value={leadMinutes}
                      onChange={(e) => setLeadMinutes(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-700">{t("maxDaysAhead")}</label>
                    <input
                      type="number"
                      min="1"
                      max="180"
                      step="1"
                      required
                      disabled={!canManage || isSubmitting}
                      value={daysAhead}
                      onChange={(e) => setDaysAhead(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm focus:border-orange-500 focus:outline-none"
                    />
                  </div>
                  <div className="space-y-1">
                    <label className="text-xs font-semibold text-zinc-700">{t("slotMinutes")}</label>
                    <select
                      disabled={!canManage || isSubmitting}
                      value={slotMinutes}
                      onChange={(e) => setSlotMinutes(e.target.value)}
                      className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm bg-white focus:border-orange-500 focus:outline-none"
                    >
                      <option value="15">{t("slot15")}</option>
                      <option value="30">{t("slot30")}</option>
                      <option value="60">{t("slot60")}</option>
                    </select>
                  </div>
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">{t("settingsNote")}</label>
                  <textarea
                    rows={2}
                    maxLength={200}
                    disabled={!canManage || isSubmitting}
                    value={note}
                    onChange={(e) => setNote(e.target.value)}
                    placeholder={t("settingsNotePlaceholder")}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none"
                  />
                </div>

                {error && (
                  <div className="rounded-lg bg-red-50 border border-red-200 p-2.5 text-xs text-red-700 font-medium">
                    {error}
                  </div>
                )}
                {success && (
                  <div className="rounded-lg bg-emerald-50 border border-emerald-200 p-2.5 text-xs text-emerald-800 font-medium">
                    {t("settingsSaved")}
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
                      {t("settingsButton")}
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
