"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteService, reorderServices } from "@/lib/actions/services";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { ChevronUp, ChevronDown, Trash2 } from "lucide-react";

export function ServicesManager({ organizerId, services, canEdit, canDelete }: { organizerId: string; services: any[]; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const sorted = [...services].sort((a,b)=> a.position-b.position || a.created_at.localeCompare(b.created_at));

  async function handleDelete() {
    if (!deleteTarget) return;
    setPending(true); setError(null);
    const res = await deleteService(deleteTarget.id, organizerId);
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    setDeleteTarget(null); router.refresh();
  }
  async function handleMove(idx:number, dir:-1|1) {
    const ids = sorted.map(s=>s.id);
    const tmp = ids[idx]; ids[idx]=ids[idx+dir]; ids[idx+dir]=tmp;
    const res = await reorderServices(organizerId, ids);
    if (!res.success) setError(res.error || "Failed");
    else router.refresh();
  }

  if (sorted.length===0) return <div className="rounded-xl border border-dashed p-12 text-center text-sm text-zinc-500">No services yet. Create your first service.</div>;

  return (
    <>
      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {sorted.map((s, idx)=> (
          <div key={s.id} className="rounded-xl border p-4 shadow-xs">
            <Link href={`/dashboard/org/${organizerId}/services/${s.id}`} className="block">
              <div className="font-medium">{s.title}</div>
              <div className="text-sm text-zinc-500 truncate">{s.description || "—"}</div>
              <div className="mt-2 text-sm font-mono">${Number(s.price).toFixed(2)} {s.duration_minutes ? `· ${s.duration_minutes} min` : ""}</div>
              <div className="mt-1 text-xs">{s.is_active ? "Active" : "Inactive"} · {s.slug}</div>
            </Link>
            <div className="mt-3 flex gap-1">
              {canEdit && <>
                <Button variant="ghost" size="icon" disabled={idx===0} onClick={()=>handleMove(idx,-1)}><ChevronUp className="h-4 w-4"/></Button>
                <Button variant="ghost" size="icon" disabled={idx===sorted.length-1} onClick={()=>handleMove(idx,1)}><ChevronDown className="h-4 w-4"/></Button>
              </>}
              {canDelete && <Button variant="ghost" size="icon" onClick={()=> setDeleteTarget(s)}><Trash2 className="h-4 w-4 text-red-600"/></Button>}
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o)=> !o && setDeleteTarget(null)} title="Delete service?" description="This will permanently delete the service and its tiers." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={pending} />
      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
    </>
  );
}
