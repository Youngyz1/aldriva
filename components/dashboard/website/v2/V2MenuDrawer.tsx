"use client";

import { useEffect, useState, useCallback } from "react";
import { useTranslations } from "next-intl";
import { IconX as X, IconAlertCircle as AlertCircle, IconLoader2 as Loader2 } from "@tabler/icons-react";
import { MenuManager } from "@/components/dashboard/menu/MenuManager";
import { getFullMenu } from "@/lib/actions/menus";

interface V2MenuDrawerProps {
  open: boolean;
  onClose: () => void;
  organizerId: string;
  canEdit: boolean;
  canDelete: boolean;
  onMenuChanged?: () => void;
}

export function V2MenuDrawer({
  open,
  onClose,
  organizerId,
  canEdit,
  canDelete,
  onMenuChanged,
}: V2MenuDrawerProps) {
  const storeT = useTranslations("Storefront");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sections, setSections] = useState<any[]>([]);
  const [itemsBySection, setItemsBySection] = useState<Record<string, any[]>>({});

  const loadMenu = useCallback(async () => {
    setLoading(true);
    setError(null);
    const res = await getFullMenu(organizerId);
    if (!res.success || !res.data) {
      setError(res.error || "Failed to load menu");
      setLoading(false);
      return;
    }
    setSections(res.data.sections);
    setItemsBySection(res.data.itemsBySection);
    setLoading(false);
  }, [organizerId]);

  useEffect(() => {
    if (open) {
      loadMenu();
    }
  }, [open, loadMenu]);

  useEffect(() => {
    if (!open) return;
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [open, onClose]);

  if (!open) return null;

  const handleChanged = () => {
    loadMenu();
    onMenuChanged?.();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex justify-end bg-black/40 backdrop-blur-xs transition-opacity"
      role="presentation"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <aside
        role="dialog"
        aria-modal="true"
        aria-labelledby="menu-drawer-title"
        className="flex h-full w-full max-w-full flex-col overflow-hidden border-l border-zinc-200 bg-white shadow-xl dark:border-zinc-800 dark:bg-zinc-900 sm:max-w-xl md:max-w-2xl"
      >
        <div className="flex items-center justify-between border-b border-zinc-200 px-5 py-4 dark:border-zinc-800">
          <div>
            <h2 id="menu-drawer-title" className="text-base font-bold text-zinc-900 dark:text-zinc-100">
              {storeT("manageFullMenu")}
            </h2>
            <p className="text-xs text-zinc-500 dark:text-zinc-400">
              {storeT("manageFullMenuDescription")}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="rounded-lg p-1.5 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 dark:hover:bg-zinc-800 dark:hover:text-zinc-200"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 space-y-4 overflow-y-auto overflow-x-hidden p-5">
          <div className="flex items-start gap-2.5 rounded-xl border border-amber-200 bg-amber-50 p-3 text-xs text-amber-900 dark:border-amber-900/60 dark:bg-amber-950/30 dark:text-amber-200">
            <AlertCircle className="mt-0.5 h-4 w-4 shrink-0 text-amber-600 dark:text-amber-400" />
            <p>{storeT("menuLiveNotice")}</p>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-12 text-sm text-zinc-500">
              <Loader2 className="mr-2 h-5 w-5 animate-spin text-zinc-400" />
              Loading menu…
            </div>
          ) : error ? (
            <div className="rounded-xl border border-rose-200 bg-rose-50 p-4 text-xs text-rose-700 dark:border-rose-900/60 dark:bg-rose-950/30 dark:text-rose-200">
              {error}
            </div>
          ) : (
            <MenuManager
              organizerId={organizerId}
              tenantId={organizerId}
              sections={sections}
              itemsBySection={itemsBySection}
              canEdit={canEdit}
              canDelete={canDelete}
              onSaved={handleChanged}
              onDeleted={handleChanged}
              onChanged={handleChanged}
              defaultSectionName={storeT("mainMenu")}
            />
          )}
        </div>
      </aside>
    </div>
  );
}
