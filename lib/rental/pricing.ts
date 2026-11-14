/**
 * lib/rental/pricing.ts
 *
 * Pure pricing helpers for the Vehicle Rental engine.
 * No "use server" — safe to import from server actions, server components,
 * and plain Node scripts alike.
 *
 * IMPORTANT: Deposit is NEVER included in calculateRentalAmount.
 * Deposit is tracked separately via deposit_required_amount /
 * deposit_collected_amount on the rental_bookings row.
 */

/**
 * Calculates the rental charge (excluding security deposit) from daily/weekly
 * rates and a date range.
 *
 * @param opts.dailyRate      – per-day rate in minor units (e.g. cents)
 * @param opts.weeklyRate     – per-week rate; applied when total days >= 7
 * @param opts.startsAt       – rental start (Date)
 * @param opts.endsAt         – rental end (Date)
 * @param opts.billingBoundary – "rolling_24h" (default) or "calendar_day"
 */
export function calculateRentalAmount(opts: {
  dailyRate: number;
  weeklyRate?: number | null;
  startsAt: Date;
  endsAt: Date;
  billingBoundary?: "rolling_24h" | "calendar_day";
}): number {
  const {
    dailyRate,
    weeklyRate,
    startsAt,
    endsAt,
    billingBoundary = "rolling_24h",
  } = opts;
  let days: number;
  if (billingBoundary === "calendar_day") {
    // Calendar days: difference in UTC dates
    const startDay = Date.UTC(
      startsAt.getUTCFullYear(),
      startsAt.getUTCMonth(),
      startsAt.getUTCDate()
    );
    const endDay = Date.UTC(
      endsAt.getUTCFullYear(),
      endsAt.getUTCMonth(),
      endsAt.getUTCDate()
    );
    days = Math.max(
      1,
      Math.round((endDay - startDay) / (1000 * 60 * 60 * 24))
    );
  } else {
    // Rolling 24h
    days = Math.max(
      1,
      Math.ceil(
        (endsAt.getTime() - startsAt.getTime()) / (1000 * 60 * 60 * 24)
      )
    );
  }
  if (weeklyRate != null && days >= 7) {
    const weeks = Math.floor(days / 7);
    const remainingDays = days % 7;
    return weeks * weeklyRate + remainingDays * dailyRate;
  }
  return days * dailyRate;
}
