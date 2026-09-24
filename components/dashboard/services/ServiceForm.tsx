"use client";
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { createService, updateService } from "@/lib/actions/services";
import { useRouter } from "next/navigation";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";

export function ServiceForm({ organizerId, service, tenantId, onSaved }: { organizerId: string; service?: any; tenantId: string; onSaved?: () => void }) {
  const router = useRouter();
  const [title, setTitle] = useState(service?.title || "");
  const [description, setDescription] = useState(service?.description || "");
  const [price, setPrice] = useState(service?.price ?? "");
  const [duration, setDuration] = useState(service?.duration_minutes ?? "");
  const [imageUrl, setImageUrl] = useState(service?.image_url || "");
  const [isActive, setIsActive] = useState(service?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    const payload: any = { title, description, price: Number(price), duration_minutes: duration ? Number(duration) : null, image_url: imageUrl || null, is_active: isActive };
    const res = service ? await updateService(service.id, organizerId, payload) : await createService(organizerId, payload);
    setSaving(false);
    if (!res.success) { setError(res.error || "Failed"); return; }
    router.push(`/dashboard/org/${organizerId}/services`);
    router.refresh();
    onSaved?.();
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4 max-w-2xl">
      <div className="space-y-2">
        <Label htmlFor="title">Title *</Label>
        <Input id="title" value={title} onChange={(e) => setTitle(e.target.value)} maxLength={120} required placeholder="Haircut" />
      </div>
      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="Professional haircut with styling" />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          <Label htmlFor="price">Price *</Label>
          <Input id="price" type="number" step="0.01" min={0} max={999999.99} value={price} onChange={(e) => setPrice(e.target.value)} required />
        </div>
        <div className="space-y-2">
          <Label htmlFor="duration">Duration (min)</Label>
          <Input id="duration" type="number" min={5} max={1440} value={duration} onChange={(e) => setDuration(e.target.value)} placeholder="60" />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Image</Label>
        <MediaUploadField label="Service Image" value={imageUrl} onChange={setImageUrl} tenantId={tenantId} folderSubpath="services" />
      </div>
      <div className="flex items-center gap-2">
        <Switch checked={isActive} onCheckedChange={setIsActive} id="active" />
        <Label htmlFor="active">Active</Label>
      </div>
      {error && <div className="text-sm text-red-600">{error}</div>}
      <Button type="submit" disabled={saving}>{saving ? "Saving..." : service ? "Update Service" : "Create Service"}</Button>
    </form>
  );
}
