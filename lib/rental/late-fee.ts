/**
 * Pure late-fee calculation (mirrors migration 233 calculate_rental_late_fee).
 * Exercised by tests; DB function is authoritative for writes.
 */
export function calculateLateFee(opts: {
  scheduledEnd: string | Date;
  actualReturn: string | Date;
  graceMinutes?: number | null;
  feePerDay?: number | null;
}): { overdueMinutes: number; overdueDays: number; feeAmount: number } {
  const grace = Math.max(0, Number(opts.graceMinutes ?? 60));
  const rate = Math.max(0, Number(opts.feePerDay ?? 0));
  const end = opts.scheduledEnd instanceof Date ? opts.scheduledEnd : new Date(opts.scheduledEnd);
  const actual = opts.actualReturn instanceof Date ? opts.actualReturn : new Date(opts.actualReturn);
  if (Number.isNaN(end.getTime()) || Number.isNaN(actual.getTime())) {
    return { overdueMinutes: 0, overdueDays: 0, feeAmount: 0 };
  }
  const threshold = end.getTime() + grace * 60_000;
  if (actual.getTime() <= threshold) return { overdueMinutes: 0, overdueDays: 0, feeAmount: 0 };
  const overdueMinutes = Math.max(0, Math.floor((actual.getTime() - end.getTime()) / 60_000) - grace);
  const overdueDays = Math.max(1, Math.ceil(overdueMinutes / 1440));
  const feeAmount = Math.round(overdueDays * rate * 100) / 100;
  return { overdueMinutes, overdueDays, feeAmount };
}
