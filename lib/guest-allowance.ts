export type GuestAllowanceValidation =
  | { valid: true; value: number | null }
  | { valid: false; error: string };

/** Validate the organizer-entered party size. Null means no allowance set. */
export function validateGuestAllowance(value: unknown): GuestAllowanceValidation {
  if (value === null || value === undefined) return { valid: true, value: null };

  if (typeof value !== "number" || !Number.isInteger(value) || value < 1 || value > 20) {
    return { valid: false, error: "Guest allowance must be a whole number from 1 to 20, or null." };
  }

  return { valid: true, value };
}

/** Prefix spreadsheet formula starters so exported text is treated as data. */
export function escapeSpreadsheetFormulaCell(value: unknown): string {
  const text = value == null ? "" : String(value);
  return /^[=+\-@]/.test(text) ? `'${text}` : text;
}
