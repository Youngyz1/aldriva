/**
 * components/dashboard/overview/modules/ServicesSection.tsx
 *
 * Real tenant-scoped Services catalog operational section.
 * Reads public.services where organizer_id = organizerId.
 */

import React from "react";
import Link from "next/link";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { formatMoney } from "@/lib/money";
import { StatCard } from "../StatCard";
import { EmptyState } from "../EmptyState";
import {
  IconBriefcase as Briefcase,
  IconPlus as Plus,
  IconArrowRight as ArrowRight,
  IconClock as Clock,
} from "@tabler/icons-react";

export interface ServicesSectionProps {
  organizerId: string;
  canManage?: boolean;
}

interface ServiceRow {
  id: string;
  title: string;
  slug: string;
  duration_minutes: number | null;
  price: number | null;
  is_active: boolean;
}

export async function ServicesSection({
  organizerId,
  canManage = true,
}: ServicesSectionProps) {
  const supabase = createSupabaseAdmin();

  let services: ServiceRow[] = [];
  try {
    const { data, error } = await supabase
      .from("services")
      .select("id, title, slug, duration_minutes, price, is_active")
      .eq("organizer_id", organizerId)
      .order("position", { ascending: true })
      .order("created_at", { ascending: false })
      .limit(20);

    if (!error && Array.isArray(data)) {
      services = data as ServiceRow[];
    }
  } catch (err) {
    if (process.env.NODE_ENV !== "production") {
      console.warn("[ServicesSection] query error:", err);
    }
  }

  const activeServices = services.filter((s) => s.is_active);
  const unpricedServices = activeServices.filter((s) => s.price === null || s.price === undefined);
  const previewRows = activeServices.slice(0, 5);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Briefcase className="h-4 w-4 text-brand-700" />
          <h2 className="text-xs font-bold uppercase tracking-wider text-zinc-900">
            Services & Offerings
          </h2>
        </div>
        <div className="flex items-center gap-2">
          {canManage && (
            <>
              <Link
                href={`/dashboard/org/${organizerId}/services/new`}
                className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-brand-700 hover:text-brand-800"
              >
                <Plus className="h-3.5 w-3.5" />
                <span>New Service</span>
              </Link>
              <span className="text-zinc-300">·</span>
              <Link
                href={`/dashboard/org/${organizerId}/services`}
                className="inline-flex min-h-[36px] items-center gap-1 text-xs font-bold text-zinc-600 hover:text-zinc-900"
              >
                <span>Manage</span>
                <ArrowRight className="h-3 w-3" />
              </Link>
            </>
          )}
        </div>
      </div>

      {/* KPI Tiles */}
      <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
        <StatCard
          label="Active Services"
          value={activeServices.length}
          format="count"
          href={`/dashboard/org/${organizerId}/services`}
        />
        <StatCard
          label="Total Catalog"
          value={services.length}
          format="count"
        />
        <StatCard
          label="Missing Price"
          value={unpricedServices.length}
          format="count"
          hint={unpricedServices.length > 0 ? "Requires price review" : "All priced"}
          href={`/dashboard/org/${organizerId}/services`}
        />
      </div>

      {/* Services List or Empty State */}
      {previewRows.length === 0 ? (
        <EmptyState
          variant="section"
          title="No services added yet"
          description="Add your business services so clients can view details, durations, and book appointments."
          action={
            canManage
              ? {
                  label: "+ Add your first service",
                  href: `/dashboard/org/${organizerId}/services/new`,
                }
              : undefined
          }
          icon={Briefcase}
        />
      ) : (
        <div className="rounded-xl border border-zinc-200 bg-white divide-y divide-zinc-100 overflow-hidden">
          {previewRows.map((svc) => (
            <div
              key={svc.id}
              className="min-h-[48px] flex items-center justify-between p-3.5 gap-3 hover:bg-zinc-50/60 transition"
            >
              <div className="min-w-0">
                <p className="text-sm font-semibold text-zinc-900 truncate">
                  {svc.title}
                </p>
                {svc.duration_minutes && (
                  <p className="text-xs text-zinc-500 flex items-center gap-1 mt-0.5">
                    <Clock className="h-3 w-3" />
                    <span>{svc.duration_minutes} min</span>
                  </p>
                )}
              </div>

              <div className="text-right shrink-0">
                <p className="text-xs font-bold text-zinc-900 tabular-nums">
                  {svc.price !== null && svc.price !== undefined
                    ? formatMoney(Number(svc.price), "USD")
                    : "No price set"}
                </p>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
