"use client";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createMenuSection, updateMenuSection } from "@/lib/actions/menus";
import { useRouter } from "next/navigation";

export function MenuSectionForm({ organizerId, section, onSaved, onCancel }: { organizerId: string; section?: any; onSaved?: () => void; onCancel?: () => void }) {
  const router = useRouter();
  const [name, setName] = useState(section?.name || "");
  const [description, setDescription] = useState(section?.description || "");
  const [isActive, setIsActive] = useState(section?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setPending(true); setError(null);
    const res = section ? await updateMenuSection(section.id, organizerId, { name, description: description || null, is_active: isActive }) : await createMenuSection(organizerId, { name, description: description || null, is_active: isActive });
    setPending(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    router.refresh(); onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-3">
      <div className="space-y-1"><Label>Name *</Label><Input value={name} onChange={e=>setName(e.target.value)} maxLength={80} required placeholder="Appetizers" /></div>
      <div className="space-y-1"><Label>Description</Label><Textarea value={description} onChange={e=>setDescription(e.target.value)} maxLength={500} rows={2} /></div>
      <label className="flex items-center gap-2 text-sm"><Switch checked={isActive} onCheckedChange={setIsActive} /> Active</label>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <div className="flex gap-2">
        <Button type="submit" disabled={pending}>{pending? "Saving...": section? "Update Section":"Create Section"}</Button>
        <Button type="button" variant="outline" onClick={onCancel}>Cancel</Button>
      </div>
    </form>
  );
}
