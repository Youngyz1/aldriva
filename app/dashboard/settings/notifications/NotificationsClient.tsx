"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { SettingsCard } from "@/components/ui/settings-card";
import { type NotificationPreferences } from "@/types/settings";

function Toggle({
  checked,
  onChange,
  label,
  description,
  disabled = false,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
  disabled?: boolean;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-100 py-4 last:border-0 sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-bold text-zinc-900 sm:text-base">{label}</p>
        <p className="mt-0.5 text-xs leading-normal text-zinc-500 sm:text-sm">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        disabled={disabled}
        onClick={() => !disabled && onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-hidden ${
          checked ? "bg-orange-600" : "bg-zinc-200"
        } ${disabled ? "opacity-50 cursor-not-allowed" : ""}`}
      >
        <span
          className={`inline-block h-6 w-6 transform rounded-full bg-white shadow-xs transition-transform duration-200 ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </button>
    </div>
  );
}

export default function NotificationsClient({
  userId,
  initialPrefs,
}: {
  userId: string;
  initialPrefs: NotificationPreferences;
}) {
  const [prefs, setPrefs] = useState<NotificationPreferences>(initialPrefs);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");

    try {
      const { error: dbError } = await supabase
        .from("profiles")
        .update({ preferences: prefs })
        .eq("id", userId);

      if (dbError) throw new Error(dbError.message);
      showToast("Notification preferences updated successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save notification preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSave} className="space-y-6">
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {/* Organizer Notifications */}
      <SettingsCard
        title="Organization Alerts"
        description="Configure what emails you receive in relation to hosting and managing events."
      >
        <Toggle
          checked={!!prefs.notify_ticket_purchase}
          onChange={(v) => setPrefs((prev) => ({ ...prev, notify_ticket_purchase: v }))}
          label="Ticket Purchases"
          description="Receive a notification email whenever a customer purchases a ticket to one of your events."
        />
        <Toggle
          checked={!!prefs.notify_donation}
          onChange={(v) => setPrefs((prev) => ({ ...prev, notify_donation: v }))}
          label="Donation Receipts"
          description="Receive a notification email whenever a supporter donates to one of your active campaigns."
        />
      </SettingsCard>

      {/* General Notifications */}
      <SettingsCard
        title="General Updates"
        description="Receive reminders and promotional material regarding community gatherings."
      >
        <Toggle
          checked={!!prefs.notify_event_reminder}
          onChange={(v) => setPrefs((prev) => ({ ...prev, notify_event_reminder: v }))}
          label="Event Reminders"
          description="Get reminders prior to upcoming events you register for as an attendee."
        />
        <Toggle
          checked={!!prefs.notify_marketing}
          onChange={(v) => setPrefs((prev) => ({ ...prev, notify_marketing: v }))}
          label="Marketing & Promotional"
          description="Receive updates on new features, events recommendations, and seasonal offers."
        />
        <Toggle
          checked={true}
          onChange={() => {}}
          disabled={true}
          label="Security & Account Alerts"
          description="Critical notifications about account access, password resets, and policy changes (cannot be disabled)."
        />
      </SettingsCard>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60 transition"
        >
          {saving ? "Saving Preferences..." : "Save Preferences"}
        </button>
      </div>
    </form>
  );
}
