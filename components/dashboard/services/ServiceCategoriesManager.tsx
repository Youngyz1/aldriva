"use client";

import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Select } from "@/components/ui/select";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import {
  createServiceCategory,
  updateServiceCategory,
  deleteServiceCategory,
  reorderServiceCategories,
  type ServiceCategoryWithCount,
} from "@/lib/actions/service-categories";
import { useRouter } from "next/navigation";
import { IconChevronUp as ChevronUp, IconChevronDown as ChevronDown, IconTrash as Trash2, IconPlus as Plus, IconPencil as Pencil, IconChevronRight as ChevronRight } from "@tabler/icons-react";
import { MediaUploadField } from "@/components/dashboard/website/builder/inspectors/common/MediaUploadField";

type Props = {
  organizerId: string;
  categories: ServiceCategoryWithCount[];
  canEdit: boolean;
  canDelete: boolean;
};

export function ServiceCategoriesManager({ organizerId, categories, canEdit, canDelete }: Props) {
  const router = useRouter();
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState<ServiceCategoryWithCount | "new" | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<ServiceCategoryWithCount | null>(null);
  const [error, setError] = useState<string | null>(null);

  const sorted = [...categories].sort((a, b) => a.position - b.position || a.created_at.localeCompare(b.created_at));

  async function handleMove(idx: number, dir: -1 | 1) {
    const ids = sorted.map((c) => c.id);
    const tmp = ids[idx];
    ids[idx] = ids[idx + dir];
    ids[idx + dir] = tmp;
    const res = await reorderServiceCategories(organizerId, ids);
    if (!res.success) setError(res.error || "Failed to reorder categories");
    else router.refresh();
  }

  return (
    <div className="rounded-xl border">
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        className="flex w-full items-center justify-between p-4 text-left"
        aria-expanded={expanded}
      >
        <div>
          <div className="text-sm font-medium">Categories</div>
          <div className="text-xs text-zinc-500">{categories.length === 0 ? "No categories yet" : `${categories.length} categor${categories.length === 1 ? "y" : "ies"}`}</div>
        </div>
        <ChevronRight className={`h-4 w-4 shrink-0 transition-transform ${expanded ? "rotate-90" : ""}`} />
      </button>

      {expanded && (
        <div className="border-t p-4 space-y-3">
          {sorted.length === 0 && <div className="text-sm text-zinc-500">No categories yet. Services without a category show as "Uncategorized".</div>}
          {sorted.map((c, idx) => (
            <div key={c.id} className="flex items-center justify-between gap-3 rounded-lg border px-3 py-2">
              <div className="min-w-0">
                <div className="flex items-center gap-2">
                  <span className="truncate text-sm font-medium">{c.title}</span>
                  {!c.is_active && <span className="text-xs text-zinc-500">Inactive</span>}
                </div>
                <div className="truncate text-xs text-zinc-500">{c.service_count} service{c.service_count === 1 ? "" : "s"} · {c.slug}</div>
              </div>
              {canEdit && (
                <div className="flex shrink-0 items-center gap-1">
                  <Button variant="ghost" size="icon" disabled={idx === 0} onClick={() => handleMove(idx, -1)}><ChevronUp className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" disabled={idx === sorted.length - 1} onClick={() => handleMove(idx, 1)}><ChevronDown className="h-4 w-4" /></Button>
                  <Button variant="ghost" size="icon" onClick={() => setEditing(c)}><Pencil className="h-4 w-4" /></Button>
                  {canDelete && <Button variant="ghost" size="icon" onClick={() => setDeleteTarget(c)}><Trash2 className="h-4 w-4 text-red-600" /></Button>}
                </div>
              )}
            </div>
          ))}
          {canEdit && (
            <Button variant="outline" size="sm" onClick={() => setEditing("new")}>
              <Plus className="h-4 w-4 mr-2" />New Category
            </Button>
          )}
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
      )}

      {editing && (
        <CategoryFormDialog
          organizerId={organizerId}
          category={editing === "new" ? undefined : editing}
          onClose={() => setEditing(null)}
          onSaved={() => { setEditing(null); router.refresh(); }}
        />
      )}
      {deleteTarget && (
        <CategoryDeleteDialog
          organizerId={organizerId}
          category={deleteTarget}
          otherCategories={categories.filter((c) => c.id !== deleteTarget.id)}
          onClose={() => setDeleteTarget(null)}
          onDeleted={() => { setDeleteTarget(null); router.refresh(); }}
        />
      )}
    </div>
  );
}

function CategoryFormDialog({
  organizerId,
  category,
  onClose,
  onSaved,
}: {
  organizerId: string;
  category?: ServiceCategoryWithCount;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [title, setTitle] = useState(category?.title || "");
  const [slug, setSlug] = useState(category?.slug || "");
  const [slugEdited, setSlugEdited] = useState(Boolean(category));
  const [tagline, setTagline] = useState(category?.tagline || "");
  const [description, setDescription] = useState(category?.description || "");
  const [imageUrl, setImageUrl] = useState(category?.image_url || "");
  const [isActive, setIsActive] = useState(category?.is_active ?? true);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  function handleTitleChange(value: string) {
    setTitle(value);
    if (!slugEdited) {
      setSlug(value.toLowerCase().trim().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 120));
    }
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      const payload = { title, slug, tagline: tagline || null, description: description || null, image_url: imageUrl || null, is_active: isActive };
      const res = category ? await updateServiceCategory(category.id, organizerId, payload) : await createServiceCategory(organizerId, payload);
      if (!res.success) { setError(res.error || "Failed to save category"); return; }
      onSaved();
    } finally {
      setSaving(false);
    }
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-lg">
        <DialogHeader>
          <DialogTitle>{category ? "Edit Category" : "New Category"}</DialogTitle>
        </DialogHeader>
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="cat-title">Title *</Label>
            <Input id="cat-title" value={title} onChange={(e) => handleTitleChange(e.target.value)} maxLength={100} required placeholder="Deep cleaning" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-slug">Slug</Label>
            <Input id="cat-slug" value={slug} onChange={(e) => { setSlugEdited(true); setSlug(e.target.value); }} maxLength={120} placeholder="deep-cleaning" />
            <p className="text-xs text-zinc-500">Used in the category's URL. Auto-filled from the title until you edit it.</p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-tagline">Tagline</Label>
            <Input id="cat-tagline" value={tagline} onChange={(e) => setTagline(e.target.value)} maxLength={160} placeholder="Optional short line under the category title" />
          </div>
          <div className="space-y-2">
            <Label htmlFor="cat-description">Description</Label>
            <Textarea id="cat-description" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={2000} rows={3} placeholder="Optional" />
          </div>
          <div className="space-y-2">
            <Label>Image</Label>
            <MediaUploadField label="Category Image" value={imageUrl} onChange={setImageUrl} tenantId={organizerId} folderSubpath="service-categories" />
          </div>
          <div className="flex items-center gap-2">
            <Switch checked={isActive} onCheckedChange={setIsActive} id="cat-active" />
            <Label htmlFor="cat-active">Active</Label>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
          <DialogFooter>
            <Button type="button" variant="outline" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" disabled={saving}>{saving ? "Saving..." : category ? "Update Category" : "Create Category"}</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}

function CategoryDeleteDialog({
  organizerId,
  category,
  otherCategories,
  onClose,
  onDeleted,
}: {
  organizerId: string;
  category: ServiceCategoryWithCount;
  otherCategories: ServiceCategoryWithCount[];
  onClose: () => void;
  onDeleted: () => void;
}) {
  const [moveTo, setMoveTo] = useState<string>("");
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const hasServices = category.service_count > 0;

  async function handleDelete() {
    setLoading(true);
    setError(null);
    const res = await deleteServiceCategory(category.id, organizerId, hasServices ? (moveTo || null) : undefined);
    setLoading(false);
    if (!res.success) { setError(res.error === "CATEGORY_HAS_SERVICES" ? "Choose where to move its services first." : res.error || "Failed to delete category"); return; }
    onDeleted();
  }

  if (!hasServices) {
    return (
      <ConfirmDialog
        open
        onOpenChange={(open) => !open && onClose()}
        title="Delete category?"
        description={`"${category.title}" has no services and can be deleted safely.`}
        confirmLabel="Delete"
        variant="destructive"
        onConfirm={handleDelete}
        loading={loading}
      />
    );
  }

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Move services before deleting</DialogTitle>
        </DialogHeader>
        <div className="space-y-4">
          <p className="text-sm text-zinc-600 dark:text-zinc-400">
            "{category.title}" has {category.service_count} service{category.service_count === 1 ? "" : "s"}. Choose where to move {category.service_count === 1 ? "it" : "them"} before deleting this category.
          </p>
          <div className="space-y-2">
            <Label htmlFor="move-to">Move services to</Label>
            <Select id="move-to" value={moveTo} onChange={(e) => setMoveTo(e.target.value)}>
              <option value="">Uncategorized</option>
              {otherCategories.map((c) => <option key={c.id} value={c.id}>{c.title}</option>)}
            </Select>
          </div>
          {error && <div className="text-sm text-red-600">{error}</div>}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={loading}>Cancel</Button>
          <Button variant="destructive" onClick={handleDelete} disabled={loading}>{loading ? "Moving & deleting..." : "Move services & delete"}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
