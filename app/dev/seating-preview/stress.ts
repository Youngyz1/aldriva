import type { SeatGeometry } from "@/lib/seating";

// Dev-only stress generator for the seating preview (P2.1). Pure, in-memory;
// nothing is written to disk and it is never imported outside app/dev.
export const STRESS_MAX = 5000;
const PER_ROW = 50;
const PITCH = 34;
const BOX = 26;

export function clampStressCount(raw: string | null): number | null {
  if (raw == null || raw === "") return null;
  const n = parseInt(raw, 10);
  if (!Number.isFinite(n) || n <= 0) return null;
  return Math.min(n, STRESS_MAX);
}

const ROW_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function rowLabel(i: number): string {
  return i < ROW_LETTERS.length ? ROW_LETTERS[i] : String(i + 1);
}

// Deterministic grid mirroring the real generator geometry (26-box, 34
// pitch, origin 80/150) so frame-cost readings transfer to real plans.
export function generateStressSeats(count: number): SeatGeometry[] {
  const seats: SeatGeometry[] = [];
  for (let i = 0; i < count; i++) {
    const row = Math.floor(i / PER_ROW);
    const col = i % PER_ROW;
    seats.push({
      id: `stress-${row}-${col}`,
      event_id: "stress",
      layout_id: "stress",
      section: "Stress",
      row_label: rowLabel(row),
      seat_number: col + 1,
      table_number: null,
      table_name: null,
      table_capacity: null,
      is_vip: false,
      is_accessible: false,
      status: "available",
      reserved_until: null,
      price_override: null,
      ticket_id: null,
      ticket_type_id: null,
      assigned_invitation_id: null,
      x: 80 + col * PITCH,
      y: 150 + row * (BOX + 12),
      width: BOX,
      height: BOX,
      rotation: 0,
      object_type: "seat",
      effective_price: 10,
    });
  }
  return seats;
}
