"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { createServiceTier, updateServiceTier, deleteServiceTier, reorderServiceTiers } from "@/lib/actions/services";
import { useRouter } from "next/navigation";
import { ChevronUp, ChevronDown, Plus, Trash2 } from "lucide-react";

export function TierManager({ serviceId, organizerId, tiers, canEdit, canDelete }: { serviceId: string; organizerId: string; tiers: any[]; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [showForm, setShowForm] = useState(false);
  const [editing, setEditing] = useState<any | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [price, setPrice] = useState("");
  const [duration, setDuration] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  function openCreate() {
    setEditing(null);
    setName(""); setDescription(""); setPrice(""); setDuration(""); setIsActive(true);
    setShowForm(true);
  }
  function openEdit(tier: any) {
    setEditing(tier);
    setName(tier.name); setDescription(tier.description || ""); setPrice(String(tier.price)); setDuration(tier.duration_minutes ? String(tier.duration_minutes) : ""); setIsActive(tier.is_active);
    setShowForm(true);
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true); setError(null);
    const payload: any = { name, description: description || null, price: Number(price), duration_minutes: duration ? Number(duration) : null, is_active: isActive };
    const res = editing ? await updateServiceTier(editing.id, serviceId, organizerId, payload) : await createServiceTier(serviceId, organizerId, payload);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    setShowForm(false); router.refresh();
  }

  async function handleDelete() {
    if (!deleteTarget) return;
    setPending(true);
    const res = await deleteServiceTier(deleteTarget.id, serviceId, organizerId);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    setDeleteTarget(null); router.refresh();
  }

  async function handleMove(index: number, dir: -1 | 1) {
    const newOrder = [...tiers].sort((a,b)=> a.position-b.position || a.created_at.localeCompare(b.created_at));
    const from = index, to = index + dir;
    if (to < 0 || to >= newOrder.length) return;
    const ids = newOrder.map(t=>t.id);
    const tmp = ids[from]; ids[from]=ids[to]; ids[to]=tmp;
    setError(null);
    const res = await reorderServiceTiers(serviceId, organizerId, ids);
    if (!res.success) setError(res.error || "Failed to reorder");
    else router.refresh();
  }

  const sorted = [...tiers].sort((a,b)=> a.position-b.position || (a.created_at||"").localeCompare(b.created_at||""));

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h3 className="font-medium">Service Tiers {tiers.length >0 && `(${tiers.length})`}</h3>
        {canEdit && <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1"/>Add Tier</Button>}
      </div>
      {sorted.length===0 ? (
        <div className="rounded-xl border border-dashed p-6 text-center text-sm text-zinc-500">No tiers yet. A service can have zero tiers — simple service with base price is valid.</div>
      ) : (
        <div className="space-y-2">
          {sorted.map((tier, idx)=> (
            <div key={tier.id} className="rounded-xl border p-3 flex items-center justify-between">
              <div>
                <div className="font-medium text-sm">{tier.name} <span className="font-mono">${Number(tier.price).toFixed(2)}</span> {tier.duration_minutes? `· ${tier.duration_minutes} min`: ""} {tier.is_active? "" : "(Inactive)"}</div>
                {tier.description && <div className="text-xs text-zinc-500">{tier.description}</div>}
              </div>
              <div className="flex items-center gap-1">
                {canEdit && <>
                  <Button variant="ghost" size="icon" disabled={idx===0} onClick={()=>handleMove(idx,-1)}><ChevronUp className="h-4 w-4"/></Button>
                  <Button variant="ghost" size="icon" disabled={idx===sorted.length-1} onClick={()=>handleMove(idx,1)}><ChevronDown className="h-4 w-4"/></Button>
                  <Button variant="outline" size="sm" onClick={()=>openEdit(tier)}>Edit</Button>
                </>}
                {canDelete && <Button variant="ghost" size="icon" onClick={()=>setDeleteTarget(tier)}><Trash2 className="h-4 w-4 text-red-600"/></Button>}
              </div>
            </div>
          ))}
        </div>
      )}
      {showForm && (
        <form onSubmit={handleSubmit} className="rounded-xl border p-4 space-y-3 bg-zinc-50">
          <div className="space-y-2"><Label>Name *</Label><Input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required placeholder="Basic" /></div>
          <div className="space-y-2"><Label>Description</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} rows={2} /></div>
          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-2"><Label>Price *</Label><Input type="number" step="0.01" min={0} max={999999.99} value={price} onChange={e=>setPrice(e.target.value)} required /></div>
            <div className="space-y-2"><Label>Duration (min)</Label><Input type="number" min={5} max={1440} value={duration} onChange={e=>setDuration(e.target.value)} /></div>
          </div>
          <div className="flex items-center gap-2"><Switch checked={isActive} onCheckedChange={setIsActive} id="tier-active"/><Label htmlFor="tier-active">Active</Label></div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <div className="flex gap-2">
            <Button type="submit" disabled={pending}>{pending? "Saving...": editing? "Update Tier":"Create Tier"}</Button>
            <Button type="button" variant="outline" onClick={()=>setShowForm(false)}>Cancel</Button>
          </div>
        </form>
      )}
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o)=> !o && setDeleteTarget(null)} title="Delete tier?" description="This will permanently delete the tier." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={pending} />
      {error && !showForm && <div className="text-sm text-red-600">{error}</div>}
    </div>
  );
}
