"use client";

import Image from "next/image";
import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";
import {
  createPromotion,
  deletePromotion,
  duplicatePromotion,
  pausePromotion,
  resumePromotion,
  updatePromotion,
} from "@/lib/actions/promotions";
import { formatMoney } from "@/lib/money";
import { getMenuPromotionDisplayStatus, resolveBasePrice, type MenuPromotionDisplayStatus } from "@/lib/menu-promotions";

type PromotionTarget = { id?: string; item_id: string | null; section_id: string | null };
type PromotionRecord = {
  id: string;
  organizer_id: string;
  name: string;
  headline: string | null;
  description: string | null;
  image_url: string | null;
  offer_type: "percent_off" | "special_price" | "free_delivery";
  percent_off: number | null;
  special_price: number | null;
  apply_to_variants: boolean;
  code: string | null;
  min_order_amount: number | null;
  status: "draft" | "active" | "paused";
  starts_at: string | null;
  ends_at: string | null;
  priority: number;
  layout: "banner" | "dish_card" | "announcement_bar";
  cta_label: string | null;
  destination_type: "item" | "section" | "menu" | "external" | "none";
  destination_item_id: string | null;
  destination_section_id: string | null;
  destination_url: string | null;
  created_at: string;
  updated_at: string;
  targets: PromotionTarget[];
};
type MenuSection = { id: string; name: string; is_active: boolean };
type MenuItem = {
  id: string;
  section_id: string;
  name: string;
  price: number;
  promo_price: number | null;
  is_active: boolean;
  is_sold_out: boolean;
  option_groups?: Array<{ kind?: string }>;
};
type FormState = Omit<PromotionRecord, "id" | "organizer_id" | "created_at" | "updated_at" | "targets"> & { targets: PromotionTarget[] };

const STATUS_ORDER: MenuPromotionDisplayStatus[] = ["draft", "scheduled", "active", "expired", "paused"];
const STATUS_STYLE: Record<MenuPromotionDisplayStatus, string> = {
  draft: "bg-zinc-100 text-zinc-700",
  scheduled: "bg-blue-50 text-blue-700",
  active: "bg-emerald-50 text-emerald-700",
  expired: "bg-amber-50 text-amber-800",
  paused: "bg-zinc-200 text-zinc-700",
};

function emptyForm(): FormState {
  return {
    name: "", headline: "", description: "", image_url: "", offer_type: "percent_off",
    percent_off: 20, special_price: null, apply_to_variants: false, code: "", min_order_amount: null,
    status: "draft", starts_at: null, ends_at: null, priority: 0, layout: "banner", cta_label: "Shop now",
    destination_type: "none", destination_item_id: null, destination_section_id: null, destination_url: "", targets: [],
  };
}

function toLocalInput(value: string | null) {
  if (!value) return "";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function targetKey(target: PromotionTarget) {
  return target.item_id ? `item:${target.item_id}` : `section:${target.section_id}`;
}

function hasVariant(item: MenuItem, variantIds: readonly string[]) {
  return variantIds.includes(item.id) || item.option_groups?.some((group) => group.kind === "variant") === true;
}

function windowsOverlap(aStart: string, aEnd: string, bStart: string | null, bEnd: string | null) {
  const aMin = aStart ? Date.parse(aStart) : Number.NEGATIVE_INFINITY;
  const aMax = aEnd ? Date.parse(aEnd) : Number.POSITIVE_INFINITY;
  const bMin = bStart ? Date.parse(bStart) : Number.NEGATIVE_INFINITY;
  const bMax = bEnd ? Date.parse(bEnd) : Number.POSITIVE_INFINITY;
  return aMin <= bMax && bMin <= aMax;
}

function Field({ label, id, children, help }: { label: string; id: string; children: React.ReactNode; help?: string }) {
  return <div className="space-y-1.5"><label htmlFor={id} className="block text-sm font-medium text-zinc-800">{label}</label>{children}{help && <p className="text-xs text-zinc-500">{help}</p>}</div>;
}

const inputClass = "min-h-11 w-full rounded-lg border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-xs outline-none focus-visible:ring-2 focus-visible:ring-orange-500";
const buttonClass = "inline-flex min-h-11 items-center justify-center rounded-lg border px-3 py-2 text-sm font-semibold transition hover:bg-zinc-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:cursor-not-allowed disabled:opacity-50";

export function PromotionsManager({
  organizerId, tenantId, role, promotions, sections, items, variantItemIds, currency, menuPagePublished, loadError,
}: {
  organizerId: string;
  tenantId: string;
  role: string;
  promotions: PromotionRecord[];
  sections: MenuSection[];
  items: MenuItem[];
  variantItemIds: string[];
  currency: string;
  menuPagePublished: boolean;
  loadError: string | null;
}) {
  const router = useRouter();
  const canEdit = ["owner", "admin", "manager", "editor"].includes(role);
  const canDelete = ["owner", "admin", "manager"].includes(role);
  const [editing, setEditing] = useState<PromotionRecord | null | "new">(null);
  const [form, setForm] = useState<FormState>(emptyForm());
  const [formError, setFormError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [pendingId, setPendingId] = useState<string | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState("all");
  const [targetSearch, setTargetSearch] = useState("");
  const [copiedCode, setCopiedCode] = useState(false);
  const [showMobilePreview, setShowMobilePreview] = useState(false);
  const now = useMemo(() => new Date(), []);

  const counts = useMemo(() => {
    const result: Record<MenuPromotionDisplayStatus, number> = { draft: 0, scheduled: 0, active: 0, expired: 0, paused: 0 };
    for (const promotion of promotions) result[getMenuPromotionDisplayStatus(promotion, now)] += 1;
    return result;
  }, [promotions, now]);

  const filtered = useMemo(() => promotions.filter((promotion) => {
    const status = getMenuPromotionDisplayStatus(promotion, now);
    return (statusFilter === "all" || status === statusFilter) &&
      `${promotion.name} ${promotion.headline || ""} ${promotion.code || ""}`.toLocaleLowerCase().includes(query.trim().toLocaleLowerCase());
  }).sort((a, b) => b.priority - a.priority || a.name.localeCompare(b.name)), [promotions, query, statusFilter, now]);

  const targetRows = useMemo(() => {
    const term = targetSearch.trim().toLocaleLowerCase();
    const matchingSections = sections.filter((section) => !term || section.name.toLocaleLowerCase().includes(term));
    const matchingItems = items.filter((item) => !term || item.name.toLocaleLowerCase().includes(term) || sections.find((section) => section.id === item.section_id)?.name.toLocaleLowerCase().includes(term));
    return { matchingSections, matchingItems };
  }, [items, sections, targetSearch]);

  const affectedItems = useMemo(() => {
    const itemIds = new Set(form.targets.flatMap((target) => target.item_id ? [target.item_id] : []));
    const sectionIds = new Set(form.targets.flatMap((target) => target.section_id ? [target.section_id] : []));
    return items.filter((item) => itemIds.has(item.id) || sectionIds.has(item.section_id));
  }, [form.targets, items]);

  const previewPromotion = {
    ...form,
    id: editing && editing !== "new" ? editing.id : "promotion-preview",
    organizer_id: organizerId,
    status: "active" as const,
    starts_at: null,
    ends_at: null,
    min_order_amount: null,
    created_at: editing && editing !== "new" ? editing.updated_at : now.toISOString(),
    targets: form.targets,
  };
  const previewPrice = affectedItems[0]
    ? resolveBasePrice({
        ...affectedItems[0],
        organizer_id: organizerId,
        option_groups: affectedItems[0].option_groups || [],
      }, [
        ...promotions.filter((promotion) => !editing || editing === "new" || promotion.id !== editing.id),
        previewPromotion as any,
      ], { organizerId, now, currency, subtotal: 1_000, code: form.code || null })
    : { basePrice: 100, originalPrice: 100 };
  const displayPrice = previewPrice.basePrice;
  const originalPreviewPrice = previewPrice.originalPrice;

  function set<K extends keyof FormState>(key: K, value: FormState[K]) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  function openCreate() {
    setEditing("new"); setForm(emptyForm()); setFormError(null); setTargetSearch(""); setCopiedCode(false);
  }

  function openEdit(promotion: PromotionRecord) {
    setEditing(promotion);
    setForm({
      name: promotion.name, headline: promotion.headline || "", description: promotion.description || "",
      image_url: promotion.image_url || "", offer_type: promotion.offer_type, percent_off: promotion.percent_off,
      special_price: promotion.special_price, apply_to_variants: promotion.apply_to_variants,
      code: promotion.code || "", min_order_amount: promotion.min_order_amount, status: promotion.status,
      starts_at: promotion.starts_at, ends_at: promotion.ends_at, priority: promotion.priority, layout: promotion.layout,
      cta_label: promotion.cta_label || "", destination_type: promotion.destination_type,
      destination_item_id: promotion.destination_item_id, destination_section_id: promotion.destination_section_id,
      destination_url: promotion.destination_url || "", targets: promotion.targets || [],
    });
    setFormError(null); setTargetSearch(""); setCopiedCode(false);
  }

  function toggleTarget(target: PromotionTarget) {
    const key = targetKey(target);
    if (form.targets.some((entry) => targetKey(entry) === key)) {
      set("targets", form.targets.filter((entry) => targetKey(entry) !== key));
      return;
    }
    if (form.targets.length >= 50) {
      setFormError("A promotion can target up to 50 items or sections.");
      return;
    }
    set("targets", [...form.targets, target]);
  }

  function generateCode() {
    const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
    const bytes = new Uint8Array(8);
    if (typeof window !== "undefined" && window.crypto?.getRandomValues) window.crypto.getRandomValues(bytes);
    else for (let index = 0; index < bytes.length; index++) bytes[index] = Math.floor(Math.random() * 256);
    set("code", `SAVE${Array.from(bytes, (byte) => alphabet[byte % alphabet.length]).join("")}`);
    setCopiedCode(false);
  }

  async function copyCode() {
    if (!form.code || !navigator.clipboard) return;
    await navigator.clipboard.writeText(form.code);
    setCopiedCode(true);
  }

  async function savePromotion(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault(); setPending(true); setFormError(null);
    const targetDestination = form.destination_type === "item" ? form.destination_item_id
      : form.destination_type === "section" ? form.destination_section_id : null;
    if (form.targets.length < 1) { setFormError("Select at least one target item or section."); setPending(false); return; }
    if (form.destination_type === "item" && !targetDestination) { setFormError("Choose an item destination."); setPending(false); return; }
    if (form.destination_type === "section" && !targetDestination) { setFormError("Choose a section destination."); setPending(false); return; }
    if (form.destination_type === "external" && (!form.destination_url || !/^https:\/\//i.test(form.destination_url))) { setFormError("External destinations must use HTTPS."); setPending(false); return; }
    const payload = {
      ...form,
      code: form.code?.trim() ? form.code.trim().toUpperCase() : null,
      headline: form.headline || null,
      description: form.description || null,
      image_url: form.image_url || null,
      percent_off: form.offer_type === "percent_off" ? Number(form.percent_off) : null,
      special_price: form.offer_type === "special_price" ? Number(form.special_price) : null,
      min_order_amount: form.min_order_amount === null || form.min_order_amount === ("" as any) ? null : Number(form.min_order_amount),
      starts_at: form.starts_at ? new Date(form.starts_at).toISOString() : null,
      ends_at: form.ends_at ? new Date(form.ends_at).toISOString() : null,
      cta_label: form.cta_label || null,
      destination_url: form.destination_type === "external" ? form.destination_url : null,
      destination_item_id: form.destination_type === "item" ? form.destination_item_id : null,
      destination_section_id: form.destination_type === "section" ? form.destination_section_id : null,
      updated_at: editing && editing !== "new" ? editing.updated_at : undefined,
    };
    const result = editing && editing !== "new"
      ? await updatePromotion(editing.id, organizerId, payload)
      : await createPromotion(organizerId, payload);
    setPending(false);
    if (!result.success) { setFormError(result.error); return; }
    setEditing(null); router.refresh();
  }

  async function rowAction(promotion: PromotionRecord, action: "pause" | "resume" | "duplicate" | "delete") {
    setPendingId(promotion.id);
    const result = action === "pause" ? await pausePromotion(promotion.id, organizerId, promotion.updated_at)
      : action === "resume" ? await resumePromotion(promotion.id, organizerId, promotion.updated_at)
        : action === "duplicate" ? await duplicatePromotion(promotion.id, organizerId, promotion.updated_at)
          : await deletePromotion(promotion.id, organizerId, promotion.updated_at);
    setPendingId(null);
    if (!result.success) { setFormError(result.error); return; }
    setDeleteId(null); router.refresh();
  }

  const overlappingBanners = form.layout === "banner" ? promotions.filter((promotion) =>
    (!editing || editing === "new" || promotion.id !== editing.id) && promotion.layout === "banner" &&
    promotion.status === "active" && windowsOverlap(
      form.starts_at || "", form.ends_at || "", promotion.starts_at, promotion.ends_at,
    )
  ) : [];

  if (editing) {
    return (
      <section className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-6" aria-labelledby="promotion-form-title">
        <div className="mb-5 flex flex-wrap items-start justify-between gap-3">
          <div><h2 id="promotion-form-title" className="text-xl font-semibold">{editing === "new" ? "Create promotion" : "Edit promotion"}</h2><p className="mt-1 text-sm text-zinc-600">Set the offer, menu targets, and storefront presentation.</p></div>
          <button type="button" className={buttonClass} onClick={() => setEditing(null)}>Back to promotions</button>
        </div>
        <form onSubmit={savePromotion} className="grid gap-6 xl:grid-cols-[minmax(0,1.35fr)_minmax(300px,0.85fr)]">
          <div className="min-w-0 space-y-5">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field id="promo-name" label="Internal name"><input id="promo-name" className={inputClass} value={form.name} maxLength={80} required onChange={(event) => set("name", event.currentTarget.value)} /></Field>
              <Field id="promo-status" label="Status"><select id="promo-status" className={inputClass} value={form.status} onChange={(event) => set("status", event.currentTarget.value as FormState["status"])}><option value="draft">Draft</option><option value="active">Active</option><option value="paused">Paused</option></select></Field>
              <Field id="promo-headline" label="Storefront headline"><input id="promo-headline" className={inputClass} value={form.headline || ""} maxLength={120} onChange={(event) => set("headline", event.currentTarget.value)} /></Field>
              <Field id="promo-cta" label="CTA label"><input id="promo-cta" className={inputClass} value={form.cta_label || ""} maxLength={40} onChange={(event) => set("cta_label", event.currentTarget.value)} /></Field>
            </div>
            <Field id="promo-description" label="Description"><textarea id="promo-description" className={`${inputClass} min-h-24`} value={form.description || ""} maxLength={300} onChange={(event) => set("description", event.currentTarget.value)} /></Field>
            <div className="rounded-xl border border-zinc-200 p-4">
              <h3 className="font-semibold text-zinc-900">Offer</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field id="promo-offer-type" label="Offer type"><select id="promo-offer-type" className={inputClass} value={form.offer_type} onChange={(event) => set("offer_type", event.currentTarget.value as FormState["offer_type"])}><option value="percent_off">Percent off</option><option value="special_price">Special price</option><option value="free_delivery">Free delivery</option></select></Field>
                {form.offer_type === "percent_off" && <Field id="promo-percent" label="Percent off"><div className="relative"><input id="promo-percent" className={inputClass} type="number" min={1} max={90} step={1} value={form.percent_off ?? ""} required onChange={(event) => set("percent_off", Number(event.currentTarget.value))} /><span className="pointer-events-none absolute right-3 top-3 text-sm text-zinc-500">%</span></div></Field>}
                {form.offer_type === "special_price" && <Field id="promo-special-price" label={`Special price (${currency})`}><input id="promo-special-price" className={inputClass} type="number" min={0} max={999999.99} step="0.01" value={form.special_price ?? ""} required onChange={(event) => set("special_price", Number(event.currentTarget.value))} /></Field>}
                <Field id="promo-minimum" label={`Minimum order amount (${currency})`}><input id="promo-minimum" className={inputClass} type="number" min={0} max={9999999999.99} step="0.01" value={form.min_order_amount ?? ""} onChange={(event) => set("min_order_amount", event.currentTarget.value === "" ? null : Number(event.currentTarget.value))} /></Field>
                <Field id="promo-priority" label="Priority" help="Higher priority wins when two matching offers have the same price."><input id="promo-priority" className={inputClass} type="number" step={1} value={form.priority} onChange={(event) => set("priority", Number(event.currentTarget.value))} /></Field>
              </div>
              {form.offer_type === "percent_off" && <label className="mt-4 flex min-h-11 items-center gap-3 rounded-lg bg-zinc-50 px-3 text-sm text-zinc-800"><input type="checkbox" className="h-5 w-5 accent-orange-600" checked={form.apply_to_variants} onChange={(event) => set("apply_to_variants", event.currentTarget.checked)} /><span><span className="font-medium">Apply to variants</span><span className="mt-0.5 block text-xs text-zinc-600">Discounts the chosen variant price. When off, variant prices stay unchanged.</span></span></label>}
              {form.offer_type === "free_delivery" && <p className="mt-3 text-sm text-zinc-600">This offer waives the delivery fee on qualifying delivery orders. It does not change menu item prices.</p>}
              <div className="mt-4 grid gap-4 sm:grid-cols-2">
                <Field id="promo-code" label="Promo code" help="Optional. Codes are checked against the cart before an order is submitted."><input id="promo-code" className={inputClass} value={form.code || ""} maxLength={40} onChange={(event) => { set("code", event.currentTarget.value.toUpperCase()); setCopiedCode(false); }} /></Field>
                <div className="flex items-end gap-2"><button type="button" className={`${buttonClass} flex-1`} onClick={generateCode}>Generate code</button><button type="button" className={buttonClass} disabled={!form.code} onClick={() => void copyCode()}>{copiedCode ? "Copied" : "Copy"}</button></div>
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <h3 className="font-semibold text-zinc-900">Targets</h3>
              <p className="mt-1 text-xs text-zinc-600">Choose menu items or entire sections. You can select up to 50.</p>
              <label htmlFor="target-search" className="sr-only">Search menu targets</label>
              <input id="target-search" className={`${inputClass} mt-3`} placeholder="Search items and sections" value={targetSearch} onChange={(event) => setTargetSearch(event.currentTarget.value)} />
              <p className="mt-2 text-xs font-medium text-zinc-600">{form.targets.length}/50 selected</p>
              <div className="mt-2 max-h-64 space-y-1 overflow-y-auto rounded-lg border border-zinc-100 p-1" aria-label="Promotion targets">
                {targetRows.matchingSections.map((section) => {
                  const target = { item_id: null, section_id: section.id };
                  return <label key={section.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-zinc-50"><input type="checkbox" className="h-5 w-5 accent-orange-600" checked={form.targets.some((entry) => targetKey(entry) === targetKey(target))} onChange={() => toggleTarget(target)} /><span className="text-sm font-semibold">Section · {section.name}</span>{!section.is_active && <span className="ml-auto text-xs text-amber-700">Inactive</span>}</label>;
                })}
                {targetRows.matchingItems.map((item) => {
                  const target = { item_id: item.id, section_id: null };
                  const sectionName = sections.find((section) => section.id === item.section_id)?.name;
                  return <label key={item.id} className="flex min-h-11 cursor-pointer items-center gap-3 rounded-md px-2 hover:bg-zinc-50"><input type="checkbox" className="h-5 w-5 accent-orange-600" checked={form.targets.some((entry) => targetKey(entry) === targetKey(target))} onChange={() => toggleTarget(target)} /><span className="min-w-0 flex-1 truncate text-sm">{item.name}<span className="ml-1 text-xs text-zinc-500">{sectionName ? `· ${sectionName}` : ""}</span></span>{item.is_sold_out ? <span className="text-xs text-red-700">Sold out</span> : !item.is_active && <span className="text-xs text-amber-700">Inactive</span>}</label>;
                })}
                {targetRows.matchingSections.length === 0 && targetRows.matchingItems.length === 0 && <p className="p-4 text-sm text-zinc-500">No matching menu targets.</p>}
              </div>
            </div>
            <div className="rounded-xl border border-zinc-200 p-4">
              <h3 className="font-semibold text-zinc-900">Schedule and presentation</h3>
              <div className="mt-3 grid gap-4 sm:grid-cols-2">
                <Field id="promo-starts" label="Starts at"><input id="promo-starts" className={inputClass} type="datetime-local" value={toLocalInput(form.starts_at)} onChange={(event) => set("starts_at", event.currentTarget.value || null)} /></Field>
                <Field id="promo-ends" label="Ends at"><input id="promo-ends" className={inputClass} type="datetime-local" value={toLocalInput(form.ends_at)} onChange={(event) => set("ends_at", event.currentTarget.value || null)} /></Field>
                <Field id="promo-layout" label="Storefront layout"><select id="promo-layout" className={inputClass} value={form.layout} onChange={(event) => set("layout", event.currentTarget.value as FormState["layout"])}><option value="banner">Featured banner</option><option value="announcement_bar">Announcement bar</option><option value="dish_card">Dish promotion card</option></select></Field>
                <Field id="promo-destination-type" label="Button destination"><select id="promo-destination-type" className={inputClass} value={form.destination_type} onChange={(event) => set("destination_type", event.currentTarget.value as FormState["destination_type"])}><option value="none">No button</option><option value="item">Menu item</option><option value="section">Menu section</option>{menuPagePublished && <option value="menu">Menu page</option>}<option value="external">External HTTPS link</option></select></Field>
                {form.destination_type === "item" && <Field id="promo-destination-item" label="Menu item destination"><select id="promo-destination-item" className={inputClass} value={form.destination_item_id || ""} onChange={(event) => set("destination_item_id", event.currentTarget.value || null)}><option value="">Choose item</option>{items.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></Field>}
                {form.destination_type === "section" && <Field id="promo-destination-section" label="Menu section destination"><select id="promo-destination-section" className={inputClass} value={form.destination_section_id || ""} onChange={(event) => set("destination_section_id", event.currentTarget.value || null)}><option value="">Choose section</option>{sections.map((section) => <option key={section.id} value={section.id}>{section.name}</option>)}</select></Field>}
                {form.destination_type === "external" && <Field id="promo-destination-url" label="External HTTPS URL"><input id="promo-destination-url" className={inputClass} type="url" placeholder="https://example.com" value={form.destination_url || ""} onChange={(event) => set("destination_url", event.currentTarget.value)} /></Field>}
              </div>
              <div className="mt-4"><MediaUploadField label="Promotion image" value={form.image_url || ""} onChange={(url) => set("image_url", url)} tenantId={tenantId} folderSubpath="promotions" /></div>
            </div>
          </div>
          <aside className="min-w-0 xl:sticky xl:top-4 xl:self-start">
            <button type="button" className={`${buttonClass} mb-3 w-full xl:hidden`} aria-expanded={showMobilePreview} onClick={() => setShowMobilePreview((value) => !value)}>{showMobilePreview ? "Hide preview" : "Show live preview"}</button>
            <div className={`${showMobilePreview ? "" : "hidden"} xl:block`}>
              <div className="rounded-xl border border-zinc-200 bg-zinc-50 p-4">
                <h3 className="font-semibold">Live preview</h3>
                <p className="mb-3 mt-1 text-xs text-zinc-500">Updates as you edit. Price shown is illustrative.</p>
                <div className={form.layout === "announcement_bar" ? "rounded-lg bg-zinc-900 p-4 text-white" : form.layout === "dish_card" ? "mx-auto max-w-sm overflow-hidden rounded-xl border bg-white shadow-xs" : "overflow-hidden rounded-xl border bg-white shadow-xs"}>
                  {form.image_url && form.layout !== "announcement_bar" && <Image src={form.image_url} alt="Promotion preview" width={640} height={360} unoptimized className="aspect-[16/9] w-full object-cover" />}
                  <div className={form.layout === "announcement_bar" ? "space-y-1" : "space-y-2 p-4"}>
                    <p className={`text-xs font-bold uppercase tracking-wide ${form.layout === "announcement_bar" ? "text-orange-300" : "text-orange-700"}`}>{form.offer_type === "percent_off" ? `${form.percent_off || 0}% off` : form.offer_type === "special_price" ? "Special price" : "Free delivery"}</p>
                    <p className="text-lg font-bold">{form.headline || form.name || "Your promotion headline"}</p>
                    {form.description && <p className={`text-sm ${form.layout === "announcement_bar" ? "text-zinc-200" : "text-zinc-600"}`}>{form.description}</p>}
                    {form.layout === "dish_card" && <p className="text-sm"><span className="font-bold">{formatMoney(displayPrice, currency)}</span>{displayPrice < originalPreviewPrice && <span className="ml-2 text-zinc-500 line-through">{formatMoney(originalPreviewPrice, currency)}</span>}</p>}
                    {form.destination_type !== "none" && <span className="inline-flex min-h-11 items-center rounded-lg bg-orange-600 px-4 text-sm font-semibold text-white">{form.cta_label || "Shop now"}</span>}
                  </div>
                </div>
              </div>
              <div className="mt-4 space-y-2" aria-live="polite">
                {overlappingBanners.map((promotion) => {
                  const samePriority = Number(form.priority) === Number(promotion.priority);
                  const incomingCreatedAt = editing && editing !== "new" ? editing.created_at : now.toISOString();
                  const incomingId = editing && editing !== "new" ? editing.id : "promotion-preview";
                  const incomingWins = Number(form.priority) > Number(promotion.priority) || (
                    samePriority && (Date.parse(incomingCreatedAt) < Date.parse(promotion.created_at) ||
                      (Date.parse(incomingCreatedAt) === Date.parse(promotion.created_at) && incomingId.localeCompare(promotion.id) < 0))
                  );
                  const winReason = samePriority ? "creation time and id" : "priority";
                  return <p key={promotion.id} className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-blue-900">This banner overlaps “{promotion.name}”. {incomingWins ? `This promotion wins by ${winReason}.` : `“${promotion.name}” wins by ${winReason}.`}</p>;
                })}
                {affectedItems.some((item) => !item.is_active || item.is_sold_out) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">Some selected items are inactive or sold out. They will not receive the offer until available.</p>}
                {form.offer_type === "special_price" && affectedItems.some((item) => Number(form.special_price) >= Number(item.price)) && <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-900">The special price is at or above the current item price for at least one target.</p>}
                {affectedItems.some((item) => item.promo_price != null && Number(item.promo_price) < Number(item.price)) && <p className="rounded-lg border border-zinc-200 bg-white p-3 text-sm text-zinc-700">A target already has a manual promo price. The lowest candidate price wins; offers do not stack.</p>}
                {form.offer_type === "special_price" && affectedItems.some((item) => hasVariant(item, variantItemIds)) && <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-900">Special-price promotions cannot target variant items. Choose percent off and enable Apply to variants.</p>}
              </div>
            </div>
          </aside>
          <div className="flex flex-wrap items-center gap-2 border-t border-zinc-200 pt-4 xl:col-span-2">
            {formError && <p className="w-full rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-800" role="alert">{formError}</p>}
            <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-600 px-5 py-2 text-sm font-semibold text-white hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500 disabled:opacity-50" type="submit" disabled={pending}>{pending ? "Saving…" : "Save promotion"}</button>
            <button className={buttonClass} type="button" onClick={() => setEditing(null)}>Cancel</button>
          </div>
        </form>
      </section>
    );
  }

  return (
    <section className="space-y-5" aria-labelledby="promotions-list-title">
      {loadError && <div className="rounded-xl border border-amber-300 bg-amber-50 p-4 text-sm text-amber-950" role="alert">Promotions could not be loaded. Confirm migration 184 is applied, then refresh this page.</div>}
      {formError && <div className="rounded-xl border border-red-200 bg-red-50 p-4 text-sm text-red-800" role="alert">{formError}<button className="ml-3 underline" onClick={() => setFormError(null)}>Dismiss</button></div>}
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div><h2 id="promotions-list-title" className="text-lg font-semibold">Your promotions</h2><p className="text-sm text-zinc-600">{promotions.length} total · {counts.active} active</p></div>
        {canEdit && <button className="inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-orange-500" onClick={openCreate} disabled={Boolean(loadError)}>Create promotion</button>}
      </div>
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        {STATUS_ORDER.map((status) => <button key={status} className={`min-h-11 rounded-xl border border-zinc-200 bg-white px-3 py-2 text-left transition hover:border-orange-300 ${statusFilter === status ? "ring-2 ring-orange-500" : ""}`} aria-pressed={statusFilter === status} onClick={() => setStatusFilter(status)}><span className="block text-xs capitalize text-zinc-500">{status}</span><span className="text-lg font-semibold">{counts[status]}</span></button>)}
      </div>
      <div className="flex flex-col gap-3 sm:flex-row">
        <label htmlFor="promotions-search" className="sr-only">Search promotions</label>
        <input id="promotions-search" className={inputClass} placeholder="Search by name, headline, or code" value={query} onChange={(event) => setQuery(event.currentTarget.value)} />
        <label htmlFor="promotion-status-filter" className="sr-only">Filter by status</label>
        <select id="promotion-status-filter" className={`${inputClass} sm:max-w-56`} value={statusFilter} onChange={(event) => setStatusFilter(event.currentTarget.value)}><option value="all">All statuses</option>{STATUS_ORDER.map((status) => <option key={status} value={status}>{status[0].toUpperCase() + status.slice(1)}</option>)}</select>
      </div>
      {promotions.length === 0 ? <div className="rounded-2xl border border-dashed border-zinc-300 bg-white p-8 text-center"><h3 className="text-lg font-semibold">No promotions yet</h3><p className="mx-auto mt-2 max-w-md text-sm text-zinc-600">Create an offer to highlight menu items or give customers a promo code.</p>{canEdit && <button className="mt-4 inline-flex min-h-11 items-center justify-center rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white" onClick={openCreate}>Create promotion</button>}</div>
        : filtered.length === 0 ? <p className="rounded-xl border bg-white p-6 text-center text-sm text-zinc-600">No promotions match these filters.</p>
          : <div className="grid gap-3">{filtered.map((promotion) => {
            const status = getMenuPromotionDisplayStatus(promotion, now);
            const targetCount = promotion.targets?.length || 0;
            return <article key={promotion.id} className="rounded-2xl border border-zinc-200 bg-white p-4 shadow-xs sm:p-5">
              <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2"><h3 className="truncate font-semibold text-zinc-900">{promotion.name}</h3><span className={`rounded-full px-2.5 py-1 text-xs font-semibold capitalize ${STATUS_STYLE[status]}`}>{status}</span><span className="rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-medium text-zinc-700">{promotion.layout.replace("_", " ")}</span></div>
                  <p className="mt-1 text-sm text-zinc-600">{promotion.headline || (promotion.offer_type === "percent_off" ? `${promotion.percent_off}% off` : promotion.offer_type === "special_price" ? `Special price ${formatMoney(promotion.special_price, currency)}` : "Free delivery")}</p>
                  <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-zinc-500"><span>{targetCount} target{targetCount === 1 ? "" : "s"}</span>{promotion.code && <span>Code <strong className="font-mono text-zinc-700">{promotion.code}</strong></span>}{promotion.ends_at && <span>Ends {new Date(promotion.ends_at).toLocaleDateString()}</span>}</div>
                </div>
                <div className="flex flex-wrap gap-2">
                  {canEdit && <><button className={buttonClass} onClick={() => openEdit(promotion)}>Edit</button>{promotion.status === "paused" ? <button className={buttonClass} disabled={pendingId === promotion.id} onClick={() => void rowAction(promotion, "resume")}>Resume</button> : <button className={buttonClass} disabled={pendingId === promotion.id || promotion.status === "draft"} onClick={() => void rowAction(promotion, "pause")}>Pause</button>}<button className={buttonClass} disabled={pendingId === promotion.id} onClick={() => void rowAction(promotion, "duplicate")}>Duplicate</button></>}
                  {canDelete && (deleteId === promotion.id ? <><span className="self-center text-xs text-red-700">Delete this promotion?</span><button className={`${buttonClass} border-red-300 text-red-700`} disabled={pendingId === promotion.id} onClick={() => void rowAction(promotion, "delete")}>Confirm delete</button><button className={buttonClass} onClick={() => setDeleteId(null)}>Keep</button></> : <button className={`${buttonClass} text-red-700`} onClick={() => setDeleteId(promotion.id)}>Delete</button>)}
                </div>
              </div>
            </article>;
          })}</div>}
    </section>
  );
}
