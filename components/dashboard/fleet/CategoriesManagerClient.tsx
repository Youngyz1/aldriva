"use client";

import React, { useState, useTransition } from "react";
import Link from "next/link";
import Image from "next/image";
import {
  IconPlus as Plus,
  IconTag as Tag,
  IconEdit as Edit,
  IconTrash as Trash,
  IconUsers as Users,
  IconLuggage as Luggage,
  IconSnowflake as Snowflake,
  IconArrowLeft as ArrowLeft,
  IconCar as Car,
  IconLoader2 as Loader2,
} from "@tabler/icons-react";
import type { VehicleCategoryRow } from "@/lib/actions/rental-categories";
import { deleteVehicleCategory } from "@/lib/actions/rental-categories";
import { CategoryFormDialog } from "./CategoryFormDialog";

export interface CategoriesManagerClientProps {
  initialCategories: VehicleCategoryRow[];
  organizerId: string;
  businessId: string;
  canManage: boolean;
}

export function CategoriesManagerClient({
  initialCategories,
  organizerId,
  businessId,
  canManage,
}: CategoriesManagerClientProps) {
  const [categories, setCategories] = useState<VehicleCategoryRow[]>(initialCategories);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingCategory, setEditingCategory] = useState<VehicleCategoryRow | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmDeleteId, setConfirmDeleteId] = useState<string | null>(null);
  const [deleteError, setDeleteError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  const handleOpenNew = () => {
    setEditingCategory(null);
    setDialogOpen(true);
  };

  const handleOpenEdit = (cat: VehicleCategoryRow) => {
    setEditingCategory(cat);
    setDialogOpen(true);
  };

  const handleSaved = (saved: VehicleCategoryRow) => {
    setCategories((prev) => {
      const exists = prev.some((c) => c.id === saved.id);
      if (exists) {
        return prev.map((c) => (c.id === saved.id ? { ...c, ...saved } : c));
      }
      return [...prev, saved];
    });
  };

  const handleDelete = (categoryId: string) => {
    setDeletingId(categoryId);
    setDeleteError(null);

    startTransition(async () => {
      const res = await deleteVehicleCategory(categoryId, organizerId);
      if (res.success) {
        setCategories((prev) => prev.filter((c) => c.id !== categoryId));
        setConfirmDeleteId(null);
      } else {
        setDeleteError(res.error || "Failed to delete category.");
      }
      setDeletingId(null);
    });
  };

  return (
    <div className="space-y-6">
      {/* Back and action header */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <Link
            href={`/dashboard/org/${organizerId}/fleet`}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
          >
            <ArrowLeft className="h-3.5 w-3.5" />
            Back to Fleet Directory
          </Link>
          <h1 className="mt-2 text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            Vehicle Categories & Rate Plans
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Define vehicle classes, specifications, daily rates, and security deposit requirements.
          </p>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={handleOpenNew}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-4 text-xs font-bold text-white hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 shrink-0 self-start sm:self-auto"
          >
            <Plus className="h-4 w-4" />
            New Category
          </button>
        )}
      </div>

      {deleteError && (
        <div className="rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-800">
          {deleteError}
        </div>
      )}

      {/* Categories List */}
      {categories.length === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 sm:p-12 text-center">
          <Tag className="mx-auto h-12 w-12 text-zinc-300" />
          <h2 className="mt-4 text-base font-bold text-zinc-900">
            No vehicle categories configured yet
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-zinc-500 sm:text-sm">
            Categories group your vehicles (e.g. Economy, Compact SUV, Luxury Sedan) and set baseline daily rental rates, deposits, and specifications.
          </p>
          {canManage && (
            <div className="mt-6">
              <button
                type="button"
                onClick={handleOpenNew}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-5 text-xs font-bold text-white hover:bg-orange-800"
              >
                <Plus className="h-4 w-4" />
                Create First Category
              </button>
            </div>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {categories.map((cat) => (
            <div
              key={cat.id}
              className="flex flex-col justify-between rounded-xl border border-zinc-200 bg-white p-5 shadow-xs transition hover:border-zinc-300"
            >
              <div>
                {/* Photo Header */}
                {cat.photo_url ? (
                  <div className="relative mb-3 h-36 w-full overflow-hidden rounded-lg bg-zinc-100">
                    <Image
                      src={cat.photo_url}
                      alt={cat.name}
                      fill
                      sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
                      className="object-cover"
                    />
                  </div>
                ) : (
                  <div className="mb-3 flex h-24 w-full items-center justify-center rounded-lg bg-zinc-50 text-zinc-300">
                    <Car className="h-10 w-10" />
                  </div>
                )}

                <div className="flex items-start justify-between gap-2">
                  <div>
                    <h3 className="text-base font-bold text-zinc-900">{cat.name}</h3>
                    <p className="font-mono text-xs text-zinc-400">/{cat.slug}</p>
                  </div>
                  <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-semibold text-zinc-700">
                    {cat.vehicle_count ?? 0} {cat.vehicle_count === 1 ? "unit" : "units"}
                  </span>
                </div>

                {cat.description && (
                  <p className="mt-2 line-clamp-2 text-xs text-zinc-600">
                    {cat.description}
                  </p>
                )}

                {/* Rates */}
                <div className="mt-4 rounded-lg bg-zinc-50 p-3">
                  <div className="flex items-baseline justify-between">
                    <span className="text-xs text-zinc-500">Daily Rate:</span>
                    <span className="font-mono text-base font-extrabold text-zinc-900">
                      ${cat.daily_rate.toFixed(2)}
                      <span className="text-xs font-normal text-zinc-500">
                        {" "}
                        {cat.currency}/day
                      </span>
                    </span>
                  </div>
                  {cat.weekly_rate != null && (
                    <div className="mt-1 flex items-baseline justify-between text-xs text-zinc-500">
                      <span>Weekly Block:</span>
                      <span className="font-mono font-bold text-zinc-800">
                        ${cat.weekly_rate.toFixed(2)}
                        <span className="font-normal text-zinc-400">
                          {" "}
                          {cat.currency}/wk
                        </span>
                      </span>
                    </div>
                  )}
                  <div className="mt-1.5 flex items-baseline justify-between border-t border-zinc-200/60 pt-1.5 text-xs text-zinc-500">
                    <span>Security Deposit:</span>
                    <span className="font-mono font-semibold text-zinc-800">
                      ${cat.deposit_amount.toFixed(2)}
                    </span>
                  </div>
                </div>

                {/* Specs Pills */}
                <div className="mt-3 flex flex-wrap items-center gap-1.5 text-[11px] font-semibold text-zinc-600">
                  {cat.specs?.seats && (
                    <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5">
                      <Users className="h-3 w-3 text-zinc-400" />
                      {cat.specs.seats} seats
                    </span>
                  )}
                  {cat.specs?.transmission && (
                    <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5 capitalize">
                      {cat.specs.transmission}
                    </span>
                  )}
                  {cat.specs?.luggage && (
                    <span className="inline-flex items-center gap-1 rounded bg-zinc-100 px-2 py-0.5">
                      <Luggage className="h-3 w-3 text-zinc-400" />
                      {cat.specs.luggage} bags
                    </span>
                  )}
                  {cat.specs?.ac && (
                    <span className="inline-flex items-center gap-1 rounded bg-sky-50 text-sky-700 px-2 py-0.5">
                      <Snowflake className="h-3 w-3" />
                      A/C
                    </span>
                  )}
                </div>
              </div>

              {/* Action Buttons */}
              {canManage && (
                <div className="mt-5 flex items-center justify-between border-t border-zinc-100 pt-3">
                  {confirmDeleteId === cat.id ? (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        disabled={isPending && deletingId === cat.id}
                        onClick={() => handleDelete(cat.id)}
                        className="inline-flex min-h-[36px] items-center gap-1 rounded-lg bg-red-600 px-3 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                      >
                        {isPending && deletingId === cat.id && (
                          <Loader2 className="h-3 w-3 animate-spin" />
                        )}
                        Confirm Delete
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmDeleteId(null)}
                        className="text-xs font-semibold text-zinc-500 hover:text-zinc-800"
                      >
                        Cancel
                      </button>
                    </div>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteId(cat.id)}
                      className="inline-flex min-h-[36px] items-center gap-1 text-xs font-semibold text-red-600 hover:text-red-700"
                    >
                      <Trash className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleOpenEdit(cat)}
                    className="inline-flex min-h-[36px] items-center gap-1 rounded-lg px-3 text-xs font-bold text-orange-700 hover:bg-orange-50"
                  >
                    <Edit className="h-3.5 w-3.5" />
                    Edit Category
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Create / Edit Modal Dialog */}
      <CategoryFormDialog
        organizerId={organizerId}
        businessId={businessId}
        category={editingCategory}
        open={dialogOpen}
        onClose={() => setDialogOpen(false)}
        onSaved={handleSaved}
      />
    </div>
  );
}
