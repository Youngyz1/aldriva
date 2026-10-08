"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams } from "next/navigation";
import * as LucideIcons from "lucide-react";
import {
  LayoutTemplate,
  Calendar,
  HandHeart,
  Grid3x3,
  MessageSquareQuote,
  Handshake,
  Search as SearchIcon,
  Plus,
  Trash2,
  Edit2,
  ArrowUp,
  ArrowDown,
  Eye,
  EyeOff,
  Star,
  AlertCircle,
  Loader2,
  Globe,
  ImageIcon,
  UserCircle2,
  Upload,
} from "lucide-react";
import { HomepageSettings } from "@/lib/homepage-hero";
import { useImageUpload } from "@/hooks/use-image-upload";
import { MAX_PUBLIC_MEDIA_BYTES, PUBLIC_MEDIA_TYPES } from "@/lib/media/constants";
import { uploadPublicMedia } from "@/lib/media/upload-public-media";
import PageHeader from "@/components/admin/PageHeader";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
} from "@/components/ui/sheet";
import HeroFanManager from "./HeroFanManager";
import { homepageStrings as s } from "./strings";

// ── Types ──────────────────────────────────────────────────────────────────

interface Category {
  id: string; name: string; icon: string; position: number; is_visible: boolean;
}

interface CMSItem {
  id: string; title: string; slug: string;
  is_homepage_featured: boolean; homepage_position: number;
  event_date?: string; city?: string; goal?: number; raised?: number;
}

interface Testimonial {
  id: string; name: string; role: string; photo_url: string;
  quote: string; position: number; is_visible: boolean;
}

interface Sponsor {
  id: string; name: string; logo_url: string;
  website_url: string; position: number; is_visible: boolean;
}

interface Props {
  initialSettings:     HomepageSettings;
  initialEvents:       CMSItem[];
  initialFundraisers:  CMSItem[];
  initialCategories:   Category[];
  initialTestimonials: Testimonial[];
  initialSponsors:     Sponsor[];
  migrationMissing:    boolean;
}

type Tab = "hero" | "events" | "fundraisers" | "categories" | "testimonials" | "sponsors" | "seo" | "events_landing" | "fundraisers_landing" | "organizers_landing";

// ── Helpers ────────────────────────────────────────────────────────────────

const RECOMMENDED_ICONS = [
  "Mic","Briefcase","GraduationCap","HandHeart","Stethoscope",
  "HeartHandshake","Users","Laptop","Calendar","Activity",
  "MapPin","Music","Trophy","Smile","Globe","Megaphone","Leaf","Flame",
];

function DynIcon({ name, className = "w-5 h-5 text-violet-600" }: { name: string; className?: string }) {
  const Ico = (LucideIcons as Record<string, any>)[name] ?? LucideIcons.HelpCircle;
  return <Ico className={className} />;
}

/**
 * Sentence-case labels (never uppercase); required markers are part of the
 * label text at each call site.
 */
function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[13px] font-semibold text-zinc-600">
      {children}
    </label>
  );
}

/** Standard 40px CMS input with a visible focus ring. */
const inputClass =
  "h-10 w-full rounded-md border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 outline-none transition focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/40 disabled:opacity-50";

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`${inputClass} ${props.className ?? ""}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-md border border-zinc-200 bg-white px-3 py-2.5 text-sm font-semibold text-zinc-900 outline-none transition focus:border-violet-500 focus-visible:ring-2 focus-visible:ring-violet-500/40 ${props.className ?? ""}`}
    />
  );
}

function SaveBtn({ saving, label }: { saving: boolean; label: string }) {
  return (
    <button
      type="submit"
      disabled={saving}
      className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-60"
    >
      {saving ? "Saving…" : label}
    </button>
  );
}

interface CmsImageFieldProps {
  label: string;
  value: string;
  onChange: (val: string) => void;
  folder: string;
  placeholder?: string;
  helpText?: string;
  aspectRatioHint?: string;
  aspectRatioCheck?: boolean;
}

function CmsImageField({
  label,
  value,
  onChange,
  folder,
  placeholder = "https://… or /…",
  helpText,
  aspectRatioHint,
  aspectRatioCheck = false,
}: CmsImageFieldProps) {
  const [aspectWarning, setAspectWarning] = useState<string | null>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const { uploading, progress, fileInputRef, triggerUpload, handleFileChange } = useImageUpload({
    bucket: null,
    folder,
    maxOriginalBytes: MAX_PUBLIC_MEDIA_BYTES,
    allowedTypes: PUBLIC_MEDIA_TYPES,
    upload: (file, onProgress) => uploadPublicMedia(file, "cms", {}, onProgress),
    onSuccess: (url) => {
      setUploadError(null);
      onChange(url);
    },
    onError: (err) => {
      setUploadError(err);
    },
  });

  const onFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    setUploadError(null);
    setAspectWarning(null);
    const file = e.target.files?.[0];
    if (file && aspectRatioCheck) {
      try {
        const bmp = await createImageBitmap(file);
        const ratio = bmp.width / bmp.height;
        // 1200/630 = ~1.905. Warn if aspect ratio deviates significantly
        if (ratio < 1.6 || ratio > 2.2) {
          setAspectWarning(
            `Advisory: Uploaded image is ${bmp.width}×${bmp.height}px (${ratio.toFixed(2)}:1). Social platforms render best with 1200×630px (1.91:1).`
          );
        }
        bmp.close();
      } catch {
        // non-blocking
      }
    }
    handleFileChange(e);
  };

  return (
    <div className="space-y-2">
      <FieldLabel>{label}</FieldLabel>
      <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
        {/* Preview Thumbnail */}
        <div className="relative h-12 w-20 shrink-0 overflow-hidden rounded-xl border border-zinc-200 bg-zinc-100 flex items-center justify-center">
          {value ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={value}
              alt={label}
              className="h-full w-full object-cover"
              onError={(e) => {
                (e.currentTarget as HTMLElement).style.display = "none";
              }}
            />
          ) : (
            <ImageIcon className="h-5 w-5 text-zinc-300" />
          )}
        </div>

        {/* URL Input */}
        <div className="flex-1 min-w-0">
          <Input
            type="text"
            value={value}
            onChange={(e) => {
              setUploadError(null);
              onChange(e.target.value);
            }}
            placeholder={placeholder}
          />
        </div>

        {/* Upload Button */}
        <div className="shrink-0">
          <button
            type="button"
            onClick={triggerUpload}
            disabled={uploading}
            className="inline-flex w-full sm:w-auto items-center justify-center gap-2 rounded-xl border border-zinc-200 bg-white px-4 py-2.5 text-sm font-black text-zinc-800 transition hover:bg-zinc-50 disabled:opacity-50"
          >
            {uploading ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin text-violet-600" />
                <span>
                  Uploading{typeof progress?.percent === "number" ? ` ${progress.percent}%` : "…"}
                </span>
              </>
            ) : (
              <>
                <Upload className="h-4 w-4 text-zinc-600" />
                <span>Upload image</span>
              </>
            )}
          </button>
          <input
            ref={fileInputRef}
            type="file"
            accept={PUBLIC_MEDIA_TYPES.join(",")}
            onChange={onFileInputChange}
            className="hidden"
          />
        </div>
      </div>

      {aspectRatioHint && (
        <p className="text-xs text-zinc-400 font-medium">{aspectRatioHint}</p>
      )}

      <p className="text-xs text-zinc-500">
        Images uploaded here are public and can be viewed by anyone with the URL.
      </p>

      {aspectWarning && (
        <p className="text-xs text-amber-600 font-semibold">{aspectWarning}</p>
      )}

      {uploadError && (
        <p className="text-xs text-red-600 font-semibold">{uploadError}</p>
      )}

      {helpText && (
        <p className="text-xs text-zinc-400">{helpText}</p>
      )}
    </div>
  );
}

// ── Main Component ─────────────────────────────────────────────────────────

export default function HomepageCmsTabs({
  initialSettings,
  initialEvents,
  initialFundraisers,
  initialCategories,
  initialTestimonials,
  initialSponsors,
  migrationMissing,
}: Props) {
  const searchParams = useSearchParams();
  const tabParam = searchParams.get("tab") as Tab | null;

  const [activeTab, setActiveTab]     = useState<Tab>("hero");
  const [settings, setSettings]       = useState(initialSettings);
  const [featuredEvents, setFE]       = useState(initialEvents);
  const [featuredFundraisers, setFF]  = useState(initialFundraisers);
  const [categories, setCats]         = useState(initialCategories);
  const [testimonials, setTestimonials] = useState(initialTestimonials);
  const [sponsors, setSponsors]       = useState(initialSponsors);

  const [eventSearch, setEventSearch]       = useState("");
  const [eventResults, setEventResults]     = useState<CMSItem[]>([]);
  const [searchingE, setSearchingE]         = useState(false);

  const [frSearch, setFrSearch]         = useState("");
  const [frResults, setFrResults]       = useState<CMSItem[]>([]);
  const [searchingF, setSearchingF]     = useState(false);

  const [saving, setSaving] = useState(false);
  const [toast, setToast]   = useState("");
  const [err,   setErr]     = useState("");

  const flash = (msg: string) => { setToast(msg); setTimeout(() => setToast(""), 3500); };

  // Sync state with URL parameter when it changes
  useEffect(() => {
    const validTabs: Tab[] = [
      "hero",
      "events",
      "fundraisers",
      "categories",
      "testimonials",
      "sponsors",
      "seo",
      "events_landing",
      "fundraisers_landing",
      "organizers_landing"
    ];
    if (tabParam && validTabs.includes(tabParam)) {
      setActiveTab(tabParam);
    }
  }, [tabParam]);

  const changeTab = (tabId: Tab) => {
    setActiveTab(tabId);
    setErr("");
    const params = new URLSearchParams(window.location.search);
    params.set("tab", tabId);
    window.history.pushState({}, "", `${window.location.pathname}?${params.toString()}`);
  };

  // Keep the active tab scrolled into view on the one-line tab bar.
  const tabBarRef = useRef<HTMLDivElement>(null);
  const activeTabRef = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    activeTabRef.current?.scrollIntoView({
      block: "nearest",
      inline: "center",
      behavior: "smooth",
    });
  }, [activeTab]);

  // ── Debounced event search ──
  useEffect(() => {
    if (!eventSearch.trim()) { setEventResults([]); return; }
    const t = setTimeout(async () => {
      setSearchingE(true);
      try {
        const r = await fetch(`/api/admin/homepage/events?q=${encodeURIComponent(eventSearch)}`);
        setEventResults((await r.json()).events ?? []);
      } finally { setSearchingE(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [eventSearch]);

  // ── Debounced fundraiser search ──
  useEffect(() => {
    if (!frSearch.trim()) { setFrResults([]); return; }
    const t = setTimeout(async () => {
      setSearchingF(true);
      try {
        const r = await fetch(`/api/admin/homepage/fundraisers?q=${encodeURIComponent(frSearch)}`);
        setFrResults((await r.json()).fundraisers ?? []);
      } finally { setSearchingF(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [frSearch]);

  // ── Settings save ──
  async function saveSettings(e: React.FormEvent) {
    e.preventDefault(); setSaving(true); setErr("");
    const rows = [
      { key: "homepage_hero_image_url",            value: settings.imageUrl },
      { key: "homepage_hero_title",                value: settings.title },
      { key: "homepage_hero_subtitle",             value: settings.subtitle },
      { key: "homepage_hero_eyebrow",              value: settings.subtitle },
      { key: "homepage_hero_headline_line_1",      value: settings.title },
      { key: "homepage_hero_headline_line_2",      value: settings.headlineLine2 },
      { key: "homepage_hero_button_text",          value: settings.buttonText },
      { key: "homepage_hero_button_href",          value: settings.buttonHref },
      { key: "homepage_hero_secondary_button_text",value: settings.secondaryButtonText },
      { key: "homepage_hero_secondary_button_href",value: settings.secondaryButtonHref },
      { key: "homepage_seo_title",                 value: settings.seoTitle },
      { key: "homepage_seo_description",           value: settings.seoDescription },
      { key: "homepage_seo_og_image_url",          value: settings.seoOgImageUrl },
      
      // Events landing keys
      { key: "events_hero_image_url",              value: settings.eventsHeroImageUrl },
      { key: "events_hero_eyebrow",                value: settings.eventsHeroEyebrow },
      { key: "events_hero_headline_line_1",        value: settings.eventsHeroHeadlineLine1 },
      { key: "events_hero_headline_line_2",        value: settings.eventsHeroHeadlineLine2 },
      { key: "events_hero_description",            value: settings.eventsHeroDescription },

      // Fundraisers landing keys
      { key: "fundraisers_hero_image_url",         value: settings.fundraisersHeroImageUrl },
      { key: "fundraisers_hero_eyebrow",           value: settings.fundraisersHeroEyebrow },
      { key: "fundraisers_hero_headline_line_1",   value: settings.fundraisersHeroHeadlineLine1 },
      { key: "fundraisers_hero_headline_line_2",   value: settings.fundraisersHeroHeadlineLine2 },
      { key: "fundraisers_hero_description",       value: settings.fundraisersHeroDescription },

      // Organizers landing keys
      { key: "organizers_hero_image_url",          value: settings.organizersHeroImageUrl },
      { key: "organizers_hero_eyebrow",            value: settings.organizersHeroEyebrow },
      { key: "organizers_hero_headline_line_1",    value: settings.organizersHeroHeadlineLine1 },
      { key: "organizers_hero_headline_line_2",    value: settings.organizersHeroHeadlineLine2 },
      { key: "organizers_hero_description",        value: settings.organizersHeroDescription },
    ];
    const res = await fetch("/api/admin/homepage/settings", {
      method: "POST", headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: rows }),
    });
    setSaving(false);
    if (res.ok) {
      flash("Settings saved.");
    } else {
      setErr((await res.json().catch(() => ({}))).error ?? "Save failed.");
    }
  }

  // ── Featured events toggle ──
  async function toggleEvent(item: CMSItem, on: boolean) {
    const pos = on ? Math.max(0, ...featuredEvents.map(e => e.homepage_position)) + 1 : 0;
    if (on) setFE(p => [...p, { ...item, is_homepage_featured: true, homepage_position: pos }].sort((a,b)=>a.homepage_position-b.homepage_position));
    else    setFE(p => p.filter(e => e.id !== item.id));
    setEventResults(p => p.map(e => e.id === item.id ? {...e, is_homepage_featured: on} : e));
    const res = await fetch("/api/admin/homepage/events", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ id: item.id, is_homepage_featured: on, homepage_position: pos }),
    });
    if (!res.ok) flash("Error updating event.");
    else flash(on ? "Event featured." : "Event removed.");
  }

  async function moveEvent(i: number, dir: "up"|"down") {
    const j = dir === "up" ? i-1 : i+1;
    if (j < 0 || j >= featuredEvents.length) return;
    const arr = [...featuredEvents];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const reordered = arr.map((e,idx) => ({...e, homepage_position: idx+1}));
    setFE(reordered);
    await Promise.all(reordered.map(e => fetch("/api/admin/homepage/events",{
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({id:e.id, homepage_position:e.homepage_position}),
    })));
    flash("Order saved.");
  }

  // ── Featured fundraisers toggle ──
  async function toggleFundraiser(item: CMSItem, on: boolean) {
    const pos = on ? Math.max(0, ...featuredFundraisers.map(f => f.homepage_position)) + 1 : 0;
    if (on) setFF(p => [...p, { ...item, is_homepage_featured: true, homepage_position: pos }].sort((a,b)=>a.homepage_position-b.homepage_position));
    else    setFF(p => p.filter(f => f.id !== item.id));
    setFrResults(p => p.map(f => f.id === item.id ? {...f, is_homepage_featured: on} : f));
    const res = await fetch("/api/admin/homepage/fundraisers", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({ id: item.id, is_homepage_featured: on, homepage_position: pos }),
    });
    if (!res.ok) flash("Error updating fundraiser.");
    else flash(on ? "Fundraiser featured." : "Fundraiser removed.");
  }

  async function moveFundraiser(i: number, dir: "up"|"down") {
    const j = dir === "up" ? i-1 : i+1;
    if (j < 0 || j >= featuredFundraisers.length) return;
    const arr = [...featuredFundraisers];
    [arr[i], arr[j]] = [arr[j], arr[i]];
    const reordered = arr.map((f,idx) => ({...f, homepage_position: idx+1}));
    setFF(reordered);
    await Promise.all(reordered.map(f => fetch("/api/admin/homepage/fundraisers",{
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({id:f.id, homepage_position:f.homepage_position}),
    })));
    flash("Order saved.");
  }

  // ── Tabs config ──
  const tabs: { id: Tab; label: string; icon: React.ComponentType<{className?:string}> }[] = [
    { id: "hero",          label: s.tabs.hero, icon: LayoutTemplate },
    { id: "events_landing", label: s.tabs.events_landing, icon: Calendar },
    { id: "fundraisers_landing", label: s.tabs.fundraisers_landing, icon: HandHeart },
    { id: "organizers_landing", label: s.tabs.organizers_landing, icon: UserCircle2 },
    { id: "events",        label: s.tabs.events, icon: Calendar },
    { id: "fundraisers",   label: s.tabs.fundraisers, icon: HandHeart },
    { id: "categories",    label: s.tabs.categories, icon: Grid3x3 },
    { id: "testimonials",  label: s.tabs.testimonials, icon: MessageSquareQuote },
    { id: "sponsors",      label: s.tabs.sponsors, icon: Handshake },
    { id: "seo",           label: s.tabs.seo, icon: SearchIcon },
  ];

  return (
    <div className="space-y-6">
      {/* Migration alert */}
      {migrationMissing && (
        <div className="flex gap-4 rounded-2xl border border-amber-200 bg-amber-50 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
          <div>
            <p className="text-sm font-black text-amber-900">Database migration required</p>
            <p className="mt-0.5 text-xs font-medium text-amber-800">
              Run <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">db/migration_16_homepage_cms.sql</code>,{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">db/migration_17_marketplace_arch.sql</code>, and{" "}
              <code className="rounded bg-amber-100 px-1 font-mono text-[11px]">db/migration_18_homepage_featured.sql</code> in your Supabase SQL Editor.
            </p>
          </div>
        </div>
      )}

      <PageHeader
        eyebrow={s.eyebrow}
        title={s.title}
        description={s.description}
      />

      {/* Toasts */}
      {toast && (
        <div className="flex items-center gap-2 rounded-2xl border border-emerald-200 bg-emerald-50 px-5 py-3 text-sm font-semibold text-emerald-700">
          <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />{toast}
        </div>
      )}
      {err && (
        <div className="flex items-center gap-2 rounded-2xl border border-red-200 bg-red-50 px-5 py-3 text-sm font-semibold text-red-700">
          <span className="h-1.5 w-1.5 rounded-full bg-red-500" />{err}
        </div>
      )}

      {/* Tab bar — one underline row, scrollable with snap, edge fade. */}
      <div
        ref={tabBarRef}
        role="tablist"
        aria-label={s.title}
        className="flex gap-1 overflow-x-auto border-b border-zinc-200 snap-x [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden [mask-image:linear-gradient(to_right,transparent,black_24px,black_calc(100%-24px),transparent)]"
      >
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              role="tab"
              aria-selected={active}
              ref={active ? activeTabRef : undefined}
              onClick={() => changeTab(tab.id)}
              className={`flex shrink-0 snap-start items-center gap-2 whitespace-nowrap border-b-2 px-3.5 py-2.5 text-xs font-bold transition ${
                active
                  ? "border-violet-600 text-zinc-950"
                  : "border-transparent text-zinc-500 hover:border-zinc-300 hover:text-zinc-800"
              }`}
            >
              <Icon className="h-3.5 w-3.5" aria-hidden="true" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ══════════════ HERO TAB ══════════════ */}
      {activeTab === "hero" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <form onSubmit={saveSettings} className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-base font-black text-zinc-950">Hero Block</h2>
            <CmsImageField
              label="Background image"
              value={settings.imageUrl}
              onChange={val => setSettings({ ...settings, imageUrl: val })}
              folder="hero"
              placeholder="https://… or /…"
              helpText="Background image for the main homepage hero banner."
            />
            <div>
              <FieldLabel>Eyebrow / subtitle</FieldLabel>
              <Input value={settings.subtitle} onChange={e => setSettings({...settings, subtitle: e.target.value, eyebrow: e.target.value})} placeholder="EVENTS • FUNDRAISING" />
            </div>
            <div>
              <FieldLabel>Headline line 1 (title)</FieldLabel>
              <Input value={settings.title} onChange={e => setSettings({...settings, title: e.target.value, headlineLine1: e.target.value})} placeholder="Sell Tickets. Raise Funds." />
            </div>
            <div>
              <FieldLabel>Headline line 2</FieldLabel>
              <Input value={settings.headlineLine2} onChange={e => setSettings({...settings, headlineLine2: e.target.value})} placeholder="Find Sponsors." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Primary CTA text</FieldLabel>
                <Input value={settings.buttonText} onChange={e => setSettings({...settings, buttonText: e.target.value})} />
              </div>
              <div>
                <FieldLabel>Primary CTA link</FieldLabel>
                <Input value={settings.buttonHref} onChange={e => setSettings({...settings, buttonHref: e.target.value})} placeholder="/events" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Secondary CTA text</FieldLabel>
                <Input value={settings.secondaryButtonText} onChange={e => setSettings({...settings, secondaryButtonText: e.target.value})} />
              </div>
              <div>
                <FieldLabel>Secondary CTA link</FieldLabel>
                <Input value={settings.secondaryButtonHref} onChange={e => setSettings({...settings, secondaryButtonHref: e.target.value})} placeholder="/dashboard/events/new" />
              </div>
            </div>
            <SaveBtn saving={saving} label="Save Hero Section" />
          </form>

          {/* Preview */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wide text-zinc-400">Live Preview</span>
            <div
              className="relative flex min-h-60 items-center overflow-hidden rounded-2xl bg-cover bg-center p-8"
              style={{ backgroundImage: `url("${settings.imageUrl.replaceAll('"', '')}")` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-black/80 via-black/45 to-black/10" />
              <div className="relative space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-white">{settings.subtitle}</p>
                <h2 className="text-3xl font-black leading-tight text-white drop-shadow-lg">
                  {settings.title}
                  {settings.headlineLine2 && <><br /><span className="text-violet-300">{settings.headlineLine2}</span></>}
                </h2>
                <div className="flex flex-wrap gap-3 pt-1">
                  <span className="rounded-full bg-white px-5 py-2 text-xs font-black text-zinc-950 shadow">{settings.buttonText}</span>
                  {settings.secondaryButtonText && (
                    <span className="rounded-full border border-white px-5 py-2 text-xs font-black text-white">{settings.secondaryButtonText}</span>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ EVENTS LANDING TAB ══════════════ */}
      {activeTab === "events_landing" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <form onSubmit={saveSettings} className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-base font-black text-zinc-950 font-bold">Events Landing Hero</h2>
            <CmsImageField
              label="Background image"
              value={settings.eventsHeroImageUrl}
              onChange={val => setSettings({ ...settings, eventsHeroImageUrl: val })}
              folder="events-landing"
              placeholder="https://… or /…"
              helpText="Hero background for the /events landing page."
            />
            <div>
              <FieldLabel>Eyebrow / subtitle</FieldLabel>
              <Input value={settings.eventsHeroEyebrow} onChange={e => setSettings({...settings, eventsHeroEyebrow: e.target.value})} placeholder="LIVE EXPERIENCES" />
            </div>
            <div>
              <FieldLabel>Headline line 1</FieldLabel>
              <Input value={settings.eventsHeroHeadlineLine1} onChange={e => setSettings({...settings, eventsHeroHeadlineLine1: e.target.value})} placeholder="Find Your Next Event" />
            </div>
            <div>
              <FieldLabel>Headline line 2</FieldLabel>
              <Input value={settings.eventsHeroHeadlineLine2} onChange={e => setSettings({...settings, eventsHeroHeadlineLine2: e.target.value})} placeholder="Optional subtitle line" />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <Textarea value={settings.eventsHeroDescription} onChange={e => setSettings({...settings, eventsHeroDescription: e.target.value})} placeholder="Concerts, conferences, workshops, festivals, and local experiences." />
            </div>
            <SaveBtn saving={saving} label="Save Events Landing Section" />
          </form>

          {/* Preview */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wide text-zinc-400">Live Preview</span>
            <div
              className="relative flex min-h-72 items-center overflow-hidden rounded-2xl bg-cover bg-center p-8 sm:p-10"
              style={{ backgroundImage: `url("${settings.eventsHeroImageUrl?.replaceAll('"', '') || ''}")` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/20" />
              <div className="relative space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-orange-400">{settings.eventsHeroEyebrow}</p>
                <h2 className="text-3xl font-black leading-tight text-white drop-shadow-lg sm:text-4xl">
                  {settings.eventsHeroHeadlineLine1}
                  {settings.eventsHeroHeadlineLine2 && <><br /><span className="text-orange-300">{settings.eventsHeroHeadlineLine2}</span></>}
                </h2>
                <p className="text-sm font-medium text-zinc-300 max-w-md">{settings.eventsHeroDescription}</p>
                {/* Dynamic Stats Row mock in preview */}
                <div className="pt-3 text-xs font-bold text-zinc-400 border-t border-white/10 mt-6 flex gap-3 flex-wrap">
                  <span>12,000+ Events</span>
                  <span>•</span>
                  <span>85,000+ Tickets Sold</span>
                  <span>•</span>
                  <span>1,500+ Organizations</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ FUNDRAISERS LANDING TAB ══════════════ */}
      {activeTab === "fundraisers_landing" && (
        <div className="space-y-6">
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <form onSubmit={saveSettings} className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-base font-black text-zinc-950 font-bold">Fundraisers Landing Hero</h2>
            <CmsImageField
              label="Background image"
              value={settings.fundraisersHeroImageUrl}
              onChange={val => setSettings({ ...settings, fundraisersHeroImageUrl: val })}
              folder="fundraisers-landing"
              placeholder="https://… or /…"
              helpText="Hero background for the /fundraisers landing page."
            />
            <div>
              <FieldLabel>Eyebrow / subtitle</FieldLabel>
              <Input value={settings.fundraisersHeroEyebrow} onChange={e => setSettings({...settings, fundraisersHeroEyebrow: e.target.value})} placeholder="COMMUNITY FUNDRAISING" />
            </div>
            <div>
              <FieldLabel>Headline line 1</FieldLabel>
              <Input value={settings.fundraisersHeroHeadlineLine1} onChange={e => setSettings({...settings, fundraisersHeroHeadlineLine1: e.target.value})} placeholder="Support Causes That Matter" />
            </div>
            <div>
              <FieldLabel>Headline line 2</FieldLabel>
              <Input value={settings.fundraisersHeroHeadlineLine2} onChange={e => setSettings({...settings, fundraisersHeroHeadlineLine2: e.target.value})} placeholder="Optional subtitle line" />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <Textarea value={settings.fundraisersHeroDescription} onChange={e => setSettings({...settings, fundraisersHeroDescription: e.target.value})} placeholder="Help communities, charities, and individuals reach their goals." />
            </div>
            <SaveBtn saving={saving} label="Save Fundraisers Landing Section" />
          </form>

          {/* Preview */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wide text-zinc-400">Live Preview</span>
            <div
              className="relative flex min-h-72 items-center overflow-hidden rounded-2xl bg-cover bg-center p-8 sm:p-10"
              style={{ backgroundImage: `url("${settings.fundraisersHeroImageUrl?.replaceAll('"', '') || ''}")` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/20" />
              <div className="relative space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-emerald-400">{settings.fundraisersHeroEyebrow}</p>
                <h2 className="text-3xl font-black leading-tight text-white drop-shadow-lg sm:text-4xl">
                  {settings.fundraisersHeroHeadlineLine1}
                  {settings.fundraisersHeroHeadlineLine2 && <><br /><span className="text-emerald-300">{settings.fundraisersHeroHeadlineLine2}</span></>}
                </h2>
                <p className="text-sm font-medium text-zinc-300 max-w-md">{settings.fundraisersHeroDescription}</p>
                {/* Dynamic Stats Row mock in preview */}
                <div className="pt-3 text-xs font-bold text-zinc-400 border-t border-white/10 mt-6 flex gap-3 flex-wrap">
                  <span>2,400 Campaigns</span>
                  <span>•</span>
                  <span>$2.4M Raised</span>
                  <span>•</span>
                  <span>18,000 Donors</span>
                </div>
              </div>
            </div>
          </div>
        </div>
          <HeroFanManager initialImages={initialSettings.fundraisersHeroImages} />
        </div>
      )}

      {/* ══════════════ ORGANIZERS LANDING TAB ══════════════ */}
      {activeTab === "organizers_landing" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <form onSubmit={saveSettings} className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-base font-black text-zinc-950 font-bold">Organizations Landing Hero</h2>
            <CmsImageField
              label="Background image"
              value={settings.organizersHeroImageUrl}
              onChange={val => setSettings({ ...settings, organizersHeroImageUrl: val })}
              folder="organizers-landing"
              placeholder="https://… or /…"
              helpText="Hero background for the /organizers directory landing page."
            />
            <div>
              <FieldLabel>Eyebrow / subtitle</FieldLabel>
              <Input value={settings.organizersHeroEyebrow} onChange={e => setSettings({...settings, organizersHeroEyebrow: e.target.value})} placeholder="ORGANIZER DIRECTORY" />
            </div>
            <div>
              <FieldLabel>Headline line 1</FieldLabel>
              <Input value={settings.organizersHeroHeadlineLine1} onChange={e => setSettings({...settings, organizersHeroHeadlineLine1: e.target.value})} placeholder="Meet Event Creators" />
            </div>
            <div>
              <FieldLabel>Headline line 2</FieldLabel>
              <Input value={settings.organizersHeroHeadlineLine2} onChange={e => setSettings({...settings, organizersHeroHeadlineLine2: e.target.value})} placeholder="Optional subtitle line" />
            </div>
            <div>
              <FieldLabel>Description</FieldLabel>
              <Textarea value={settings.organizersHeroDescription} onChange={e => setSettings({...settings, organizersHeroDescription: e.target.value})} placeholder="Discover trusted organizations building amazing experiences." />
            </div>
            <SaveBtn saving={saving} label="Save Organizations Landing Section" />
          </form>

          {/* Preview */}
          <div className="space-y-2">
            <span className="text-xs font-black uppercase tracking-wide text-zinc-400">Live Preview</span>
            <div
              className="relative flex min-h-72 items-center overflow-hidden rounded-2xl bg-cover bg-center p-8 sm:p-10"
              style={{ backgroundImage: `url("${settings.organizersHeroImageUrl?.replaceAll('"', '') || ''}")` }}
            >
              <div className="absolute inset-0 bg-gradient-to-r from-black/90 via-black/55 to-black/20" />
              <div className="relative space-y-3">
                <p className="text-[10px] font-black uppercase tracking-widest text-violet-400">{settings.organizersHeroEyebrow}</p>
                <h2 className="text-3xl font-black leading-tight text-white drop-shadow-lg sm:text-4xl">
                  {settings.organizersHeroHeadlineLine1}
                  {settings.organizersHeroHeadlineLine2 && <><br /><span className="text-violet-300">{settings.organizersHeroHeadlineLine2}</span></>}
                </h2>
                <p className="text-sm font-medium text-zinc-300 max-w-md">{settings.organizersHeroDescription}</p>
                {/* Dynamic Stats Row mock in preview */}
                <div className="pt-3 text-xs font-bold text-zinc-400 border-t border-white/10 mt-6 flex gap-3 flex-wrap">
                  <span>1,500 Organizations</span>
                  <span>•</span>
                  <span>12,000 Events Hosted</span>
                  <span>•</span>
                  <span>$2.4M Community Raised</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* ══════════════ FEATURED EVENTS TAB ══════════════ */}
      {activeTab === "events" && (
        <div className="grid gap-6 lg:grid-cols-2">
          {/* Featured list */}
          <div className="space-y-4 border-t border-zinc-200 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-zinc-950">Featured Events</h2>
              <span className="rounded-full bg-orange-100 px-2.5 py-1 text-xs font-black text-orange-700">{featuredEvents.length} items</span>
            </div>
            {featuredEvents.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-zinc-100 py-8 text-center text-sm text-zinc-400">
                No featured events. Search to add.
              </p>
            ) : (
              <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                {featuredEvents.map((ev, i) => (
                  <div key={ev.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveEvent(i,"up")} disabled={i===0} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => moveEvent(i,"down")} disabled={i===featuredEvents.length-1} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                    <span className="w-6 shrink-0 text-center text-xs font-black text-zinc-300">#{ev.homepage_position}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-zinc-900">{ev.title}</p>
                      <p className="text-xs text-zinc-400">{ev.event_date ? new Date(ev.event_date).toLocaleDateString() : "TBA"} · {ev.city || "Location TBA"}</p>
                    </div>
                    <button onClick={() => toggleEvent(ev, false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 transition"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Search */}
          <div className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-base font-black text-zinc-950">Search &amp; Add Events</h2>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <Input className="pl-9" placeholder="Search events…" value={eventSearch} onChange={e => setEventSearch(e.target.value)} />
            </div>
            {searchingE && <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>}
            {!searchingE && eventResults.length > 0 && (
              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {eventResults.map(item => {
                  const isFeat = featuredEvents.some(f => f.id === item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 p-3 hover:bg-zinc-50 transition">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-zinc-900">{item.title}</p>
                        <p className="text-xs text-zinc-400">{item.event_date ? new Date(item.event_date).toLocaleDateString() : "TBA"} · {item.city || "TBA"}</p>
                      </div>
                      <button
                        onClick={() => toggleEvent(item, !isFeat)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition ${isFeat ? "bg-orange-100 text-orange-700 hover:bg-orange-200" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                      >
                        {isFeat ? <><Star className="h-3.5 w-3.5 fill-orange-500 text-orange-500" />Featured</> : <><Plus className="h-3.5 w-3.5" />Add</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {!searchingE && eventSearch.trim() && eventResults.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-400">No approved events matched.</p>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ FEATURED FUNDRAISERS TAB ══════════════ */}
      {activeTab === "fundraisers" && (
        <div className="grid gap-6 lg:grid-cols-2">
          <div className="space-y-4 border-t border-zinc-200 pt-6">
            <div className="flex items-center justify-between">
              <h2 className="text-base font-black text-zinc-950">Featured Fundraisers</h2>
              <span className="rounded-full bg-emerald-100 px-2.5 py-1 text-xs font-black text-emerald-700">{featuredFundraisers.length} items</span>
            </div>
            {featuredFundraisers.length === 0 ? (
              <p className="rounded-xl border-2 border-dashed border-zinc-100 py-8 text-center text-sm text-zinc-400">No featured fundraisers. Search to add.</p>
            ) : (
              <div className="max-h-[480px] space-y-2 overflow-y-auto pr-1">
                {featuredFundraisers.map((f, i) => (
                  <div key={f.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 bg-zinc-50/50 p-3">
                    <div className="flex flex-col gap-0.5">
                      <button onClick={() => moveFundraiser(i,"up")} disabled={i===0} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 disabled:opacity-25"><ArrowUp className="h-3.5 w-3.5" /></button>
                      <button onClick={() => moveFundraiser(i,"down")} disabled={i===featuredFundraisers.length-1} className="rounded p-0.5 text-zinc-400 hover:bg-zinc-200 disabled:opacity-25"><ArrowDown className="h-3.5 w-3.5" /></button>
                    </div>
                    <span className="w-6 shrink-0 text-center text-xs font-black text-zinc-300">#{f.homepage_position}</span>
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-black text-zinc-900">{f.title}</p>
                      <p className="text-xs text-zinc-400">${Number(f.raised??0).toLocaleString()} raised of ${Number(f.goal??0).toLocaleString()}</p>
                    </div>
                    <button onClick={() => toggleFundraiser(f, false)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 transition"><Trash2 className="h-4 w-4" /></button>
                  </div>
                ))}
              </div>
            )}
          </div>
          <div className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-base font-black text-zinc-950">Search &amp; Add Fundraisers</h2>
            <div className="relative">
              <SearchIcon className="absolute left-3 top-3 h-4 w-4 text-zinc-400" />
              <Input className="pl-9" placeholder="Search campaigns…" value={frSearch} onChange={e => setFrSearch(e.target.value)} />
            </div>
            {searchingF && <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin text-zinc-400" /></div>}
            {!searchingF && frResults.length > 0 && (
              <div className="max-h-[420px] space-y-2 overflow-y-auto">
                {frResults.map(item => {
                  const isFeat = featuredFundraisers.some(f => f.id === item.id);
                  return (
                    <div key={item.id} className="flex items-center gap-3 rounded-xl border border-zinc-100 p-3 hover:bg-zinc-50 transition">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-bold text-zinc-900">{item.title}</p>
                        <p className="text-xs text-zinc-400">${Number(item.raised??0).toLocaleString()} raised</p>
                      </div>
                      <button
                        onClick={() => toggleFundraiser(item, !isFeat)}
                        className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-black transition ${isFeat ? "bg-emerald-100 text-emerald-700 hover:bg-emerald-200" : "bg-zinc-100 text-zinc-600 hover:bg-zinc-200"}`}
                      >
                        {isFeat ? <><Star className="h-3.5 w-3.5 fill-emerald-500 text-emerald-500" />Featured</> : <><Plus className="h-3.5 w-3.5" />Add</>}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
            {!searchingF && frSearch.trim() && frResults.length === 0 && (
              <p className="py-6 text-center text-sm text-zinc-400">No campaigns matched.</p>
            )}
          </div>
        </div>
      )}

      {/* ══════════════ CATEGORIES TAB ══════════════ */}
      {activeTab === "categories" && (
        <CategoriesPanel categories={categories} setCats={setCats} flash={flash} setErr={setErr} />
      )}

      {/* ══════════════ TESTIMONIALS TAB ══════════════ */}
      {activeTab === "testimonials" && (
        <TestimonialsPanel testimonials={testimonials} setTestimonials={setTestimonials} flash={flash} setErr={setErr} />
      )}

      {/* ══════════════ SPONSORS TAB ══════════════ */}
      {activeTab === "sponsors" && (
        <SponsorsPanel sponsors={sponsors} setSponsors={setSponsors} flash={flash} setErr={setErr} />
      )}

      {/* ══════════════ SEO TAB ══════════════ */}
      {activeTab === "seo" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <form onSubmit={saveSettings} className="space-y-4 border-t border-zinc-200 pt-6">
            <h2 className="text-base font-black text-zinc-950">SEO &amp; Social</h2>
            <div>
              <FieldLabel>Meta title</FieldLabel>
              <Input value={settings.seoTitle} onChange={e => setSettings({...settings, seoTitle: e.target.value})} placeholder="Aldriva — Buy Tickets…" />
              <p className="mt-1 text-xs text-zinc-400">{settings.seoTitle.length} / 60 chars</p>
            </div>
            <div>
              <FieldLabel>Meta description</FieldLabel>
              <Textarea rows={3} value={settings.seoDescription} onChange={e => setSettings({...settings, seoDescription: e.target.value})} placeholder="Discover events, buy tickets, support causes." />
              <p className="mt-1 text-xs text-zinc-400">{settings.seoDescription.length} / 160 chars</p>
            </div>
            <CmsImageField
              label="Open Graph / Twitter image"
              value={settings.seoOgImageUrl}
              onChange={val => setSettings({ ...settings, seoOgImageUrl: val })}
              folder="seo"
              placeholder="https://… or /…"
              aspectRatioHint="Recommended: 1200 × 630 px (1.91:1 aspect ratio) for social preview cards."
              aspectRatioCheck={true}
            />
            <SaveBtn saving={saving} label="Save SEO Settings" />
          </form>

          {/* Previews */}
          <div className="space-y-6">
            {/* Google snippet */}
            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wide text-zinc-400">Google Snippet Preview</span>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-1">
                <p className="text-[11px] text-zinc-400">https://Aldriva.com</p>
                <p className="text-lg font-medium text-blue-700 hover:underline cursor-pointer">{settings.seoTitle || "Your title here"}</p>
                <p className="text-sm text-zinc-600 leading-relaxed">{settings.seoDescription || "Your meta description here."}</p>
              </div>
            </div>
            {/* OG card */}
            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wide text-zinc-400">Social Share Card (OG)</span>
              <div className="overflow-hidden rounded-2xl border border-zinc-200 bg-white shadow-sm max-w-sm">
                <div
                  className="aspect-[1.91/1] w-full bg-cover bg-center bg-zinc-100"
                  style={{ backgroundImage: settings.seoOgImageUrl ? `url("${settings.seoOgImageUrl}")` : undefined }}
                >
                  {!settings.seoOgImageUrl && <div className="flex h-full items-center justify-center"><ImageIcon className="h-10 w-10 text-zinc-300" /></div>}
                </div>
                <div className="border-t border-zinc-100 bg-zinc-50 px-4 py-3">
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">Aldriva.com</p>
                  <p className="mt-0.5 truncate text-sm font-black text-zinc-800">{settings.seoTitle}</p>
                  <p className="truncate text-xs text-zinc-500">{settings.seoDescription}</p>
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ── Categories sub-panel ───────────────────────────────────────────────────

function CategoriesPanel({ categories, setCats, flash, setErr }: {
  categories: { id: string; name: string; icon: string; position: number; is_visible: boolean }[];
  setCats: React.Dispatch<React.SetStateAction<typeof categories>>;
  flash: (m: string) => void;
  setErr: (m: string) => void;
}) {
  const [saving, setSaving]   = useState(false);
  const [sheet, setSheet]     = useState<{ mode: "add" } | { mode: "edit"; id: string } | null>(null);
  const [editName, setEName]  = useState("");
  const [editIcon, setEIcon]  = useState("");
  const [editPos,  setEPos]   = useState(0);
  const [editVis,  setEVis]   = useState(true);
  const [nName, setNName]     = useState("");
  const [nIcon, setNIcon]     = useState("Mic");
  const [nPos,  setNPos]      = useState(1);
  const [nVis,  setNVis]      = useState(true);

  function openAdd() {
    setNName(""); setNIcon("Mic"); setNPos(categories.length + 2); setNVis(true);
    setSheet({ mode: "add" });
  }

  function openEdit(c: typeof categories[0]) {
    setEName(c.name); setEIcon(c.icon); setEPos(c.position); setEVis(c.is_visible);
    setSheet({ mode: "edit", id: c.id });
  }

  function closeSheet() { setSheet(null); }

  async function saveEdit(id: string) {
    const res = await fetch("/api/admin/homepage/categories", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({id, name: editName, icon: editIcon, position: editPos, is_visible: editVis}),
    });
    if (res.ok) {
      const d = await res.json();
      setCats(p => p.map(c => c.id===id ? d.category : c).sort((a,b)=>a.position-b.position));
      closeSheet(); flash(s.categoryUpdated);
    } else flash(s.errorUpdatingCategory);
  }

  async function del(id: string) {
    if (!confirm(s.confirmDeleteCategory)) return;
    const res = await fetch(`/api/admin/homepage/categories?id=${id}`, { method:"DELETE" });
    if (res.ok) { setCats(p => p.filter(c => c.id!==id)); flash(s.categoryDeleted); }
    else flash(s.errorDeletingCategory);
  }

  async function addCat(e: React.FormEvent) {
    e.preventDefault(); if (!nName.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/homepage/categories", {
      method:"POST", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({name: nName, icon: nIcon, position: nPos, is_visible: nVis}),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      setCats(p => [...p, d.category].sort((a,b)=>a.position-b.position));
      setNName(""); setNIcon("Mic"); setNPos(categories.length+2);
      closeSheet(); flash(s.categoryAdded);
    } else { const d = await res.json(); setErr(d.error || "Failed to add category."); }
  }

  const renderAddForm = () => (
    <form onSubmit={addCat} className="space-y-4">
      <div><FieldLabel>{s.fieldName}</FieldLabel><Input value={nName} onChange={e=>setNName(e.target.value)} placeholder="e.g. Music" /></div>
      <div>
        <FieldLabel>{s.fieldIconName}</FieldLabel>
        <div className="mb-2 flex items-center gap-2">
          <div className="rounded-md border border-zinc-200 p-2"><DynIcon name={nIcon} className="h-5 w-5 text-violet-600" /></div>
          <Input value={nIcon} onChange={e=>setNIcon(e.target.value)} className="flex-1" placeholder="Mic" />
        </div>
        <div className="mt-1 flex flex-wrap gap-1">
          {RECOMMENDED_ICONS.map(ico => (
            <button key={ico} type="button" onClick={() => setNIcon(ico)}
              className={`rounded border px-2 py-0.5 text-[10px] font-bold transition ${nIcon===ico ? "border-violet-500 bg-violet-600 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-violet-300"}`}>
              {ico}
            </button>
          ))}
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>{s.fieldPosition}</FieldLabel><Input type="number" value={nPos} onChange={e=>setNPos(+e.target.value)} /></div>
        <div className="flex items-end pb-2.5"><label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-zinc-700"><input type="checkbox" checked={nVis} onChange={e=>setNVis(e.target.checked)} className="h-4 w-4 rounded text-violet-600" />{s.fieldVisible}</label></div>
      </div>
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-60">
        {saving ? s.adding : s.addCategory}
      </button>
    </form>
  );

  const renderEditForm = (id: string) => (
    <div className="space-y-4">
      <div><FieldLabel>{s.fieldName}</FieldLabel><Input value={editName} onChange={e=>setEName(e.target.value)} /></div>
      <div>
        <FieldLabel>{s.fieldIconName}</FieldLabel>
        <div className="mb-2 flex items-center gap-2">
          <div className="rounded-md border border-zinc-200 p-2"><DynIcon name={editIcon} className="h-5 w-5 text-violet-600" /></div>
          <Input value={editIcon} onChange={e=>setEIcon(e.target.value)} className="flex-1" />
        </div>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>{s.fieldPosition}</FieldLabel><Input type="number" value={editPos} onChange={e=>setEPos(+e.target.value)} /></div>
        <div className="flex items-end pb-2.5"><label className="flex cursor-pointer items-center gap-2 text-sm font-bold text-zinc-700"><input type="checkbox" checked={editVis} onChange={e=>setEVis(e.target.checked)} className="h-4 w-4 rounded text-violet-600" />{s.fieldVisible}</label></div>
      </div>
      <div className="flex gap-2">
        <button type="button" onClick={() => saveEdit(id)} className="flex-1 rounded-xl bg-violet-600 py-3 text-sm font-black text-white transition hover:bg-violet-700">{s.save}</button>
        <button type="button" onClick={closeSheet} className="flex-1 rounded-xl border border-zinc-200 bg-white py-3 text-sm font-bold text-zinc-600 transition hover:bg-zinc-50">{s.cancel}</button>
      </div>
    </div>
  );

  return (
    <div className="@container">
      <div className="grid gap-6 border-t border-zinc-200 pt-6 @[900px]:grid-cols-[1.4fr_1fr] @[900px]:divide-x @[900px]:divide-zinc-200">
        {/* List */}
        <div className="space-y-4 @[900px]:pr-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-zinc-950">{s.categoriesTitle}</h2>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-black text-white transition hover:bg-violet-700 @[900px]:hidden"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />{s.addCategory}
            </button>
          </div>
          {categories.length === 0
            ? <p className="py-8 text-center text-sm text-zinc-400">{s.emptyCategories}</p>
            : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead><tr className="border-b border-zinc-100 text-[11px] font-black uppercase tracking-wider text-zinc-400">
                  <th className="py-2">Icon</th><th className="py-2">Name</th><th className="py-2">Pos</th><th className="py-2 text-center">Visible</th><th className="py-2 text-right">Actions</th>
                </tr></thead>
                <tbody className="divide-y divide-zinc-50">
                  {categories.map(cat => (
                    <tr key={cat.id} className="transition hover:bg-zinc-50/60">
                      <td className="py-2.5 pr-3"><DynIcon name={cat.icon} /></td>
                      <td className="py-2.5 pr-3 font-semibold text-zinc-800">{cat.name}</td>
                      <td className="py-2.5 pr-3 text-zinc-500">{cat.position}</td>
                      <td className="py-2.5 text-center">
                        {cat.is_visible
                          ? <span className="inline-flex rounded bg-emerald-100 p-1 text-emerald-700"><Eye className="h-3 w-3" /></span>
                          : <span className="inline-flex rounded bg-zinc-100 p-1 text-zinc-400"><EyeOff className="h-3 w-3" /></span>
                        }
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          <button onClick={() => openEdit(cat)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-violet-50 hover:text-violet-600" aria-label={`${s.editCategory}: ${cat.name}`}><Edit2 className="h-3.5 w-3.5" /></button>
                          <button onClick={() => del(cat.id)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-500" aria-label={`${s.confirmDeleteCategory} ${cat.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Add form — wide containers only */}
        <div className="hidden space-y-4 @[900px]:block">
          <h2 className="text-base font-black text-zinc-950">{s.addCategory}</h2>
          {renderAddForm()}
        </div>
      </div>

      {/* Add / edit sheet — narrow containers and all edits */}
      <Sheet open={sheet !== null} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="bottom" aria-label={sheet?.mode === "edit" ? s.editCategory : s.addCategory} className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left text-base font-black">
              {sheet?.mode === "edit" ? s.editCategory : s.addCategory}
            </SheetTitle>
          </SheetHeader>
          <div className="pt-4">
            {sheet?.mode === "edit" ? renderEditForm(sheet.id) : renderAddForm()}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Testimonials sub-panel ─────────────────────────────────────────────────

function TestimonialsPanel({ testimonials, setTestimonials, flash, setErr }: {
  testimonials: Testimonial[];
  setTestimonials: React.Dispatch<React.SetStateAction<Testimonial[]>>;
  flash: (m: string) => void;
  setErr: (m: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet]     = useState<{ mode: "add" } | { mode: "edit"; id: string } | null>(null);
  const [edit,   setEdit]     = useState<Partial<Testimonial>>({});
  const [form,   setForm]     = useState({ name:"", role:"", photo_url:"", quote:"", position:1, is_visible:true });

  function openAdd() {
    setForm({ name:"", role:"", photo_url:"", quote:"", position: testimonials.length+2, is_visible:true });
    setSheet({ mode: "add" });
  }

  function openEdit(t: Testimonial) {
    setEdit({});
    setSheet({ mode: "edit", id: t.id });
  }

  function closeSheet() { setSheet(null); setEdit({}); }

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form.name.trim() || !form.quote.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/homepage/testimonials", {
      method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      setTestimonials(p => [...p, d.testimonial].sort((a,b)=>a.position-b.position));
      setForm({ name:"", role:"", photo_url:"", quote:"", position: testimonials.length+2, is_visible:true });
      closeSheet(); flash(s.testimonialAdded);
    } else { const d=await res.json(); setErr(d.error||"Failed."); }
  }

  async function saveEdit(id: string) {
    const res = await fetch("/api/admin/homepage/testimonials", {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id, ...edit}),
    });
    if (res.ok) {
      const d = await res.json();
      setTestimonials(p => p.map(t => t.id===id ? d.testimonial : t).sort((a,b)=>a.position-b.position));
      closeSheet(); flash(s.updated);
    } else flash(s.errorUpdating);
  }

  async function del(id: string) {
    if (!confirm(s.confirmDeleteTestimonial)) return;
    const res = await fetch(`/api/admin/homepage/testimonials?id=${id}`, {method:"DELETE"});
    if (res.ok) { setTestimonials(p => p.filter(t => t.id!==id)); flash(s.deleted); }
  }

  const renderAddForm = () => (
    <form onSubmit={save} className="space-y-3">
      <div><FieldLabel>{s.fieldFullName}</FieldLabel><Input required value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Jane Smith" /></div>
      <div><FieldLabel>{s.fieldRole}</FieldLabel><Input value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} placeholder="Founder, Acme Corp." /></div>
      <div><FieldLabel>{s.fieldPhotoUrl}</FieldLabel><Input type="url" value={form.photo_url} onChange={e=>setForm(p=>({...p,photo_url:e.target.value}))} placeholder="https://…" /></div>
      <div><FieldLabel>{s.fieldQuote}</FieldLabel><Textarea required rows={4} value={form.quote} onChange={e=>setForm(p=>({...p,quote:e.target.value}))} placeholder="This platform is incredible…" /></div>
      <div className="flex items-center gap-4">
        <div className="flex-1"><FieldLabel>{s.fieldSortPosition}</FieldLabel><Input type="number" value={form.position} onChange={e=>setForm(p=>({...p,position:+e.target.value}))} /></div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-bold text-zinc-700"><input type="checkbox" checked={form.is_visible} onChange={e=>setForm(p=>({...p,is_visible:e.target.checked}))} className="h-4 w-4 rounded text-violet-600" />{s.fieldVisible}</label>
      </div>
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-60">
        {saving ? s.adding : s.addTestimonial}
      </button>
    </form>
  );

  const renderEditForm = (t: Testimonial, id: string) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>{s.fieldFullName}</FieldLabel><Input defaultValue={t.name} onChange={e=>setEdit(p=>({...p,name:e.target.value}))} /></div>
        <div><FieldLabel>{s.fieldRole}</FieldLabel><Input defaultValue={t.role} onChange={e=>setEdit(p=>({...p,role:e.target.value}))} /></div>
      </div>
      <div><FieldLabel>{s.fieldPhotoUrl}</FieldLabel><Input defaultValue={t.photo_url} onChange={e=>setEdit(p=>({...p,photo_url:e.target.value}))} /></div>
      <div><FieldLabel>{s.fieldQuote}</FieldLabel><Textarea rows={3} defaultValue={t.quote} onChange={e=>setEdit(p=>({...p,quote:e.target.value}))} /></div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-bold text-zinc-600"><input type="checkbox" defaultChecked={t.is_visible} onChange={e=>setEdit(p=>({...p,is_visible:e.target.checked}))} className="rounded text-violet-600" />{s.fieldVisible}</label>
        <div className="flex gap-2">
          <button onClick={() => saveEdit(id)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-700">{s.save}</button>
          <button onClick={closeSheet} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50">{s.cancel}</button>
        </div>
      </div>
    </div>
  );

  const editingRow = sheet?.mode === "edit" ? testimonials.find(t => t.id === sheet.id) : undefined;

  return (
    <div className="@container">
      <div className="grid gap-6 border-t border-zinc-200 pt-6 @[900px]:grid-cols-[1.4fr_1fr] @[900px]:divide-x @[900px]:divide-zinc-200">
        {/* List */}
        <div className="space-y-4 @[900px]:pr-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-zinc-950">{s.testimonialsTitle}</h2>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-black text-white transition hover:bg-violet-700 @[900px]:hidden"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />{s.addTestimonial}
            </button>
          </div>
          {testimonials.length === 0
            ? <p className="py-8 text-center text-sm text-zinc-400">{s.emptyTestimonials}</p>
            : (
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {testimonials.map(t => (
                <div key={t.id} className="rounded-xl border border-zinc-100 bg-zinc-50/30 p-4 transition hover:bg-zinc-50">
                  <div className="flex items-start gap-3">
                    {t.photo_url
                      ? <img src={t.photo_url} alt={t.name} className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-zinc-100" />
                      : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200"><UserCircle2 className="h-5 w-5 text-zinc-400" /></div>
                    }
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2">
                        <p className="text-sm font-black text-zinc-900">{t.name}</p>
                        {t.role && <span className="text-xs text-zinc-400">· {t.role}</span>}
                        <span className="ml-auto text-[10px] text-zinc-300">#{t.position}</span>
                      </div>
                      <p className="mt-1 text-xs leading-relaxed text-zinc-500 line-clamp-2">"{t.quote}"</p>
                    </div>
                    <div className="flex shrink-0 gap-1">
                      <button onClick={() => openEdit(t)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-violet-50 hover:text-violet-600" aria-label={`${s.editTestimonial}: ${t.name}`}><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => del(t.id)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-500" aria-label={`${s.confirmDeleteTestimonial} ${t.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add form — wide containers only */}
        <div className="hidden space-y-4 @[900px]:block">
          <h2 className="text-base font-black text-zinc-950">{s.addTestimonial}</h2>
          {renderAddForm()}
        </div>
      </div>

      {/* Add / edit sheet — narrow containers and all edits */}
      <Sheet open={sheet !== null} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="bottom" aria-label={sheet?.mode === "edit" ? s.editTestimonial : s.addTestimonial} className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left text-base font-black">
              {sheet?.mode === "edit" ? s.editTestimonial : s.addTestimonial}
            </SheetTitle>
          </SheetHeader>
          <div className="pt-4">
            {sheet?.mode === "edit" && editingRow ? renderEditForm(editingRow, sheet.id) : renderAddForm()}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}

// ── Sponsors sub-panel ─────────────────────────────────────────────────────

function SponsorsPanel({ sponsors, setSponsors, flash, setErr }: {
  sponsors: Sponsor[];
  setSponsors: React.Dispatch<React.SetStateAction<Sponsor[]>>;
  flash: (m: string) => void;
  setErr: (m: string) => void;
}) {
  const [saving, setSaving] = useState(false);
  const [sheet, setSheet]     = useState<{ mode: "add" } | { mode: "edit"; id: string } | null>(null);
  const [edit,   setEdit]     = useState<Partial<Sponsor>>({});
  const [form,   setForm]     = useState({ name:"", logo_url:"", website_url:"", position:1, is_visible:true });

  function openAdd() {
    setForm({ name:"", logo_url:"", website_url:"", position: sponsors.length+2, is_visible:true });
    setSheet({ mode: "add" });
  }

  function openEdit(sp: Sponsor) {
    setEdit({});
    setSheet({ mode: "edit", id: sp.id });
  }

  function closeSheet() { setSheet(null); setEdit({}); }

  async function save(e: React.FormEvent) {
    e.preventDefault(); if (!form.name.trim()) return;
    setSaving(true);
    const res = await fetch("/api/admin/homepage/sponsors", {
      method:"POST", headers:{"Content-Type":"application/json"}, body: JSON.stringify(form),
    });
    setSaving(false);
    if (res.ok) {
      const d = await res.json();
      setSponsors(p => [...p, d.sponsor].sort((a,b)=>a.position-b.position));
      setForm({ name:"", logo_url:"", website_url:"", position: sponsors.length+2, is_visible:true });
      closeSheet(); flash(s.sponsorAdded);
    } else { const d=await res.json(); setErr(d.error||"Failed."); }
  }

  async function saveEdit(id: string) {
    const res = await fetch("/api/admin/homepage/sponsors", {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id, ...edit}),
    });
    if (res.ok) {
      const d = await res.json();
      setSponsors(p => p.map(sp => sp.id===id ? d.sponsor : sp).sort((a,b)=>a.position-b.position));
      closeSheet(); flash(s.updated);
    } else flash(s.errorUpdating);
  }

  async function del(id: string) {
    if (!confirm(s.confirmDeleteSponsor)) return;
    const res = await fetch(`/api/admin/homepage/sponsors?id=${id}`, {method:"DELETE"});
    if (res.ok) { setSponsors(p => p.filter(sp => sp.id!==id)); flash(s.deleted); }
  }

  const renderLogoPreview = (url: string) => (
    url ? <div className="flex items-center justify-center rounded-md border border-dashed border-zinc-200 bg-zinc-50 py-3"><img src={url} alt="Logo preview" className="max-h-12 max-w-full object-contain" /></div> : null
  );

  const renderAddForm = () => (
    <form onSubmit={save} className="space-y-3">
      <div><FieldLabel>{s.fieldSponsorName}</FieldLabel><Input required value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Acme Corp" /></div>
      <div><FieldLabel>{s.fieldLogoUrl}</FieldLabel><Input type="url" value={form.logo_url} onChange={e=>setForm(p=>({...p,logo_url:e.target.value}))} placeholder="https://…/logo.png" /></div>
      {renderLogoPreview(form.logo_url)}
      <div><FieldLabel>{s.fieldWebsiteUrl}</FieldLabel><Input type="url" value={form.website_url} onChange={e=>setForm(p=>({...p,website_url:e.target.value}))} placeholder="https://acme.com" /></div>
      <div className="flex items-center gap-4">
        <div className="flex-1"><FieldLabel>{s.fieldSortPosition}</FieldLabel><Input type="number" value={form.position} onChange={e=>setForm(p=>({...p,position:+e.target.value}))} /></div>
        <label className="mt-4 flex cursor-pointer items-center gap-2 text-sm font-bold text-zinc-700"><input type="checkbox" checked={form.is_visible} onChange={e=>setForm(p=>({...p,is_visible:e.target.checked}))} className="h-4 w-4 rounded text-violet-600" />{s.fieldVisible}</label>
      </div>
      <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white transition hover:bg-violet-700 disabled:opacity-60">
        {saving ? s.adding : s.addSponsor}
      </button>
    </form>
  );

  const renderEditForm = (sp: Sponsor, id: string) => (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <div><FieldLabel>{s.fieldName}</FieldLabel><Input defaultValue={sp.name} onChange={e=>setEdit(p=>({...p,name:e.target.value}))} /></div>
        <div><FieldLabel>{s.fieldWebsiteUrl}</FieldLabel><Input defaultValue={sp.website_url} onChange={e=>setEdit(p=>({...p,website_url:e.target.value}))} /></div>
      </div>
      <div><FieldLabel>{s.fieldLogoUrl}</FieldLabel><Input defaultValue={sp.logo_url} onChange={e=>setEdit(p=>({...p,logo_url:e.target.value}))} /></div>
      <div className="flex items-center justify-between">
        <label className="flex items-center gap-2 text-xs font-bold text-zinc-600"><input type="checkbox" defaultChecked={sp.is_visible} onChange={e=>setEdit(p=>({...p,is_visible:e.target.checked}))} className="rounded text-violet-600" />{s.fieldVisible}</label>
        <div className="flex gap-2">
          <button onClick={() => saveEdit(id)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-700">{s.save}</button>
          <button onClick={closeSheet} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50">{s.cancel}</button>
        </div>
      </div>
    </div>
  );

  const editingRow = sheet?.mode === "edit" ? sponsors.find(sp => sp.id === sheet.id) : undefined;

  return (
    <div className="@container">
      <div className="grid gap-6 border-t border-zinc-200 pt-6 @[900px]:grid-cols-[1.4fr_1fr] @[900px]:divide-x @[900px]:divide-zinc-200">
        {/* List */}
        <div className="space-y-4 @[900px]:pr-6">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-base font-black text-zinc-950">{s.sponsorsTitle}</h2>
            <button
              type="button"
              onClick={openAdd}
              className="inline-flex items-center gap-1.5 rounded-xl bg-violet-600 px-3.5 py-2 text-xs font-black text-white transition hover:bg-violet-700 @[900px]:hidden"
            >
              <Plus className="h-3.5 w-3.5" aria-hidden="true" />{s.addSponsor}
            </button>
          </div>
          {sponsors.length === 0
            ? <p className="py-8 text-center text-sm text-zinc-400">{s.emptySponsors}</p>
            : (
            <div className="max-h-[520px] space-y-3 overflow-y-auto pr-1">
              {sponsors.map(sp => (
                <div key={sp.id} className="rounded-xl border border-zinc-100 bg-zinc-50/30 p-4 transition hover:bg-zinc-50">
                  <div className="flex items-center gap-4">
                    {sp.logo_url
                      ? <img src={sp.logo_url} alt={sp.name} className="h-10 w-24 shrink-0 rounded-lg border border-zinc-100 bg-white object-contain p-1" />
                      : <div className="flex h-10 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-zinc-300"><ImageIcon className="h-5 w-5" /></div>
                    }
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-black text-zinc-900">{sp.name}</p>
                      {sp.website_url && <a href={sp.website_url} target="_blank" rel="noopener noreferrer" className="mt-0.5 flex items-center gap-1 text-xs text-violet-600 hover:underline"><Globe className="h-3 w-3" />{sp.website_url.replace(/^https?:\/\//, "")}</a>}
                    </div>
                    <span className="text-[10px] text-zinc-300">#{sp.position}</span>
                    {sp.is_visible ? <Eye className="h-3.5 w-3.5 text-emerald-500" /> : <EyeOff className="h-3.5 w-3.5 text-zinc-300" />}
                    <div className="flex gap-1">
                      <button onClick={() => openEdit(sp)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-violet-50 hover:text-violet-600" aria-label={`${s.editSponsor}: ${sp.name}`}><Edit2 className="h-3.5 w-3.5" /></button>
                      <button onClick={() => del(sp.id)} className="rounded-lg p-1.5 text-zinc-400 transition hover:bg-red-50 hover:text-red-500" aria-label={`${s.confirmDeleteSponsor} ${sp.name}`}><Trash2 className="h-3.5 w-3.5" /></button>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Add form — wide containers only */}
        <div className="hidden space-y-4 @[900px]:block">
          <h2 className="text-base font-black text-zinc-950">{s.addSponsor}</h2>
          {renderAddForm()}
        </div>
      </div>

      {/* Add / edit sheet — narrow containers and all edits */}
      <Sheet open={sheet !== null} onOpenChange={(open) => { if (!open) closeSheet(); }}>
        <SheetContent side="bottom" aria-label={sheet?.mode === "edit" ? s.editSponsor : s.addSponsor} className="max-h-[90dvh] overflow-y-auto">
          <SheetHeader>
            <SheetTitle className="text-left text-base font-black">
              {sheet?.mode === "edit" ? s.editSponsor : s.addSponsor}
            </SheetTitle>
          </SheetHeader>
          <div className="pt-4">
            {sheet?.mode === "edit" && editingRow ? renderEditForm(editingRow, sheet.id) : renderAddForm()}
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
}
