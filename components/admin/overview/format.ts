/** Browser-safe formatters shared by the admin overview chart and server UI. */

export function formatMoney(value: number, currency = "USD"): string {
  try {
    return new Intl.NumberFormat("en-US", {
      style: "currency",
      currency,
      maximumFractionDigits: value !== 0 && Math.abs(value) < 100 ? 2 : 0,
    }).format(value);
  } catch {
    return `$${Number(value || 0).toLocaleString("en-US", { maximumFractionDigits: 0 })}`;
  }
}
