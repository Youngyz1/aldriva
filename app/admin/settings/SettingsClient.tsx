"use client";

import { useEffect, useState } from "react";
import { SettingsCard } from "@/components/ui/settings-card";
import {
  PLATFORM_SETTING_GROUPS,
  mergePlatformSettings,
  platformSettingsToRows,
  type PlatformSettingKey,
} from "@/types/platform-settings";

const fieldClass =
  "w-full rounded-xl border border-zinc-200 bg-white px-4 py-3 text-sm font-semibold outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-200";

export default function SettingsClient() {
  const [settings, setSettings] = useState<Record<PlatformSettingKey, string>>(
    mergePlatformSettings(null)
  );
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [toast, setToast] = useState("");
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/admin/settings")
      .then((r) => r.json())
      .then((d) => {
        setSettings(mergePlatformSettings(d.settings ?? []));
        setLoading(false);
      })
      .catch(() => {
        setError("Failed to load settings.");
        setLoading(false);
      });
  }, []);

  function onChange(key: PlatformSettingKey, value: string) {
    setSettings((prev) => ({ ...prev, [key]: value }));
  }

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError("");
    setToast("");

    const res = await fetch("/api/admin/settings", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: platformSettingsToRows(settings) }),
    });

    setSaving(false);

    if (res.ok) {
      setToast("Settings saved successfully.");
      setTimeout(() => setToast(""), 3500);
    } else {
      const d = await res.json();
      setError(d.error ?? "Save failed.");
    }
  }

  return (
    <div className="space-y-6">
      <header className="rounded-2xl border border-zinc-200/80 bg-white px-5 py-4 shadow-sm sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">Admin</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight">Platform Settings</h1>
        <p className="mt-2 text-sm font-medium text-zinc-500">
          Configure platform fees, moderation rules, email, branding, and security.
        </p>
      </header>

      {toast && (
        <div className="rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          {error}
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <div className="h-8 w-8 animate-spin rounded-full border-4 border-violet-500 border-t-transparent" />
        </div>
      ) : (
        <form onSubmit={handleSave} className="space-y-6">
          {PLATFORM_SETTING_GROUPS.map((group) => (
            <SettingsCard
              key={group.id}
              title={group.title}
              description={group.description}
            >
              <div className="grid gap-5 sm:grid-cols-2">
                {group.fields.map((field) => (
                  <div key={field.key} className={field.inputType === "boolean" ? "sm:col-span-2" : undefined}>
                    {field.inputType === "boolean" ? (
                      <label className="flex cursor-pointer items-center justify-between gap-4 rounded-xl border border-zinc-200 bg-zinc-50/50 px-4 py-3.5">
                        <div>
                          <span className="block text-sm font-bold text-zinc-900">{field.label}</span>
                          {field.description && (
                            <span className="mt-0.5 block text-xs text-zinc-500">{field.description}</span>
                          )}
                        </div>
                        <input
                          type="checkbox"
                          checked={settings[field.key] === "true"}
                          onChange={(e) => onChange(field.key, e.target.checked ? "true" : "false")}
                          className="h-5 w-5 rounded border-zinc-300 text-violet-600 focus:ring-violet-500"
                        />
                      </label>
                    ) : field.inputType === "color" ? (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                          {field.label}
                        </span>
                        <div className="flex items-center gap-3">
                          <input
                            type="color"
                            value={settings[field.key] || "#7c3aed"}
                            onChange={(e) => onChange(field.key, e.target.value)}
                            className="h-11 w-14 cursor-pointer rounded-lg border border-zinc-200 bg-white p-1"
                          />
                          <input
                            type="text"
                            value={settings[field.key]}
                            onChange={(e) => onChange(field.key, e.target.value)}
                            className={fieldClass}
                            placeholder="#7c3aed"
                          />
                        </div>
                      </label>
                    ) : (
                      <label className="block">
                        <span className="mb-1.5 block text-xs font-black uppercase tracking-wide text-zinc-500">
                          {field.label}
                        </span>
                        {field.description && (
                          <span className="mb-1.5 block text-xs text-zinc-400">{field.description}</span>
                        )}
                        <input
                          type={field.inputType === "number" ? "number" : field.inputType === "email" ? "email" : "text"}
                          value={settings[field.key]}
                          onChange={(e) => onChange(field.key, e.target.value)}
                          className={fieldClass}
                        />
                      </label>
                    )}
                  </div>
                ))}
              </div>
            </SettingsCard>
          ))}

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={saving}
              className="rounded-xl bg-violet-600 px-6 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-60"
            >
              {saving ? "Saving…" : "Save Settings"}
            </button>
          </div>
        </form>
      )}
    </div>
  );
}
