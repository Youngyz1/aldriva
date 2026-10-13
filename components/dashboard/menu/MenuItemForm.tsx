"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";
import { ModifiersEditor } from "./ModifiersEditor";
import { OptionGroupsEditor } from "./OptionGroupsEditor";
import type { MenuItemOptionGroup } from "@/lib/menu-pricing";
import { createMenuItem, updateMenuItem, createMenuSection } from "@/lib/actions/menus";
import { useRouter } from "next/navigation";

const DIETARY_TAGS = ["vegan","vegetarian","gluten_free","halal","kosher","dairy_free","nut_free"] as const;
const ALLERGENS = ["nuts","dairy","gluten","soy","eggs","shellfish"] as const;

export function MenuItemForm({
  sectionId,
  organizerId,
  tenantId,
  item,
  defaultSectionName,
  onSaved,
  onCancel,
}: {
  sectionId?: string;
  organizerId: string;
  tenantId: string;
  item?: any;
  defaultSectionName?: string;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const [sectionName, setSectionName] = useState(defaultSectionName || "Main menu");
  const [createdSectionId, setCreatedSectionId] = useState<string | null>(null);
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : "");
  const [promoPrice, setPromoPrice] = useState(item?.promo_price != null ? String(item.promo_price) : "");
  const [imageUrl, setImageUrl] = useState(item?.image_url || "");
  const [dietary, setDietary] = useState<string[]>(item?.dietary_tags || []);
  const [allergens, setAllergens] = useState<string[]>(item?.allergens || []);
  const [modifiers, setModifiers] = useState<{ name: string; price_delta: number }[]>(item?.modifiers || []);
  const [optionGroups, setOptionGroups] = useState<MenuItemOptionGroup[]>(item?.option_groups || []);
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false);
  const [isSoldOut, setIsSoldOut] = useState(item?.is_sold_out ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  function toggle(list: string[], value: string, setter: (v: string[]) => void) {
    if (list.includes(value)) setter(list.filter(v=>v!==value));
    else {
      if (list.length >= 12) return;
      setter([...list, value]);
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true); setError(null);

    const numericPrice = Number(price);
    if (!Number.isFinite(numericPrice) || numericPrice < 0) {
      setError("Valid price is required");
      setPending(false);
      return;
    }

    if (promoPrice !== "") {
      const numericPromo = Number(promoPrice);
      if (!Number.isFinite(numericPromo) || numericPromo < 0) {
        setError("Promo price must be a valid non-negative number");
        setPending(false);
        return;
      }
      if (numericPromo >= numericPrice) {
        setError("Promo price must be strictly less than the regular price");
        setPending(false);
        return;
      }
    }

    let targetSectionId = sectionId || createdSectionId;
    if (!targetSectionId && !item) {
      if (!sectionName.trim()) {
        setError("Section name is required");
        setPending(false);
        return;
      }
      const secRes = await createMenuSection(organizerId, { name: sectionName.trim() });
      if (!secRes.success || !secRes.data) {
        setError(secRes.error || "Failed to create section");
        setPending(false);
        return;
      }
      targetSectionId = secRes.data.id;
      setCreatedSectionId(secRes.data.id);
    }
    if (!targetSectionId) {
      setError("Section ID is missing");
      setPending(false);
      return;
    }
    const payload: any = {
      name,
      description: description || null,
      price: numericPrice,
      promo_price: promoPrice !== "" ? Number(promoPrice) : null,
      is_sold_out: isSoldOut,
      image_url: imageUrl || null,
      dietary_tags: dietary,
      allergens,
      modifiers,
      option_groups: optionGroups,
      is_active: isActive,
      is_featured: isFeatured,
    };
    const res = item
      ? await updateMenuItem(item.id, targetSectionId, organizerId, payload)
      : await createMenuItem(targetSectionId, organizerId, payload);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    router.refresh(); onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      {!sectionId && !item && (
        <div className="space-y-1">
          <Label>Section name *</Label>
          <Input
            value={sectionName}
            onChange={(e) => setSectionName(e.target.value)}
            maxLength={80}
            required
            placeholder={defaultSectionName || "Main menu"}
            disabled={Boolean(createdSectionId)}
          />
        </div>
      )}
      <div className="space-y-1"><Label>Name *</Label><Input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required placeholder="Bruschetta" /></div>
      <div className="space-y-1"><Label>Description</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} rows={2} /></div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div className="space-y-1">
          <Label>Price *</Label>
          <Input type="number" step="0.01" min={0} max={999999.99} value={price} onChange={e=>setPrice(e.target.value)} required />
        </div>
        <div className="space-y-1">
          <Label>Promo Price (optional)</Label>
          <Input
            type="number"
            step="0.01"
            min={0}
            max={999999.99}
            value={promoPrice}
            onChange={e=>setPromoPrice(e.target.value)}
            placeholder="Sale price (less than regular)"
          />
        </div>
      </div>
      <div className="space-y-1">
        <Label>Image</Label>
        <MediaUploadField label="Menu Item Image" value={imageUrl} onChange={setImageUrl} tenantId={tenantId} folderSubpath="menu" />
      </div>
      <div className="space-y-1">
        <Label>Dietary tags (max 12)</Label>
        <div className="flex flex-wrap gap-2">
          {DIETARY_TAGS.map(tag=> (
            <label key={tag} className="flex items-center gap-1 text-xs border rounded-full px-2 py-1">
              <input type="checkbox" checked={dietary.includes(tag)} onChange={()=> toggle(dietary, tag, setDietary)} /> {tag.replace("_"," ")}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label>Allergens (max 12)</Label>
        <div className="flex flex-wrap gap-2">
          {ALLERGENS.map(a=> (
            <label key={a} className="flex items-center gap-1 text-xs border rounded-full px-2 py-1">
              <input type="checkbox" checked={allergens.includes(a)} onChange={()=> toggle(allergens, a, setAllergens)} /> {a}
            </label>
          ))}
        </div>
        <div className="text-xs text-amber-600">Allergen labels are entered by the business and are not verified by the platform.</div>
      </div>
      <ModifiersEditor modifiers={modifiers} onChange={setModifiers} />
      <OptionGroupsEditor groups={optionGroups} onChange={setOptionGroups} />
      <div className="flex flex-wrap gap-4 pt-1">
        <label className="flex items-center gap-2 text-sm"><Switch checked={isActive} onCheckedChange={setIsActive} /> Active</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={isFeatured} onCheckedChange={setIsFeatured} /> Featured</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={isSoldOut} onCheckedChange={setIsSoldOut} /> Sold out</label>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending? "Saving...": item? "Update Item":"Create Item"}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
