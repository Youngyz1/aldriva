"use client";

import { useState, useTransition } from "react";
import {
  IconCheck as CheckIcon,
  IconAlertCircle as AlertIcon,
  IconArrowLeft as ArrowLeftIcon,
} from "@tabler/icons-react";
import Link from "next/link";
import { updateRentalSettings, type RentalSettings } from "@/lib/actions/rental-settings";

interface RentalSettingsClientProps {
  organizerId: string;
  businessId: string;
  initialSettings: RentalSettings;
  canManage: boolean;
}

export function RentalSettingsClient({
  organizerId,
  businessId,
  initialSettings,
  canManage,
}: RentalSettingsClientProps) {
  const [settings, setSettings] = useState<RentalSettings>(initialSettings);
  const [isPending, startTransition] = useTransition();
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setSuccessMessage(null);
    setErrorMessage(null);

    startTransition(async () => {
      const result = await updateRentalSettings(organizerId, businessId, settings);
      if (result.success && result.settings) {
        setSettings(result.settings);
        setSuccessMessage("Settings saved successfully.");
      } else {
        setErrorMessage(result.error ?? "Failed to save settings.");
      }
    });
  };

  return (
    <div className="max-w-3xl space-y-6">
      <div className="flex items-center gap-3">
        <Link
          href={`/dashboard/org/${organizerId}/rentals`}
          className="inline-flex h-9 w-9 items-center justify-center rounded-lg border border-zinc-200 text-zinc-600 hover:bg-zinc-50 dark:border-zinc-800 dark:text-zinc-400 dark:hover:bg-zinc-900"
          aria-label="Back to rentals"
        >
          <ArrowLeftIcon className="h-5 w-5" />
        </Link>
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 dark:text-zinc-100">
            Rental Storefront & Operational Settings
          </h1>
          <p className="text-sm text-zinc-500 dark:text-zinc-400">
            Configure booking confirmation, driver verification, billing boundaries, and rental policies.
          </p>
        </div>
      </div>

      {successMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 dark:bg-emerald-950/40 dark:text-emerald-300">
          <CheckIcon className="h-4 w-4 shrink-0 text-emerald-600" />
          <span>{successMessage}</span>
        </div>
      )}

      {errorMessage && (
        <div className="flex items-center gap-2 rounded-xl bg-rose-50 px-4 py-3 text-sm text-rose-800 dark:bg-rose-950/40 dark:text-rose-300">
          <AlertIcon className="h-4 w-4 shrink-0 text-rose-600" />
          <span>{errorMessage}</span>
        </div>
      )}

      <form onSubmit={handleSubmit} className="space-y-8 divide-y divide-zinc-200 dark:divide-zinc-800">
        {/* Section 1: Ingress & Confirmation */}
        <div className="space-y-4 pt-4 first:pt-0">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Booking & Confirmation Rules
          </h2>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Online Confirmation Mode
              </label>
              <select
                disabled={!canManage}
                value={settings.confirmationMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    confirmationMode: e.target.value as "approval" | "instant",
                  })
                }
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="approval">Owner Approval Required (Hold for 24h)</option>
                <option value="instant">Instant Confirmation (On Stripe Payment)</option>
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                Approval requests must be confirmed or declined within 24 hours.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Vehicle Allocation Mode
              </label>
              <select
                disabled={!canManage}
                value={settings.allocationMode}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    allocationMode: e.target.value as "manual" | "auto_on_confirm" | "auto_on_booking",
                  })
                }
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="manual">Manual Dispatch (Staff assigns unit)</option>
                <option value="auto_on_confirm">Auto-allocate on Confirmation</option>
                <option value="auto_on_booking">Auto-allocate Immediately on Booking</option>
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                Auto-allocation picks by lowest mileage, preferring the pickup branch.
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Minimum Notice Lead Time (Hours)
              </label>
              <input
                type="number"
                min={0}
                max={168}
                disabled={!canManage}
                value={settings.minNoticeHours}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    minNoticeHours: parseInt(e.target.value, 10) || 0,
                  })
                }
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Prevents walk-in bookings without sufficient turnaround prep (0 to 168h).
              </p>
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Billing Boundary
              </label>
              <select
                disabled={!canManage}
                value={settings.billingBoundary}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    billingBoundary: e.target.value as "rolling_24h" | "calendar_day",
                  })
                }
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="rolling_24h">Rolling 24 Hours (Standard for Car Rentals)</option>
                <option value="calendar_day">Calendar Day (Midnight to Midnight)</option>
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                Determines how partial days and rental days are billed.
              </p>
            </div>
          </div>
        </div>

        {/* Section: Payment */}
        <div className="space-y-4 pt-6">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Payment
          </h2>
          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Payment Policy
              </label>
              <select
                disabled={!canManage}
                value={settings.paymentPolicy}
                onChange={(e) => {
                  const policy = e.target.value as "offline" | "full_online" | "advance_online";
                  setSettings({
                    ...settings,
                    paymentPolicy: policy,
                    advancePct: policy === "advance_online" ? (settings.advancePct ?? 30) : null,
                  });
                }}
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              >
                <option value="offline">Pay at pickup (offline)</option>
                <option value="full_online">Full payment online</option>
                <option value="advance_online">Advance payment online</option>
              </select>
              <p className="mt-1 text-xs text-zinc-500">
                Online payment options are not active yet. Keep &quot;Pay at pickup&quot; until online checkout is released.
              </p>
            </div>

            {settings.paymentPolicy === "advance_online" && (
              <div>
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Advance Percentage (%)
                </label>
                <input
                  type="number"
                  min={10}
                  max={90}
                  disabled={!canManage}
                  value={settings.advancePct ?? 30}
                  onChange={(e) =>
                    setSettings({ ...settings, advancePct: parseInt(e.target.value, 10) || 30 })
                  }
                  className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
              </div>
            )}

            {settings.paymentPolicy !== "offline" && (
              <div>
                <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                  Payment Link Valid For (Hours)
                </label>
                <input
                  type="number"
                  min={1}
                  max={168}
                  disabled={!canManage}
                  value={settings.paymentLinkHours}
                  onChange={(e) =>
                    setSettings({ ...settings, paymentLinkHours: parseInt(e.target.value, 10) || 48 })
                  }
                  className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
                />
                <p className="mt-1 text-xs text-zinc-500">
                  After you confirm a request, the customer has this long to pay (1 to 168).
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Section 2: Driver Requirements */}
        <div className="space-y-4 pt-6">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Driver Verification & Eligibility
          </h2>

          <div className="grid grid-cols-1 gap-6 sm:grid-cols-2">
            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Minimum Driver Age
              </label>
              <input
                type="number"
                min={16}
                max={100}
                disabled={!canManage}
                value={settings.minDriverAge}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    minDriverAge: parseInt(e.target.value, 10) || 21,
                  })
                }
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white px-3 py-2 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
              <p className="mt-1 text-xs text-zinc-500">
                Customers younger than this threshold will be blocked during checkout.
              </p>
            </div>

            <div className="flex items-center gap-3 pt-6">
              <input
                id="requireLicenseDob"
                type="checkbox"
                disabled={!canManage}
                checked={settings.requireLicenseDob}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    requireLicenseDob: e.target.checked,
                  })
                }
                className="h-4 w-4 rounded border-zinc-300 text-brand-700 focus:ring-brand-700 dark:border-zinc-700"
              />
              <label
                htmlFor="requireLicenseDob"
                className="text-sm font-medium text-zinc-800 dark:text-zinc-200"
              >
                Require Driver&apos;s License & Date of Birth Online
              </label>
            </div>
          </div>
        </div>

        {/* Section 3: Policies & Legal Terms */}
        <div className="space-y-4 pt-6">
          <h2 className="text-base font-semibold text-zinc-900 dark:text-zinc-100">
            Policies & Agreement Terms
          </h2>

          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Security Deposit Policy
              </label>
              <textarea
                rows={3}
                disabled={!canManage}
                value={settings.depositPolicy ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    depositPolicy: e.target.value,
                  })
                }
                placeholder="e.g. A refundable security deposit is collected at pickup via credit card or cash guarantee and returned upon vehicle inspection."
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Cancellation & Refund Policy
              </label>
              <textarea
                rows={3}
                disabled={!canManage}
                value={settings.cancellationPolicy ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    cancellationPolicy: e.target.value,
                  })
                }
                placeholder="e.g. Free cancellation up to 48 hours before pickup. Cancellations within 48 hours incur a 1-day rental charge."
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>

            <div>
              <label className="block text-sm font-medium text-zinc-800 dark:text-zinc-200">
                Rental Agreement Terms
              </label>
              <textarea
                rows={4}
                disabled={!canManage}
                value={settings.rentalTerms ?? ""}
                onChange={(e) =>
                  setSettings({
                    ...settings,
                    rentalTerms: e.target.value,
                  })
                }
                placeholder="e.g. Renter must possess a valid driver's license held for at least 1 year. Fuel policy is Full-to-Full. Vehicle must remain within approved territories."
                className="mt-1.5 block w-full rounded-xl border border-zinc-300 bg-white p-3 text-sm text-zinc-900 shadow-sm focus:border-brand-700 focus:outline-none focus:ring-1 focus:ring-brand-700 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100"
              />
            </div>
          </div>
        </div>

        {canManage && (
          <div className="pt-6">
            <button
              type="submit"
              disabled={isPending}
              className="inline-flex items-center justify-center rounded-xl bg-brand-700 px-5 py-2.5 text-sm font-medium text-white shadow-sm hover:bg-brand-800 focus:outline-none focus:ring-2 focus:ring-brand-700 focus:ring-offset-2 disabled:opacity-50"
            >
              {isPending ? "Saving Settings..." : "Save Settings"}
            </button>
          </div>
        )}
      </form>
    </div>
  );
}
