"use client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Plus, X } from "lucide-react";

export function ModifiersEditor({ modifiers, onChange }: { modifiers: { name: string; price_delta: number }[]; onChange: (mods: { name: string; price_delta: number }[]) => void }) {
  function update(idx: number, patch: Partial<{ name: string; price_delta: number }>) {
    const next = [...modifiers];
    next[idx] = { ...next[idx], ...patch };
    onChange(next);
  }
  function add() {
    if (modifiers.length >= 12) return;
    onChange([...modifiers, { name: "", price_delta: 0 }]);
  }
  function remove(idx: number) {
    onChange(modifiers.filter((_, i) => i !== idx));
  }
  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <Label>Modifiers (max 12)</Label>
        <Button type="button" variant="outline" size="sm" onClick={add} disabled={modifiers.length >= 12}><Plus className="h-4 w-4 mr-1" />Add Modifier</Button>
      </div>
      {modifiers.length === 0 && <div className="text-xs text-zinc-500">No modifiers yet.</div>}
      {modifiers.map((m, idx) => (
        <div key={idx} className="flex gap-2 items-end">
          <div className="flex-1 space-y-1">
            <Label className="text-xs">Name *</Label>
            <Input value={m.name} onChange={(e) => update(idx, { name: e.target.value })} maxLength={80} placeholder="Extra cheese" required />
          </div>
          <div className="w-32 space-y-1">
            <Label className="text-xs">Price delta</Label>
            <Input type="number" step="0.01" min={-10000} max={10000} value={m.price_delta} onChange={(e) => update(idx, { price_delta: Number(e.target.value) })} />
          </div>
          <Button type="button" variant="ghost" size="icon" onClick={() => remove(idx)}><X className="h-4 w-4" /></Button>
        </div>
      ))}
      {modifiers.length >= 12 && <div className="text-xs text-amber-600">Maximum 12 modifiers reached.</div>}
    </div>
  );
}
