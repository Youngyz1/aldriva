"use client";

import Link from "next/link";
import { Plus, FileText, Trash2, Edit2, LayoutTemplate } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import type { WebsiteData } from "./types";

export function PagesPanel({
  orgId,
  pages,
  onNew,
  onEdit,
  onDelete,
}: {
  orgId: string;
  pages: WebsiteData["pages"];
  onNew: () => void;
  onEdit: (page: WebsiteData["pages"][0]) => void;
  onDelete: (id: string) => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-semibold text-zinc-900">Website Pages</h2>
        <Button size="sm" onClick={onNew}>
          <Plus className="h-4 w-4" /> Add Page
        </Button>
      </div>

      {pages.length === 0 ? (
        <EmptyState
          title="No pages yet"
          description='Click "Add Page" to build your first page.'
          icon={<FileText className="h-5 w-5" />}
        />
      ) : (
        <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
          {pages.map((page) => (
            <div key={page.id} className="flex flex-col gap-3 p-4 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <FileText className="h-5 w-5 text-zinc-400 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-zinc-900 truncate">{page.title}</span>
                    {page.is_home && <span className="rounded-md bg-orange-100 px-2 py-0.5 text-[10px] font-bold text-orange-700">HOME</span>}
                    <span className={`rounded-md px-2 py-0.5 text-[10px] font-bold uppercase ${page.status === "published" ? "bg-emerald-100 text-emerald-800" : "bg-zinc-100 text-zinc-600"}`}>{page.status}</span>
                  </div>
                  <p className="text-xs font-mono text-zinc-400 truncate">/{page.slug}</p>
                </div>
              </div>
              <div className="flex items-center gap-2 shrink-0">
                <Link href={`/dashboard/org/${orgId}/website/builder?pageId=${page.id}`} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-200 bg-white px-3 py-1.5 text-xs font-semibold text-zinc-700 hover:bg-zinc-50">
                  <LayoutTemplate className="h-3.5 w-3.5 text-zinc-400" /> Edit in Builder
                </Link>
                <button onClick={() => onEdit(page)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900" title="Edit Page">
                  <Edit2 className="h-4 w-4" />
                </button>
                {!page.is_home && (
                  <button onClick={() => onDelete(page.id)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10" title="Delete Page">
                    <Trash2 className="h-4 w-4" />
                  </button>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
