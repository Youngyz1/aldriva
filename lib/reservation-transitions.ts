/**
 * Allowed reservation status transitions.
 * Lives in a plain (non-"use server") module so it can be imported by
 * client components, server actions, and tests without violating the
 * Next.js rule that "use server" files may only export async functions
 * and types.
 */

export type ReservationStatus =
  | "pending"
  | "confirmed"
  | "declined"
  | "seated"
  | "completed"
  | "no_show"
  | "cancelled";

export const RESERVATION_TRANSITION_GRAPH: Record<
  ReservationStatus,
  ReservationStatus[]
> = {
  pending: ["confirmed", "declined", "cancelled"],
  confirmed: ["seated", "no_show", "cancelled", "completed"],
  /** seated → confirmed: undo accidental seating (capacity safe, both statuses count) */
  seated: ["completed", "confirmed", "no_show", "cancelled"],
  declined: [],
  completed: [],
  no_show: [],
  cancelled: [],
};
