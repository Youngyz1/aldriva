"use client";
import { useState, useRef } from "react";
import { useTranslations } from "next-intl";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { createService, updateService } from "@/lib/actions/services";
import { useRouter } from "next/navigation";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";
import { IconPlus as Plus, IconX as X, IconChevronUp as ChevronUp, IconChevronDown as ChevronDown } from "@tabler/icons-react";
import { INCLUDES_MAX_ITEMS, INCLUDE_ITEM_MAX, SUMMARY_MAX } from "@/lib/validation/service-catalog";

type CategoryOption = { id: string; title: string };

export function ServiceForm({
  organizerId,
  service,
  tenantId,
  categories = [],
  onSaved,
}: {
  organizerId: string;
  service?: any;
  tenantId: string;
  categories?: CategoryOption[];
  onSaved?: () => void;
}) {
  const router = useRouter();
  const t = useTranslations("Bookings");
  const [title, setTitle] = useState(service?.title || "");
  const [slug, setSlug] = useState(service?.slug || "");
  const [slugEdited, setSlugEdited] = useState(Boolean(service));
  const [categoryId, setCategoryId] = useState(service?.category_id || "");
  const [summary, setSummary] = useState(service?.summary || "");
  const [description, setDescription] = useState(service?.description || "");
  const [includes, setIncludes] = useState<string[]>(Array.isArray(service?.includes) ? service.includes : []);
  const [price, setPrice] = useState(service?.price ?? "");
  const [duration, setDuration] = useState(service?.duration_minutes ?? "");
  const [bookingMode, setBookingMode] = useState(service?.booking_mode ?? "timed");
  const [imageUrl, setImageUrl] = useState(service?.image_url || "");
  const [heroImageUrl, setHeroImageUrl] = useState(service?.hero_image_url || "");
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const submittingRef = useRef(false);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugEdited) {
      setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120));
    }
  }

  function addInclude() {
    if (includes.length >= INCLUDES_MAX_ITEMS) return;
    setIncludes([...includes, ""]);
  }
  function updateInclude(idx: number, value: string) {
    const next = [...includes];
    next[idx] = value.slice(0, INCLUDE_ITEM_MAX);
    setIncludes(next);
  }
  function removeInclude(idx: number) {
    setIncludes(includes.filter((_, i) => i !== idx));
  }
  function moveInclude(idx: number, dir: -1 | 1) {
    const next = [...includes];
    const tmp = next[idx];
    next[idx] = next[idx + dir];
    next[idx + dir] = tmp;
    setIncludes(next);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    if (submittingRef.current) return;
    submittingRef.current = true;
    setSaving(true);
    setError(null);
    try {
      const payload: any = {
        title,
        slug: slug || undefined,
        category_id: categoryId || null,
        summary: summary || null,
        description,
        includes: includes.filter((i) => i.trim()),
        price: price === "" || price === null || price === undefined ? null : Number(price),
        duration_minutes: duration ? Number(duration) : null,
        booking_mode: bookingMode,
        image_url: imageUrl || null,
        hero_image_url: heroImageUrl || null,
        is_active: isActive,
      };
      const res = service ? await updateService(service.id, organizerId, payload) : await createService(organizerId, payload);
      if (!res.success) { setError(res.error || "Failed"); return; }
      router.push(`/dashboard/org/${organizerId}/services`);
      router.refresh();
      onSaved?.();
    } finally {
      submittingRef.current = false;
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" value={title} onChange={(e) => handleTitleChange(e.target.value)} maxLength={120} required placeholder="Haircut" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="slug">Slug</Label>
        <Input id="slug" value={slug} onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }} maxLength={120} placeholder="haircut" />
        <p className="text-xs text-zinc-500">Used in the service's URL. Auto-filled from the title until you edit it.</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="category">Category</Label>
        <Select id="category" value={categoryId} onChange={(e) => setCategoryId(e.target.value)}>
          <option value="">None</option>
          {categories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
        </Select>
      </div>
      <div className="space-y-2">
        <Label htmlFor="summary">Summary</Label>
        <Input id="summary" value={summary} onChange={(e) => setSummary(e.target.value.slice(0, SUMMARY_MAX))} maxLength={SUMMARY_MAX} placeholder="One-line summary shown on service cards" />
        <p className="text-xs text-zinc-500 text-right">{summary.length}/{SUMMARY_MAX}</p>
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="Professional haircut with styling" />
      </div>
      <div className="space-y-2">
        <Label>What's included</Label>
        <div className="space-y-2">
          {includes.map((item, idx) => (
            <div key={idx} className="flex items-center gap-2">
              <Input value={item} onChange={(e) => updateInclude(idx, e.target.value)} maxLength={INCLUDE_ITEM_MAX} placeholder="e.g. Free consultation" />
              <Button type="button" variant="ghost" size="icon" disabled={idx === 0} onClick={() => moveInclude(idx, -1)}><ChevronUp className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" disabled={idx === includes.length - 1} onClick={() => moveInclude(idx, 1)}><ChevronDown className="h-4 w-4" /></Button>
              <Button type="button" variant="ghost" size="icon" onClick={() => removeInclude(idx)}><X className="h-4 w-4 text-red-600" /></Button>
            </div>
          ))}
        </div>
        {includes.length < INCLUDES_MAX_ITEMS && (
          <Button type="button" variant="outline" size="sm" onClick={addInclude}>
            <Plus className="h-4 w-4 mr-2" />Add item
          </Button>
        )}
        <p className="text-xs text-zinc-500">Up to {INCLUDES_MAX_ITEMS} short bullets, {INCLUDE_ITEM_MAX} characters each.</p>
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price</Label>
          <Input id="price" type="number" step="0.01" min={0} max={999999.99} value={price} onChange={(e) => setPrice(e.target.value)} placeholder="Optional" />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Duration (min)</Label>
          <Input id="duration" type="number" min={5} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60" />
        </div>
      </div>
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <Switch id="bookingMode" checked={bookingMode === "timed"} onCheckedChange={(checked) => setBookingMode(checked ? "timed" : "date_only")} />
          <Label htmlFor="bookingMode" className="cursor-pointer">
            {t("bookingModeTimed")}
          </Label>
        </div>
        <p className="text-xs text-zinc-500">{t("bookingModeTimedHint")}</p>
      </div>
      <div className="space-y-2">
        <Label>Image</Label>
        <MediaUploadField label="Service Image" value={imageUrl} onChange={setImageUrl} tenantId={tenantId} folderSubpath="services" />
      </div>
      <div className="space-y-2">
        <Label>Hero image (optional second image for the service detail page)</Label>
        <MediaUploadField label="Service Hero Image" value={heroImageUrl} onChange={setHeroImageUrl} tenantId={tenantId} folderSubpath="services" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={isActive} onCheckedChange={setIsActive} id="active" />
        <Label htmlFor="active">Active</Label>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <Button type="submit" disabled={saving}>{saving ? "Saving..." : service ? "Update Service" : "Create Service"}</Button>
    </form>
  );
}
