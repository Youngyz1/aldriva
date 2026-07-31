"use client";

import { useState } from "react";
import { SettingsCard } from "@/components/ui/settings-card";
import { Shield, Sparkles, Building, Landmark, Calendar, ArrowUpRight } from "lucide-react";

export default function PaymentsClient({
  userId,
  organizerName,
}: {
  userId: string;
  organizerName: string | null;
}) {
  const [currency, setCurrency] = useState("USD");
  const [payoutSchedule, setPayoutSchedule] = useState("weekly");
  const [isStripeConnecting, setIsStripeConnecting] = useState(false);
  const [toast, setToast] = useState("");

  function showToast(msg: string) {
    setToast(msg);
    setTimeout(() => setToast(""), 3500);
  }

  function handleStripeConnect() {
    setIsStripeConnecting(true);
    // Mimic Stripe Connect redirection handshake
    setTimeout(() => {
      setIsStripeConnecting(false);
      showToast("Stripe integration setup successfully in sandbox mode!");
    }, 1500);
  }

  return (
    <div className="space-y-6">
      {toast && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700">
          {toast}
        </div>
      )}

      {/* Stripe Connect Card */}
      <SettingsCard
        title={
          <div className="flex items-center gap-2">
            <span>Stripe Payouts</span>
            <span className="rounded-full bg-zinc-100 px-2 py-0.5 text-[10px] font-black uppercase text-zinc-500">
              Sandbox Mode
            </span>
          </div>
        }
        description="Receive payouts directly into your bank account. Securely process tickets and donation collections."
      >
        <div className="flex flex-col gap-6 md:flex-row md:items-center md:justify-between">
          <div className="space-y-2 max-w-lg">
            <div className="flex items-center gap-2">
              <div className="h-2 w-2 rounded-full bg-amber-500 animate-pulse" />
              <p className="text-sm font-bold text-amber-800">Status: Not Connected</p>
            </div>
            <p className="text-xs text-zinc-500 sm:text-sm leading-relaxed">
              Connect your account to Stripe to enable ticketing and accept donations. Payouts are made to your linked checking account on your preferred schedule.
            </p>
          </div>
          <button
            type="button"
            onClick={handleStripeConnect}
            disabled={isStripeConnecting}
            className="flex items-center justify-center gap-2 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white px-5 py-3 text-sm font-black transition shadow-xs disabled:opacity-60 text-center shrink-0"
          >
            <span>{isStripeConnecting ? "Connecting..." : "Connect Stripe Account"}</span>
            <ArrowUpRight size={16} />
          </button>
        </div>
      </SettingsCard>

      {/* Payout Configurations */}
      <SettingsCard
        title="Payout Preferences"
        description="Configure your payout schedule and regional currency settings."
        footer={
          <button
            type="button"
            onClick={() => showToast("Payout preferences saved successfully.")}
            className="rounded-xl bg-orange-600 px-5 py-2.5 text-xs font-black text-white hover:bg-orange-700 transition"
          >
            Save Payout Settings
          </button>
        }
      >
        <div className="grid gap-6 sm:grid-cols-2">
          {/* Currency Selection */}
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-zinc-500">
              <Building size={14} className="text-zinc-400" />
              Payout Currency
            </span>
            <select
              value={currency}
              onChange={(e) => setCurrency(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-hidden transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 sm:rounded-xl sm:px-4 sm:py-2.5"
            >
              <option value="USD">USD ($) - United States Dollar</option>
              <option value="CAD">CAD ($) - Canadian Dollar</option>
              <option value="EUR">EUR (€) - Euro</option>
              <option value="GBP">GBP (£) - British Pound</option>
              <option value="NGN">NGN (₦) - Nigerian Naira</option>
            </select>
          </label>

          {/* Payout Interval */}
          <label className="block">
            <span className="mb-1.5 flex items-center gap-1.5 text-xs font-black uppercase tracking-wide text-zinc-500">
              <Calendar size={14} className="text-zinc-400" />
              Payout Schedule
            </span>
            <select
              value={payoutSchedule}
              onChange={(e) => setPayoutSchedule(e.target.value)}
              className="w-full rounded-lg border border-zinc-200 bg-white px-3 py-2 text-sm font-semibold outline-hidden transition focus:border-orange-500 focus:ring-4 focus:ring-orange-100 sm:rounded-xl sm:px-4 sm:py-2.5"
            >
              <option value="daily">Daily Payouts</option>
              <option value="weekly">Weekly Payouts (Every Monday)</option>
              <option value="monthly">Monthly Payouts (First day of month)</option>
            </select>
          </label>
        </div>
      </SettingsCard>

      {/* Bank details preview */}
      <SettingsCard
        title="Linked Bank Account"
        description="The account where payouts will be directly transferred."
      >
        <div className="flex items-center gap-4 rounded-xl border border-dashed border-zinc-200 bg-zinc-50/50 p-6 text-zinc-500">
          <Landmark size={24} className="shrink-0 text-zinc-400" />
          <div>
            <p className="text-sm font-bold text-zinc-700">No bank account linked</p>
            <p className="text-xs mt-0.5 text-zinc-500">You must connect your Stripe profile above to register banking credentials.</p>
          </div>
        </div>
      </SettingsCard>

      {/* Payout History / Empty State */}
      <div className="rounded-xl border border-zinc-200/80 bg-white p-5 sm:rounded-2xl sm:p-6">
        <h3 className="text-lg font-bold tracking-tight text-zinc-900 sm:text-xl font-sans">
          Payout Ledger
        </h3>
        <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
          A list of all disbursements processed to your account.
        </p>

        <div className="mt-6 flex flex-col items-center justify-center rounded-xl border border-zinc-100 p-8 text-center bg-zinc-50/20">
          <div className="flex h-12 w-12 items-center justify-center rounded-full bg-orange-50 text-orange-500">
            <Sparkles size={20} />
          </div>
          <p className="mt-4 text-sm font-bold text-zinc-950">No payouts record found</p>
          <p className="mt-1 max-w-xs text-xs text-zinc-500 leading-normal">
            Once you connect with Stripe and record ticket sales, your payout ledger will accumulate records here.
          </p>
        </div>
      </div>
    </div>
  );
}
