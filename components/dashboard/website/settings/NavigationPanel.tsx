"use client";

import { Plus, Menu, Edit2, Trash2, ArrowUp, ArrowDown } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/state";
import type { NavigationItem } from "@/lib/website-nav";

export function NavigationPanel({
  navItems,
  onNew,
  onEdit,
  onDelete,
  onMove,
}: {
  navItems: NavigationItem[];
  onNew: () => void;
  onEdit: (item: NavigationItem) => void;
  onDelete: (id: string) => void;
  onMove: (index: number, dir: "up" | "down") => void;
}) {
  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-sm font-semibold text-zinc-900">Header Navigation Menu</h2>
          <p className="text-xs text-muted-foreground">Configure the links shown in your website header.</p>
        </div>
        <Button size="sm" onClick={onNew}>
          <Plus className="h-4 w-4" /> Add Menu Link
        </Button>
      </div>

      {navItems.length === 0 ? (
        <EmptyState title="No menu items" description="Add links to help visitors navigate your website." icon={<Menu className="h-5 w-5" />} />
      ) : (
        <div className="divide-y divide-zinc-200 overflow-hidden rounded-xl border border-zinc-200 bg-white shadow-xs">
          {navItems.map((item, index) => (
            <div key={item.id} className="flex flex-col gap-3 p-4 hover:bg-zinc-50 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3 min-w-0">
                <div className="flex flex-col gap-1 shrink-0">
                  <button disabled={index === 0} onClick={() => onMove(index, "up")} className="text-zinc-400 hover:text-zinc-700 disabled:opacity-20 p-1">
                    <ArrowUp className="h-3.5 w-3.5" />
                  </button>
                  <button disabled={index === navItems.length - 1} onClick={() => onMove(index, "down")} className="text-zinc-400 hover:text-zinc-700 disabled:opacity-20 p-1">
                    <ArrowDown className="h-3.5 w-3.5" />
                  </button>
                </div>
                <div className="min-w-0">
                  <div className="flex items-center gap-2">
                    <span className="font-semibold text-zinc-900 truncate">{item.label}</span>
                    {item.target === "_blank" && <span className="rounded bg-zinc-100 px-1.5 py-0.5 text-[10px] font-mono text-zinc-500">_blank</span>}
                  </div>
                  <p className="text-xs font-mono text-zinc-400 truncate">{item.href}</p>
                </div>
              </div>
              <div className="flex items-center gap-1 shrink-0">
                <button onClick={() => onEdit(item)} className="rounded-lg p-2 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900">
                  <Edit2 className="h-4 w-4" />
                </button>
                <button onClick={() => onDelete(item.id)} className="rounded-lg p-2 text-destructive hover:bg-destructive/10">
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
