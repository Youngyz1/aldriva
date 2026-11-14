/**
 * app/dashboard/org/[id]/fleet/page.tsx
 *
 * Fleet Inventory & Management Directory.
 * Documentation: docs/design/rental/architecture.md §4 (Slice 1)
 */

import { notFound, redirect } from "next/navigation";
import Link from "next/link";
import { cookies } from "next/headers";
import {
  IconPlus as Plus,
  IconCar as Car,
  IconTag as Tag,
} from "@tabler/icons-react";
import { getCurrentUser } from "@/lib/auth";
import { checkTenantAccess, type EntityRole } from "@/lib/entity-auth";
import { createSupabaseAdmin } from "@/lib/supabase-admin";
import { isOrganizerDashboardBusiness } from "@/lib/organizer-dashboard-classifier";
import { resolveActiveBusiness, getActiveBusinessCookieName } from "@/lib/active-business";
import { listVehicles } from "@/lib/actions/vehicles";
import { resolveVehicleCardStatus } from "@/lib/fleet/vehicle-card-status";
import { listVehicleCategories } from "@/lib/actions/rental-categories";
import { FleetDirectoryClient } from "@/components/dashboard/fleet/FleetDirectoryClient";

const ALLOWED_ROLES: EntityRole[] = [
  "owner",
  "admin",
  "manager",
  "editor",
  "finance",
  "viewer",
];

export default async function FleetPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams?: Promise<{ [key: string]: string | string[] | undefined }>;
}) {
  const { id: organizerId } = await params;
  const user = await getCurrentUser();
  if (!user) redirect("/login");

  const access = await checkTenantAccess(user.id, organizerId, ALLOWED_ROLES);
  if (!access.hasAccess) return notFound();

  const canManage = access.role
    ? ["owner", "admin", "manager", "editor"].includes(access.role)
    : false;

  const supabase = createSupabaseAdmin();

  // 1. Fetch businesses for organizer
  const { data: businesses } = await supabase
    .from("businesses")
    .select("id, name, slug, status, industry, category, business_type, offerings, logo, country, created_at")
    .eq("organizer_id", organizerId);

  const eligibleBusinesses = (businesses ?? []).filter(isOrganizerDashboardBusiness);
  const resolvedSearchParams = searchParams ? await searchParams : {};
  const queryBusinessId =
    typeof resolvedSearchParams.business === "string"
      ? resolvedSearchParams.business
      : null;
  const cookieStore = await cookies();
  const cookieBusinessId =
    cookieStore.get(getActiveBusinessCookieName(organizerId))?.value ?? null;
  const activeBusiness = resolveActiveBusiness(eligibleBusinesses, {
    searchParamBusinessId: queryBusinessId,
    cookieBusinessId,
  });

  // 2. Fetch fleet inventory and categories
  const [vehiclesRes, categoriesRes] = await Promise.all([
    listVehicles(organizerId, { businessId: activeBusiness?.id }),
    listVehicleCategories(organizerId, activeBusiness?.id),
  ]);

  const vehicles = vehiclesRes.data;
  const categories = categoriesRes.data;

  // 3. Booking-derived card info: whether a vehicle is actually out right
  // now (status = "active" means picked up, not yet returned — the live
  // signal, not the manually-set vehicles.status field), plus a short
  // "Free until .../Next booking ..." footer line. One query covering
  // every in-flight booking for this organizer's vehicles.
  const vehicleIds = vehicles.map((v) => v.id);
  const bookingInfoByVehicle: Record<
    string,
    { isActiveNow: boolean; freeUntil: string | null; nextBookingAt: string | null }
  > = {};
  if (vehicleIds.length > 0) {
    const { data: bookingRows } = await supabase
      .from("rental_bookings")
      .select("vehicle_id, starts_at, ends_at, status")
      .eq("organizer_id", organizerId)
      .in("vehicle_id", vehicleIds)
      .in("status", ["pending", "awaiting_payment", "confirmed", "active"])
      .order("starts_at", { ascending: true });

    const now = Date.now();
    for (const row of bookingRows ?? []) {
      const vehicleId = row.vehicle_id as string | null;
      if (!vehicleId) continue;
      const entry = bookingInfoByVehicle[vehicleId] ?? {
        isActiveNow: false,
        freeUntil: null,
        nextBookingAt: null,
      };
      if (row.status === "active") {
        entry.isActiveNow = true;
        entry.freeUntil = row.ends_at as string;
      } else if (!entry.nextBookingAt && new Date(row.starts_at as string).getTime() >= now) {
        entry.nextBookingAt = row.starts_at as string;
      }
      bookingInfoByVehicle[vehicleId] = entry;
    }
  }

  // 4. KPI tiles — same resolveVehicleCardStatus() used by the Fleet
  // cards, so the tiles and the cards can never disagree.
  const totalFleet = vehicles.length;
  let availableCount = 0;
  let rentedCount = 0;
  let maintenanceCount = 0;
  for (const v of vehicles) {
    const cardStatus = resolveVehicleCardStatus(v, Boolean(bookingInfoByVehicle[v.id]?.isActiveNow));
    if (cardStatus === "available") availableCount++;
    else if (cardStatus === "rented") rentedCount++;
    else if (cardStatus === "maintenance") maintenanceCount++;
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h1 className="text-xl font-bold tracking-tight text-zinc-900 sm:text-2xl">
            Fleet Inventory
          </h1>
          <p className="mt-1 text-xs text-zinc-500 sm:text-sm">
            Manage your physical vehicles, status availability, and category rate plans.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <Link
            href={`/dashboard/org/${organizerId}/fleet/categories`}
            className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl border border-zinc-200 bg-white px-3.5 text-xs font-bold text-zinc-700 hover:bg-zinc-50 hover:border-zinc-300 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
          >
            <Tag className="h-4 w-4 text-zinc-500" />
            Categories & Rates ({categories.length})
          </Link>

          {canManage && (
            <Link
              href={`/dashboard/org/${organizerId}/fleet/new`}
              className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-4 text-xs font-bold text-white hover:bg-orange-800 focus:outline-none focus:ring-2 focus:ring-brand-600 focus:ring-offset-2"
            >
              <Plus className="h-4 w-4" />
              Add Vehicle
            </Link>
          )}
        </div>
      </div>

      {/* Zero State / Onboarding */}
      {totalFleet === 0 ? (
        <div className="rounded-2xl border border-zinc-200 bg-white p-8 sm:p-12 text-center">
          <Car className="mx-auto h-12 w-12 text-zinc-300" />
          <h2 className="mt-4 text-base font-bold text-zinc-900">
            {categories.length === 0
              ? "Set up your vehicle categories first"
              : "No vehicles registered in your fleet"}
          </h2>
          <p className="mx-auto mt-2 max-w-md text-xs text-zinc-500 sm:text-sm">
            {categories.length === 0
              ? "Before adding vehicles, create rate categories (e.g. Economy Sedan, Compact SUV) to configure daily pricing and security deposits."
              : "Register individual vehicle assets with license plates, mileage, and depot branches to start accepting bookings."}
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            {categories.length === 0 ? (
              <Link
                href={`/dashboard/org/${organizerId}/fleet/categories`}
                className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-5 text-xs font-bold text-white hover:bg-orange-800"
              >
                <Plus className="h-4 w-4" />
                Configure Categories & Rates
              </Link>
            ) : (
              canManage && (
                <Link
                  href={`/dashboard/org/${organizerId}/fleet/new`}
                  className="inline-flex min-h-[44px] items-center gap-1.5 rounded-xl bg-orange-700 px-5 text-xs font-bold text-white hover:bg-orange-800"
                >
                  <Plus className="h-4 w-4" />
                  Register First Vehicle
                </Link>
              )
            )}
          </div>
        </div>
      ) : (
        <>
          {/* Quick Metrics Strip */}
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <span className="text-xs font-semibold text-zinc-500">Total Fleet</span>
              <p className="mt-1 text-2xl font-black text-zinc-900">{totalFleet}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <span className="text-xs font-semibold text-emerald-700">Available</span>
              <p className="mt-1 text-2xl font-black text-emerald-700">{availableCount}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <span className="text-xs font-semibold text-blue-700">Out on Rental</span>
              <p className="mt-1 text-2xl font-black text-blue-700">{rentedCount}</p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-4 shadow-2xs">
              <span className="text-xs font-semibold text-amber-700">In Maintenance</span>
              <p className="mt-1 text-2xl font-black text-amber-700">{maintenanceCount}</p>
            </div>
          </div>

          {/* Directory Client */}
          <FleetDirectoryClient
            initialVehicles={vehicles}
            categories={categories}
            bookingInfoByVehicle={bookingInfoByVehicle}
            organizerId={organizerId}
            canManage={canManage}
          />
        </>
      )}
    </div>
  );
}
