/**
 * components/dashboard/overview/modules/FundraisingSection.tsx
 *
 * Real tenant-scoped Fundraising operational section.
 */

import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { formatMoney } from "@/lib/money";
import { StatCard } from "../StatCard";
import { EmptyState } from "../EmptyState";
import {
  IconHeart as Heart,
  IconArrowRight as ArrowRight,
} from "@tabler/icons-react";

export interface FundraisingSectionProps {
  organizerId: string;
  canManage?: boolean;
}

interface FundraiserRow {
  id: string;
  title: string;
  goal: number | null;
  raised: number | null;
  currency: string | null;
  status: string;
}

export async function FundraisingSection({
  organizerId,
  canManage = true,
}: FundraisingSectionProps) {
  const supabase = createSupabaseAdmin();

  let campaigns: FundraiserRow[] = [];
  try {
    const { data, error } = await supabase
      .from("fundraisers")
      .select("id, title, goal, raised, currency, status")
      .eq("organizer_id", organizerId)
      .is("deleted_at", null)
      .order("created_at", { ascending: false })
      .limit(5);

    if (!error && Array.isArray(data)) {
      campaigns = data as FundraiserRow[];
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[FundraisingSection] query error:", err);
    }
  }

  const totalRaised = campaigns.reduce((acc, c) => acc + Number(c.raised || 0), 0);
  const primaryCurrency = campaigns.length > 0 && campaigns[0].currency ? campaigns[0].currency : "USD";

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Heart className="h-4 w-4 text-brand-700" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Fundraising & Campaigns
          </h2>
        </div>
        {canManage && (
          <Link
            href={`/dashboard/org/${organizerId}/fundraisers`}
            className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
          >
            <span>All campaigns</span>
            <ArrowRight className="h-3 w-3" />
          </Link>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <StatCard
          label="Total Raised"
          value={totalRaised}
          format="money"
          currency={primaryCurrency}
          href={`/dashboard/org/${organizerId}/fundraisers`}
        />
        <StatCard
          label="Active Campaigns"
          value={campaigns.length}
          format="count"
        />
      </div>

      {campaigns.length === 0 ? (
        <EmptyState
          variant="section"
          title="No campaigns active"
          description="Start a fundraising campaign to receive donations from supporters."
          action={
            canManage
              ? {
                  label: "+ Start Campaign",
                  href: `/dashboard/org/${organizerId}/fundraisers/new`,
                }
              : undefined
          }
          icon={Heart}
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
          {campaigns.map((c) => (
            <div
              key={c.id}
              className="min-h-[48px] flex items-center justify-between p-3.5 gap-3 hover:bg-zinc-50/60 transition"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">{c.title}</p>
                {c.goal && (
                  <p className="text-xs text-zinc-500 mt-0.5">
                    Goal: {formatMoney(Number(c.goal), c.currency || primaryCurrency)}
                  </p>
                )}
              </div>
              <span className="text-xs font-bold tabular-nums text-emerald-700">
                {formatMoney(Number(c.raised || 0), c.currency || primaryCurrency)}
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
