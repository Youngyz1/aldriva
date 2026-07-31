/**
 * Barrel export for the shared payments component library.
 * Import from "@/components/payments" in any checkout flow.
 */

export { default as StripeProvider } from "./StripeProvider";
export { default as PaymentForm } from "./PaymentForm";
export { default as OrderSummary, formatMoney } from "./OrderSummary";
export { default as CheckoutShell } from "./CheckoutShell";
