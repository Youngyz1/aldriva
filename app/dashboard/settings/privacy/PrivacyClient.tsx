"use client";

import { useState } from "react";
import { supabase } from "@/lib/supabase";
import { SettingsCard } from "@/components/ui/settings-card";
import { type PrivacySettings } from "@/types/settings";

function Toggle({
  checked,
  onChange,
  label,
  description,
}: {
  checked: boolean;
  onChange: (v: boolean) => void;
  label: string;
  description: string;
}) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-zinc-150 py-4 last:border-0 sm:gap-6">
      <div className="min-w-0">
        <p className="text-sm font-bold text-zinc-900 sm:text-base">{label}</p>
        <p className="mt-0.5 text-xs leading-normal text-zinc-500 sm:text-sm">{description}</p>
      </div>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        onClick={() => onChange(!checked)}
        className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 focus:outline-hidden ${
          checked ? "bg-orange-600" : "bg-zinc-200"
        }`}
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

export default function PrivacyClient({
  userId,
  initialPrivacy,
}: {
  userId: string;
  initialPrivacy: PrivacySettings;
}) {
  const [privacy, setPrivacy] = useState<PrivacySettings>(initialPrivacy);
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
        .update({ privacy_settings: privacy })
        .eq("id", userId);

      if (dbError) throw new Error(dbError.message);
      showToast("Privacy configurations saved successfully.");
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : "Could not save privacy settings.");
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

      {/* Profile Visibility */}
      <SettingsCard
        title="Profile Discoverability"
        description="Choose who can search for your profile and view your credentials."
      >
        <div className="space-y-6">
          <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between border-b border-zinc-150 pb-5">
            <div>
              <p className="text-sm font-bold text-zinc-900 sm:text-base">Profile Status</p>
              <p className="mt-0.5 text-xs text-zinc-500 sm:text-sm leading-normal">
                Setting your profile to private hides your email and contact cards from search queries.
              </p>
            </div>
            <select
              value={privacy.profile_visibility}
              onChange={(e) => setPrivacy((prev) => ({ ...prev, profile_visibility: e.target.value as "public" | "private" }))}
              className="rounded-lg border border-zinc-200 bg-white px-3 py-2 text-xs font-semibold outline-hidden transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 sm:rounded-xl sm:px-4 sm:py-2.5 sm:text-sm shrink-0"
            >
              <option value="public">Public (Everyone)</option>
              <option value="private">Private (Only You)</option>
            </select>
          </div>

          <Toggle
            checked={!!privacy.allow_search_indexing}
            onChange={(v) => setPrivacy((prev) => ({ ...prev, allow_search_indexing: v }))}
            label="Search Engine Indexing"
            description="Allow search engines (Google, Bing) to index your public organizer profile page."
          />
        </div>
      </SettingsCard>

      {/* Content Privacy */}
      <SettingsCard
        title="Content Privacy"
        description="Select what user activities are broadcasted publicly."
      >
        <Toggle
          checked={!!privacy.show_email}
          onChange={(v) => setPrivacy((prev) => ({ ...prev, show_email: v }))}
          label="Display Email"
          description="Display your email address on your public organizer profile page."
        />
        <Toggle
          checked={!!privacy.show_organized_events}
          onChange={(v) => setPrivacy((prev) => ({ ...prev, show_organized_events: v }))}
          label="Show Organized Events"
          description="List your currently active hosted events on your public organizer profile."
        />
        <Toggle
          checked={!!privacy.show_donations}
          onChange={(v) => setPrivacy((prev) => ({ ...prev, show_donations: v }))}
          label="Display Donation Badges"
          description="Display donation amount badges on the public fundraiser support boards."
        />
      </SettingsCard>

      <div className="flex justify-end">
        <button
          type="submit"
          disabled={saving}
          className="rounded-xl bg-orange-600 px-6 py-3 text-sm font-black text-white hover:bg-orange-700 disabled:opacity-60 transition"
        >
          {saving ? "Saving Privacy..." : "Save Privacy Settings"}
        </button>
      </div>
    </form>
  );
}
