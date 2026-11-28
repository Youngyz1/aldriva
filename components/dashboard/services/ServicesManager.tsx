"use client";
import Link from "next/link";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { deleteService, reorderServices } from "@/lib/actions/services";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { IconChevronUp as ChevronUp, IconChevronDown as ChevronDown, IconTrash as Trash2, IconPencil as Pencil } from "@tabler/icons-react";

type CategoryOption = { id: string; title: string };

export function ServicesManager({ organizerId, services, categories = [], canEdit, canDelete }: { organizerId: string; services: any[]; categories?: CategoryOption[]; canEdit: boolean; canDelete: boolean }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<any | null>(null);

  const sorted = [...services].sort((a,b)=> a.position-b.position || a.created_at.localeCompare(b.created_at));
  const idxById = new Map(sorted.map((s, i) => [s.id, i]));

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

  const groups: { id: string; title: string; items: any[] }[] = [
    ...categories.map((c) => ({ id: c.id, title: c.title, items: sorted.filter((s) => s.category_id === c.id) })),
    { id: "uncategorized", title: "Uncategorized", items: sorted.filter((s) => !s.category_id || !categories.some((c) => c.id === s.category_id)) },
  ].filter((g) => g.items.length > 0);

  function renderCard(s: any) {
    const idx = idxById.get(s.id) ?? 0;
    return (
      <div key={s.id} className="rounded-xl border p-4 shadow-xs">
        <Link href={`/dashboard/org/${organizerId}/services/${s.id}`} className="block">
          <div className="font-medium">{s.title}</div>
          <div className="text-sm text-zinc-500 truncate">{s.summary || s.description || "—"}</div>
          <div className="mt-2 text-sm font-mono">{s.price === null ? "Price on request" : `$${Number(s.price).toFixed(2)}`} {s.duration_minutes ? `· ${s.duration_minutes} min` : ""}</div>
          <div className="mt-1 text-xs">{s.is_active ? "Active" : "Inactive"} · {s.slug}</div>
        </Link>
        <div className="mt-3 flex gap-1">
          {canEdit && <>
            <Link href={`/dashboard/org/${organizerId}/services/${s.id}`}>
              <Button variant="ghost" size="icon" aria-label="Edit service"><Pencil className="h-4 w-4"/></Button>
            </Link>
            <Button variant="ghost" size="icon" disabled={idx===0} onClick={()=>handleMove(idx,-1)}><ChevronUp className="h-4 w-4"/></Button>
            <Button variant="ghost" size="icon" disabled={idx===sorted.length-1} onClick={()=>handleMove(idx,1)}><ChevronDown className="h-4 w-4"/></Button>
          </>}
          {canDelete && <Button variant="ghost" size="icon" onClick={()=> setDeleteTarget(s)}><Trash2 className="h-4 w-4 text-red-600"/></Button>}
        </div>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-6">
        {groups.map((g) => (
          <div key={g.id}>
            {categories.length > 0 && <h3 className="mb-3 text-sm font-medium text-zinc-500">{g.title}</h3>}
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {g.items.map(renderCard)}
            </div>
          </div>
        ))}
      </div>
      <ConfirmDialog open={!!deleteTarget} onOpenChange={(o)=> !o && setDeleteTarget(null)} title="Delete service?" description="This will permanently delete the service and its tiers." confirmLabel="Delete" variant="destructive" onConfirm={handleDelete} loading={pending} />
      {error && <div className="text-sm text-red-600 mt-2">{error}</div>}
    </>
  );
}
