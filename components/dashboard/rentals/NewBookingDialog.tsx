"use client";

/**
 * components/dashboard/rentals/NewBookingDialog.tsx
 *
 * Owner/staff new rental booking entry dialog.
 * Calls createRentalBooking server action via form action pattern.
 * Mobile-first. docs/design/rental/architecture.md Decision 10.
 */

import { vehicleLabel } from "@/lib/vehicle-label";
import React, { useState, useTransition, useRef, useEffect } from "react";
import {
  IconX as X,
  IconLoader2 as Loader,
} from "@tabler/icons-react";

export interface VehicleCategoryOption {
  id: string;
  name: string;
  daily_rate: number;
  weekly_rate: number | null;
  deposit_amount: number;
  currency: string;
}

export interface BranchOption {
  id: string;
  label: string;
  city?: string | null;
}

export interface VehicleOption {
  id: string;
  make: string;
  model: string;
  license_plate: string;
  category_id: string;
  status: string;
}

export interface NewBookingDialogProps {
  open: boolean;
  onClose: () => void;
  organizerId: string;
  businessId: string;
  categories: VehicleCategoryOption[];
  branches: BranchOption[];
  vehicles: VehicleOption[];
  onSuccess?: () => void;
  /**
   * Optional prefill from the calendar's empty-cell click: a specific
   * vehicle and pickup date (YYYY-MM-DD). Absent for every other entry
   * point (the "+ New Booking" button), which keeps its existing
   * behavior unchanged. Never touches payment state.
   */
  prefillVehicleId?: string;
  prefillStartDate?: string;
}

function formatDate(iso: string): string {
  return iso.split("T")[0] ?? "";
}

function pad2(n: number): string {
  return String(n).padStart(2, "0");
}
function localDateStr(d: Date): string {
  return String(d.getFullYear()) + "-" + pad2(d.getMonth() + 1) + "-" + pad2(d.getDate());
}
function localTimeStr(d: Date): string {
  return pad2(d.getHours()) + ":" + pad2(d.getMinutes());
}
// Pickup = now rounded up to the next 5 minutes (local time). Return = pickup + 24h.
function defaultWindow() {
  const step = 5 * 60000;
  const start = new Date(Math.ceil(Date.now() / step) * step);
  const end = new Date(start.getTime() + 86400000);
  return {
    startDate: localDateStr(start),
    startTime: localTimeStr(start),
    endDate: localDateStr(end),
    endTime: localTimeStr(end),
  };
}

export function NewBookingDialog({
  open,
  onClose,
  organizerId,
  businessId,
  categories,
  branches,
  vehicles,
  onSuccess,
  prefillVehicleId,
  prefillStartDate,
}: NewBookingDialogProps) {
  const [isPending, startTransition] = useTransition();
  const startDateRef = useRef<HTMLInputElement | null>(null);
  const startTimeRef = useRef<HTMLInputElement | null>(null);
  const endDateRef = useRef<HTMLInputElement | null>(null);
  const endTimeRef = useRef<HTMLInputElement | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState("");
  const [vehicleId, setVehicleId] = useState("");

  const today = formatDate(new Date().toISOString());
  const tomorrow = formatDate(new Date(Date.now() + 86400000).toISOString());
  const [startDate, setStartDate] = useState(() => defaultWindow().startDate);
  const [startTime, setStartTime] = useState(() => defaultWindow().startTime);
  const [endDate, setEndDate] = useState(() => defaultWindow().endDate);
  const [endTime, setEndTime] = useState(() => defaultWindow().endTime);
  const [paymentMethod, setPaymentMethod] = useState<"none" | "cash" | "card_terminal" | "mobile_money">("none");
  const [paymentAmount, setPaymentAmount] = useState("");
  const [createdBookingId, setCreatedBookingId] = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    const d = defaultWindow();
    setStartDate(d.startDate);
    setStartTime(d.startTime);
    setEndDate(d.endDate);
    setEndTime(d.endTime);
    setError(null);
    setPaymentMethod("none");
    setPaymentAmount("");
    setCreatedBookingId(null);
  }, [open]);

  // Calendar empty-cell prefill only — runs after the reset effect above
  // and only overrides what was actually supplied, so every other entry
  // point (no prefill props) is completely unaffected. Never touches
  // paymentMethod/paymentAmount.
  useEffect(() => {
    if (!open) return;
    if (prefillStartDate) {
      setStartDate(prefillStartDate);
      const nextDay = new Date(`${prefillStartDate}T00:00:00`);
      nextDay.setDate(nextDay.getDate() + 1);
      setEndDate(localDateStr(nextDay));
    }
    if (prefillVehicleId) {
      setVehicleId(prefillVehicleId);
      const v = vehicles.find((veh) => veh.id === prefillVehicleId);
      if (v) setCategoryId(v.category_id);
    }
  }, [open, prefillVehicleId, prefillStartDate, vehicles]);

  const selectedCat = categories.find((c) => c.id === categoryId) ?? null;
  const startMs = new Date(`${startDate}T${startTime || "10:00"}:00`).getTime();
  const endMs = new Date(`${endDate}T${endTime || "10:00"}:00`).getTime();
  const validRange = Number.isFinite(startMs) && Number.isFinite(endMs) && endMs > startMs;
  const summaryDays = validRange ? Math.max(1, Math.ceil((endMs - startMs) / 86400000)) : 0;
  const summaryTotal = selectedCat ? summaryDays * selectedCat.daily_rate : 0;
  const pickupStale = Number.isFinite(startMs) && startMs < Date.now() - 5 * 60000;
  const filteredVehicles = vehicles.filter(
    (v) => !categoryId || v.category_id === categoryId
  );

  async function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setError(null);
    if (paymentMethod !== "none" && !(Number(paymentAmount) > 0)) {
      setError("Enter the amount received, or choose No payment now.");
      return;
    }
    if (createdBookingId && paymentMethod !== "none") {
      const retryId = createdBookingId;
      const retryMethod = paymentMethod;
      startTransition(async () => {
        const { recordCounterPayment } = await import("@/lib/actions/rental-bookings");
        const pay = await recordCounterPayment(retryId, organizerId, { method: retryMethod, amount: Number(paymentAmount) });
        if (!pay.success) {
          setError("The booking exists, but the payment was NOT recorded: " + pay.error);
          return;
        }
        setCreatedBookingId(null);
        onSuccess?.();
        onClose();
      });
      return;
    }
    const fd = new FormData(e.currentTarget);
    if (!(new Date(`${endDate}T${endTime || "10:00"}:00`) > new Date(`${startDate}T${startTime || "10:00"}:00`))) {
      setError("The return date and time must be after the pickup.");
      return;
    }

    if (new Date(`${startDate}T${startTime || "10:00"}:00`).getTime() < Date.now() - 5 * 60000) {
      setError("Pickup time is in the past. Set it to now or later.");
      return;
    }

    startTransition(async () => {
      try {
        const { createRentalBooking } = await import("@/lib/actions/rental-bookings");
        const startsAtDate = fd.get("starts_at_date") as string;
        const startsAtTime = (fd.get("starts_at_time") as string) || "10:00";
        const endsAtDate = fd.get("ends_at_date") as string;
        const endsAtTime = (fd.get("ends_at_time") as string) || "10:00";
        const startsAtIso = new Date(`${startsAtDate}T${startsAtTime}:00`).toISOString();
        const endsAtIso = new Date(`${endsAtDate}T${endsAtTime}:00`).toISOString();

        const customerEmail = (fd.get("customer_email") as string) || "";
        const driverLicenseNumber = (fd.get("driver_license_number") as string) || undefined;
        const driverLicenseCountry = (fd.get("driver_license_country") as string) || undefined;
        const driverDob = (fd.get("driver_dob") as string) || undefined;
        const idType = (fd.get("id_type") as string) || undefined;
        const notesBase = (fd.get("notes") as string) || "";
        const notesWithId = idType && idType !== "drivers_licence" ? `${notesBase ? notesBase + " | " : ""}ID type: ${idType}`.trim() : notesBase || undefined;

        const result = await createRentalBooking({
          organizerId,
          businessId,
          categoryId: fd.get("category_id") as string,
          vehicleId: (fd.get("vehicle_id") as string) || undefined,
          customerName: fd.get("customer_name") as string,
          customerEmail,
          customerPhone: (fd.get("customer_phone") as string) || undefined,
          startsAt: startsAtIso,
          endsAt: endsAtIso,
          pickupBranchId: (fd.get("pickup_branch_id") as string) || undefined,
          returnBranchId: (fd.get("return_branch_id") as string) || undefined,
          depositRequiredAmount: parseFloat((fd.get("deposit_required_amount") as string) || "0") || 0,
          notes: notesWithId,
          source: "office",
          driverLicenseNumber,
          driverLicenseCountry,
          driverDob,
        });

        if ("error" in result) {
          if (result.error === "VEHICLE_CONFLICT") {
            setError("That vehicle already has a booking during this period. Choose a different vehicle or dates.");
          } else if (result.error === "CATEGORY_CAPACITY_EXCEEDED") {
            setError("No vehicles are available in this category for the selected period.");
          } else {
            const r = result as { error: string; message?: string };
            const known: Record<string, string> = {
              VALIDATION_ERROR: "Please check the customer, ID and date details and try again.",
              CATEGORY_MISMATCH: "That vehicle does not belong to the selected category.",
              VEHICLE_INVALID: "That vehicle cannot be booked.",
              TENANT_MISMATCH: "This booking does not belong to this business.",
            };
            setError(r.message && r.message !== r.error ? r.message : known[r.error] ?? "Could not create the booking. Nothing was saved. Please try again.");
          }
          return;
        }

        if (paymentMethod !== "none") {
          const bookingId = (result as { booking: { id: string } }).booking.id;
          const { recordCounterPayment } = await import("@/lib/actions/rental-bookings");
          const pay = await recordCounterPayment(bookingId, organizerId, { method: paymentMethod, amount: Number(paymentAmount) });
          if (!pay.success) {
            setCreatedBookingId(bookingId);
            setError("The booking was created, but the payment was NOT recorded: " + pay.error + ". Fix the amount or method and press Create Booking to retry the payment only.");
            onSuccess?.();
            return;
          }
        }
        onSuccess?.();
        onClose();
      } catch (err) {
        setError(err instanceof Error ? err.message : "An unexpected error occurred.");
      }
    });
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-[200] flex items-end sm:items-center justify-center">
      <div
        className="fixed inset-0 bg-black/40 z-[200]"
        onClick={onClose}
        aria-hidden="true"
      />
      <div
        role="dialog"
        aria-modal="true"
        aria-label="New rental booking"
        className="relative w-full max-w-lg bg-white rounded-t-2xl sm:rounded-2xl z-[201] max-h-[95dvh] sm:max-h-[90vh] overflow-y-auto shadow-2xl"
      >
        {/* Header */}
        <div className="sticky top-0 bg-white z-20 flex items-center justify-between px-5 py-4 border-b border-zinc-100">
          <h2 className="text-base font-bold text-zinc-900">New Booking</h2>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="h-8 w-8 flex items-center justify-center rounded-lg text-zinc-400 hover:text-zinc-600 hover:bg-zinc-100 transition"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-5 space-y-5">
          {error && (
            <div className="rounded-xl bg-red-50 border border-red-200 p-3 text-sm text-red-700">
              {error}
            </div>
          )}

          {/* Customer */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-zinc-500">Customer</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div className="sm:col-span-2">
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-customer-name">
                  Full Name <span className="text-red-500">*</span>
                </label>
                <input
                  id="nb-customer-name"
                  name="customer_name"
                  type="text"
                  required
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                  placeholder="Jane Doe"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-customer-email">
                  Email
                </label>
                <input
                  id="nb-customer-email"
                  name="customer_email"
                  type="email"
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                  placeholder="jane@example.com"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-customer-phone">
                  Phone <span className="text-red-500">*</span>
                </label>
                <input
                  id="nb-customer-phone"
                  name="customer_phone"
                  type="tel"
                  required
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                  placeholder="+1 555 000 0000"
                />
              </div>
            </div>
          </fieldset>

          {/* ID / Driver */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-zinc-500">ID / Driver</legend>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-id-type">
                  ID Type
                </label>
                <select
                  id="nb-id-type"
                  name="id_type"
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                >
                  <option value="drivers_licence">Driver&apos;s licence</option>
                  <option value="national_id">National ID</option>
                  <option value="passport">Passport</option>
                </select>
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-id-number">
                  ID Number
                </label>
                <input
                  id="nb-id-number"
                  name="driver_license_number"
                  type="text"
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                  placeholder="e.g. DL12345678"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-id-country">
                  Issuing Country
                </label>
                <input
                  id="nb-id-country"
                  name="driver_license_country"
                  type="text"
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                  placeholder="e.g. US"
                />
              </div>
              <div>
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-dob">
                  Date of Birth
                </label>
                <input
                  id="nb-dob"
                  name="driver_dob"
                  type="date"
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                />
              </div>
            </div>
          </fieldset>

          {/* Vehicle */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-zinc-500">Vehicle</legend>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-category">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                id="nb-category"
                name="category_id"
                required
                value={categoryId}
                onChange={(e) => { setCategoryId(e.target.value); setVehicleId(""); }}
                className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
              >
                <option value="">Select a category…</option>
                {categories.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name} — {c.currency} {c.daily_rate}/day
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-vehicle">
                Specific Vehicle <span className="text-zinc-400 font-normal">(optional — leave blank for auto/manual assign)</span>
              </label>
              <select
                id="nb-vehicle"
                name="vehicle_id"
                value={vehicleId}
                onChange={(e) => setVehicleId(e.target.value)}
                className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                disabled={!categoryId}
              >
                <option value="">Any available vehicle</option>
                {filteredVehicles
                  .filter((v) => v.status === "available")
                  .map((v) => (
                    <option key={v.id} value={v.id}>
                      {vehicleLabel(v.make, v.model)} ({v.license_plate})
                    </option>
                  ))}
              </select>
            </div>
          </fieldset>

          {/* Dates */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-zinc-500">Rental</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-starts-date">
                  Pickup Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="nb-starts-date"
                  name="starts_at_date"
                  type="date"
                  required
                  value={startDate} onChange={(e) => setStartDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-starts-time">
                  Pickup Time <span className="text-red-500">*</span>
                </label>
                <input
                  id="nb-starts-time"
                  name="starts_at_time"
                  type="time"
                  required
                  value={startTime} onChange={(e) => setStartTime(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-ends-date">
                  Return Date <span className="text-red-500">*</span>
                </label>
                <input
                  id="nb-ends-date"
                  name="ends_at_date"
                  type="date"
                  required
                  value={endDate} onChange={(e) => setEndDate(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                />
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-ends-time">
                  Return Time <span className="text-red-500">*</span>
                </label>
                <input
                  id="nb-ends-time"
                  name="ends_at_time"
                  type="time"
                  required
                  value={endTime} onChange={(e) => setEndTime(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                />
              </div>
            </div>
          </fieldset>

          {pickupStale && (
            <p className="text-xs font-semibold text-amber-700 bg-amber-50 border border-amber-200 rounded-xl px-3 py-2">
              The pickup time is in the past. Set it to now or later.
            </p>
          )}
          {/* Live summary */}
          <div className="rounded-2xl border border-zinc-200 bg-zinc-50 p-4 text-sm space-y-1">
            <p className="text-xs font-bold uppercase tracking-wider text-zinc-500">Live summary</p>
            {selectedCat && validRange ? (
              <>
                <div className="flex justify-between"><span>Days</span><span className="font-semibold">{summaryDays}</span></div>
                <div className="flex justify-between"><span>Daily rate</span><span className="font-semibold">{selectedCat.currency} {selectedCat.daily_rate}</span></div>
                <div className="flex justify-between"><span>Rental amount (estimate)</span><span className="font-bold">{selectedCat.currency} {summaryTotal.toFixed(2)}</span></div>
                <div className="flex justify-between text-zinc-500"><span>Security deposit (at pickup)</span><span>{selectedCat.currency} {selectedCat.deposit_amount}</span></div>
              </>
            ) : (
              <p className="text-zinc-500">Choose a category and valid dates to see the total.</p>
            )}
          </div>

          {/* Branches */}
          {branches.length > 0 && (
            <fieldset className="space-y-3">
              <legend className="text-xs font-bold uppercase tracking-wider text-zinc-500">Locations</legend>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-pickup-branch">
                    Pickup Branch
                  </label>
                  <select
                    id="nb-pickup-branch"
                    name="pickup_branch_id"
                    className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                  >
                    <option value="">Any branch</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}{b.city ? ` (${b.city})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-return-branch">
                    Return Branch
                  </label>
                  <select
                    id="nb-return-branch"
                    name="return_branch_id"
                    className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                  >
                    <option value="">Same as pickup</option>
                    {branches.map((b) => (
                      <option key={b.id} value={b.id}>
                        {b.label}{b.city ? ` (${b.city})` : ""}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            </fieldset>
          )}

          {/* Deposit */}
          <fieldset className="space-y-3">
            <legend className="text-xs font-bold uppercase tracking-wider text-zinc-500">Payment at counter</legend>
            <div className="grid grid-cols-2 gap-3">
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-pay-method">Payment method</label>
                <select
                  id="nb-pay-method"
                  value={paymentMethod}
                  onChange={(e) => {
                    const v = e.target.value as "none" | "cash" | "card_terminal" | "mobile_money";
                    setPaymentMethod(v);
                    if (v !== "none" && !paymentAmount && summaryTotal > 0) setPaymentAmount(summaryTotal.toFixed(2));
                  }}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm bg-white focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
                >
                  <option value="none">No payment now</option>
                  <option value="cash">Cash</option>
                  <option value="card_terminal">Card terminal</option>
                  <option value="mobile_money">Mobile money</option>
                </select>
              </div>
              <div className="col-span-1">
                <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-pay-amount">Amount received</label>
                <input
                  id="nb-pay-amount"
                  type="number"
                  min="0"
                  step="0.01"
                  inputMode="decimal"
                  disabled={paymentMethod === "none"}
                  value={paymentAmount}
                  onChange={(e) => setPaymentAmount(e.target.value)}
                  className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700 disabled:bg-zinc-50 disabled:text-zinc-400"
                />
              </div>
            </div>
            <p className="text-xs text-zinc-500">Money received now for the rental. Pay less than the total to record an advance. The security deposit is separate.</p>
          </fieldset>
          <fieldset className="space-y-2">
            <legend className="text-xs font-bold uppercase tracking-wider text-zinc-500">Security Deposit</legend>
            <div>
              <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-deposit">
                Required Amount
              </label>
              <input
                id="nb-deposit"
                name="deposit_required_amount"
                type="number"
                min="0"
                step="0.01"
                defaultValue="0"
                className="w-full h-10 px-3 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700"
              />
              <p className="mt-1 text-xs text-zinc-400">
                Collected separately at pickup. Never added to rental amount.
              </p>
            </div>
          </fieldset>

          {/* Notes */}
          <div>
            <label className="block text-xs font-semibold text-zinc-700 mb-1" htmlFor="nb-notes">
              Notes
            </label>
            <textarea
              id="nb-notes"
              name="notes"
              rows={2}
              className="w-full px-3 py-2 rounded-xl border border-zinc-200 text-sm focus:outline-none focus:ring-2 focus:ring-brand-700/30 focus:border-brand-700 resize-none"
              placeholder="Optional notes for this booking…"
            />
          </div>

          {/* Actions */}
          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 h-11 rounded-xl border border-zinc-200 text-sm font-semibold text-zinc-700 hover:bg-zinc-50 transition"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isPending}
              className="flex-1 h-11 rounded-xl bg-brand-700 text-sm font-bold text-white hover:bg-brand-800 disabled:opacity-60 disabled:cursor-not-allowed transition flex items-center justify-center gap-2"
            >
              {isPending && <Loader className="h-4 w-4 animate-spin" />}
              {isPending ? "Creating…" : "Create Booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
