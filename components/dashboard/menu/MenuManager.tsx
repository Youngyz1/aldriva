"use client";
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MenuSectionForm } from "./MenuSectionForm";
import { MenuItemForm } from "./MenuItemForm";
import { deleteMenuSection, deleteMenuItem, reorderMenuSections, reorderMenuItems } from "@/lib/actions/menus";
import { useRouter } from "next/navigation";
import {
  IconChevronUp as ChevronUp,
  IconChevronDown as ChevronDown,
  IconPlus as Plus,
  IconTrash as Trash2,
  IconPencil as Pencil,
  IconStar as Star,
} from "@tabler/icons-react";
import { listMenuOptionGroups } from "@/lib/actions/menu-option-groups";
import { MenuOptionGroupsLibrary } from "./MenuOptionGroupsLibrary";

export function MenuManager({
  organizerId,
  sections,
  itemsBySection,
  tenantId,
  canEdit,
  canDelete,
  onSaved,
  onDeleted,
  onChanged,
  defaultSectionName,
}: {
  organizerId: string;
  sections: any[];
  itemsBySection: Record<string, any[]>;
  tenantId: string;
  canEdit: boolean;
  canDelete: boolean;
  onSaved?: () => void;
  onDeleted?: () => void;
  onChanged?: () => void;
  defaultSectionName?: string;
}) {
  const router = useRouter();
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [showFirstDishForm, setShowFirstDishForm] = useState(false);
  const [editingSection, setEditingSection] = useState<any | null>(null);
  const [deleteSection, setDeleteSection] = useState<any | null>(null);
  const [activeItemSection, setActiveItemSection] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [deleteItem, setDeleteItem] = useState<{item:any, sectionId:string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [view, setView] = useState<"menu" | "options">("menu");
  const [optionData, setOptionData] = useState<{ groups: any[]; options: any[]; assignments: any[] }>({ groups: [], options: [], assignments: [] });

  const refreshOptionData = useCallback(async () => {
    const result = await listMenuOptionGroups(organizerId);
    if (result.success) setOptionData(result.data);
  }, [organizerId]);
  useEffect(() => { void refreshOptionData(); }, [refreshOptionData]);

  const sortedSections = [...sections].sort((a,b)=> a.position-b.position || a.created_at.localeCompare(b.created_at));

  async function handleDeleteSection() {
    if (!deleteSection) return;
    setPending(true); setError(null);
    const res = await deleteMenuSection(deleteSection.id, organizerId);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    setDeleteSection(null);
    router.refresh();
    onDeleted?.();
    onChanged?.();
  }
  async function handleDeleteItem() {
    if (!deleteItem) return;
    setPending(true); setError(null);
    const res = await deleteMenuItem(deleteItem.item.id, deleteItem.sectionId, organizerId);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    setDeleteItem(null);
    router.refresh();
    onDeleted?.();
    onChanged?.();
  }
  async function handleMoveSection(idx:number, dir:-1|1) {
    const ids = sortedSections.map(s=>s.id);
    const tmp = ids[idx]; ids[idx]=ids[idx+dir]; ids[idx+dir]=tmp;
    const res = await reorderMenuSections(organizerId, ids);
    if (!res.success) setError(res.error || "Failed to reorder");
    else {
      router.refresh();
      onChanged?.();
    }
  }
  async function handleMoveItem(sectionId:string, idx:number, dir:-1|1) {
    const items = [...(itemsBySection[sectionId]||[])].sort((a,b)=>a.position-b.position);
    const ids = items.map(i=>i.id);
    const tmp = ids[idx]; ids[idx]=ids[idx+dir]; ids[idx+dir]=tmp;
    const res = await reorderMenuItems(sectionId, organizerId, ids);
    if (!res.success) setError(res.error || "Failed");
    else {
      router.refresh();
      onChanged?.();
    }
  }

  return (
    <div className="space-y-6">
      <nav className="flex flex-wrap gap-2" aria-label="Menu management">
        <Button type="button" className="min-h-11" variant={view === "menu" ? "default" : "outline"} aria-pressed={view === "menu"} onClick={() => setView("menu")}>Menu items</Button>
        <Button type="button" className="min-h-11" variant={view === "options" ? "default" : "outline"} aria-pressed={view === "options"} onClick={() => setView("options")}>Option groups</Button>
      </nav>
      {view === "options" ? (
        <MenuOptionGroupsLibrary
          organizerId={organizerId}
          tenantId={tenantId}
          groups={optionData.groups}
          options={optionData.options}
          assignments={optionData.assignments}
          items={Object.values(itemsBySection).flat().map((item: any) => ({ id: item.id, name: item.name }))}
          canEdit={canEdit}
          canDelete={canDelete}
          onChanged={() => { void refreshOptionData(); router.refresh(); onChanged?.(); }}
        />
      ) : <>
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Sections</h2>
        {canEdit && <Button size="sm" onClick={()=>{setEditingSection(null); setShowSectionForm(true);}}><Plus className="h-4 w-4 mr-1"/>New Section</Button>}
      </div>
      {showSectionForm && (
        <div className="border-t border-zinc-200 pt-4">
          <MenuSectionForm
            organizerId={organizerId}
            section={editingSection}
            onSaved={() => {
              setShowSectionForm(false);
              setEditingSection(null);
              router.refresh();
              onSaved?.();
              onChanged?.();
            }}
            onCancel={() => {
              setShowSectionForm(false);
              setEditingSection(null);
            }}
          />
        </div>
      )}
      {sortedSections.length===0 ? (
        <div className="space-y-3 py-8 text-center">
          <p className="text-sm text-zinc-600">No sections or items yet.</p>
          {canEdit && !showFirstDishForm && (
            <div className="flex justify-center gap-2">
              <Button size="sm" onClick={() => setShowFirstDishForm(true)}>
                <Plus className="h-4 w-4 mr-1" />
                Add your first dish
              </Button>
            </div>
          )}
          {showFirstDishForm && canEdit && (
            <div className="border-t border-zinc-200 pt-4 text-left">
              <MenuItemForm
                organizerId={organizerId}
                tenantId={tenantId}
                defaultSectionName={defaultSectionName}
                optionGroups={optionData.groups}
                optionOptions={optionData.options}
                optionAssignments={optionData.assignments}
                onOptionGroupsChanged={() => { void refreshOptionData(); }}
                onSaved={() => {
                  setShowFirstDishForm(false);
                  router.refresh();
                  onSaved?.();
                  onChanged?.();
                }}
                onCancel={() => setShowFirstDishForm(false)}
              />
            </div>
          )}
        </div>
      ) : (
        <div>
          {sortedSections.map((sec, secIdx)=> {
            const items = [...(itemsBySection[sec.id]||[])].sort((a,b)=>a.position-b.position);
            return (
              <section key={sec.id} aria-labelledby={`menu-section-${sec.id}`} className="space-y-4 border-t border-zinc-200 py-4 first:border-t-0 first:pt-0">
                <header className="flex items-center justify-between gap-3">
                  <div className="min-w-0">
                    <h3 id={`menu-section-${sec.id}`} className="break-words font-medium">{sec.name} {sec.is_active? "": "(Inactive)"}</h3>
                    {sec.description && <div className="text-sm text-zinc-600">{sec.description}</div>}
                  </div>
                  <div className="flex shrink-0 gap-1">
                    {canEdit && <>
                      <Button variant="ghost" size="icon" aria-label={`Move ${sec.name} up`} disabled={secIdx===0} onClick={()=>handleMoveSection(secIdx,-1)}><ChevronUp className="h-4 w-4"/></Button>
                      <Button variant="ghost" size="icon" aria-label={`Move ${sec.name} down`} disabled={secIdx===sortedSections.length-1} onClick={()=>handleMoveSection(secIdx,1)}><ChevronDown className="h-4 w-4"/></Button>
                      <Button variant="outline" size="sm" aria-label={`Edit ${sec.name}`} onClick={()=>{setEditingSection(sec); setShowSectionForm(true);}}><Pencil className="h-4 w-4"/></Button>
                    </>}
                    {canDelete && <Button variant="ghost" size="icon" aria-label={`Delete ${sec.name}`} onClick={()=>setDeleteSection(sec)}><Trash2 className="h-4 w-4 text-red-600"/></Button>}
                  </div>
                </header>
                <div>
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Items ({items.length})</span>
                    {canEdit && <Button size="sm" variant="outline" onClick={()=> setActiveItemSection(activeItemSection===sec.id? null: sec.id)}><Plus className="h-4 w-4 mr-1"/>{activeItemSection===sec.id? "Cancel":"Add Item"}</Button>}
                  </div>
                  {activeItemSection===sec.id && canEdit && (
                    <div className="mb-4 border-b border-zinc-200 pb-4">
                      <MenuItemForm
                        sectionId={sec.id}
                        organizerId={organizerId}
                        tenantId={tenantId}
                        optionGroups={optionData.groups}
                        optionOptions={optionData.options}
                        optionAssignments={optionData.assignments}
                        onOptionGroupsChanged={() => { void refreshOptionData(); }}
                        onSaved={() => {
                          setActiveItemSection(null);
                          router.refresh();
                          onSaved?.();
                          onChanged?.();
                        }}
                        onCancel={() => setActiveItemSection(null)}
                      />
                    </div>
                  )}
                  {editingItem && editingItem.sectionId===sec.id && canEdit && (
                    <div className="mb-4 border-b border-zinc-200 pb-4">
                      <MenuItemForm
                        sectionId={sec.id}
                        organizerId={organizerId}
                        tenantId={tenantId}
                        item={editingItem}
                        optionGroups={optionData.groups}
                        optionOptions={optionData.options}
                        optionAssignments={optionData.assignments}
                        onOptionGroupsChanged={() => { void refreshOptionData(); }}
                        onSaved={() => {
                          setEditingItem(null);
                          router.refresh();
                          onSaved?.();
                          onChanged?.();
                        }}
                        onCancel={() => setEditingItem(null)}
                      />
                    </div>
                  )}
                  {items.length===0 ? <div className="text-sm text-zinc-600">No items.</div> : (
                    <div className="divide-y divide-zinc-200">
                      {items.map((it, idx)=> (
                        <div key={it.id} className="flex flex-col gap-2 py-3 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                          <div className="min-w-0">
                            <div className="text-base font-medium">{it.name} {it.is_featured && <Star className="inline h-4 w-4 text-orange-600" role="img" aria-label="Featured" />} {it.is_active? "":"(Inactive)"}</div>
                            <div className="text-sm text-zinc-600">${Number(it.price).toFixed(2)}</div>
                          </div>
                          <div className="flex flex-wrap gap-1 self-end sm:shrink-0 sm:flex-nowrap sm:self-auto">
                            {canEdit && <>
                              <Button variant="ghost" size="icon" aria-label={`Move ${it.name} up`} disabled={idx===0} onClick={()=>handleMoveItem(sec.id, idx,-1)}><ChevronUp className="h-4 w-4"/></Button>
                              <Button variant="ghost" size="icon" aria-label={`Move ${it.name} down`} disabled={idx===items.length-1} onClick={()=>handleMoveItem(sec.id, idx,1)}><ChevronDown className="h-4 w-4"/></Button>
                              <Button variant="outline" size="sm" onClick={()=> setEditingItem({...it, sectionId: sec.id})}>Edit</Button>
                            </>}
                            {canDelete && <Button variant="ghost" size="icon" aria-label={`Delete ${it.name}`} onClick={()=> setDeleteItem({item:it, sectionId:sec.id})}><Trash2 className="h-4 w-4 text-red-600"/></Button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </section>
            );
          })}
        </div>
      )}
      <ConfirmDialog open={!!deleteSection} onOpenChange={(o)=> !o && setDeleteSection(null)} title="Delete section?" description="Items inside this section will be deleted too." confirmLabel="Delete" variant="destructive" onConfirm={handleDeleteSection} loading={pending} />
      <ConfirmDialog open={!!deleteItem} onOpenChange={(o)=> !o && setDeleteItem(null)} title="Delete item?" description="This will permanently delete the item." confirmLabel="Delete" variant="destructive" onConfirm={handleDeleteItem} loading={pending} />
      {error && <div className="text-sm text-red-600">{error}</div>}
      </>}
    </div>
  );
}
