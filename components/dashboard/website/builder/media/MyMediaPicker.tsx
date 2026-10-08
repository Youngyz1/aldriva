"use client";

import React, { useEffect, useState, useCallback } from "react";
import { Image as ImageIcon, Trash2, Check, RefreshCw, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { listTenantMedia, deleteTenantMedia, type MyMediaItem } from "@/lib/media/my-media";
import { safeImageSrc } from "@/lib/image-url";

interface MyMediaPickerProps {
  tenantId: string;
  onSelect: (publicUrl: string) => void;
  onError?: (message: string) => void;
  selectedUrl?: string | null;
}

export function MyMediaPicker({ tenantId, onSelect, selectedUrl }: MyMediaPickerProps) {
  const [items, setItems] = useState<MyMediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<MyMediaItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    if (!tenantId) {
      setError("Missing tenant");
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const res = await listTenantMedia(tenantId);
      setItems(res);
    } catch {
      setError("Couldn't load your media. Try again.");
    } finally {
      setLoading(false);
    }
  }, [tenantId]);

  useEffect(() => {
    load();
  }, [load]);

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      await deleteTenantMedia(tenantId, deleteTarget.path);
      setItems((prev) => prev.filter((i) => i.path !== deleteTarget.path));
      setDeleteTarget(null);
    } catch {
      setError("Failed to delete media. Try again.");
      setDeleteTarget(null);
    } finally {
      setDeleting(false);
    }
  };

  if (loading) {
    return (
      <div className="space-y-3">
        <div className="flex items-center gap-2 text-xs text-zinc-500">
          <Loader2 className="h-4 w-4 animate-spin" /> Loading media...
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {Array.from({ length: 6 }).map((_, i) => (
            <div key={i} className="h-24 rounded-xl bg-zinc-100 dark:bg-zinc-800 animate-pulse" />
          ))}
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 dark:bg-amber-950/20 p-4 text-center space-y-3">
        <p className="text-xs font-medium text-amber-800 dark:text-amber-200">{error}</p>
        <Button variant="outline" size="sm" onClick={load}>
          <RefreshCw className="h-3.5 w-3.5" /> Try again
        </Button>
      </div>
    );
  }

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-zinc-200 dark:border-zinc-700 p-6 text-center space-y-2">
        <ImageIcon className="mx-auto h-8 w-8 text-zinc-400" />
        <p className="text-sm font-semibold text-zinc-700 dark:text-zinc-200">No media yet</p>
        <p className="text-xs text-zinc-500 max-w-[260px] mx-auto">Upload an image and it will appear here for reuse across your website.</p>
      </div>
    );
  }

  return (
    <>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <p className="text-xs font-semibold text-zinc-700 dark:text-zinc-300">{items.length} image{items.length !== 1 ? "s" : ""} available</p>
          <button
            type="button"
            onClick={load}
            className="text-[11px] font-medium text-zinc-500 hover:text-zinc-700 dark:text-zinc-400 flex items-center gap-1"
          >
            <RefreshCw className="h-3 w-3" /> Refresh
          </button>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 max-h-[320px] overflow-y-auto pr-1">
          {items.map((item) => {
            const safeUrl = safeImageSrc(item.publicUrl);
            const isSelected = selectedUrl && safeUrl === selectedUrl;
            return (
              <div
                key={item.path}
                className={`group relative rounded-xl border overflow-hidden bg-white dark:bg-zinc-900 shadow-xs transition ${
                  isSelected ? "border-brand-600 ring-2 ring-brand-600" : "border-zinc-200 dark:border-zinc-700 hover:border-zinc-300"
                }`}
              >
                <button
                  type="button"
                  onClick={() => {
                    if (safeUrl) onSelect(safeUrl);
                  }}
                  className="block w-full text-left"
                  aria-label={`Select ${item.name}`}
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={safeUrl || item.publicUrl}
                    alt={item.name}
                    className="h-24 w-full object-cover bg-zinc-100 dark:bg-zinc-800"
                    loading="lazy"
                  />
                  <div className="p-2">
                    <p className="text-[11px] font-medium text-zinc-700 dark:text-zinc-200 truncate" title={item.name}>
                      {item.name}
                    </p>
                    {item.updatedAt && (
                      <p className="text-[10px] text-zinc-400 truncate">
                        {new Date(item.updatedAt).toLocaleDateString()}
                      </p>
                    )}
                  </div>
                  {isSelected && (
                    <span className="absolute right-1.5 top-1.5 flex h-5 w-5 items-center justify-center rounded-full bg-brand-600 text-white shadow">
                      <Check className="h-3 w-3" />
                    </span>
                  )}
                </button>
                <div className="flex items-center justify-between border-t border-zinc-100 dark:border-zinc-800 px-2 py-1.5 bg-zinc-50/50 dark:bg-zinc-800/30">
                  <button
                    type="button"
                    onClick={() => {
                      if (safeUrl) onSelect(safeUrl);
                    }}
                    className="text-[11px] font-semibold text-brand-700 hover:text-brand-800 dark:text-brand-400"
                  >
                    Use
                  </button>
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(item)}
                    className="text-[11px] font-medium text-zinc-500 hover:text-red-600 dark:text-zinc-400 flex items-center gap-1"
                    aria-label={`Delete ${item.name}`}
                  >
                    <Trash2 className="h-3 w-3" /> Delete
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      <ConfirmDialog
        open={!!deleteTarget}
        onOpenChange={(o) => !o && setDeleteTarget(null)}
        title="Delete image?"
        description={`This will permanently delete "${deleteTarget?.name ?? ""}" from your media. Blocks using it will keep the URL until you change them.`}
        confirmLabel="Delete"
        cancelLabel="Cancel"
        variant="destructive"
        onConfirm={handleDelete}
        loading={deleting}
      />
    </>
  );
}
