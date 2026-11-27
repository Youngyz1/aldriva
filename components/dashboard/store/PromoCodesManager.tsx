"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  IconTicket,
  IconPlus,
  IconEdit,
  IconTrash,
  IconCopy,
  IconCheck,
  IconClock,
  IconAlertCircle,
  IconSearch,
} from "@tabler/icons-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import type { PromoCodeRow } from "@/lib/promo-codes";
import {
  createStorePromoCode,
  updateStorePromoCode,
  toggleStorePromoCodeActive,
  deleteStorePromoCode,
  type CreateStorePromoInput,
  type UpdateStorePromoInput,
} from "@/lib/actions/promo-codes";

interface PromoCodesManagerProps {
  organizerId: string;
  initialCodes: PromoCodeRow[];
  canManage: boolean;
  currency?: string;
}

export function PromoCodesManager({
  organizerId,
  initialCodes,
  canManage,
  currency = "USD",
}: PromoCodesManagerProps) {
  const router = useRouter();
  const [codes, setCodes] = useState<PromoCodeRow[]>(initialCodes);
  const [search, setSearch] = useState("");
  const [copiedCodeId, setCopiedCodeId] = useState<string | null>(null);

  // Dialog state
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingCode, setEditingCode] = useState<PromoCodeRow | null>(null);
  const [formError, setFormError] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Form fields
  const [codeValue, setCodeValue] = useState("");
  const [discountType, setDiscountType] = useState<"percent" | "fixed">("percent");
  const [percentValue, setPercentValue] = useState("10");
  const [fixedValue, setFixedValue] = useState("5.00");
  const [fixedCurrency, setFixedCurrency] = useState(currency);
  const [minSubtotal, setMinSubtotal] = useState("0");
  const [maxUses, setMaxUses] = useState("");
  const [startsAt, setStartsAt] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [isActive, setIsActive] = useState(true);

  // Delete dialog state
  const [deleteConfirmId, setDeleteConfirmId] = useState<string | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);

  // Filtered list
  const filteredCodes = codes.filter((c) =>
    c.code.toLowerCase().includes(search.toLowerCase().trim())
  );

  const openCreateDialog = () => {
    setEditingCode(null);
    setCodeValue("");
    setDiscountType("percent");
    setPercentValue("10");
    setFixedValue("5.00");
    setFixedCurrency(currency);
    setMinSubtotal("0");
    setMaxUses("");
    setStartsAt("");
    setExpiresAt("");
    setIsActive(true);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const openEditDialog = (promo: PromoCodeRow) => {
    setEditingCode(promo);
    setCodeValue(promo.code);
    if (promo.percent_off !== null) {
      setDiscountType("percent");
      setPercentValue(String(promo.percent_off));
      setFixedValue("5.00");
      setFixedCurrency(currency);
    } else {
      setDiscountType("fixed");
      setPercentValue("10");
      setFixedValue((Number(promo.fixed_off_minor ?? 0) / 100).toFixed(2));
      setFixedCurrency(promo.fixed_currency ?? currency);
    }
    setMinSubtotal((Number(promo.min_subtotal_minor ?? 0) / 100).toFixed(2));
    setMaxUses(promo.max_uses ? String(promo.max_uses) : "");
    setStartsAt(promo.starts_at ? promo.starts_at.slice(0, 16) : "");
    setExpiresAt(promo.expires_at ? promo.expires_at.slice(0, 16) : "");
    setIsActive(promo.is_active);
    setFormError(null);
    setIsDialogOpen(true);
  };

  const handleCopyCode = async (code: string, id: string) => {
    try {
      await navigator.clipboard.writeText(code);
      setCopiedCodeId(id);
      setTimeout(() => setCopiedCodeId(null), 2000);
    } catch {
      // Fallback or ignore
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setIsSubmitting(true);

    try {
      const minSubtotalMinor = Math.max(0, Math.round(parseFloat(minSubtotal || "0") * 100));
      const parsedMaxUses = maxUses.trim() ? parseInt(maxUses.trim(), 10) : null;

      if (editingCode) {
        const updatePayload: UpdateStorePromoInput = {
          discountType,
          percentOff: discountType === "percent" ? parseInt(percentValue, 10) : null,
          fixedOffMinor:
            discountType === "fixed" ? Math.round(parseFloat(fixedValue || "0") * 100) : null,
          fixedCurrency: discountType === "fixed" ? fixedCurrency.toUpperCase() : null,
          minSubtotalMinor,
          maxUses: parsedMaxUses,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          isActive,
        };

        const res = await updateStorePromoCode(organizerId, editingCode.id, updatePayload);
        if (!res.success) {
          setFormError(res.error ?? "Failed to update promo code.");
          setIsSubmitting(false);
          return;
        }

        setCodes((prev) =>
          prev.map((c) => (c.id === editingCode.id ? (res.data as PromoCodeRow) : c))
        );
      } else {
        const createPayload: CreateStorePromoInput = {
          code: codeValue.trim(),
          discountType,
          percentOff: discountType === "percent" ? parseInt(percentValue, 10) : null,
          fixedOffMinor:
            discountType === "fixed" ? Math.round(parseFloat(fixedValue || "0") * 100) : null,
          fixedCurrency: discountType === "fixed" ? fixedCurrency.toUpperCase() : null,
          minSubtotalMinor,
          maxUses: parsedMaxUses,
          startsAt: startsAt ? new Date(startsAt).toISOString() : null,
          expiresAt: expiresAt ? new Date(expiresAt).toISOString() : null,
          isActive,
        };

        const res = await createStorePromoCode(organizerId, createPayload);
        if (!res.success) {
          setFormError(res.error ?? "Failed to create promo code.");
          setIsSubmitting(false);
          return;
        }

        setCodes((prev) => [res.data as PromoCodeRow, ...prev]);
      }

      setIsDialogOpen(false);
      router.refresh();
    } catch {
      setFormError("An unexpected error occurred. Please try again.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleToggleActive = async (promo: PromoCodeRow) => {
    if (!canManage) return;
    const nextState = !promo.is_active;
    const res = await toggleStorePromoCodeActive(organizerId, promo.id, nextState);
    if (res.success && res.data) {
      setCodes((prev) => prev.map((c) => (c.id === promo.id ? res.data! : c)));
      router.refresh();
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirmId || !canManage) return;
    setIsDeleting(true);
    try {
      const res = await deleteStorePromoCode(organizerId, deleteConfirmId);
      if (res.success) {
        setCodes((prev) => prev.filter((c) => c.id !== deleteConfirmId));
        setDeleteConfirmId(null);
        router.refresh();
      }
    } finally {
      setIsDeleting(false);
    }
  };

  const isExpired = (code: PromoCodeRow) => {
    return code.expires_at ? new Date(code.expires_at).getTime() <= Date.now() : false;
  };

  return (
    <div className="space-y-6">
      {/* Header toolbar */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div className="relative max-w-sm flex-1">
          <IconSearch className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-400" />
          <input
            type="text"
            placeholder="Search promo codes..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="w-full rounded-xl border border-zinc-200 bg-white py-2 pl-9 pr-4 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
          />
        </div>
        {canManage && (
          <button
            type="button"
            onClick={openCreateDialog}
            className="inline-flex items-center justify-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white transition hover:bg-orange-800"
          >
            <IconPlus className="h-4 w-4" />
            New Promo Code
          </button>
        )}
      </div>

      {/* Code list or empty state */}
      {filteredCodes.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border border-dashed border-zinc-200 py-16 text-center">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-700">
            <IconTicket className="h-6 w-6" />
          </div>
          <h3 className="mt-4 text-base font-bold text-zinc-900">
            {search ? "No matching promo codes" : "No store promo codes yet"}
          </h3>
          <p className="mt-1 max-w-sm text-sm text-zinc-500">
            {search
              ? "Try adjusting your search query."
              : "Create discount codes that customers can apply to their shopping bag at Store checkout."}
          </p>
          {canManage && !search && (
            <button
              type="button"
              onClick={openCreateDialog}
              className="mt-5 inline-flex items-center gap-2 rounded-xl bg-orange-700 px-4 py-2.5 text-sm font-bold text-white hover:bg-orange-800"
            >
              <IconPlus className="h-4 w-4" />
              Create Promo Code
            </button>
          )}
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-zinc-200 bg-white shadow-xs">
          <table className="w-full text-left text-sm text-zinc-600">
            <thead className="border-b border-zinc-200 bg-zinc-50 text-xs font-semibold uppercase tracking-wider text-zinc-500">
              <tr>
                <th scope="col" className="px-5 py-3.5">
                  Code
                </th>
                <th scope="col" className="px-5 py-3.5">
                  Discount
                </th>
                <th scope="col" className="px-5 py-3.5">
                  Min. Order
                </th>
                <th scope="col" className="px-5 py-3.5">
                  Usage
                </th>
                <th scope="col" className="px-5 py-3.5">
                  Validity
                </th>
                <th scope="col" className="px-5 py-3.5">
                  Status
                </th>
                {canManage && (
                  <th scope="col" className="px-5 py-3.5 text-right">
                    Actions
                  </th>
                )}
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-200">
              {filteredCodes.map((promo) => {
                const expired = isExpired(promo);
                return (
                  <tr key={promo.id} className="hover:bg-zinc-50/70 transition-colors">
                    {/* Code */}
                    <td className="px-5 py-4 font-mono font-bold text-zinc-900">
                      <div className="flex items-center gap-2">
                        <span>{promo.code}</span>
                        <button
                          type="button"
                          onClick={() => handleCopyCode(promo.code, promo.id)}
                          title="Copy code"
                          className="rounded p-1 text-zinc-400 hover:bg-zinc-100 hover:text-zinc-600 transition"
                        >
                          {copiedCodeId === promo.id ? (
                            <IconCheck className="h-3.5 w-3.5 text-emerald-600" />
                          ) : (
                            <IconCopy className="h-3.5 w-3.5" />
                          )}
                        </button>
                      </div>
                    </td>

                    {/* Discount */}
                    <td className="px-5 py-4 font-medium text-zinc-900">
                      {promo.percent_off !== null ? (
                        <span className="inline-flex items-center gap-1 text-orange-700">
                          {promo.percent_off}% off
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-orange-700">
                          {promo.fixed_currency}{" "}
                          {(Number(promo.fixed_off_minor ?? 0) / 100).toFixed(2)} off
                        </span>
                      )}
                    </td>

                    {/* Min Subtotal */}
                    <td className="px-5 py-4">
                      {promo.min_subtotal_minor > 0
                        ? `${currency} ${(promo.min_subtotal_minor / 100).toFixed(2)}`
                        : "None"}
                    </td>

                    {/* Usage */}
                    <td className="px-5 py-4">
                      <span className="font-semibold text-zinc-900">{promo.used_count}</span>
                      <span className="text-zinc-400">
                        {" "}
                        / {promo.max_uses ? promo.max_uses : "∞"}
                      </span>
                    </td>

                    {/* Validity */}
                    <td className="px-5 py-4 text-xs text-zinc-500">
                      {promo.starts_at || promo.expires_at ? (
                        <div className="flex flex-col gap-0.5">
                          {promo.starts_at && (
                            <div>
                              From: {new Date(promo.starts_at).toLocaleDateString()}
                            </div>
                          )}
                          {promo.expires_at && (
                            <div>
                              Until: {new Date(promo.expires_at).toLocaleDateString()}
                            </div>
                          )}
                        </div>
                      ) : (
                        <span className="text-zinc-400">Always active</span>
                      )}
                    </td>

                    {/* Status */}
                    <td className="px-5 py-4">
                      {expired ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-semibold text-amber-700 border border-amber-200">
                          <IconClock className="h-3 w-3" /> Expired
                        </span>
                      ) : promo.is_active ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700 border border-emerald-200">
                          <span className="h-1.5 w-1.5 rounded-full bg-emerald-600" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-zinc-100 px-2.5 py-1 text-xs font-semibold text-zinc-600 border border-zinc-200">
                          Inactive
                        </span>
                      )}
                    </td>

                    {/* Actions */}
                    {canManage && (
                      <td className="px-5 py-4 text-right">
                        <div className="flex items-center justify-end gap-1">
                          <button
                            type="button"
                            onClick={() => handleToggleActive(promo)}
                            title={promo.is_active ? "Deactivate code" : "Activate code"}
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition"
                          >
                            <span className="text-xs font-medium">
                              {promo.is_active ? "Pause" : "Resume"}
                            </span>
                          </button>
                          <button
                            type="button"
                            onClick={() => openEditDialog(promo)}
                            title="Edit code"
                            className="rounded-lg p-1.5 text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900 transition"
                          >
                            <IconEdit className="h-4 w-4" />
                          </button>
                          <button
                            type="button"
                            onClick={() => setDeleteConfirmId(promo.id)}
                            title="Delete code"
                            className="rounded-lg p-1.5 text-zinc-400 hover:bg-red-50 hover:text-red-600 transition"
                          >
                            <IconTrash className="h-4 w-4" />
                          </button>
                        </div>
                      </td>
                    )}
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {/* Create / Edit Dialog */}
      <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {editingCode ? `Edit Promo Code: ${editingCode.code}` : "Create New Store Promo Code"}
            </DialogTitle>
            <DialogDescription>
              {editingCode
                ? "Update rules and discounts for this promotional code."
                : "Add a discount code customers can apply in their shopping cart at Store checkout."}
            </DialogDescription>
          </DialogHeader>

          <form onSubmit={handleSubmit} className="space-y-4 pt-2">
            {formError && (
              <div className="flex items-center gap-2 rounded-xl bg-red-50 p-3 text-xs font-medium text-red-700 border border-red-200">
                <IconAlertCircle className="h-4 w-4 shrink-0" />
                <span>{formError}</span>
              </div>
            )}

            {/* Code string (disabled on edit to prevent breaking distributed links) */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                Code Name *
              </label>
              <input
                type="text"
                disabled={Boolean(editingCode)}
                value={codeValue}
                onChange={(e) => setCodeValue(e.target.value.toUpperCase())}
                placeholder="e.g. SUMMER25"
                required
                className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-mono font-bold text-zinc-900 uppercase focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600 disabled:bg-zinc-100 disabled:text-zinc-500"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Letters, numbers, hyphens, and underscores only.
              </p>
            </div>

            {/* Discount Type */}
            <div>
              <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                Discount Type *
              </label>
              <div className="mt-1 grid grid-cols-2 gap-2">
                <button
                  type="button"
                  onClick={() => setDiscountType("percent")}
                  className={`rounded-xl border py-2 text-xs font-bold transition ${
                    discountType === "percent"
                      ? "border-orange-600 bg-orange-50 text-orange-700"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Percentage (%)
                </button>
                <button
                  type="button"
                  onClick={() => setDiscountType("fixed")}
                  className={`rounded-xl border py-2 text-xs font-bold transition ${
                    discountType === "fixed"
                      ? "border-orange-600 bg-orange-50 text-orange-700"
                      : "border-zinc-200 bg-white text-zinc-700 hover:bg-zinc-50"
                  }`}
                >
                  Fixed Amount
                </button>
              </div>
            </div>

            {/* Discount Value */}
            {discountType === "percent" ? (
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Percentage Off (1–90%) *
                </label>
                <div className="relative mt-1">
                  <input
                    type="number"
                    min="1"
                    max="90"
                    step="1"
                    value={percentValue}
                    onChange={(e) => setPercentValue(e.target.value)}
                    required
                    className="w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
                  />
                  <span className="absolute right-3 top-1/2 -translate-y-1/2 text-sm font-bold text-zinc-400">
                    %
                  </span>
                </div>
              </div>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                <div className="col-span-2">
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Amount Off *
                  </label>
                  <input
                    type="number"
                    min="0.01"
                    step="0.01"
                    value={fixedValue}
                    onChange={(e) => setFixedValue(e.target.value)}
                    required
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
                  />
                </div>
                <div>
                  <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                    Currency *
                  </label>
                  <input
                    type="text"
                    maxLength={3}
                    value={fixedCurrency}
                    onChange={(e) => setFixedCurrency(e.target.value.toUpperCase())}
                    required
                    className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm font-bold uppercase text-zinc-900 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
                  />
                </div>
              </div>
            )}

            {/* Minimum Order Subtotal & Max Uses */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Min. Order Subtotal
                </label>
                <input
                  type="number"
                  min="0"
                  step="0.01"
                  value={minSubtotal}
                  onChange={(e) => setMinSubtotal(e.target.value)}
                  placeholder="0.00"
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Usage Limit
                </label>
                <input
                  type="number"
                  min="1"
                  step="1"
                  value={maxUses}
                  onChange={(e) => setMaxUses(e.target.value)}
                  placeholder="Unlimited"
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-3 py-2 text-sm text-zinc-900 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
                />
              </div>
            </div>

            {/* Starts At & Expires At */}
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Starts At
                </label>
                <input
                  type="datetime-local"
                  value={startsAt}
                  onChange={(e) => setStartsAt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-900 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
                />
              </div>
              <div>
                <label className="block text-xs font-bold uppercase tracking-wider text-zinc-700">
                  Expires At
                </label>
                <input
                  type="datetime-local"
                  value={expiresAt}
                  onChange={(e) => setExpiresAt(e.target.value)}
                  className="mt-1 w-full rounded-xl border border-zinc-200 bg-white px-2 py-2 text-xs text-zinc-900 focus:border-orange-600 focus:outline-none focus:ring-1 focus:ring-orange-600"
                />
              </div>
            </div>

            {/* Active Toggle */}
            <div className="flex items-center justify-between rounded-xl border border-zinc-200 bg-zinc-50 p-3">
              <div>
                <div className="text-sm font-bold text-zinc-900">Active status</div>
                <div className="text-xs text-zinc-500">Allow customers to redeem this code immediately</div>
              </div>
              <input
                type="checkbox"
                checked={isActive}
                onChange={(e) => setIsActive(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-orange-600 focus:ring-orange-600"
              />
            </div>

            <DialogFooter className="pt-2">
              <button
                type="button"
                onClick={() => setIsDialogOpen(false)}
                disabled={isSubmitting}
                className="rounded-xl border border-zinc-200 px-4 py-2 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 transition"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-xl bg-orange-700 px-4 py-2 text-sm font-bold text-white hover:bg-orange-800 transition disabled:opacity-50"
              >
                {isSubmitting
                  ? "Saving..."
                  : editingCode
                  ? "Save Changes"
                  : "Create Code"}
              </button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <ConfirmDialog
        open={Boolean(deleteConfirmId)}
        onOpenChange={(open) => {
          if (!open) setDeleteConfirmId(null);
        }}
        title="Delete Promo Code"
        description="Are you sure you want to delete this promo code? Customers will no longer be able to redeem it. This action cannot be undone."
        confirmLabel={isDeleting ? "Deleting..." : "Delete"}
        variant="destructive"
        onConfirm={handleDeleteConfirm}
        loading={isDeleting}
      />
    </div>
  );
}
