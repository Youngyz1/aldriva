"use client";

import React, { useState, useTransition } from "react";
import {
  IconX as X,
  IconLoader2 as Loader2,
  IconSnowflake as Snowflake,
} from "@tabler/icons-react";
import { ImageUploader } from "@/components/shared/ImageUploader";
import type { VehicleCategoryRow } from "@/lib/actions/rental-categories";
import { createVehicleCategory, updateVehicleCategory } from "@/lib/actions/rental-categories";

export interface CategoryFormDialogProps {
  organizerId: string;
  businessId: string;
  category?: VehicleCategoryRow | null;
  open: boolean;
  onClose: () => void;
  onSaved: (cat: VehicleCategoryRow) => void;
}

export function CategoryFormDialog({
  organizerId,
  businessId,
  category,
  open,
  onClose,
  onSaved,
}: CategoryFormDialogProps) {
  const isEditing = Boolean(category?.id);
  const [name, setName] = useState(category?.name || "");
  const [description, setDescription] = useState(category?.description || "");
  const [dailyRate, setDailyRate] = useState<string>(
    category ? String(category.daily_rate) : ""
  );
  const [weeklyRate, setWeeklyRate] = useState<string>(
    category?.weekly_rate != null ? String(category.weekly_rate) : ""
  );
  const [depositAmount, setDepositAmount] = useState<string>(
    category ? String(category.deposit_amount) : "0"
  );
  const [currency, setCurrency] = useState(category?.currency || "USD");
  const [seats, setSeats] = useState<number>(
    category?.specs?.seats ? Number(category.specs.seats) : 5
  );
  const [transmission, setTransmission] = useState<"automatic" | "manual">(
    category?.specs?.transmission === "manual" ? "manual" : "automatic"
  );
  const [doors, setDoors] = useState<number>(
    category?.specs?.doors ? Number(category.specs.doors) : 4
  );
  const [luggage, setLuggage] = useState<number>(
    category?.specs?.luggage ? Number(category.specs.luggage) : 2
  );
  const [ac, setAc] = useState<boolean>(
    category?.specs?.ac !== undefined ? Boolean(category.specs.ac) : true
  );
  const [photoUrl, setPhotoUrl] = useState<string | null>(category?.photo_url || null);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  if (!open) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const dRate = parseFloat(dailyRate);
    if (isNaN(dRate) || dRate < 0) {
      setError("Please provide a valid non-negative daily rate.");
      return;
    }

    const wRate = weeklyRate.trim() ? parseFloat(weeklyRate) : null;
    if (wRate !== null && (isNaN(wRate) || wRate < 0)) {
      setError("Weekly rate must be a valid non-negative number.");
      return;
    }

    const depAmount = parseFloat(depositAmount);
    if (isNaN(depAmount) || depAmount < 0) {
      setError("Please provide a valid non-negative deposit amount.");
      return;
    }

    startTransition(async () => {
      const specs = {
        seats,
        transmission,
        doors,
        luggage,
        ac,
      };

      if (isEditing && category) {
        const res = await updateVehicleCategory({
          categoryId: category.id,
          organizerId,
          name,
          description,
          dailyRate: dRate,
          weeklyRate: wRate,
          depositAmount: depAmount,
          currency,
          specs,
          photoUrl,
        });
        if (res.success && res.data) {
          onSaved(res.data);
          onClose();
        } else {
          setError(res.error || "Failed to update category.");
        }
      } else {
        const res = await createVehicleCategory({
          organizerId,
          businessId,
          name,
          description,
          dailyRate: dRate,
          weeklyRate: wRate,
          depositAmount: depAmount,
          currency,
          specs,
          photoUrl,
        });
        if (res.success && res.data) {
          onSaved(res.data);
          onClose();
        } else {
          setError(res.error || "Failed to create category.");
        }
      }
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/50 backdrop-blur-xs transition-opacity"
        onClick={onClose}
        aria-hidden="true"
      />

      {/* Dialog window */}
      <div className="relative w-full max-w-xl max-h-[90vh] overflow-y-auto rounded-2xl bg-white p-6 shadow-2xl z-10">
        <div className="flex items-center justify-between border-b border-zinc-100 pb-3">
          <h2 className="text-base font-bold text-zinc-900">
            {isEditing ? "Edit Vehicle Category" : "New Vehicle Category"}
          </h2>
          <button
            type="button"
            onClick={onClose}
            className="flex h-9 w-9 items-center justify-center rounded-lg text-zinc-400 hover:bg-zinc-100 hover:text-zinc-700"
          >
            <X className="h-5 w-5" />
            <span className="sr-only">Close</span>
          </button>
        </div>

        {error && (
          <div className="mt-3 rounded-lg bg-red-50 p-3 text-xs font-semibold text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-4 space-y-4">
          {/* Category Photo */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Category Representative Photo
            </label>
            <ImageUploader
              bucket="cms-media"
              folder={`rental-categories/${organizerId}`}
              value={photoUrl}
              onUploaded={(url: string) => setPhotoUrl(url)}
              onRemove={() => setPhotoUrl(null)}
              label="Upload Category Image"
            />
          </div>

          {/* Name & Currency */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div className="sm:col-span-2">
              <label htmlFor="cat-name" className="block text-xs font-bold text-zinc-700 mb-1">
                Category Name *
              </label>
              <input
                id="cat-name"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="e.g. Compact SUV, Economy Sedan"
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label htmlFor="cat-currency" className="block text-xs font-bold text-zinc-700 mb-1">
                Currency
              </label>
              <select
                id="cat-currency"
                value={currency}
                onChange={(e) => setCurrency(e.target.value.toUpperCase())}
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-800 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              >
                <option value="USD">USD ($)</option>
                <option value="EUR">EUR (€)</option>
                <option value="GBP">GBP (£)</option>
                <option value="CAD">CAD ($)</option>
                <option value="AUD">AUD ($)</option>
              </select>
            </div>
          </div>

          {/* Description */}
          <div>
            <label htmlFor="cat-desc" className="block text-xs font-bold text-zinc-700 mb-1">
              Description (Optional)
            </label>
            <textarea
              id="cat-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="e.g. Ideal for road trips and small families with generous trunk space."
              className="w-full rounded-xl border border-zinc-200 bg-white p-3 text-sm text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
            />
          </div>

          {/* Pricing Row: Daily, Weekly, Deposit */}
          <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
            <div>
              <label htmlFor="cat-daily-rate" className="block text-xs font-bold text-zinc-700 mb-1">
                Daily Rate ({currency}) *
              </label>
              <input
                id="cat-daily-rate"
                type="number"
                step="0.01"
                min="0"
                required
                value={dailyRate}
                onChange={(e) => setDailyRate(e.target.value)}
                placeholder="65.00"
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-mono text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label htmlFor="cat-weekly-rate" className="block text-xs font-bold text-zinc-700 mb-1">
                Weekly Rate ({currency})
              </label>
              <input
                id="cat-weekly-rate"
                type="number"
                step="0.01"
                min="0"
                value={weeklyRate}
                onChange={(e) => setWeeklyRate(e.target.value)}
                placeholder="Optional block rate"
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-mono text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>

            <div>
              <label htmlFor="cat-deposit" className="block text-xs font-bold text-zinc-700 mb-1">
                Security Deposit ({currency}) *
              </label>
              <input
                id="cat-deposit"
                type="number"
                step="0.01"
                min="0"
                required
                value={depositAmount}
                onChange={(e) => setDepositAmount(e.target.value)}
                placeholder="200.00"
                className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-mono text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
              />
            </div>
          </div>
          <p className="text-[11px] text-zinc-500">
            Note: Security deposits are strictly tracked as temporary liability records upon booking and are never treated as rental revenue.
          </p>

          {/* Technical Specs */}
          <div className="rounded-xl border border-zinc-100 bg-zinc-50 p-3.5 space-y-3">
            <h3 className="text-xs font-bold uppercase tracking-wider text-zinc-600">
              Vehicle Specifications & Amenities
            </h3>

            <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
              <div>
                <label htmlFor="spec-seats" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Seats
                </label>
                <input
                  id="spec-seats"
                  type="number"
                  min="1"
                  max="50"
                  value={seats}
                  onChange={(e) => setSeats(parseInt(e.target.value) || 1)}
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800"
                />
              </div>

              <div>
                <label htmlFor="spec-transmission" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Transmission
                </label>
                <select
                  id="spec-transmission"
                  value={transmission}
                  onChange={(e) => setTransmission(e.target.value as "automatic" | "manual")}
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2 text-xs font-semibold text-zinc-800"
                >
                  <option value="automatic">Automatic</option>
                  <option value="manual">Manual</option>
                </select>
              </div>

              <div>
                <label htmlFor="spec-doors" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Doors
                </label>
                <input
                  id="spec-doors"
                  type="number"
                  min="2"
                  max="6"
                  value={doors}
                  onChange={(e) => setDoors(parseInt(e.target.value) || 2)}
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800"
                />
              </div>

              <div>
                <label htmlFor="spec-luggage" className="block text-xs font-semibold text-zinc-700 mb-1">
                  Luggage Bags
                </label>
                <input
                  id="spec-luggage"
                  type="number"
                  min="0"
                  max="20"
                  value={luggage}
                  onChange={(e) => setLuggage(parseInt(e.target.value) || 0)}
                  className="h-9 w-full rounded-lg border border-zinc-200 bg-white px-2.5 text-xs text-zinc-800"
                />
              </div>
            </div>

            <div className="flex items-center gap-2 pt-1">
              <input
                id="spec-ac"
                type="checkbox"
                checked={ac}
                onChange={(e) => setAc(e.target.checked)}
                className="h-4 w-4 rounded border-zinc-300 text-brand-600 focus:ring-brand-600"
              />
              <label htmlFor="spec-ac" className="text-xs font-semibold text-zinc-800 flex items-center gap-1.5 cursor-pointer">
                <Snowflake className="h-3.5 w-3.5 text-sky-600" />
                Air Conditioning (A/C) Included
              </label>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-end gap-2 border-t border-zinc-100 pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={isPending}
              className="min-h-[44px] rounded-xl px-4 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-5 text-xs font-bold text-white hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:opacity-50"
            >
              {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
              {isEditing ? "Save Changes" : "Create Category"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
