"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { MenuSectionForm } from "./MenuSectionForm";
import { MenuItemForm } from "./MenuItemForm";
import { deleteMenuSection, deleteMenuItem, reorderMenuSections, reorderMenuItems } from "@/lib/actions/menus";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Plus, Trash2, Pencil } from "lucide-react";

export function MenuManager({ organizerId, sections, itemsBySection, tenantId, canEdit, canDelete }: { organizerId: string; sections: any[]; itemsBySection: Record<string, any[]>; tenantId: string; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [showSectionForm, setShowSectionForm] = useState(false);
  const [editingSection, setEditingSection] = useState<any | null>(null);
  const [deleteSection, setDeleteSection] = useState<any | null>(null);
  const [activeItemSection, setActiveItemSection] = useState<string | null>(null);
  const [editingItem, setEditingItem] = useState<any | null>(null);
  const [deleteItem, setDeleteItem] = useState<{item:any, sectionId:string} | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const sortedSections = [...sections].sort((a,b)=> a.position-b.position || a.created_at.localeCompare(b.created_at));

  async function handleDeleteSection() {
    if (!deleteSection) return;
    setPending(true); setError(null);
    const res = await deleteMenuSection(deleteSection.id, organizerId);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    setDeleteSection(null); router.refresh();
  }
  async function handleDeleteItem() {
    if (!deleteItem) return;
    setPending(true); setError(null);
    const res = await deleteMenuItem(deleteItem.item.id, deleteItem.sectionId, organizerId);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    setDeleteItem(null); router.refresh();
  }
  async function handleMoveSection(idx:number, dir:-1|1) {
    const ids = sortedSections.map(s=>s.id);
    const tmp = ids[idx]; ids[idx]=ids[idx+dir]; ids[idx+dir]=tmp;
    const res = await reorderMenuSections(organizerId, ids);
    if (!res.success) setError(res.error || "Failed to reorder");
    else router.refresh();
  }
  async function handleMoveItem(sectionId:string, idx:number, dir:-1|1) {
    const items = [...(itemsBySection[sectionId]||[])].sort((a,b)=>a.position-b.position);
    const ids = items.map(i=>i.id);
    const tmp = ids[idx]; ids[idx]=ids[idx+dir]; ids[idx+dir]=tmp;
    const res = await reorderMenuItems(sectionId, organizerId, ids);
    if (!res.success) setError(res.error || "Failed");
    else router.refresh();
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h2 className="font-medium">Sections</h2>
        {canEdit && <Button size="sm" onClick={()=>{setEditingSection(null); setShowSectionForm(true);}}><Plus className="h-4 w-4 mr-1"/>New Section</Button>}
      </div>
      {showSectionForm && (
        <div className="rounded-xl border p-4 bg-zinc-50">
          <MenuSectionForm organizerId={organizerId} section={editingSection} onSaved={()=>{setShowSectionForm(false); setEditingSection(null); router.refresh();}} onCancel={()=>{setShowSectionForm(false); setEditingSection(null);}} />
        </div>
      )}
      {sortedSections.length===0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center text-sm text-zinc-500">No sections yet.</div>
      ) : (
        <div className="space-y-4">
          {sortedSections.map((sec, secIdx)=> {
            const items = [...(itemsBySection[sec.id]||[])].sort((a,b)=>a.position-b.position);
            return (
              <div key={sec.id} className="rounded-xl border p-4 shadow-xs">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="font-medium">{sec.name} {sec.is_active? "": "(Inactive)"}</div>
                    {sec.description && <div className="text-sm text-zinc-500">{sec.description}</div>}
                  </div>
                  <div className="flex gap-1">
                    {canEdit && <>
                      <Button variant="ghost" size="icon" disabled={secIdx===0} onClick={()=>handleMoveSection(secIdx,-1)}><ChevronUp className="h-4 w-4"/></Button>
                      <Button variant="ghost" size="icon" disabled={secIdx===sortedSections.length-1} onClick={()=>handleMoveSection(secIdx,1)}><ChevronDown className="h-4 w-4"/></Button>
                      <Button variant="outline" size="sm" onClick={()=>{setEditingSection(sec); setShowSectionForm(true);}}><Pencil className="h-4 w-4"/></Button>
                    </>}
                    {canDelete && <Button variant="ghost" size="icon" onClick={()=>setDeleteSection(sec)}><Trash2 className="h-4 w-4 text-red-600"/></Button>}
                  </div>
                </div>
                <div className="mt-4">
                  <div className="flex items-center justify-between mb-2">
                    <span className="text-sm font-medium">Items ({items.length})</span>
                    {canEdit && <Button size="sm" variant="outline" onClick={()=> setActiveItemSection(activeItemSection===sec.id? null: sec.id)}><Plus className="h-4 w-4 mr-1"/>{activeItemSection===sec.id? "Cancel":"Add Item"}</Button>}
                  </div>
                  {activeItemSection===sec.id && canEdit && (
                    <div className="mb-3 rounded-lg border p-3 bg-zinc-50">
                      <MenuItemForm sectionId={sec.id} organizerId={organizerId} tenantId={tenantId} onSaved={()=>{setActiveItemSection(null); router.refresh();}} onCancel={()=> setActiveItemSection(null)} />
                    </div>
                  )}
                  {editingItem && editingItem.sectionId===sec.id && canEdit && (
                    <div className="mb-3 rounded-lg border p-3 bg-zinc-50">
                      <MenuItemForm sectionId={sec.id} organizerId={organizerId} tenantId={tenantId} item={editingItem} onSaved={()=>{setEditingItem(null); router.refresh();}} onCancel={()=> setEditingItem(null)} />
                    </div>
                  )}
                  {items.length===0 ? <div className="text-xs text-zinc-400">No items.</div> : (
                    <div className="space-y-2">
                      {items.map((it, idx)=> (
                        <div key={it.id} className="rounded-lg border px-3 py-2 flex items-center justify-between">
                          <div>
                            <div className="text-sm font-medium">{it.name} {it.is_featured && <span className="text-amber-600">★</span>} {it.is_active? "":"(Inactive)"}</div>
                            <div className="text-xs text-zinc-500">${Number(it.price).toFixed(2)}</div>
                          </div>
                          <div className="flex gap-1">
                            {canEdit && <>
                              <Button variant="ghost" size="icon" disabled={idx===0} onClick={()=>handleMoveItem(sec.id, idx,-1)}><ChevronUp className="h-4 w-4"/></Button>
                              <Button variant="ghost" size="icon" disabled={idx===items.length-1} onClick={()=>handleMoveItem(sec.id, idx,1)}><ChevronDown className="h-4 w-4"/></Button>
                              <Button variant="outline" size="sm" onClick={()=> setEditingItem({...it, sectionId: sec.id})}>Edit</Button>
                            </>}
                            {canDelete && <Button variant="ghost" size="icon" onClick={()=> setDeleteItem({item:it, sectionId:sec.id})}><Trash2 className="h-4 w-4 text-red-600"/></Button>}
                          </div>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
      <ConfirmDialog open={!!deleteSection} onOpenChange={(o)=> !o && setDeleteSection(null)} title="Delete section?" description="Items inside this section will be deleted too." confirmLabel="Delete" variant="destructive" onConfirm={handleDeleteSection} loading={pending} />
      <ConfirmDialog open={!!deleteItem} onOpenChange={(o)=> !o && setDeleteItem(null)} title="Delete item?" description="This will permanently delete the item." confirmLabel="Delete" variant="destructive" onConfirm={handleDeleteItem} loading={pending} />
      {error && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
