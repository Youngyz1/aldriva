"use client";

import { useMemo, useState } from "react";
import { useLocale, useTranslations } from "next-intl";
import Image from "next/image";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Switch } from "@/components/ui/switch";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";
import { MENU_ALLERGENS } from "@/lib/menu-option-taxonomy";
import { getMenuOptionTemplates, validateMenuOptionGroupRules, MENU_OPTION_LIMIT } from "@/lib/menu-option-dashboard";
import {
  createMenuOption,
  createMenuOptionGroup,
  deleteMenuOption,
  deleteMenuOptionGroup,
  duplicateMenuOptionGroup,
  reorderMenuOptions,
  updateMenuOption,
  updateMenuOptionGroup,
} from "@/lib/actions/menu-option-groups";

type Group = { id: string; organizer_id: string; name: string; kind: "variant" | "addon"; min_select: number; max_select: number; is_required: boolean; position: number; is_active: boolean; updated_at: string };
type Option = { id: string; group_id: string; organizer_id: string; name: string; description?: string | null; price: number; image_url?: string | null; is_default: boolean; max_qty: number; is_available: boolean; allergens: string[]; position: number; updated_at: string };
type Assignment = { id: string; item_id: string; group_id: string; position: number };

export function MenuOptionGroupsLibrary({
  organizerId,
  tenantId,
  groups,
  options,
  assignments,
  items,
  canEdit,
  canDelete,
  onChanged,
}: {
  organizerId: string;
  tenantId: string;
  groups: Group[];
  options: Option[];
  assignments: Assignment[];
  items: Array<{ id: string; name: string }>;
  canEdit: boolean;
  canDelete: boolean;
  onChanged?: () => void;
}) {
  const t = useTranslations("MenuOptions");
  const locale = useLocale() === "fr" ? "fr" : "en";
  const templates = useMemo(() => getMenuOptionTemplates(locale), [locale]);
  const [selectedTemplate, setSelectedTemplate] = useState(templates[0].id);
  const [groupForm, setGroupForm] = useState<{ id?: string; templateId?: string | null; name: string; kind: "variant" | "addon"; is_required: boolean; min_select: number; max_select: number; updated_at?: string } | null>(null);
  const [selectedGroupId, setSelectedGroupId] = useState<string | null>(null);
  const [editingOption, setEditingOption] = useState<Option | null>(null);
  const [creatingOption, setCreatingOption] = useState(false);
  const [deleteGroupId, setDeleteGroupId] = useState<string | null>(null);
  const [deleteOptionId, setDeleteOptionId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [optionForm, setOptionForm] = useState({ name: "", description: "", price: "0", image_url: "", is_default: false, max_qty: 1, is_available: true, allergens: [] as string[] });
  const [draggedOption, setDraggedOption] = useState<string | null>(null);
  const selectedGroup = groups.find((group) => group.id === selectedGroupId) || null;
  const selectedOptions = options.filter((option) => option.group_id === selectedGroupId).sort((a, b) => a.position - b.position);
  const groupCounts = new Map<string, number>();
  for (const assignment of assignments) groupCounts.set(assignment.group_id, (groupCounts.get(assignment.group_id) || 0) + 1);
  const itemNames = new Map(items.map((item) => [item.id, item.name]));

  function startScratch() {
    setError(""); setNotice(""); setGroupForm({ templateId: null, name: "", kind: "addon", is_required: false, min_select: 0, max_select: 1 });
  }

  async function saveGroup(event: React.FormEvent) {
    event.preventDefault();
    if (!groupForm) return;
    const template = !groupForm.id && groupForm.templateId ? templates.find((entry) => entry.id === groupForm.templateId) : undefined;
    const plannedName = groupForm.id ? groupForm.name : template?.name || groupForm.name;
    const groupOptions = groupForm.id ? options.filter((option) => option.group_id === groupForm.id).length : 0;
    const validation = validateMenuOptionGroupRules(groupForm, groupOptions);
    if (!plannedName.trim()) { setError("Enter a group name."); return; }
    if (validation) { setError(validation); return; }
    setBusy(true); setError(""); setNotice("");
    if (groupForm.id) {
      const result = await updateMenuOptionGroup(groupForm.id, organizerId, { ...groupForm, updated_at: groupForm.updated_at });
      setBusy(false);
      if (!result.success) { setError(result.error || t("changedReload")); return; }
      setGroupForm(null); setNotice(t("editGroup")); onChanged?.(); return;
    }
    const values = template
      ? { name: template.name, kind: template.kind, is_required: template.is_required, min_select: template.min_select, max_select: template.max_select }
      : { name: groupForm.name.trim(), kind: groupForm.kind, is_required: groupForm.is_required, min_select: groupForm.min_select, max_select: groupForm.max_select };
    const created = await createMenuOptionGroup(organizerId, { ...values, position: groups.length });
    if (created.success === false) { setBusy(false); setError(created.error || "Failed to create group"); return; }
    if (!created.data) { setBusy(false); setError("Failed to create group"); return; }
    if (template) {
      for (const [position, name] of template.options.entries()) {
        const optionResult = await createMenuOption(created.data.id, organizerId, { name, price: 0, position, max_qty: 1, is_default: false, is_available: true, allergens: [] });
        if (!optionResult.success) {
          setBusy(false); setError(`Group created, but an example option could not be added: ${optionResult.error || "Failed"}`); return;
        }
      }
      setNotice(t("editPrices"));
    }
    setBusy(false); setGroupForm(null); setSelectedGroupId(created.data.id); onChanged?.();
  }

  async function toggleActive(group: Group) {
    setBusy(true); setError("");
    const result = await updateMenuOptionGroup(group.id, organizerId, { is_active: !group.is_active, updated_at: group.updated_at });
    setBusy(false);
    if (!result.success) { setError(result.error || t("changedReload")); return; }
    onChanged?.();
  }

  async function duplicate(group: Group) {
    setBusy(true); setError("");
    const result = await duplicateMenuOptionGroup(group.id, organizerId);
    setBusy(false);
    if (!result.success) { setError(result.error || "Failed to duplicate group"); return; }
    onChanged?.();
  }

  async function removeGroup(groupId: string) {
    setBusy(true); setError("");
    const result = await deleteMenuOptionGroup(groupId, organizerId);
    setBusy(false);
    if (!result.success) { setError(result.error || "Failed to delete group"); return; }
    setDeleteGroupId(null);
    if (selectedGroupId === groupId) setSelectedGroupId(null);
    onChanged?.();
  }

  function startOption(option?: Option) {
    setError(""); setNotice("");
    setEditingOption(option || null); setCreatingOption(!option);
    setOptionForm(option ? {
      name: option.name, description: option.description || "", price: String(option.price), image_url: option.image_url || "",
      is_default: option.is_default, max_qty: option.max_qty, is_available: option.is_available, allergens: option.allergens || [],
    } : { name: "", description: "", price: "0", image_url: "", is_default: false, max_qty: 1, is_available: true, allergens: [] });
  }

  async function saveOption(event: React.FormEvent) {
    event.preventDefault();
    if (!selectedGroup) return;
    const payload = { ...optionForm, price: Number(optionForm.price), description: optionForm.description || null, image_url: optionForm.image_url || null, position: editingOption?.position ?? selectedOptions.length, updated_at: editingOption?.updated_at };
    setBusy(true); setError("");
    const result = editingOption
      ? await updateMenuOption(editingOption.id, selectedGroup.id, organizerId, payload)
      : await createMenuOption(selectedGroup.id, organizerId, payload);
    setBusy(false);
    if (!result.success) { setError(result.error || t("changedReload")); return; }
    setEditingOption(null); setCreatingOption(false); onChanged?.();
  }

  async function removeOption(optionId: string) {
    if (!selectedGroup) return;
    setBusy(true); setError("");
    const result = await deleteMenuOption(optionId, selectedGroup.id, organizerId);
    setBusy(false);
    if (!result.success) { setError(result.error || "Failed to delete option"); return; }
    setDeleteOptionId(null); onChanged?.();
  }

  async function moveOption(optionId: string, direction: -1 | 1) {
    const index = selectedOptions.findIndex((option) => option.id === optionId);
    if (index < 0 || index + direction < 0 || index + direction >= selectedOptions.length || !selectedGroup) return;
    const ordered = [...selectedOptions];
    [ordered[index], ordered[index + direction]] = [ordered[index + direction], ordered[index]];
    setBusy(true); setError("");
    const result = await reorderMenuOptions(selectedGroup.id, organizerId, ordered.map((option) => ({ id: option.id, updated_at: option.updated_at })));
    setBusy(false);
    if (!result.success) { setError(result.error || t("changedReload")); return; }
    onChanged?.();
  }

  async function dropOption(targetId: string) {
    if (!draggedOption || draggedOption === targetId || !selectedGroup) return;
    const ordered = [...selectedOptions];
    const from = ordered.findIndex((option) => option.id === draggedOption);
    const to = ordered.findIndex((option) => option.id === targetId);
    const [moving] = ordered.splice(from, 1);
    ordered.splice(to, 0, moving);
    setDraggedOption(null); setBusy(true); setError("");
    const result = await reorderMenuOptions(selectedGroup.id, organizerId, ordered.map((option) => ({ id: option.id, updated_at: option.updated_at })));
    setBusy(false);
    if (!result.success) { setError(result.error || t("changedReload")); return; }
    onChanged?.();
  }

  const losingItems = assignments.filter((assignment) => assignment.group_id === deleteGroupId).map((assignment) => itemNames.get(assignment.item_id) || assignment.item_id);
  const hasOtherVariantDefault = selectedGroup?.kind === "variant" && selectedOptions.some((option) => option.is_default && option.id !== editingOption?.id);

  return (
    <section className="space-y-5" aria-labelledby="menu-option-library-heading">
      <header className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div><h2 id="menu-option-library-heading" className="text-lg font-semibold">{t("library")}</h2><p className="text-sm text-muted-foreground">{t("libraryHelp")}</p></div>
        {canEdit && <div className="flex flex-wrap gap-2">
          <label className="flex min-h-11 items-center gap-2 text-sm"><span>{t("templateTitle")}</span><select className="h-11 rounded-md border bg-background px-2" value={selectedTemplate} onChange={(event) => setSelectedTemplate(event.target.value)}>{templates.map((template) => <option key={template.id} value={template.id}>{template.name}</option>)}</select></label>
          <Button className="min-h-11" type="button" onClick={() => { setGroupForm({ templateId: selectedTemplate, name: "", kind: "addon", is_required: false, min_select: 0, max_select: 1 }); setNotice(""); }}>{t("startFromTemplate")}</Button>
          <Button className="min-h-11" type="button" variant="outline" onClick={startScratch}>{t("startFromScratch")}</Button>
        </div>}
      </header>

      {groupForm && <form className="space-y-3 border-t pt-4" onSubmit={saveGroup}>
        <h3 className="font-medium">{groupForm.id ? t("editGroup") : t("createGroup")}</h3>
        {!groupForm.id && groupForm.templateId && <p className="text-sm text-muted-foreground">{t("templateTitle")}: {templates.find((entry) => entry.id === groupForm.templateId)?.name}</p>}
        <div className="grid gap-3 sm:grid-cols-2">
          <div className="space-y-1"><Label htmlFor="option-group-name">{t("groupName")}</Label><Input id="option-group-name" value={groupForm.name} onChange={(event) => setGroupForm({ ...groupForm, name: event.target.value })} maxLength={80} required /></div>
          <div className="space-y-1"><Label htmlFor="option-group-kind">{t("kind")}</Label><select id="option-group-kind" className="h-11 w-full rounded-md border bg-background px-3" value={groupForm.kind} onChange={(event) => {
            const kind = event.target.value as "variant" | "addon";
            setGroupForm({ ...groupForm, kind, is_required: kind === "variant" ? true : groupForm.is_required, min_select: kind === "variant" ? 1 : groupForm.min_select, max_select: kind === "variant" ? 1 : groupForm.max_select });
          }}><option value="addon">{t("addon")}</option><option value="variant">{t("variant")}</option></select></div>
        </div>
        <label className="flex min-h-11 items-center gap-2 text-sm"><Switch checked={groupForm.kind === "variant" || groupForm.is_required} disabled={groupForm.kind === "variant"} onCheckedChange={(checked) => setGroupForm({ ...groupForm, is_required: checked, min_select: checked ? Math.max(1, groupForm.min_select) : groupForm.min_select })} />{t("required")}</label>
        {groupForm.kind !== "variant" && <div className="grid gap-3 sm:grid-cols-2">
          <label className="space-y-1 text-sm"><span>{t("minimum")}</span><Input type="number" min={groupForm.is_required ? 1 : 0} max={MENU_OPTION_LIMIT} value={groupForm.min_select} onChange={(event) => setGroupForm({ ...groupForm, min_select: Number(event.target.value), max_select: Math.max(Number(event.target.value), groupForm.max_select) })} /></label>
          <label className="space-y-1 text-sm"><span>{t("maximum")} · {groupForm.max_select === 1 ? t("single") : t("multiple")}</span><Input type="number" min={1} max={MENU_OPTION_LIMIT} value={groupForm.max_select} onChange={(event) => setGroupForm({ ...groupForm, max_select: Number(event.target.value) })} /></label>
        </div>}
        {groupForm.kind === "variant" && <p className="text-sm text-muted-foreground">{t("required")} · {t("single")}</p>}
        {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
        <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy}>{t("createGroup")}</Button><Button className="min-h-11" type="button" variant="outline" onClick={() => setGroupForm(null)}>{t("startFromScratch")}</Button></div>
      </form>}

      {notice && <p role="status" className="rounded-lg bg-muted p-3 text-sm">{notice}</p>}
      {groups.length === 0 ? <p className="py-4 text-sm text-muted-foreground">{t("noGroups")}</p> : <div className="grid gap-3 lg:grid-cols-2">
        {groups.map((group) => {
          const count = options.filter((option) => option.group_id === group.id).length;
          const rule = group.is_required ? t("ruleRequired", { max: group.max_select }) : t("ruleOptional", { max: group.max_select });
          return <article key={group.id} className={`space-y-3 rounded-xl border p-4 ${!group.is_active ? "opacity-70" : ""}`}>
            <div className="flex items-start justify-between gap-2"><div><h3 className="font-medium">{group.name}</h3><p className="text-sm text-muted-foreground">{group.kind === "variant" ? t("variant") : t("addon")} · {rule} · {count} {t("options")} · {groupCounts.get(group.id) || 0} {t("usage")}</p></div><span className="text-xs">{group.is_active ? t("active") : t("inactive")}</span></div>
            <div className="flex flex-wrap gap-2">
              <Button className="min-h-11" type="button" variant="outline" onClick={() => { setSelectedGroupId(group.id); setCreatingOption(false); setEditingOption(null); }}>{t("options")}</Button>
              {canEdit && <>
                <Button className="min-h-11" type="button" variant="outline" onClick={() => setGroupForm({ id: group.id, name: group.name, kind: group.kind, is_required: group.is_required, min_select: group.min_select, max_select: group.max_select, updated_at: group.updated_at })}>{t("editGroup")}</Button>
                <Button className="min-h-11" type="button" variant="outline" onClick={() => void toggleActive(group)}>{group.is_active ? t("deactivate") : t("activate")}</Button>
                <Button className="min-h-11" type="button" variant="outline" onClick={() => void duplicate(group)}>{t("duplicate")}</Button>
              </>}
              {canDelete && <Button className="min-h-11" type="button" variant="destructive" onClick={() => setDeleteGroupId(group.id)}>{t("deleteGroup")}</Button>}
            </div>
            {deleteGroupId === group.id && <div className="space-y-2 rounded-lg border border-destructive/40 bg-muted p-3" role="alertdialog" aria-labelledby={`delete-group-${group.id}`}>
              <p id={`delete-group-${group.id}`} className="text-sm font-medium">{t("deleteGroupConfirm")}</p>
              {losingItems.length ? <ul className="list-inside list-disc text-sm">{losingItems.map((name, index) => <li key={`${name}-${index}`}>{name}</li>)}</ul> : <p className="text-sm">{t("noAssignments")}</p>}
              <div className="flex gap-2"><Button className="min-h-11" type="button" variant="destructive" disabled={busy} onClick={() => void removeGroup(group.id)}>{t("deleteGroup")}</Button><Button className="min-h-11" type="button" variant="outline" onClick={() => setDeleteGroupId(null)}>{t("startFromScratch")}</Button></div>
            </div>}
          </article>;
        })}
      </div>}

      {selectedGroup && <section className="space-y-4 border-t pt-4" aria-labelledby="option-editor-heading">
        <header className="flex flex-wrap items-center justify-between gap-2"><div><h3 id="option-editor-heading" className="font-semibold">{selectedGroup.name} · {t("options")}</h3><p className="text-sm text-muted-foreground">{selectedOptions.length}/{MENU_OPTION_LIMIT} {t("options")}</p></div><Button className="min-h-11" type="button" variant="outline" onClick={() => setSelectedGroupId(null)}>{t("close")}</Button></header>
        {selectedOptions.length >= MENU_OPTION_LIMIT ? <p role="status" className="rounded-lg bg-muted p-3 text-sm">{t("atLimit")}</p> : canEdit && <Button className="min-h-11" type="button" onClick={() => startOption()}>{t("addOption")}</Button>}
        {selectedOptions.map((option, index) => <div key={option.id} draggable={canEdit} onDragStart={() => setDraggedOption(option.id)} onDragOver={(event) => event.preventDefault()} onDrop={() => void dropOption(option.id)} className="flex flex-col gap-3 border-t border-border py-3 first:border-t-0 first:pt-0 sm:flex-row sm:items-center sm:justify-between">
          <div><p className="font-medium">{option.name} {option.is_default && <span className="text-xs text-muted-foreground">· {t("defaultOption")}</span>}</p><p className="text-sm text-muted-foreground">{selectedGroup.kind === "variant" ? t("price") : t("extraCharge")}: {Number(option.price).toFixed(2)} {option.is_available ? "" : `· ${t("soldOutToday")}`}</p></div>
          <div className="flex flex-wrap gap-2">
            {canEdit && <><Button className="min-h-11" type="button" variant="outline" disabled={index === 0 || busy} onClick={() => void moveOption(option.id, -1)} aria-label={`${t("moveUp")}: ${option.name}`}>{t("moveUp")}</Button>
            <Button className="min-h-11" type="button" variant="outline" disabled={index === selectedOptions.length - 1 || busy} onClick={() => void moveOption(option.id, 1)} aria-label={`${t("moveDown")}: ${option.name}`}>{t("moveDown")}</Button></>}
            {canEdit && <Button className="min-h-11" type="button" variant="outline" onClick={() => startOption(option)}>{t("editOption")}</Button>}
            {canDelete ? <Button className="min-h-11" type="button" variant="destructive" onClick={() => setDeleteOptionId(option.id)}>{t("deleteOption")}</Button> : canEdit ? <Button className="min-h-11" type="button" variant="outline" disabled={busy || !option.is_available} onClick={async () => {
              setBusy(true); setError("");
              const result = await updateMenuOption(option.id, selectedGroup.id, organizerId, { is_available: false, updated_at: option.updated_at });
              setBusy(false);
              if (!result.success) setError(result.error || t("changedReload")); else onChanged?.();
            }}>{t("markUnavailable")}</Button> : null}
          </div>
          {deleteOptionId === option.id && canDelete && <div className="w-full rounded-lg bg-muted p-3 text-sm"><p>{t("deleteOption")} · {option.name}?</p><div className="mt-2 flex gap-2"><Button className="min-h-11" type="button" variant="destructive" disabled={busy} onClick={() => void removeOption(option.id)}>{t("deleteOption")}</Button><Button className="min-h-11" type="button" variant="outline" onClick={() => setDeleteOptionId(null)}>{t("startFromScratch")}</Button></div></div>}
        </div>)}
        {(creatingOption || editingOption) && canEdit && <form onSubmit={saveOption} className="space-y-3 border-t border-border pt-4">
          <h4 className="font-medium">{editingOption ? t("editOption") : t("addOption")}</h4>
          <div className="grid gap-3 sm:grid-cols-2"><label className="space-y-1 text-sm"><span>{t("optionName")}</span><Input value={optionForm.name} onChange={(event) => setOptionForm({ ...optionForm, name: event.target.value })} maxLength={80} required /></label>
            <label className="space-y-1 text-sm"><span>{selectedGroup.kind === "variant" ? t("price") : t("extraCharge")}</span><Input type="number" min="0" max="999999.99" step="0.01" value={optionForm.price} onChange={(event) => setOptionForm({ ...optionForm, price: event.target.value })} required /></label></div>
          <label className="block space-y-1 text-sm"><span>{t("description")}</span><Textarea value={optionForm.description} onChange={(event) => setOptionForm({ ...optionForm, description: event.target.value })} maxLength={200} rows={2} /></label>
          <div className="space-y-1"><Label>{t("optionName")} image</Label><MediaUploadField label={`${t("optionName")} image`} tenantId={tenantId} folderSubpath="menu-options" value={optionForm.image_url} onChange={(image_url) => setOptionForm({ ...optionForm, image_url: image_url || "" })} /></div>
          <div className="grid gap-3 sm:grid-cols-2">
            <label className="flex min-h-11 items-center gap-2 text-sm"><Switch checked={optionForm.is_default} disabled={Boolean(hasOtherVariantDefault)} onCheckedChange={(is_default) => setOptionForm({ ...optionForm, is_default })} />{t("defaultOption")}</label>
            <label className="space-y-1 text-sm"><span>{t("maxQty")}</span><Input type="number" min="1" max="10" step="1" value={optionForm.max_qty} onChange={(event) => setOptionForm({ ...optionForm, max_qty: Number(event.target.value) })} /></label>
            <label className="flex min-h-11 items-center gap-2 text-sm"><Switch checked={optionForm.is_available} onCheckedChange={(is_available) => setOptionForm({ ...optionForm, is_available })} />{t("available")} / {t("soldOutToday")}</label>
          </div>
          {selectedGroup.kind === "addon" && optionForm.is_default && Number(optionForm.price) > 0 && <p className="rounded-lg bg-amber-50 p-3 text-sm text-amber-800 dark:bg-amber-950 dark:text-amber-200">{t("paidDefaultWarning")}</p>}
          <p className="text-xs text-muted-foreground">{t("defaultSelectionHelp")}</p>
          <fieldset className="space-y-2"><legend className="text-sm font-medium">{t("allergens")}</legend><div className="flex flex-wrap gap-2">{MENU_ALLERGENS.map((allergen) => <label key={allergen} className="flex min-h-11 items-center gap-2 rounded-md border px-3 text-sm"><input type="checkbox" checked={optionForm.allergens.includes(allergen)} onChange={(event) => setOptionForm({ ...optionForm, allergens: event.target.checked ? [...optionForm.allergens, allergen] : optionForm.allergens.filter((value) => value !== allergen) })} />{allergen}</label>)}</div><p className="text-xs text-amber-700">{t("allergenNote")}</p></fieldset>
          <div className="border-t border-border pt-3"><h5 className="text-sm font-medium">{t("preview")}</h5><div className="mt-2 flex items-center justify-between gap-3">{optionForm.image_url && <Image src={optionForm.image_url} alt="" width={56} height={56} unoptimized className="h-14 w-14 rounded-lg object-cover" />}<div className="min-w-0 flex-1"><p className="font-medium">{optionForm.name || t("optionName")}</p>{optionForm.description && <p className="text-sm text-muted-foreground">{optionForm.description}</p>}</div><span className="text-sm">{Number(optionForm.price || 0).toFixed(2)}</span></div></div>
          {error && <p role="alert" className="text-sm text-destructive">{error}</p>}
          <div className="flex flex-wrap gap-2"><Button className="min-h-11" type="submit" disabled={busy}>{t("save")}</Button><Button className="min-h-11" type="button" variant="outline" onClick={() => { setCreatingOption(false); setEditingOption(null); }}>{t("startFromScratch")}</Button></div>
        </form>}
      </section>}
      {error && !groupForm && <p role="alert" className="text-sm text-destructive">{error}</p>}
    </section>
  );
}
