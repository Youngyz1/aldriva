"use client";

import React, { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import {
  IconLoader2 as Loader2,
  IconArrowLeft as ArrowLeft,
  IconTrash as Trash,
} from "@tabler/icons-react";
import type { VehicleRow, VehicleStatus, VehicleFuelType } from "@/lib/actions/vehicles";
import type { VehicleCategoryRow } from "@/lib/actions/rental-categories";
import { createVehicle, updateVehicle, deleteVehicle } from "@/lib/actions/vehicles";
import { ImageUploader } from "@/components/shared/ImageUploader";

export interface BranchOption {
  id: string;
  label: string;
  address?: string | null;
}

export interface VehicleFormProps {
  organizerId: string;
  businessId: string;
  vehicle?: VehicleRow | null;
  categories: VehicleCategoryRow[];
  branches: BranchOption[];
}

export function VehicleForm({
  organizerId,
  businessId,
  vehicle,
  categories,
  branches,
}: VehicleFormProps) {
  const router = useRouter();
  const isEditing = Boolean(vehicle?.id);

  const [make, setMake] = useState(vehicle?.make || "");
  const [model, setModel] = useState(vehicle?.model || "");
  const [year, setYear] = useState<number>(
    vehicle?.year || new Date().getFullYear()
  );
  const [licensePlate, setLicensePlate] = useState(vehicle?.license_plate || "");
  const [categoryId, setCategoryId] = useState(
    vehicle?.category_id || categories[0]?.id || ""
  );
  const [branchId, setBranchId] = useState(vehicle?.branch_id || "");
  const [currentMileage, setCurrentMileage] = useState<number>(
    vehicle?.current_mileage || 0
  );
  const [fuelType, setFuelType] = useState<VehicleFuelType>(
    vehicle?.fuel_type || "gasoline"
  );
  const [status, setStatus] = useState<VehicleStatus>(
    vehicle?.status || "available"
  );
  const [vin, setVin] = useState(vehicle?.vin || "");
  const [color, setColor] = useState(vehicle?.color || "");
  const [photoUrl, setPhotoUrl] = useState<string | null>(vehicle?.photo_url || null);

  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();
  const [isDeleting, setIsDeleting] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (!categoryId) {
      setError("Please select a vehicle category.");
      return;
    }

    startTransition(async () => {
      if (isEditing && vehicle) {
        const res = await updateVehicle({
          vehicleId: vehicle.id,
          organizerId,
          categoryId,
          branchId: branchId || null,
          make,
          model,
          year,
          licensePlate,
          vin: vin || null,
          color: color || null,
          photoUrl,
          currentMileage,
          fuelType,
          status,
        });

        if (res.success) {
          router.push(`/dashboard/org/${organizerId}/fleet`);
          router.refresh();
        } else {
          setError(res.error || "Failed to update vehicle.");
        }
      } else {
        const res = await createVehicle({
          organizerId,
          businessId,
          categoryId,
          branchId: branchId || null,
          make,
          model,
          year,
          licensePlate,
          vin: vin || null,
          color: color || null,
          photoUrl,
          currentMileage,
          fuelType,
          status,
        });

        if (res.success) {
          router.push(`/dashboard/org/${organizerId}/fleet`);
          router.refresh();
        } else {
          setError(res.error || "Failed to create vehicle.");
        }
      }
    });
  };

  const handleDelete = () => {
    if (!vehicle) return;
    setIsDeleting(true);
    setError(null);

    startTransition(async () => {
      const res = await deleteVehicle(vehicle.id, organizerId);
      if (res.success) {
        router.push(`/dashboard/org/${organizerId}/fleet`);
        router.refresh();
      } else {
        setError(res.error || "Failed to delete vehicle.");
        setIsDeleting(false);
        setConfirmDelete(false);
      }
    });
  };

  return (
    <div className="space-y-6">
      {/* Back button */}
      <div>
        <Link
          href={`/dashboard/org/${organizerId}/fleet`}
          className="inline-flex items-center gap-1.5 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
        >
          <ArrowLeft className="h-3.5 w-3.5" />
          Back to Fleet Directory
        </Link>
      </div>

      <div className="rounded-2xl border border-zinc-200 bg-white p-6 shadow-xs">
        <div className="border-b border-zinc-100 pb-4">
          <h1 className="text-lg font-bold text-zinc-900">
            {isEditing ? `Edit Vehicle (${vehicle?.license_plate})` : "Register New Fleet Vehicle"}
          </h1>
          <p className="mt-1 text-xs text-zinc-500">
            Physical vehicle assets are tracked individually by license plate and assigned to customer bookings.
          </p>
        </div>

        {error && (
          <div className="mt-4 rounded-xl bg-red-50 p-3.5 text-xs font-semibold text-red-800">
            {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="mt-6 space-y-6">
          {/* Vehicle Photo */}
          <div>
            <label className="block text-xs font-bold text-zinc-700 mb-1">
              Vehicle Photo
            </label>
            <ImageUploader
              bucket="cms-media"
              folder={`rental-vehicles/${organizerId}`}
              value={photoUrl}
              onUploaded={(url: string) => setPhotoUrl(url)}
              onRemove={() => setPhotoUrl(null)}
              label="Upload Vehicle Photo"
            />
            <span className="text-[11px] text-zinc-400">
              Falls back to the category photo on the Fleet cards when not set.
            </span>
          </div>

          {/* Identity & Model Section */}
          <div className="space-y-4 border-t border-zinc-100 pt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Vehicle Identity
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="veh-make" className="block text-xs font-bold text-zinc-700 mb-1">
                  Make *
                </label>
                <input
                  id="veh-make"
                  type="text"
                  required
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                  placeholder="e.g. Toyota"
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>

              <div>
                <label htmlFor="veh-model" className="block text-xs font-bold text-zinc-700 mb-1">
                  Model *
                </label>
                <input
                  id="veh-model"
                  type="text"
                  required
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                  placeholder="e.g. RAV4"
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>

              <div>
                <label htmlFor="veh-year" className="block text-xs font-bold text-zinc-700 mb-1">
                  Year *
                </label>
                <input
                  id="veh-year"
                  type="number"
                  min="1900"
                  max={new Date().getFullYear() + 2}
                  required
                  value={year}
                  onChange={(e) => setYear(parseInt(e.target.value) || 2024)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-mono text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="veh-plate" className="block text-xs font-bold text-zinc-700 mb-1">
                  License Plate *
                </label>
                <input
                  id="veh-plate"
                  type="text"
                  required
                  value={licensePlate}
                  onChange={(e) => setLicensePlate(e.target.value.toUpperCase())}
                  placeholder="e.g. ABC-1234"
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-mono uppercase font-bold text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
                <span className="text-[11px] text-zinc-400">Must be unique per business.</span>
              </div>

              <div>
                <label htmlFor="veh-vin" className="block text-xs font-bold text-zinc-700 mb-1">
                  VIN (Optional)
                </label>
                <input
                  id="veh-vin"
                  type="text"
                  value={vin}
                  onChange={(e) => setVin(e.target.value.toUpperCase())}
                  placeholder="17-character VIN"
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-mono uppercase text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>

              <div>
                <label htmlFor="veh-color" className="block text-xs font-bold text-zinc-700 mb-1">
                  Exterior Color
                </label>
                <input
                  id="veh-color"
                  type="text"
                  value={color}
                  onChange={(e) => setColor(e.target.value)}
                  placeholder="e.g. Silver, Pearl White"
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>
            </div>
          </div>

          {/* Classification & Depot Section */}
          <div className="space-y-4 border-t border-zinc-100 pt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Classification & Station
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div>
                <label htmlFor="veh-cat" className="block text-xs font-bold text-zinc-700 mb-1">
                  Rate Category *
                </label>
                <select
                  id="veh-cat"
                  required
                  value={categoryId}
                  onChange={(e) => setCategoryId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  {categories.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name} (${c.daily_rate}/day)
                    </option>
                  ))}
                </select>
                <span className="text-[11px] text-zinc-400">
                  Defines daily rental rate and security deposit.
                </span>
              </div>

              <div>
                <label htmlFor="veh-branch" className="block text-xs font-bold text-zinc-700 mb-1">
                  Stationed Depot / Branch
                </label>
                <select
                  id="veh-branch"
                  value={branchId}
                  onChange={(e) => setBranchId(e.target.value)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  <option value="">Main Depot (Default)</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.label} {b.address ? `(${b.address})` : ""}
                    </option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Operational Metrics Section */}
          <div className="space-y-4 border-t border-zinc-100 pt-5">
            <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-500">
              Operational Status
            </h2>

            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <div>
                <label htmlFor="veh-mileage" className="block text-xs font-bold text-zinc-700 mb-1">
                  Current Mileage (Odometer) *
                </label>
                <input
                  id="veh-mileage"
                  type="number"
                  min="0"
                  required
                  value={currentMileage}
                  onChange={(e) => setCurrentMileage(parseInt(e.target.value) || 0)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-mono text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                />
              </div>

              <div>
                <label htmlFor="veh-fuel" className="block text-xs font-bold text-zinc-700 mb-1">
                  Fuel Type
                </label>
                <select
                  id="veh-fuel"
                  value={fuelType}
                  onChange={(e) => setFuelType(e.target.value as VehicleFuelType)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  <option value="gasoline">Gasoline (Petrol)</option>
                  <option value="diesel">Diesel</option>
                  <option value="hybrid">Hybrid</option>
                  <option value="electric">Electric (EV)</option>
                </select>
              </div>

              <div>
                <label htmlFor="veh-status" className="block text-xs font-bold text-zinc-700 mb-1">
                  Current Status
                </label>
                <select
                  id="veh-status"
                  value={status}
                  onChange={(e) => setStatus(e.target.value as VehicleStatus)}
                  className="h-10 w-full rounded-xl border border-zinc-200 bg-white px-3 text-sm font-semibold text-zinc-900 focus:border-brand-600 focus:outline-none focus:ring-1 focus:ring-brand-600"
                >
                  <option value="available">Available</option>
                  <option value="rented">Out on Rental</option>
                  <option value="maintenance">In Maintenance</option>
                  <option value="out_of_service">Out of Service</option>
                </select>
              </div>
            </div>
          </div>

          {/* Form Actions */}
          <div className="flex items-center justify-between border-t border-zinc-100 pt-5">
            {isEditing && (
              <div>
                {!confirmDelete ? (
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-red-200 px-3.5 text-xs font-bold text-red-700 hover:bg-red-50 focus:outline-none"
                  >
                    <Trash className="h-4 w-4" />
                    Delete Vehicle
                  </button>
                ) : (
                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      disabled={isDeleting}
                      onClick={handleDelete}
                      className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-red-600 px-4 text-xs font-bold text-white hover:bg-red-700 disabled:opacity-50"
                    >
                      {isDeleting && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                      Confirm Delete
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDelete(false)}
                      className="min-h-[44px] px-3 text-xs font-semibold text-zinc-600 hover:text-zinc-900"
                    >
                      Cancel
                    </button>
                  </div>
                )}
              </div>
            )}

            <div className="flex items-center gap-2 ml-auto">
              <Link
                href={`/dashboard/org/${organizerId}/fleet`}
                className="inline-flex min-h-[44px] items-center rounded-xl px-4 text-xs font-bold text-zinc-600 hover:bg-zinc-100"
              >
                Cancel
              </Link>
              <button
                type="submit"
                disabled={isPending}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-6 text-xs font-bold text-white hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2 disabled:opacity-50"
              >
                {isPending && <Loader2 className="h-3.5 w-3.5 animate-spin" />}
                {isEditing ? "Save Changes" : "Register Vehicle"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
