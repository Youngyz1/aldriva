"use client";

import { Input } from "@/components/ui/input";
import { Select } from "@/components/ui/select";
import { FormSection, FieldGroup, Field } from "@/components/layout/FormSection";
import type { ThemeConfig, WebsiteStatus } from "@/lib/website-nav";

const THEME_PRESETS = [
  { id: "default", name: "Default", color: "#ea580c" },
  { id: "minimal", name: "Minimal Clean", color: "#18181b" },
  { id: "bold", name: "Bold Electric", color: "#2563eb" },
  { id: "warm", name: "Warm Amber", color: "#d97706" },
  { id: "forest", name: "Deep Forest", color: "#059669" },
  { id: "midnight", name: "Midnight Indigo", color: "#4f46e5" },
] as const;

export function GeneralPanel({
  siteTitle,
  setSiteTitle,
  siteTagline,
  setSiteTagline,
  status,
  setStatus,
  themeConfig,
  setThemeConfig,
}: {
  siteTitle: string;
  setSiteTitle: (v: string) => void;
  siteTagline: string;
  setSiteTagline: (v: string) => void;
  status: WebsiteStatus;
  setStatus: (v: WebsiteStatus) => void;
  themeConfig: ThemeConfig;
  setThemeConfig: (v: ThemeConfig | ((prev: ThemeConfig) => ThemeConfig)) => void;
}) {
  return (
    <div className="space-y-6">
      <FormSection title="General Information">
        <FieldGroup>
          <Field label="Site Title *" htmlFor="siteTitle">
            <Input id="siteTitle" value={siteTitle} onChange={(e) => setSiteTitle(e.target.value)} />
          </Field>
          <Field label="Publication Status" htmlFor="siteStatus">
            <Select id="siteStatus" value={status} onChange={(e) => setStatus(e.target.value as WebsiteStatus)}>
              <option value="draft">Draft (Private)</option>
              <option value="published">Published (Live)</option>
              <option value="archived">Archived</option>
            </Select>
          </Field>
        </FieldGroup>
        <Field label="Site Tagline" htmlFor="siteTagline">
          <Input id="siteTagline" value={siteTagline} onChange={(e) => setSiteTagline(e.target.value)} placeholder="A short catchy summary of what you offer..." />
        </Field>
      </FormSection>

      <FormSection title="Theme & Style Presets">
        <div>
          <span className="mb-2 block text-xs font-semibold text-zinc-700">Preset Theme</span>
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
            {THEME_PRESETS.map((preset) => (
              <button
                key={preset.id}
                type="button"
                onClick={() =>
                  setThemeConfig((prev: ThemeConfig) => ({
                    ...prev,
                    theme: preset.id as ThemeConfig["theme"],
                    primaryColor: preset.color,
                  }))
                }
                className={`flex items-center gap-3 rounded-xl border p-3 text-left transition ${themeConfig.theme === preset.id ? "border-primary bg-primary/5" : "border-zinc-200 hover:border-zinc-300"}`}
              >
                <span className="h-5 w-5 shrink-0 rounded-full border border-black/10" style={{ backgroundColor: preset.color }} />
                <span className="text-xs font-semibold text-zinc-900">{preset.name}</span>
              </button>
            ))}
          </div>
        </div>

        <FieldGroup className="sm:grid-cols-3">
          <Field label="Primary Color">
            <div className="flex items-center gap-2">
              <input type="color" value={themeConfig.primaryColor} onChange={(e) => setThemeConfig((prev: ThemeConfig) => ({ ...prev, primaryColor: e.target.value }))} className="h-10 w-12 cursor-pointer rounded-lg border border-zinc-200 bg-zinc-50 p-1" />
              <Input value={themeConfig.primaryColor} onChange={(e) => setThemeConfig((prev: ThemeConfig) => ({ ...prev, primaryColor: e.target.value }))} className="font-mono" />
            </div>
          </Field>
          <Field label="Font Family">
            <Select value={themeConfig.fontFamily} onChange={(e) => setThemeConfig((prev: ThemeConfig) => ({ ...prev, fontFamily: e.target.value as ThemeConfig["fontFamily"] }))}>
              <option value="sans">Modern Sans-Serif</option>
              <option value="serif">Classic Serif</option>
              <option value="mono">Technical Monospace</option>
            </Select>
          </Field>
          <Field label="Corner Radius">
            <Select value={themeConfig.borderRadius} onChange={(e) => setThemeConfig((prev: ThemeConfig) => ({ ...prev, borderRadius: e.target.value as ThemeConfig["borderRadius"] }))}>
              <option value="none">Square (None)</option>
              <option value="sm">Small (sm)</option>
              <option value="md">Medium (md)</option>
              <option value="lg">Large (lg)</option>
              <option value="xl">Extra Large (xl)</option>
              <option value="full">Fully Rounded (Pill)</option>
            </Select>
          </Field>
        </FieldGroup>
      </FormSection>
    </div>
  );
}
