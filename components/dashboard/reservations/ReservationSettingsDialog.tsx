"use client";

import { useState } from "react";
import { useTranslations, useLocale } from "next-intl";
import { saveReservationSettings } from "@/lib/actions/reservations";
import type { ReservationSettings } from "@/lib/reservation-settings";
import { IconSettings as Settings, IconX as X, IconPlus as Plus } from "@tabler/icons-react";

const DURATION_PRESETS = [60, 90, 120, 180, 240];

function formatDurationOption(mins: number): string {
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  if (h > 0 && m > 0) return `${h} h ${m}`;
  if (h > 0) return `${h} h`;
  return `${m} m`;
}

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
  const [seatCapacity, setSeatCapacity] = useState<string>(
    initialSettings.seat_capacity ? String(initialSettings.seat_capacity) : ""
  );
  const [cutoffMinutes, setCutoffMinutes] = useState<string>(
    initialSettings.cancellation_cutoff_minutes !== null && initialSettings.cancellation_cutoff_minutes !== undefined
      ? String(initialSettings.cancellation_cutoff_minutes)
      : ""
  );
  const initialDurations =
    Array.isArray(initialSettings.allowed_stay_minutes) && initialSettings.allowed_stay_minutes.length > 0
      ? [...initialSettings.allowed_stay_minutes].sort((a, b) => a - b)
      : initialSettings.default_stay_minutes === initialSettings.max_stay_minutes
        ? [initialSettings.default_stay_minutes ?? 90]
        : [initialSettings.default_stay_minutes ?? 90, initialSettings.max_stay_minutes ?? 120].sort((a, b) => a - b);

  const [allowedDurations, setAllowedDurations] = useState<number[]>(initialDurations);
  const [defaultStay, setDefaultStay] = useState<number>(
    initialSettings.default_stay_minutes && initialDurations.includes(initialSettings.default_stay_minutes)
      ? initialSettings.default_stay_minutes
      : initialDurations[0] ?? 90
  );
  const [customMinutes, setCustomMinutes] = useState("");
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
    setSeatCapacity(initialSettings.seat_capacity ? String(initialSettings.seat_capacity) : "");
    setCutoffMinutes(
      initialSettings.cancellation_cutoff_minutes !== null && initialSettings.cancellation_cutoff_minutes !== undefined
        ? String(initialSettings.cancellation_cutoff_minutes)
        : ""
    );
    const resetDurations =
      Array.isArray(initialSettings.allowed_stay_minutes) && initialSettings.allowed_stay_minutes.length > 0
        ? [...initialSettings.allowed_stay_minutes].sort((a, b) => a - b)
        : initialSettings.default_stay_minutes === initialSettings.max_stay_minutes
          ? [initialSettings.default_stay_minutes ?? 90]
          : [initialSettings.default_stay_minutes ?? 90, initialSettings.max_stay_minutes ?? 120].sort((a, b) => a - b);
    setAllowedDurations(resetDurations);
    setDefaultStay(
      initialSettings.default_stay_minutes && resetDurations.includes(initialSettings.default_stay_minutes)
        ? initialSettings.default_stay_minutes
        : resetDurations[0] ?? 90
    );
    setCustomMinutes("");
    setNote(initialSettings.note ?? "");
    setIsOpen(true);
  };

  const handleAddDuration = (mins: number) => {
    if (mins < 15 || mins > 720) return;
    if (allowedDurations.includes(mins)) return;
    if (allowedDurations.length >= 8) return;
    const next = [...allowedDurations, mins].sort((a, b) => a - b);
    setAllowedDurations(next);
  };

  const handleRemoveDuration = (mins: number) => {
    if (allowedDurations.length <= 1) return;
    const next = allowedDurations.filter((d) => d !== mins);
    setAllowedDurations(next);
    if (defaultStay === mins) {
      setDefaultStay(next[0]);
    }
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

    const numCapacity = seatCapacity.trim() ? Math.round(Number(seatCapacity)) : null;
    if (numCapacity !== null && (!Number.isFinite(numCapacity) || numCapacity < 1 || numCapacity > 5000)) {
      setError(locale === "fr" ? "Capacité en sièges invalide (1 à 5000)." : "Invalid seat capacity (1 to 5000).");
      return;
    }

    const numCutoff = cutoffMinutes.trim() ? Math.round(Number(cutoffMinutes)) : null;
    if (numCutoff !== null && (!Number.isFinite(numCutoff) || numCutoff < 0 || numCutoff > 10080)) {
      setError(
        locale === "fr"
          ? "Délai limite d'annulation invalide (0 à 10080 minutes)."
          : "Invalid cancellation cutoff (0 to 10080 minutes)."
      );
      return;
    }

    if (allowedDurations.length < 1 || allowedDurations.length > 8) {
      setError(locale === "fr" ? "Veuillez définir entre 1 et 8 durées autorisées." : "Please define between 1 and 8 allowed durations.");
      return;
    }

    if (!allowedDurations.includes(defaultStay)) {
      setError(locale === "fr" ? "La durée par défaut doit faire partie des durées autorisées." : "Default stay must be one of the allowed durations.");
      return;
    }

    if (defaultStay > 480) {
      setError(locale === "fr" ? "La durée par défaut ne peut pas dépasser 480 minutes." : "Default stay cannot exceed 480 minutes.");
      return;
    }

    const maxStayVal = allowedDurations[allowedDurations.length - 1];

    setIsSubmitting(true);
    try {
      const res = await saveReservationSettings({
        organizerId,
        websiteId,
        businessId,
        enabled,
        max_party_size: numParty,
        min_lead_minutes: Number.isFinite(numLead) ? numLead : 60,
        max_days_ahead: Number.isFinite(numDays) ? numDays : 30,
        slot_minutes: numSlot,
        note: note.trim() || null,
        seat_capacity: numCapacity,
        default_stay_minutes: defaultStay,
        max_stay_minutes: maxStayVal,
        allowed_stay_minutes: allowedDurations,
        cancellation_cutoff_minutes: numCutoff,
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
          seat_capacity: numCapacity,
          default_stay_minutes: defaultStay,
          max_stay_minutes: maxStayVal,
          allowed_stay_minutes: allowedDurations,
          cancellation_cutoff_minutes: numCutoff,
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
                  <label className="text-xs font-semibold text-zinc-700">
                    {locale === "fr" ? "Capacité en sièges" : "Seat Capacity"}
                    <span className="ml-1 text-[11px] font-normal text-zinc-500">
                      {locale === "fr" ? "(Optionnel, contrôle de surréservation)" : "(Optional, overbooking guard)"}
                    </span>
                  </label>
                  <input
                    type="number"
                    min="1"
                    max="5000"
                    step="1"
                    placeholder="e.g. 50"
                    disabled={!canManage || isSubmitting}
                    value={seatCapacity}
                    onChange={(e) => setSeatCapacity(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm focus:border-orange-500 focus:outline-none"
                  />
                </div>

                <div className="space-y-1">
                  <label className="text-xs font-semibold text-zinc-700">
                    {locale === "fr" ? "Délai limite d'annulation" : "Cancellation Cutoff"}
                    <span className="ml-1 text-[11px] font-normal text-zinc-500">
                      {locale === "fr"
                        ? "(Minutes avant le début ; vide pour aucun délai)"
                        : "(Minutes before start; leave empty for no limit)"}
                    </span>
                  </label>
                  <input
                    type="number"
                    min="0"
                    max="10080"
                    step="1"
                    placeholder={locale === "fr" ? "ex. 120 (laisser vide pour aucun)" : "e.g. 120 (leave empty for no limit)"}
                    disabled={!canManage || isSubmitting}
                    value={cutoffMinutes}
                    onChange={(e) => setCutoffMinutes(e.target.value)}
                    className="w-full min-h-[44px] rounded-xl border border-zinc-200 px-3 text-sm focus:border-orange-500 focus:outline-none"
                  />
                  <p className="text-[11px] text-zinc-500">
                    {locale === "fr"
                      ? "Les convives peuvent annuler jusqu'à X minutes avant la réservation (laisser vide pour aucun délai)"
                      : "Guests can cancel until X before the reservation (leave empty for no limit)"}
                  </p>
                </div>

                <div className="space-y-3 rounded-xl border border-zinc-200 p-3 bg-zinc-50/50">
                  <div className="flex items-center justify-between">
                    <div>
                      <span className="text-xs font-bold text-zinc-800">
                        {locale === "fr" ? "Durées de séjour autorisées" : "Allowed Stay Durations"}
                      </span>
                      <p className="text-[11px] text-zinc-500">
                        {locale === "fr" ? "Options proposées aux convives (1 à 8 durées)" : "Options offered to guests (1 to 8 durations)"}
                      </p>
                    </div>
                    <span className="text-[11px] font-semibold text-zinc-500">
                      {allowedDurations.length}/8
                    </span>
                  </div>

                  {/* Active chips */}
                  <div className="flex flex-wrap gap-1.5">
                    {allowedDurations.map((d) => {
                      const isDefault = d === defaultStay;
                      return (
                        <span
                          key={d}
                          className={`inline-flex items-center gap-1.5 rounded-lg px-2.5 py-1 text-xs font-medium border ${
                            isDefault
                              ? "bg-orange-50 border-orange-200 text-orange-900 font-semibold"
                              : "bg-white border-zinc-200 text-zinc-700"
                          }`}
                        >
                          <span>{formatDurationOption(d)} ({d}m)</span>
                          {isDefault && (
                            <span className="text-[10px] px-1 py-0.5 rounded bg-orange-200/60 text-orange-800 font-bold">
                              {locale === "fr" ? "Défaut" : "Default"}
                            </span>
                          )}
                          {allowedDurations.length > 1 && canManage && !isSubmitting && (
                            <button
                              type="button"
                              onClick={() => handleRemoveDuration(d)}
                              className="text-zinc-400 hover:text-zinc-600 rounded p-0.5"
                              title={`Remove ${d}m`}
                              aria-label={`Remove ${d}m`}
                            >
                              <X className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </span>
                      );
                    })}
                  </div>

                  {/* Preset suggestions & custom add */}
                  {canManage && !isSubmitting && allowedDurations.length < 8 && (
                    <div className="space-y-2 pt-1">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-[11px] font-medium text-zinc-500">
                          {locale === "fr" ? "Ajouter :" : "Add preset:"}
                        </span>
                        {DURATION_PRESETS.filter((p) => !allowedDurations.includes(p)).map((p) => (
                          <button
                            key={p}
                            type="button"
                            onClick={() => handleAddDuration(p)}
                            className="inline-flex items-center gap-0.5 rounded-md border border-zinc-200 bg-white px-2 py-0.5 text-[11px] font-medium text-zinc-700 hover:bg-zinc-100 transition-colors"
                          >
                            <Plus className="w-3 h-3 text-zinc-500" />
                            <span>{formatDurationOption(p)}</span>
                          </button>
                        ))}
                      </div>

                      <div className="flex items-center gap-2">
                        <input
                          type="number"
                          min="15"
                          max="720"
                          step="15"
                          placeholder="e.g. 45"
                          value={customMinutes}
                          onChange={(e) => setCustomMinutes(e.target.value)}
                          className="w-28 min-h-[36px] rounded-lg border border-zinc-200 px-2.5 text-xs bg-white focus:border-orange-500 focus:outline-none"
                        />
                        <button
                          type="button"
                          onClick={() => {
                            const val = Math.round(Number(customMinutes));
                            if (Number.isFinite(val) && val >= 15 && val <= 720) {
                              handleAddDuration(val);
                              setCustomMinutes("");
                            }
                          }}
                          className="min-h-[36px] rounded-lg border border-zinc-200 bg-white px-2.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50"
                        >
                          {locale === "fr" ? "Ajouter" : "Add custom"}
                        </button>
                      </div>
                    </div>
                  )}

                  {/* Default Duration Selector */}
                  <div className="pt-2 border-t border-zinc-200/80 flex items-center justify-between gap-3">
                    <label className="text-xs font-semibold text-zinc-700">
                      {locale === "fr" ? "Durée par défaut" : "Default Duration"}
                    </label>
                    <select
                      disabled={!canManage || isSubmitting}
                      value={defaultStay}
                      onChange={(e) => setDefaultStay(Number(e.target.value))}
                      className="min-h-[36px] rounded-lg border border-zinc-200 px-2.5 text-xs bg-white font-medium text-zinc-800 focus:border-orange-500 focus:outline-none"
                    >
                      {allowedDurations.map((d) => (
                        <option key={d} value={d}>
                          {formatDurationOption(d)} ({d} mins)
                        </option>
                      ))}
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
                      {locale === "fr" ? "Enregistrer" : "Save"}
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
