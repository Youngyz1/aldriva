"use client";

import { useState } from "react";
import { createBranch, updateBranch, deleteBranch } from "@/lib/actions/business-branches";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";

type Branch = {
  id: string;
  business_id: string;
  label: string;
  address: string | null;
  city: string | null;
  state: string | null;
  country: string | null;
  phone: string | null;
  is_main: boolean;
  status: string;
};

export default function BranchesClient({ businessId, businessName, initialBranches }: { businessId: string; businessName: string; initialBranches: Branch[] }) {
  const [branches, setBranches] = useState<Branch[]>(initialBranches);
  const [form, setForm] = useState({ label: "", address: "", city: "", state: "", country: "", phone: "", is_main: false });
  const [editing, setEditing] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function handleCreate() {
    setError(null);
    setLoading(true);
    const res = await createBranch(businessId, {
      label: form.label,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      phone: form.phone || null,
      is_main: form.is_main,
    });
    setLoading(false);
    if (!res.success) { setError(res.error); return; }
    setBranches((prev) => [...prev, res.data as Branch]);
    setForm({ label: "", address: "", city: "", state: "", country: "", phone: "", is_main: false });
  }

  async function handleUpdate(id: string, patch: Partial<Branch>) {
    setError(null);
    const res = await updateBranch(id, patch as never);
    if (!res.success) { setError(res.error); return; }
    setBranches((prev) => prev.map((b) => b.id === id ? (res.data as Branch) : b));
    setEditing(null);
  }

  async function handleDelete(id: string) {
    if (!confirm("Delete this branch?")) return;
    const res = await deleteBranch(id);
    if (!res.success) { setError(res.error); return; }
    setBranches((prev) => prev.filter((b) => b.id !== id));
  }

  return (
    <div className="space-y-6">
      <header>
        <h1 className="text-xl font-black">Branches — {businessName}</h1>
        <p className="text-sm text-zinc-500">Manage locations. Businesses with multiple branches store secondary locations here; main address stays on the Business.</p>
      </header>

      {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

      <Card>
        <CardHeader><CardTitle className="text-sm">Add Branch</CardTitle></CardHeader>
        <CardContent className="space-y-3">
          <Input placeholder="Label e.g. Downtown" value={form.label} onChange={(e) => setForm({ ...form, label: e.target.value })} />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input placeholder="Address" value={form.address} onChange={(e) => setForm({ ...form, address: e.target.value })} />
            <Input placeholder="City" value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} />
            <Input placeholder="State" value={form.state} onChange={(e) => setForm({ ...form, state: e.target.value })} />
            <Input placeholder="Country" value={form.country} onChange={(e) => setForm({ ...form, country: e.target.value })} />
            <Input placeholder="Phone" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
            <label className="flex items-center gap-2 text-sm font-semibold"><input type="checkbox" checked={form.is_main} onChange={(e) => setForm({ ...form, is_main: e.target.checked })} /> Main branch</label>
          </div>
          <Button onClick={handleCreate} disabled={loading || form.label.trim().length < 2}>{loading ? "Saving..." : "Add branch"}</Button>
        </CardContent>
      </Card>

      <div className="space-y-3">
        {branches.length === 0 ? <p className="text-sm text-zinc-500">No branches yet.</p> : branches.map((b) => (
          <Card key={b.id}>
            <CardContent className="flex items-center justify-between p-4">
              <div>
                <p className="font-bold text-sm flex items-center gap-2">{b.label} {b.is_main && <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-bold text-orange-700">Main</span>} <span className="text-xs font-medium text-zinc-400">{b.status}</span></p>
                <p className="text-xs text-zinc-500">{[b.address, b.city, b.state, b.country].filter(Boolean).join(", ") || "No address"}{b.phone ? ` · ${b.phone}` : ""}</p>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={() => setEditing(editing === b.id ? null : b.id)}>{editing === b.id ? "Cancel" : "Edit"}</Button>
                <Button variant="ghost" size="sm" onClick={() => handleDelete(b.id)}>Delete</Button>
              </div>
            </CardContent>
            {editing === b.id && (
              <div className="border-t p-4 space-y-2 bg-zinc-50">
                <Input defaultValue={b.label} id={`label-${b.id}`} placeholder="Label" onBlur={(e) => e.target.value.trim() && e.target.value !== b.label && handleUpdate(b.id, { label: e.target.value.trim() })} />
                <div className="flex gap-2">
                  <Button size="sm" variant="outline" onClick={() => handleUpdate(b.id, { is_main: !b.is_main })}>{b.is_main ? "Unset main" : "Set as main"}</Button>
                  <Button size="sm" variant="outline" onClick={() => handleUpdate(b.id, { status: b.status === "active" ? "archived" : "active" })}>{b.status === "active" ? "Archive" : "Restore"}</Button>
                </div>
              </div>
            )}
          </Card>
        ))}
      </div>
    </div>
  );
}
