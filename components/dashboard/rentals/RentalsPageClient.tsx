"use client";

/**
 * components/dashboard/rentals/RentalsPageClient.tsx
 *
 * Client shell for the rentals bookings page.
 * Manages the NewBookingDialog open state (including calendar-driven
 * prefill), the List/Calendar tab, and triggers refresh on success.
 */

import React, { useState } from "react";
import { useRouter } from "next/navigation";
import { IconPlus as Plus, IconList as ListIcon, IconCalendar as CalendarIcon } from "@tabler/icons-react";
import { BookingListClient, type BookingListRow } from "./BookingListClient";
import { NewBookingDialog, type VehicleCategoryOption, type BranchOption, type VehicleOption } from "./NewBookingDialog";
import { TodayBoard, type TodayBoardItem } from "./TodayBoard";
import { RentalCalendar, type CalendarVehicle, type CalendarBooking, type CalendarBlock } from "./RentalCalendar";

export interface RentalsPageClientProps {
  bookings: BookingListRow[];
  organizerId: string;
  businessId: string;
  canManage: boolean;
  categories: VehicleCategoryOption[];
  branches: BranchOption[];
  vehicles: VehicleOption[];
  initialTab?: "all" | "pending" | "active" | "completed" | "cancelled";
  todayPickups: TodayBoardItem[];
  todayDropoffs: TodayBoardItem[];
  lateReturns: TodayBoardItem[];
  calendarVehicles: CalendarVehicle[];
  calendarBookings: CalendarBooking[];
  calendarBlocks: CalendarBlock[];
}

export function RentalsPageClient({
  bookings,
  organizerId,
  businessId,
  canManage,
  categories,
  branches,
  vehicles,
  initialTab,
  todayPickups,
  todayDropoffs,
  lateReturns,
  calendarVehicles,
  calendarBookings,
  calendarBlocks,
}: RentalsPageClientProps) {
  const [dialogOpen, setDialogOpen] = useState(false);
  const [view, setView] = useState<"list" | "calendar">("list");
  const [prefill, setPrefill] = useState<{ vehicleId: string; startDate: string } | null>(null);
  const router = useRouter();

  function handleSuccess() {
    setDialogOpen(false);
    setPrefill(null);
    router.refresh();
  }

  function handleCloseDialog() {
    setDialogOpen(false);
    setPrefill(null);
  }

  function handleOpenNewBookingFromCalendar(vehicleId: string, dateStr: string) {
    setPrefill({ vehicleId, startDate: dateStr });
    setDialogOpen(true);
  }

  function handleOpenNewBookingButton() {
    setPrefill(null);
    setDialogOpen(true);
  }

  return (
    <>
      <TodayBoard
        organizerId={organizerId}
        pickups={todayPickups}
        dropoffs={todayDropoffs}
        lateReturns={lateReturns}
      />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex rounded-xl border border-zinc-200 bg-white p-0.5">
          <button
            type="button"
            onClick={() => setView("list")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
              view === "list" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <ListIcon className="h-3.5 w-3.5" />
            List
          </button>
          <button
            type="button"
            onClick={() => setView("calendar")}
            className={`inline-flex h-8 items-center gap-1.5 rounded-lg px-3 text-xs font-bold transition ${
              view === "calendar" ? "bg-zinc-900 text-white" : "text-zinc-600 hover:bg-zinc-50"
            }`}
          >
            <CalendarIcon className="h-3.5 w-3.5" />
            Calendar
          </button>
        </div>

        {canManage && (
          <button
            type="button"
            onClick={handleOpenNewBookingButton}
            className="inline-flex items-center gap-1.5 h-9 px-4 rounded-xl bg-brand-700 text-xs font-bold text-white hover:bg-brand-800 transition"
          >
            <Plus className="h-4 w-4" />
            New Booking
          </button>
        )}
      </div>

      {view === "list" ? (
        <BookingListClient
          bookings={bookings}
          organizerId={organizerId}
          canManage={canManage}
          initialTab={initialTab}
        />
      ) : (
        <RentalCalendar
          organizerId={organizerId}
          vehicles={calendarVehicles}
          bookings={calendarBookings}
          blocks={calendarBlocks}
          onOpenNewBooking={handleOpenNewBookingFromCalendar}
          canManage={canManage}
        />
      )}

      <NewBookingDialog
        open={dialogOpen}
        onClose={handleCloseDialog}
        organizerId={organizerId}
        businessId={businessId}
        categories={categories}
        branches={branches}
        vehicles={vehicles}
        onSuccess={handleSuccess}
        prefillVehicleId={prefill?.vehicleId}
        prefillStartDate={prefill?.startDate}
      />
    </>
  );
}
