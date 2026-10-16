export type StoreProductStockState = "in_stock" | "low_stock" | "sold_out";

export function getStoreProductStockState(
  status: string,
  stockQuantity: number | null
): StoreProductStockState {
  if (status === "out_of_stock" || (stockQuantity !== null && stockQuantity <= 0)) {
    return "sold_out";
  }
  if (stockQuantity !== null && stockQuantity <= 5) return "low_stock";
  return "in_stock";
}

export function canBuyStoreProduct(input: {
  onlinePayment: boolean;
  status: string;
  stockQuantity: number | null;
  siteCurrency: string;
  stripePriceId?: string | null;
  price?: { amount: number; currency: string } | null;
}): boolean {
  if (!input.onlinePayment || input.status !== "active" || !input.stripePriceId || !input.price) return false;
  if (getStoreProductStockState(input.status, input.stockQuantity) === "sold_out") return false;
  const siteCurrency = input.siteCurrency.trim().toUpperCase();
  return /^[A-Z]{3}$/.test(siteCurrency) && input.price.currency.trim().toUpperCase() === siteCurrency;
}
