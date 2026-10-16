/** Browser-safe formatters shared by the admin overview chart and server UI. */
import { formatMoney as formatSharedMoney } from "@/lib/money";

export function formatMoney(value: number, currency = "USD"): string {
  return formatSharedMoney(value, currency);
}
