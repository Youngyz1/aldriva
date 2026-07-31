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
  Check,
  X,
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
} from "lucide-react";
import { HomepageSettings } from "@/lib/homepage-hero";
import HeroFanManager from "./HeroFanManager";

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

function FieldLabel({ children }: { children: React.ReactNode }) {
  return (
    <label className="mb-1 block text-[11px] font-black uppercase tracking-wider text-zinc-400">
      {children}
    </label>
  );
}

function Input(props: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      {...props}
      className={`w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-200 ${props.className ?? ""}`}
    />
  );
}

function Textarea(props: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea
      {...props}
      className={`w-full rounded-xl border border-zinc-200 bg-white px-3.5 py-2.5 text-sm font-semibold text-zinc-900 outline-none transition focus:border-violet-500 focus:ring-1 focus:ring-violet-200 ${props.className ?? ""}`}
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
    res.ok ? flash("Settings saved.") : setErr((await res.json().catch(() => ({}))).error ?? "Save failed.");
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
    { id: "hero",          label: "Homepage Hero", icon: LayoutTemplate },
    { id: "events_landing", label: "Events Landing", icon: Calendar },
    { id: "fundraisers_landing", label: "Fundraisers Landing", icon: HandHeart },
    { id: "organizers_landing", label: "Organizations Landing", icon: UserCircle2 },
    { id: "events",        label: "Featured Events", icon: Calendar },
    { id: "fundraisers",   label: "Featured Fundraisers", icon: HandHeart },
    { id: "categories",    label: "Categories",    icon: Grid3x3 },
    { id: "testimonials",  label: "Testimonials",  icon: MessageSquareQuote },
    { id: "sponsors",      label: "Sponsors",      icon: Handshake },
    { id: "seo",           label: "SEO",           icon: SearchIcon },
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

      {/* Page header */}
      <header className="rounded-2xl border border-zinc-200 bg-white px-5 py-4 shadow-sm sm:px-6">
        <p className="text-xs font-black uppercase tracking-wide text-violet-600">CMS</p>
        <h1 className="mt-1 text-3xl font-black tracking-tight text-zinc-950">Homepage CMS</h1>
        <p className="mt-1 text-sm font-medium text-zinc-500">
          Hero content · Featured items · Categories · Testimonials · Sponsors · SEO
        </p>
      </header>

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

      {/* Tab bar */}
      <div className="flex flex-wrap gap-0.5 overflow-x-auto rounded-2xl border border-zinc-200 bg-white p-1.5 shadow-sm">
        {tabs.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => changeTab(tab.id)}
              className={`flex items-center gap-2 rounded-xl px-3.5 py-2 text-xs font-bold transition whitespace-nowrap ${
                active
                  ? "bg-violet-600 text-white shadow-sm"
                  : "text-zinc-500 hover:bg-zinc-50 hover:text-zinc-800"
              }`}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ══════════════ HERO TAB ══════════════ */}
      {activeTab === "hero" && (
        <div className="grid gap-6 lg:grid-cols-[1fr_1.1fr]">
          <form onSubmit={saveSettings} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
            <h2 className="text-base font-black text-zinc-950">Hero Block</h2>
            <div>
              <FieldLabel>Background Image URL</FieldLabel>
              <Input type="url" value={settings.imageUrl} onChange={e => setSettings({...settings, imageUrl: e.target.value})} placeholder="https://…" />
            </div>
            <div>
              <FieldLabel>Eyebrow / Subtitle</FieldLabel>
              <Input value={settings.subtitle} onChange={e => setSettings({...settings, subtitle: e.target.value, eyebrow: e.target.value})} placeholder="EVENTS • FUNDRAISING" />
            </div>
            <div>
              <FieldLabel>Headline Line 1 (Title)</FieldLabel>
              <Input value={settings.title} onChange={e => setSettings({...settings, title: e.target.value, headlineLine1: e.target.value})} placeholder="Sell Tickets. Raise Funds." />
            </div>
            <div>
              <FieldLabel>Headline Line 2</FieldLabel>
              <Input value={settings.headlineLine2} onChange={e => setSettings({...settings, headlineLine2: e.target.value})} placeholder="Find Sponsors." />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Primary CTA Text</FieldLabel>
                <Input value={settings.buttonText} onChange={e => setSettings({...settings, buttonText: e.target.value})} />
              </div>
              <div>
                <FieldLabel>Primary CTA Link</FieldLabel>
                <Input value={settings.buttonHref} onChange={e => setSettings({...settings, buttonHref: e.target.value})} placeholder="/events" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <FieldLabel>Secondary CTA Text</FieldLabel>
                <Input value={settings.secondaryButtonText} onChange={e => setSettings({...settings, secondaryButtonText: e.target.value})} />
              </div>
              <div>
                <FieldLabel>Secondary CTA Link</FieldLabel>
                <Input value={settings.secondaryButtonHref} onChange={e => setSettings({...settings, secondaryButtonHref: e.target.value})} placeholder="/create-event" />
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
          <form onSubmit={saveSettings} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
            <h2 className="text-base font-black text-zinc-950 font-bold">Events Landing Hero</h2>
            <div>
              <FieldLabel>Background Image URL</FieldLabel>
              <Input type="url" value={settings.eventsHeroImageUrl} onChange={e => setSettings({...settings, eventsHeroImageUrl: e.target.value})} placeholder="https://…" />
            </div>
            <div>
              <FieldLabel>Eyebrow / Subtitle</FieldLabel>
              <Input value={settings.eventsHeroEyebrow} onChange={e => setSettings({...settings, eventsHeroEyebrow: e.target.value})} placeholder="LIVE EXPERIENCES" />
            </div>
            <div>
              <FieldLabel>Headline Line 1</FieldLabel>
              <Input value={settings.eventsHeroHeadlineLine1} onChange={e => setSettings({...settings, eventsHeroHeadlineLine1: e.target.value})} placeholder="Find Your Next Event" />
            </div>
            <div>
              <FieldLabel>Headline Line 2</FieldLabel>
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
          <form onSubmit={saveSettings} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
            <h2 className="text-base font-black text-zinc-950 font-bold">Fundraisers Landing Hero</h2>
            <div>
              <FieldLabel>Background Image URL</FieldLabel>
              <Input type="url" value={settings.fundraisersHeroImageUrl} onChange={e => setSettings({...settings, fundraisersHeroImageUrl: e.target.value})} placeholder="https://…" />
            </div>
            <div>
              <FieldLabel>Eyebrow / Subtitle</FieldLabel>
              <Input value={settings.fundraisersHeroEyebrow} onChange={e => setSettings({...settings, fundraisersHeroEyebrow: e.target.value})} placeholder="COMMUNITY FUNDRAISING" />
            </div>
            <div>
              <FieldLabel>Headline Line 1</FieldLabel>
              <Input value={settings.fundraisersHeroHeadlineLine1} onChange={e => setSettings({...settings, fundraisersHeroHeadlineLine1: e.target.value})} placeholder="Support Causes That Matter" />
            </div>
            <div>
              <FieldLabel>Headline Line 2</FieldLabel>
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
          <form onSubmit={saveSettings} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
            <h2 className="text-base font-black text-zinc-950 font-bold">Organizations Landing Hero</h2>
            <div>
              <FieldLabel>Background Image URL</FieldLabel>
              <Input type="url" value={settings.organizersHeroImageUrl} onChange={e => setSettings({...settings, organizersHeroImageUrl: e.target.value})} placeholder="https://…" />
            </div>
            <div>
              <FieldLabel>Eyebrow / Subtitle</FieldLabel>
              <Input value={settings.organizersHeroEyebrow} onChange={e => setSettings({...settings, organizersHeroEyebrow: e.target.value})} placeholder="ORGANIZER DIRECTORY" />
            </div>
            <div>
              <FieldLabel>Headline Line 1</FieldLabel>
              <Input value={settings.organizersHeroHeadlineLine1} onChange={e => setSettings({...settings, organizersHeroHeadlineLine1: e.target.value})} placeholder="Meet Event Creators" />
            </div>
            <div>
              <FieldLabel>Headline Line 2</FieldLabel>
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
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
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
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
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
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
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
          <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
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
          <form onSubmit={saveSettings} className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
            <h2 className="text-base font-black text-zinc-950">SEO &amp; Social</h2>
            <div>
              <FieldLabel>Meta Title</FieldLabel>
              <Input value={settings.seoTitle} onChange={e => setSettings({...settings, seoTitle: e.target.value})} placeholder="Aldriva — Buy Tickets…" />
              <p className="mt-1 text-xs text-zinc-400">{settings.seoTitle.length} / 60 chars</p>
            </div>
            <div>
              <FieldLabel>Meta Description</FieldLabel>
              <Textarea rows={3} value={settings.seoDescription} onChange={e => setSettings({...settings, seoDescription: e.target.value})} placeholder="Discover events, buy tickets, support causes." />
              <p className="mt-1 text-xs text-zinc-400">{settings.seoDescription.length} / 160 chars</p>
            </div>
            <div>
              <FieldLabel>Open Graph / Twitter Image URL</FieldLabel>
              <Input type="url" value={settings.seoOgImageUrl} onChange={e => setSettings({...settings, seoOgImageUrl: e.target.value})} placeholder="https://…" />
            </div>
            <SaveBtn saving={saving} label="Save SEO Settings" />
          </form>

          {/* Previews */}
          <div className="space-y-6">
            {/* Google snippet */}
            <div className="space-y-2">
              <span className="text-xs font-black uppercase tracking-wide text-zinc-400">Google Snippet Preview</span>
              <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm space-y-1">
                <p className="text-[11px] text-zinc-400">https://fund4good.com</p>
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
                  <p className="text-[10px] font-black uppercase tracking-wider text-zinc-400">fund4good.com</p>
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
  const [editId, setEditId]   = useState<string|null>(null);
  const [editName, setEName]  = useState("");
  const [editIcon, setEIcon]  = useState("");
  const [editPos,  setEPos]   = useState(0);
  const [editVis,  setEVis]   = useState(true);
  const [nName, setNName]     = useState("");
  const [nIcon, setNIcon]     = useState("Mic");
  const [nPos,  setNPos]      = useState(1);
  const [nVis,  setNVis]      = useState(true);

  function startEdit(c: typeof categories[0]) {
    setEditId(c.id); setEName(c.name); setEIcon(c.icon); setEPos(c.position); setEVis(c.is_visible);
  }

  async function saveEdit(id: string) {
    const res = await fetch("/api/admin/homepage/categories", {
      method:"PATCH", headers:{"Content-Type":"application/json"},
      body: JSON.stringify({id, name: editName, icon: editIcon, position: editPos, is_visible: editVis}),
    });
    if (res.ok) {
      const d = await res.json();
      setCats(p => p.map(c => c.id===id ? d.category : c).sort((a,b)=>a.position-b.position));
      setEditId(null); flash("Category updated.");
    } else flash("Error updating category.");
  }

  async function del(id: string) {
    if (!confirm("Delete this category?")) return;
    const res = await fetch(`/api/admin/homepage/categories?id=${id}`, { method:"DELETE" });
    if (res.ok) { setCats(p => p.filter(c => c.id!==id)); flash("Category deleted."); }
    else flash("Error deleting category.");
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
      flash("Category added.");
    } else { const d = await res.json(); setErr(d.error || "Failed to add category."); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* Table */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
        <h2 className="text-base font-black text-zinc-950">Homepage Categories</h2>
        {categories.length === 0
          ? <p className="py-8 text-center text-sm text-zinc-400">No categories. Run migration and add some.</p>
          : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-sm">
              <thead><tr className="border-b border-zinc-100 text-[11px] font-black uppercase tracking-wider text-zinc-400">
                <th className="py-2">Icon</th><th className="py-2">Name</th><th className="py-2">Pos</th><th className="py-2 text-center">Visible</th><th className="py-2 text-right">Actions</th>
              </tr></thead>
              <tbody className="divide-y divide-zinc-50">
                {categories.map(cat => {
                  const editing = editId === cat.id;
                  return (
                    <tr key={cat.id} className="hover:bg-zinc-50/60 transition">
                      <td className="py-2.5 pr-3">
                        {editing
                          ? <div className="flex items-center gap-1"><DynIcon name={editIcon} className="h-4 w-4 text-violet-600" /><input value={editIcon} onChange={e=>setEIcon(e.target.value)} className="w-20 rounded border border-zinc-200 px-2 py-1 text-xs" /></div>
                          : <DynIcon name={cat.icon} />
                        }
                      </td>
                      <td className="py-2.5 pr-3 font-semibold text-zinc-800">
                        {editing ? <input value={editName} onChange={e=>setEName(e.target.value)} className="w-28 rounded border border-zinc-200 px-2 py-1 text-xs" /> : cat.name}
                      </td>
                      <td className="py-2.5 pr-3 text-zinc-500">
                        {editing ? <input type="number" value={editPos} onChange={e=>setEPos(+e.target.value)} className="w-14 rounded border border-zinc-200 px-2 py-1 text-xs" /> : cat.position}
                      </td>
                      <td className="py-2.5 text-center">
                        {editing
                          ? <input type="checkbox" checked={editVis} onChange={e=>setEVis(e.target.checked)} className="rounded text-violet-600" />
                          : cat.is_visible
                            ? <span className="inline-flex rounded bg-emerald-100 p-1 text-emerald-700"><Eye className="h-3 w-3" /></span>
                            : <span className="inline-flex rounded bg-zinc-100 p-1 text-zinc-400"><EyeOff className="h-3 w-3" /></span>
                        }
                      </td>
                      <td className="py-2.5 text-right">
                        <div className="flex justify-end gap-1">
                          {editing
                            ? <><button onClick={() => saveEdit(cat.id)} className="rounded-lg bg-violet-100 p-1.5 text-violet-700 hover:bg-violet-200"><Check className="h-3.5 w-3.5" /></button>
                                <button onClick={() => setEditId(null)} className="rounded-lg bg-zinc-100 p-1.5 text-zinc-600 hover:bg-zinc-200"><X className="h-3.5 w-3.5" /></button></>
                            : <><button onClick={() => startEdit(cat)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-violet-50 hover:text-violet-600 transition"><Edit2 className="h-3.5 w-3.5" /></button>
                                <button onClick={() => del(cat.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 transition"><Trash2 className="h-3.5 w-3.5" /></button></>
                          }
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
        <h2 className="text-base font-black text-zinc-950">Add Category</h2>
        <form onSubmit={addCat} className="space-y-4">
          <div><FieldLabel>Name</FieldLabel><input value={nName} onChange={e=>setNName(e.target.value)} placeholder="e.g. Music" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
          <div>
            <FieldLabel>Lucide Icon Name</FieldLabel>
            <div className="flex items-center gap-2 mb-2">
              <div className="rounded-xl border border-zinc-200 p-2"><DynIcon name={nIcon} className="h-5 w-5 text-violet-600" /></div>
              <input value={nIcon} onChange={e=>setNIcon(e.target.value)} className="flex-1 rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" placeholder="Mic" />
            </div>
            <div className="flex flex-wrap gap-1 mt-1">
              {RECOMMENDED_ICONS.map(ico => (
                <button key={ico} type="button" onClick={() => setNIcon(ico)}
                  className={`rounded border px-2 py-0.5 text-[10px] font-bold transition ${nIcon===ico ? "border-violet-500 bg-violet-600 text-white" : "border-zinc-200 bg-zinc-50 text-zinc-600 hover:border-violet-300"}`}>
                  {ico}
                </button>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <div><FieldLabel>Position</FieldLabel><input type="number" value={nPos} onChange={e=>setNPos(+e.target.value)} className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
            <div className="flex items-end pb-2.5"><label className="flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer"><input type="checkbox" checked={nVis} onChange={e=>setNVis(e.target.checked)} className="rounded text-violet-600 h-4 w-4" />Visible</label></div>
          </div>
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-60 transition">
            {saving ? "Adding…" : "Add Category"}
          </button>
        </form>
      </div>
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
  const [editId, setEditId] = useState<string|null>(null);
  const [edit,   setEdit]   = useState<Partial<Testimonial>>({});
  const [form,   setForm]   = useState({ name:"", role:"", photo_url:"", quote:"", position:1, is_visible:true });

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
      flash("Testimonial added.");
    } else { const d=await res.json(); setErr(d.error||"Failed."); }
  }

  async function saveEdit(id: string) {
    const res = await fetch("/api/admin/homepage/testimonials", {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id, ...edit}),
    });
    if (res.ok) {
      const d = await res.json();
      setTestimonials(p => p.map(t => t.id===id ? d.testimonial : t).sort((a,b)=>a.position-b.position));
      setEditId(null); flash("Updated.");
    } else flash("Error updating.");
  }

  async function del(id: string) {
    if (!confirm("Delete testimonial?")) return;
    const res = await fetch(`/api/admin/homepage/testimonials?id=${id}`, {method:"DELETE"});
    if (res.ok) { setTestimonials(p => p.filter(t => t.id!==id)); flash("Deleted."); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* Table */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
        <h2 className="text-base font-black text-zinc-950">Testimonials</h2>
        {testimonials.length === 0
          ? <p className="py-8 text-center text-sm text-zinc-400">No testimonials yet. Add some using the form.</p>
          : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {testimonials.map(t => {
              const editing = editId === t.id;
              return (
                <div key={t.id} className={`rounded-xl border p-4 transition ${editing ? "border-violet-200 bg-violet-50/30" : "border-zinc-100 bg-zinc-50/30 hover:bg-zinc-50"}`}>
                  {editing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><FieldLabel>Name</FieldLabel><input defaultValue={t.name} onChange={e=>setEdit(p=>({...p,name:e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-500" /></div>
                        <div><FieldLabel>Role</FieldLabel><input defaultValue={t.role} onChange={e=>setEdit(p=>({...p,role:e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-500" /></div>
                      </div>
                      <div><FieldLabel>Photo URL</FieldLabel><input defaultValue={t.photo_url} onChange={e=>setEdit(p=>({...p,photo_url:e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-500" /></div>
                      <div><FieldLabel>Quote</FieldLabel><textarea rows={3} defaultValue={t.quote} onChange={e=>setEdit(p=>({...p,quote:e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-500" /></div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-bold text-zinc-600"><input type="checkbox" defaultChecked={t.is_visible} onChange={e=>setEdit(p=>({...p,is_visible:e.target.checked}))} className="rounded text-violet-600" />Visible</label>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(t.id)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-700">Save</button>
                          <button onClick={() => {setEditId(null);setEdit({});}} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50">Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-start gap-3">
                      {t.photo_url
                        ? <img src={t.photo_url} alt={t.name} className="h-10 w-10 shrink-0 rounded-full object-cover ring-2 ring-zinc-100" />
                        : <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-zinc-200"><UserCircle2 className="h-5 w-5 text-zinc-400" /></div>
                      }
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2">
                          <p className="text-sm font-black text-zinc-900">{t.name}</p>
                          {t.role && <span className="text-xs text-zinc-400">· {t.role}</span>}
                          <span className="ml-auto text-[10px] text-zinc-300">#{t.position}</span>
                        </div>
                        <p className="mt-1 text-xs text-zinc-500 leading-relaxed line-clamp-2">"{t.quote}"</p>
                      </div>
                      <div className="flex gap-1 shrink-0">
                        <button onClick={() => {setEditId(t.id);setEdit({});}} className="rounded-lg p-1.5 text-zinc-400 hover:bg-violet-50 hover:text-violet-600 transition"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => del(t.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
        <h2 className="text-base font-black text-zinc-950">Add Testimonial</h2>
        <form onSubmit={save} className="space-y-3">
          <div><FieldLabel>Full Name *</FieldLabel><input required value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Jane Smith" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
          <div><FieldLabel>Role / Title</FieldLabel><input value={form.role} onChange={e=>setForm(p=>({...p,role:e.target.value}))} placeholder="Founder, Acme Corp." className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
          <div><FieldLabel>Photo URL</FieldLabel><input type="url" value={form.photo_url} onChange={e=>setForm(p=>({...p,photo_url:e.target.value}))} placeholder="https://…" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
          <div><FieldLabel>Quote *</FieldLabel><textarea required rows={4} value={form.quote} onChange={e=>setForm(p=>({...p,quote:e.target.value}))} placeholder="This platform is incredible…" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
          <div className="flex items-center gap-4">
            <div className="flex-1"><FieldLabel>Sort Position</FieldLabel><input type="number" value={form.position} onChange={e=>setForm(p=>({...p,position:+e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
            <label className="mt-4 flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer"><input type="checkbox" checked={form.is_visible} onChange={e=>setForm(p=>({...p,is_visible:e.target.checked}))} className="rounded text-violet-600 h-4 w-4" />Visible</label>
          </div>
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-60 transition">
            {saving ? "Adding…" : "Add Testimonial"}
          </button>
        </form>
      </div>
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
  const [editId, setEditId] = useState<string|null>(null);
  const [edit,   setEdit]   = useState<Partial<Sponsor>>({});
  const [form,   setForm]   = useState({ name:"", logo_url:"", website_url:"", position:1, is_visible:true });

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
      flash("Sponsor added.");
    } else { const d=await res.json(); setErr(d.error||"Failed."); }
  }

  async function saveEdit(id: string) {
    const res = await fetch("/api/admin/homepage/sponsors", {
      method:"PATCH", headers:{"Content-Type":"application/json"}, body: JSON.stringify({id, ...edit}),
    });
    if (res.ok) {
      const d = await res.json();
      setSponsors(p => p.map(s => s.id===id ? d.sponsor : s).sort((a,b)=>a.position-b.position));
      setEditId(null); flash("Updated.");
    } else flash("Error updating.");
  }

  async function del(id: string) {
    if (!confirm("Delete sponsor?")) return;
    const res = await fetch(`/api/admin/homepage/sponsors?id=${id}`, {method:"DELETE"});
    if (res.ok) { setSponsors(p => p.filter(s => s.id!==id)); flash("Deleted."); }
  }

  return (
    <div className="grid gap-6 lg:grid-cols-[1.4fr_1fr]">
      {/* Table */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
        <h2 className="text-base font-black text-zinc-950">Sponsors</h2>
        {sponsors.length === 0
          ? <p className="py-8 text-center text-sm text-zinc-400">No sponsors yet.</p>
          : (
          <div className="space-y-3 max-h-[520px] overflow-y-auto pr-1">
            {sponsors.map(s => {
              const editing = editId === s.id;
              return (
                <div key={s.id} className={`rounded-xl border p-4 transition ${editing ? "border-violet-200 bg-violet-50/30" : "border-zinc-100 bg-zinc-50/30 hover:bg-zinc-50"}`}>
                  {editing ? (
                    <div className="space-y-3">
                      <div className="grid grid-cols-2 gap-3">
                        <div><FieldLabel>Name</FieldLabel><input defaultValue={s.name} onChange={e=>setEdit(p=>({...p,name:e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-500" /></div>
                        <div><FieldLabel>Website URL</FieldLabel><input defaultValue={s.website_url} onChange={e=>setEdit(p=>({...p,website_url:e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-500" /></div>
                      </div>
                      <div><FieldLabel>Logo URL</FieldLabel><input defaultValue={s.logo_url} onChange={e=>setEdit(p=>({...p,logo_url:e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3 py-2 text-sm font-semibold outline-none focus:border-violet-500" /></div>
                      <div className="flex items-center justify-between">
                        <label className="flex items-center gap-2 text-xs font-bold text-zinc-600"><input type="checkbox" defaultChecked={s.is_visible} onChange={e=>setEdit(p=>({...p,is_visible:e.target.checked}))} className="rounded text-violet-600" />Visible</label>
                        <div className="flex gap-2">
                          <button onClick={() => saveEdit(s.id)} className="rounded-lg bg-violet-600 px-3 py-1.5 text-xs font-black text-white hover:bg-violet-700">Save</button>
                          <button onClick={() => {setEditId(null);setEdit({});}} className="rounded-lg border border-zinc-200 px-3 py-1.5 text-xs font-bold text-zinc-600 hover:bg-zinc-50">Cancel</button>
                        </div>
                      </div>
                    </div>
                  ) : (
                    <div className="flex items-center gap-4">
                      {s.logo_url
                        ? <img src={s.logo_url} alt={s.name} className="h-10 w-24 shrink-0 rounded-lg object-contain border border-zinc-100 bg-white p-1" />
                        : <div className="flex h-10 w-24 shrink-0 items-center justify-center rounded-lg border border-dashed border-zinc-200 bg-zinc-50 text-zinc-300"><ImageIcon className="h-5 w-5" /></div>
                      }
                      <div className="flex-1 min-w-0">
                        <p className="text-sm font-black text-zinc-900">{s.name}</p>
                        {s.website_url && <a href={s.website_url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-1 text-xs text-violet-600 hover:underline mt-0.5"><Globe className="h-3 w-3" />{s.website_url.replace(/^https?:\/\//, "")}</a>}
                      </div>
                      <span className="text-[10px] text-zinc-300">#{s.position}</span>
                      {s.is_visible ? <Eye className="h-3.5 w-3.5 text-emerald-500" /> : <EyeOff className="h-3.5 w-3.5 text-zinc-300" />}
                      <div className="flex gap-1">
                        <button onClick={() => {setEditId(s.id);setEdit({});}} className="rounded-lg p-1.5 text-zinc-400 hover:bg-violet-50 hover:text-violet-600 transition"><Edit2 className="h-3.5 w-3.5" /></button>
                        <button onClick={() => del(s.id)} className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-500 transition"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Add form */}
      <div className="rounded-2xl border border-zinc-200 bg-white p-5 shadow-sm sm:p-6 space-y-4">
        <h2 className="text-base font-black text-zinc-950">Add Sponsor</h2>
        <form onSubmit={save} className="space-y-3">
          <div><FieldLabel>Sponsor Name *</FieldLabel><input required value={form.name} onChange={e=>setForm(p=>({...p,name:e.target.value}))} placeholder="Acme Corp" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
          <div><FieldLabel>Logo URL</FieldLabel><input type="url" value={form.logo_url} onChange={e=>setForm(p=>({...p,logo_url:e.target.value}))} placeholder="https://…/logo.png" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
          {form.logo_url && <div className="flex items-center justify-center rounded-xl border border-dashed border-zinc-200 bg-zinc-50 py-3"><img src={form.logo_url} alt="Logo preview" className="max-h-12 max-w-full object-contain" /></div>}
          <div><FieldLabel>Website URL</FieldLabel><input type="url" value={form.website_url} onChange={e=>setForm(p=>({...p,website_url:e.target.value}))} placeholder="https://acme.com" className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
          <div className="flex items-center gap-4">
            <div className="flex-1"><FieldLabel>Sort Position</FieldLabel><input type="number" value={form.position} onChange={e=>setForm(p=>({...p,position:+e.target.value}))} className="w-full rounded-xl border border-zinc-200 px-3.5 py-2.5 text-sm font-semibold outline-none focus:border-violet-500" /></div>
            <label className="mt-4 flex items-center gap-2 text-sm font-bold text-zinc-700 cursor-pointer"><input type="checkbox" checked={form.is_visible} onChange={e=>setForm(p=>({...p,is_visible:e.target.checked}))} className="rounded text-violet-600 h-4 w-4" />Visible</label>
          </div>
          <button type="submit" disabled={saving} className="w-full rounded-xl bg-violet-600 py-3 text-sm font-black text-white hover:bg-violet-700 disabled:opacity-60 transition">
            {saving ? "Adding…" : "Add Sponsor"}
          </button>
        </form>
      </div>
    </div>
  );
}
