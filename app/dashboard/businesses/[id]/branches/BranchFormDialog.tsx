"use client";

import { useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { createBranch, updateBranch, type BranchInput } from "@/lib/actions/business-branches";
import { useImageUpload } from "@/hooks/use-image-upload";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import BranchCoverImage from "@/components/branches/BranchCoverImage";
import type { Branch } from "./BranchesClient";

// Dynamic/runtime-determined key, same `as any` escape next-intl's own
// strict Translator type requires here as OrgDashboardSidebar.tsx already
// uses for its own dynamic key lookup -- a runtime string can never be
// verified against NamespacedMessageKeys at compile time.
function translateByCode(t: (key: any) => string, code: string, fallback: string): string {
  try {
    return t(code as any);
  } catch {
    return fallback;
  }
}

const EMPTY_FORM = { label: "", address: "", city: "", state: "", country: "", phone: "", cover_image_url: "" };

function initialFormState(editing: Branch | null): typeof EMPTY_FORM {
  if (!editing) return EMPTY_FORM;
  return {
    label: editing.label,
    address: editing.address ?? "",
    city: editing.city ?? "",
    state: editing.state ?? "",
    country: editing.country ?? "",
    phone: editing.phone ?? "",
    cover_image_url: editing.cover_image_url ?? "",
  };
}

// Extracted from BranchesClient.tsx so the branch detail page can open the
// same create/edit dialog without duplicating its form markup -- mirrors
// StaffFormDialog.tsx's own split from its list client.
export default function BranchFormDialog({
  open,
  onOpenChange,
  businessId,
  editing,
  onSaved,
}: {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  businessId: string;
  editing: Branch | null;
  onSaved: (branch: Branch) => void;
}) {
  const t = useTranslations("Workforce");
  const [form, setForm] = useState(() => initialFormState(editing));
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const lastEditingId = useRef(editing?.id ?? null);

  // Dialog instance is reused for create/edit; reset local state only when
  // the identity of what we're editing actually changes (open/close of the
  // same dialog must not wipe in-progress input on a re-render).
  if (lastEditingId.current !== (editing?.id ?? null)) {
    lastEditingId.current = editing?.id ?? null;
    setForm(initialFormState(editing));
    setError(null);
  }

  const { uploading: coverUploading, triggerUpload: triggerCoverUpload, handleFileChange: handleCoverFileChange, fileInputRef: coverFileInputRef } = useImageUpload({
    folder: "branch-covers",
    onSuccess: (url) => setForm((f) => ({ ...f, cover_image_url: url })),
    onError: (msg) => setError(msg),
  });

  async function handleSave() {
    setError(null);
    setSaving(true);
    const input: BranchInput = {
      label: form.label,
      address: form.address || null,
      city: form.city || null,
      state: form.state || null,
      country: form.country || null,
      phone: form.phone || null,
      cover_image_url: form.cover_image_url || null,
    };
    const res = editing ? await updateBranch(editing.id, input) : await createBranch(businessId, input);
    setSaving(false);
    if (!res.success) {
      setError(translateByCode(t, res.code, res.error));
      return;
    }
    onSaved(res.data as Branch);
    onOpenChange(false);
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-[32rem]">
        <DialogHeader>
          <DialogTitle>{editing ? t("brEditTitle") : t("brAddTitle")}</DialogTitle>
        </DialogHeader>
        <div className="space-y-2">
          {error && <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-sm font-semibold text-red-700">{error}</div>}

          <div className="flex items-center gap-3">
            <BranchCoverImage coverImageUrl={form.cover_image_url || null} label={form.label} className="h-16 w-24" />
            <input
              ref={coverFileInputRef}
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="hidden"
              onChange={handleCoverFileChange}
            />
            <div className="flex flex-col gap-1">
              <Button type="button" variant="outline" size="sm" onClick={triggerCoverUpload} disabled={coverUploading}>
                {coverUploading ? t("brUploadingCover") : t("brUploadCover")}
              </Button>
              {form.cover_image_url && (
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => setForm((f) => ({ ...f, cover_image_url: "" }))}
                >
                  {t("brRemoveCover")}
                </Button>
              )}
            </div>
          </div>

          <Input
            className="min-w-0 w-full"
            placeholder={t("brLabelPlaceholder")}
            value={form.label}
            onChange={(e) => setForm({ ...form, label: e.target.value })}
          />
          <Input
            className="min-w-0 w-full"
            placeholder={t("brAddressPlaceholder")}
            value={form.address}
            onChange={(e) => setForm({ ...form, address: e.target.value })}
          />
          <div className="grid gap-2 sm:grid-cols-2">
            <Input
              className="min-w-0 w-full"
              placeholder={t("brCityPlaceholder")}
              value={form.city}
              onChange={(e) => setForm({ ...form, city: e.target.value })}
            />
            <Input
              className="min-w-0 w-full"
              placeholder={t("brStatePlaceholder")}
              value={form.state}
              onChange={(e) => setForm({ ...form, state: e.target.value })}
            />
            <Input
              className="min-w-0 w-full"
              placeholder={t("brCountryPlaceholder")}
              value={form.country}
              onChange={(e) => setForm({ ...form, country: e.target.value })}
            />
            <Input
              className="min-w-0 w-full"
              placeholder={t("brPhonePlaceholder")}
              value={form.phone}
              onChange={(e) => setForm({ ...form, phone: e.target.value })}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>{t("brCancel")}</Button>
          <Button onClick={handleSave} disabled={saving || coverUploading || form.label.trim().length < 2}>
            {saving ? t("brSaving") : t("brSave")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
