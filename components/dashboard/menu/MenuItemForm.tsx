"use client";
import { useEffect, useState } from "react";
import { useTranslations } from "next-intl";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";
import { OptionGroupsEditor } from "./OptionGroupsEditor";
import { MenuItemOptionsPanel } from "./MenuItemOptionsPanel";
import type { MenuItemOptionGroup } from "@/lib/menu-pricing";
import { createMenuItem, updateMenuItem, createMenuSection } from "@/lib/actions/menus";
import { upgradeMenuItemOptions } from "@/lib/actions/menu-option-groups";
import { DIETARY_TAGS, MENU_ALLERGENS } from "@/lib/menu-option-taxonomy";
import { useRouter } from "next/navigation";
import { listPromotions } from "@/lib/actions/promotions";
import { getMenuPromotionDisplayStatus } from "@/lib/menu-promotions";

export function MenuItemForm({
  sectionId,
  organizerId,
  tenantId,
  item,
  defaultSectionName,
  optionGroups: libraryGroups = [],
  optionOptions = [],
  optionAssignments = [],
  onOptionGroupsChanged,
  onSaved,
  onCancel,
}: {
  sectionId?: string;
  organizerId: string;
  tenantId: string;
  item?: any;
  defaultSectionName?: string;
  optionGroups?: any[];
  optionOptions?: any[];
  optionAssignments?: any[];
  onOptionGroupsChanged?: () => void;
  onSaved?: () => void;
  onCancel?: () => void;
}) {
  const router = useRouter();
  const tOptions = useTranslations("MenuOptions");
  const [sectionName, setSectionName] = useState(defaultSectionName || "Main menu");
  const [createdSectionId, setCreatedSectionId] = useState<string | null>(null);
  const [name, setName] = useState(item?.name || "");
  const [description, setDescription] = useState(item?.description || "");
  const [price, setPrice] = useState(item?.price != null ? String(item.price) : "");
  const [promoPrice, setPromoPrice] = useState(item?.promo_price != null ? String(item.promo_price) : "");
  const [imageUrl, setImageUrl] = useState(item?.image_url || "");
  const [dietary, setDietary] = useState<string[]>(item?.dietary_tags || []);
  const [allergens, setAllergens] = useState<string[]>(item?.allergens || []);
  const [optionGroups, setOptionGroups] = useState<MenuItemOptionGroup[]>(item?.option_groups || []);
  const [upgradeError, setUpgradeError] = useState<string | null>(null);
  const [isActive, setIsActive] = useState(item?.is_active ?? true);
  const [isFeatured, setIsFeatured] = useState(item?.is_featured ?? false);
  const [isSoldOut, setIsSoldOut] = useState(item?.is_sold_out ?? false);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [targetingPromotions, setTargetingPromotions] = useState<Array<{ id: string; name: string }>>([]);
  const usesNormalizedOptions = item?.options_source === "normalized";

  useEffect(() => {
    if (!item?.id) return;
    let cancelled = false;
    void listPromotions(organizerId).then((result) => {
      if (!cancelled && result.success && result.data) {
        const now = new Date();
        setTargetingPromotions(result.data.promotions.filter((promotion: any) =>
          getMenuPromotionDisplayStatus(promotion, now) === "active" &&
          (promotion.targets || []).some((target: any) => target.item_id === item.id || target.section_id === item.section_id)
        ).map((promotion: any) => ({ id: promotion.id, name: promotion.name })));
      }
    });
    return () => { cancelled = true; };
  }, [item?.id, item?.section_id, organizerId]);

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
      ...(!usesNormalizedOptions ? { option_groups: optionGroups } : {}),
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

  async function handleUpgradeOptions() {
    if (!item?.id) return;
    setPending(true); setUpgradeError(null);
    const result = await upgradeMenuItemOptions(item.id, organizerId);
    setPending(false);
    if (!result.success) { setUpgradeError(result.error || "Could not upgrade these options"); return; }
    router.refresh(); onOptionGroupsChanged?.(); onSaved?.();
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
          {targetingPromotions.length > 0 && <p className="text-sm text-zinc-600" aria-live="polite">Active promotions also target this item: {targetingPromotions.map((promotion) => promotion.name).join(", ")}. The lowest price wins; promotions do not stack.</p>}
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
            <label key={tag} className="flex min-h-11 items-center gap-2 text-sm border rounded-full px-3 py-2">
              <input type="checkbox" checked={dietary.includes(tag)} onChange={()=> toggle(dietary, tag, setDietary)} /> {tag.replace("_"," ")}
            </label>
          ))}
        </div>
      </div>
      <div className="space-y-1">
        <Label>Allergens (max 12)</Label>
        <div className="flex flex-wrap gap-2">
          {MENU_ALLERGENS.map(a=> (
            <label key={a} className="flex min-h-11 items-center gap-2 text-sm border rounded-full px-3 py-2">
              <input type="checkbox" checked={allergens.includes(a)} onChange={()=> toggle(allergens, a, setAllergens)} /> {a}
            </label>
          ))}
        </div>
        <div className="text-sm text-amber-700">{tOptions("allergenNote")}</div>
      </div>
      {Array.isArray(item?.modifiers) && item.modifiers.length > 0 && <section className="space-y-2 rounded-xl border p-3">
        <h3 className="text-sm font-medium">{tOptions("legacyModifiers")}</h3>
        <ul className="list-inside list-disc text-sm">{item.modifiers.map((modifier: { name?: string; price_delta?: number }, index: number) => <li key={`${modifier.name}-${index}`}>{modifier.name || "Modifier"} · {Number(modifier.price_delta || 0).toFixed(2)}</li>)}</ul>
        <p className="text-sm text-muted-foreground">{tOptions("legacyModifiersNote")}</p>
      </section>}
      {usesNormalizedOptions && item?.id ? <MenuItemOptionsPanel
        itemId={item.id}
        organizerId={organizerId}
        groups={libraryGroups}
        options={optionOptions}
        assignments={optionAssignments}
        canEdit={true}
        onChanged={onOptionGroupsChanged}
      /> : <>
        <OptionGroupsEditor groups={optionGroups} onChange={setOptionGroups} />
        {item?.id && <section className="space-y-2 rounded-xl border border-dashed p-4">
          <h3 className="font-medium">{tOptions("upgradeTitle")}</h3>
          <p className="text-sm text-muted-foreground">{tOptions("upgradeBody")}</p>
          <Button className="min-h-11" type="button" variant="outline" disabled={pending} onClick={() => void handleUpgradeOptions()}>{tOptions("upgrade")}</Button>
          {upgradeError && <p role="alert" className="text-sm text-destructive">{tOptions("upgradeRefused", { reason: upgradeError })}</p>}
        </section>}
      </>}
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
