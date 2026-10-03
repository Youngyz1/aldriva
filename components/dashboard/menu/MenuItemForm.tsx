"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";
import { ModifiersEditor } from "./ModifiersEditor";
import { createMenuItem, updateMenuItem } from "@/lib/actions/menus";
import { useRouter } from "next/navigation";

const DIETARY_TAGS = ["vegan","vegetarian","gluten_free","halal","kosher","dairy_free","nut_free"] as const;
const ALLERGENS = ["nuts","dairy","gluten","soy","eggs","shellfish"] as const;

export function MenuItemForm({ sectionId, organizerId, tenantId, item, onSaved, onCancel }: { sectionId: string; organizerId: string; tenantId: string; item?: any; onSaved?: () => void; onCancel?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : "");
  const [imageUrl, setImageUrl] = useState(item?.image_url || "");
  const [dietary, setDietary] = useState<string[]>(item?.dietary_tags || []);
  const [allergens, setAllergens] = useState<string[]>(item?.allergens || []);
  const [modifiers, setModifiers] = useState<{ name: string; price_delta: number }[]>(item?.modifiers || []);
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false);
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
    const payload:any = { name, description: description || null, price: Number(price), image_url: imageUrl || null, dietary_tags: dietary, allergens, modifiers, is_active: isActive, is_featured: isFeatured };
    const res = item ? await updateMenuItem(item.id, sectionId, organizerId, payload) : await createMenuItem(sectionId, organizerId, payload);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    router.refresh(); onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1"><Label>Name *</Label><Input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required placeholder="Bruschetta" /></div>
      <div className="space-y-1"><Label>Description</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} rows={2} /></div>
      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1"><Label>Price *</Label><Input type="number" step="0.01" min={0} max={999999.99} value={price} onChange={e=>setPrice(e.target.value)} required /></div>
        <div className="space-y-1"><Label>Image</Label><MediaUploadField label="Menu Item Image" value={imageUrl} onChange={setImageUrl} tenantId={tenantId} folderSubpath="menu" /></div>
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
      <div className="flex gap-4">
        <label className="flex items-center gap-2 text-sm"><Switch checked={isActive} onCheckedChange={setIsActive} /> Active</label>
        <label className="flex items-center gap-2 text-sm"><Switch checked={isFeatured} onCheckedChange={setIsFeatured} /> Featured</label>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending? "Saving...": item? "Update Item":"Create Item"}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
